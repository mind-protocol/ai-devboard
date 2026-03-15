import express from 'express'
import { createClient } from 'redis'
import { runL2Tick } from './src/server/l2-tick.js'
import { getCitizenState } from './src/server/citizen-state.js'
import { scoreBehaviors, applyEmotionalBias } from './src/server/behavior-scorer.js'

const app = express()
app.use(express.json())

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
          `MATCH (n) WHERE n.energy > 0.005 RETURN labels(n)[0] AS type, n.id AS id, n.name AS name, n.subtype AS subtype, n.energy AS energy, n.weight AS weight, n.synthesis AS synthesis, n.content AS content ORDER BY n.energy DESC LIMIT 20`])
        const nodes = (raw?.[1] || []).map(row => ({
          type: row[0], id: row[1], name: row[2] || row[1], subtype: row[3] || '',
          energy: parseFloat(row[4]) || 0, weight: parseFloat(row[5]) || 0,
          synthesis: row[6] || '', content: row[7] || '',
        }))
        if (nodes.length > 0) {
          // Get total node count
          const countRaw = await redis.sendCommand(['GRAPH.QUERY', brain, 'MATCH (n) RETURN count(n)'])
          const totalNodes = countRaw?.[1]?.[0]?.[0] || 0

          // Get type distribution
          const typeRaw = await redis.sendCommand(['GRAPH.QUERY', brain,
            `MATCH (n) WHERE n.energy > 0.005 RETURN labels(n)[0], count(n) AS cnt ORDER BY cnt DESC`])
          const types = (typeRaw?.[1] || []).map(r => ({ type: r[0], count: r[1] }))

          brains.push({ handle, brain, totalNodes, activeNodes: nodes.length, types, nodes })
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

const PORT = process.env.API_PORT || 3001
app.listen(PORT, () => console.log(`API on :${PORT}`))
