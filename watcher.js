#!/usr/bin/env node
// File watcher daemon — detects changes and incrementally updates the graph
// This is the nervous system: always on, always sensing.
// The SubEntity explores; the watcher reacts.
//
// Usage: node watcher.js [--graph org_ai_dev_dashboard]

import { watch } from 'fs'
import { readFile, stat } from 'fs/promises'
import { createClient } from 'redis'
import { relative, extname, dirname, basename, join } from 'path'

const GRAPH = process.argv.includes('--graph')
  ? process.argv[process.argv.indexOf('--graph') + 1]
  : 'org_ai_dev_dashboard'
const ROOT = '.'

const SKIP = new Set([
  'node_modules', '.git', 'dist', '.claude', '__pycache__',
  'puppeteer_dev_chrome_profile-b9HpXs', 'v8-compile-cache-1000',
  'node-compile-cache', 'snap-private-tmp',
])

const CODE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.py', '.yaml', '.yml', '.json', '.css', '.md'])

function slugify(s) {
  return s.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase()
}
function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
}

function shouldSkip(path) {
  const parts = path.split('/')
  return parts.some(p => SKIP.has(p) || p.startsWith('tmp') || p.startsWith('systemd-') || p.startsWith('.X11'))
}

// --- Deep parser (same as ingest.js, inlined for independence) ---
function parseCodeDeep(content, filePath) {
  const ext = extname(filePath)
  const elements = { functions: [], state: [], constants: [], routes: [], apiCalls: [] }
  if (!['.js', '.jsx', '.ts', '.tsx', '.py'].includes(ext)) return elements

  if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
    // Functions
    for (const re of [
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g,
      /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
    ]) {
      let m
      while ((m = re.exec(content)) !== null) {
        if (['require', 'import'].includes(m[1])) continue
        const line = content.slice(0, m.index).split('\n').length
        elements.functions.push({ name: m[1], line })
      }
    }
    // State
    let m
    const stateRe = /const\s+\[(\w+),\s*(\w+)\]\s*=\s*useState\(([^)]*)\)/g
    while ((m = stateRe.exec(content)) !== null) {
      elements.state.push({ getter: m[1], setter: m[2], initial: m[3] })
    }
    // Routes
    const routeRe = /app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g
    while ((m = routeRe.exec(content)) !== null) {
      elements.routes.push({ method: m[1].toUpperCase(), path: m[2] })
    }
    // API calls
    const fetchRe = /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g
    while ((m = fetchRe.exec(content)) !== null) {
      elements.apiCalls.push({ url: m[1], method: 'GET' })
    }
  }
  if (ext === '.py') {
    let m
    const pyFnRe = /^(?:async\s+)?def\s+(\w+)\s*\(/gm
    while ((m = pyFnRe.exec(content)) !== null) {
      elements.functions.push({ name: m[1], line: content.slice(0, m.index).split('\n').length })
    }
    const pyClassRe = /^class\s+(\w+)/gm
    while ((m = pyClassRe.exec(content)) !== null) {
      elements.functions.push({ name: m[1], line: content.slice(0, m.index).split('\n').length, type: 'class' })
    }
  }
  return elements
}

