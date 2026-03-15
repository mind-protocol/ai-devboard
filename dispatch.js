#!/usr/bin/env node
// Citizen dispatch — polls for new moments targeting citizens, invokes them via claude --print
//
// Usage:
//   node dispatch.js                          # poll mode — watches for new moments
//   node dispatch.js @debug42 "Your message"  # direct send — creates moment + invokes
//
// How it works:
//   1. Creates a Moment in FalkorDB linked to sender (you) and target citizen
//   2. Finds the citizen's folder (mind-repo/citizens/{handle}/)
//   3. Runs: cd {folder} && echo "{context}" | claude --print
//   4. Stores the response as a new Moment linked back

import { createClient } from 'redis'
import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'

const GRAPH = 'org_ai_dev_dashboard'
const CITIZEN_DIRS = [
  '/home/mind-protocol/ai_devboard/mind-repo/citizens',
  '/home/mind-protocol/mind-mcp/citizens',
  '/home/mind-protocol/cities-of-light/citizens',
]
const SENDER = process.env.MIND_HANDLE || 'nervo'

function findCitizenDir(handle) {
  for (const base of CITIZEN_DIRS) {
    const dir = resolve(base, handle)
    if (existsSync(dir)) return dir
  }
  return null
}

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
}

function slugify(s) {
  return s.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase()
}

