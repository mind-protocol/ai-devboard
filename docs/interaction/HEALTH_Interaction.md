# Interaction — Health: Verification Mechanics and Coverage

```
STATUS: DRAFT
CREATED: 2026-03-15
```

---

## WHEN TO USE HEALTH (NOT TESTS)

Health checks verify runtime behavior that tests cannot catch:

| Use Health For | Why |
|----------------|-----|
| Drift over time | Impulse accumulation behavior emerges over 100+ ticks, not fixture-predictable |
| Ratio health | Drive-to-action firing ratios are emergent, not deterministic |
| Graph-wide state | Process node impulse levels depend on real graph structure |
| Production data patterns | Real drive dynamics differ from test fixtures |

**Tests gate completion. Health monitors runtime.**

If behavior is deterministic with known inputs -> write a test.
If behavior emerges from real data over time -> write a health check.

See `VALIDATION_Interaction.md` for the full distinction and `verified_by.confidence: needs-health` markers.

---

## PURPOSE OF THIS FILE

This HEALTH file covers the Interaction module's autonomous execution path — the subconscious dispatch loop where drive pressure triggers action_commands without LLM involvement. It exists to reduce the risk of two failure modes: (1) actions firing erratically on transient spikes instead of sustained pressure, and (2) the dispatch path silently introducing LLM dependencies. This file will not verify MCP tool-specific logic (each tool has its own tests) or drive physics (covered by cognition/l1 health).

---

## WHY THIS PATTERN

Tests can verify that a single call to `dispatch_action_command()` with known inputs produces the expected result. But they cannot verify that over 500 real ticks with organic drive dynamics, actions fire at reasonable rates — not too often (erratic), not too rarely (dead). HEALTH checks dock into the dispatch flow at the threshold-crossing point and the action-result point, verifying invariants without modifying implementation files. Throttling ensures health checks don't consume more resources than the actions they monitor.

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Interaction.md
PATTERNS:        ./PATTERNS_Interaction.md
BEHAVIORS:       ./BEHAVIORS_Interaction.md
ALGORITHM:       ./ALGORITHM_Interaction.md
VALIDATION:      ./VALIDATION_Interaction.md
IMPLEMENTATION:  ./IMPLEMENTATION_Interaction.md
THIS:            HEALTH_Interaction.md
SYNC:            ./SYNC_Interaction.md
```

---

## IMPLEMENTS

This HEALTH file is a **spec**. The actual code lives in runtime:

```yaml
implements:
  runtime: runtime/checks.py
  decorator: @check
```

> **Separation:** HEALTH.md defines WHAT to check and WHEN to trigger. Runtime code defines HOW to check.

> **Contract:** HEALTH checks verify input/output against VALIDATION with minimal or no code changes. After changes: update runtime or add TODO to SYNC. Run HEALTH checks at throttled rates.

---

## FLOWS ANALYSIS (TRIGGERS + FREQUENCY)

```yaml
flows_analysis:
  - flow_id: subconscious_dispatch
    purpose: Transform sustained drive pressure into autonomous action. If this flow fails, the agent loses its motor cortex — it cannot act between LLM calls.
    triggers:
      - type: event
        source: runtime/cognition/dispatch/action_dispatch.py:dispatch_all()
        notes: Fired on every tick_complete event from the physics engine
    frequency:
      expected_rate: 1/tick (tick rate ~1/s = 60/min)
      peak_rate: 60/min (one dispatch_all per tick, ticks are rate-limited)
      burst_behavior: Tick rate is capped; no burst beyond tick frequency. Multiple actions could fire in a single dispatch_all if multiple nodes cross threshold simultaneously.
    risks:
      - V1 violation: action fires on transient spike instead of sustained pressure
      - V2 violation: LLM call introduced in dispatch path
      - V3 violation: raw output stored in graph instead of EvidenceRef
    notes: The dispatch loop runs inside the tick; health checks must not add latency to the tick path.

  - flow_id: conscious_invocation
    purpose: LLM-initiated tool execution. If this flow fails, the agent cannot use tools when it "wants" to.
    triggers:
      - type: event
        source: home_server.py:handle_mcp_request()
        notes: Fired when LLM output contains a tool invocation
    frequency:
      expected_rate: 5-20/conversation (depends on task complexity)
      peak_rate: 50/min (heavy tool use during complex tasks)
      burst_behavior: LLM can emit multiple tool calls in sequence; each is handled independently.
    risks:
      - Tool handler crash leaves graph in inconsistent state
    notes: Lower priority for health — the LLM provides its own error handling and retry.
