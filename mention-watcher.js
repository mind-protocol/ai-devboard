#!/usr/bin/env node
// Mention Watcher — watches all repos for @handle mentions in file changes
// When someone writes @debug42 in a file, finds debug42's folder and wakes them up.
//
// Usage: node mention-watcher.js

import { watch } from 'fs'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { spawn } from 'child_process'
import { resolve, relative, extname } from 'path'
import { createClient } from 'redis'

const GRAPH = 'org_ai_dev_dashboard'
const SELF = process.env.MIND_HANDLE || 'nervo'

// Repos to watch
const REPOS = [
  '/home/mind-protocol/ai_devboard',
  '/home/mind-protocol/mind-mcp',
  '/home/mind-protocol/cities-of-light',
  '/home/mind-protocol/lumina-prime',
  '/home/mind-protocol/contre-terre',
]

// Where citizen folders live
const CITIZEN_DIRS = [
  '/home/mind-protocol/mind-mcp/citizens',
  '/home/mind-protocol/ai_devboard/mind-repo/citizens',
  '/home/mind-protocol/cities-of-light/citizens',
  '/home/mind-protocol/lumina-prime/citizens',
]

// Skip noise
const SKIP = new Set(['node_modules', '.git', 'dist', '__pycache__', '.claude'])
const CODE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.py', '.md', '.yaml', '.yml'])

// Track what we already processed (debounce + dedup)
const processed = new Map() // `${file}:${handle}` → timestamp
const DEDUP_WINDOW = 60_000 // 1 min — don't re-trigger same mention

// Active invocations
const activeInvocations = new Set()

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

// Extract @mentions from file content
// If content changed: re-wake ALL mentioned citizens (not just new ones)
// If only new mentions added: wake only the new ones
async function extractMentionsToWake(filePath, prevContent) {
  try {
    const content = await readFile(filePath, 'utf-8')
    if (content === prevContent) return { content, mentions: [] } // no change

    // All @handles in current content
    const allMentions = [...new Set([...content.matchAll(/@(\w{2,30})/g)].map(m => m[1]))]
      .filter(h => h !== SELF)
      .slice(0, 20) // cap at 20

    if (!prevContent) {
      // First time seeing this file — wake all mentioned
      return { content, mentions: allMentions }
    }

    // Content changed — check if it's a meaningful change (not just whitespace)
    const prevTrimmed = prevContent.replace(/\s+/g, ' ').trim()
    const currTrimmed = content.replace(/\s+/g, ' ').trim()
    if (prevTrimmed === currTrimmed) return { content, mentions: [] }

    // Content meaningfully changed — re-wake ALL mentioned citizens
    // They each get the updated context around their mention
    return { content, mentions: allMentions }
  } catch (_) {
    return { content: null, mentions: [] }
  }
}

// Get context around the mention
function getMentionContext(content, handle) {
  const idx = content.indexOf(`@${handle}`)
  if (idx === -1) return ''
  const start = Math.max(0, idx - 300)
  const end = Math.min(content.length, idx + 300)
  return content.slice(start, end).trim()
}