async function sendMessage(redis, target, message) {
  const handle = target.replace(/^@/, '')
  const now = Math.floor(Date.now() / 1000)
  const brain = `brain_${handle}`
  const momentId = `moment:msg:${SENDER}_to_${handle}_${now}`

  // 1. Inject stimulus into citizen's L1 brain (not just L2)
  try {
    await redis.sendCommand(['GRAPH.QUERY', brain,
      `MERGE (m:Moment {id: '${esc(momentId)}'}) SET m.name = '${esc('Message from @' + SENDER)}', m.type = 'stimulus', m.subtype = 'interaction', m.content = '${esc(message)}', m.synthesis = '${esc(message.slice(0, 200))}', m.energy = 0.8, m.weight = 0.7, m.stability = 0.5, m.origin_citizen = '${SENDER}', m.created_at_s = ${now}, m.updated_at_s = ${now}`
    ])
    console.log(`Stimulus injected into ${brain}`)
  } catch (e) {
    console.log(`Brain ${brain} not found — creating stimulus in L2 only`)
  }

  // 2. Also create in L2 shared graph (provenance)
  await redis.sendCommand(['GRAPH.QUERY', GRAPH,
    `MERGE (m:Moment {id: '${esc(momentId)}'}) SET m.name = '${esc(message.slice(0, 120))}', m.type = 'message', m.subtype = 'dialogue', m.content = '${esc(message)}', m.energy = 0.7, m.weight = 0.6, m.stability = 0.5, m.origin_citizen = '${SENDER}', m.target_citizen = '${handle}', m.status = 'pending', m.created_at_s = ${now}, m.updated_at_s = ${now}`
  ])
  await redis.sendCommand(['GRAPH.QUERY', GRAPH,
    `MATCH (m:Moment {id: '${esc(momentId)}'}), (a:Actor {id: 'citizen:${SENDER}'}) MERGE (a)-[r:link]->(m) SET r.r_type = 'CREATED', r.trust = 0.9, r.weight = 0.8`
  ])
  await redis.sendCommand(['GRAPH.QUERY', GRAPH,
    `MATCH (m:Moment {id: '${esc(momentId)}'}), (a:Actor {id: 'citizen:${handle}'}) MERGE (m)-[r:link]->(a) SET r.r_type = 'TARGETS', r.trust = 0.8, r.weight = 0.7, r.energy = 0.7`
  ])

  // 3. Assemble WM context from brain
  let wmContext = ''
  try {
    // Get high-energy nodes from brain
    const wmNodes = await redis.sendCommand(['GRAPH.QUERY', brain,
      `MATCH (n) WHERE n.energy > 0.1 RETURN n.name, n.synthesis, n.subtype, n.energy ORDER BY n.energy DESC LIMIT 10`
    ])
    const wmLines = (wmNodes?.[1] || []).map(row =>
      `[${row[2] || 'node'}] ${row[0]}: ${(row[1] || '').slice(0, 100)} (energy=${row[3]})`
    )
    if (wmLines.length > 0) {
      wmContext = `\n\nYour current mental state (active nodes in your brain):\n${wmLines.join('\n')}`
    }
  } catch (_) {}

  // 4. Get citizen's recent moments for context
  let recentContext = ''
  try {
    const recent = await redis.sendCommand(['GRAPH.QUERY', brain,
      `MATCH (n:Moment) WHERE n.created_at_s > ${now - 3600} RETURN n.content, n.origin_citizen ORDER BY n.created_at_s DESC LIMIT 5`
    ])
    const recentLines = (recent?.[1] || []).filter(r => r[0]).map(r =>
      `[@${r[1] || '?'}] ${r[0].slice(0, 150)}`
    )
    if (recentLines.length > 0) {
      recentContext = `\n\nRecent conversation:\n${recentLines.reverse().join('\n')}`
    }
  } catch (_) {}

  console.log(`${SENDER} → @${handle}: ${message.slice(0, 80)}`)

  // 5. Find citizen dir and invoke
  const citizenDir = findCitizenDir(handle)
  if (!citizenDir) {
    console.log(`No citizen folder found for @${handle}`)
    return null
  }

  console.log(`Invoking @${handle}...`)

  try {
    const prompt = `You received a message from @${SENDER}:\n\n"${message}"${wmContext}${recentContext}\n\nRespond as yourself (@${handle}). Be direct, use your personality and expertise.`

    const { spawn } = await import('child_process')

    // Spawn async — return immediately with "heard you"
    const child = spawn('sh', ['-c',
      `echo '${prompt.replace(/'/g, "'\\''")}' | claude --print --continue --dangerously-skip-permissions`
    ], {
      cwd: citizenDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 600000,
    })

    let stdout = ''
    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { /* ignore stderr */ })

    child.on('close', async (code) => {
      const response = stdout.trim()
      if (!response) {
        console.log(`  @${handle} — no response (exit ${code})`)
        return
      }

      console.log(`\n@${handle} responds:\n${response}\n`)

      // Store response in brain (stimulus back)
      try {
        const respId = `moment:msg:${handle}_to_${SENDER}_${now}`
        await redis.sendCommand(['GRAPH.QUERY', brain,
          `MERGE (m:Moment {id: '${esc(respId)}'}) SET m.name = '${esc('My response to @' + SENDER)}', m.type = 'output', m.subtype = 'interaction', m.content = '${esc(response.slice(0, 2000))}', m.energy = 0.5, m.weight = 0.6, m.origin_citizen = '${handle}', m.created_at_s = ${now + 1}`
        ])
      } catch (_) {}

      // Store response in L2
      try {
        const respId = `moment:msg:${handle}_to_${SENDER}_${now}`
        await redis.sendCommand(['GRAPH.QUERY', GRAPH,
          `MERGE (m:Moment {id: '${esc(respId)}'}) SET m.name = '${esc(response.slice(0, 120))}', m.type = 'message', m.subtype = 'dialogue', m.content = '${esc(response.slice(0, 2000))}', m.energy = 0.6, m.weight = 0.6, m.origin_citizen = '${handle}', m.target_citizen = '${SENDER}', m.status = 'delivered', m.created_at_s = ${now + 1}`
        ])
        await redis.sendCommand(['GRAPH.QUERY', GRAPH,
          `MATCH (m:Moment {id: '${esc(respId)}'}), (a:Actor {id: 'citizen:${handle}'}) MERGE (a)-[r:link]->(m) SET r.r_type = 'CREATED', r.trust = 0.9, r.weight = 0.8`
        ])
        await redis.sendCommand(['GRAPH.QUERY', GRAPH,
          `MATCH (m:Moment {id: '${esc(momentId)}'}) SET m.status = 'delivered'`
        ])
      } catch (_) {}
    })

    // Return immediately — citizen is thinking in background
    return `@${handle} vous a entendu — réponse en cours...`

  } catch (e) {
    console.log(`Invoke failed: ${e.message?.slice(0, 100)}`)
    return null
  }
}

