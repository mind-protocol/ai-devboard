#!/usr/bin/env node
// Swarm Driver — the autonomous tick loop
// Pops pending tasks, dispatches to best-fit citizen, executes, loops.
// This is the heartbeat that makes citizens work without human prompting.
//
// Usage: node swarm.js [--dry-run] [--interval 30]

import { createClient } from 'redis'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'

const GRAPH = 'org_ai_dev_dashboard'
const DRY_RUN = process.argv.includes('--dry-run')
const INTERVAL = parseInt(process.argv[process.argv.indexOf('--interval') + 1]) || 30 // seconds
const MAX_CONCURRENT = 3 // max citizens working at once

const CITIZEN_DIRS = [
  '/home/mind-protocol/mind-mcp/citizens',
  '/home/mind-protocol/ai_devboard/mind-repo/citizens',
  '/home/mind-protocol/cities-of-light/citizens',
]

const active = new Map() // handle → { task, child, startedAt }

function findCitizenDir(handle) {
  for (const base of CITIZEN_DIRS) {
    const dir = resolve(base, handle)
    if (existsSync(dir)) return dir
  }
  return null
}

function esc(s) {
  return (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
}

async function tick(redis) {
  const now = Math.floor(Date.now() / 1000)
  const ts = new Date().toISOString().slice(11, 19)

  // Skip if too many active
  if (active.size >= MAX_CONCURRENT) {
    console.log(`[${ts}] ${active.size}/${MAX_CONCURRENT} busy — waiting`)
    return
  }

  // Get pending tasks sorted by energy (highest priority first)
  let tasks = []
  try {
    const res = await redis.sendCommand(['GRAPH.QUERY', GRAPH,
      `MATCH (t:Moment)-[r:link]->(org:Actor {id: 'org:ai_dev_dashboard'})
       WHERE t.type = 'task_run' AND t.status = 'pending'
       RETURN t.id, t.name, t.energy, t.severity, t.issue_type
       ORDER BY t.energy DESC LIMIT 10`])
    tasks = (res?.[1] || []).map(r => ({
      id: r[0], name: r[1], energy: parseFloat(r[2]) || 0,
      severity: r[3], issueType: r[4],
    }))
  } catch (e) {
    console.log(`[${ts}] Query failed: ${e.message?.slice(0, 60)}`)
    return
  }

  if (tasks.length === 0) {
    console.log(`[${ts}] No pending tasks`)
    return
  }

  // Get available citizens (not currently active)
  let citizens = []
  try {
    const res = await redis.sendCommand(['GRAPH.QUERY', GRAPH,
      `MATCH (a:Actor) WHERE a.subtype = 'citizen' RETURN a.id, a.name, a.role`])
    citizens = (res?.[1] || []).map(r => ({
      id: r[0], handle: r[0]?.replace('citizen:', ''),
      name: r[1], role: r[2],
    })).filter(c => !active.has(c.handle))
  } catch (_) { return }

  if (citizens.length === 0) {
    console.log(`[${ts}] No available citizens`)
    return
  }

  // Match task to citizen by role heuristic
  const task = tasks[0]
  let citizen = citizens[0] // default: first available

  // Simple role matching
  const roleMap = {
    'skeleton_stub': ['code_monkey', 'arsenal_backend_architect_2', 'debug42'],
    'implement_function': ['code_monkey', 'arsenal_backend_architect_2', 'arsenal_frontend_craftsman_6'],
    'draft_doc': ['archivist', 'arsenal_infrastructure_specialist_11'],
    'incomplete_chain': ['archivist', 'arsenal_infrastructure_specialist_11'],
    'doc_sync': ['archivist', 'nervo'],
    'missing_impl': ['code_monkey', 'arsenal_backend_architect_2'],
    'undocumented_code': ['archivist', 'nervo'],
    'verify_missing_callee': ['debug42', 'arsenal_security_guardian_19'],
    'build_error': ['debug42', 'arsenal_backend_architect_2'],
    'test_failure': ['debug42', 'code_monkey'],
    'uncalled_route': ['arsenal_integration_engineer_15', 'arsenal_frontend_craftsman_6'],
    'self_initiated': ['nervo', 'debug42'],
  }

  const preferred = roleMap[task.issueType] || []
  for (const handle of preferred) {
    const match = citizens.find(c => c.handle === handle)
    if (match) { citizen = match; break }
  }

  const citizenDir = findCitizenDir(citizen.handle)
  if (!citizenDir) {
    console.log(`[${ts}] No folder for @${citizen.handle} — skip`)
    return
  }

  console.log(`[${ts}] @${citizen.handle} ← [${task.severity}] ${task.name?.slice(0, 60)}`)

  if (DRY_RUN) return

  // Claim task
  try {
    await redis.sendCommand(['GRAPH.QUERY', GRAPH,
      `MATCH (t:Moment {id: '${esc(task.id)}'}) SET t.status = 'running', t.updated_at_s = ${now}`])
    await redis.sendCommand(['GRAPH.QUERY', GRAPH,
      `MATCH (t:Moment {id: '${esc(task.id)}'}), (a:Actor {id: '${citizen.id}'})
       MERGE (t)-[r:link]->(a) SET r.r_type = 'claimed_by', r.trust = 0.8, r.weight = 0.7`])
  } catch (_) {}

  // Build prompt
  const prompt = `You have a task assigned to you:\n\n"${task.name}"\n\nSeverity: ${task.severity}\nType: ${task.issueType}\n\nDo the work. Be concrete. If it's code, write code. If it's docs, write docs. If you can't do it, explain why and what you need.`

  // Dispatch
  const child = spawn('sh', ['-c',
    `echo '${prompt.replace(/'/g, "'\\''")}' | claude --print --continue --dangerously-skip-permissions`
  ], { cwd: citizenDir, stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 })

  let stdout = ''
  child.stdout.on('data', d => { stdout += d.toString() })

  active.set(citizen.handle, { task, child, startedAt: now })

  child.on('close', async (code) => {
    active.delete(citizen.handle)
    const response = stdout.trim()
    const duration = Math.floor(Date.now() / 1000) - now
    const dts = new Date().toISOString().slice(11, 19)

    if (response) {
      console.log(`[${dts}] @${citizen.handle} done (${duration}s): ${response.slice(0, 100)}`)

      // Store response as Moment
      try {
        const respId = `moment:swarm:${citizen.handle}_${now}`
        await redis.sendCommand(['GRAPH.QUERY', GRAPH,
          `MERGE (m:Moment {id: '${esc(respId)}'}) SET m.name = '${esc(response.slice(0, 120))}', m.type = 'work_result', m.subtype = 'interaction', m.content = '${esc(response.slice(0, 2000))}', m.energy = 0.5, m.weight = 0.6, m.origin_citizen = '${citizen.handle}', m.created_at_s = ${now + duration}`])
        await redis.sendCommand(['GRAPH.QUERY', GRAPH,
          `MATCH (m:Moment {id: '${esc(respId)}'}), (a:Actor {id: '${citizen.id}'}) MERGE (a)-[r:link]->(m) SET r.r_type = 'CREATED', r.trust = 0.9, r.weight = 0.8`])
      } catch (_) {}

      // Mark task done
      try {
        await redis.sendCommand(['GRAPH.QUERY', GRAPH,
          `MATCH (t:Moment {id: '${esc(task.id)}'}) SET t.status = 'done', t.energy = 0, t.completed_at_s = ${now + duration}`])
      } catch (_) {}
    } else {
      console.log(`[${dts}] @${citizen.handle} failed (${duration}s, exit ${code})`)
      // Return task to pending with energy boost
      try {
        await redis.sendCommand(['GRAPH.QUERY', GRAPH,
          `MATCH (t:Moment {id: '${esc(task.id)}'}) SET t.status = 'pending', t.energy = t.energy + 0.3`])
      } catch (_) {}
    }
  })
}

async function main() {
  const redis = createClient({ url: `redis://${process.env.FALKORDB_HOST || 'localhost'}:${process.env.FALKORDB_PORT || 6379}` })
  await redis.connect()

  console.log(`Swarm Driver started — interval ${INTERVAL}s, max ${MAX_CONCURRENT} concurrent`)
  console.log(`Graph: ${GRAPH}, dry-run: ${DRY_RUN}`)
  console.log('')

  // Initial tick
  await tick(redis)

  // Loop
  setInterval(() => tick(redis), INTERVAL * 1000)

  process.on('SIGINT', async () => {
    console.log('\nShutting down swarm...')
    for (const [handle, { child }] of active) {
      child.kill()
      console.log(`  Killed @${handle}`)
    }
    await redis.quit()
    process.exit(0)
  })
}

main().catch(e => { console.error(e); process.exit(1) })
