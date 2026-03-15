# Interaction — Algorithm: Law 17 Impulse Accumulation and Action Dispatch

```
STATUS: DRAFT
CREATED: 2026-03-15
VERIFIED: —
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Interaction.md
BEHAVIORS:       ./BEHAVIORS_Interaction.md
PATTERNS:        ./PATTERNS_Interaction.md
MECHANISMS:     (not applicable)
THIS:            ALGORITHM_Interaction.md (you are here)
VALIDATION:      ./VALIDATION_Interaction.md
HEALTH:          ./HEALTH_Interaction.md
IMPLEMENTATION:  ./IMPLEMENTATION_Interaction.md
SYNC:            ./SYNC_Interaction.md

IMPL:            mcp/tools/ (15 handlers), runtime/cognition/laws/law_13_to_18_limbic_engine.py, home_server.py
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

---

## OVERVIEW

The Interaction module's core algorithm is the **impulse accumulation and action dispatch loop**. Every tick, Law 17 computes drive pressure on each process node using drive-affinity matching. When accumulated impulse crosses the node's firing threshold, the node's `action_command` is parsed and dispatched to the appropriate MCP tool handler — with zero LLM calls.

This algorithm bridges the cognitive graph (drives, emotions, tensions) to the motor interface (shell commands, subcalls, messages). It is the mechanism by which internal state produces external action.

---

## OBJECTIVES AND BEHAVIORS

| Objective | Behaviors Supported | Why This Algorithm Matters |
|-----------|---------------------|----------------------------|
| Autonomous execution without LLM | B4 (shell commands fire without LLM) | Impulse accumulation is the mechanism that fires action_commands from graph physics |
| Reflexive self-correction | B1 (linter on self_preservation), B3 (subcall on frustration) | Drive-affinity matching routes the right drive to the right reflex |
| Omnichannel communication | B3 (auto-subcall) | Subcall dispatch uses the same impulse mechanism as bash dispatch |

---

## DATA STRUCTURES

### Process Node (action-capable)

```
ProcessNode:
    id: str                           # unique node identifier
    type: NodeType.PROCESS            # always PROCESS
    energy: float                     # current energy level (from graph physics)
    action_command: str               # shell command, subcall target, or tool invocation string
    drive_affinity: dict[DriveName, float]  # mapping: drive_name -> coupling strength [0.0, 1.0]
    impulse: float                    # accumulated impulse (persistent across ticks)
    firing_threshold: float           # impulse level at which action_command fires
    refractory_until: int             # tick number until which the node cannot fire again
    last_fired: int | None            # tick number of last firing (None if never fired)
```

### Drive State (from limbic engine)

```
DriveState:
    drives: dict[DriveName, float]    # current drive intensities: curiosity, self_preservation,
                                      #   frustration, affiliation, achievement, etc.
    tick: int                         # current tick number
```

### ActionResult

```
ActionResult:
    success: bool                     # whether the action completed without error
    tool: str                         # which MCP tool was invoked (bash, subcall, send, etc.)
    stdout: str | None                # command stdout (for bash actions)
    stderr: str | None                # command stderr (for bash actions)
    duration_ms: int                  # execution time in milliseconds
    evidence_ref: str                 # filesystem path where full output is stored
```

---

## ALGORITHM: Impulse Accumulation and Action Dispatch

### Step 1: Collect Process Nodes

Each tick, the algorithm gathers all nodes of type PROCESS that have a non-empty `action_command` field. Nodes in refractory period (refractory_until > current_tick) are excluded.

```
eligible_nodes = [
    node for node in graph.nodes(type=PROCESS)
    if node.action_command
    and node.refractory_until <= current_tick
]
```

### Step 2: Compute Drive Pressure per Node

For each eligible process node, compute the **drive pressure** — a weighted sum of current drive intensities scaled by the node's drive_affinity.

```
for node in eligible_nodes:
    drive_pressure = sum(
        drive_state.drives[drive] * node.drive_affinity.get(drive, 0.0)
        for drive in drive_state.drives
    )
```

This is the key mechanism: drive_affinity gates which drives affect which actions. A health-check node with `{self_preservation: 0.9, curiosity: 0.0}` is only activated by self_preservation, never by curiosity.

### Step 3: Accumulate or Decay Impulse

If drive_pressure exceeds IMPULSE_DRIVE_THRESHOLD and context_match (node energy alignment) exceeds IMPULSE_CONTEXT_THRESHOLD, impulse accumulates. Otherwise, impulse decays.

```
if drive_pressure > IMPULSE_DRIVE_THRESHOLD and context_match > IMPULSE_CONTEXT_THRESHOLD:
    node.impulse += IMPULSE_ACCUMULATION_RATE * drive_pressure * context_match
else:
    node.impulse *= IMPULSE_DECAY  # decay toward zero
```

This ensures transient spikes do not trigger actions. Only sustained drive pressure accumulates enough impulse to cross the firing threshold.

### Step 4: Check Firing Threshold

If accumulated impulse exceeds the node's firing_threshold, the action fires.

```
if node.impulse >= node.firing_threshold:
    result = dispatch_action_command(node)
    node.impulse = 0.0                           # reset impulse
    node.refractory_until = current_tick + REFRACTORY_TICKS
    node.last_fired = current_tick
    record_action_moment(node, result)            # write result to graph
