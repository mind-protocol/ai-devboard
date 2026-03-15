// L2 Tick Cycle — 19-step collective heartbeat
// Integrates all behavior modules into a single tick function.
//
// Usage: import { runL2Tick } from './l2-tick.js'
//        const result = await runL2Tick(redis, graph)

import { getCitizenState } from './citizen-state.js'
import { scoreBehaviors, applyEmotionalBias, selectBehavior } from './behavior-scorer.js'
import { selectTarget } from './target-selector.js'
import { makeSentence } from './sentence-maker.js'
import { resolveTask } from './task-continuity.js'
import { dispatchAction } from './action-dispatch.js'

const DECAY_RATE = 0.02

export async function runL2Tick(redis, graph) {
  const tickStart = Date.now()
  const result = {
    tick: true,
    decayed: 0,
    propagated: 0,
    citizens: [],
    errors: [],
  }

  try {
    // =====================================================================
    // STEP 1: MEMBRANE_DOWN — L2 active nodes → L1 stimuli (conceptual)
    // (Actual L1 injection happens per-citizen below)
    // =====================================================================

    // =====================================================================
    // STEP 2: INJECT — watcher stimuli are already in the graph via watcher.js
    // (No action needed here — watcher runs independently)
    // =====================================================================

    // =====================================================================
    // STEP 3: PROPAGATE — energy flows through L2 links
    // =====================================================================
    try {
      const propRes = await redis.sendCommand(['GRAPH.QUERY', graph,
        `MATCH (a)-[r:link]->(b) WHERE a.energy > 0.3 AND r.weight > 0
         SET b.energy = b.energy + (a.energy - 0.3) * r.weight * 0.1,
             a.energy = a.energy * 0.9
         RETURN count(r)`])
      result.propagated = propRes?.[1]?.[0]?.[0] || 0
    } catch (e) { result.errors.push(`propagate: ${e.message}`) }

    // =====================================================================
    // STEP 4: DECAY — energy decays on all L2 nodes
    // =====================================================================
    try {
      const decRes = await redis.sendCommand(['GRAPH.QUERY', graph,
        `MATCH (n) WHERE n.energy > 0
         SET n.energy = n.energy * ${1 - DECAY_RATE}
         RETURN count(n)`])
      result.decayed = decRes?.[1]?.[0]?.[0] || 0
    } catch (e) { result.errors.push(`decay: ${e.message}`) }

    // Recency decay
    try {
      await redis.sendCommand(['GRAPH.QUERY', graph,
        `MATCH (n) WHERE n.recency > 0 SET n.recency = n.recency * 0.99`])
    } catch (_) {}

    // =====================================================================
    // STEP 5-8: REINFORCE, CONSOLIDATE, FORGET, CRYSTALLIZE
    // (These run on slower cycles — every Nth tick. For now, skip.)
    // =====================================================================

    // =====================================================================
    // STEP 9: TASK_SCAN — detect new tasks from graph state
    // (Handled by ingest.js / watcher.js, not per-tick)
    // =====================================================================

    // =====================================================================
    // STEP 10: TASK_VERIFY — check exit conditions on pending tasks
    // =====================================================================
    try {
      // Auto-resolve tasks where the target file now exists with real content
      await redis.sendCommand(['GRAPH.QUERY', graph,
        `MATCH (task:Moment)-[r:link]->(target:Thing)
         WHERE task.type = 'task_run' AND task.status = 'pending'
         AND r.condition = 'no_throw_not_implemented'
         AND target.energy > 0 AND target.stability > 0.5
         SET task.status = 'done', task.energy = 0`])
    } catch (_) {}

    // =====================================================================
    // STEP 11-12: TASK_ASSIGN + TASK_PROMOTE
    // (Handled by task_assignment.py in mind-mcp runtime)
    // =====================================================================

    // =====================================================================
    // STEP 13-17: CITIZEN BEHAVIOR CYCLE
    // For each citizen: read state → score → select → target → sentence → task → dispatch
    // =====================================================================
    let citizenIds = []
    try {
      const citizenRes = await redis.sendCommand(['GRAPH.QUERY', graph,
        `MATCH (a:Actor) WHERE a.id STARTS WITH 'citizen:' OR a.subtype = 'citizen' RETURN a.id`])
      citizenIds = (citizenRes?.[1] || []).map(row => row[0]).filter(Boolean)
    } catch (_) {}

    // Also include citizens by name pattern (nervo, voce, etc.)
    if (citizenIds.length === 0) {
      try {
        const fallback = await redis.sendCommand(['GRAPH.QUERY', graph,
          `MATCH (a:Actor) WHERE NOT a.id STARTS WITH 'org:' RETURN a.id`])
        citizenIds = (fallback?.[1] || []).map(row => row[0]).filter(Boolean)
      } catch (_) {}
    }

    for (const citizenId of citizenIds) {
      const citizenResult = { id: citizenId, cluster: null, target: null, sentence: null, action: null }
      try {
        // Read state
        const state = await getCitizenState(redis, graph, citizenId)
        if (!state) { citizenResult.error = 'no state'; continue }

        // Score behaviors
        let scores = scoreBehaviors(state)
        scores = applyEmotionalBias(scores, state.recentMoments || [])

        // Select behavior
        const selected = selectBehavior(scores)
        citizenResult.cluster = selected.cluster
        citizenResult.scores = Object.fromEntries(
          Object.entries(scores).sort(([,a], [,b]) => b - a).slice(0, 5)
        )

        // Select target
        const target = await selectTarget(redis, graph, selected.cluster, state)
        citizenResult.target = target?.name || null

        // Make sentence
        const sentence = makeSentence(selected.cluster, target, state)
        citizenResult.sentence = sentence

        // Resolve task (continue or create)
        const task = await resolveTask(redis, graph, state, selected.cluster, target, sentence)
        citizenResult.task = task?.name || null

        // Dispatch action
        const actionResult = await dispatchAction(redis, graph, selected.cluster, target, state)
        citizenResult.action = actionResult

      } catch (e) {
        citizenResult.error = e.message
      }
      result.citizens.push(citizenResult)
    }

    // =====================================================================
    // STEP 18: SSE_EMIT — handled by caller (server.js sseEmit)
    // =====================================================================

    // =====================================================================
    // STEP 19: SYNC_WRITE — deferred to ingest.js
    // =====================================================================

  } catch (e) {
    result.errors.push(`tick: ${e.message}`)
  }

  result.duration_ms = Date.now() - tickStart
  return result
}
