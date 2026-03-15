# Process — Health: Verification Mechanics and Coverage

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

If behavior is deterministic with known inputs -> write a test.
If behavior emerges from real data over time -> write a health check.

See `VALIDATION_Process.md` for the full distinction and `verified_by.confidence: needs-health` markers.

---

## PURPOSE OF THIS FILE

This HEALTH file covers the Process module — impulse accumulation, process firing, birth seeding, and consolidation. It exists to detect drift in reflexive behavior: processes that never fire, processes that fire too often, citizens born without reflexes, and LLM calls sneaking into the dispatch path. These are runtime phenomena that unit tests cannot observe.

Boundaries: this file does NOT verify drive state correctness (see Drives health), graph integrity (see Graph health), or LLM reasoning quality (see Cognition health).

---

## WHY THIS PATTERN

Process health is separate from tests because the critical failure modes are emergent: a process that technically works in isolation but never fires in production because drive pressure never reaches it, or a birth template that passes tests but produces citizens whose processes are immediately overridden. Docking-based checks observe real tick behavior with minimal performance impact. Throttling prevents the health system from becoming a load on the physics tick it monitors.

---

## HOW TO USE THIS TEMPLATE

1. Full chain read: OBJECTIVES -> BEHAVIORS -> PATTERNS -> ALGORITHM -> VALIDATION -> IMPLEMENTATION -> SYNC.
2. Covering two flows: impulse_accumulation (the core loop) and birth_seeding (the initialization guarantee).
3. Three indicators maintained: process_firing_health, birth_completeness, llm_free_dispatch.

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Process.md
PATTERNS:        ./PATTERNS_Process.md
BEHAVIORS:       ./BEHAVIORS_Process.md
ALGORITHM:       ./ALGORITHM_Process.md
VALIDATION:      ./VALIDATION_Process.md
IMPLEMENTATION:  ./IMPLEMENTATION_Process.md
THIS:            HEALTH_Process.md
SYNC:            ./SYNC_Process.md
```

---

## IMPLEMENTS

This HEALTH file is a **spec**. The actual code lives in runtime:

```yaml
implements:
  runtime: runtime/checks.py       # Python code implementing these checks
  decorator: @check                # Decorator-based registration
```

> **Separation:** HEALTH.md defines WHAT to check and WHEN to trigger. Runtime code defines HOW to check.

> **Contract:** HEALTH checks verify input/output against VALIDATION with minimal or no code changes. After changes: update runtime or add TODO to SYNC. Run HEALTH checks at throttled rates.

---

## FLOWS ANALYSIS (TRIGGERS + FREQUENCY)

```yaml
flows_analysis:
  - flow_id: impulse_accumulation
    purpose: If this flow fails, citizens lose all reflexive behavior and subconscious survival
    triggers:
      - type: schedule
        source: physics tick loop (server main loop)
        notes: fires every tick for every citizen
    frequency:
      expected_rate: 1/tick per citizen (10-60/min depending on tick rate)
      peak_rate: 60/min per citizen
      burst_behavior: tick loop is synchronous — no bursting, but slow ticks cause backpressure
    risks:
      - V1 violation: processes fire without drive pressure
      - V2 violation: process firing blocked when LLM budget exhausted
      - V4 violation: LLM calls introduced into dispatch path
    notes: this is the core flow — if it stops, the module is dead

  - flow_id: birth_seeding
    purpose: If this flow fails, new citizens have no survival reflexes
    triggers:
      - type: event
        source: citizen.created event
        notes: fires once per citizen creation
    frequency:
      expected_rate: <1/day (citizens created infrequently)
      peak_rate: 10/hour (batch citizen creation during seeding)
      burst_behavior: no burst risk — seeding is idempotent
    risks:
      - V3 violation: citizen created with zero process nodes
    notes: low frequency but high impact — one miss means a defenseless citizen
```

---

## HEALTH INDICATORS SELECTED

## OBJECTIVES COVERAGE

| Objective | Indicators | Why These Signals Matter |
|-----------|------------|--------------------------|
| Zero-LLM reflexive behavior | process_firing_health, llm_free_dispatch | Confirms processes fire and do so without LLM cost |
| Subconscious survival | process_firing_health | Confirms firing continues under budget exhaustion |
| Durable knowledge encoding | process_firing_health | Firing frequency shows knowledge is being used |
| Birth guarantee | birth_completeness | Every citizen starts with reflexes |

```yaml
health_indicators:
  - name: process_firing_health
    flow_id: impulse_accumulation
    priority: high
    rationale: Citizens without firing processes have no subconscious — they are inert during budget exhaustion
  - name: birth_completeness
    flow_id: birth_seeding
    priority: high
    rationale: A citizen born without reflexes may never develop them, leading to silent failure
  - name: llm_free_dispatch
    flow_id: impulse_accumulation
    priority: high
    rationale: LLM calls in the dispatch path defeat the entire purpose of zero-budget reflexes