```

---

## HEALTH INDICATORS SELECTED

## OBJECTIVES COVERAGE

| Objective | Indicators | Why These Signals Matter |
|-----------|------------|--------------------------|
| Autonomous execution without LLM | action_fire_rate, zero_llm_dispatch | These signals confirm that the subconscious path works and fires at healthy rates |
| Reflexive self-correction | reflex_response_time | Confirms reflexes respond within acceptable latency |
| Omnichannel communication | (covered by social/ health) | Not directly monitored here — SPEAK tools are channel-agnostic |

```yaml
health_indicators:
  - name: action_fire_rate
    flow_id: subconscious_dispatch
    priority: high
    rationale: If actions fire too often, the agent is erratic (V1 violated). If they never fire, the motor cortex is dead. Operators need to see that firing rate is within healthy bounds.
  - name: zero_llm_dispatch
    flow_id: subconscious_dispatch
    priority: high
    rationale: If any LLM call appears in the dispatch path, subconscious mode is broken (V2 violated). This is a binary check — any violation is critical.
  - name: evidence_ref_compliance
    flow_id: subconscious_dispatch
    priority: med
    rationale: If raw output is stored in graph nodes instead of EvidenceRef, graph performance degrades over time (V3 violated). Detectable by scanning moment nodes for oversized properties.
```

---

## STATUS (RESULT INDICATOR)

```yaml
status:
  stream_destination: .mind/health/interaction_status.json
  result:
    representation: enum
    value: UNKNOWN
    updated_at: 2026-03-15T00:00:00Z
    source: action_fire_rate
```

---

## DOCK TYPES (COMPLETE LIST)

Used in this module:
- `event` (threshold crossing, action result)
- `file` (EvidenceRef writes)
- `graph_ops` (impulse state, moment node creation)

---

## CHECKER INDEX

```yaml
checkers:
  - name: check_action_fire_rate
    purpose: Verify action_command firing rate is within healthy bounds (V1)
    status: pending
    priority: high
  - name: check_zero_llm_dispatch
    purpose: Verify subconscious dispatch path contains zero LLM calls (V2)
    status: pending
    priority: high
  - name: check_evidence_ref_compliance
    purpose: Verify no raw output blobs stored in graph nodes (V3)
    status: pending
    priority: med
```

---

## INDICATOR: action_fire_rate

Monitors the rate at which action_commands fire across all process nodes. Too high = erratic (V1 violation). Too low = dead motor cortex. Healthy range is calibrated against empirical tick data.

### VALUE TO CLIENTS & VALIDATION MAPPING

```yaml
value_and_validation:
  indicator: action_fire_rate
  client_value: Operators see whether the agent is acting autonomously at a healthy rate — not spamming actions, not frozen
  validation:
    - validation_id: V1
      criteria: Actions only fire under sustained drive pressure, not transient spikes
```

### HEALTH REPRESENTATION

```yaml
representation:
  allowed:
    - binary
    - float_0_1
    - enum
    - tuple
    - vector
  selected:
    - enum
    - float_0_1
  semantics:
    float_0_1: ratio of actual firing rate to expected healthy rate (1.0 = perfect, <0.2 = dead, >3.0 = erratic)
    enum: OK (0.2-3.0x expected), WARN (3.0-5.0x or 0.1-0.2x), ERROR (<0.1x or >5.0x)
  aggregation:
    method: worst-of across all process nodes
    display: enum (for dashboard), float_0_1 (for time-series)
```

### DOCKS SELECTED

```yaml
docks:
  - point: dock_threshold_crossed
    type: event
    payload: {node_id, action_command, impulse_at_fire, tick}
  - point: dock_action_result
    type: event
    payload: {node_id, success, duration_ms, tick}