// Poll mode: watch for pending moments targeting citizens
async function pollMode(redis) {
  console.log('Dispatch polling mode — watching for pending messages...\n')

  while (true) {
    try {
      const pending = await redis.sendCommand(['GRAPH.QUERY', GRAPH,
        `MATCH (m:Moment)-[r:link]->(a:Actor) WHERE m.type = 'message' AND m.status = 'pending' AND r.r_type = 'TARGETS' RETURN m.id, m.content, m.origin_citizen, a.id ORDER BY m.created_at_s LIMIT 5`
      ])

      for (const row of (pending?.[1] || [])) {
        const [momentId, content, from, targetActorId] = row
        const handle = targetActorId?.replace('citizen:', '')
        if (!handle || !content) continue

        console.log(`\nPending message: ${from} → @${handle}`)
        const citizenDir = findCitizenDir(handle)
        if (!citizenDir) {
          console.log(`  Skip: no folder for @${handle}`)
          await redis.sendCommand(['GRAPH.QUERY', GRAPH,
            `MATCH (m:Moment {id: '${esc(momentId)}'}) SET m.status = 'no_folder'`
          ])
          continue
        }

        console.log(`  Invoking @${handle}...`)
        const now = Math.floor(Date.now() / 1000)

        try {
          const prompt = `You received a message from @${from}:\n\n"${content}"\n\nRespond as yourself (@${handle}). Be direct.`
          const response = execSync(
            `echo '${prompt.replace(/'/g, "'\\''")}' | claude --print --continue --dangerously-skip-permissions`,
            { cwd: citizenDir, encoding: 'utf-8', timeout: 600000, maxBuffer: 5 * 1024 * 1024 }
          ).trim()

          console.log(`  @${handle}: ${response.slice(0, 200)}`)

          // Store response
          const respId = `moment:msg:${handle}_resp_${now}`
          await redis.sendCommand(['GRAPH.QUERY', GRAPH,
            `MERGE (m:Moment {id: '${esc(respId)}'}) SET m.name = '${esc(response.slice(0, 120))}', m.type = 'message', m.subtype = 'dialogue', m.content = '${esc(response.slice(0, 2000))}', m.energy = 0.6, m.weight = 0.6, m.origin_citizen = '${handle}', m.target_citizen = '${from}', m.status = 'delivered', m.created_at_s = ${now}, m.updated_at_s = ${now}`
          ])

          // Mark original delivered
          await redis.sendCommand(['GRAPH.QUERY', GRAPH,
            `MATCH (m:Moment {id: '${esc(momentId)}'}) SET m.status = 'delivered'`
          ])
        } catch (e) {
          console.log(`  Failed: ${e.message?.slice(0, 80)}`)
          await redis.sendCommand(['GRAPH.QUERY', GRAPH,
            `MATCH (m:Moment {id: '${esc(momentId)}'}) SET m.status = 'failed'`
          ])
        }
      }
    } catch (_) {}

    await new Promise(r => setTimeout(r, 5000)) // poll every 5s
  }
}

// Main
async function main() {
  const redis = createClient({ url: `redis://${process.env.FALKORDB_HOST || 'localhost'}:${process.env.FALKORDB_PORT || 6379}` })
  await redis.connect()

  const args = process.argv.slice(2)

  if (args.length >= 2 && args[0].startsWith('@')) {
    // Direct send mode: node dispatch.js @handle "message"
    const target = args[0]
    const message = args.slice(1).join(' ')
    await sendMessage(redis, target, message)
    await redis.quit()
  } else if (args[0] === '--poll') {
    // Poll mode
    await pollMode(redis)
  } else {
    console.log('Usage:')
    console.log('  node dispatch.js @handle "Your message"   — send + invoke')
    console.log('  node dispatch.js --poll                    — watch for pending messages')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