// --- Graph update for a single file ---
async function onFileChanged(redis, relPath, eventType) {
  const ext = extname(relPath)
  if (!CODE_EXTS.has(ext)) return
  if (shouldSkip(relPath)) return

  const now = Math.floor(Date.now() / 1000)
  const fileId = `thing:file:${slugify(relPath)}`
  const dirPath = dirname(relPath)
  const dirId = dirPath === '.' ? null : `space:dir:${slugify(dirPath)}`

  const queries = []

  // Create a Moment for significant file events
  const momentId = `moment:filechange:${slugify(relPath)}_${now}`
  queries.push(
    `MERGE (m:Moment {id: '${esc(momentId)}'}) SET m.name = '${esc(eventType + ': ' + relPath)}', m.type = 'file_event', m.subtype = '${eventType}', m.content = '${esc(relPath)}', m.energy = 0.3, m.weight = 0.4, m.stability = 0.3, m.created_at_s = ${now}`
  )
  // Link moment to the file
  queries.push(
    `MATCH (m:Moment {id: '${esc(momentId)}'}), (f:Thing {id: '${esc(fileId)}'}) MERGE (m)-[r:link]->(f) SET r.r_type = 'AFFECTS', r.hierarchy = -0.2, r.trust = 0.9, r.weight = 0.5`
  )

  if (eventType === 'rename') {
    // File created or deleted — check if it exists
    try {
      await stat(relPath)
      // File exists → create/update node
      const sub = ['.js', '.jsx', '.ts', '.tsx', '.py', '.css'].includes(ext) ? 'code_file'
        : ['.yaml', '.yml'].includes(ext) ? 'config'
        : ext === '.md' ? 'document' : 'code_file'

      queries.push(
        `MERGE (n:Thing {id: '${esc(fileId)}'}) SET n.name = '${esc(relPath)}', n.subtype = '${sub}', n.weight = 0.5, n.stability = 0.7, n.energy = 0.6, n.updated_at_s = ${now}`
      )
      if (dirId) {
        queries.push(
          `MERGE (d:Space {id: '${esc(dirId)}'}) SET d.name = '${esc(dirPath)}', d.subtype = 'module', d.weight = 0.7, d.stability = 0.8, d.energy = 0.3, d.space_hint = 'directory'`
        )
        queries.push(
          `MATCH (f:Thing {id: '${esc(fileId)}'}), (d:Space {id: '${esc(dirId)}'}) MERGE (f)-[r:link]->(d) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.5, r.permanence = 0.9, r.trust = 1.0, r.friction = 0.0, r.weight = 0.6`
        )
      }
    } catch (_) {
      // File deleted → mark energy 0, L7 will prune
      queries.push(
        `MATCH (n:Thing {id: '${esc(fileId)}'}) SET n.energy = 0, n.stability = 0, n.updated_at_s = ${now}`
      )
    }
  }

  if (eventType === 'change') {
    // File modified → re-parse, update granular nodes, bump energy
    queries.push(
      `MATCH (n:Thing {id: '${esc(fileId)}'}) SET n.energy = n.energy + 0.3, n.updated_at_s = ${now}`
    )

    // Deep parse for code files
    if (['.js', '.jsx', '.ts', '.tsx', '.py'].includes(ext)) {
      try {
        const content = await readFile(relPath, 'utf-8')
        const elements = parseCodeDeep(content, relPath)
        const fileSlug = slugify(relPath)

        for (const fn of elements.functions) {
          const fnId = `thing:fn:${fileSlug}:${slugify(fn.name)}`
          const fnType = fn.type === 'class' ? 'code_class' : 'code_function'
          queries.push(
            `MERGE (n:Thing {id: '${esc(fnId)}'}) SET n.name = '${esc(fn.name)}', n.subtype = '${fnType}', n.weight = 0.6, n.energy = 0.5, n.stability = 1.0, n.line = ${fn.line}, n.source_file = '${esc(relPath)}', n.updated_at_s = ${now}`
          )
          queries.push(
            `MATCH (fn:Thing {id: '${esc(fnId)}'}), (f:Thing {id: '${esc(fileId)}'}) MERGE (fn)-[r:link]->(f) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.5, r.permanence = 0.9, r.trust = 1.0, r.friction = 0.0, r.weight = 0.7`
          )
        }

        for (const s of elements.state) {
          const stateId = `thing:state:${fileSlug}:${slugify(s.getter)}`
          queries.push(
            `MERGE (n:Thing {id: '${esc(stateId)}'}) SET n.name = '${esc(s.getter)}', n.subtype = 'state_var', n.weight = 0.5, n.energy = 0.4, n.stability = 0.6, n.initial_value = '${esc(s.initial || '')}', n.source_file = '${esc(relPath)}'`
          )
          queries.push(
            `MATCH (sv:Thing {id: '${esc(stateId)}'}), (f:Thing {id: '${esc(fileId)}'}) MERGE (sv)-[r:link]->(f) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.5, r.permanence = 0.85, r.trust = 1.0, r.friction = 0.0, r.weight = 0.5`
          )
        }

        for (const rt of elements.routes) {
          const routeId = `thing:route:${slugify(rt.method + '_' + rt.path)}`
          queries.push(
            `MERGE (n:Thing {id: '${esc(routeId)}'}) SET n.name = '${esc(rt.method + ' ' + rt.path)}', n.subtype = 'api_endpoint', n.weight = 0.8, n.energy = 0.5, n.stability = 0.8, n.source_file = '${esc(relPath)}'`
          )
          queries.push(
            `MATCH (rt:Thing {id: '${esc(routeId)}'}), (f:Thing {id: '${esc(fileId)}'}) MERGE (rt)-[r:link]->(f) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.3, r.permanence = 0.9, r.trust = 1.0, r.friction = 0.0, r.weight = 0.8`
          )
        }

        // Check: TODO comments → task_run
        const todoRe = /(?:\/\/|#)\s*TODO:?\s*(.+)/g
        let todoMatch
        while ((todoMatch = todoRe.exec(content)) !== null) {
          const todoText = todoMatch[1].trim()
          const todoLine = content.slice(0, todoMatch.index).split('\n').length
          const taskId = `task:todo:${slugify(todoText.slice(0, 60) + '_' + relPath)}`
          queries.push(
            `MERGE (n:Moment {id: '${esc(taskId)}'}) SET n.name = '${esc(('TODO: ' + todoText).slice(0, 120))}', n.type = 'task_run', n.subtype = 'task_run', n.status = 'pending', n.synthesis = '${esc(todoText)}', n.severity = 'medium', n.issue_type = 'code_todo', n.weight = 0.5, n.energy = 0.5, n.friction = 0.3, n.stability = 0.4, n.created_at_s = ${now}, n.updated_at_s = ${now}, n.source_line = ${todoLine}`
          )
          queries.push(
            `MATCH (task:Moment {id: '${esc(taskId)}'}), (f:Thing {id: '${esc(fileId)}'}) MERGE (task)-[r:link]->(f) SET r.r_type = 'AFFECTS', r.hierarchy = -0.3, r.permanence = 0.4, r.trust = 0.8, r.friction = 0.3, r.weight = 0.5, r.condition = 'todo_removed', r.condition_target = '${esc(relPath + ':' + todoLine)}'`
          )
          queries.push(
            `MATCH (task:Moment {id: '${esc(taskId)}'}), (org:Actor {id: 'org:ai_dev_dashboard'}) MERGE (task)-[r:link]->(org) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.6, r.permanence = 0.4, r.trust = 0.8, r.weight = 0.4`
          )
        }

        // Check: empty functions → task_run
        for (const fn of elements.functions) {
          const fnStart = content.indexOf(`function ${fn.name}`) !== -1
            ? content.indexOf(`function ${fn.name}`)
            : content.indexOf(`${fn.name} =`)
          if (fnStart === -1) continue
          const braceStart = content.indexOf('{', fnStart)
          if (braceStart === -1) continue
          // Find matching close brace (simple: count depth)
          let depth = 1, pos = braceStart + 1
          while (depth > 0 && pos < content.length) {
            if (content[pos] === '{') depth++
            if (content[pos] === '}') depth--
            pos++
          }
          const body = content.slice(braceStart + 1, pos - 1).trim()
          const realLines = body.split('\n').filter(l => l.trim() && !l.trim().startsWith('//')).length
          if (realLines <= 1 && !body.includes('throw') && !body.includes('return')) {
            const taskId = `task:empty_fn:${slugify(fn.name + '_' + relPath)}`
            const desc = `Empty function: ${fn.name}() in ${relPath}:${fn.line}`
            queries.push(
              `MERGE (n:Moment {id: '${esc(taskId)}'}) SET n.name = '${esc(desc.slice(0, 120))}', n.type = 'task_run', n.subtype = 'task_run', n.status = 'pending', n.synthesis = '${esc(desc)}', n.severity = 'medium', n.issue_type = 'empty_function', n.weight = 0.6, n.energy = 0.5, n.friction = 0.4, n.stability = 0.3, n.created_at_s = ${now}, n.updated_at_s = ${now}`
            )
            queries.push(
              `MATCH (task:Moment {id: '${esc(taskId)}'}), (fn_node:Thing {id: '${esc(`thing:fn:${slugify(relPath)}:${slugify(fn.name)}`)}'}) MERGE (task)-[r:link]->(fn_node) SET r.r_type = 'AFFECTS', r.hierarchy = -0.3, r.permanence = 0.4, r.trust = 0.8, r.friction = 0.4, r.weight = 0.6, r.condition = 'function_has_body', r.condition_target = '${esc(fn.name + ':' + relPath)}'`
            )
            queries.push(
              `MATCH (task:Moment {id: '${esc(taskId)}'}), (org:Actor {id: 'org:ai_dev_dashboard'}) MERGE (task)-[r:link]->(org) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.6, r.permanence = 0.4, r.trust = 0.8, r.weight = 0.4`
            )
          }
        }

        // Check: did a skeleton stub get implemented?
        const hadStubs = content.includes("throw new Error('Not implemented") || content.includes('raise NotImplementedError')
        if (!hadStubs) {
          // Auto-resolve any skeleton_stub tasks for this file
          queries.push(
            `MATCH (task:Moment)-[r:link]->(f:Thing {id: '${esc(fileId)}'}) WHERE task.issue_type = 'skeleton_stub' AND task.status = 'pending' SET task.status = 'done', task.energy = 0, task.completed_at_s = ${now}`
          )
        }

        // Check: did a missing function get implemented?
        for (const fn of elements.functions) {
          queries.push(
            `MATCH (task:Moment)-[r:link]->(fn_node:Thing) WHERE task.issue_type = 'implement_function' AND task.status = 'pending' AND fn_node.name = '${esc(fn.name)}' AND r.condition = 'function_implemented' SET task.status = 'done', task.energy = 0, task.completed_at_s = ${now}`
          )
        }
      } catch (_) {}
    }

    // SYNC/doc files: parse TODO checkboxes and @mind:todo markers
    if (ext === '.md') {
      try {
        const content = await readFile(relPath, 'utf-8')

        // Checkboxes: - [ ] text → pending, - [x] text → done
        const checkboxRe = /^- \[([ x])\]\s*(.+)$/gm
        let cbMatch
        while ((cbMatch = checkboxRe.exec(content)) !== null) {
          const checked = cbMatch[1] === 'x'
          const text = cbMatch[2].trim()
          const taskId = `task:sync:${slugify(text.slice(0, 60) + '_' + relPath)}`
          if (checked) {
            // Auto-resolve
            queries.push(
              `MATCH (task:Moment {id: '${esc(taskId)}'}) WHERE task.status = 'pending' SET task.status = 'done', task.energy = 0, task.completed_at_s = ${now}`
            )
          } else {
            queries.push(
              `MERGE (n:Moment {id: '${esc(taskId)}'}) SET n.name = '${esc(text.slice(0, 120))}', n.type = 'task_run', n.subtype = 'task_run', n.status = 'pending', n.synthesis = '${esc(text)}', n.severity = 'medium', n.issue_type = 'sync_todo', n.weight = 0.5, n.energy = 0.5, n.friction = 0.3, n.stability = 0.4, n.created_at_s = ${now}, n.updated_at_s = ${now}`
            )
            queries.push(
              `MATCH (task:Moment {id: '${esc(taskId)}'}), (f:Thing {id: '${esc(fileId)}'}) MERGE (task)-[r:link]->(f) SET r.r_type = 'AFFECTS', r.hierarchy = -0.3, r.permanence = 0.4, r.trust = 0.8, r.friction = 0.3, r.weight = 0.5, r.condition = 'checkbox_checked', r.condition_target = '${esc(relPath + ':' + text.slice(0, 40))}'`
            )
            queries.push(
              `MATCH (task:Moment {id: '${esc(taskId)}'}), (org:Actor {id: 'org:ai_dev_dashboard'}) MERGE (task)-[r:link]->(org) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.6, r.permanence = 0.4, r.trust = 0.8, r.weight = 0.4`
            )
          }
        }

        // @mind:todo markers
        const markerRe = /<!--\s*@mind:(todo|proposition|escalation)\s+(.+?)\s*-->/g
        let mkMatch
        while ((mkMatch = markerRe.exec(content)) !== null) {
          const markerType = mkMatch[1]
          const markerText = mkMatch[2].trim()
          const sev = markerType === 'escalation' ? 'high' : markerType === 'todo' ? 'medium' : 'low'
          const taskId = `task:marker:${slugify(markerType + '_' + markerText.slice(0, 50) + '_' + relPath)}`
          queries.push(
            `MERGE (n:Moment {id: '${esc(taskId)}'}) SET n.name = '${esc((markerType + ': ' + markerText).slice(0, 120))}', n.type = 'task_run', n.subtype = 'task_run', n.status = 'pending', n.synthesis = '${esc(markerText)}', n.severity = '${sev}', n.issue_type = 'doc_marker_${markerType}', n.weight = ${sev === 'high' ? 0.8 : sev === 'medium' ? 0.5 : 0.3}, n.energy = ${sev === 'high' ? 0.7 : sev === 'medium' ? 0.5 : 0.3}, n.friction = ${sev === 'high' ? 0.6 : 0.3}, n.stability = 0.3, n.created_at_s = ${now}, n.updated_at_s = ${now}`
          )
          queries.push(
            `MATCH (task:Moment {id: '${esc(taskId)}'}), (f:Thing {id: '${esc(fileId)}'}) MERGE (task)-[r:link]->(f) SET r.r_type = 'AFFECTS', r.hierarchy = -0.3, r.permanence = 0.4, r.trust = 0.7, r.friction = 0.3, r.weight = 0.5, r.condition = 'marker_removed', r.condition_target = '${esc(relPath + ':' + markerText.slice(0, 30))}'`
          )
          queries.push(
            `MATCH (task:Moment {id: '${esc(taskId)}'}), (org:Actor {id: 'org:ai_dev_dashboard'}) MERGE (task)-[r:link]->(org) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.6, r.permanence = 0.4, r.trust = 0.8, r.weight = 0.4`
          )
        }
      } catch (_) {}
    }

    // Doc files: check if IMPL pointer target now exists
    if (ext === '.md') {
      try {
        const content = await readFile(relPath, 'utf-8')
        const implMatch = content.match(/^IMPL:\s+(.+)$/m)
        if (implMatch) {
          const implPath = implMatch[1].trim()
          const implId = `thing:file:${slugify(implPath)}`
          queries.push(
            `MATCH (doc:Thing {id: '${esc(fileId)}'}), (code:Thing {id: '${esc(implId)}'}) MERGE (doc)-[r:link]->(code) SET r.r_type = 'REFERENCES', r.hierarchy = 0.3, r.permanence = 0.85, r.trust = 0.9, r.friction = 0.1, r.weight = 0.7`
          )
        }

        // Check STATUS upgrade → auto-resolve draft_doc tasks
        const statusMatch = content.match(/^STATUS:\s+(CANONICAL|STABLE)/m)
        if (statusMatch) {
          queries.push(
            `MATCH (task:Moment)-[r:link]->(f:Thing {id: '${esc(fileId)}'}) WHERE task.issue_type = 'draft_doc' AND task.status = 'pending' SET task.status = 'done', task.energy = 0, task.completed_at_s = ${now}`
          )
        }
      } catch (_) {}
    }
  }

  // Execute queries
  let ok = 0
  for (const q of queries) {
    try {
      await redis.sendCommand(['GRAPH.QUERY', GRAPH, q])
      ok++
    } catch (e) {
      console.error(`  FAIL: ${q.slice(0, 80)}... → ${e.message?.slice(0, 60)}`)
    }
  }
  return ok
}

// --- Debounce ---
const pending = new Map()  // path → timeout

function debounce(redis, relPath, eventType) {
  if (pending.has(relPath)) clearTimeout(pending.get(relPath))
  pending.set(relPath, setTimeout(async () => {
    pending.delete(relPath)
    const count = await onFileChanged(redis, relPath, eventType)
    if (count > 0) {
      const ts = new Date().toISOString().slice(11, 19)
      console.log(`[${ts}] ${eventType} ${relPath} → ${count} queries`)
    }
  }, 300))
}

// --- Main ---
async function main() {
  const redis = createClient({ url: `redis://${process.env.FALKORDB_HOST || 'localhost'}:${process.env.FALKORDB_PORT || 6379}` })
  await redis.connect()
  console.log(`Watcher started — graph: ${GRAPH}`)
  console.log('Listening for file changes...\n')

  // Watch recursively
  const watcher = watch(ROOT, { recursive: true }, (eventType, filename) => {
    if (!filename) return
    const relPath = filename.replace(/\\/g, '/')
    if (shouldSkip(relPath)) return
    debounce(redis, relPath, eventType)
  })

  // Keep alive
  process.on('SIGINT', async () => {
    console.log('\nShutting down watcher...')
    watcher.close()
    await redis.quit()
    process.exit(0)
  })
}

main().catch(e => { console.error(e); process.exit(1) })
