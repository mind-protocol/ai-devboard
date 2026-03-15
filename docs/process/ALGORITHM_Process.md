# Process — Algorithm: Impulse Accumulation, Drive Matching, and Action Dispatch

```
STATUS: DRAFT
CREATED: 2026-03-15
VERIFIED: —
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Process.md
BEHAVIORS:       ./BEHAVIORS_Process.md
PATTERNS:        ./PATTERNS_Process.md
MECHANISMS:      (not applicable)
THIS:            ALGORITHM_Process.md (you are here)
VALIDATION:      ./VALIDATION_Process.md
HEALTH:          ./HEALTH_Process.md
IMPLEMENTATION:  ./IMPLEMENTATION_Process.md
SYNC:            ./SYNC_Process.md

IMPL:            runtime/cognition/laws/, runtime/cognition/models.py, citizen_brain_seeder.py
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

---

## OVERVIEW

The Process algorithm implements Law 17: impulse accumulation on process nodes driven by active limbic drives. Each physics tick, the system scans a citizen's active drives, matches them against process node drive_affinity declarations, accumulates impulse proportionally, and fires processes whose impulse crosses their threshold. Fired processes dispatch action_command directly (shell/MCP) without LLM involvement. Successful repeated actions consolidate into new process nodes via Law 6.

---

## OBJECTIVES AND BEHAVIORS

| Objective | Behaviors Supported | Why This Algorithm Matters |
|-----------|---------------------|----------------------------|
| Zero-LLM reflexive behavior | B1, B2, B3, B4 | Impulse accumulation + direct dispatch = no LLM needed |
| Durable knowledge encoding | B2, B3 | Consolidation crystallizes ad-hoc successes into persistent nodes |
| Subconscious survival | B1, B4 | Drive-coupled firing continues regardless of LLM budget |

---

## DATA STRUCTURES

### ProcessNode (extends Narrative, subtype=process)

```
ProcessNode:
  id:              str           # unique node identifier
  subtype:         "process"     # fixed — identifies this as a process node
  action_command:  str           # shell command or MCP call to execute
  action_context:  vector[float] # embedding signature for relevance matching
  drive_affinity:  list[str]     # drive names that push impulse onto this node
  impulse:         float         # current accumulated impulse (0.0 to threshold)
  threshold:       float         # impulse level required to fire (default: 1.0)
  weight:          float         # node weight in the graph (affects consolidation)
  fire_count:      int           # total times this process has fired
  last_fired:      timestamp     # when this process last executed
```

### FiredProcess

```
FiredProcess:
  process_id:     str            # which process fired
  action_command: str            # command that was dispatched
  exit_code:      int            # result of execution (0 = success)
  fired_at:       timestamp      # when firing occurred
  drive_snapshot:  dict          # drive states at moment of firing
```

### BirthTemplate

```
BirthTemplate:
  processes:
    - name: "check_health"
      action_command: "bash mind doctor"
      drive_affinity: ["self_preservation"]
      threshold: 0.8
    - name: "explore_codebase"
      action_command: "cd {random_module}"
      drive_affinity: ["curiosity"]
      threshold: 1.0
    - name: "ask_for_help"
      action_command: "subcall scenario=impasse"
      drive_affinity: ["frustration", "self_preservation"]
      threshold: 1.2
    - name: "refactor_simplify"
      action_command: "refactor --target={highest_disorder}"
      drive_affinity: ["elegance", "order"]
      threshold: 1.0
```

---

## ALGORITHM: accumulate_and_fire()

### Step 1: Gather Active Drives

Retrieve the citizen's current drive states from the graph. Each drive has a name and intensity (float, 0.0 = dormant, 1.0+ = strong).

```
active_drives = graph.get_drive_states(citizen_id)
# Returns: {"self_preservation": 0.7, "curiosity": 0.3, "frustration": 0.0, ...}
```

### Step 2: Match Drives to Process Nodes

For each process node belonging to this citizen, check if any of its drive_affinity entries appear in the active drives with non-zero intensity. Only matching processes receive impulse.

```
for process in citizen.process_nodes:
    matching_drives = [d for d in process.drive_affinity if active_drives.get(d, 0) > 0]
    if not matching_drives:
        continue  # no drive pressure, no impulse
```

### Step 3: Accumulate Impulse (Law 17)

For each matching process, accumulate impulse proportional to the sum of matching drive intensities, scaled by tick_delta:

```
impulse_delta = sum(active_drives[d] for d in matching_drives) * tick_delta * IMPULSE_RATE
process.impulse += impulse_delta
```

Where IMPULSE_RATE is a tuning constant (default: 0.1) controlling how fast impulse builds.

### Step 4: Check Threshold and Fire

If a process's accumulated impulse meets or exceeds its threshold, it fires:

```
if process.impulse >= process.threshold:
    result = dispatch_action(process.action_command)
    process.impulse = 0.0  # reset after firing
    process.fire_count += 1
    process.last_fired = now()
    fired_list.append(FiredProcess(process, result))