```

---

## STATUS (RESULT INDICATOR)

```yaml
status:
  stream_destination: runtime/health/process_status.json
  result:
    representation: enum
    value: UNKNOWN
    updated_at: 2026-03-15T00:00:00Z
    source: process_firing_health
```

---

## DOCK TYPES (COMPLETE LIST)

Types used in this module:
- `event` (physics tick, citizen.created)
- `graph_ops` (process node creation, impulse updates)
- `process` (shell command dispatch)

---

## CHECKER INDEX

```yaml
checkers:
  - name: process_firing_health
    purpose: Verify processes are firing at healthy rates from drive pressure (V1, V2)
    status: pending
    priority: high
  - name: birth_completeness
    purpose: Verify every citizen has minimum viable process nodes after seeding (V3)
    status: pending
    priority: high
  - name: llm_free_dispatch
    purpose: Verify no LLM calls occur in the process dispatch path (V4)
    status: pending
    priority: high
```

---

## INDICATOR: process_firing_health

Monitors whether process nodes are accumulating impulse and firing at healthy rates. A citizen with processes that never fire has a dead subconscious. A citizen whose processes fire every tick has runaway reflexes.

### VALUE TO CLIENTS & VALIDATION MAPPING

```yaml
value_and_validation:
  indicator: process_firing_health
  client_value: Citizens maintain reflexive behavior — health checks run, exploration happens, help is sought when needed
  validation:
    - validation_id: V1
      criteria: Every firing traces to non-zero drive pressure
    - validation_id: V2
      criteria: Firing continues when LLM budget is zero
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
    float_0_1: ratio of citizens with at least one process firing in the last 100 ticks
    enum: OK (>0.8), WARN (0.5-0.8), ERROR (<0.5)
  aggregation:
    method: minimum across all citizens — one citizen with zero firings triggers WARN
    display: enum surfaced to operators
```

### DOCKS SELECTED

```yaml
docks:
  - point: dock_threshold_crossed
    type: event
    payload: "{process_id, action_command, drive_snapshot}"
  - point: dock_dispatch_result
    type: process
    payload: "{process_id, exit_code, duration}"
```

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="process_firing_health",
    triggers=[
        triggers.cron.every("5min"),
    ],
    on_problem="PROCESS_NOT_FIRING",
    task="investigate_silent_processes",
)
def process_firing_health(ctx) -> dict:
    """Check that processes are firing at healthy rates across citizens."""
    citizens = ctx.graph.get_all_citizens()
    firing_citizens = 0
    for citizen in citizens:
        processes = ctx.graph.get_process_nodes(citizen.id)
        recent_fires = [p for p in processes if p.last_fired and p.last_fired > ctx.window_start]
        if recent_fires:
            firing_citizens += 1
    ratio = firing_citizens / len(citizens) if citizens else 0
    if ratio > 0.8:
        return Signal.healthy(ratio=ratio)
    if ratio > 0.5:
        return Signal.degraded(ratio=ratio, details="Some citizens have silent processes")
    return Signal.critical(ratio=ratio, details="Majority of citizens have no firing processes")
```

### SIGNALS

```yaml
signals:
  healthy: >80% of citizens have at least one process firing in the observation window
  degraded: 50-80% of citizens have firing processes — some are going silent
  critical: <50% of citizens have firing processes — subconscious layer is failing
```

### THROTTLING STRATEGY

```yaml
throttling:
  trigger: cron every 5 minutes
  max_frequency: 1/5min
  burst_limit: 1
  backoff: double interval on consecutive degraded signals (max 30min)
```

### FORWARDINGS & DISPLAYS

```yaml
forwarding:
  targets:
    - location: runtime/health/process_status.json
      transport: file
      notes: persisted for Doctor to read
display:
  locations:
    - surface: CLI
      location: mind doctor output
      signal: green/yellow/red
      notes: shows firing ratio and silent citizen count
```

### MANUAL RUN

```yaml
manual_run:
  command: python -m runtime.checks process_firing_health
  notes: run after adjusting IMPULSE_RATE or threshold values to verify effect
```

---

## INDICATOR: birth_completeness

Verifies that every citizen in the graph has the minimum viable set of process nodes (check_health, explore_codebase, ask_for_help, refactor_simplify).

### VALUE TO CLIENTS & VALIDATION MAPPING

```yaml
value_and_validation:
  indicator: birth_completeness
  client_value: No citizen is born defenseless — all have survival reflexes from tick one
  validation:
    - validation_id: V3
      criteria: Every citizen has at least check_health, explore_codebase, ask_for_help, refactor_simplify
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
    binary: 1 = all citizens have all 4 birth processes, 0 = at least one citizen is missing processes
  aggregation:
    method: AND across all citizens — one missing process = failure
    display: binary pass/fail
```

### DOCKS SELECTED

