// src/server/action-dispatch.js
// Maps behavior clusters to concrete actions and dispatches them.
// Checks autonomy level before execution. Actual tool execution is stubbed —
// this is the skeleton for the dispatch loop.

// ── cluster → action type mapping ───────────────────────────────────

const CLUSTER_ACTIONS = {
  FOCUS:     ['write_code', 'read_file', 'edit_file'],
  PLAN:      ['think', 'read_file'],
  EXPLORE:   ['read_file', 'graph_query', 'search_code', 'browse_web'],
  CREATE:    ['write_file', 'generate_image'],
  REACH_OUT: ['subcall', 'post_channel', 'send_message'],
  VERIFY:    ['run_test', 'run_build', 'run_lint'],
  REFLECT:   ['think'],
  CARE:      ['think', 'subcall', 'send_message'],
  REST:      ['wait'],
  INNOVATE:  ['think'],
  ORGANIZE:  ['graph_query', 'write_file'],
  ASSESS:    ['read_file', 'think', 'graph_query'],
  CONNECT:   ['subcall', 'graph_query'],
};

// ── autonomy levels ─────────────────────────────────────────────────

const AUTONOMY = {
  read_file:       'autonomous',
  graph_query:     'autonomous',
  search_code:     'autonomous',
  think:           'autonomous',
  wait:            'autonomous',
  run_test:        'autonomous',
  run_build:       'autonomous',
  run_lint:        'autonomous',
  subcall:         'autonomous',
  write_file:      'autonomous',
  write_code:      'autonomous',
  edit_file:       'autonomous',
  post_channel:    'autonomous',
  send_message:    'autonomous',
  generate_image:  'autonomous',
  browse_web:      'autonomous',
  git_commit:      'autonomous',
  git_push:        'guarded',
  force_push:      'awake_required',
  delete_branch:   'awake_required',
  rm_rf:           'awake_required',
};

// ── target classification ───────────────────────────────────────────

/**
 * Infer the target kind from the target value.
 * Used to select the most applicable action from the cluster's list.
 *
 * @param {*} target — file path, citizen handle, space id, or null
 * @returns {'file'|'citizen'|'space'|'none'}
 */
function classifyTarget(target) {
  if (!target) return 'none';
  if (typeof target !== 'string') return 'none';
  if (target.startsWith('@'))                return 'citizen';
  if (target.startsWith('space:'))           return 'space';
  if (target.includes('/') || target.includes('.')) return 'file';
  return 'none';
}

/**
 * True when a given action is compatible with the target kind.
 * For example, write_code only makes sense when the target is a file,
 * subcall only makes sense when the target is a citizen or space.
 */
const ACTION_TARGET_COMPAT = {
  write_code:      (k) => k === 'file' || k === 'none',
  read_file:       (k) => k === 'file' || k === 'none',
  edit_file:       (k) => k === 'file',
  write_file:      (k) => k === 'file' || k === 'none',
  search_code:     (k) => k === 'file' || k === 'none',
  graph_query:     (k) => k === 'space' || k === 'citizen' || k === 'none',
  subcall:         (k) => k === 'citizen' || k === 'space' || k === 'none',
  post_channel:    (k) => k === 'citizen' || k === 'space' || k === 'none',
  send_message:    (k) => k === 'citizen',
  think:           (_) => true,
  wait:            (_) => true,
  run_test:        (k) => k === 'file' || k === 'none',
  run_build:       (k) => k === 'file' || k === 'none',
  run_lint:        (k) => k === 'file' || k === 'none',
  generate_image:  (_) => true,
  browse_web:      (_) => true,
  git_commit:      (_) => true,
  git_push:        (_) => true,
  force_push:      (_) => true,
  delete_branch:   (_) => true,
  rm_rf:           (_) => true,
};

// ── action selection ────────────────────────────────────────────────

/**
 * Pick the first applicable action from the cluster's action list.
 * "Applicable" means the action's target-compatibility check passes.
 * Falls back to the first action in the list if nothing matches.
 *
 * @param {string}  cluster — e.g. 'FOCUS'
 * @param {*}       target  — raw target value
 * @returns {string} action type — e.g. 'write_code'
 */
function selectAction(cluster, target) {
  const actions = CLUSTER_ACTIONS[cluster];
  if (!actions || actions.length === 0) return 'think';

  const kind = classifyTarget(target);

  for (const action of actions) {
    const check = ACTION_TARGET_COMPAT[action];
    if (!check || check(kind)) return action;
  }

  // nothing matched — return first action as fallback
  return actions[0];
}

// ── autonomy gate ───────────────────────────────────────────────────

/**
 * Evaluate whether an action can execute given its autonomy level
 * and the citizen's current state.
 *
 * @param {string} action       — action type
 * @param {object} citizenState — { isAwake, drives: { anxiety }, flow, ... }
 * @returns {{ canExecute: boolean, reason: string }}
 */
