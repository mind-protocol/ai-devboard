# Live Feedback — Health: Verification Mechanics and Coverage

```
STATUS: DRAFT
CREATED: 2026-03-15
```

---

## WHEN TO USE HEALTH (NOT TESTS)

Health checks verify runtime behavior that tests cannot catch:

| Use Health For | Why |
|----------------|-----|
| Drift over time | Needs 1000+ real ticks, not fixtures |
| Ratio health | Emergent behavior, not deterministic |
| Graph-wide state | Needs real structure, not mocks |
| Production data patterns | Test fixtures can't predict real usage |

**Tests gate completion. Health monitors runtime.**

If behavior is deterministic with known inputs → write a test.
If behavior emerges from real data over time → write a health check.

See `VALIDATION_Feedback.md` for the full distinction and `verified_by.confidence: needs-health` markers.

---

## PURPOSE OF THIS FILE

This HEALTH file covers the Live Feedback module — specifically the SSE stream pipeline, salience calculation consistency, and graph-to-display synchronization. It exists to detect desynchronization between graph state and visual output, which is the primary risk of a real-time feedback system and cannot be caught by unit tests alone. This file will not verify Blood Ledger rendering correctness (visual fidelity) or physics tick engine behavior — those belong to their respective modules.

---

## WHY THIS PATTERN

Tests can verify that `computeSalience()` returns the correct value for a given input. They cannot verify that after 500 ticks of real energy propagation, the display still matches the graph. Drift — where small rounding errors, missed events, or race conditions accumulate — is the failure mode this pattern avoids. Docking-based checks at the SSE emission point and the tick input point allow us to compare "what the graph says" against "what the client received" without modifying the pipeline code. Throttling prevents health checks from becoming a performance burden on the real-time stream.

---

## HOW TO USE THIS TEMPLATE

Confirmed: full chain read (OBJECTIVES → BEHAVIORS → PATTERNS → ALGORITHM → VALIDATION → IMPLEMENTATION → SYNC).

Flows covered:
- `sse_stream_pipeline` — the primary real-time feedback path, because desynchronization here violates V1

Indicators committed to maintain:
- `graph_display_sync` — verifies V1 (display never desynchronizes from graph)
- `moment_locality` — verifies V2 (moments are local by default)
- `salience_consistency` — verifies V3 (salience formula is consistent)

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Feedback.md
PATTERNS:        ./PATTERNS_Feedback.md
BEHAVIORS:       ./BEHAVIORS_Feedback.md
ALGORITHM:       ./ALGORITHM_Feedback.md
VALIDATION:      ./VALIDATION_Feedback.md
IMPLEMENTATION:  ./IMPLEMENTATION_Feedback.md
THIS:            HEALTH_Feedback.md
SYNC:            ./SYNC_Feedback.md
```

---

## IMPLEMENTS

This HEALTH file is a **spec**. The actual code lives in runtime:

```yaml
implements:
  runtime: runtime/checks/feedback_health.js  # JS code implementing these checks
  decorator: @check                            # Decorator-based registration
```

> **Separation:** HEALTH.md defines WHAT to check and WHEN to trigger. Runtime code defines HOW to check.

> **Contract:** HEALTH checks verify input/output against VALIDATION with minimal or no code changes. After changes: update runtime or add TODO to SYNC. Run HEALTH checks at throttled rates.

---

## FLOWS ANALYSIS (TRIGGERS + FREQUENCY)

```yaml
flows_analysis:
  - flow_id: sse_stream_pipeline
    purpose: "Push graph state changes to clients as visual transforms in real time. If this flow fails, the display diverges from graph state and users make decisions on false information."
    triggers:
      - type: event
        source: "src/server/index.js:physics_tick_handler"
        notes: "tick_complete event fires after each physics tick"
    frequency:
      expected_rate: "1/sec (1 tick per second)"
      peak_rate: "10/sec (burst during catch-up after pause)"
      burst_behavior: "Events queue in Node.js event loop; SSE writes are non-blocking. Under sustained burst, event buffer grows until cap (1000 events) triggers eviction."
    risks:
      - "V1: Display desynchronizes if SSE emission silently fails"
      - "V3: Salience formula inconsistency if computed in multiple code paths"
    notes: "Crosses process boundary (server → client HTTP). SSE connection may drop and require reconnection with Last-Event-ID replay."
