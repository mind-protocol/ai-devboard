// src/server/task-continuity.js
// Resolves whether a citizen continues their current task or starts a new one.
// Uses FalkorDB graph for task_run Moment nodes and claimed_by / AFFECTS links.

// ── helpers ──────────────────────────────────────────────────────────

const ACTIVE_CLUSTERS = new Set([
  'FOCUS', 'CREATE', 'EXPLORE', 'REACH_OUT',
  'VERIFY', 'ASSESS', 'ORGANIZE', 'CONNECT', 'CARE',
]);

const PASSIVE_CLUSTERS = new Set([
  'REFLECT', 'REST', 'INNOVATE', 'PLAN',
]);

/**
 * Lowercase, replace non-alphanumeric with _, collapse multiples.
 */
function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Approximate alignment between a target and the current task.
 * Returns a score between 0 and 1.
 * Aligned if the target name appears in the task name,
 * or they share the same file path.
 */
function checkAlignment(currentTask, selectedTarget) {
  if (!currentTask || !selectedTarget) return 0;

  const taskName = (currentTask.name || '').toLowerCase();
  const targetName = (selectedTarget.name || '').toLowerCase();

  // target name appears inside task name (or vice versa)
  if (targetName && taskName && (taskName.includes(targetName) || targetName.includes(taskName))) {
    return 0.8;
  }

  // shared file path
  const taskPath = (currentTask.file_path || currentTask.path || '').toLowerCase();
  const targetPath = (selectedTarget.file_path || selectedTarget.path || '').toLowerCase();
  if (taskPath && targetPath && taskPath === targetPath) {
    return 0.7;
  }

  return 0;
}

// ── core ─────────────────────────────────────────────────────────────

/**
 * Resolve whether the citizen continues their current task or starts a new one.
 *
 * @param {object} redis        — connected redis client
 * @param {string} graph        — FalkorDB graph name
 * @param {object} citizenState — citizen runtime state (must include .currentTask, .id)
 * @param {object} selectedCluster — { cluster, score, probability } from behavior selection
 * @param {object|null} selectedTarget — target node { name, id, file_path, ... } or null
 * @param {string} sentence     — the synthesized action sentence
 * @returns {object|null} task object, or null for passive clusters
 */
export async function resolveTask(redis, graph, citizenState, selectedCluster, selectedTarget, sentence) {
  const currentTask = citizenState.currentTask || null;
  const clusterName = selectedCluster.cluster || selectedCluster;
  const score = selectedCluster.score ?? 0.5;
  const now = Date.now();

  // ── 1. Current task is running — check alignment ──────────────────

  if (currentTask && currentTask.status === 'running') {
    const alignment = checkAlignment(currentTask, selectedTarget);

    if (alignment > 0.4) {
      // aligned — continue current task, no change
      return currentTask;
    }

    // not aligned — citizen is diverging, fall through to create new task
  }

  // ── 2. No current task, or task is done/failed/null, or diverging ──

  const needsNewTask =
    !currentTask ||
    currentTask.status === 'done' ||
    currentTask.status === 'failed' ||
    currentTask.status === null ||
    (currentTask.status === 'running' && checkAlignment(currentTask, selectedTarget) <= 0.4);

  if (!needsNewTask) {
    // default: continue current task
    return currentTask;
  }

  // ── 3a. Passive cluster — no task needed ──────────────────────────

  if (PASSIVE_CLUSTERS.has(clusterName)) {
    return null;
  }

  // ── 3b. Active cluster — create new task_run node ─────────────────

  if (!ACTIVE_CLUSTERS.has(clusterName)) {
    // unknown cluster — treat as passive, return null
    return null;
  }

  const taskId = `task:self:${slugify(sentence)}`;
  const truncatedName = sentence.length > 120 ? sentence.slice(0, 120) : sentence;
  const citizenId = citizenState.id || citizenState.handle || 'unknown';

  // Escape single quotes for Cypher
  const safeName = truncatedName.replace(/'/g, "\\'");
  const safeSentence = sentence.replace(/'/g, "\\'");
  const safeTaskId = taskId.replace(/'/g, "\\'");

  // Create or update the task_run Moment node
  const createTaskQuery = `
    MERGE (n:Moment {id: '${safeTaskId}'})
    SET n.name = '${safeName}',
        n.type = 'task_run',
        n.subtype = 'task_run',
        n.status = 'running',
        n.synthesis = '${safeSentence}',
        n.issue_type = 'self_initiated',
        n.severity = 'medium',
        n.weight = 0.5,
        n.energy = ${score},
        n.friction = 0.2,
        n.stability = 0.3,
        n.created_at_s = ${now},
        n.updated_at_s = ${now}
    RETURN n.id, n.name, n.status, n.energy
  `;

  await redis.sendCommand(['GRAPH.QUERY', graph, createTaskQuery]);

  // Create claimed_by link: task → citizen actor
  const claimedByQuery = `
    MATCH (t:Moment {id: '${safeTaskId}'}), (c {id: '${citizenId}'})
    MERGE (t)-[:claimed_by]->(c)
  `;

  await redis.sendCommand(['GRAPH.QUERY', graph, claimedByQuery]);

  // Create CREATED link: citizen → task (provenance — the citizen initiated this)
  const createdByQuery = `
    MATCH (t:Moment {id: '${safeTaskId}'}), (c {id: '${citizenId}'})
    MERGE (c)-[r:link]->(t) SET r.r_type = 'CREATED', r.trust = 0.9, r.weight = 0.7
  `;
  await redis.sendCommand(['GRAPH.QUERY', graph, createdByQuery]);

  // If target exists: create AFFECTS link: task → target
  if (selectedTarget && selectedTarget.id) {
    const safeTargetId = String(selectedTarget.id).replace(/'/g, "\\'");
    const affectsQuery = `
      MATCH (t:Moment {id: '${safeTaskId}'}), (target {id: '${safeTargetId}'})
      MERGE (t)-[:AFFECTS]->(target)
    `;

    await redis.sendCommand(['GRAPH.QUERY', graph, affectsQuery]);
  }

  // Return the new task object
  return {
    id: taskId,
    name: truncatedName,
    type: 'task_run',
    subtype: 'task_run',
    status: 'running',
    synthesis: sentence,
    issue_type: 'self_initiated',
    severity: 'medium',
    weight: 0.5,
    energy: score,
    friction: 0.2,
    stability: 0.3,
    created_at_s: now,
    updated_at_s: now,
  };
}

// ── abandon ──────────────────────────────────────────────────────────

/**
 * Abandon a task: set status to pending, boost energy, remove claimed_by link.
 *
 * @param {object} redis  — connected redis client
 * @param {string} graph  — FalkorDB graph name
 * @param {string} taskId — the task node id to abandon
 */
export async function abandonTask(redis, graph, taskId) {
  const safeId = taskId.replace(/'/g, "\\'");

  // Set task to pending and boost energy
  await redis.sendCommand(['GRAPH.QUERY', graph,
    `MATCH (t:Moment {id: '${safeId}'})
     SET t.status = 'pending',
         t.energy = t.energy + 0.3,
         t.updated_at_s = ${Date.now()}
     RETURN t.id`
  ]);

  // Remove claimed_by link
  await redis.sendCommand(['GRAPH.QUERY', graph,
    `MATCH (t:Moment {id: '${safeId}'})-[r:claimed_by]->()
     DELETE r`
  ]);
}