```

### Step 5: Cap Simultaneous Firings

To prevent action storms, cap the number of processes that can fire per citizen per tick:

```
MAX_FIRES_PER_TICK = 2
fired_list.sort(key=priority_order)  # self_preservation first
fired_list = fired_list[:MAX_FIRES_PER_TICK]
```

Processes that crossed threshold but were capped retain their impulse for next tick.

### Step 6: Consolidation Check (Law 6)

After firing, check if any ad-hoc action (non-process LLM-initiated action) has been successfully repeated enough times to warrant crystallization into a new process node:

```
if action_pattern.success_count >= CONSOLIDATION_THRESHOLD:
    new_process = create_process_node(
        action_command=action_pattern.command,
        drive_affinity=infer_drives(action_pattern.context),
        threshold=1.0
    )
    graph.add_node(citizen_id, new_process)
```

Where CONSOLIDATION_THRESHOLD defaults to 3 successful repetitions of the same action pattern.

---

## KEY DECISIONS

### D1: Impulse Reset After Firing

```
IF process fires successfully:
    Reset impulse to 0.0
    Rationale: prevents immediate re-firing, creates natural rhythm
ELSE IF process fires but action fails:
    Reset impulse to 0.0
    Rationale: failed actions should not immediately retry;
    natural drive pressure will rebuild impulse if the need persists
```

### D2: Multiple Drive Affinity Summation

```
IF process has multiple drive_affinity entries (e.g., [frustration, self_preservation]):
    Sum all matching drive intensities for impulse calculation
    Rationale: compound pressure from multiple drives should accelerate firing
ELSE IF only one drive matches:
    Use single drive intensity
    Rationale: simple proportional accumulation
```

### D3: Consolidation vs. Explicit Creation

```
IF an ad-hoc action succeeds 3+ times with similar context:
    Automatically consolidate into a process node (Law 6)
    Rationale: muscle memory forms from repetition, not declaration
ELSE IF action has been tried fewer than 3 times:
    Do not consolidate — action may be situational
    Rationale: premature crystallization wastes graph space
```

---

## DATA FLOW

```
active_drives (from Drive module)
    |
    v
match drives to process_nodes.drive_affinity
    |
    v
accumulate impulse (Law 17: intensity * tick_delta * IMPULSE_RATE)
    |
    v
threshold check (impulse >= threshold?)
    |
    v
dispatch action_command (shell/MCP, no LLM)
    |
    v
reset impulse, increment fire_count
    |
    v
consolidation check (Law 6: repeated success -> new process node)
```

---

## COMPLEXITY

**Time:** O(D * P) per citizen per tick — where D = number of active drives, P = number of process nodes. Both are small (D < 10, P < 20 typically), so effectively O(1) per citizen.

**Space:** O(P) per citizen — one impulse accumulator per process node.

**Bottlenecks:**
- Action dispatch (shell execution) is the real latency risk, not impulse calculation
- Consolidation check requires scanning action history, which could grow; use a rolling window

---

## HELPER FUNCTIONS

### `dispatch_action(action_command)`

**Purpose:** Execute the action_command as a shell command or MCP call.

**Logic:** Parse command type (shell vs MCP prefix), execute in sandboxed environment, capture exit code and output. Timeout after 30 seconds. Return FiredProcess result.

### `infer_drives(action_context)`

**Purpose:** Determine which drives should be affiliated with a newly consolidated process.

**Logic:** Compare the action_context embedding against known drive-context associations. Return the top 1-2 matching drive names. Used during Law 6 consolidation.

### `priority_order(process)`

**Purpose:** Determine execution priority when multiple processes fire simultaneously.

**Logic:** Fixed ordering: self_preservation > frustration > curiosity > elegance > order. Ensures survival reflexes always execute first.

### `seed_birth_processes(citizen_id)`

**Purpose:** Create the minimum viable set of process nodes for a new citizen.

**Logic:** Iterate through BirthTemplate.processes, create each as a ProcessNode in the graph with impulse=0.0 and fire_count=0.

---

## INTERACTIONS

| Module | What We Call | What We Get |
|--------|--------------|-------------|
| Drives | `get_drive_states(citizen_id)` | dict of drive name -> intensity |
| Graph | `get_process_nodes(citizen_id)` | list of ProcessNode for this citizen |
| Graph | `update_node(process_id, fields)` | Updated impulse/fire_count in graph |
| Graph | `add_node(citizen_id, node)` | New process node from consolidation |
| Shell/MCP | `execute(action_command)` | exit_code, stdout, stderr |

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Determine exact IMPULSE_RATE constant through simulation -->
<!-- @mind:proposition Adaptive thresholds — processes that fire frequently could raise their threshold to prevent over-firing -->
<!-- @mind:escalation Should consolidation (Law 6) require human approval for high-impact action_commands? -->
