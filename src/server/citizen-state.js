// src/server/citizen-state.js
// Queries FalkorDB to assemble a citizen's full state for the behavior selection engine.
// Pure async function — no classes, no side effects.

const DEFAULT_DRIVES = {
  curiosity: 0.5,
  achievement: 0.5,
  affiliation: 0.5,
  self_preservation: 0.5,
  anxiety: 0.5,
  satisfaction: 0.5,
  frustration: 0.5,
  boredom: 0.5,
};

const DRIVE_NAMES = Object.keys(DEFAULT_DRIVES);

// ── helpers ──────────────────────────────────────────────────────────

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Run a Cypher query against FalkorDB.
 * Returns { headers, rows, stats }.
 * On error returns { headers: [], rows: [], stats: [] }.
 */
async function query(redis, graph, cypher) {
  try {
    const raw = await redis.sendCommand(['GRAPH.QUERY', graph, cypher]);
    const headers = raw?.[0] || [];
    const rows = raw?.[1] || [];
    const stats = raw?.[2] || [];
    return { headers, rows, stats };
  } catch (_) {
    return { headers: [], rows: [], stats: [] };
  }
}

// ── sub-queries ──────────────────────────────────────────────────────

/** Read the citizen's Actor node — id, name */
async function fetchActor(redis, graph, citizenId) {
  const { rows } = await query(redis, graph,
    `MATCH (a:Actor {id: '${esc(citizenId)}'}) RETURN a`);
  if (rows.length === 0) return null;
  const cell = rows[0]?.[0];
  if (!cell || !cell.properties) return null;
  return {
    id: cell.properties.id || citizenId,
    name: cell.properties.name || citizenId,
    updated_at_s: cell.properties.updated_at_s || 0,
  };
}

/**
 * Read drives from State nodes linked to the citizen.
 * State nodes have subtype matching drive names and carry an energy value
 * that represents the drive intensity.
 * Falls back to default 0.5 for any missing drive.
 */
async function fetchDrives(redis, graph, citizenId) {
  const { rows } = await query(redis, graph,
    `MATCH (a:Actor {id: '${esc(citizenId)}'})-[r:link]->(s)
     WHERE s.subtype IN ['curiosity','achievement','affiliation','self_preservation','anxiety','satisfaction','frustration','boredom']
     RETURN s`);

  const drives = { ...DEFAULT_DRIVES };
  for (const row of rows) {
    const cell = row?.[0];
    if (!cell?.properties) continue;
    const sub = cell.properties.subtype;
    if (sub && DRIVE_NAMES.includes(sub)) {
      drives[sub] = cell.properties.energy ?? cell.properties.weight ?? 0.5;
    }
  }
  return drives;
}

/** Current task: Moment with type='task_run', status='running', linked via claimed_by */
async function fetchCurrentTask(redis, graph, citizenId) {
  const { rows } = await query(redis, graph,
    `MATCH (a:Actor {id: '${esc(citizenId)}'})-[r:link]->(m:Moment)
     WHERE m.type = 'task_run' AND m.status = 'running' AND r.r_type = 'claimed_by'
     RETURN m
     LIMIT 1`);

  if (rows.length === 0) return null;
  const cell = rows[0]?.[0];
  if (!cell?.properties) return null;
  const p = cell.properties;
  return {
    id: p.id || `node_${cell.id}`,
    name: p.name || '',
    energy: p.energy || 0,
    weight: p.weight || 0,
    friction: p.friction || 0,
    severity: p.severity || 'medium',
    embedding: p.embedding || null,
  };
}

/** Active desires: top 3 Narrative nodes with subtype='desire', sorted by energy * goal_relevance */
async function fetchDesires(redis, graph, citizenId) {
  const { rows } = await query(redis, graph,
    `MATCH (a:Actor {id: '${esc(citizenId)}'})-[r:link]->(n:Narrative)
     WHERE n.subtype = 'desire'
     RETURN n
     ORDER BY n.energy * n.goal_relevance DESC
     LIMIT 3`);

  return rows.map(row => {
    const cell = row?.[0];
    if (!cell?.properties) return null;
    const p = cell.properties;
    return {
      id: p.id || `node_${cell.id}`,
      name: p.name || '',
      energy: p.energy || 0,
      weight: p.weight || 0,
      embedding: p.embedding || null,
    };
  }).filter(Boolean);
}