```yaml
docks:
  - point: dock_seed_complete
    type: graph_ops
    payload: "{citizen_id, process_count, process_names}"
```

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="birth_completeness",
    triggers=[
        triggers.event.on("citizen.created"),
        triggers.cron.daily(),
    ],
    on_problem="CITIZEN_MISSING_PROCESSES",
    task="reseed_citizen_processes",
)
def birth_completeness(ctx) -> dict:
    """Check that all citizens have minimum viable process nodes."""
    required = {"check_health", "explore_codebase", "ask_for_help", "refactor_simplify"}
    citizens = ctx.graph.get_all_citizens()
    incomplete = []
    for citizen in citizens:
        processes = ctx.graph.get_process_nodes(citizen.id)
        names = {p.name for p in processes}
        missing = required - names
        if missing:
            incomplete.append({"citizen": citizen.id, "missing": list(missing)})
    if not incomplete:
        return Signal.healthy()
    return Signal.critical(details=incomplete)
```

### SIGNALS

```yaml
signals:
  healthy: all citizens have all 4 birth processes
  degraded: not applicable — this is binary
  critical: at least one citizen is missing birth processes
```

### THROTTLING STRATEGY

```yaml
throttling:
  trigger: citizen.created event + daily sweep
  max_frequency: 1/min (event-driven), 1/day (sweep)
  burst_limit: 10
  backoff: none — birth issues are always critical
```

### FORWARDINGS & DISPLAYS

```yaml
forwarding:
  targets:
    - location: runtime/health/process_status.json
      transport: file
      notes: persisted for Doctor
display:
  locations:
    - surface: CLI
      location: mind doctor output
      signal: green/red
      notes: lists citizens missing processes
```

### MANUAL RUN

```yaml
manual_run:
  command: python -m runtime.checks birth_completeness
  notes: run after batch citizen creation to verify seeding
```

---

## INDICATOR: llm_free_dispatch

Verifies that no LLM API calls occur during process dispatch. This protects V4 — the zero-LLM execution guarantee.

### VALUE TO CLIENTS & VALIDATION MAPPING

```yaml
value_and_validation:
  indicator: llm_free_dispatch
  client_value: Process execution costs zero tokens — subconscious is truly free
  validation:
    - validation_id: V4
      criteria: action_command dispatch bypasses all LLM calls
```

### HEALTH REPRESENTATION

```yaml
representation:
  allowed:
    - binary
  selected:
    - binary
  semantics:
    binary: 1 = no LLM calls detected in dispatch path, 0 = LLM call detected
  aggregation:
    method: AND — any LLM call in dispatch = failure
    display: binary pass/fail
```

### DOCKS SELECTED

```yaml
docks:
  - point: dock_dispatch_result
    type: process
    payload: "{process_id, exit_code, llm_calls_count}"
```

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="llm_free_dispatch",
    triggers=[
        triggers.cron.every("15min"),
    ],
    on_problem="LLM_IN_DISPATCH_PATH",
    task="remove_llm_from_dispatch",
)
def llm_free_dispatch(ctx) -> dict:
    """Verify no LLM calls occur during process dispatch."""
    recent_dispatches = ctx.metrics.get("process_dispatch", window=ctx.window)
    llm_calls = [d for d in recent_dispatches if d.get("llm_calls_count", 0) > 0]
    if not llm_calls:
        return Signal.healthy()
    return Signal.critical(
        details=f"{len(llm_calls)} dispatches included LLM calls",
        violations=llm_calls
    )
```

### SIGNALS

```yaml
signals:
  healthy: zero LLM calls in all recent process dispatches
  degraded: not applicable — this is binary
  critical: any LLM call detected in dispatch path
```

### THROTTLING STRATEGY

```yaml
throttling:
  trigger: cron every 15 minutes
  max_frequency: 1/15min
  burst_limit: 1
  backoff: none — LLM-in-dispatch is always critical
```

### FORWARDINGS & DISPLAYS

```yaml
forwarding:
  targets:
    - location: runtime/health/process_status.json
      transport: file
      notes: persisted for Doctor
display:
  locations:
    - surface: CLI
      location: mind doctor output
      signal: green/red
      notes: flags any LLM call in dispatch as critical violation
```

### MANUAL RUN

```yaml
manual_run:
  command: python -m runtime.checks llm_free_dispatch
  notes: run after modifying dispatch code to verify no LLM dependencies introduced
```

---

## HOW TO RUN

```bash
# Run all health checks for this module
python -m runtime.checks --module process

# Run a specific checker
python -m runtime.checks process_firing_health
python -m runtime.checks birth_completeness
python -m runtime.checks llm_free_dispatch
```

---

## KNOWN GAPS

- V5 (consolidation requires proven success) has no health checker yet — consolidation is not implemented
- No health check for impulse decay — stale impulse from drives that receded could cause delayed false firings

<!-- @mind:todo Add consolidation_integrity checker when Law 6 is implemented -->
<!-- @mind:todo Add impulse_staleness checker to detect accumulated impulse from stale drive pressure -->

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Implement all three checkers in runtime/checks.py -->
<!-- @mind:proposition Add per-process firing frequency indicator for fine-grained monitoring -->
<!-- @mind:escalation Determine acceptable firing ratio thresholds through empirical observation -->