function checkAutonomy(action, citizenState) {
  const level = AUTONOMY[action] || 'awake_required';
  const isAwake   = !!citizenState.isAwake;
  const anxiety   = citizenState.drives?.anxiety ?? 0;
  const flow      = citizenState.flow ?? 0;
  const confidence = citizenState.confidence ?? 1;

  if (level === 'autonomous') {
    return { canExecute: true, reason: 'autonomous' };
  }

  if (level === 'guarded') {
    if (isAwake) {
      return { canExecute: true, reason: 'guarded — citizen is awake' };
    }
    if (anxiety < 0.7 && flow > 0.3) {
      return { canExecute: true, reason: 'guarded — low anxiety, sufficient flow' };
    }
    return { canExecute: false, reason: 'guarded — queued (citizen asleep, anxiety >= 0.7 or flow <= 0.3)' };
  }

  // awake_required
  if (!isAwake) {
    return { canExecute: false, reason: 'awake_required — citizen is asleep, queued' };
  }
  if (confidence < 0.7) {
    return { canExecute: false, reason: 'awake_required — low confidence, oracle subcall needed' };
  }
  return { canExecute: true, reason: 'awake_required — citizen awake with sufficient confidence' };
}

// ── oracle subcall check ────────────────────────────────────────────

/**
 * Determine whether the citizen should auto-subcall the oracle.
 * Returns true if the action is awake_required, or if the action is guarded
 * and the citizen is anxious with low flow.
 *
 * @param {object} citizenState — { drives: { anxiety }, flow, ... }
 * @param {string} action       — action type
 * @returns {boolean}
 */
export function shouldSubcallOracle(citizenState, action) {
  const level   = AUTONOMY[action] || 'awake_required';
  const anxiety = citizenState.drives?.anxiety ?? 0;
  const flow    = citizenState.flow ?? 0;

  if (level === 'awake_required') return true;
  if (level === 'guarded' && anxiety > 0.5 && flow < 0.4) return true;
  return false;
}

// ── action description stubs ────────────────────────────────────────

/**
 * Describe what an action WOULD do. Actual execution is deferred —
 * this is the skeleton for the dispatch loop.
 *
 * @param {string} action  — action type
 * @param {*}      target  — file, citizen, space, or null
 * @param {string} cluster — originating cluster
 * @returns {string} human-readable description
 */
function describeAction(action, target, cluster) {
  const t = target || '(no target)';
  const descriptions = {
    write_code:     `Write code to ${t}`,
    read_file:      `Read file ${t}`,
    edit_file:      `Edit file ${t}`,
    write_file:     `Write file ${t}`,
    search_code:    `Search codebase for ${t}`,
    graph_query:    `Query graph about ${t}`,
    subcall:        `Subcall to ${t}`,
    post_channel:   `Post to channel about ${t}`,
    send_message:   `Send message to ${t}`,
    think:          `Think about ${t} (${cluster})`,
    wait:           `Wait — resting`,
    run_test:       `Run tests for ${t}`,
    run_build:      `Run build for ${t}`,
    run_lint:       `Run lint for ${t}`,
    generate_image: `Generate image: ${t}`,
    browse_web:     `Browse web for ${t}`,
    git_commit:     `Git commit: ${t}`,
    git_push:       `Git push: ${t}`,
    force_push:     `Force push: ${t}`,
    delete_branch:  `Delete branch: ${t}`,
    rm_rf:          `Remove: ${t}`,
  };
  return descriptions[action] || `${action} on ${t}`;
}

// ── main dispatch ───────────────────────────────────────────────────

/**
 * Dispatch an action based on behavior cluster, target, and citizen state.
 *
 * 1. Select the best action for the cluster + target combo
 * 2. Check autonomy level against citizen state
 * 3. Execute (log) or queue
 *
 * @param {object} redis        — Redis client (unused in skeleton)
 * @param {object} graph        — FalkorDB graph handle (unused in skeleton)
 * @param {string} cluster      — behavior cluster name (e.g. 'FOCUS')
 * @param {*}      target       — file path, citizen handle, space id, or null
 * @param {object} citizenState — full citizen state object
 * @returns {{ action: string, target: *, autonomy: string, executed: boolean, queued: boolean, result: * }}
 */
export function dispatchAction(redis, graph, cluster, target, citizenState) {
  // 1. Select action
  const action = selectAction(cluster, target);
  const autonomyLevel = AUTONOMY[action] || 'awake_required';

  // 2. Check autonomy
  const { canExecute, reason } = checkAutonomy(action, citizenState);

  // 3. Check if oracle subcall is needed
  const needsOracle = !canExecute && shouldSubcallOracle(citizenState, action);

  // 4. Build result
  if (canExecute) {
    // Autonomous or cleared — describe what would be done
    const description = describeAction(action, target, cluster);
    return {
      action,
      target,
      autonomy: autonomyLevel,
      executed: true,
      queued: false,
      result: { description, reason },
    };
  }

  // Cannot execute — queue it
  return {
    action,
    target,
    autonomy: autonomyLevel,
    executed: false,
    queued: true,
    result: {
      description: describeAction(action, target, cluster),
      reason,
      needsOracle,
    },
  };
}
