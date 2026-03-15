# SubEntity — Health: Verification Mechanics and Coverage

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

See `VALIDATION_SubEntity.md` for the full distinction and `verified_by.confidence: needs-health` markers.

---

## PURPOSE OF THIS FILE

This HEALTH file covers the SubEntity module's runtime verification — ensuring that zero-LLM exploration, energy conservation, sibling divergence, and continuous crystallization hold true under real graph conditions and at scale.

It exists because SubEntity behavior is emergent: sibling divergence depends on real graph topology, fatigue thresholds interact with actual embedding distributions, and energy conservation must hold across thousands of steps with varying criticality values. Test fixtures cannot replicate these conditions.

Boundaries: this file does not verify graph schema correctness, global energy propagation, or Macro-Crystallization (Law 10) node generation quality. Those belong to their respective module health files.

---

## WHY THIS PATTERN

Tests can verify that score_link() returns the correct value for a given input. They cannot verify that siblings actually diverge over 200 steps on a real graph, or that energy injection sums match the expected formula across a full exploration lifecycle. HEALTH checks dock at runtime observation points declared in IMPLEMENTATION to verify these emergent properties without modifying the SubEntity code itself.

Docking-based checks are the right tradeoff because SubEntity runs in tight loops (many steps per exploration). Inline assertions would add overhead to every step. Docked health checks run at throttled intervals, sampling behavior without impacting performance.

Throttling protects performance: SubEntities may execute hundreds of steps per second. Health checks sample at most once per minute during active exploration, avoiding interference with the zero-LLM performance promise.

---

## HOW TO USE THIS TEMPLATE

Confirmed: full chain read (OBJECTIVES through SYNC). Flows covered: exploration_lifecycle (the only flow, covering spawn through merge). Indicators committed: zero_llm_compliance, energy_conservation, sibling_divergence_health, crystallization_continuity.

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_SubEntity.md
PATTERNS:        ./PATTERNS_SubEntity.md
BEHAVIORS:       ./BEHAVIORS_SubEntity.md
ALGORITHM:       ./ALGORITHM_SubEntity.md
VALIDATION:      ./VALIDATION_SubEntity.md
IMPLEMENTATION:  ./IMPLEMENTATION_SubEntity.md
THIS:            HEALTH_SubEntity.md (you are here)
SYNC:            ./SYNC_SubEntity.md
```

---

## IMPLEMENTS

This HEALTH file is a **spec**. The actual code lives in runtime:

```yaml
implements:
  runtime: runtime/checks/subentity_health.py
  decorator: @check
```

> **Separation:** HEALTH.md defines WHAT to check and WHEN to trigger. Runtime code defines HOW to check.

> **Contract:** HEALTH checks verify input/output against VALIDATION with minimal or no code changes. After changes: update runtime or add TODO to SYNC. Run HEALTH checks at throttled rates.

---

## FLOWS ANALYSIS (TRIGGERS + FREQUENCY)

The exploration_lifecycle flow is the only flow in this module. It matters because every SubEntity traversal injects energy, modifies crystallization, and potentially generates graph nodes.

```yaml
flows_analysis:
  - flow_id: exploration_lifecycle
    purpose: If this flow fails, SubEntities produce incorrect energy traces, stale crystallization, or converging siblings — all of which corrupt the graph's thermal and semantic state
    triggers:
      - type: event
        source: runtime/physics/exploration.py:ExplorationManager.spawn()
        notes: Triggered by /subcall command or graph_query API call
    frequency:
      expected_rate: 10-50/min
      peak_rate: 200/min
      burst_behavior: Multiple SubEntities spawned in parallel during complex /subcall operations. ExplorationManager processes them concurrently. No backpressure mechanism — relies on fatigue-based stopping to limit duration.
    risks:
      - V1 violation — LLM call introduced in scoring or state logic
      - V2 violation — energy injection not matching formula during state transitions
      - V3 violation — siblings converging on same links under high concurrency
      - V4 violation — crystallization not updating due to edge case in blend function
    notes: Cross-boundary with physics engine (energy injection) and Law 10 (node generation). Energy injection is the highest-risk side effect.