```

### Step 5: Dispatch to MCP Tool Handler

The `action_command` string is parsed to determine the target tool and arguments. Dispatch is a direct function call to the appropriate MCP handler — no LLM involved.

```
tool, args = parse_action_command(node.action_command)
# tool: "bash", "subcall", "send", "graph_write", etc.
# args: command-specific arguments

handler = MCP_TOOL_REGISTRY[tool]
result = handler.execute(args, context=node)
```

### Step 6: Record Result as Moment

The action result is written to the graph as a moment node, linked to the process node. Full output is stored on filesystem; the graph holds an EvidenceRef.

```
moment = create_moment_node(
    source=node.id,
    type="action_result",
    evidence_ref=write_output_to_filesystem(result),
    success=result.success,
    tick=current_tick,
)
graph.add_node(moment)
graph.add_edge(node.id, moment.id, type="produced")
```

---

## KEY DECISIONS

### D1: Sustained Pressure vs. Single-Tick Threshold

```
IF impulse accumulation requires sustained drive pressure over multiple ticks:
    Transient spikes decay away harmlessly
    Actions fire only when the drive is genuinely sustained
    WHY: Prevents reflexive overreaction to momentary stimuli

ELSE (single-tick threshold check):
    Any spike above threshold fires immediately
    WHY: Would cause erratic, trigger-happy behavior — rejected
```

### D2: Refractory Period After Firing

```
IF the process node enters a refractory period after firing:
    The same action cannot fire again for REFRACTORY_TICKS
    WHY: Prevents tight loops where an action fires every tick

ELSE (no refractory period):
    Action could fire continuously if drive stays high
    WHY: Would spam the system with duplicate actions — rejected
```

### D3: EvidenceRef vs. Inline Storage

```
IF action output is stored as an EvidenceRef (filesystem path):
    Graph stays lean; output can be arbitrarily large
    WHY: Graph nodes should be lightweight; multi-KB blobs degrade traversal

ELSE (inline storage in node properties):
    Graph bloats with raw output text
    WHY: Would make graph queries slow and memory-hungry — rejected
```

---

## DATA FLOW

```
Drive State (from Law 13-16 limbic engine)
    |
    v
Drive-Affinity Matching (Step 2)
    |
    v
Impulse Accumulation / Decay (Step 3)
    |
    v
Threshold Check (Step 4)
    |
    v
[if threshold crossed]
    |
    v
Parse action_command (Step 5)
    |
    v
Dispatch to MCP Tool Handler (Step 5)
    |
    v
Execute (bash / subcall / send / etc.)
    |
    v
Record Moment + EvidenceRef (Step 6)
    |
    v
Reset impulse, set refractory (Step 4)
```

---

## COMPLEXITY

**Time:** O(P * D) per tick — where P is the number of eligible process nodes and D is the number of drives. Both are small (P < 50, D < 10), so this is effectively O(1) per tick.

**Space:** O(P) — impulse state is stored per process node, already in the graph.

**Bottlenecks:**
- Action execution itself (shell commands can take seconds) — mitigated by async dispatch and refractory periods
- Graph write for moment nodes — should be batched if many actions fire in the same tick (unlikely given refractory periods)

---

## HELPER FUNCTIONS

### `parse_action_command()`

**Purpose:** Parse an action_command string into a tool name and arguments.

**Logic:** Split on first space. Tool name is the first token (must be in MCP_TOOL_REGISTRY). Remaining string is the argument payload. If tool name is not recognized, return error without executing.

### `compute_context_match()`

**Purpose:** Determine how well the current graph context matches the process node's intended activation context.

**Logic:** Compare the process node's neighborhood (linked nodes, active connections) against the current working memory contents. Returns a float [0.0, 1.0] representing alignment. High context match means the action is relevant to what the agent is currently "thinking about."

### `record_action_moment()`

**Purpose:** Write the action result to the graph as a moment node with an EvidenceRef.

**Logic:** Create a moment node, write full output to filesystem at a deterministic path, store the path as evidence_ref on the moment node, link moment to the source process node.

### `write_output_to_filesystem()`

**Purpose:** Persist action output (stdout, stderr, metadata) to the filesystem.

**Logic:** Write to `{HOME}/.mind/evidence/{node_id}/{tick}.json`. Returns the path for use as EvidenceRef.

---

## INTERACTIONS

| Module | What We Call | What We Get |
|--------|--------------|-------------|
| `runtime/cognition/laws/law_13_to_18_limbic_engine.py` | `_law_17_desire_activation()` | Drive pressure computation, impulse accumulation on nodes |
| `mcp/tools/*` | `handler.execute(args, context)` | Tool execution result (ActionResult) |
| `runtime/cognition/graph.py` | `graph.nodes()`, `graph.add_node()`, `graph.add_edge()` | Graph read/write for process nodes and moment recording |
| `home_server.py` | `MCP_TOOL_REGISTRY` | Registry of all 15 MCP tool handlers |

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Define REFRACTORY_TICKS constant and its initial value -->
<!-- @mind:todo Specify compute_context_match algorithm in detail -->
<!-- @mind:proposition Consider priority queuing when multiple actions fire in the same tick -->
<!-- @mind:escalation IMPULSE_ACCUMULATION_RATE and IMPULSE_DRIVE_THRESHOLD need empirical calibration -->
