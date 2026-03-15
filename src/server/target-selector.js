// src/server/target-selector.js
// Selects a target node for a behavior cluster.
// Uses Cypher queries against FalkorDB to fetch candidates,
// scores them by desire alignment and salience, then picks one.

// ── helpers ──────────────────────────────────────────────────────────

/**
 * Escape a string for safe embedding in a Cypher literal.
 */
function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
}

/**
 * Run a Cypher query and return parsed rows.
 * FalkorDB returns [header, [rows...], stats].
 * Each row is an array of cells; nodes have { id, labels, properties }.
 */
async function query(redis, graph, cypher) {
  const raw = await redis.sendCommand(['GRAPH.QUERY', graph, cypher])
  if (!raw || !Array.isArray(raw)) return []
  const rows = raw[1] || []
  return rows
}

/**
 * Extract a node object from a FalkorDB result cell.
 * Nodes arrive as { id, labels, properties }.
 * Returns a flat object with the properties merged in plus label metadata.
 */
function parseNode(cell) {
  if (!cell || typeof cell !== 'object') return null
  // Node detection: has labels array and properties
  if (cell.labels !== undefined && cell.properties !== undefined) {
    const props = cell.properties || {}
    return {
      id: props.id || `node_${cell.id}`,
      graphId: cell.id,
      label: (cell.labels || ['?'])[0],
      name: props.name || props.id || `node_${cell.id}`,
      type: (cell.labels || ['?'])[0],
      subtype: props.subtype || props.type || '',
      energy: props.energy || 0,
      weight: props.weight || 0,
      status: props.status || '',
      partner_relevance: props.partner_relevance || 0,
    }
  }
  return null
}

/**
 * Parse all nodes from FalkorDB result rows.
 * Deduplicates by graphId.
 */
function parseNodes(rows) {
  const seen = new Map()
  for (const row of rows) {
    if (!Array.isArray(row)) continue
    for (const cell of row) {
      const node = parseNode(cell)
      if (node && !seen.has(node.graphId)) {
        seen.set(node.graphId, node)
      }
    }
  }
  return [...seen.values()]
}

// ── candidate fetchers per cluster type ──────────────────────────────

/**
 * FOCUS / VERIFY: nodes linked from the current task via AFFECTS edges.
 */
async function candidatesFocusVerify(redis, graph, citizenState) {
  const taskId = citizenState.currentTask?.id
  if (!taskId) return []
  const rows = await query(redis, graph,
    `MATCH (t {id: '${esc(taskId)}'})-[r:link]->(n) WHERE r.r_type = 'AFFECTS' RETURN n`)
  return parseNodes(rows)
}

/**
 * PLAN / ORGANIZE: all pending task_run Moments linked to the citizen's org.
 */
async function candidatesPlanOrganize(redis, graph, citizenState) {
  const orgId = citizenState.orgId || 'org:ai_dev_dashboard'
  const rows = await query(redis, graph,
    `MATCH (m:Moment)-[r:link]->(org {id: '${esc(orgId)}'}) WHERE m.subtype = 'task_run' AND m.status = 'pending' RETURN m`)
  return parseNodes(rows)
}

/**
 * EXPLORE: random nodes in the citizen's location Space + neighboring Spaces.
 */
async function candidatesExplore(redis, graph, citizenState) {
  const spaceId = citizenState.locationId || citizenState.spaceId
  if (!spaceId) {
    // Fallback: any Space nodes
    const rows = await query(redis, graph,
      `MATCH (n:Space) WHERE n.energy > 0 RETURN n LIMIT 20`)
    return parseNodes(rows)
  }
  const rows = await query(redis, graph,
    `MATCH (s {id: '${esc(spaceId)}'})<-[:link]-(n) RETURN n UNION MATCH (s {id: '${esc(spaceId)}'})-[:link]->(neighbor:Space)<-[:link]-(n) RETURN n LIMIT 20`)
  return parseNodes(rows)
}

/**
 * CREATE: nodes with status='proposed' or skeleton stubs.
 */
async function candidatesCreate(redis, graph) {
  const rows = await query(redis, graph,
    `MATCH (n) WHERE n.status = 'proposed' OR n.issue_type = 'skeleton_stub' RETURN n LIMIT 20`)
  return parseNodes(rows)
}

/**
 * REACH_OUT / CONNECT: Actor nodes (other citizens).
 */
async function candidatesReachOutConnect(redis, graph, citizenState) {
  const selfId = citizenState.citizenId || ''
  const rows = await query(redis, graph,
    `MATCH (n:Actor) WHERE n.id <> '${esc(selfId)}' RETURN n LIMIT 20`)
  return parseNodes(rows)
}

/**
 * ASSESS: Thing nodes (code_file, code_function) with energy > 0.
 */
async function candidatesAssess(redis, graph) {
  const rows = await query(redis, graph,
    `MATCH (n:Thing) WHERE n.energy > 0 AND (n.subtype = 'code_file' OR n.subtype = 'code_function') RETURN n LIMIT 20`)
  return parseNodes(rows)
}

/**
 * CARE: nodes with high partner_relevance near the citizen.
 */