```

---

## HEALTH INDICATORS SELECTED

## OBJECTIVES COVERAGE

| Objective | Indicators | Why These Signals Matter |
|-----------|------------|--------------------------|
| Real-time graph-to-visual translation | graph_display_sync | Detects the core failure: display diverges from graph |
| Spatial context bias | moment_locality | If moments leak across Places, spatial context is destroyed |
| Salience-driven filtering | salience_consistency | If salience is computed inconsistently, visual prominence is unreliable |

```yaml
health_indicators:
  - name: graph_display_sync
    flow_id: sse_stream_pipeline
    priority: high
    rationale: "If display diverges from graph, users see stale or incorrect state. Directly protects V1."
  - name: moment_locality
    flow_id: sse_stream_pipeline
    priority: med
    rationale: "If moments leak across Places, spatial context model collapses. Protects V2."
  - name: salience_consistency
    flow_id: sse_stream_pipeline
    priority: med
    rationale: "If salience formula drifts between code paths, visual prominence becomes unreliable. Protects V3."
```

---

## STATUS (RESULT INDICATOR)

```yaml
status:
  stream_destination: "file://docs/feedback/HEALTH_Feedback.md"
  result:
    representation: enum
    value: UNKNOWN
    updated_at: "2026-03-15T00:00:00Z"
    source: pending
```

---

## DOCK TYPES (COMPLETE LIST)

Using standard types:
- `event` — tick_complete event subscription (dock_tick_input)
- `stream` — SSE emission output (dock_sse_emission)
- `api` — SSE connection endpoint (dock_sse_connection)
- `custom` — salience computation boundary (dock_salience_output) — custom because it is an internal pure-function boundary, not a standard IO type

---

## CHECKER INDEX

```yaml
checkers:
  - name: graph_display_sync_checker
    purpose: "Verifies that SSE-emitted state matches graph state within one tick tolerance (V1)"
    status: pending
    priority: high
  - name: moment_locality_checker
    purpose: "Verifies that Moments are only visible in their parent Place unless promoted (V2)"
    status: pending
    priority: med
  - name: salience_consistency_checker
    purpose: "Verifies that salience computation produces identical results regardless of code path (V3)"
    status: pending
    priority: med
```

---

## INDICATOR: graph_display_sync

Detects desynchronization between graph state and client-visible state. This is the most critical indicator — it protects the core value proposition of the Live Feedback module.

### VALUE TO CLIENTS & VALIDATION MAPPING

```yaml
value_and_validation:
  indicator: graph_display_sync
  client_value: "Users see accurate, real-time state. Decisions are based on truth, not stale data."
  validation:
    - validation_id: V1
      criteria: "Every graph state change affecting the active Place must appear in the visual output within one tick"
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
  semantics:
    enum: "OK = graph and display synchronized within one tick. WARN = display lags by 2-3 ticks. ERROR = display diverged by >3 ticks or missed events detected."
  aggregation:
    method: "Worst-case — if any node is desynchronized beyond threshold, overall status degrades"
    display: enum
```

### DOCKS SELECTED

```yaml
docks:
  - point: dock_tick_input
    type: event
    payload: "{ changed_nodes: NodeRef[], tick_number: int }"
  - point: dock_sse_emission
    type: stream
    payload: "SSEEvent { id, event, data: VisualTransform[] }"
