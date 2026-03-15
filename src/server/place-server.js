// src/server/place-server.js
// Place Server — Active room tracking + energy injection for spatial context bias.
//
// DOCS: docs/feedback/ALGORITHM_Feedback.md (Room Energy Injection)
// DOCS: docs/feedback/IMPLEMENTATION_Feedback.md
// DOCS: docs/feedback/PATTERNS_Feedback.md (Principle 1: Places Are Real)
//
// Places are Space nodes in the graph. Each playthrough has one active Place.
// Navigation changes the active Place. Each tick, the active Place receives
// energy injection that biases the salience field toward its content.
//
// Key formulas:
//   injection = INJECTION_AMOUNT (0.1 per tick)
//   focus = 1.0 (active), 1/(1+distance) (connected), 0.0 (unreachable)
//   salience = weight × energy × focus  (computed in salience.js)

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const INJECTION_AMOUNT = 0.1    // Energy injected into active Place per tick
const PROPAGATION_DECAY = 0.02  // Energy decay rate for propagation from Place
const FOCUS_DECAY = 0.1         // Focus decay rate per tick for inactive Places

// ---------------------------------------------------------------------------
// State: active Place per playthrough
// ---------------------------------------------------------------------------

// Map<playthroughId, { placeUri: string, previousUri: string|null }>
const activePlaces = new Map()

// ---------------------------------------------------------------------------
// Graph helpers
// ---------------------------------------------------------------------------

/**
 * Get a node by ID or URI from the graph.
 *
 * @param {import('redis').RedisClientType} redis - Redis/FalkorDB client
 * @param {string} graph - Graph name
 * @param {string} nodeId - Node ID or place URI
 * @returns {Promise<object|null>} Node properties or null
 *
 * @see docs/feedback/ALGORITHM_Feedback.md — Interactions table
 */
export async function getNode(redis, graph, nodeId) {
  try {
    const result = await redis.sendCommand(['GRAPH.QUERY', graph,
      `MATCH (n) WHERE n.id = '${nodeId}' OR n.uri = '${nodeId}'
       RETURN n.id, n.uri, n.energy, n.weight, n.type, n.name`
    ])

    const rows = result?.[1]
    if (!rows || rows.length === 0) return null

    const row = rows[0]
    return {
      id: row[0],
      uri: row[1] || row[0],
      energy: row[2] ?? 0.0,
      weight: row[3] ?? 0.0,
      type: row[4] || 'Space',
      name: row[5] || row[0],
    }
  } catch (err) {
    console.error(`[place-server] getNode error: ${err.message}`)
    return null
  }
}

/**
 * Get outgoing edges from a node.
 *
 * @param {import('redis').RedisClientType} redis - Redis/FalkorDB client
 * @param {string} graph - Graph name
 * @param {string} nodeId - Source node ID or URI
 * @returns {Promise<Array<{targetId: string, weight: number, type: string}>>}
 *
 * @see docs/feedback/ALGORITHM_Feedback.md — Interactions table
 */
export async function getEdges(redis, graph, nodeId) {
  try {
    const result = await redis.sendCommand(['GRAPH.QUERY', graph,
      `MATCH (a)-[r]->(b)
       WHERE a.id = '${nodeId}' OR a.uri = '${nodeId}'
       RETURN b.id, r.weight, type(r)`
    ])

    const rows = result?.[1] || []
    return rows.map(row => ({
      targetId: row[0],
      weight: row[1] ?? 0.0,
      type: row[2] || 'LINK',
    }))
  } catch (err) {
    console.error(`[place-server] getEdges error: ${err.message}`)
    return []
  }
}

/**
 * Compute shortest path length between two nodes using BFS.
 *
 * Used for focus calculation: focus = 1 / (1 + distance).
 * Bounded to max 5 hops to prevent expensive traversals on large graphs.
 *
 * @param {import('redis').RedisClientType} redis - Redis/FalkorDB client
 * @param {string} graph - Graph name
 * @param {string} fromId - Source node ID or URI
 * @param {string} toId - Target node ID or URI
 * @param {number} [maxDepth=5] - Maximum search depth
 * @returns {Promise<number>} Path length, or Infinity if unreachable
 *
 * @see docs/feedback/ALGORITHM_Feedback.md — Salience Calculation Step 1
 */
export async function shortestPath(redis, graph, fromId, toId, maxDepth = 5) {
  if (fromId === toId) return 0

  try {
    // Use FalkorDB's shortestPath if available, bounded by maxDepth
    const result = await redis.sendCommand(['GRAPH.QUERY', graph,
      `MATCH (a), (b)
       WHERE (a.id = '${fromId}' OR a.uri = '${fromId}')
         AND (b.id = '${toId}' OR b.uri = '${toId}')
       MATCH p = shortestPath((a)-[*1..${maxDepth}]->(b))
       RETURN length(p)`
    ])

    const rows = result?.[1]
    if (rows && rows.length > 0 && rows[0][0] != null) {
      return rows[0][0]
    }

    // Try undirected
    const result2 = await redis.sendCommand(['GRAPH.QUERY', graph,
      `MATCH (a), (b)
       WHERE (a.id = '${fromId}' OR a.uri = '${fromId}')
         AND (b.id = '${toId}' OR b.uri = '${toId}')
       MATCH p = shortestPath((a)-[*1..${maxDepth}]-(b))
       RETURN length(p)`
    ])

    const rows2 = result2?.[1]
    if (rows2 && rows2.length > 0 && rows2[0][0] != null) {
      return rows2[0][0]
    }

    return Infinity
  } catch (err) {
    // shortestPath may not be supported or nodes may not exist
    return Infinity
  }
}

