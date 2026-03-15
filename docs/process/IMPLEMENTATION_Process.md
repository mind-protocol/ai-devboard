# Process — Implementation: Code Architecture and Structure

```
STATUS: DRAFT
CREATED: 2026-03-15
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Process.md
BEHAVIORS:       ./BEHAVIORS_Process.md
PATTERNS:        ./PATTERNS_Process.md
MECHANISMS:      (not applicable)
ALGORITHM:       ./ALGORITHM_Process.md
VALIDATION:      ./VALIDATION_Process.md
THIS:            IMPLEMENTATION_Process.md
HEALTH:          ./HEALTH_Process.md
SYNC:            ./SYNC_Process.md

IMPL:            runtime/cognition/laws/, runtime/cognition/models.py, citizen_brain_seeder.py
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

---

## CODE STRUCTURE

```
runtime/
├── cognition/
│   ├── __init__.py              # exports cognition subsystem
│   ├── models.py                # Node model with action_command, action_context, drive_affinity
│   ├── laws/
│   │   ├── __init__.py          # law registry
│   │   ├── law_17_impulse.py    # impulse accumulation on process nodes
│   │   └── law_06_consolidation.py  # crystallization of repeated actions into process nodes
│   └── dispatch/
│       ├── __init__.py          # dispatch exports
│       └── action_dispatch.py   # shell/MCP command execution
├── citizen_brain_seeder.py      # birth template pre-seeding of process nodes
```

### File Responsibilities

| File | Purpose | Key Functions/Classes | Lines | Status |
|------|---------|----------------------|-------|--------|
| `runtime/cognition/models.py` | Node model definitions including ProcessNode | `ProcessNode`, `FiredProcess` | ~100 | OK |
| `runtime/cognition/laws/law_17_impulse.py` | Law 17: impulse accumulation from drive matching | `accumulate_impulse()`, `check_threshold()` | ~120 | OK |
| `runtime/cognition/laws/law_06_consolidation.py` | Law 6: crystallize repeated successes into processes | `check_consolidation()`, `create_process_node()` | ~80 | OK |
| `runtime/cognition/dispatch/action_dispatch.py` | Execute action_command via shell or MCP | `dispatch_action()`, `parse_command_type()` | ~60 | OK |
| `citizen_brain_seeder.py` | Pre-seed minimum viable process nodes at birth | `seed_birth_processes()`, `BIRTH_TEMPLATE` | ~80 | OK |

**Size Thresholds:**
- **OK** (<400 lines): Healthy size, easy to understand
- **WATCH** (400-700 lines): Getting large, consider extraction opportunities
- **SPLIT** (>700 lines): Too large, must split before adding more code

> When a file reaches WATCH status, identify extraction candidates in the EXTRACTION CANDIDATES section below.
> When a file reaches SPLIT status, splitting becomes the next task before any feature work.

---

## DESIGN PATTERNS

### Architecture Pattern

**Pattern:** Event-Driven (physics tick drives all computation)

**Why this pattern:** Process firing is not request/response — it emerges from continuous drive state evolution. The physics tick acts as the heartbeat, and Law 17 acts as the event processor that translates drive fluctuations into process firings. This aligns with the broader narrative physics architecture.

### Code Patterns in Use

| Pattern | Applied To | Purpose |
|---------|------------|---------|
| Strategy | `law_17_impulse.py` | Drive-affinity matching uses strategy pattern for different drive types |
| Template Method | `citizen_brain_seeder.py` | Birth template defines fixed structure, specific processes are pluggable |
| Command | `action_dispatch.py` | action_command encapsulates execution as a dispatchable command object |

### Anti-Patterns to Avoid

- **LLM-in-the-loop**: Don't route process dispatch through any LLM reasoning step — direct execution only
- **God Object**: Don't let law_17_impulse.py handle dispatch, consolidation, and seeding — keep laws, dispatch, and seeding separate
- **Premature Abstraction**: Don't create a ProcessFactory until there are 3+ distinct process creation paths

### Boundaries

| Boundary | Inside | Outside | Interface |
|----------|--------|---------|-----------|
| Process Module | Impulse accumulation, threshold check, action dispatch, consolidation, birth seeding | Drive state management, graph storage, LLM reasoning | `accumulate_and_fire(citizen_id, active_drives, tick_delta)` |
| Dispatch | Shell/MCP command execution, timeout, error capture | Deciding what to execute, interpreting results | `dispatch_action(action_command) -> FiredProcess` |
| Seeder | Process node creation at birth | Ongoing process evolution, consolidation | `seed_birth_processes(citizen_id)` |

---

## SCHEMA

### ProcessNode

```yaml
ProcessNode:
  required:
    - id: str                    # unique node identifier
    - subtype: "process"         # fixed literal
    - action_command: str        # shell command or MCP call
    - drive_affinity: list[str]  # drives that push impulse
    - impulse: float             # current accumulated impulse
    - threshold: float           # firing threshold
  optional:
    - action_context: vector[float]  # embedding for relevance matching
    - weight: float              # graph weight (default: 1.0)
    - fire_count: int            # total firings (default: 0)
    - last_fired: timestamp      # last execution time
  constraints:
    - impulse >= 0.0
    - threshold > 0.0
    - drive_affinity must contain at least one entry
    - action_command must not be empty
