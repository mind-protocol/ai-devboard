// src/server/behavior-scorer.js
// Scores 13 behavior clusters from citizen state, applies emotional bias,
// and performs weighted random selection. Pure math — no DB access.

// ── helpers ──────────────────────────────────────────────────────────

/**
 * Approximate desire alignment.
 * If the citizen has desires, return the max of (desire.energy * desire.weight).
 * Falls back to 0.5 when no desires are available.
 */
function desireAlignment(s) {
  const desires = s.desires;
  if (!desires || !Array.isArray(desires) || desires.length === 0) return 0.5;
  let max = 0;
  for (const d of desires) {
    const v = (d.energy || 0) * (d.weight || 0);
    if (v > max) max = v;
  }
  return max;
}

/**
 * Mean partner_relevance of nearby nodes where partner_relevance > 0.3.
 * Returns 0.1 when none qualify.
 */
function partnerRelevance(s) {
  const nearby = s.nearbyNodes;
  if (!nearby || !Array.isArray(nearby) || nearby.length === 0) return 0.1;
  const relevant = nearby.filter((n) => (n.partner_relevance || 0) > 0.3);
  if (relevant.length === 0) return 0.1;
  return relevant.reduce((sum, n) => sum + n.partner_relevance, 0) / relevant.length;
}

/**
 * Sum of energy across nearby nodes that are partner-relevant (> 0.3).
 * Returns 0 when none qualify.
 */
function partnerEnergy(s) {
  const nearby = s.nearbyNodes;
  if (!nearby || !Array.isArray(nearby) || nearby.length === 0) return 0;
  return nearby
    .filter((n) => (n.partner_relevance || 0) > 0.3)
    .reduce((sum, n) => sum + (n.energy || 0), 0);
}

/**
 * Mean care_affinity of nearby nodes where care_affinity > 0.3.
 * Defaults to 0.3 when none qualify.
 */
function careAffinityMean(s) {
  const nearby = s.nearbyNodes;
  if (!nearby || !Array.isArray(nearby) || nearby.length === 0) return 0.3;
  const caring = nearby.filter((n) => (n.care_affinity || 0) > 0.3);
  if (caring.length === 0) return 0.3;
  return caring.reduce((sum, n) => sum + n.care_affinity, 0) / caring.length;
}

// ── cluster formulas ─────────────────────────────────────────────────

const CLUSTERS = {
  FOCUS: (s) =>
    s.drives.achievement *
    (1 - s.drives.frustration) *
    s.flow *
    (s.currentTask?.energy || 0),

  PLAN: (s) =>
    s.drives.achievement *
    (1 - s.flow) *
    (1 - s.drives.boredom) *
    (1 + (s.currentTask?.friction || 0)),

  EXPLORE: (s) =>
    s.drives.curiosity *
    (1 - s.flow) *
    (1 - s.drives.anxiety) *
    (1 + s.drives.boredom * 0.5),

  CREATE: (s) =>
    s.drives.achievement *
    s.drives.satisfaction *
    (1 - s.drives.anxiety) *
    desireAlignment(s),

  REACH_OUT: (s) =>
    s.drives.affiliation *
    (1 + s.drives.frustration * 0.5) *
    (1 + s.drives.boredom * 0.3) *
    (1 - s.drives.self_preservation * 0.5),

  VERIFY: (s) =>
    s.drives.self_preservation *
    (1 + s.drives.anxiety) *
    (1 - s.drives.boredom) *
    (s.currentTask?.weight || 0.3),

  REFLECT: (s) =>
    (s.drives.satisfaction + s.drives.frustration) *
    (1 - s.arousal) *
    (1 - s.drives.boredom) *
    0.5,

  CARE: (s) =>
    s.drives.affiliation *
    partnerRelevance(s) *
    (1 + partnerEnergy(s)) *
    careAffinityMean(s),

  REST: (s) =>
    s.arousal *
    s.drives.anxiety *
    (1 + s.drives.frustration * 0.5) *
    (1 - s.drives.satisfaction),

  INNOVATE: (s) =>
    s.drives.curiosity *
    s.drives.boredom *
    (1 - s.drives.anxiety) *
    (1 - s.drives.self_preservation),

  ORGANIZE: (s) =>
    s.drives.self_preservation *
    (1 + s.drives.frustration * 0.3) *
    (1 - s.drives.curiosity * 0.5) *
    (1 - s.drives.boredom),

  ASSESS: (s) =>
    (s.drives.achievement + s.drives.self_preservation) *
    0.5 *
    (1 + s.drives.frustration * 0.3) *
    s.flow *
    (1 - s.drives.boredom),

  CONNECT: (s) =>
    s.drives.affiliation *
    (s.drives.curiosity + s.drives.boredom) *
    0.5 *
    (1 - s.drives.anxiety) *
    (1 - s.drives.frustration * 0.5),
};

// ── core API ─────────────────────────────────────────────────────────

/**
 * Score all 13 behavior clusters for a given citizen state.
 * @param {object} citizenState — drives, flow, arousal, currentTask, desires, nearbyNodes
 * @returns {object} map of cluster name → raw score (float)
 */
export function scoreBehaviors(citizenState) {
  const scores = {};
  for (const [name, fn] of Object.entries(CLUSTERS)) {
    scores[name] = fn(citizenState);
  }
  return scores;
}

// ── emotional bias ───────────────────────────────────────────────────

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Apply emotional bias from recent moments.
 * For each cluster, accumulate valence from moments tagged with that cluster
 * within the last 24 hours, then scale the score.
 *
 * @param {object} scores — cluster name → raw score
 * @param {Array}  recentMoments — array of { cluster, valence, timestamp }
 * @returns {object} cluster name → biased score
 */
export function applyEmotionalBias(scores, recentMoments) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const biased = { ...scores };

  // accumulate valence sums per cluster
  const valenceSums = {};
  if (Array.isArray(recentMoments)) {
    for (const m of recentMoments) {
      if (!m.cluster || (m.timestamp && m.timestamp < cutoff)) continue;
      valenceSums[m.cluster] = (valenceSums[m.cluster] || 0) + (m.valence || 0);
    }
  }

  for (const cluster of Object.keys(biased)) {
    const vs = valenceSums[cluster] || 0;
    biased[cluster] *= clamp(1.0 + vs * 0.3, 0.2, 2.0);
  }

  return biased;
}

// ── selection ────────────────────────────────────────────────────────

/**
 * Weighted random selection from scored clusters.
 * Normalizes scores to probabilities and picks one, biased toward higher scores.
 *
 * @param {object} scores — cluster name → score (non-negative)
 * @returns {{ cluster: string, score: number, probability: number }}
 */
export function selectBehavior(scores) {
  const entries = Object.entries(scores);
  const total = entries.reduce((sum, [, v]) => sum + Math.max(0, v), 0);

  // edge case: all scores zero — pick uniformly
  if (total === 0) {
    const idx = Math.floor(Math.random() * entries.length);
    return {
      cluster: entries[idx][0],
      score: 0,
      probability: 1 / entries.length,
    };
  }

  const r = Math.random() * total;
  let cumulative = 0;
  for (const [cluster, raw] of entries) {
    const score = Math.max(0, raw);
    cumulative += score;
    if (r <= cumulative) {
      return { cluster, score, probability: score / total };
    }
  }

  // float-precision fallback — return last entry
  const last = entries[entries.length - 1];
  return {
    cluster: last[0],
    score: Math.max(0, last[1]),
    probability: Math.max(0, last[1]) / total,
  };
}
