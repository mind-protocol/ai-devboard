import express from 'express'
import { createClient } from 'redis'

const app = express()
app.use(express.json())

const redis = createClient({ url: `redis://${process.env.FALKORDB_HOST || 'localhost'}:${process.env.FALKORDB_PORT || 6379}` })
await redis.connect()

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

// Run a physics tick — apply decay + propagation
app.post('/api/tick', async (req, res) => {
  const { graph } = req.body
  if (!graph) return res.json({ error: 'Missing graph' })

  try {
    const DECAY_RATE = 0.02

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

    res.json({ decayed: decayCount, propagated: propCount })
  } catch (e) {
    res.json({ error: e.message, decayed: 0, propagated: 0 })
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
