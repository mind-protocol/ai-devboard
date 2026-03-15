// src/server/sentence-maker.js
// Materializes a citizen's intention into a natural language sentence.

const TEMPLATES = {
  FOCUS:     (t, m) => `${m}continue working on ${t}`,
  PLAN:      (t, m) => `${m}figure out the next steps for ${t}`,
  EXPLORE:   (t, m) => `${m}look into ${t} to understand it better`,
  CREATE:    (t, m) => `${m}create ${t}`,
  REACH_OUT: (t, m, sub) => `${m}reach out ${sub} about ${t}`,
  VERIFY:    (t, m) => `${m}verify that ${t} works correctly`,
  REFLECT:   (t, m) => `${m}think about ${t} and what it means`,
  CARE:      (t, m) => `${m}check on partner — ${t}`,
  REST:      (t, m) => `${m}take a moment to process`,
  INNOVATE:  (t, m) => `${m}think about new approaches to ${t}`,
  ORGANIZE:  (t, m) => `${m}organize the work around ${t}`,
  ASSESS:    (t, m) => `${m}evaluate the quality of ${t}`,
  CONNECT:   (t, m) => `${m}see who's working on ${t} and connect`,
};

/**
 * Infer the sub-intent for REACH_OUT based on citizen drive state.
 * @param {object} citizenState — citizen's current drive/emotion state
 * @returns {string} sub-intent phrase
 */
export function inferReachOutSubIntent(citizenState) {
  const drives = citizenState?.drives || {};
  const frustration  = drives.frustration  ?? 0;
  const affiliation  = drives.affiliation  ?? 0;
  const boredom      = drives.boredom      ?? 0;
  const satisfaction  = drives.satisfaction ?? 0;
  const achievement   = drives.achievement ?? 0;
  const anxiety       = drives.anxiety     ?? 0;

  if (frustration > 0.5 && affiliation > 0.3) return 'for help';
  if (affiliation > 0.6 && boredom > 0.3)     return 'for connection';
  if (satisfaction > 0.5 && achievement > 0.4) return 'to share progress';
  if (anxiety > 0.4)                           return 'to validate';
  return 'to coordinate';
}

/**
 * Materialize a citizen's intention into a natural language sentence.
 * @param {string} cluster — intention cluster (FOCUS, PLAN, REACH_OUT, etc.)
 * @param {object|null} target — target node ({ name, ... }) or null
 * @param {object} citizenState — citizen's current drive/emotion state
 * @returns {string} natural language sentence
 */
export function makeSentence(cluster, target, citizenState) {
  const drives  = citizenState?.drives || {};
  const arousal = citizenState?.arousal ?? 0;

  // 1. Target name
  const targetName = target?.name || 'the current work';

  // 2. Modifier from drives
  let modifier = '';
  if ((drives.frustration ?? 0) > 0.6)       modifier = 'urgently ';
  else if ((drives.anxiety ?? 0) > 0.5)      modifier = 'carefully ';
  else if ((drives.boredom ?? 0) > 0.5)       modifier = 'curiously ';
  else if ((drives.satisfaction ?? 0) > 0.6)  modifier = 'confidently ';

  // 3. Build sentence from template
  const templateFn = TEMPLATES[cluster];
  let sentence;

  if (!templateFn) {
    sentence = `${modifier}work on ${targetName}`;
  } else if (cluster === 'REACH_OUT') {
    const subIntent = inferReachOutSubIntent(citizenState);
    sentence = templateFn(targetName, modifier, subIntent);
  } else {
    sentence = templateFn(targetName, modifier);
  }

  // 4. If arousal > 0.6, prepend dominant emotional state
  if (arousal > 0.6) {
    const dominant = getDominantEmotion(drives);
    if (dominant) {
      sentence = `${dominant} — ${sentence}`;
    }
  }

  // 5. If citizen has active desires, append top desire synthesis
  const desires = citizenState?.desires;
  if (desires && desires.length > 0) {
    let topDesire = desires[0];
    if (typeof topDesire === 'object') topDesire = topDesire.text || topDesire.name || String(topDesire);
    if (topDesire.length > 60) topDesire = topDesire.slice(0, 60);
    sentence = `${sentence} — ${topDesire}`;
  }

  return sentence;
}

/**
 * Determine the dominant emotion label from drive values.
 * @param {object} drives
 * @returns {string|null}
 */
function getDominantEmotion(drives) {
  const candidates = [
    ['frustrated',  drives.frustration  ?? 0],
    ['anxious',     drives.anxiety      ?? 0],
    ['bored',       drives.boredom      ?? 0],
    ['satisfied',   drives.satisfaction ?? 0],
    ['curious',     drives.curiosity    ?? 0],
    ['restless',    drives.restlessness ?? 0],
  ];

  let best = null;
  let bestVal = 0;
  for (const [label, val] of candidates) {
    if (val > bestVal) {
      best = label;
      bestVal = val;
    }
  }
  return best;
}