```

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="action_fire_rate",
    triggers=[
        triggers.cron.every("5m"),
    ],
    on_problem="ACTION_FIRE_RATE_ANOMALY",
    task="investigate_action_rate",
)
def check_action_fire_rate(ctx) -> dict:
    """Verify action firing rate is within healthy bounds."""
    fires_last_window = ctx.count_events("dock_threshold_crossed", window="5m")
    ticks_last_window = ctx.count_events("tick_complete", window="5m")
    eligible_nodes = ctx.count_nodes(type="PROCESS", has="action_command")

    if ticks_last_window == 0:
        return Signal.critical(details="No ticks in window — physics engine stopped")

    rate = fires_last_window / ticks_last_window
    expected_rate = eligible_nodes * 0.01  # ~1% of eligible nodes fire per tick on average

    if expected_rate == 0:
        return Signal.healthy(details="No eligible process nodes")

    ratio = rate / expected_rate
    if 0.2 <= ratio <= 3.0:
        return Signal.healthy(details=f"Fire rate ratio: {ratio:.2f}")
    if 0.1 <= ratio < 0.2 or 3.0 < ratio <= 5.0:
        return Signal.degraded(details=f"Fire rate ratio: {ratio:.2f}")
    return Signal.critical(details=f"Fire rate ratio: {ratio:.2f}")
```

### SIGNALS

```yaml
signals:
  healthy: Fire rate ratio is between 0.2x and 3.0x of expected rate
  degraded: Fire rate ratio is between 0.1-0.2x or 3.0-5.0x of expected (drifting)
  critical: Fire rate ratio is below 0.1x (dead) or above 5.0x (erratic)
```

### THROTTLING STRATEGY

```yaml
throttling:
  trigger: cron every 5 minutes
  max_frequency: 1/5min
  burst_limit: 1
  backoff: double interval on repeated degraded/critical (max 30min)
```

### FORWARDINGS & DISPLAYS

```yaml
forwarding:
  targets:
    - location: .mind/health/interaction_status.json
      transport: file
      notes: Persistent status for Doctor to read
display:
  locations:
    - surface: CLI
      location: mind doctor output
      signal: green/yellow/red
      notes: Shows current fire rate health alongside other module health
```

### MANUAL RUN

```yaml
manual_run:
  command: python -m runtime.checks --check action_fire_rate
  notes: Run after changing impulse thresholds or drive_affinity values to verify calibration
```

---

## INDICATOR: zero_llm_dispatch

Binary check that the subconscious dispatch path contains no LLM calls. Any LLM invocation in the dispatch path is a V2 violation.

### VALUE TO CLIENTS & VALIDATION MAPPING

```yaml
value_and_validation:
  indicator: zero_llm_dispatch
  client_value: Guarantees that autonomous reflexes work without LLM — no cost, no latency, no dependency on inference availability
  validation:
    - validation_id: V2
      criteria: Complete dispatch path executes with zero LLM inference calls
```

### HEALTH REPRESENTATION

```yaml
representation:
  allowed:
    - binary
  selected:
    - binary
  semantics:
    binary: 1 = no LLM calls in dispatch path, 0 = LLM call detected
  aggregation:
    method: AND across all dispatch events
    display: binary
```

### DOCKS SELECTED

```yaml
docks:
  - point: dock_threshold_crossed
    type: event
    payload: {node_id, dispatch_trace}
```

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="zero_llm_dispatch",
    triggers=[
        triggers.cron.daily(),
        triggers.event.on("code_change", path="runtime/cognition/dispatch/*"),
    ],
    on_problem="LLM_IN_DISPATCH_PATH",
    task="remove_llm_from_dispatch",
)
def check_zero_llm_dispatch(ctx) -> dict:
    """Verify subconscious dispatch path contains no LLM calls."""
    dispatch_source = ctx.read_file("runtime/cognition/dispatch/action_dispatch.py")
    llm_patterns = ["llm_call", "inference", "claude", "openai", "anthropic", "completion"]

    for pattern in llm_patterns:
        if pattern in dispatch_source.lower():
            return Signal.critical(details=f"LLM reference found in dispatch: {pattern}")

    return Signal.healthy(details="No LLM references in dispatch path")
```

### SIGNALS

```yaml
signals:
  healthy: No LLM references found in dispatch source
  degraded: (not used — this is binary)
  critical: LLM reference detected in dispatch path
```

### THROTTLING STRATEGY

```yaml
throttling:
  trigger: daily + on code change
  max_frequency: 1/day (unless code changes)
  burst_limit: 3
  backoff: none (critical checks always run)
```

### FORWARDINGS & DISPLAYS

```yaml
forwarding:
  targets:
    - location: .mind/health/interaction_status.json
      transport: file
      notes: Critical invariant — must be visible
display:
  locations:
    - surface: CLI
      location: mind doctor output
      signal: green/red (no yellow — binary)
      notes: Any red is a critical violation requiring immediate fix