/** Location: the Space node the citizen is AT */
async function fetchLocation(redis, graph, citizenId) {
  const { rows } = await query(redis, graph,
    `MATCH (a:Actor {id: '${esc(citizenId)}'})-[r:link]->(s:Space)
     WHERE r.r_type = 'AT'
     RETURN s
     LIMIT 1`);

  if (rows.length === 0) return null;
  const cell = rows[0]?.[0];
  if (!cell?.properties) return null;
  const p = cell.properties;
  return {
    id: p.id || `node_${cell.id}`,
    name: p.name || '',
    energy: p.energy || 0,
    weight: p.weight || 0,
  };
}

/** Nearby nodes: all nodes within 1 hop of the citizen */
async function fetchNearbyNodes(redis, graph, citizenId) {
  const { rows } = await query(redis, graph,
    `MATCH (a:Actor {id: '${esc(citizenId)}'})-[r:link]-(n)
     WHERE n.id <> '${esc(citizenId)}'
     RETURN n`);

  return rows.map(row => {
    const cell = row?.[0];
    if (!cell?.properties) return null;
    const p = cell.properties;
    const label = (cell.labels || [])[0] || '';
    return {
      id: p.id || `node_${cell.id}`,
      name: p.name || '',
      type: label,
      subtype: p.subtype || p.type || '',
      energy: p.energy || 0,
      weight: p.weight || 0,
      partner_relevance: p.partner_relevance || 0,
      care_affinity: p.care_affinity || 0,
    };
  }).filter(Boolean);
}

/** Recent moments (last 24h) linked to the citizen */
async function fetchRecentMoments(redis, graph, citizenId) {
  const cutoff = Math.floor(Date.now() / 1000) - 86400;
  const { rows } = await query(redis, graph,
    `MATCH (a:Actor {id: '${esc(citizenId)}'})-[r:link]-(m:Moment)
     WHERE m.updated_at_s > ${cutoff}
     RETURN m
     ORDER BY m.updated_at_s DESC`);

  return rows.map(row => {
    const cell = row?.[0];
    if (!cell?.properties) return null;
    const p = cell.properties;
    return {
      id: p.id || `node_${cell.id}`,
      name: p.name || '',
      valence: p.valence || 0,
      behavior_cluster: p.behavior_cluster || null,
      timestamp: (p.updated_at_s || 0) * 1000,
    };
  }).filter(Boolean);
}

// ── main export ──────────────────────────────────────────────────────

/**
 * Assemble full citizen state from the FalkorDB graph.
 *
 * @param {object} redis - Connected redis client (node-redis)
 * @param {string} graph - Graph name (e.g. 'org_ai_dev_dashboard')
 * @param {string} citizenId - The Actor node id
 * @returns {object} Citizen state ready for behavior-scorer.js
 */
export async function getCitizenState(redis, graph, citizenId) {
  // Run independent queries in parallel
  const [actor, drives, currentTask, desires, location, nearbyNodes, recentMoments] =
    await Promise.all([
      fetchActor(redis, graph, citizenId),
      fetchDrives(redis, graph, citizenId),
      fetchCurrentTask(redis, graph, citizenId),
      fetchDesires(redis, graph, citizenId),
      fetchLocation(redis, graph, citizenId),
      fetchNearbyNodes(redis, graph, citizenId),
      fetchRecentMoments(redis, graph, citizenId),
    ]);

  // Derive arousal from drives
  const arousal =
    0.30 * drives.self_preservation +
    0.20 * drives.anxiety +
    0.20 * drives.frustration +
    0.15 * drives.curiosity +
    0.15 * drives.achievement;

  // isAwake: any activity in the last 5 minutes
  const fiveMinAgo = Math.floor(Date.now() / 1000) - 300;
  const isAwake = (actor?.updated_at_s || 0) > fiveMinAgo ||
    recentMoments.some(m => (m.timestamp / 1000) > fiveMinAgo);

  // Flow: approximate as fraction of neighbor nodes with energy > 0.1
  const totalNeighbors = nearbyNodes.length;
  const activeNeighbors = nearbyNodes.filter(n => n.energy > 0.1).length;
  const flow = totalNeighbors > 0
    ? Math.max(0, Math.min(1, activeNeighbors / totalNeighbors))
    : 0.5; // default when isolated

  return {
    id: actor?.id || citizenId,
    name: actor?.name || citizenId,

    drives,
    arousal,

    currentTask,
    desires,
    location,
    nearbyNodes,
    recentMoments,

    isAwake,
    flow,
  };
}