async function candidatesCare(redis, graph, citizenState) {
  const spaceId = citizenState.locationId || citizenState.spaceId
  if (!spaceId) {
    const rows = await query(redis, graph,
      `MATCH (n) WHERE n.partner_relevance > 0.3 RETURN n LIMIT 20`)
    return parseNodes(rows)
  }
  const rows = await query(redis, graph,
    `MATCH (n)-[:link]->(s {id: '${esc(spaceId)}'}) WHERE n.partner_relevance > 0.3 RETURN n LIMIT 20`)
  return parseNodes(rows)
}

/**
 * REFLECT / INNOVATE: Narrative nodes (desires, values) in the citizen's L1.
 */
async function candidatesReflectInnovate(redis, graph, citizenState) {
  const selfId = citizenState.citizenId || ''
  if (!selfId) {
    const rows = await query(redis, graph,
      `MATCH (n:Narrative) RETURN n LIMIT 20`)
    return parseNodes(rows)
  }
  const rows = await query(redis, graph,
    `MATCH (a {id: '${esc(selfId)}'})-[:link]->(n:Narrative) RETURN n LIMIT 20`)
  const nodes = parseNodes(rows)
  // Fallback: if no Narrative nodes linked, try global
  if (nodes.length === 0) {
    const fallback = await query(redis, graph,
      `MATCH (n:Narrative) RETURN n LIMIT 20`)
    return parseNodes(fallback)
  }
  return nodes
}

// ── cluster → fetcher mapping ────────────────────────────────────────

const FETCHERS = {
  FOCUS:     candidatesFocusVerify,
  VERIFY:    candidatesFocusVerify,
  PLAN:      candidatesPlanOrganize,
  ORGANIZE:  candidatesPlanOrganize,
  EXPLORE:   candidatesExplore,
  CREATE:    candidatesCreate,
  REACH_OUT: candidatesReachOutConnect,
  CONNECT:   candidatesReachOutConnect,
  ASSESS:    candidatesAssess,
  CARE:      candidatesCare,
  REFLECT:   candidatesReflectInnovate,
  INNOVATE:  candidatesReflectInnovate,
  REST:      null,
}

// ── scoring ──────────────────────────────────────────────────────────

/**
 * Compute desire_match: approximate alignment between a candidate and
 * the citizen's desires. If the candidate's name appears in any desire
 * name, score 0.8; otherwise 0.3.
 */
function desireMatch(candidate, citizenState) {
  const desires = citizenState.desires
  if (!desires || !Array.isArray(desires) || desires.length === 0) return 0.3
  const candidateName = (candidate.name || '').toLowerCase()
  for (const d of desires) {
    const desireName = (d.name || d.text || '').toLowerCase()
    if (desireName && candidateName && desireName.includes(candidateName)) return 0.8
    if (desireName && candidateName && candidateName.includes(desireName)) return 0.8
  }
  return 0.3
}

/**
 * Score a single candidate:
 *   target_score = desire_match * salience
 *   salience     = candidate.energy * candidate.weight
 */
function scoreCandidate(candidate, citizenState) {
  const dm = desireMatch(candidate, citizenState)
  const salience = (candidate.energy || 0) * (candidate.weight || 0)
  return dm * salience
}

// ── weighted random selection ────────────────────────────────────────

/**
 * Weighted random pick from an array of { item, weight } entries.
 * All weights must be non-negative.
 */
function weightedRandom(entries) {
  const total = entries.reduce((sum, e) => sum + e.weight, 0)
  if (total === 0) return entries[Math.floor(Math.random() * entries.length)]?.item ?? null
  const r = Math.random() * total
  let cumulative = 0
  for (const e of entries) {
    cumulative += e.weight
    if (r <= cumulative) return e.item
  }
  return entries[entries.length - 1]?.item ?? null
}

// ── main export ──────────────────────────────────────────────────────

/**
 * Select a target node for a behavior cluster.
 *
 * @param {object} redis        — redis client (with sendCommand)
 * @param {string} graph        — FalkorDB graph name
 * @param {string} cluster      — behavior cluster name (FOCUS, PLAN, REST, etc.)
 * @param {object} citizenState — citizen's current state
 * @returns {Promise<{id, name, type, subtype, energy, weight, score}|null>}
 */
export async function selectTarget(redis, graph, cluster, citizenState) {
  // REST needs no target
  if (cluster === 'REST') return null

  const fetcher = FETCHERS[cluster]
  if (!fetcher) return null

  let candidates
  try {
    candidates = await fetcher(redis, graph, citizenState)
  } catch {
    return null
  }

  if (!candidates || candidates.length === 0) return null

  // Score each candidate
  const scored = candidates.map(c => ({
    ...c,
    score: scoreCandidate(c, citizenState),
  }))

  // If max score < 0.1: return random choice
  const maxScore = Math.max(...scored.map(s => s.score))
  if (maxScore < 0.1) {
    const pick = scored[Math.floor(Math.random() * scored.length)]
    return {
      id: pick.id,
      name: pick.name,
      type: pick.type,
      subtype: pick.subtype,
      energy: pick.energy,
      weight: pick.weight,
      score: pick.score,
    }
  }

  // Weighted random selection from top candidates (score > 0)
  const entries = scored
    .filter(s => s.score > 0)
    .map(s => ({ item: s, weight: s.score }))

  const pick = weightedRandom(entries)
  if (!pick) return null

  return {
    id: pick.id,
    name: pick.name,
    type: pick.type,
    subtype: pick.subtype,
    energy: pick.energy,
    weight: pick.weight,
    score: pick.score,
  }
}
