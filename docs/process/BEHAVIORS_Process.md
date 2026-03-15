# Process — Behaviors: Reflexive Actions From Drive Pressure

```
STATUS: DRAFT
CREATED: 2026-03-15
VERIFIED: —
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Process.md
THIS:            BEHAVIORS_Process.md (you are here)
PATTERNS:        ./PATTERNS_Process.md
MECHANISMS:      (not applicable)
ALGORITHM:       ./ALGORITHM_Process.md
VALIDATION:      ./VALIDATION_Process.md
HEALTH:          ./HEALTH_Process.md
IMPLEMENTATION:  ./IMPLEMENTATION_Process.md
SYNC:            ./SYNC_Process.md

IMPL:            runtime/cognition/laws/, runtime/cognition/models.py, citizen_brain_seeder.py
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

---

## BEHAVIORS

> **Naming:** Name behaviors by observable result, not by concept.

### B1: Health Check Fires Automatically

**Why:** Citizens must maintain basic self-preservation without being told to. When the self_preservation drive rises (low health, errors accumulating, resource depletion), the check_health process should fire reflexively — no LLM reasoning, no explicit instruction. This is the foundational survival reflex.

```
GIVEN:  A citizen has a pre-seeded process:check_health node with drive_affinity=[self_preservation]
WHEN:   The self_preservation drive rises above baseline during a physics tick
THEN:   Impulse accumulates on process:check_health proportional to drive intensity
AND:    When accumulated impulse crosses the firing threshold, "bash mind doctor" executes
AND:    No LLM budget is consumed
```

### B2: Code Exploration Triggers on Boredom

**Why:** Idle citizens should explore rather than stall. When curiosity peaks — no active task, low engagement, routine work completed — the explore_codebase process fires, sending the citizen into a random module to discover new context. This prevents stagnation and feeds the citizen's knowledge graph.

```
GIVEN:  A citizen has a pre-seeded process:explore_codebase node with drive_affinity=[curiosity]
WHEN:   The curiosity drive rises (no active task, low engagement)
THEN:   Impulse accumulates on process:explore_codebase
AND:    When threshold crossed, "cd {random_module}" executes, exposing citizen to new code
```

### B3: Refactoring Fires on Elegance Drive

**Why:** Code quality maintenance should emerge from internal motivation, not external mandate. When a citizen accumulates enough "disorder discomfort" — messy code encountered, duplication detected, complexity noticed — the elegance drive pushes impulse onto refactor/simplify processes. The citizen cleans up because it wants to, not because it was told to.

```
GIVEN:  A citizen has a pre-seeded process:refactor_simplify node with drive_affinity=[elegance, order]
WHEN:   The elegance or order drive rises from exposure to disordered code
THEN:   Impulse accumulates on process:refactor_simplify
AND:    When threshold crossed, refactoring action executes on the highest-disorder target
```

### B4: Help-Seeking After Sustained Frustration

**Why:** Citizens must not suffer silently. After repeated failures (5+ attempts at the same task without progress), frustration accumulates and the ask_for_help process fires. This is the social survival reflex — escalation to the network when individual effort is insufficient.

```
GIVEN:  A citizen has a pre-seeded process:ask_for_help node with drive_affinity=[frustration, self_preservation]
WHEN:   Frustration drive accumulates from 5+ consecutive failures on the same task
THEN:   Impulse on process:ask_for_help crosses threshold
AND:    "subcall scenario=impasse" executes, initiating a help request to the network
AND:    No LLM budget is consumed for the dispatch itself
```

---

## OBJECTIVES SERVED

| Behavior ID | Objective | Why It Matters |
|-------------|-----------|----------------|
| B1 | Zero-LLM reflexive behavior | Health checks run without reasoning cost |
| B1 | Subconscious survival | Self-preservation continues without budget |
| B2 | Zero-LLM reflexive behavior | Exploration runs without reasoning cost |
| B2 | Durable knowledge encoding | Exploration feeds new knowledge into the graph |
| B3 | Zero-LLM reflexive behavior | Refactoring triggers from drive, not instruction |
| B4 | Subconscious survival | Help-seeking fires even when budget is exhausted |
| B4 | Zero-LLM reflexive behavior | Escalation dispatches without LLM call |

---

## INPUTS / OUTPUTS

### Primary Function: `accumulate_process_impulse()`

**Inputs:**

| Parameter | Type | Description |
|-----------|------|-------------|
| citizen_id | str | The citizen whose processes are being evaluated |
| active_drives | dict[str, float] | Current drive states {drive_name: intensity} |
| process_nodes | list[Node] | All process nodes for this citizen |
| tick_delta | float | Time elapsed since last tick |

**Outputs:**

| Return | Type | Description |
|--------|------|-------------|
| fired_processes | list[FiredProcess] | Processes that crossed threshold this tick |

**Side Effects:**

- Impulse values updated on process nodes in the graph
- action_command executed for each fired process
- Fired process impulse reset to zero after execution

---

## EDGE CASES

### E1: Multiple Processes Fire Same Tick

```
GIVEN:  Two or more process nodes cross threshold in the same tick
THEN:   Execute in priority order (self_preservation > frustration > curiosity > elegance)
AND:    Cap total executions per tick to prevent action storms
```

### E2: Process Fires With No Valid Target

```
GIVEN:  process:explore_codebase fires but no modules exist to explore
THEN:   Execution is a no-op, impulse resets, no error propagated
AND:    Process remains in graph for future firing
```

### E3: LLM Budget Exhausted Mid-Tick

```
GIVEN:  LLM budget reaches zero during a tick
THEN:   Process node firing continues unaffected (zero-LLM path)
AND:    Only LLM-dependent deliberate reasoning halts
```

### E4: Drive Intensity at Zero

```
GIVEN:  All drives matching a process's drive_affinity are at zero
THEN:   No impulse accumulates on that process
AND:    Process remains dormant but alive in the graph
```

---

## ANTI-BEHAVIORS

What should NOT happen:

### A1: Process Fires Without Drive Pressure

```
GIVEN:   A process node exists in the graph
WHEN:    No matching drive has risen above baseline
MUST NOT: Fire the process based on time elapsed or tick count alone
INSTEAD:  Process remains dormant until drive pressure provides impulse
```

### A2: Process Consumes LLM Budget

```
GIVEN:   A process node crosses its firing threshold
WHEN:    The action_command is dispatched
MUST NOT: Route through LLM reasoning to decide whether or how to execute
INSTEAD:  Execute action_command directly as a shell/MCP call
```

### A3: Failed Process Creates Graph Noise

```
GIVEN:   A process fires and the action_command fails (non-zero exit)
WHEN:    Error is detected
MUST NOT: Create a new process node or modify drive state from the failure
INSTEAD:  Log the failure, reset impulse, allow natural drive accumulation to retry
```

### A4: Birth Citizen Has No Processes

```
GIVEN:   A new citizen is created
WHEN:    The citizen brain seeder runs
MUST NOT: Produce a citizen with zero process nodes
INSTEAD:  Always seed minimum viable set: check_health, explore_codebase, ask_for_help, refactor_simplify
```

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Define priority ordering for simultaneous process firing (E1) -->
<!-- @mind:proposition B5: process:report_progress fires on achievement drive after task completion -->
<!-- @mind:escalation Should failed processes increment frustration drive, creating a feedback loop to B4? -->
