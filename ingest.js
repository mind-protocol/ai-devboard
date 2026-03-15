#!/usr/bin/env node
// Ingest ai_devboard repo structure into FalkorDB graph org_ai_dev_dashboard
// Creates: Space nodes (dirs), Thing nodes (files), BELONGS_TO + DEPENDS_ON links
//
// Usage: node ingest.js [--dry-run]

import { createClient } from 'redis'
import { readdir, stat, readFile } from 'fs/promises'
import { join, relative, extname, basename, dirname } from 'path'

const GRAPH = 'org_ai_dev_dashboard'
const ROOT = '.'
const DRY_RUN = process.argv.includes('--dry-run')

// Dirs to skip entirely (by name — matched against the directory basename)
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', '.claude',
  'puppeteer_dev_chrome_profile-b9HpXs',
  '.org.chromium.Chromium.scoped_dir.IbepjR',
  'claude-1000', 'snap-private-tmp', 'v8-compile-cache-1000',
  'node-compile-cache', 'mind_ideogram', 'mind_telegram_voice',
  '__pycache__', 'assets', 'public',
  // mind-repo noise
  'uploads', 'static', 'shrine', 'android', 'lyrics',
])

// Skip dirs matching these prefixes
const SKIP_PREFIXES = ['systemd-private-', 'tmp', '.X11']

// Skip paths matching these patterns (checked against relPath)
const SKIP_PATHS = [
  'mind-repo/citizens/',  // 186 citizen folders — skip individual dirs, keep the top-level
]

// File extensions to ingest
const CODE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.py', '.yaml', '.yml', '.json', '.css', '.md', '.html'])

function shouldSkipDir(name, relPath) {
  if (SKIP_DIRS.has(name)) return true
  for (const p of SKIP_PREFIXES) {
    if (name.startsWith(p)) return true
  }
  for (const sp of SKIP_PATHS) {
    // Skip subdirectories under this path (but not the path itself)
    if (relPath.startsWith(sp) && relPath !== sp.replace(/\/$/, '')) return true
  }
  return false
}

function slugify(s) {
  return s.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase()
}

function fileSubtype(ext, name) {
  if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) return 'code_file'
  if (['.py'].includes(ext)) return 'code_file'
  if (['.yaml', '.yml'].includes(ext)) return 'config'
  if (['.json'].includes(ext)) return name === 'package.json' ? 'config' : 'data_source'
  if (['.md'].includes(ext)) return 'document'
  if (['.css'].includes(ext)) return 'code_file'
  if (['.html'].includes(ext)) return 'code_file'
  return 'code_file'
}

// Parse imports from source files
function parseImports(content, filePath) {
  const imports = []
  // ES module: import ... from '...'  or  import '...'
  const esRe = /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g
  // require: require('...')
  const cjsRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  // Python: from X import Y  or  import X
  const pyFromRe = /from\s+([\w.]+)\s+import/g
  const pyImportRe = /^import\s+([\w.]+)/gm

  const ext = extname(filePath)

  if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
    for (const re of [esRe, cjsRe]) {
      let m
      while ((m = re.exec(content)) !== null) {
        const spec = m[1]
        if (spec.startsWith('.') || spec.startsWith('/')) {
          imports.push({ spec, type: 'local' })
        } else {
          imports.push({ spec, type: 'external' })
        }
      }
    }
  } else if (ext === '.py') {
    for (const re of [pyFromRe, pyImportRe]) {
      let m
      while ((m = re.exec(content)) !== null) {
        const spec = m[1]
        if (spec.startsWith('.')) {
          imports.push({ spec, type: 'local' })
        } else {
          imports.push({ spec, type: 'external' })
        }
      }
    }
  }
  return imports
}

// Resolve a relative import to a file path
function resolveImport(importSpec, fromFile) {
  const dir = dirname(fromFile)
  let resolved = join(dir, importSpec)
  // Normalize: remove leading ./
  resolved = relative('.', resolved)
  return resolved
}

async function walk(dir) {
  const dirs = []   // { relPath, name }
  const files = []  // { relPath, name, ext }

  async function _walk(current) {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(current, entry.name)
      const relPath = relative(ROOT, fullPath)

      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name, relPath)) continue
        dirs.push({ relPath, name: entry.name })
        await _walk(fullPath)
      } else if (entry.isFile()) {
        const ext = extname(entry.name)
        if (CODE_EXTS.has(ext)) {
          files.push({ relPath, name: entry.name, ext })
        }
      }
    }
  }

  await _walk(dir)
  return { dirs, files }
}

// Escape Cypher string
function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
}

