import express from 'express'
import { createClient } from 'redis'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { runL2Tick } from './src/server/l2-tick.js'
import { getCitizenState } from './src/server/citizen-state.js'
import { scoreBehaviors, applyEmotionalBias } from './src/server/behavior-scorer.js'

const app = express()
app.use(express.json())

// --- Auto-tick state ---
let autoTickInterval = null
let autoTickRate = 0

const redis = createClient({ url: `redis://${process.env.FALKORDB_HOST || 'localhost'}:${process.env.FALKORDB_PORT || 6379}` })
await redis.connect()

// --- SSE Stream ---
// Map<graphName, Set<Response>>
const sseClients = new Map()
let eventCounter = 0

function sseEmit(graph, event, data) {
  const clients = sseClients.get(graph)
  if (!clients || clients.size === 0) return
  eventCounter++
  const payload = `id: ${eventCounter}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) {
    res.write(payload)
  }
}

app.get('/api/stream/:graph', (req, res) => {
  const { graph } = req.params
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.write(`data: ${JSON.stringify({ connected: true, graph })}\n\n`)

  if (!sseClients.has(graph)) sseClients.set(graph, new Set())
  sseClients.get(graph).add(res)

  // Heartbeat every 15s to keep connection alive
  const hb = setInterval(() => res.write(': heartbeat\n\n'), 15000)

  req.on('close', () => {
    clearInterval(hb)
    sseClients.get(graph)?.delete(res)
  })
})

// List all graphs
app.get('/api/graphs', async (req, res) => {
  try {
    const result = await redis.sendCommand(['GRAPH.LIST'])
    res.json(result || [])
  } catch (e) { res.json(['venezia', 'lumina_prime', 'org_ai_dev_dashboard']) }
})

// Run a Cypher query and return nodes + links
app.post('/api/query', async (req, res) => {
  const { graph, query } = req.body
  if (!graph || !query) return res.json({ error: 'Missing graph or query' })

  try {
    const raw = await redis.sendCommand(['GRAPH.QUERY', graph, query])
    const parsed = parseGraphResult(raw)
    res.json(parsed)
  } catch (e) {
    res.json({ error: e.message, nodes: [], links: [] })
  }
})

// Run a physics tick — apply decay + propagation, emit delta via SSE
app.post('/api/tick', async (req, res) => {
  const { graph } = req.body
  if (!graph) return res.json({ error: 'Missing graph' })

  try {
    const DECAY_RATE = 0.02

    // Snapshot energy before tick (for delta detection)
    let energyBefore = new Map()
    try {
      const snap = await redis.sendCommand(['GRAPH.QUERY', graph,
        `MATCH (n) WHERE n.energy IS NOT NULL RETURN n.id, n.energy`])
      for (const row of (snap?.[1] || [])) {
        if (Array.isArray(row) && row.length >= 2) energyBefore.set(row[0], row[1])
      }
    } catch (_) { /* snapshot is best-effort */ }

    // Decay energy on all nodes
    const decayed = await redis.sendCommand(['GRAPH.QUERY', graph,
      `MATCH (n) WHERE n.energy > 0 SET n.energy = n.energy * ${1 - DECAY_RATE} RETURN count(n)`])
    const decayCount = decayed?.[1]?.[0]?.[0] || 0

    // Propagation: nodes with energy > threshold push surplus to neighbors
    const propagated = await redis.sendCommand(['GRAPH.QUERY', graph,
      `MATCH (a)-[r]->(b) WHERE a.energy > 0.3 AND r.weight > 0
       SET b.energy = b.energy + (a.energy - 0.3) * r.weight * 0.1,
           a.energy = a.energy * 0.9
       RETURN count(r)`])
    const propCount = propagated?.[1]?.[0]?.[0] || 0

    // Recency decay
    await redis.sendCommand(['GRAPH.QUERY', graph,
      `MATCH (n) WHERE n.recency > 0 SET n.recency = n.recency * 0.99`])

    // Collect post-tick state and compute deltas
    const tickResult = { decayed: decayCount, propagated: propCount }

    if (sseClients.has(graph) && sseClients.get(graph).size > 0) {
      try {
        const raw = await redis.sendCommand(['GRAPH.QUERY', graph,
          `MATCH (n)-[r]->(m) RETURN n, r, m`])
        const fullGraph = parseGraphResult(raw)

        // Compute energy deltas
        const deltas = []
        for (const node of fullGraph.nodes) {
          const before = energyBefore.get(node.name) ?? energyBefore.get(node.id)
          if (before !== undefined && node.energy !== undefined) {
            const delta = node.energy - before
            if (Math.abs(delta) > 0.001) {
              deltas.push({ id: node.id, name: node.name, delta: +delta.toFixed(4), energy: +node.energy.toFixed(4) })
            }
          }
        }

        sseEmit(graph, 'tick', {
          ...tickResult,
          nodes: fullGraph.nodes,
          links: fullGraph.links,
          deltas,
        })
      } catch (_) {
        // SSE emission is best-effort — tick still succeeds
        sseEmit(graph, 'tick', tickResult)
      }
    }

    res.json(tickResult)
  } catch (e) {
    res.json({ error: e.message, decayed: 0, propagated: 0 })
  }
})

// List all nodes in a graph (returns raw properties, not parsed through parseGraphResult)
app.get('/api/nodes/:graph', async (req, res) => {
  const { graph } = req.params
  const limit = Math.min(parseInt(req.query.limit) || 500, 5000)
  const since = parseInt(req.query.since) || 0 // epoch seconds — filter by updated_at_s or created_at_s
  try {
    const whereClause = since > 0
      ? `WHERE (n.updated_at_s IS NOT NULL AND n.updated_at_s >= ${since}) OR (n.created_at_s IS NOT NULL AND n.created_at_s >= ${since})`
      : ''
    const raw = await redis.sendCommand(['GRAPH.QUERY', graph,
      `MATCH (n) ${whereClause} RETURN labels(n)[0] AS type, n.id AS id, n.name AS name, n.subtype AS subtype, n.energy AS energy, n.weight AS weight, n.status AS status, n.synthesis AS synthesis, n.origin_citizen AS origin, n.source_file AS source, n.created_at_s AS created, n.updated_at_s AS updated, n.stability AS stability, n.friction AS friction, n.content AS content ORDER BY n.energy DESC LIMIT ${limit}`])
    const rows = (raw?.[1] || []).map(row => ({
      type: row[0], id: row[1], name: row[2] || row[1],
      subtype: row[3] || '', energy: parseFloat(row[4]) || 0, weight: parseFloat(row[5]) || 0,
      status: row[6] || '', synthesis: row[7] || '', origin: row[8] || '',
      source: row[9] || '', created: row[10] || null, updated: row[11] || null,
      stability: parseFloat(row[12]) || 0, friction: parseFloat(row[13]) || 0,
      content: row[14] || '',
      label: row[0],
    }))
    res.json(rows)
  } catch (e) { res.json([]) }
})

// L1 Brains — subconscious state of all citizens
app.get('/api/brains', async (req, res) => {
  try {
    // List all brain_* graphs
    const allGraphs = await redis.sendCommand(['GRAPH.LIST'])
    const brainGraphs = (allGraphs || []).filter(g => g.startsWith('brain_'))

    const brains = []
    for (const brain of brainGraphs) {
      const handle = brain.replace('brain_', '')
      try {
        // Get active nodes sorted by energy
        const raw = await redis.sendCommand(['GRAPH.QUERY', brain,
          `MATCH (n) WHERE n.energy > 0.005 RETURN labels(n)[0] AS type, n.id AS id, n.name AS name, n.subtype AS subtype, n.energy AS energy, n.weight AS weight, n.synthesis AS synthesis, n.content AS content, n.stability AS stability, n.recency AS recency, n.goal_relevance AS goal_rel, n.novelty_affinity AS novelty, n.updated_at_s AS updated, n.created_at_s AS created, n.self_relevance AS self_rel, n.partner_relevance AS partner_rel, n.care_affinity AS care, n.achievement_affinity AS achievement, n.risk_affinity AS risk, n.activation_count AS activations, n.last_activated_s AS last_active, n.node_type AS nodeType ORDER BY n.energy DESC LIMIT 30`])
        const nodes = (raw?.[1] || []).map(row => ({
          type: row[0], id: row[1], name: row[2] || row[1], subtype: row[3] || '',
          energy: parseFloat(row[4]) || 0, weight: parseFloat(row[5]) || 0,
          synthesis: row[6] || '', content: row[7] || '',
          stability: parseFloat(row[8]) || 0, recency: parseFloat(row[9]) || 0,
          goalRelevance: parseFloat(row[10]) || 0, novelty: parseFloat(row[11]) || 0,
          updated: parseInt(row[12]) || null, created: parseInt(row[13]) || null,
          selfRelevance: parseFloat(row[14]) || 0, partnerRelevance: parseFloat(row[15]) || 0,
          care: parseFloat(row[16]) || 0, achievement: parseFloat(row[17]) || 0,
          risk: parseFloat(row[18]) || 0, activations: parseInt(row[19]) || 0,
          lastActive: parseInt(row[20]) || null, nodeType: row[21] || '',
        }))
        if (nodes.length > 0) {
          // Get total node count
          const countRaw = await redis.sendCommand(['GRAPH.QUERY', brain, 'MATCH (n) RETURN count(n)'])
          const totalNodes = countRaw?.[1]?.[0]?.[0] || 0

          // Get type distribution
          const typeRaw = await redis.sendCommand(['GRAPH.QUERY', brain,
            `MATCH (n) WHERE n.energy > 0.005 RETURN labels(n)[0], count(n) AS cnt ORDER BY cnt DESC`])
          const types = (typeRaw?.[1] || []).map(r => ({ type: r[0], count: r[1] }))

          // Get current place and task from L2 graphs
          let place = null
          let task = null
          for (const g of ['org_ai_dev_dashboard', 'venezia', 'lumina_prime']) {
            try {
              if (!place) {
                const placeRaw = await redis.sendCommand(['GRAPH.QUERY', g,
                  `MATCH (a:Actor)-[r:link]->(s:Space) WHERE a.id = 'citizen:${handle}' AND r.r_type = 'AT' RETURN s.name LIMIT 1`])
                if (placeRaw?.[1]?.[0]) place = placeRaw[1][0][0]
              }
              if (!task) {
                const taskRaw = await redis.sendCommand(['GRAPH.QUERY', g,
                  `MATCH (m:Moment)-[r:link]->(a:Actor) WHERE a.id = 'citizen:${handle}' AND m.type = 'task_run' AND m.status IN ['running','claimed'] RETURN m.name, m.status LIMIT 1`])
                if (taskRaw?.[1]?.[0]) task = { name: taskRaw[1][0][0], status: taskRaw[1][0][1] }
              }
            } catch (_) {}
          }

          brains.push({ handle, brain, totalNodes, activeNodes: nodes.length, types, nodes, place, task })
        }
      } catch (_) {}
    }

    // Sort by number of active nodes
    brains.sort((a, b) => b.activeNodes - a.activeNodes)
    res.json(brains)
  } catch (e) { res.json({ error: e.message }) }
})

// Full citizen dashboard — L1 + L2 state, tasks, messages, active nodes
app.get('/api/dashboard/:graph', async (req, res) => {
  const { graph } = req.params
  try {
    const citizenRes = await redis.sendCommand(['GRAPH.QUERY', graph,
      `MATCH (a:Actor) WHERE a.subtype = 'citizen' RETURN a.id, a.name, a.role, a.energy, a.weight, a.updated_at_s ORDER BY a.energy DESC`])
    const now = Math.floor(Date.now() / 1000)
    const citizens = []

    for (const row of (citizenRes?.[1] || [])) {
      const [id, name, role, energy, weight, updated] = row
      const handle = id?.replace('citizen:', '')
      const brain = `brain_${handle}`
      const c = { handle, name, role, energy: parseFloat(energy) || 0, weight: parseFloat(weight) || 0, lastActive: null, task: null, lastMsg: null, l2Active: [], l1Active: [] }

      // Last active
      try {
        const msgRes = await redis.sendCommand(['GRAPH.QUERY', graph,
          `MATCH (a:Actor {id: '${id}'})-[r:link]->(m:Moment) WHERE r.r_type = 'CREATED' RETURN m.created_at_s ORDER BY m.created_at_s DESC LIMIT 1`])
        const ts = msgRes?.[1]?.[0]?.[0]
        if (ts) c.lastActive = parseInt(ts)
      } catch (_) {}
      if (!c.lastActive && updated) c.lastActive = parseInt(updated)

      // Current task
      try {
        const taskRes = await redis.sendCommand(['GRAPH.QUERY', graph,
          `MATCH (m:Moment)-[r:link]->(a:Actor {id: '${id}'}) WHERE m.type = 'task_run' AND m.status IN ['running','claimed'] RETURN m.name, m.status, m.energy LIMIT 1`])
        const t = taskRes?.[1]?.[0]
        if (t) c.task = { name: t[0], status: t[1], energy: parseFloat(t[2]) || 0 }
      } catch (_) {}

      // Last message
      try {
        const msgRes = await redis.sendCommand(['GRAPH.QUERY', graph,
          `MATCH (a:Actor {id: '${id}'})-[r:link]->(m:Moment) WHERE r.r_type = 'CREATED' AND m.type = 'message' RETURN m.name, m.created_at_s ORDER BY m.created_at_s DESC LIMIT 1`])
        const m = msgRes?.[1]?.[0]
        if (m) c.lastMsg = { text: m[0], at: parseInt(m[1]) || 0 }
      } catch (_) {}

      // L2 active nodes
      try {
        const l2Res = await redis.sendCommand(['GRAPH.QUERY', graph,
          `MATCH (a:Actor {id: '${id}'})-[r:link]-(n) WHERE n.energy > 0.01 RETURN labels(n)[0], n.name, n.energy, n.subtype ORDER BY n.energy DESC LIMIT 5`])
        c.l2Active = (l2Res?.[1] || []).map(n => ({ type: n[0], name: n[1], energy: parseFloat(n[2]) || 0, subtype: n[3] || '' }))
      } catch (_) {}

      // L1 brain nodes
      try {
        const l1Res = await redis.sendCommand(['GRAPH.QUERY', brain,
          `MATCH (n) WHERE n.energy > 0.01 RETURN labels(n)[0], n.subtype, n.name, n.energy ORDER BY n.energy DESC LIMIT 5`])
        c.l1Active = (l1Res?.[1] || []).map(n => ({ type: n[0], subtype: n[1] || '', name: n[2], energy: parseFloat(n[3]) || 0 }))
      } catch (_) {}

      citizens.push(c)
    }
    res.json(citizens)
  } catch (e) { res.json({ error: e.message }) }
})

// Citizen status — current state of all citizens
app.get('/api/citizens/:graph', async (req, res) => {
  const { graph } = req.params
  try {
    // Get all citizen IDs
    const idRes = await redis.sendCommand(['GRAPH.QUERY', graph,
      `MATCH (a:Actor) WHERE NOT a.id STARTS WITH 'org:' RETURN a.id, a.name`])
    const citizens = []
    for (const row of (idRes?.[1] || [])) {
      const [id, name] = row
      try {
        const state = await getCitizenState(redis, graph, id)
        let scores = scoreBehaviors(state)
        scores = applyEmotionalBias(scores, state.recentMoments || [])
        const topBehaviors = Object.entries(scores).sort(([,a],[,b]) => b - a).slice(0, 3)
        citizens.push({
          id, name: name || id,
          drives: state.drives,
          arousal: state.arousal,
          flow: state.flow,
          isAwake: state.isAwake,
          currentTask: state.currentTask?.name || null,
          topDesire: state.desires?.[0]?.name || null,
          location: state.location?.name || null,
          topBehaviors: topBehaviors.map(([k, v]) => ({ cluster: k, score: +v.toFixed(3) })),
        })
      } catch (_) { citizens.push({ id, name: name || id, error: 'state read failed' }) }
    }
    res.json(citizens)
  } catch (e) { res.json({ error: e.message }) }
})

// Tick history for monitoring
let lastTickResult = null
const tickHistory = []  // last 100 ticks
const MAX_HISTORY = 100

// GET /api/monitor/:graph — full dashboard: last tick + citizen states + stats
app.get('/api/monitor/:graph', async (req, res) => {
  const { graph } = req.params
  try {
    // Node/link counts
    const countRes = await redis.sendCommand(['GRAPH.QUERY', graph,
      `MATCH (n) RETURN labels(n)[0] AS type, count(n) AS cnt`])
    const linkRes = await redis.sendCommand(['GRAPH.QUERY', graph,
      `MATCH ()-[r:link]->() RETURN r.r_type, count(r) AS cnt ORDER BY cnt DESC`])
    const taskRes = await redis.sendCommand(['GRAPH.QUERY', graph,
      `MATCH (n:Moment) WHERE n.type = 'task_run' RETURN n.status, count(n) AS cnt`])

    res.json({
      lastTick: lastTickResult,
      tickCount: tickHistory.length,
      avgDuration: tickHistory.length > 0
        ? Math.round(tickHistory.reduce((s, t) => s + t.duration_ms, 0) / tickHistory.length)
        : 0,
      nodeCounts: (countRes?.[1] || []).map(r => ({ type: r[0], count: r[1] })),
      linkCounts: (linkRes?.[1] || []).slice(0, 10).map(r => ({ type: r[0] || '(legacy)', count: r[1] })),
      taskCounts: (taskRes?.[1] || []).map(r => ({ status: r[0], count: r[1] })),
    })
  } catch (e) { res.json({ error: e.message }) }
})

// GET /api/trace/:graph — last N tick traces for debugging
app.get('/api/trace/:graph', (req, res) => {
  const n = Math.min(parseInt(req.query.n) || 10, MAX_HISTORY)
  res.json(tickHistory.slice(-n))
})

// Run the full L2 tick cycle (19 steps + citizen behavior selection)
app.post('/api/l2tick', async (req, res) => {
  const { graph } = req.body
  if (!graph) return res.json({ error: 'Missing graph' })

  try {
    const result = await runL2Tick(redis, graph)
    lastTickResult = { ...result, timestamp: Date.now(), graph }
    tickHistory.push(lastTickResult)
    if (tickHistory.length > MAX_HISTORY) tickHistory.shift()

    // Emit via SSE if clients connected
    if (sseClients.has(graph) && sseClients.get(graph).size > 0) {
      try {
        const raw = await redis.sendCommand(['GRAPH.QUERY', graph,
          `MATCH (n)-[r]->(m) RETURN n, r, m`])
        const fullGraph = parseGraphResult(raw)
        sseEmit(graph, 'tick', { ...result, nodes: fullGraph.nodes, links: fullGraph.links })
      } catch (_) {
        sseEmit(graph, 'tick', result)
      }
    }

    res.json(result)
  } catch (e) {
    res.json({ error: e.message })
  }
})

// Auto-tick: run L2 tick on a repeating interval
// rate: 0=stop, 1=5s, 2=2.5s, 3=1.7s
app.post('/api/autotick', (req, res) => {
  const { graph, rate } = req.body
  if (autoTickInterval) { clearInterval(autoTickInterval); autoTickInterval = null }
  autoTickRate = rate || 0
  if (autoTickRate > 0 && graph) {
    const ms = 5000 / autoTickRate
    autoTickInterval = setInterval(async () => {
      try {
        const result = await runL2Tick(redis, graph)
        // SSE emit
        if (sseClients.has(graph) && sseClients.get(graph).size > 0) {
          sseEmit(graph, 'tick', result)
        }
        lastTickResult = { ...result, timestamp: Date.now(), graph }
        tickHistory.push(lastTickResult)
        if (tickHistory.length > MAX_HISTORY) tickHistory.shift()
      } catch (_) {}
    }, ms)
  }
  res.json({ autoTick: autoTickRate > 0, rate: autoTickRate, interval: autoTickRate > 0 ? 5000 / autoTickRate : 0 })
})

// Auto-tick status
app.get('/api/autotick/status', (req, res) => {
  res.json({ running: autoTickRate > 0, rate: autoTickRate, tickCount: tickHistory.length })
})

function parseGraphResult(raw) {
  const nodes = new Map()
  const links = []

  if (!raw || !Array.isArray(raw)) return { nodes: [], links: [] }

  // FalkorDB returns: [header, [rows...], stats]
  const rows = raw[1] || []

  // Helper: convert [[key, value], ...] array to object
  function pairsToObj(pairs) {
    if (!Array.isArray(pairs)) return pairs
    const obj = {}
    for (const pair of pairs) {
      if (Array.isArray(pair) && pair.length === 2) {
        const [k, v] = pair
        // Recursively convert nested pairs (like properties)
        obj[k] = Array.isArray(v) && v.length > 0 && Array.isArray(v[0]) && v[0].length === 2
          ? pairsToObj(v)
          : v
      }
    }
    return obj
  }

  for (const row of rows) {
    if (!Array.isArray(row)) continue
    for (const cell of row) {
      if (!cell || !Array.isArray(cell)) continue

      const obj = pairsToObj(cell)

      // Node: has id + labels + properties
      if (obj.id !== undefined && obj.labels !== undefined) {
        const props = obj.properties || {}
        const label = Array.isArray(obj.labels) ? obj.labels[0] : obj.labels
        nodes.set(obj.id, {
          id: props.id || `node_${obj.id}`,
          graphId: obj.id,
          label: label || '?',
          name: props.name || props.id || `node_${obj.id}`,
          weight: parseFloat(props.weight) || 0,
          energy: parseFloat(props.energy) || 0,
          subtype: props.subtype || props.type || '',
        })
      }

      // Edge: has id + type + src_node + dest_node + properties
      if (obj.src_node !== undefined && obj.dest_node !== undefined) {
        const props = obj.properties || {}
        links.push({
          source: obj.src_node,
          target: obj.dest_node,
          type: props.r_type || props.type || obj.type || '',
          weight: parseFloat(props.weight) || 0.5,
          trust: parseFloat(props.trust) || 0,
        })
      }
    }
  }

  // Remap link source/target from graphId to node id
  const idMap = new Map()
  for (const [graphId, node] of nodes) { idMap.set(graphId, node.id) }
  const remappedLinks = links.map(l => ({
    ...l,
    source: idMap.get(l.source) || l.source,
    target: idMap.get(l.target) || l.target,
  })).filter(l => typeof l.source === 'string' && typeof l.target === 'string')

  return { nodes: [...nodes.values()], links: remappedLinks }
}

// --- Citizen message dispatch (HTTP version of dispatch.js) ---

const MSG_GRAPH = 'org_ai_dev_dashboard'
const CITIZEN_DIRS = [
  '/home/mind-protocol/mind-mcp/citizens',
  '/home/mind-protocol/ai_devboard/mind-repo/citizens',
  '/home/mind-protocol/cities-of-light/citizens',
]

function findCitizenDir(handle) {
  for (const base of CITIZEN_DIRS) {
    const dir = resolve(base, handle)
    if (existsSync(dir)) return dir
  }
  return null
}

function escGraph(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
}

app.post('/api/message', async (req, res) => {
  const { target, message, sender } = req.body
  if (!target || !message) return res.status(400).json({ error: 'Missing target or message' })

  const handle = target.replace(/^@/, '')
  const from = (sender || 'nervo').replace(/^@/, '')
  const now = Math.floor(Date.now() / 1000)
  const momentId = `moment:msg:${from}_to_${handle}_${now}`

  // 1. Create Moment in L2 graph with CREATED + TARGETS links
  try {
    await redis.sendCommand(['GRAPH.QUERY', MSG_GRAPH,
      `MERGE (m:Moment {id: '${escGraph(momentId)}'}) SET m.name = '${escGraph(message.slice(0, 120))}', m.type = 'message', m.subtype = 'dialogue', m.content = '${escGraph(message)}', m.energy = 0.7, m.weight = 0.6, m.stability = 0.5, m.origin_citizen = '${from}', m.target_citizen = '${handle}', m.status = 'pending', m.created_at_s = ${now}, m.updated_at_s = ${now}`
    ])
    await redis.sendCommand(['GRAPH.QUERY', MSG_GRAPH,
      `MATCH (m:Moment {id: '${escGraph(momentId)}'}), (a:Actor {id: 'citizen:${from}'}) MERGE (a)-[r:link]->(m) SET r.r_type = 'CREATED', r.trust = 0.9, r.weight = 0.8`
    ])
    await redis.sendCommand(['GRAPH.QUERY', MSG_GRAPH,
      `MATCH (m:Moment {id: '${escGraph(momentId)}'}), (a:Actor {id: 'citizen:${handle}'}) MERGE (m)-[r:link]->(a) SET r.r_type = 'TARGETS', r.trust = 0.8, r.weight = 0.7, r.energy = 0.7`
    ])
  } catch (e) {
    console.error(`[/api/message] graph write failed:`, e.message)
    // Continue anyway — dispatch still works without graph provenance
  }

  // 2. Find citizen dir
  const citizenDir = findCitizenDir(handle)
  if (!citizenDir) {
    return res.status(404).json({ error: `No citizen folder found for @${handle}` })
  }

  // 3. Return immediately
  res.json({ status: 'queued', target: `@${handle}`, message: message.slice(0, 80) })

  // 4. Spawn claude --print in background
  console.log(`[/api/message] ${from} → @${handle}: ${message.slice(0, 80)}`)

  const child = spawn('sh', ['-c',
    `echo '${message.replace(/'/g, "'\\''")}' | claude --print --continue --dangerously-skip-permissions`
  ], {
    cwd: citizenDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 600000,
  })

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', d => { stdout += d.toString() })
  child.stderr.on('data', d => { stderr += d.toString() })

  child.on('close', async (code) => {
    const response = stdout.trim()
    if (!response) {
      console.log(`[/api/message] @${handle} — no response (exit ${code})${stderr ? ' stderr: ' + stderr.slice(0, 200) : ''}`)
      return
    }

    console.log(`[/api/message] @${handle} responds (${response.length} chars)`)

    // 5. Store response as Moment in L2
    const respId = `moment:msg:${handle}_to_${from}_${now}`
    try {
      await redis.sendCommand(['GRAPH.QUERY', MSG_GRAPH,
        `MERGE (m:Moment {id: '${escGraph(respId)}'}) SET m.name = '${escGraph(response.slice(0, 120))}', m.type = 'message', m.subtype = 'dialogue', m.content = '${escGraph(response.slice(0, 2000))}', m.energy = 0.6, m.weight = 0.6, m.origin_citizen = '${handle}', m.target_citizen = '${from}', m.status = 'delivered', m.created_at_s = ${now + 1}, m.updated_at_s = ${now + 1}`
      ])
      await redis.sendCommand(['GRAPH.QUERY', MSG_GRAPH,
        `MATCH (m:Moment {id: '${escGraph(respId)}'}), (a:Actor {id: 'citizen:${handle}'}) MERGE (a)-[r:link]->(m) SET r.r_type = 'CREATED', r.trust = 0.9, r.weight = 0.8`
      ])
      await redis.sendCommand(['GRAPH.QUERY', MSG_GRAPH,
        `MATCH (m:Moment {id: '${escGraph(momentId)}'}) SET m.status = 'delivered'`
      ])
    } catch (e) {
      console.error(`[/api/message] response graph write failed:`, e.message)
    }
  })
})

const PORT = process.env.API_PORT || 3001
app.listen(PORT, () => console.log(`API on :${PORT}`))