// ---------------------------------------------------------------------------
// Active Place management
// ---------------------------------------------------------------------------

/**
 * Set the active Place for a playthrough (room navigation).
 *
 * When the user navigates, the old Place's focus starts decaying
 * and the new Place gets focus = 1.0 with energy injection.
 *
 * @param {import('redis').RedisClientType} redis - Redis/FalkorDB client
 * @param {string} graph - Graph name
 * @param {string} playthroughId - Playthrough scope identifier
 * @param {string} placeUri - New active Place URI (e.g. "place://ui/triage")
 * @returns {Promise<{success: boolean, previous: string|null, active: string}>}
 *
 * @see docs/feedback/ALGORITHM_Feedback.md — Room Energy Injection Step 1
 */
export async function setActivePlace(redis, graph, playthroughId, placeUri) {
  const current = activePlaces.get(playthroughId)
  const previousUri = current?.placeUri || null

  // Set old Place focus toward decay (don't zero it — let physics decay naturally)
  if (previousUri && previousUri !== placeUri) {
    try {
      await redis.sendCommand(['GRAPH.QUERY', graph,
        `MATCH (n)
         WHERE n.uri = '${previousUri}' OR n.id = '${previousUri}'
         SET n.focus = 0.0`
      ])
    } catch (_) { /* best-effort */ }
  }

  // Set new Place focus to 1.0
  try {
    await redis.sendCommand(['GRAPH.QUERY', graph,
      `MATCH (n)
       WHERE n.uri = '${placeUri}' OR n.id = '${placeUri}'
       SET n.focus = 1.0`
    ])
  } catch (err) {
    console.error(`[place-server] setActivePlace focus error: ${err.message}`)
    return { success: false, previous: previousUri, active: placeUri }
  }

  activePlaces.set(playthroughId, {
    placeUri,
    previousUri,
  })

  return { success: true, previous: previousUri, active: placeUri }
}

/**
 * Get the active Place URI for a playthrough.
 *
 * @param {string} playthroughId
 * @returns {string|null}
 */
export function getActivePlace(playthroughId) {
  return activePlaces.get(playthroughId)?.placeUri || null
}

// ---------------------------------------------------------------------------
// Energy injection (per tick)
// ---------------------------------------------------------------------------

/**
 * Inject energy into the active Place for a playthrough.
 *
 * Called once per tick. Adds INJECTION_AMOUNT to the active Place's energy
 * and propagates a fraction along edges to child nodes, biasing the
 * salience field toward the active room's content.
 *
 * Formula:
 *   active_place.energy += INJECTION_AMOUNT
 *   for each child: child.energy += INJECTION_AMOUNT × edge.weight × 0.1
 *
 * @param {import('redis').RedisClientType} redis - Redis/FalkorDB client
 * @param {string} graph - Graph name
 * @param {string} playthroughId - Playthrough scope identifier
 * @returns {Promise<{injected: boolean, placeUri: string|null, amount: number}>}
 *
 * @see docs/feedback/ALGORITHM_Feedback.md — Room Energy Injection Step 2
 */
export async function injectEnergy(redis, graph, playthroughId) {
  const placeUri = getActivePlace(playthroughId)
  if (!placeUri) {
    return { injected: false, placeUri: null, amount: 0 }
  }

  try {
    // Inject energy into active Place
    await redis.sendCommand(['GRAPH.QUERY', graph,
      `MATCH (n)
       WHERE n.uri = '${placeUri}' OR n.id = '${placeUri}'
       SET n.energy = COALESCE(n.energy, 0.0) + ${INJECTION_AMOUNT}`
    ])

    // Propagate to direct children via weighted edges
    await redis.sendCommand(['GRAPH.QUERY', graph,
      `MATCH (a)-[r]->(b)
       WHERE (a.uri = '${placeUri}' OR a.id = '${placeUri}')
         AND r.weight > 0
       SET b.energy = COALESCE(b.energy, 0.0) + ${INJECTION_AMOUNT} * r.weight * 0.1`
    ])

    return { injected: true, placeUri, amount: INJECTION_AMOUNT }
  } catch (err) {
    console.error(`[place-server] injectEnergy error: ${err.message}`)
    return { injected: false, placeUri, amount: 0 }
  }
}

// ---------------------------------------------------------------------------
// Focus computation (for salience)
// ---------------------------------------------------------------------------

/**
 * Compute focus for a node relative to the active Place.
 *
 * Focus = 1.0 if node IS the active Place or direct child.
 * Focus = 1/(1+distance) for connected nodes.
 * Focus = 0.0 if unreachable.
 *
 * @param {import('redis').RedisClientType} redis - Redis/FalkorDB client
 * @param {string} graph - Graph name
 * @param {string} nodeId - Node to compute focus for
 * @param {string} playthroughId - Playthrough scope identifier
 * @returns {Promise<number>} Focus value in [0.0, 1.0]
 *
 * @see docs/feedback/ALGORITHM_Feedback.md — Salience Calculation Step 1
 */
export async function computeFocus(redis, graph, nodeId, playthroughId) {
  const placeUri = getActivePlace(playthroughId)
  if (!placeUri) return 0.0

  // Is this the active Place itself?
  if (nodeId === placeUri) return 1.0

  // Check graph distance
  const distance = await shortestPath(redis, graph, placeUri, nodeId)

  if (distance === Infinity) return 0.0
  if (distance <= 1) return 1.0  // Direct child

  return 1.0 / (1.0 + distance)
}