// Wake up a citizen
async function wakeCitizen(redis, handle, context, sourceFile, mentionedBy) {
  const key = `${sourceFile}:${handle}`
  const now = Date.now()

  // Dedup
  if (processed.has(key) && now - processed.get(key) < DEDUP_WINDOW) return
  processed.set(key, now)

  // Don't double-invoke
  if (activeInvocations.has(handle)) {
    console.log(`  [skip] @${handle} already being invoked`)
    return
  }

  const citizenDir = findCitizenDir(handle)
  if (!citizenDir) {
    console.log(`  [skip] @${handle} — no citizen folder found`)
    return
  }

  const ts = new Date().toISOString().slice(11, 19)
  console.log(`[${ts}] @${handle} mentioned in ${sourceFile} by @${mentionedBy}`)

  // Create L2 moment
  const nowS = Math.floor(now / 1000)
  const momentId = `moment:mention:${handle}_${nowS}`
  try {
    await redis.sendCommand(['GRAPH.QUERY', GRAPH,
      `MERGE (m:Moment {id: '${esc(momentId)}'}) SET m.name = '${esc('@' + handle + ' mentioned in ' + sourceFile)}', m.type = 'mention', m.subtype = 'interaction', m.content = '${esc(context.slice(0, 500))}', m.energy = 0.7, m.weight = 0.6, m.origin_citizen = '${mentionedBy}', m.target_citizen = '${handle}', m.source_file = '${esc(sourceFile)}', m.created_at_s = ${nowS}`
    ])
  } catch (_) {}

  // Invoke
  activeInvocations.add(handle)
  const prompt = `You were mentioned by @${mentionedBy} in ${sourceFile}. Here's the context:\n\n${context}\n\nRespond to this mention. Be yourself.`

  const child = spawn('sh', ['-c',
    `echo '${prompt.replace(/'/g, "'\\''")}' | claude --print --continue --dangerously-skip-permissions`
  ], {
    cwd: citizenDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 600000,
  })

  let stdout = ''
  child.stdout.on('data', d => { stdout += d.toString() })

  child.on('close', async (code) => {
    activeInvocations.delete(handle)
    const response = stdout.trim()
    if (response) {
      console.log(`\n  @${handle} responds:\n  ${response.slice(0, 200)}${response.length > 200 ? '...' : ''}\n`)

      // Store response in L2
      try {
        const respId = `moment:mention_resp:${handle}_${nowS}`
        await redis.sendCommand(['GRAPH.QUERY', GRAPH,
          `MERGE (m:Moment {id: '${esc(respId)}'}) SET m.name = '${esc(response.slice(0, 120))}', m.type = 'message', m.subtype = 'dialogue', m.content = '${esc(response.slice(0, 2000))}', m.energy = 0.6, m.weight = 0.6, m.origin_citizen = '${handle}', m.target_citizen = '${mentionedBy}', m.status = 'delivered', m.created_at_s = ${nowS + 1}`
        ])
      } catch (_) {}
    } else {
      console.log(`  @${handle} — no response (exit ${code})`)
    }
  })
}

// Watch a single repo
function watchRepo(redis, repoPath, fileCache) {
  if (!existsSync(repoPath)) return

  const repoName = repoPath.split('/').pop()

  try {
    watch(repoPath, { recursive: true }, async (eventType, filename) => {
      if (!filename) return
      const parts = filename.split('/')
      if (parts.some(p => SKIP.has(p))) return
      if (!CODE_EXTS.has(extname(filename))) return

      const fullPath = resolve(repoPath, filename)
      const relPath = `${repoName}/${filename}`

      // Only on change (not rename — we want content diffs)
      if (eventType !== 'change') return

      // Debounce per file
      const prev = fileCache.get(fullPath)
      const { content, mentions } = await extractMentionsToWake(fullPath, prev)
      if (!content) return
      fileCache.set(fullPath, content)

      if (mentions.length === 0) return

      // Find who wrote the file (heuristic: git blame last line changed, or SELF)
      const mentionedBy = SELF

      for (const handle of mentions) {
        const context = getMentionContext(content, handle)
        await wakeCitizen(redis, handle, context, relPath, mentionedBy)
      }
    })
    console.log(`  Watching: ${repoPath}`)
  } catch (e) {
    console.log(`  Skip: ${repoPath} — ${e.message?.slice(0, 40)}`)
  }
}

// Main
async function main() {
  const redis = createClient({ url: `redis://${process.env.FALKORDB_HOST || 'localhost'}:${process.env.FALKORDB_PORT || 6379}` })
  await redis.connect()

  console.log(`Mention Watcher — listening for @handles across ${REPOS.length} repos`)
  console.log(`Self: @${SELF} (won't trigger on self-mentions)\n`)

  const fileCache = new Map()

  for (const repo of REPOS) {
    watchRepo(redis, repo, fileCache)
  }

  // Keep alive
  process.on('SIGINT', async () => {
    console.log('\nShutting down mention watcher...')
    await redis.quit()
    process.exit(0)
  })
}

main().catch(e => { console.error(e); process.exit(1) })
