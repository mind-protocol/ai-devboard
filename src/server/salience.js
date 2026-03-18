// src/server/salience.js
// Salience engine — determines what is visible and how prominent
// @see docs/feedback/ALGORITHM_Feedback.md (Salience Calculation)
// @see docs/feedback/VALIDATION_Feedback.md (V3: Salience Formula Is Consistent)
//
// Canonical formula (V3 invariant — single source of truth):
//   salience = weight * energy * focus
//
// Do NOT create alternative salience calculations elsewhere.

/**
 * VISIBILITY_THRESHOLD — minimum salience for a node to be visible.
 * Below this, nodes fade out. Tunable but must be consistent everywhere.
 * @see docs/feedback/ALGORITHM_Feedback.md Step 3
 */
export const VISIBILITY_THRESHOLD = 0.01

/**
 * Compute salience for a set of graph nodes relative to an active Place.
 *
 * ALGORITHM (from ALGORITHM_Feedback.md):
 *   1. Compute focus for each node (1.0 for active place + direct children,
 *      decays by distance for others, 0.0 for unreachable)
 *   2. salience = weight * energy * focus
 *   3. visible = salience >= VISIBILITY_THRESHOLD
 *
 * @param {Object[]} nodes - Graph nodes with { id, energy, weight, ... }
 * @param {Object[]} links - Graph links with { source, target, weight }
 * @param {string|null} activePlaceId - ID of the active Place node (null = no spatial bias)
 * @returns {SalienceEntry[]} Scored entries sorted by salience descending
 */
export function computeSalience(nodes, links, activePlaceId = null) {
  // Build adjacency for BFS focus computation
  const adj = new Map()
  for (const node of nodes) {
    adj.set(node.id, [])
  }
  for (const link of links) {
    const src = link.source?.id || link.source
    const tgt = link.target?.id || link.target
    if (adj.has(src)) adj.get(src).push(tgt)
    if (adj.has(tgt)) adj.get(tgt).push(src)
  }

  // Compute focus via BFS from active place
  const focusMap = computeFocus(nodes, adj, activePlaceId)

  // Score each node
  const entries = []
  for (const node of nodes) {
    const weight = Math.max(node.weight || 0, 0)
    const energy = Math.max(node.energy || 0, 0)
    const focus = focusMap.get(node.id) || 0

    // V3 invariant: this is THE salience formula. No alternatives.
    const salience = weight * energy * focus
    const visible = salience >= VISIBILITY_THRESHOLD

    entries.push({
      node_id: node.id,
      weight,
      energy,
      focus,
      salience,
      visible,
    })
  }

  // Sort descending by salience
  entries.sort((a, b) => b.salience - a.salience)
  return entries
}

/**
 * Filter salience entries to only visible nodes.
 *
 * @param {SalienceEntry[]} entries - Output from computeSalience()
 * @param {number} [threshold=VISIBILITY_THRESHOLD] - Override threshold
 * @returns {SalienceEntry[]} Only entries where salience >= threshold
 */
export function filterByThreshold(entries, threshold = VISIBILITY_THRESHOLD) {
  return entries.filter(e => e.salience >= threshold)
}

/**
 * Compute focus values for all nodes relative to an active Place.
 *
 * ALGORITHM (from ALGORITHM_Feedback.md Step 1):
 *   - Active place and direct neighbors: focus = 1.0
 *   - Others: focus = 1 / (1 + distance)
 *   - Unreachable: focus = 0.0
 *   - If no active place: all nodes get focus = 1.0 (no spatial bias)
 *
 * @param {Object[]} nodes - All graph nodes
 * @param {Map<string, string[]>} adj - Adjacency list
 * @param {string|null} activePlaceId - Active place node ID
 * @returns {Map<string, number>} node_id → focus value
 */
export function computeFocus(nodes, adj, activePlaceId) {
  const focusMap = new Map()

  // No active place = no spatial bias, everything visible equally
  if (!activePlaceId) {
    for (const node of nodes) {
      focusMap.set(node.id, 1.0)
    }
    return focusMap
  }

  // BFS from active place to compute distances
  const distances = new Map()
  const queue = [activePlaceId]
  distances.set(activePlaceId, 0)

  while (queue.length > 0) {
    const current = queue.shift()
    const dist = distances.get(current)
    const neighbors = adj.get(current) || []
    for (const neighbor of neighbors) {
      if (!distances.has(neighbor)) {
        distances.set(neighbor, dist + 1)
        queue.push(neighbor)
      }
    }
  }

  // Convert distances to focus values
  for (const node of nodes) {
    const dist = distances.get(node.id)
    if (dist === undefined) {
      focusMap.set(node.id, 0.0)  // unreachable
    } else if (dist <= 1) {
      focusMap.set(node.id, 1.0)  // active place + direct neighbors
    } else {
      focusMap.set(node.id, 1.0 / (1.0 + dist))
    }
  }

  return focusMap
}