```

### BirthTemplate

```yaml
BirthTemplate:
  required:
    - processes: list[ProcessSeed]
  relationships:
    - citizen: Actor node that receives these processes
```

---

## ENTRY POINTS

| Entry Point | File:Line | Triggered By |
|-------------|-----------|--------------|
| accumulate_and_fire | `law_17_impulse.py:accumulate_and_fire()` | Physics tick loop |
| seed_birth_processes | `citizen_brain_seeder.py:seed_birth_processes()` | Citizen creation event |
| check_consolidation | `law_06_consolidation.py:check_consolidation()` | Post-action success callback |

---

## DATA FLOW AND DOCKING (FLOW-BY-FLOW)

### Impulse Accumulation Flow: Drive Pressure to Action Dispatch

Explain what this flow covers: the core loop that converts drive state into process firings. This is the most important flow — it IS the module.

```yaml
flow:
  name: impulse_accumulation
  purpose: Convert active drive pressure into reflexive process execution
  scope: drive states in, fired process results out
  steps:
    - id: step_1_get_drives
      description: Retrieve citizen's current drive states from graph
      file: runtime/cognition/laws/law_17_impulse.py
      function: accumulate_and_fire()
      input: citizen_id
      output: dict[str, float]
      trigger: physics tick
      side_effects: none
    - id: step_2_match_affinity
      description: Match active drives against process node drive_affinity
      file: runtime/cognition/laws/law_17_impulse.py
      function: accumulate_and_fire()
      input: active_drives, process_nodes
      output: list[tuple[ProcessNode, list[str]]]
      trigger: step_1 completion
      side_effects: none
    - id: step_3_accumulate
      description: Add impulse to matching process nodes proportional to drive intensity
      file: runtime/cognition/laws/law_17_impulse.py
      function: accumulate_and_fire()
      input: matched processes, drive intensities, tick_delta
      output: updated impulse values
      trigger: step_2 completion
      side_effects: graph node impulse field updated
    - id: step_4_threshold_check
      description: Check if any process impulse meets or exceeds threshold
      file: runtime/cognition/laws/law_17_impulse.py
      function: check_threshold()
      input: process_nodes with updated impulse
      output: list[ProcessNode] that crossed threshold
      trigger: step_3 completion
      side_effects: none
    - id: step_5_dispatch
      description: Execute action_command for each fired process
      file: runtime/cognition/dispatch/action_dispatch.py
      function: dispatch_action()
      input: action_command string
      output: FiredProcess with exit_code
      trigger: threshold crossed
      side_effects: shell command execution, impulse reset, fire_count increment
  docking_points:
    guidance:
      include_when: transformative (drive state to action), risky (shell execution)
      omit_when: trivial pass-through of drive values
      selection_notes: dock at drive input, threshold crossing, and dispatch output
    available:
      - id: dock_drive_input
        type: event
        direction: input
        file: runtime/cognition/laws/law_17_impulse.py
        function: accumulate_and_fire()
        trigger: physics tick
        payload: "{citizen_id, active_drives}"
        async_hook: not_applicable
        needs: none
        notes: entry point — drive state enters the process module here
      - id: dock_impulse_update
        type: graph_ops
        direction: output
        file: runtime/cognition/laws/law_17_impulse.py
        function: accumulate_and_fire()
        trigger: drive matching
        payload: "{process_id, impulse_delta, new_impulse}"
        async_hook: optional
        needs: add watcher
        notes: observe impulse accumulation rate for health monitoring
      - id: dock_threshold_crossed
        type: event
        direction: output
        file: runtime/cognition/laws/law_17_impulse.py
        function: check_threshold()
        trigger: impulse >= threshold
        payload: "{process_id, action_command, drive_snapshot}"
        async_hook: required
        needs: add async hook
        notes: critical decision point — process is about to fire
      - id: dock_dispatch_result
        type: process
        direction: output
        file: runtime/cognition/dispatch/action_dispatch.py
        function: dispatch_action()
        trigger: action_command execution
        payload: "{process_id, exit_code, stdout, stderr, duration}"
        async_hook: required
        needs: add async hook
        notes: shell execution result — risk point for failures and timeouts
    health_recommended:
      - dock_id: dock_drive_input
        reason: verify drives are flowing into the process module each tick
      - dock_id: dock_threshold_crossed
        reason: monitor firing frequency — too many or zero firings indicate problems
      - dock_id: dock_dispatch_result
        reason: track action success/failure rates for system health