```

---

## HEALTH INDICATORS SELECTED

## OBJECTIVES COVERAGE

| Objective | Indicators | Why These Signals Matter |
|-----------|------------|--------------------------|
| Zero-LLM exploration | zero_llm_compliance | If any LLM call occurs, the cost model and parallelism model break |
| Energy conservation | energy_conservation | If energy doesn't match formula, thermal trails become unreliable |
| Sibling divergence | sibling_divergence_health | If siblings converge, compute is wasted on redundant exploration |
| Continuous crystallization | crystallization_continuity | If crystallization stalls, siblings lose divergence signal and parents lose visibility |

```yaml
health_indicators:
  - name: zero_llm_compliance
    flow_id: exploration_lifecycle
    priority: high
    rationale: Any LLM call during SubEntity traversal violates the module's defining constraint. Operators need immediate alerting.
  - name: energy_conservation
    flow_id: exploration_lifecycle
    priority: high
    rationale: Energy injection that deviates from criticality * STATE_MULTIPLIER corrupts graph thermal state. Other modules depend on correct energy levels.
  - name: sibling_divergence_health
    flow_id: exploration_lifecycle
    priority: med
    rationale: Sibling convergence wastes compute but doesn't corrupt data. Degrades efficiency, not correctness.
  - name: crystallization_continuity
    flow_id: exploration_lifecycle
    priority: med
    rationale: Stale crystallization degrades sibling divergence and parent visibility but doesn't break traversal.
```

---

## STATUS (RESULT INDICATOR)

```yaml
status:
  stream_destination: runtime/checks/subentity_health_results.json
  result:
    representation: enum
    value: PENDING
    updated_at: 2026-03-15T00:00:00Z
    source: subentity_health_aggregate
```

---

## DOCK TYPES (COMPLETE LIST)

Using standard types: `event` (spawn/merge), `graph_ops` (energy injection, crystallization), `custom` (link scoring — internal computation, not a system boundary; documented because it's the only observation point for sibling divergence).

---

## CHECKER INDEX

```yaml
checkers:
  - name: check_zero_llm
    purpose: Verify no LLM API calls occur during SubEntity traversal (V1)
    status: pending
    priority: high
  - name: check_energy_conservation
    purpose: Verify energy injected equals criticality * STATE_MULTIPLIER at every step (V2)
    status: pending
    priority: high
  - name: check_sibling_divergence
    purpose: Verify no two siblings traverse the same link in the same direction (V3)
    status: pending
    priority: med
  - name: check_crystallization_continuity
    purpose: Verify crystallization embedding changes at every step (V4)
    status: pending
    priority: med
```

---

## INDICATOR: zero_llm_compliance

Verifies that SubEntity traversal never invokes an LLM. This is the most critical health indicator — a single violation means the module has failed its core purpose.

### VALUE TO CLIENTS & VALIDATION MAPPING

```yaml
value_and_validation:
  indicator: zero_llm_compliance
  client_value: Operators can trust that SubEntity exploration is cheap and parallelizable. Cost projections remain valid.
  validation:
    - validation_id: V1
      criteria: Every SubEntity traversal from spawn to merge completes with zero LLM API calls
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
    binary: 1 = no LLM calls detected in sample window, 0 = LLM call detected
  aggregation:
    method: AND — any single violation fails the aggregate
    display: binary surfaced as OK/FAIL
```

### DOCKS SELECTED

```yaml
docks:
  - point: dock_spawn
    type: event
    payload: query, intention, criticality, call_stack
  - point: dock_merge
    type: event
    payload: subentity_id, total_steps, api_calls_detected
```

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="zero_llm_compliance",
    triggers=[
        triggers.event.on("exploration.merge"),
    ],
    on_problem="SUBENTITY_LLM_VIOLATION",
    task="investigate_llm_leak",
)
def check_zero_llm(ctx) -> dict:
    """Verify no LLM API calls occurred during SubEntity lifecycle."""
    if ctx.payload.api_calls_detected == 0:
        return Signal.healthy()
    return Signal.critical(details={
        "subentity_id": ctx.payload.subentity_id,
        "api_calls": ctx.payload.api_calls_detected,
    })
```

### SIGNALS

```yaml
signals:
  healthy: No LLM API calls detected across all sampled SubEntity lifecycles
  degraded: N/A — this is binary, no degraded state
  critical: One or more LLM API calls detected during SubEntity traversal
```

### THROTTLING STRATEGY

```yaml
throttling:
  trigger: exploration.merge event
  max_frequency: 1/min
  burst_limit: 5
  backoff: exponential on critical — first alert immediate, then 2x interval
```

### FORWARDINGS & DISPLAYS

```yaml
forwarding:
  targets:
    - location: runtime/checks/subentity_health_results.json
      transport: file
      notes: Persistent record for aggregate health dashboard
display:
  locations:
    - surface: CLI
      location: mind health subentity
      signal: OK/FAIL
      notes: Binary pass/fail, red on any violation
```