// Deep code parser — extracts granular elements from JS/JSX/PY files
function parseCodeDeep(content, filePath) {
  const ext = extname(filePath)
  const fileSlug = slugify(filePath)
  const elements = { functions: [], state: [], constants: [], hooks: [], routes: [], apiCalls: [], jsxElements: [] }

  if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
    // --- Functions ---
    // function name() / const name = () => / const name = async () => / const name = function
    const fnPatterns = [
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g,
      /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
      /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?function/g,
    ]
    for (const re of fnPatterns) {
      let m
      while ((m = re.exec(content)) !== null) {
        const name = m[1]
        if (['require', 'import'].includes(name)) continue
        const line = content.slice(0, m.index).split('\n').length
        // Infer purpose from nearby comments or function body
        const bodyStart = content.indexOf('{', m.index)
        const bodySnippet = bodyStart > -1 ? content.slice(bodyStart, bodyStart + 300) : ''
        elements.functions.push({ name, line, bodySnippet })
      }
    }

    // --- React State (useState) ---
    const stateRe = /const\s+\[(\w+),\s*(\w+)\]\s*=\s*useState\(([^)]*)\)/g
    let m
    while ((m = stateRe.exec(content)) !== null) {
      elements.state.push({ getter: m[1], setter: m[2], initial: m[3], line: content.slice(0, m.index).split('\n').length })
    }

    // --- Refs (useRef) ---
    const refRe = /const\s+(\w+)\s*=\s*useRef\(([^)]*)\)/g
    while ((m = refRe.exec(content)) !== null) {
      elements.state.push({ getter: m[1], setter: null, initial: m[2] || 'null', type: 'ref', line: content.slice(0, m.index).split('\n').length })
    }

    // --- Constants (top-level const objects/values) ---
    const constRe = /^const\s+(\w+)\s*=\s*(\{[\s\S]*?\n\}|'[^']*'|"[^"]*"|`[^`]*`|\d+(?:\.\d+)?|true|false|null)\s*;?\s*$/gm
    while ((m = constRe.exec(content)) !== null) {
      const name = m[1]
      if (['app', 'redis', 'PORT'].includes(name) || name.startsWith('_')) continue
      elements.constants.push({ name, value: m[2].slice(0, 100), line: content.slice(0, m.index).split('\n').length })
    }

    // --- useEffect hooks ---
    const effectRe = /useEffect\(\s*\(\)\s*=>\s*\{/g
    let effectIdx = 0
    while ((m = effectRe.exec(content)) !== null) {
      effectIdx++
      const line = content.slice(0, m.index).split('\n').length
      // Find deps array — look for ], [deps]) pattern after this effect
      const after = content.slice(m.index, m.index + 2000)
      const depsMatch = after.match(/\},\s*\[([^\]]*)\]\s*\)/)
      const deps = depsMatch ? depsMatch[1].split(',').map(d => d.trim()).filter(Boolean) : []
      // Infer purpose from first comment or first meaningful line
      const bodyStart = content.indexOf('{', m.index)
      const bodySnippet = bodyStart > -1 ? content.slice(bodyStart + 1, bodyStart + 200).trim() : ''
      const commentMatch = bodySnippet.match(/\/\/\s*(.+)/)
      const purpose = commentMatch ? commentMatch[1] : bodySnippet.split('\n')[0].slice(0, 80)
      elements.hooks.push({ type: 'useEffect', index: effectIdx, deps, purpose, line })
    }

    // --- Express routes (server-side) ---
    const routeRe = /app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g
    while ((m = routeRe.exec(content)) !== null) {
      const line = content.slice(0, m.index).split('\n').length
      elements.routes.push({ method: m[1].toUpperCase(), path: m[2], line })
    }

    // --- API calls (client-side fetch / EventSource) ---
    const fetchRe = /fetch\s*\(\s*['"`]([^'"`]+)['"`](?:.*?method:\s*['"`](\w+)['"`])?/gs
    while ((m = fetchRe.exec(content)) !== null) {
      elements.apiCalls.push({ url: m[1], method: (m[2] || 'GET').toUpperCase(), line: content.slice(0, m.index).split('\n').length })
    }
    const esRe = /new\s+EventSource\s*\(\s*[`'"]([^`'"]+)[`'"]/g
    while ((m = esRe.exec(content)) !== null) {
      elements.apiCalls.push({ url: m[1], method: 'SSE', line: content.slice(0, m.index).split('\n').length })
    }

    // --- JSX top-level elements (className or tag patterns) ---
    const jsxRe = /<(\w+)\s+className=["']([^"']+)["']/g
    while ((m = jsxRe.exec(content)) !== null) {
      elements.jsxElements.push({ tag: m[1], className: m[2] })
    }
  }

  if (ext === '.py') {
    // --- Python functions ---
    const pyFnRe = /^(?:async\s+)?def\s+(\w+)\s*\(/gm
    while ((m = pyFnRe.exec(content)) !== null) {
      elements.functions.push({ name: m[1], line: content.slice(0, m.index).split('\n').length })
    }
    // --- Python classes ---
    const pyClassRe = /^class\s+(\w+)(?:\(([^)]*)\))?:/gm
    while ((m = pyClassRe.exec(content)) !== null) {
      elements.functions.push({ name: m[1], line: content.slice(0, m.index).split('\n').length, type: 'class', bases: m[2] })
    }
    // --- Python constants (ALL_CAPS) ---
    const pyConstRe = /^([A-Z][A-Z_0-9]+)\s*=\s*(.+)/gm
    while ((m = pyConstRe.exec(content)) !== null) {
      elements.constants.push({ name: m[1], value: m[2].slice(0, 100), line: content.slice(0, m.index).split('\n').length })
    }
  }

  return elements
}

// Generate Cypher queries for deep code elements
function deepElementQueries(elements, filePath) {
  const queries = []
  const fileSlug = slugify(filePath)
  const fileId = `thing:file:${fileSlug}`

  // stability = trust proxy on nodes:
  //   1.0 = parsed from code (function def, state decl, route)
  //   0.7 = inferred (hooks, intra-file calls)
  //   0.3 = proposed (from doc mention, skeleton)

  // Functions → Thing(subtype=code_function)
  for (const fn of elements.functions) {
    const fnId = `thing:fn:${fileSlug}:${slugify(fn.name)}`
    const fnType = fn.type === 'class' ? 'code_class' : 'code_function'
    queries.push(
      `MERGE (n:Thing {id: '${esc(fnId)}'}) SET n.name = '${esc(fn.name)}', n.subtype = '${fnType}', n.weight = 0.6, n.energy = 0.4, n.stability = 1.0, n.line = ${fn.line || 0}, n.source_file = '${esc(filePath)}'`
    )
    queries.push(
      `MATCH (fn:Thing {id: '${esc(fnId)}'}), (file:Thing {id: '${esc(fileId)}'}) MERGE (fn)-[r:link]->(file) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.5, r.permanence = 0.9, r.trust = 1.0, r.friction = 0.0, r.weight = 0.7`
    )
  }

  // State vars → Thing(subtype=state_var)
  for (const s of elements.state) {
    const stateId = `thing:state:${fileSlug}:${slugify(s.getter)}`
    const sub = s.type === 'ref' ? 'ref' : 'state_var'
    queries.push(
      `MERGE (n:Thing {id: '${esc(stateId)}'}) SET n.name = '${esc(s.getter)}', n.subtype = '${sub}', n.weight = 0.5, n.energy = 0.3, n.stability = 0.6, n.initial_value = '${esc(s.initial || 'undefined')}', n.setter = '${esc(s.setter || '')}', n.source_file = '${esc(filePath)}'`
    )
    queries.push(
      `MATCH (sv:Thing {id: '${esc(stateId)}'}), (file:Thing {id: '${esc(fileId)}'}) MERGE (sv)-[r:link]->(file) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.5, r.permanence = 0.85, r.trust = 1.0, r.friction = 0.0, r.weight = 0.5`
    )

    // Link setter function to state if setter is used in a function
    if (s.setter) {
      for (const fn of elements.functions) {
        if (fn.bodySnippet && fn.bodySnippet.includes(s.setter)) {
          const fnId = `thing:fn:${fileSlug}:${slugify(fn.name)}`
          queries.push(
            `MATCH (fn:Thing {id: '${esc(fnId)}'}), (sv:Thing {id: '${esc(stateId)}'}) MERGE (fn)-[r:link]->(sv) SET r.r_type = 'MUTATES', r.hierarchy = 0.1, r.permanence = 0.7, r.trust = 0.9, r.friction = 0.1, r.weight = 0.5`
          )
        }
      }
    }
  }

  // Constants → Thing(subtype=config)
  for (const c of elements.constants) {
    const constId = `thing:const:${fileSlug}:${slugify(c.name)}`
    queries.push(
      `MERGE (n:Thing {id: '${esc(constId)}'}) SET n.name = '${esc(c.name)}', n.subtype = 'config', n.weight = 0.4, n.energy = 0.2, n.stability = 0.9, n.value = '${esc(c.value)}', n.source_file = '${esc(filePath)}'`
    )
    queries.push(
      `MATCH (c:Thing {id: '${esc(constId)}'}), (file:Thing {id: '${esc(fileId)}'}) MERGE (c)-[r:link]->(file) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.4, r.permanence = 0.9, r.trust = 1.0, r.friction = 0.0, r.weight = 0.4`
    )
  }

  // Hooks → Narrative(subtype=hook)
  for (const h of elements.hooks) {
    const hookId = `narrative:hook:${fileSlug}:${h.type}_${h.index}`
    queries.push(
      `MERGE (n:Narrative {id: '${esc(hookId)}'}) SET n.name = '${esc(h.type + ' #' + h.index + ': ' + h.purpose.slice(0, 60))}', n.subtype = 'hook', n.weight = 0.6, n.energy = 0.4, n.stability = 0.7, n.deps = '${esc(h.deps.join(', '))}', n.source_file = '${esc(filePath)}'`
    )
    queries.push(
      `MATCH (hook:Narrative {id: '${esc(hookId)}'}), (file:Thing {id: '${esc(fileId)}'}) MERGE (hook)-[r:link]->(file) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.4, r.permanence = 0.85, r.trust = 1.0, r.friction = 0.0, r.weight = 0.6`
    )
    // Link hook to state it depends on
    for (const dep of h.deps) {
      const depStateId = `thing:state:${fileSlug}:${slugify(dep)}`
      queries.push(
        `MATCH (hook:Narrative {id: '${esc(hookId)}'}), (sv:Thing {id: '${esc(depStateId)}'}) MERGE (hook)-[r:link]->(sv) SET r.r_type = 'DEPENDS_ON', r.hierarchy = -0.2, r.permanence = 0.7, r.trust = 0.9, r.friction = 0.1, r.weight = 0.5`
      )
    }
  }

  // Routes → Thing(subtype=api_endpoint)
  for (const rt of elements.routes) {
    const routeId = `thing:route:${slugify(rt.method + '_' + rt.path)}`
    queries.push(
      `MERGE (n:Thing {id: '${esc(routeId)}'}) SET n.name = '${esc(rt.method + ' ' + rt.path)}', n.subtype = 'api_endpoint', n.weight = 0.8, n.energy = 0.5, n.stability = 0.8, n.method = '${rt.method}', n.path = '${esc(rt.path)}', n.source_file = '${esc(filePath)}'`
    )
    queries.push(
      `MATCH (rt:Thing {id: '${esc(routeId)}'}), (file:Thing {id: '${esc(fileId)}'}) MERGE (rt)-[r:link]->(file) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.3, r.permanence = 0.9, r.trust = 1.0, r.friction = 0.0, r.weight = 0.8`
    )
  }

  // API calls → links to routes (cross-file CALLS)
  for (const call of elements.apiCalls) {
    // Normalize URL: strip template literals → /api/stream/:graph
    const normalizedPath = call.url.replace(/\$\{[^}]+\}/g, ':param').replace(/\/:[^/]+/g, '/:param')
    // Try to match to a route
    const routeId = `thing:route:${slugify(call.method + '_' + normalizedPath)}`
    // Find which function makes this call
    let callerFnId = null
    for (const fn of elements.functions) {
      if (fn.bodySnippet && (fn.bodySnippet.includes(call.url.slice(0, 20)) || fn.bodySnippet.includes('fetch') || fn.bodySnippet.includes('EventSource'))) {
        callerFnId = `thing:fn:${fileSlug}:${slugify(fn.name)}`
        break
      }
    }
    const fromId = callerFnId || fileId
    queries.push(
      `MATCH (caller {id: '${esc(fromId)}'}) MERGE (caller)-[r:link]->(rt:Thing {id: '${esc(routeId)}'}) SET r.r_type = 'CALLS', r.hierarchy = 0.0, r.permanence = 0.8, r.trust = 0.85, r.friction = 0.15, r.weight = 0.6, r.method = '${call.method}', r.url = '${esc(call.url)}'`
    )
  }

  // Intra-file function calls: if function A's body mentions function B's name
  for (const fnA of elements.functions) {
    if (!fnA.bodySnippet) continue
    for (const fnB of elements.functions) {
      if (fnA.name === fnB.name) continue
      if (fnA.bodySnippet.includes(fnB.name + '(') || fnA.bodySnippet.includes(fnB.name + '\n')) {
        const aId = `thing:fn:${fileSlug}:${slugify(fnA.name)}`
        const bId = `thing:fn:${fileSlug}:${slugify(fnB.name)}`
        queries.push(
          `MATCH (a:Thing {id: '${esc(aId)}'}), (b:Thing {id: '${esc(bId)}'}) MERGE (a)-[r:link]->(b) SET r.r_type = 'CALLS', r.hierarchy = 0.1, r.permanence = 0.8, r.trust = 0.9, r.friction = 0.05, r.weight = 0.5`
        )
      }
    }
  }

  return queries
}

async function main() {
  console.log(`Scanning ${ROOT}...`)
  const { dirs, files } = await walk(ROOT)
  console.log(`Found ${dirs.length} directories, ${files.length} files`)

  const queries = []

  // Create Space nodes for directories
  for (const d of dirs) {
    const id = `space:dir:${slugify(d.relPath)}`
    const parentRel = dirname(d.relPath)
    const parentId = parentRel === '.' ? null : `space:dir:${slugify(parentRel)}`

    queries.push(
      `MERGE (n:Space {id: '${esc(id)}'}) SET n.name = '${esc(d.relPath)}', n.subtype = 'module', n.weight = 0.7, n.stability = 0.8, n.energy = 0.3, n.space_hint = 'directory'`
    )

    if (parentId) {
      queries.push(
        `MATCH (child:Space {id: '${esc(id)}'}), (parent:Space {id: '${esc(parentId)}'}) MERGE (child)-[r:link]->(parent) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.5, r.permanence = 0.9, r.trust = 1.0, r.friction = 0.0, r.weight = 0.8`
      )
    }
  }

  // Create Thing nodes for files
  for (const f of files) {
    const id = `thing:file:${slugify(f.relPath)}`
    const parentRel = dirname(f.relPath)
    const parentId = parentRel === '.' ? null : `space:dir:${slugify(parentRel)}`
    const sub = fileSubtype(f.ext, f.name)

    queries.push(
      `MERGE (n:Thing {id: '${esc(id)}'}) SET n.name = '${esc(f.relPath)}', n.subtype = '${sub}', n.weight = 0.5, n.stability = 0.7, n.energy = 0.3`
    )

    if (parentId) {
      queries.push(
        `MATCH (child:Thing {id: '${esc(id)}'}), (parent:Space {id: '${esc(parentId)}'}) MERGE (child)-[r:link]->(parent) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.5, r.permanence = 0.9, r.trust = 1.0, r.friction = 0.0, r.weight = 0.6`
      )
    }
  }

  // --- DEEP CODE PARSING ---
  // Extract granular elements from code files and wire them together
  let deepCount = 0
  const allRoutes = []    // collect across files for cross-file wiring
  const allApiCalls = []  // collect across files for cross-file wiring
  for (const f of files) {
    if (!['.js', '.jsx', '.ts', '.tsx', '.py'].includes(f.ext)) continue
    if (f.relPath.startsWith('mind-repo/')) continue // skip vendored
    try {
      const content = await readFile(f.relPath, 'utf-8')
      const elements = parseCodeDeep(content, f.relPath)
      const deepQueries = deepElementQueries(elements, f.relPath)
      queries.push(...deepQueries)
      deepCount += deepQueries.length

      // Collect routes and API calls for cross-file wiring
      for (const rt of elements.routes) allRoutes.push({ ...rt, file: f.relPath })
      for (const call of elements.apiCalls) allApiCalls.push({ ...call, file: f.relPath })
    } catch (_) {}
  }

  // Cross-file wiring: API calls in client → routes in server
  for (const call of allApiCalls) {
    const normalizedUrl = call.url.replace(/\$\{[^}]+\}/g, ':param')
    for (const rt of allRoutes) {
      // Match: same method and path pattern
      const routePattern = rt.path.replace(/:[^/]+/g, ':param')
      if (call.method === rt.method && normalizedUrl.includes(routePattern.replace('/api', ''))) {
        const callFileId = `thing:file:${slugify(call.file)}`
        const routeId = `thing:route:${slugify(rt.method + '_' + rt.path)}`
        queries.push(
          `MATCH (caller:Thing {id: '${esc(callFileId)}'}), (route:Thing {id: '${esc(routeId)}'}) MERGE (caller)-[r:link]->(route) SET r.r_type = 'CALLS', r.hierarchy = 0.0, r.permanence = 0.8, r.trust = 0.85, r.friction = 0.15, r.weight = 0.7`
        )
      }
      // SSE special case
      if (call.method === 'SSE' && rt.path.includes('stream')) {
        const callFileId = `thing:file:${slugify(call.file)}`
        const routeId = `thing:route:${slugify(rt.method + '_' + rt.path)}`
        queries.push(
          `MATCH (caller:Thing {id: '${esc(callFileId)}'}), (route:Thing {id: '${esc(routeId)}'}) MERGE (caller)-[r:link]->(route) SET r.r_type = 'SUBSCRIBES', r.hierarchy = -0.1, r.permanence = 0.8, r.trust = 0.85, r.friction = 0.1, r.weight = 0.7`
        )
      }
    }
  }

  console.log(`Deep parsing: ${deepCount} granular element queries`)

  // --- DOC-TO-CODE WIRING ---
  // Parse doc chain files for function/class/behavior references and link to code elements
  let docCodeLinks = 0
  for (const f of files) {
    if (f.ext !== '.md') continue
    try {
      const content = await readFile(f.relPath, 'utf-8')
      const docFileId = `thing:file:${slugify(f.relPath)}`

      // Find function references in docs: `functionName()` or `ClassName`
      const fnRefs = [...content.matchAll(/`(\w+)\(\)`/g)].map(m => m[1])
      const classRefs = [...content.matchAll(/`(\w+)`\s*(?:class|object|instance)/gi)].map(m => m[1])

      // Find ALGORITHM step headings → link to functions that match
      const algoSteps = [...content.matchAll(/^###\s+(?:Step\s+\d+:\s*)?(.+)/gm)].map(m => m[1].trim())

      // Find BEHAVIOR headings → B1: Observable Result
      const behaviors = [...content.matchAll(/^###\s+B(\d+):\s*(.+)/gm)].map(m => ({ id: `B${m[1]}`, name: m[2].trim() }))

      // Find flow steps referencing files: file: path/to/file.py, function: name
      const flowFns = [...content.matchAll(/function:\s*(\w+)/g)].map(m => m[1])

      // Combine all referenced function names
      const allRefs = new Set([...fnRefs, ...classRefs, ...flowFns])

      // For each referenced function, use MATCH-based MERGE so links only created if both exist
      for (const ref of allRefs) {
        const refSlug = slugify(ref)
        // Use a Cypher pattern that finds the function node by name suffix
        queries.push(
          `MATCH (fn:Thing), (doc:Thing {id: '${esc(docFileId)}'}) WHERE fn.subtype IN ['code_function', 'code_class'] AND fn.name = '${esc(ref)}' MERGE (fn)-[r:link]->(doc) SET r.r_type = 'IMPLEMENTS', r.hierarchy = -0.4, r.permanence = 0.8, r.trust = 0.8, r.friction = 0.1, r.weight = 0.7`
        )
        docCodeLinks++
      }

      // Link API endpoints mentioned in docs to route nodes
      const apiRefs = [...content.matchAll(/(?:GET|POST|PUT|DELETE)\s+(\/api\/[^\s`"']+)/g)]
      for (const apiRef of apiRefs) {
        const routeId = `thing:route:${slugify(apiRef[0].replace(/\s+/g, '_'))}`
        queries.push(
          `MATCH (rt:Thing {id: '${esc(routeId)}'}), (doc:Thing {id: '${esc(docFileId)}'}) MERGE (rt)-[r:link]->(doc) SET r.r_type = 'IMPLEMENTS', r.hierarchy = -0.3, r.permanence = 0.8, r.trust = 0.85, r.friction = 0.1, r.weight = 0.7`
        )
        docCodeLinks++
      }
    } catch (_) {}
  }
  console.log(`Doc↔Code wiring: ${docCodeLinks} potential links`)

  // Build a file lookup set for fast resolution
  const fileSet = new Set(files.map(f => f.relPath))

  // Parse imports for code files and create DEPENDS_ON links
  let depCount = 0
  let externalDeps = new Set()
  for (const f of files) {
    if (!['.js', '.jsx', '.ts', '.tsx', '.py'].includes(f.ext)) continue
    try {
      const content = await readFile(f.relPath, 'utf-8')
      const imports = parseImports(content, f.relPath)
      const sourceId = `thing:file:${slugify(f.relPath)}`

      for (const imp of imports) {
        if (imp.type === 'external') {
          externalDeps.add(imp.spec.split('/')[0]) // top-level package name
          continue
        }

        const resolved = resolveImport(imp.spec, f.relPath)
        // Try to find the target file (with or without extension)
        const candidates = [resolved]
        if (!extname(resolved)) {
          candidates.push(
            resolved + '.js', resolved + '.jsx', resolved + '.ts', resolved + '.tsx',
            resolved + '.css', resolved + '.py',
            resolved + '/index.js', resolved + '/index.jsx',
          )
        }

        for (const candidate of candidates) {
          if (fileSet.has(candidate)) {
            const targetId = `thing:file:${slugify(candidate)}`
            queries.push(
              `MATCH (src:Thing {id: '${esc(sourceId)}'}), (tgt:Thing {id: '${esc(targetId)}'}) MERGE (src)-[r:link]->(tgt) SET r.r_type = 'DEPENDS_ON', r.hierarchy = 0.1, r.permanence = 0.85, r.trust = 0.9, r.friction = 0.1, r.weight = 0.5`
            )
            depCount++
            break
          }
        }
      }
    } catch (_) { /* skip unreadable files */ }
  }

  // Parse doc chain IMPL pointers: "IMPL: path/to/file.py" → REFERENCES link
  let implCount = 0
  for (const f of files) {
    if (f.ext !== '.md') continue
    try {
      const content = await readFile(f.relPath, 'utf-8')
      const implMatch = content.match(/^IMPL:\s+(.+)$/m)
      if (implMatch) {
        const implPath = implMatch[1].trim()
        const sourceId = `thing:file:${slugify(f.relPath)}`
        const targetId = `thing:file:${slugify(implPath)}`
        if (fileSet.has(implPath)) {
          queries.push(
            `MATCH (doc:Thing {id: '${esc(sourceId)}'}), (code:Thing {id: '${esc(targetId)}'}) MERGE (doc)-[r:link]->(code) SET r.r_type = 'REFERENCES', r.hierarchy = 0.3, r.permanence = 0.85, r.trust = 0.9, r.friction = 0.1, r.weight = 0.7`
          )
          implCount++
        }
      }
    } catch (_) {}
  }

  // --- HEALTH FLAGS ---
  // Detect missing implementations, undocumented code, broken IMPL pointers
  const issues = []

  // 1. Docs with IMPL pointing to non-existent files
  for (const f of files) {
    if (f.ext !== '.md') continue
    try {
      const content = await readFile(f.relPath, 'utf-8')
      const implMatch = content.match(/^IMPL:\s+(.+)$/m)
      if (implMatch) {
        const implPath = implMatch[1].trim()
        if (!implPath.includes('{') && !fileSet.has(implPath)) {
          issues.push({ type: 'missing_impl', doc: f.relPath, target: implPath, severity: 'high' })
        }
      }
    } catch (_) {}
  }

  // 2. Code files with no doc chain referencing them (undocumented code)
  const referencedByDocs = new Set()
  for (const f of files) {
    if (f.ext !== '.md') continue
    try {
      const content = await readFile(f.relPath, 'utf-8')
      const implMatch = content.match(/^IMPL:\s+(.+)$/m)
      if (implMatch) referencedByDocs.add(implMatch[1].trim())
    } catch (_) {}
  }
  for (const f of files) {
    if (!['.js', '.jsx', '.py'].includes(f.ext)) continue
    if (f.relPath.startsWith('mind-repo/')) continue // skip vendored code
    if (!referencedByDocs.has(f.relPath)) {
      issues.push({ type: 'undocumented_code', file: f.relPath, severity: 'medium' })
    }
  }

  // 3. IMPLEMENTATION docs listing PROPOSED files (lines ~0)
  for (const f of files) {
    if (f.ext !== '.md' || !f.name.startsWith('IMPLEMENTATION')) continue
    try {
      const content = await readFile(f.relPath, 'utf-8')
      const proposed = [...content.matchAll(/\|\s*`([^`]+)`\s*\|[^|]+\|[^|]+\|\s*~?0\s*\|\s*PROPOSED\s*\|/g)]
      for (const m of proposed) {
        issues.push({ type: 'proposed_not_built', doc: f.relPath, file: m[1], severity: 'high' })
      }
    } catch (_) {}
  }

  // 4. Doc chain files with STATUS: DRAFT or PROPOSED
  for (const f of files) {
    if (f.ext !== '.md') continue
    try {
      const content = await readFile(f.relPath, 'utf-8')
      const statusMatch = content.match(/^STATUS:\s+(DRAFT|PROPOSED)/m)
      if (statusMatch) {
        issues.push({ type: 'draft_doc', file: f.relPath, status: statusMatch[1], severity: 'low' })
      }
    } catch (_) {}
  }

  // Create task_run nodes for each issue — auto-assignment picks them up
  // via task_assignment.py select_best_agent() (cosine_sim × weight × energy × 0.5^active)
  const now = Math.floor(Date.now() / 1000)
  for (const issue of issues) {
    const desc = issue.type === 'missing_impl' ? `IMPL points to missing file: ${issue.target} (from ${issue.doc})`
      : issue.type === 'undocumented_code' ? `Code file has no doc chain: ${issue.file}`
      : issue.type === 'proposed_not_built' ? `PROPOSED file not built: ${issue.file} (in ${issue.doc})`
      : issue.type === 'draft_doc' ? `Doc is ${issue.status}: ${issue.file}`
      : `Unknown issue: ${JSON.stringify(issue)}`

    const issueId = `task:ingest:${slugify(issue.type + '_' + (issue.target || issue.file || issue.doc))}`
    const frictionMap = { high: 0.8, medium: 0.5, low: 0.2 }

    // task_run node — pending status → auto-assignment engine claims it
    queries.push(
      `MERGE (n:Moment {id: '${esc(issueId)}'}) SET n.name = '${esc(desc.slice(0, 120))}', n.type = 'task_run', n.subtype = 'task_run', n.status = 'pending', n.synthesis = '${esc(desc)}', n.content = '${esc(desc)}', n.severity = '${issue.severity}', n.issue_type = '${issue.type}', n.weight = ${frictionMap[issue.severity] + 0.2}, n.energy = ${frictionMap[issue.severity]}, n.friction = ${frictionMap[issue.severity]}, n.stability = 0.3, n.created_at_s = ${now}, n.updated_at_s = ${now}`
    )

    // Link task to the relevant file via AFFECTS
    const targetFile = issue.target || issue.file || issue.doc
    const targetId = `thing:file:${slugify(targetFile)}`
    if (fileSet.has(targetFile)) {
      queries.push(
        `MATCH (task:Moment {id: '${esc(issueId)}'}), (file:Thing {id: '${esc(targetId)}'}) MERGE (task)-[r:link]->(file) SET r.r_type = 'AFFECTS', r.hierarchy = -0.3, r.permanence = 0.5, r.trust = 0.7, r.friction = ${frictionMap[issue.severity]}, r.weight = 0.6`
      )
    }

    // Link task to the org so auto-assignment can find it
    queries.push(
      `MATCH (task:Moment {id: '${esc(issueId)}'}), (org:Actor {id: 'org:ai_dev_dashboard'}) MERGE (task)-[r:link]->(org) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.6, r.permanence = 0.5, r.trust = 0.8, r.weight = 0.5`
    )
  }

  // ==========================================================================
  // PHASE 4: VERIFY / BUILD / LINT / AUTO-FIX
  // ==========================================================================
  const { execSync } = await import('child_process')
  const { mkdir: mkdirV, writeFile: writeFileV, access } = await import('fs/promises')

  // --- 4a. GRAPH INTEGRITY ---
  console.log('\n--- PHASE 4a: Graph integrity ---')
  let integrityIssues = 0

  // Orphan code_function nodes (no BELONGS_TO link to a file)
  for (const f of files) {
    if (!['.js', '.jsx', '.py'].includes(f.ext)) continue
    if (f.relPath.startsWith('mind-repo/')) continue
    try {
      const content = await readFile(f.relPath, 'utf-8')
      const elements = parseCodeDeep(content, f.relPath)
      const fileSlug = slugify(f.relPath)

      // Check: every function that calls another — does the callee exist?
      for (const fnA of elements.functions) {
        if (!fnA.bodySnippet) continue
        // Extract function calls from body
        const callMatches = [...fnA.bodySnippet.matchAll(/(\w+)\s*\(/g)]
        for (const cm of callMatches) {
          const callee = cm[1]
          if (['if', 'for', 'while', 'switch', 'return', 'catch', 'console', 'JSON', 'Math', 'Object',
               'Array', 'Promise', 'Error', 'Date', 'Set', 'Map', 'parseInt', 'parseFloat', 'setTimeout',
               'setInterval', 'clearInterval', 'fetch', 'require', 'import'].includes(callee)) continue
          if (callee.startsWith('set') && callee.length > 3) continue // React setters
          // Check if callee exists in this file or as an import
          const calleeExists = elements.functions.some(fn => fn.name === callee)
          const isImported = content.includes(`import`) && content.includes(callee)
          if (!calleeExists && !isImported && callee.length > 2) {
            // Possible missing function — low severity, might be from a library
            const taskId = `task:verify:missing_fn_${slugify(callee + '_' + f.relPath)}`
            const desc = `${fnA.name}() calls ${callee}() but it's not defined locally or imported — check if it exists (${f.relPath}:${fnA.line})`
            queries.push(
              `MERGE (n:Moment {id: '${esc(taskId)}'}) SET n.name = '${esc(desc.slice(0, 120))}', n.type = 'task_run', n.subtype = 'task_run', n.status = 'pending', n.synthesis = '${esc(desc)}', n.severity = 'low', n.issue_type = 'verify_missing_callee', n.weight = 0.3, n.energy = 0.3, n.friction = 0.2, n.stability = 0.5, n.created_at_s = ${now}, n.updated_at_s = ${now}`
            )
            queries.push(
              `MATCH (task:Moment {id: '${esc(taskId)}'}), (org:Actor {id: 'org:ai_dev_dashboard'}) MERGE (task)-[r:link]->(org) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.6, r.permanence = 0.4, r.trust = 0.7, r.weight = 0.3`
            )
            integrityIssues++
          }
        }
      }
    } catch (_) {}
  }
  console.log(`  ${integrityIssues} potential missing callees`)

  // --- 4b. BUILD CHECK ---
  console.log('\n--- PHASE 4b: Build check ---')
  if (!DRY_RUN) {
    try {
      const buildResult = execSync('npx vite build --mode development 2>&1 || true', {
        maxBuffer: 10 * 1024 * 1024, encoding: 'utf-8', timeout: 60000, cwd: '.'
      })
      const buildErrors = []
      // Parse vite build errors
      const errorLines = buildResult.split('\n').filter(l => l.includes('ERROR') || l.includes('error') || l.includes('Could not resolve'))
      for (const line of errorLines) {
        buildErrors.push(line.trim())
      }
      if (buildErrors.length > 0) {
        console.log(`  ${buildErrors.length} build errors:`)
        for (const e of buildErrors.slice(0, 10)) console.log(`    ${e}`)

        const taskId = `task:verify:build_errors`
        const desc = `Build failed with ${buildErrors.length} errors: ${buildErrors[0].slice(0, 80)}`
        queries.push(
          `MERGE (n:Moment {id: '${esc(taskId)}'}) SET n.name = '${esc(desc.slice(0, 120))}', n.type = 'task_run', n.subtype = 'task_run', n.status = 'pending', n.synthesis = '${esc(desc)}', n.severity = 'high', n.issue_type = 'build_error', n.weight = 1.0, n.energy = 0.9, n.friction = 0.9, n.stability = 0.2, n.created_at_s = ${now}, n.updated_at_s = ${now}`
        )
        queries.push(
          `MATCH (task:Moment {id: '${esc(taskId)}'}), (org:Actor {id: 'org:ai_dev_dashboard'}) MERGE (task)-[r:link]->(org) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.6, r.permanence = 0.5, r.trust = 0.9, r.weight = 0.8`
        )
        issues.push({ type: 'build_error', file: 'vite build', severity: 'high' })
      } else {
        console.log('  Build OK')
      }
    } catch (e) { console.log(`  Build check skipped: ${e.message?.slice(0, 60)}`) }
  }

  // --- 4c. SYNTAX VALIDATION (JS files with skeleton stubs) ---
  console.log('\n--- PHASE 4c: Skeleton validation ---')
  let syntaxFixes = 0
  for (const f of files) {
    if (!['.js', '.jsx'].includes(f.ext)) continue
    if (f.relPath.startsWith('mind-repo/') || f.relPath.startsWith('node_modules/')) continue
    try {
      const content = await readFile(f.relPath, 'utf-8')

      // Check for missing imports that are used
      const usedGlobals = new Set()
      const importedNames = new Set()

      // Collect imports
      for (const m of content.matchAll(/import\s+\{([^}]+)\}\s+from/g)) {
        for (const name of m[1].split(',')) importedNames.add(name.trim())
      }
      for (const m of content.matchAll(/import\s+(\w+)\s+from/g)) {
        importedNames.add(m[1])
      }
      for (const m of content.matchAll(/import\s+\*\s+as\s+(\w+)\s+from/g)) {
        importedNames.add(m[1])
      }

      // Check: file uses 'express' but doesn't import it?
      if (content.includes('express()') && !importedNames.has('express') && !content.includes("import express")) {
        const fix = `import express from 'express'`
        if (!DRY_RUN) {
          // Auto-fix: prepend import
          const fixed = fix + '\n' + content
          await writeFileV(f.relPath, fixed)
          console.log(`  ✓ auto-fixed missing import in ${f.relPath}: ${fix}`)
          syntaxFixes++
        } else {
          console.log(`  Would fix: ${f.relPath} — ${fix}`)
        }
      }

      // Check: file has NotImplementedError throws (skeleton) → track as needing implementation
      const notImplCount = (content.match(/throw new Error\('Not implemented/g) || []).length
      if (notImplCount > 0) {
        const taskId = `task:verify:skeleton_${slugify(f.relPath)}`
        const desc = `${f.relPath} has ${notImplCount} skeleton stub(s) — implement the TODO functions`
        queries.push(
          `MERGE (n:Moment {id: '${esc(taskId)}'}) SET n.name = '${esc(desc.slice(0, 120))}', n.type = 'task_run', n.subtype = 'task_run', n.status = 'pending', n.synthesis = '${esc(desc)}', n.severity = 'high', n.issue_type = 'skeleton_stub', n.weight = 0.9, n.energy = 0.8, n.friction = 0.6, n.stability = 0.2, n.created_at_s = ${now}, n.updated_at_s = ${now}`
        )
        const fileId = `thing:file:${slugify(f.relPath)}`
        queries.push(
          `MATCH (task:Moment {id: '${esc(taskId)}'}), (file:Thing {id: '${esc(fileId)}'}) MERGE (task)-[r:link]->(file) SET r.r_type = 'AFFECTS', r.hierarchy = -0.3, r.permanence = 0.5, r.trust = 0.9, r.friction = 0.6, r.weight = 0.7`
        )
        queries.push(
          `MATCH (task:Moment {id: '${esc(taskId)}'}), (org:Actor {id: 'org:ai_dev_dashboard'}) MERGE (task)-[r:link]->(org) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.6, r.permanence = 0.5, r.trust = 0.8, r.weight = 0.5`
        )
        issues.push({ type: 'skeleton_stub', file: f.relPath, severity: 'high' })
      }
    } catch (_) {}
  }
  // Same for Python skeletons
  for (const f of files) {
    if (f.ext !== '.py') continue
    if (f.relPath.startsWith('mind-repo/')) continue
    try {
      const content = await readFile(f.relPath, 'utf-8')
      const notImplCount = (content.match(/raise NotImplementedError/g) || []).length
      if (notImplCount > 0) {
        const taskId = `task:verify:skeleton_${slugify(f.relPath)}`
        const desc = `${f.relPath} has ${notImplCount} skeleton stub(s) — implement the TODO functions`
        queries.push(
          `MERGE (n:Moment {id: '${esc(taskId)}'}) SET n.name = '${esc(desc.slice(0, 120))}', n.type = 'task_run', n.subtype = 'task_run', n.status = 'pending', n.synthesis = '${esc(desc)}', n.severity = 'high', n.issue_type = 'skeleton_stub', n.weight = 0.9, n.energy = 0.8, n.friction = 0.6, n.stability = 0.2, n.created_at_s = ${now}, n.updated_at_s = ${now}`
        )
        queries.push(
          `MATCH (task:Moment {id: '${esc(taskId)}'}), (org:Actor {id: 'org:ai_dev_dashboard'}) MERGE (task)-[r:link]->(org) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.6, r.permanence = 0.5, r.trust = 0.8, r.weight = 0.5`
        )
        issues.push({ type: 'skeleton_stub', file: f.relPath, severity: 'high' })
      }
    } catch (_) {}
  }
  console.log(`  ${syntaxFixes} auto-fixes applied`)

  // --- 4d. CROSS-REFERENCE VALIDATION ---
  // Check that every API route has at least one client calling it
  console.log('\n--- PHASE 4d: API coverage ---')
  const calledRoutes = new Set()
  for (const call of allApiCalls) {
    const normalizedUrl = call.url.replace(/\$\{[^}]+\}/g, ':param')
    calledRoutes.add(normalizedUrl)
  }
  for (const rt of allRoutes) {
    const normalizedPath = rt.path.replace(/:[^/]+/g, ':param')
    let isCalled = false
    for (const called of calledRoutes) {
      if (called.includes(normalizedPath.replace('/api', ''))) { isCalled = true; break }
    }
    if (!isCalled) {
      console.log(`  UNCALLED: ${rt.method} ${rt.path} (${rt.file}:${rt.line})`)
      const taskId = `task:verify:uncalled_route_${slugify(rt.method + '_' + rt.path)}`
      const desc = `API route ${rt.method} ${rt.path} has no client caller — dead code or missing integration`
      queries.push(
        `MERGE (n:Moment {id: '${esc(taskId)}'}) SET n.name = '${esc(desc.slice(0, 120))}', n.type = 'task_run', n.subtype = 'task_run', n.status = 'pending', n.synthesis = '${esc(desc)}', n.severity = 'medium', n.issue_type = 'uncalled_route', n.weight = 0.5, n.energy = 0.4, n.friction = 0.3, n.stability = 0.5, n.created_at_s = ${now}, n.updated_at_s = ${now}`
      )
      const routeId = `thing:route:${slugify(rt.method + '_' + rt.path)}`
      queries.push(
        `MATCH (task:Moment {id: '${esc(taskId)}'}), (rt:Thing {id: '${esc(routeId)}'}) MERGE (task)-[r:link]->(rt) SET r.r_type = 'AFFECTS', r.hierarchy = -0.3, r.permanence = 0.4, r.trust = 0.7, r.friction = 0.3, r.weight = 0.5`
      )
      queries.push(
        `MATCH (task:Moment {id: '${esc(taskId)}'}), (org:Actor {id: 'org:ai_dev_dashboard'}) MERGE (task)-[r:link]->(org) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.6, r.permanence = 0.5, r.trust = 0.8, r.weight = 0.5`
      )
      issues.push({ type: 'uncalled_route', file: rt.file, severity: 'medium' })
    }
  }

  // 6. Detect incomplete doc chains and generate fix commands
  // A complete chain has: OBJECTIVES, PATTERNS, BEHAVIORS, ALGORITHM, VALIDATION, IMPLEMENTATION, HEALTH, SYNC
  const CHAIN_DOCS = ['OBJECTIVES', 'PATTERNS', 'BEHAVIORS', 'ALGORITHM', 'VALIDATION', 'IMPLEMENTATION', 'HEALTH', 'SYNC']
  const docChainDirs = new Set()
  for (const f of files) {
    if (f.ext !== '.md') continue
    for (const prefix of CHAIN_DOCS) {
      if (f.name.startsWith(prefix + '_') || f.name === prefix + '.md') {
        docChainDirs.add(dirname(f.relPath))
        break
      }
    }
  }

  const fixes = []
  for (const dir of docChainDirs) {
    // Find which chain docs exist in this directory
    const dirFiles = files.filter(f => dirname(f.relPath) === dir && f.ext === '.md')
    const existing = new Set()
    let moduleSuffix = ''
    for (const df of dirFiles) {
      for (const prefix of CHAIN_DOCS) {
        if (df.name.startsWith(prefix + '_')) {
          existing.add(prefix)
          if (!moduleSuffix) moduleSuffix = df.name.slice(prefix.length + 1, -3) // extract "Feedback" from "OBJECTIVES_Feedback.md"
        } else if (df.name === prefix + '.md') {
          existing.add(prefix)
        }
      }
    }

    if (existing.size === 0) continue // not a chain dir

    for (const needed of CHAIN_DOCS) {
      if (!existing.has(needed)) {
        const fileName = moduleSuffix ? `${needed}_${moduleSuffix}.md` : `${needed}.md`
        const filePath = join(dir, fileName)
        fixes.push({
          action: 'create_doc',
          path: filePath,
          chain_dir: dir,
          module: moduleSuffix,
          missing: needed,
          has: [...existing].join(', '),
        })
      }
    }

    // Check if IMPL target dir exists
    for (const df of dirFiles) {
      if (!df.name.startsWith('IMPLEMENTATION')) continue
      try {
        const content = await readFile(df.relPath, 'utf-8')
        const implMatch = content.match(/^IMPL:\s+(.+)$/m)
        if (implMatch) {
          const implPath = implMatch[1].trim()
          if (!implPath.includes('{')) {
            const implDir = dirname(implPath)
            if (implDir !== '.' && !dirs.find(d => d.relPath === implDir)) {
              fixes.push({
                action: 'create_dir',
                path: implDir,
                reason: `IMPL target directory missing (referenced by ${df.relPath})`,
              })
            }
          }
        }
      } catch (_) {}
    }
  }

  if (fixes.length > 0) {
    console.log(`\n--- ${fixes.length} FIX ACTIONS ---`)
    for (const fix of fixes) {
      if (fix.action === 'create_doc') {
        console.log(`  CREATE ${fix.path}  (chain has: ${fix.has} — missing: ${fix.missing})`)
      } else if (fix.action === 'create_dir') {
        console.log(`  MKDIR  ${fix.path}  (${fix.reason})`)
      }
    }

    // Auto-apply fixes if not dry-run
    if (!DRY_RUN) {
      const { mkdir, writeFile } = await import('fs/promises')
      let fixed = 0
      for (const fix of fixes) {
        try {
          if (fix.action === 'create_dir') {
            await mkdir(fix.path, { recursive: true })
            console.log(`  ✓ mkdir ${fix.path}`)
            fixed++
          } else if (fix.action === 'create_doc') {
            await mkdir(dirname(fix.path), { recursive: true })
            const header = `# ${fix.module || 'Module'} — ${fix.missing}: TODO\n\n\`\`\`\nSTATUS: DRAFT\nCREATED: ${new Date().toISOString().slice(0, 10)}\n\`\`\`\n\n---\n\n<!-- Generated by ingest.js — fill in from template -->\n`
            await writeFile(fix.path, header, { flag: 'wx' }) // wx = fail if exists
            console.log(`  ✓ created ${fix.path}`)
            fixed++

            // Also create a task for filling it in
            const taskId = `task:ingest:fill_${slugify(fix.path)}`
            const taskDesc = `Fill doc chain: ${fix.path} (${fix.missing} for ${fix.module || 'module'})`
            queries.push(
              `MERGE (n:Moment {id: '${esc(taskId)}'}) SET n.name = '${esc(taskDesc.slice(0, 120))}', n.type = 'task_run', n.subtype = 'task_run', n.status = 'pending', n.synthesis = '${esc(taskDesc)}', n.content = '${esc(taskDesc)}', n.severity = 'medium', n.issue_type = 'incomplete_chain', n.weight = 0.7, n.energy = 0.5, n.friction = 0.5, n.stability = 0.3, n.created_at_s = ${now}, n.updated_at_s = ${now}`
            )
            queries.push(
              `MATCH (task:Moment {id: '${esc(taskId)}'}), (org:Actor {id: 'org:ai_dev_dashboard'}) MERGE (task)-[r:link]->(org) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.6, r.permanence = 0.5, r.trust = 0.8, r.weight = 0.5`
            )
            issues.push({ type: 'incomplete_chain', file: fix.path, severity: 'medium' })
          }
        } catch (e) {
          if (e.code !== 'EEXIST') console.log(`  ✗ ${fix.path}: ${e.message}`)
        }
      }
      console.log(`Applied ${fixed}/${fixes.length} fixes`)
    }
  }

  // ==========================================================================
  // PHASE 2: PROPOSED FUNCTIONS → SKELETON CODE + GRAPH NODES
  // ==========================================================================
  // Scan doc chains for function references. If function node doesn't exist
  // in the graph (no code file defines it), create:
  //   1. A skeleton code file with function stub
  //   2. A graph node Thing(subtype=code_function) with status=proposed
  //   3. Links: BELONGS_TO file, IMPLEMENTS doc
  //   4. A task_run for the citizen to fill the implementation

  const { mkdir: mkdirP, writeFile: writeFileP } = await import('fs/promises')

  // Collect all existing function names from parsed code
  const existingFns = new Set()
  for (const f of files) {
    if (!['.js', '.jsx', '.py'].includes(f.ext)) continue
    if (f.relPath.startsWith('mind-repo/')) continue
    try {
      const content = await readFile(f.relPath, 'utf-8')
      const elements = parseCodeDeep(content, f.relPath)
      for (const fn of elements.functions) existingFns.add(fn.name)
    } catch (_) {}
  }

  // Scan docs for PROPOSED function references
  const proposedFns = []  // { name, targetFile, docFile, purpose }
  for (const f of files) {
    if (f.ext !== '.md') continue
    if (!f.name.startsWith('IMPLEMENTATION') && !f.name.startsWith('ALGORITHM')) continue
    try {
      const content = await readFile(f.relPath, 'utf-8')

      // Extract IMPL target
      const implMatch = content.match(/^IMPL:\s+(.+)$/m)
      const implFile = implMatch ? implMatch[1].trim() : null

      // Find function references: `functionName()`
      const fnRefs = [...content.matchAll(/`(\w+)\(\)`/g)]
      for (const m of fnRefs) {
        const fnName = m[1]
        if (existingFns.has(fnName)) continue
        if (['require', 'import', 'console', 'JSON', 'Math', 'Object', 'Array', 'Promise', 'Error', 'Date', 'Set', 'Map'].includes(fnName)) continue

        // Find purpose from surrounding context
        const idx = m.index
        const before = content.slice(Math.max(0, idx - 200), idx)
        const after = content.slice(idx, idx + 200)
        const purposeMatch = before.match(/\*\*Purpose:\*\*\s*(.+)/i) || after.match(/\*\*Purpose:\*\*\s*(.+)/i)
        const purpose = purposeMatch ? purposeMatch[1].trim() : after.split('\n')[0].replace(/`/g, '').trim()

        // Determine target file from IMPL or from flow steps
        let targetFile = implFile
        const fileMatch = after.match(/file:\s*(\S+\.(?:js|py))/) || before.match(/file:\s*(\S+\.(?:js|py))/)
        if (fileMatch) targetFile = fileMatch[1]
        // From table rows: | `path/to/file.js` |
        const tableMatch = before.match(/\|\s*`([^`]+\.(?:js|py))`\s*\|/)
        if (tableMatch) targetFile = tableMatch[1]

        if (targetFile && !targetFile.includes('{')) {
          proposedFns.push({ name: fnName, targetFile, docFile: f.relPath, purpose })
        }
      }
    } catch (_) {}
  }

  // Dedupe by function name + target file
  const seenProposed = new Set()
  const uniqueProposed = proposedFns.filter(p => {
    const key = `${p.name}@${p.targetFile}`
    if (seenProposed.has(key)) return false
    seenProposed.add(key)
    return true
  })

  if (uniqueProposed.length > 0) {
    console.log(`\n--- PHASE 2: ${uniqueProposed.length} PROPOSED FUNCTIONS ---`)

    // Group by target file
    const byFile = new Map()
    for (const p of uniqueProposed) {
      if (!byFile.has(p.targetFile)) byFile.set(p.targetFile, [])
      byFile.get(p.targetFile).push(p)
    }

    for (const [targetFile, fns] of byFile) {
      console.log(`  ${targetFile}: ${fns.map(f => f.name).join(', ')}`)

      // Create skeleton file if it doesn't exist
      if (!DRY_RUN && !fileSet.has(targetFile)) {
        const ext = extname(targetFile)
        const isJS = ['.js', '.jsx'].includes(ext)
        const isPy = ext === '.py'

        let skeleton = ''
        if (isJS) {
          skeleton = `// ${targetFile}\n// Auto-generated skeleton from doc chain\n// Fill implementations — each function has a task assigned\n\n`
          for (const fn of fns) {
            skeleton += `/**\n * ${fn.purpose}\n * @see ${fn.docFile}\n */\nexport function ${fn.name}() {\n  // TODO: implement — see doc chain\n  throw new Error('Not implemented: ${fn.name}')\n}\n\n`
          }
        } else if (isPy) {
          skeleton = `"""${targetFile}\nAuto-generated skeleton from doc chain.\nFill implementations — each function has a task assigned.\n"""\n\n`
          for (const fn of fns) {
            skeleton += `def ${fn.name}():\n    """${fn.purpose}\n    See: ${fn.docFile}\n    """\n    raise NotImplementedError("${fn.name}")\n\n\n`
          }
        }

        if (skeleton) {
          try {
            await mkdirP(dirname(targetFile), { recursive: true })
            await writeFileP(targetFile, skeleton, { flag: 'wx' })
            console.log(`    ✓ created ${targetFile}`)
          } catch (e) {
            if (e.code !== 'EEXIST') console.log(`    ✗ ${targetFile}: ${e.message}`)
          }
        }
      }

      // Create graph nodes for each proposed function
      const targetFileId = `thing:file:${slugify(targetFile)}`
      for (const fn of fns) {
        const fnId = `thing:fn:${slugify(targetFile)}:${slugify(fn.name)}`
        const docId = `thing:file:${slugify(fn.docFile)}`

        // Function node (proposed)
        queries.push(
          `MERGE (n:Thing {id: '${esc(fnId)}'}) SET n.name = '${esc(fn.name)}', n.subtype = 'code_function', n.status = 'proposed', n.purpose = '${esc(fn.purpose.slice(0, 200))}', n.weight = 0.6, n.energy = 0.5, n.stability = 0.3, n.source_file = '${esc(targetFile)}'`
        )
        // BELONGS_TO target file
        queries.push(
          `MERGE (file:Thing {id: '${esc(targetFileId)}'}) SET file.name = '${esc(targetFile)}', file.subtype = 'code_file', file.status = 'proposed'`
        )
        queries.push(
          `MATCH (fn:Thing {id: '${esc(fnId)}'}), (file:Thing {id: '${esc(targetFileId)}'}) MERGE (fn)-[r:link]->(file) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.5, r.permanence = 0.9, r.trust = 1.0, r.friction = 0.0, r.weight = 0.7`
        )
        // IMPLEMENTS doc
        queries.push(
          `MATCH (fn:Thing {id: '${esc(fnId)}'}), (doc:Thing {id: '${esc(docId)}'}) MERGE (fn)-[r:link]->(doc) SET r.r_type = 'IMPLEMENTS', r.hierarchy = -0.4, r.permanence = 0.8, r.trust = 0.8, r.friction = 0.1, r.weight = 0.7`
        )
        // Task to implement it
        const taskId = `task:implement:${slugify(fn.name + '_' + targetFile)}`
        const taskDesc = `Implement ${fn.name}() in ${targetFile} — ${fn.purpose.slice(0, 100)}`
        queries.push(
          `MERGE (n:Moment {id: '${esc(taskId)}'}) SET n.name = '${esc(taskDesc.slice(0, 120))}', n.type = 'task_run', n.subtype = 'task_run', n.status = 'pending', n.synthesis = '${esc(taskDesc)}', n.severity = 'high', n.issue_type = 'implement_function', n.weight = 0.8, n.energy = 0.7, n.friction = 0.5, n.stability = 0.3, n.created_at_s = ${now}, n.updated_at_s = ${now}`
        )
        // Task → function (AFFECTS)
        queries.push(
          `MATCH (task:Moment {id: '${esc(taskId)}'}), (fn:Thing {id: '${esc(fnId)}'}) MERGE (task)-[r:link]->(fn) SET r.r_type = 'AFFECTS', r.hierarchy = -0.3, r.permanence = 0.5, r.trust = 0.8, r.friction = 0.5, r.weight = 0.7`
        )
        // Task → doc (REFERENCES — so assigned citizen knows where to look)
        queries.push(
          `MATCH (task:Moment {id: '${esc(taskId)}'}), (doc:Thing {id: '${esc(docId)}'}) MERGE (task)-[r:link]->(doc) SET r.r_type = 'REFERENCES', r.hierarchy = -0.2, r.permanence = 0.7, r.trust = 0.9, r.friction = 0.05, r.weight = 0.6`
        )
        // Task → org (for auto-assignment)
        queries.push(
          `MATCH (task:Moment {id: '${esc(taskId)}'}), (org:Actor {id: 'org:ai_dev_dashboard'}) MERGE (task)-[r:link]->(org) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.6, r.permanence = 0.5, r.trust = 0.8, r.weight = 0.5`
        )
      }
    }
  }

  // ==========================================================================
  // PHASE 3: GRAPH → DOCS SYNC (detect nodes without doc coverage)
  // ==========================================================================
  // For each code_function node in the graph, check if any doc chain file
  // references it. If not → create a "doc_sync" task.
  // The citizen will use the L2 Grammar to convert the code into doc text.

  const docCoveredFns = new Set()
  for (const f of files) {
    if (f.ext !== '.md') continue
    try {
      const content = await readFile(f.relPath, 'utf-8')
      const refs = [...content.matchAll(/`(\w+)\(\)`/g)]
      for (const r of refs) docCoveredFns.add(r[1])
    } catch (_) {}
  }

  // Find code functions that exist but have no doc mention
  const undocFns = []
  for (const f of files) {
    if (!['.js', '.jsx'].includes(f.ext)) continue
    if (f.relPath.startsWith('mind-repo/')) continue
    try {
      const content = await readFile(f.relPath, 'utf-8')
      const elements = parseCodeDeep(content, f.relPath)
      for (const fn of elements.functions) {
        if (fn.name.length < 3) continue // skip tiny names
        if (fn.name === 'App' || fn.name === 'default') continue
        if (!docCoveredFns.has(fn.name)) {
          undocFns.push({ name: fn.name, file: f.relPath, line: fn.line })
        }
      }
    } catch (_) {}
  }

  if (undocFns.length > 0) {
    console.log(`\n--- PHASE 3: ${undocFns.length} UNDOCUMENTED FUNCTIONS (graph → docs sync) ---`)
    for (const fn of undocFns) {
      console.log(`  ${fn.name}() in ${fn.file}:${fn.line}`)

      // Determine which doc chain should cover this function
      // Heuristic: find the closest IMPLEMENTATION doc by directory
      let targetDoc = null
      const fnDir = dirname(fn.file)
      for (const df of files) {
        if (!df.name.startsWith('IMPLEMENTATION') || df.ext !== '.md') continue
        try {
          const content = await readFile(df.relPath, 'utf-8')
          const implMatch = content.match(/^IMPL:\s+(.+)$/m)
          if (implMatch) {
            const implPath = implMatch[1].trim()
            // Check if the IMPL path matches or is close to the function's file
            if (fn.file === implPath || dirname(fn.file) === dirname(implPath)) {
              targetDoc = df.relPath
              break
            }
          }
        } catch (_) {}
      }
      // Fallback: closest doc chain dir
      if (!targetDoc) {
        for (const df of files) {
          if (!df.name.startsWith('IMPLEMENTATION') || df.ext !== '.md') continue
          targetDoc = df.relPath
          break
        }
      }

      if (targetDoc) {
        const taskId = `task:doc_sync:${slugify(fn.name + '_' + fn.file)}`
        const taskDesc = `Document ${fn.name}() from ${fn.file} → add to ${targetDoc}. Use L2 Grammar: code → graph node → doc text.`
        const fnId = `thing:fn:${slugify(fn.file)}:${slugify(fn.name)}`
        const docId = `thing:file:${slugify(targetDoc)}`

        queries.push(
          `MERGE (n:Moment {id: '${esc(taskId)}'}) SET n.name = '${esc(taskDesc.slice(0, 120))}', n.type = 'task_run', n.subtype = 'task_run', n.status = 'pending', n.synthesis = '${esc(taskDesc)}', n.severity = 'medium', n.issue_type = 'doc_sync', n.weight = 0.6, n.energy = 0.5, n.friction = 0.4, n.stability = 0.3, n.created_at_s = ${now}, n.updated_at_s = ${now}`
        )
        // Task → function it needs to document
        queries.push(
          `MATCH (task:Moment {id: '${esc(taskId)}'}), (fn:Thing {id: '${esc(fnId)}'}) MERGE (task)-[r:link]->(fn) SET r.r_type = 'AFFECTS', r.hierarchy = -0.3, r.permanence = 0.5, r.trust = 0.8, r.friction = 0.4, r.weight = 0.6`
        )
        // Task → target doc
        queries.push(
          `MATCH (task:Moment {id: '${esc(taskId)}'}), (doc:Thing {id: '${esc(docId)}'}) MERGE (task)-[r:link]->(doc) SET r.r_type = 'REFERENCES', r.hierarchy = -0.2, r.permanence = 0.7, r.trust = 0.9, r.friction = 0.05, r.weight = 0.6`
        )
        // Task → org
        queries.push(
          `MATCH (task:Moment {id: '${esc(taskId)}'}), (org:Actor {id: 'org:ai_dev_dashboard'}) MERGE (task)-[r:link]->(org) SET r.r_type = 'BELONGS_TO', r.hierarchy = -0.6, r.permanence = 0.5, r.trust = 0.8, r.weight = 0.5`
        )
      }
    }
  }

  console.log(`\nDependencies: ${depCount} local, ${externalDeps.size} external packages`)
  console.log(`IMPL pointers: ${implCount} resolved`)
  console.log(`Health issues: ${issues.length} (${issues.filter(i => i.severity === 'high').length} high, ${issues.filter(i => i.severity === 'medium').length} medium, ${issues.filter(i => i.severity === 'low').length} low)`)

  console.log(`Generated ${queries.length} queries (${depCount} dependency links)`)

  if (DRY_RUN) {
    console.log('\n--- DRY RUN — first 20 queries ---')
    for (const q of queries.slice(0, 20)) console.log(q)
    console.log(`... and ${queries.length - 20} more`)
    return
  }

  // Execute against FalkorDB
  const redis = createClient({ url: `redis://${process.env.FALKORDB_HOST || 'localhost'}:${process.env.FALKORDB_PORT || 6379}` })
  await redis.connect()

  let ok = 0, err = 0
  for (const q of queries) {
    try {
      await redis.sendCommand(['GRAPH.QUERY', GRAPH, q])
      ok++
    } catch (e) {
      err++
      if (err <= 5) console.error(`FAIL: ${q.slice(0, 120)}...  →  ${e.message}`)
    }
    // Progress
    if ((ok + err) % 100 === 0) process.stdout.write(`\r${ok + err}/${queries.length}`)
  }

  // Final count
  const countRes = await redis.sendCommand(['GRAPH.QUERY', GRAPH, 'MATCH (n) RETURN labels(n)[0] AS type, count(n) AS cnt'])
  console.log(`\n\nDone: ${ok} ok, ${err} errors`)
  console.log('Node counts:', countRes?.[1])

  await redis.quit()
}

main().catch(e => { console.error(e); process.exit(1) })