```

### MANUAL RUN

```yaml
manual_run:
  command: python -m runtime.checks --check zero_llm_dispatch
  notes: Run after any modification to the dispatch path or after adding new tool handlers
```

---

## INDICATOR: evidence_ref_compliance

Scans moment nodes produced by action dispatch to verify that action output is stored as EvidenceRef (filesystem path), not as inline text blobs.

### VALUE TO CLIENTS & VALIDATION MAPPING

```yaml
value_and_validation:
  indicator: evidence_ref_compliance
  client_value: Graph stays fast and lean — operators don't experience degraded query performance from bloated nodes
  validation:
    - validation_id: V3
      criteria: No raw code or large payloads stored in graph nodes
```

### HEALTH REPRESENTATION

```yaml
representation:
  allowed:
    - float_0_1
    - enum
  selected:
    - float_0_1
    - enum
  semantics:
    float_0_1: fraction of action-produced moment nodes that use EvidenceRef correctly (1.0 = all compliant)
    enum: OK (>0.95), WARN (0.80-0.95), ERROR (<0.80)
  aggregation:
    method: ratio of compliant nodes to total action-produced moment nodes
    display: enum
```

### DOCKS SELECTED

```yaml
docks:
  - point: dock_action_result
    type: graph_ops
    payload: {moment_node_id, properties}
```

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="evidence_ref_compliance",
    triggers=[
        triggers.cron.every("1h"),
    ],
    on_problem="INLINE_OUTPUT_IN_GRAPH",
    task="migrate_inline_to_evidence_ref",
)
def check_evidence_ref_compliance(ctx) -> dict:
    """Verify action output uses EvidenceRef, not inline storage."""
    action_moments = ctx.query_graph(
        "MATCH (m:Moment)-[:produced_by]->(p:Process) RETURN m"
    )
    total = len(action_moments)
    if total == 0:
        return Signal.healthy(details="No action moments to check")

    compliant = sum(1 for m in action_moments if m.get("evidence_ref") and len(str(m.get("stdout", ""))) < 256)
    ratio = compliant / total

    if ratio > 0.95:
        return Signal.healthy(details=f"Compliance: {ratio:.2%}")
    if ratio > 0.80:
        return Signal.degraded(details=f"Compliance: {ratio:.2%}")
    return Signal.critical(details=f"Compliance: {ratio:.2%}")
```

### SIGNALS

```yaml
signals:
  healthy: >95% of action moments use EvidenceRef correctly
  degraded: 80-95% compliance — some inline output creeping in
  critical: <80% compliance — graph bloat risk
```

### THROTTLING STRATEGY

```yaml
throttling:
  trigger: cron every 1 hour
  max_frequency: 1/hour
  burst_limit: 1
  backoff: double interval on repeated degraded (max 6h)
```

### FORWARDINGS & DISPLAYS

```yaml
forwarding:
  targets:
    - location: .mind/health/interaction_status.json
      transport: file
      notes: Tracks graph hygiene over time
display:
  locations:
    - surface: CLI
      location: mind doctor output
      signal: green/yellow/red
      notes: Shows EvidenceRef compliance percentage
```

### MANUAL RUN

```yaml
manual_run:
  command: python -m runtime.checks --check evidence_ref_compliance
  notes: Run after bulk action executions or after changing the moment node schema
```

---

## HOW TO RUN

```bash
# Run all health checks for this module
python -m runtime.checks --module interaction

# Run a specific checker
python -m runtime.checks --check action_fire_rate
python -m runtime.checks --check zero_llm_dispatch
python -m runtime.checks --check evidence_ref_compliance
```

---

## KNOWN GAPS

- V1 threshold calibration: The "sustained pressure" definition needs empirical tuning. Health check uses ratio bounds (0.2x-3.0x) but these are initial estimates.
- No checker yet for refractory period enforcement — actions that fire too frequently on the same node.
- No checker for drive_affinity consistency — verifying that process nodes have valid affinity mappings.

<!-- @mind:todo Add checker for refractory period enforcement -->
<!-- @mind:todo Add checker for drive_affinity schema validation on process nodes -->
<!-- @mind:todo Calibrate action_fire_rate bounds against empirical tick data -->

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Implement all three checkers in runtime/checks.py -->
<!-- @mind:proposition Add a time-series visualization of action_fire_rate for trend analysis -->
<!-- @mind:escalation What is the healthy firing rate? Need empirical data from real tick runs to calibrate bounds -->