### MANUAL RUN

```yaml
manual_run:
  command: python -m runtime.checks.subentity_health --check zero_llm_compliance
  notes: Run after any change to subentity.py or link_scoring.py to verify no LLM imports were introduced
```

---

## INDICATOR: energy_conservation

Verifies that energy injected at each step matches the formula: criticality * STATE_MULTIPLIER[state].

### VALUE TO CLIENTS & VALIDATION MAPPING

```yaml
value_and_validation:
  indicator: energy_conservation
  client_value: Graph thermal state remains consistent. Other modules reading energy levels get reliable data.
  validation:
    - validation_id: V2
      criteria: Energy injected at each step equals exactly criticality * STATE_MULTIPLIER[current_state]
```

### HEALTH REPRESENTATION

```yaml
representation:
  allowed:
    - float_0_1
    - enum
  selected:
    - float_0_1
  semantics:
    float_0_1: Ratio of steps where energy matches formula exactly. 1.0 = perfect, <1.0 = drift detected.
  aggregation:
    method: mean across sampled steps
    display: float surfaced as percentage
```

### DOCKS SELECTED

```yaml
docks:
  - point: dock_energy_injection
    type: graph_ops
    payload: node_id, energy_amount, state, criticality
```

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="energy_conservation",
    triggers=[
        triggers.cron.every("1m"),
    ],
    on_problem="SUBENTITY_ENERGY_DRIFT",
    task="investigate_energy_formula",
)
def check_energy_conservation(ctx) -> dict:
    """Verify energy injection matches criticality * STATE_MULTIPLIER."""
    samples = ctx.recent_energy_injections(limit=100)
    violations = [s for s in samples if abs(s.energy - s.criticality * STATE_MULTIPLIER[s.state]) > 0.001]
    if not violations:
        return Signal.healthy()
    ratio = 1.0 - len(violations) / len(samples)
    if ratio < 0.95:
        return Signal.critical(details={"violation_ratio": 1 - ratio, "sample_violations": violations[:5]})
    return Signal.degraded(details={"violation_ratio": 1 - ratio})
```

### SIGNALS

```yaml
signals:
  healthy: All sampled steps have energy matching formula exactly
  degraded: 95-100% of steps match — minor numerical drift
  critical: Less than 95% of steps match — formula violation
```

### THROTTLING STRATEGY

```yaml
throttling:
  trigger: cron every 1 minute
  max_frequency: 1/min
  burst_limit: 1
  backoff: linear on degraded, exponential on critical
```

### FORWARDINGS & DISPLAYS

```yaml
forwarding:
  targets:
    - location: runtime/checks/subentity_health_results.json
      transport: file
      notes: Persistent record with violation details
display:
  locations:
    - surface: CLI
      location: mind health subentity
      signal: percentage
      notes: Shows conservation ratio as percentage (e.g., 100.0%, 98.5%)
```

### MANUAL RUN

```yaml
manual_run:
  command: python -m runtime.checks.subentity_health --check energy_conservation
  notes: Run after modifying STATE_MULTIPLIER values or energy injection logic
```

---

## HOW TO RUN

```bash
# Run all health checks for this module
python -m runtime.checks.subentity_health

# Run a specific checker
python -m runtime.checks.subentity_health --check zero_llm_compliance
python -m runtime.checks.subentity_health --check energy_conservation
python -m runtime.checks.subentity_health --check sibling_divergence
python -m runtime.checks.subentity_health --check crystallization_continuity
```

---

## KNOWN GAPS

- V3 (sibling divergence) checker is pending — needs sibling registry instrumentation to log link traversals per sibling
- V4 (crystallization continuity) checker is pending — needs crystallization delta logging at each step
- V5 (fatigue-based stopping) not covered by health — deterministic behavior, should be a test instead
- V6 (problem produces graph artifacts) not covered by health — depends on Law 10 integration which has its own health checks

<!-- @mind:todo Implement check_sibling_divergence once sibling registry logging is available -->
<!-- @mind:todo Implement check_crystallization_continuity once step-level delta logging is available -->

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Build runtime/checks/subentity_health.py implementing the checkers defined above -->
<!-- @mind:proposition Add a composite health score combining all 4 indicators with weighted priority -->
<!-- @mind:escalation Determine if eventually-consistent sibling vector reads can cause false positives in divergence check -->