```

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="graph_display_sync",
    triggers=[
        triggers.event.on("tick_complete"),
    ],
    on_problem="DISPLAY_DESYNC",
    task="fix_sse_sync",
)
def graph_display_sync(ctx) -> dict:
    """Compare last emitted SSE state against current graph state for active Places."""
    graph_state = ctx.graph.get_active_place_nodes()
    last_emitted = ctx.sse_buffer.get_last_emitted_state()
    drift = compare_states(graph_state, last_emitted)
    if drift.max_tick_lag <= 1:
        return Signal.healthy()
    if drift.max_tick_lag <= 3:
        return Signal.degraded(details={"lag": drift.max_tick_lag, "nodes": drift.drifted_nodes})
    return Signal.critical(details={"lag": drift.max_tick_lag, "nodes": drift.drifted_nodes})
```

### SIGNALS

```yaml
signals:
  healthy: "All active Place nodes have display state matching graph state within 1 tick"
  degraded: "One or more nodes have display state lagging graph by 2-3 ticks"
  critical: "One or more nodes have display state diverged from graph by >3 ticks or missing entirely"
```

### THROTTLING STRATEGY

```yaml
throttling:
  trigger: tick_complete event
  max_frequency: "1/10sec (check every 10th tick)"
  burst_limit: 3
  backoff: "Exponential backoff on repeated CRITICAL — check every 30sec, then 60sec, then 120sec"
```

### FORWARDINGS & DISPLAYS

```yaml
forwarding:
  targets:
    - location: "place://ui/triage"
      transport: event
      notes: "Desync alerts appear as spatial events in triage room (eating our own cooking)"
display:
  locations:
    - surface: UI
      location: "place://ui/triage"
      signal: "green=OK, yellow=WARN, red=ERROR"
      notes: "Alert appears as a spatial marker with pulse rate proportional to severity"
```

### MANUAL RUN

```yaml
manual_run:
  command: "node runtime/checks/feedback_health.js --check graph_display_sync"
  notes: "Run after physics tick changes, SSE pipeline modifications, or suspected desync"
```

---

## INDICATOR: moment_locality

Verifies that Moments do not leak across Place boundaries.

### VALUE TO CLIENTS & VALIDATION MAPPING

```yaml
value_and_validation:
  indicator: moment_locality
  client_value: "Each room shows only its own context. No cross-contamination of unrelated information."
  validation:
    - validation_id: V2
      criteria: "A Moment created in a Place must be visible only within that Place unless explicitly promoted to a global Narrative"
```

### HEALTH REPRESENTATION

```yaml
representation:
  allowed:
    - binary
    - enum
  selected:
    - binary
  semantics:
    binary: "1 = all Moments correctly scoped to parent Place. 0 = at least one Moment visible outside parent Place without promotion."
  aggregation:
    method: "AND — any leaked Moment fails the check"
    display: binary
```

### DOCKS SELECTED

```yaml
docks:
  - point: dock_sse_emission
    type: stream
    payload: "SSEEvent with moment data including parent place_uri"
```

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="moment_locality",
    triggers=[
        triggers.event.on("moment_created"),
    ],
    on_problem="MOMENT_LEAK",
    task="fix_moment_scope",
)
def moment_locality(ctx) -> dict:
    """Verify all Moments are scoped to their parent Place unless promoted."""
    for moment in ctx.graph.get_all_moments():
        if not moment.promoted and moment.visible_in != [moment.parent_place]:
            return Signal.critical(details={"moment": moment.id, "leaked_to": moment.visible_in})
    return Signal.healthy()
```

### SIGNALS

```yaml
signals:
  healthy: "All Moments are correctly scoped to parent Place or explicitly promoted"
  degraded: (not applicable — locality is binary)
  critical: "One or more Moments visible outside parent Place without promotion"
```

### THROTTLING STRATEGY

```yaml
throttling:
  trigger: moment_created event
  max_frequency: "1/min"
  burst_limit: 5
  backoff: "Linear — on CRITICAL, check every 5min until resolved"
```

### FORWARDINGS & DISPLAYS

```yaml
forwarding:
  targets:
    - location: "place://ui/triage"
      transport: event
      notes: "Moment leak is a critical graph integrity issue — alert in triage"
