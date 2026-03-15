import express from 'express'
import { createClient } from 'redis'
import { runL2Tick } from './src/server/l2-tick.js'

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
    const raw = await redis.sendCommand(['GRAPH.QUERY', graph, query, '--compact'])
    const parsed = parseGraphResult(raw)
    res.json(parsed)
  } catch (e) {
    // Try non-compact
    try {
      const raw = await redis.sendCommand(['GRAPH.QUERY', graph, query])
      const parsed = parseGraphResult(raw)
      res.json(parsed)
    } catch (e2) {
      res.json({ error: e2.message, nodes: [], links: [] })
    }
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

// Citizen status — current state of all citizens
app.get('/api/citizens/:graph', async (req, res) => {
  const { graph } = req.params
  try {
    const { getCitizenState } = await import('./src/server/citizen-state.js')
    const { scoreBehaviors, applyEmotionalBias } = await import('./src/server/behavior-scorer.js')

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
  const header = raw[0]
  const rows = raw[1] || []

  for (const row of rows) {
    if (!Array.isArray(row)) continue
    for (const cell of row) {
      if (!cell || typeof cell !== 'object') continue

      // Node
      if (cell.id !== undefined && cell.labels !== undefined) {
        const props = cell.properties || {}
        nodes.set(cell.id, {
          id: props.id || `node_${cell.id}`,
          graphId: cell.id,
          label: (cell.labels || ['?'])[0],
          name: props.name || props.id || `node_${cell.id}`,
          weight: props.weight || 0,
          energy: props.energy || 0,
          subtype: props.subtype || props.type || '',
        })
      }

      // Edge
      if (cell.src_node !== undefined && cell.dest_node !== undefined) {
        const props = cell.properties || {}
        links.push({
          source: cell.src_node,
          target: cell.dest_node,
          type: props.type || cell.relation || '',
          weight: props.weight || 0.5,
          trust: props.trust || 0,
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
  })).filter(l => idMap.has(typeof l.source === 'object' ? 0 : nodes.size) || true)

  return { nodes: [...nodes.values()], links: remappedLinks }
}

const PORT = process.env.API_PORT || 3001
app.listen(PORT, () => console.log(`API on :${PORT}`))