```

### Birth Seeding Flow: Citizen Creation to Process Pre-Wiring

```yaml
flow:
  name: birth_seeding
  purpose: Ensure every new citizen has minimum viable process nodes
  scope: citizen creation event in, seeded process nodes out
  steps:
    - id: step_1_trigger
      description: Citizen creation event received
      file: citizen_brain_seeder.py
      function: seed_birth_processes()
      input: citizen_id
      output: none
      trigger: citizen.created event
      side_effects: none
    - id: step_2_seed
      description: Create process nodes from BirthTemplate
      file: citizen_brain_seeder.py
      function: seed_birth_processes()
      input: citizen_id, BIRTH_TEMPLATE
      output: list[ProcessNode]
      trigger: step_1
      side_effects: 4 process nodes added to graph
  docking_points:
    guidance:
      include_when: citizen enters system without reflexes
      omit_when: not applicable — this always matters
      selection_notes: dock at seeding output to verify completeness
    available:
      - id: dock_seed_complete
        type: graph_ops
        direction: output
        file: citizen_brain_seeder.py
        function: seed_birth_processes()
        trigger: seeding complete
        payload: "{citizen_id, process_count, process_names}"
        async_hook: optional
        needs: add watcher
        notes: verify V3 — every citizen has minimum viable processes
    health_recommended:
      - dock_id: dock_seed_complete
        reason: V3 enforcement — birth guarantee must be verified
```

---

## LOGIC CHAINS

### LC1: Drive to Action

**Purpose:** Convert a single drive fluctuation into a process firing

```
active_drives
  -> law_17_impulse.accumulate_and_fire()  # match drive_affinity, accumulate impulse
    -> law_17_impulse.check_threshold()     # compare impulse to threshold
      -> action_dispatch.dispatch_action()   # execute shell/MCP command
        -> FiredProcess result
```

**Data transformation:**
- Input: `dict[str, float]` — drive name to intensity mapping
- After step 1: `list[tuple[ProcessNode, float]]` — matched processes with impulse delta
- After step 2: `list[ProcessNode]` — processes that crossed threshold
- Output: `list[FiredProcess]` — execution results with exit codes

### LC2: Success to Muscle Memory

**Purpose:** Crystallize repeated successful actions into permanent process nodes

```
action_success event
  -> law_06_consolidation.check_consolidation()  # count successes for pattern
    -> law_06_consolidation.create_process_node()  # create new ProcessNode
      -> graph.add_node()                           # persist in graph
```

---

## MODULE DEPENDENCIES

### Internal Dependencies

```
law_17_impulse
    └── imports -> models (ProcessNode, FiredProcess)
    └── imports -> action_dispatch