display:
  locations:
    - surface: Log
      location: "server console"
      signal: "PASS/FAIL"
      notes: "Binary pass/fail logged with leaked moment ID and destination"
```

### MANUAL RUN

```yaml
manual_run:
  command: "node runtime/checks/feedback_health.js --check moment_locality"
  notes: "Run after changes to Moment creation or Place scoping logic"
```

---

## INDICATOR: salience_consistency

Verifies that the salience formula produces identical results regardless of invocation path.

### VALUE TO CLIENTS & VALIDATION MAPPING

```yaml
value_and_validation:
  indicator: salience_consistency
  client_value: "Visual prominence is reliable — the same node always appears with the same importance."
  validation:
    - validation_id: V3
      criteria: "Salience must always be computed as Weight * Energy * Focus using the same formula in every code path"
```

### HEALTH REPRESENTATION

```yaml
representation:
  allowed:
    - binary
    - float_0_1
  selected:
    - binary
  semantics:
    binary: "1 = all salience computations produce identical results for same inputs. 0 = formula drift detected."
  aggregation:
    method: "AND — any inconsistency fails the check"
    display: binary
```

### DOCKS SELECTED

```yaml
docks:
  - point: dock_salience_output
    type: custom
    payload: "SalienceEntry[]"
```

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="salience_consistency",
    triggers=[
        triggers.cron.hourly(),
    ],
    on_problem="SALIENCE_DRIFT",
    task="fix_salience_formula",
)
def salience_consistency(ctx) -> dict:
    """Compute salience via all known code paths and compare results."""
    test_nodes = ctx.graph.sample_nodes(n=10)
    active_place = ctx.get_active_place()
    for node in test_nodes:
        canonical = node.weight * node.energy * node.focus
        computed = ctx.salience.computeSalience(node, active_place)
        if abs(canonical - computed) > 1e-9:
            return Signal.critical(details={"node": node.id, "expected": canonical, "got": computed})
    return Signal.healthy()
```

### SIGNALS

```yaml
signals:
  healthy: "All salience computations match canonical formula within floating-point tolerance"
  degraded: (not applicable — consistency is binary)
  critical: "Salience computation diverges from canonical formula"
```

### THROTTLING STRATEGY

```yaml
throttling:
  trigger: cron hourly
  max_frequency: "1/hour"
  burst_limit: 1
  backoff: "None — hourly is already infrequent"
```

### FORWARDINGS & DISPLAYS

```yaml
forwarding:
  targets:
    - location: "place://ui/triage"
      transport: event
      notes: "Salience drift means visual system is unreliable — high severity"
display:
  locations:
    - surface: Log
      location: "server console"
      signal: "PASS/FAIL"
      notes: "Binary pass/fail with details of divergence if any"
```

### MANUAL RUN

```yaml
manual_run:
  command: "node runtime/checks/feedback_health.js --check salience_consistency"
  notes: "Run after any change to salience.js or any code that computes salience"
```

---

## HOW TO RUN

```bash
# Run all health checks for this module
node runtime/checks/feedback_health.js

# Run a specific checker
node runtime/checks/feedback_health.js --check graph_display_sync
```

---

## KNOWN GAPS

- No runtime code exists yet — all checkers are pending
- V1 verification requires a running physics tick and SSE stream to validate end-to-end
- Event buffer replay correctness is not yet covered by any checker

<!-- @mind:todo Implement graph_display_sync_checker once SSE pipeline exists -->
<!-- @mind:todo Implement moment_locality_checker once Moment creation is implemented -->
<!-- @mind:todo Add checker for SSE reconnection replay correctness -->

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo All checkers are pending — implement when pipeline code exists -->
<!-- @mind:proposition Consider a synthetic load test checker that runs 1000 ticks and measures drift -->
<!-- @mind:escalation Health check throttling rates need empirical validation — are defaults safe? -->