law_06_consolidation
    └── imports -> models (ProcessNode)
citizen_brain_seeder
    └── imports -> models (ProcessNode, BirthTemplate)
```

### External Dependencies

| Package | Used For | Imported By |
|---------|----------|-------------|
| `subprocess` | Shell command execution | `action_dispatch.py` |
| `graph_client` | FalkorDB node operations | `law_17_impulse.py`, `citizen_brain_seeder.py` |

---

## STATE MANAGEMENT

### Where State Lives

| State | Location | Scope | Lifecycle |
|-------|----------|-------|-----------|
| Process impulse | Graph: ProcessNode.impulse | per-node | Created at birth/consolidation, reset on fire, persists across ticks |
| Fire count | Graph: ProcessNode.fire_count | per-node | Increments on each firing, never resets |
| Action history | Rolling buffer in memory | per-citizen | Last N actions for consolidation check, cleared on restart |

### State Transitions

```
impulse=0.0 ──drive_pressure──> impulse accumulating ──threshold_crossed──> fired (impulse=0.0)
```

---

## RUNTIME BEHAVIOR

### Initialization

```
1. Load process node schema into graph client
2. Register Law 17 in the law registry
3. Register Law 6 in the law registry
4. Initialize action dispatch with timeout configuration
```

### Main Loop / Request Cycle

```
1. Physics tick fires
2. For each citizen: accumulate_and_fire(citizen_id, drives, tick_delta)
3. Collect FiredProcess results
4. Run consolidation check on successful actions
5. Emit physics.tick_complete event
```

### Shutdown

```
1. Flush any pending impulse updates to graph
2. Close graph client connection
```

---

## CONCURRENCY MODEL

| Component | Model | Notes |
|-----------|-------|-------|
| Impulse accumulation | sync (within tick) | Must complete within tick budget |
| Action dispatch | async (fire-and-forget) | Shell execution runs in background, results collected next tick |
| Consolidation | sync (post-action) | Runs after action results are collected |

---

## CONFIGURATION

| Config | Location | Default | Description |
|--------|----------|---------|-------------|
| `IMPULSE_RATE` | `law_17_impulse.py` | `0.1` | Scaling factor for impulse accumulation per tick |
| `MAX_FIRES_PER_TICK` | `law_17_impulse.py` | `2` | Cap on simultaneous process firings per citizen |
| `CONSOLIDATION_THRESHOLD` | `law_06_consolidation.py` | `3` | Minimum successes before crystallizing a process |
| `DISPATCH_TIMEOUT` | `action_dispatch.py` | `30s` | Maximum time for action_command execution |

---

## BIDIRECTIONAL LINKS

### Code -> Docs

Files that reference this documentation:

| File | Line | Reference |
|------|------|-----------|
| `runtime/cognition/laws/law_17_impulse.py` | TBD | `# DOCS: docs/process/ALGORITHM_Process.md` |
| `runtime/cognition/models.py` | TBD | `# DOCS: docs/process/IMPLEMENTATION_Process.md` |
| `citizen_brain_seeder.py` | TBD | `# DOCS: docs/process/IMPLEMENTATION_Process.md` |

### Docs -> Code

| Doc Section | Implemented In |
|-------------|----------------|
| ALGORITHM step 1-5 | `law_17_impulse.py:accumulate_and_fire()` |
| ALGORITHM step 6 | `law_06_consolidation.py:check_consolidation()` |
| BEHAVIOR B1-B4 | `law_17_impulse.py:accumulate_and_fire()` |
| VALIDATION V3 | `citizen_brain_seeder.py:seed_birth_processes()` |
| VALIDATION V4 | `action_dispatch.py:dispatch_action()` |

---

## EXTRACTION CANDIDATES

Files approaching WATCH/SPLIT status - identify what can be extracted:

| File | Current | Target | Extract To | What to Move |
|------|---------|--------|------------|--------------|
| (none approaching threshold) | — | — | — | — |

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Add code references once implementation files exist -->
<!-- @mind:proposition Consider a process_registry.py to decouple law_17 from direct graph queries -->
<!-- @mind:escalation Action dispatch sandboxing — how isolated should shell execution be? -->
