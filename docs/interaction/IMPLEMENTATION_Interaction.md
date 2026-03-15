# Interaction — Implementation: Code Architecture and Structure

```
STATUS: DRAFT
CREATED: 2026-03-15
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Interaction.md
BEHAVIORS:       ./BEHAVIORS_Interaction.md
PATTERNS:        ./PATTERNS_Interaction.md
MECHANISMS:     (not applicable)
ALGORITHM:       ./ALGORITHM_Interaction.md
VALIDATION:      ./VALIDATION_Interaction.md
THIS:           IMPLEMENTATION_Interaction.md
HEALTH:         ./HEALTH_Interaction.md
SYNC:           ./SYNC_Interaction.md

IMPL:           mcp/tools/ (15 handlers), runtime/cognition/laws/law_13_to_18_limbic_engine.py, home_server.py
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

---

## CODE STRUCTURE

```
mcp/
├── tools/
│   ├── __init__.py                # MCP_TOOL_REGISTRY export
│   ├── think/
│   │   ├── graph_query.py         # THINK: read graph state
│   │   ├── graph_write.py         # THINK: mutate graph state
│   │   └── think.py               # THINK: internal monologue / reasoning trace
│   ├── act/
│   │   ├── subcall.py             # ACT: telepathy — call another citizen
│   │   ├── bash.py                # ACT: execute shell commands
│   │   ├── procedure.py           # ACT: run named procedure sequences
│   │   ├── place.py               # ACT: position in spatial context
│   │   ├── task.py                # ACT: create/manage task nodes
│   │   ├── alarm.py               # ACT: schedule future triggers
│   │   ├── spawn.py               # ACT: create new process nodes
│   │   └── profile.py             # ACT: read/update citizen profile
│   └── speak/
│       ├── send.py                # SPEAK: send message (omnichannel)
│       ├── read.py                # SPEAK: read messages (omnichannel)
│       └── media.py               # SPEAK: images, voice, attachments
runtime/
├── cognition/
│   ├── laws/
│   │   └── law_13_to_18_limbic_engine.py   # Law 17 impulse accumulation
│   └── dispatch/
│       └── action_dispatch.py              # Subconscious action dispatch loop
home_server.py                              # Server entry, MCP registration, tick integration
```

### File Responsibilities

| File | Purpose | Key Functions/Classes | Lines | Status |
|------|---------|----------------------|-------|--------|
| `mcp/tools/__init__.py` | Tool registry and discovery | `MCP_TOOL_REGISTRY`, `register_tool()` | ~50 | OK |
| `mcp/tools/act/bash.py` | Shell command execution | `BashTool.execute()` | ~80 | OK |
| `mcp/tools/act/subcall.py` | Citizen-to-citizen telepathy | `SubcallTool.execute()` | ~120 | OK |
| `mcp/tools/speak/send.py` | Omnichannel message send | `SendTool.execute()` | ~100 | OK |
| `mcp/tools/speak/read.py` | Omnichannel message read | `ReadTool.execute()` | ~80 | OK |
| `mcp/tools/speak/media.py` | Image/voice/attachment handling | `MediaTool.execute()` | ~100 | OK |
| `mcp/tools/think/graph_query.py` | Graph read operations | `GraphQueryTool.execute()` | ~60 | OK |
| `mcp/tools/think/graph_write.py` | Graph mutation operations | `GraphWriteTool.execute()` | ~80 | OK |
| `mcp/tools/think/think.py` | Internal monologue recording | `ThinkTool.execute()` | ~40 | OK |
| `mcp/tools/act/procedure.py` | Named procedure runner | `ProcedureTool.execute()` | ~80 | OK |
| `mcp/tools/act/place.py` | Spatial positioning | `PlaceTool.execute()` | ~60 | OK |
| `mcp/tools/act/task.py` | Task node management | `TaskTool.execute()` | ~80 | OK |
| `mcp/tools/act/alarm.py` | Future trigger scheduling | `AlarmTool.execute()` | ~60 | OK |
| `mcp/tools/act/spawn.py` | Process node creation | `SpawnTool.execute()` | ~70 | OK |
| `mcp/tools/act/profile.py` | Citizen profile access | `ProfileTool.execute()` | ~50 | OK |
| `runtime/cognition/laws/law_13_to_18_limbic_engine.py` | Law 17 impulse accumulation | `_law_17_desire_activation()` | ~700 | WATCH |
| `runtime/cognition/dispatch/action_dispatch.py` | Subconscious dispatch loop | `dispatch_action_command()`, `parse_action_command()` | ~150 | OK |
| `home_server.py` | Server entry point | `register_mcp_tools()`, `tick_integration()` | ~300 | OK |

**Size Thresholds:**
- **OK** (<400 lines): Healthy size, easy to understand
- **WATCH** (400-700 lines): Getting large, consider extraction opportunities
- **SPLIT** (>700 lines): Too large, must split before adding more code

> When a file reaches WATCH status, identify extraction candidates in the EXTRACTION CANDIDATES section below.
> When a file reaches SPLIT status, splitting becomes the next task before any feature work.

---

## DESIGN PATTERNS

### Architecture Pattern

**Pattern:** Event-Driven + Registry

**Why this pattern:** MCP tools are registered in a central registry and dispatched by name. The impulse accumulation loop is event-driven (tick events trigger the dispatch cycle). This keeps tool implementations decoupled from the dispatch mechanism.

### Code Patterns in Use

| Pattern | Applied To | Purpose |
|---------|------------|---------|
| Registry | `mcp/tools/__init__.py:MCP_TOOL_REGISTRY` | Decouple tool lookup from tool implementation |
| Strategy | `mcp/tools/*/Tool.execute()` | Each tool implements the same interface with different behavior |
| Observer | `runtime/cognition/dispatch/action_dispatch.py` | Watches impulse levels and fires actions on threshold crossing |
| Factory | `mcp/tools/act/spawn.py:SpawnTool` | Creates new process nodes with appropriate defaults |

### Anti-Patterns to Avoid

- **God Handler**: Don't put all 15 tool implementations in a single file. Each tool gets its own module.
- **LLM in the Loop**: Don't call inference inside the dispatch path. If dispatch needs intelligence, the design is wrong — redesign the action_command or the drive_affinity.
- **Inline Output Storage**: Don't store command output in graph node properties. Always use EvidenceRef.

### Boundaries

| Boundary | Inside | Outside | Interface |
|----------|--------|---------|-----------|
| MCP Tool Layer | Tool execution, argument parsing, result formatting | Drive computation, impulse physics | `Tool.execute(args, context) -> ActionResult` |
| Dispatch Layer | Impulse checking, threshold comparison, tool selection | Drive physics (Law 13-16), tool-specific logic | `dispatch_action_command(node, drive_state) -> ActionResult` |
| Evidence Layer | Output persistence, EvidenceRef creation | Graph schema, tool execution | `write_output_to_filesystem(result) -> str` |

---

## SCHEMA

### Process Node (action-capable)

```yaml
ProcessNode:
  required:
    - id: str                          # unique node identifier
    - type: NodeType.PROCESS           # node type discriminator
    - action_command: str              # tool invocation string (e.g., "bash mind doctor")
    - drive_affinity: dict             # {drive_name: coupling_strength}
  optional:
    - impulse: float                   # accumulated impulse (default 0.0)
    - firing_threshold: float          # threshold for firing (default from config)
    - refractory_until: int            # tick after which node can fire again (default 0)
    - last_fired: int                  # tick of last firing (default None)
  constraints:
    - drive_affinity values must be in [0.0, 1.0]
    - firing_threshold must be positive
    - action_command must start with a valid tool name from MCP_TOOL_REGISTRY
```

### ActionResult

```yaml
ActionResult:
  required:
    - success: bool                    # execution outcome
    - tool: str                        # which MCP tool was invoked
    - duration_ms: int                 # execution time
    - evidence_ref: str                # filesystem path to full output
  optional:
    - stdout: str                      # command stdout (bash only)
    - stderr: str                      # command stderr (bash only)
  relationships:
    - produced_by: ProcessNode         # the process node that fired
    - recorded_in: MomentNode          # the moment node storing the result
```

---

## ENTRY POINTS

| Entry Point | File:Line | Triggered By |
|-------------|-----------|--------------|
| Tick dispatch | `runtime/cognition/dispatch/action_dispatch.py:dispatch_all()` | Physics tick completion (every tick) |
| LLM tool call | `home_server.py:handle_mcp_request()` | LLM inference decides to invoke a tool |
| Manual tool call | `home_server.py:handle_mcp_request()` | Human or external system invokes tool via MCP protocol |

---

## DATA FLOW AND DOCKING (FLOW-BY-FLOW)

### Subconscious Dispatch Flow: Impulse to Action

Explain what this flow covers: the complete path from drive state through impulse accumulation to action_command dispatch. This is the primary autonomous execution path — the reason this module exists. It transforms internal cognitive state (drives) into external actions (shell commands, messages, subcalls).

```yaml
flow:
  name: subconscious_dispatch
  purpose: Transform sustained drive pressure into autonomous action execution
  scope: drive_state input -> impulse accumulation -> threshold check -> tool dispatch -> result recording
  steps:
    - id: step_1_collect
      description: Gather eligible process nodes (non-empty action_command, not in refractory)
      file: runtime/cognition/dispatch/action_dispatch.py
      function: dispatch_all()
      input: graph (all process nodes)
      output: list[ProcessNode]
      trigger: tick_complete event
      side_effects: none
    - id: step_2_pressure
      description: Compute drive pressure per node via drive-affinity matching
      file: runtime/cognition/laws/law_13_to_18_limbic_engine.py
      function: _law_17_desire_activation()
      input: ProcessNode, DriveState
      output: float (drive_pressure)
      trigger: called by dispatch_all
      side_effects: none
    - id: step_3_accumulate
      description: Accumulate impulse if pressure sustained, decay if not
      file: runtime/cognition/laws/law_13_to_18_limbic_engine.py
      function: _law_17_desire_activation()
      input: drive_pressure, node.impulse
      output: updated node.impulse
      trigger: continuation of step_2
      side_effects: node.impulse mutated
    - id: step_4_dispatch
      description: Parse action_command and dispatch to MCP tool handler
      file: runtime/cognition/dispatch/action_dispatch.py
      function: dispatch_action_command()
      input: ProcessNode (with impulse >= threshold)
      output: ActionResult
      trigger: impulse >= firing_threshold
      side_effects: shell command executed, subcall sent, message dispatched
    - id: step_5_record
      description: Write result to filesystem, create moment node, link to process
      file: runtime/cognition/dispatch/action_dispatch.py
      function: record_action_moment()
      input: ActionResult, ProcessNode
      output: MomentNode with EvidenceRef
      trigger: action dispatch completion
      side_effects: filesystem write, graph mutation (new node + edge)
  docking_points:
    guidance:
      include_when: significant state change, boundary crossing, risk of failure
      omit_when: trivial internal variable assignment
      selection_notes: Focus on the impulse threshold crossing (decision point) and the action dispatch (external effect)
    available:
      - id: dock_impulse_state
        type: graph_ops
        direction: output
        file: runtime/cognition/laws/law_13_to_18_limbic_engine.py
        function: _law_17_desire_activation()
        trigger: each tick
        payload: {node_id, impulse_level, drive_pressure}
        async_hook: not_applicable
        needs: none
        notes: Impulse state per node after accumulation/decay
      - id: dock_threshold_crossed
        type: event
        direction: output
        file: runtime/cognition/dispatch/action_dispatch.py
        function: dispatch_action_command()
        trigger: impulse >= firing_threshold
        payload: {node_id, action_command, impulse_at_fire, drive_state}
        async_hook: optional
        needs: add event emission
        notes: Critical decision point — action is about to fire
      - id: dock_action_result
        type: event
        direction: output
        file: runtime/cognition/dispatch/action_dispatch.py
        function: record_action_moment()
        trigger: action dispatch completion
        payload: ActionResult
        async_hook: optional
        needs: add event emission
        notes: Result of autonomous action — success/failure affects drives
      - id: dock_evidence_write
        type: file
        direction: output
        file: runtime/cognition/dispatch/action_dispatch.py
        function: write_output_to_filesystem()
        trigger: action result recording
        payload: {evidence_path, content_bytes}
        async_hook: not_applicable
        needs: none
        notes: Filesystem write for EvidenceRef
    health_recommended:
      - dock_id: dock_threshold_crossed
        reason: Critical decision point — verify actions only fire under sustained pressure (V1)
      - dock_id: dock_action_result
        reason: Verify execution path is zero-LLM (V2) and results use EvidenceRef (V3)
```

### Conscious Tool Invocation Flow: LLM to Action

This flow covers the LLM-initiated path: the LLM decides to invoke a tool, the MCP protocol routes it to the handler, and the result is returned. Simpler than subconscious dispatch but shares the same tool handlers.

```yaml
flow:
  name: conscious_invocation
  purpose: LLM-initiated tool execution through MCP protocol
  scope: LLM tool call -> MCP routing -> tool handler -> result
  steps:
    - id: step_1_receive
      description: Receive MCP tool invocation request from LLM
      file: home_server.py
      function: handle_mcp_request()
      input: MCP ToolCallRequest
      output: parsed tool name + args
      trigger: LLM inference output
      side_effects: none
    - id: step_2_dispatch
      description: Look up tool in registry and execute
      file: mcp/tools/__init__.py
      function: MCP_TOOL_REGISTRY[tool].execute()
      input: tool args, citizen context
      output: ActionResult
      trigger: MCP request handling
      side_effects: tool-specific (shell, graph, message)
    - id: step_3_respond
      description: Format result and return to LLM
      file: home_server.py
      function: handle_mcp_request()
      input: ActionResult
      output: MCP ToolCallResponse
      trigger: tool execution completion
      side_effects: none
  docking_points:
    guidance:
      include_when: boundary crossing between LLM and tool execution
      omit_when: internal MCP protocol framing
      selection_notes: The tool execution step is shared with subconscious dispatch
    available:
      - id: dock_mcp_request
        type: api
        direction: input
        file: home_server.py
        function: handle_mcp_request()
        trigger: LLM tool call
        payload: MCP ToolCallRequest
        async_hook: not_applicable
        needs: none
        notes: Entry point for LLM-initiated actions
      - id: dock_mcp_response
        type: api
        direction: output
        file: home_server.py
        function: handle_mcp_request()
        trigger: tool execution completion
        payload: MCP ToolCallResponse
        async_hook: not_applicable
        needs: none
        notes: Result returned to LLM
    health_recommended:
      - dock_id: dock_mcp_request
        reason: Track which tools the LLM invokes and how often
```

---

## LOGIC CHAINS

### LC1: Subconscious Reflex (Drive to Shell Command)

**Purpose:** End-to-end path from a sustained drive to a shell command execution

```
DriveState (from limbic engine)
  -> _law_17_desire_activation()     # compute drive pressure per process node
    -> dispatch_all()                # collect eligible nodes, check thresholds
      -> dispatch_action_command()   # parse action_command, call tool handler
        -> BashTool.execute()        # run shell command
          -> record_action_moment()  # write EvidenceRef, create moment node
```

**Data transformation:**
- Input: `DriveState` — dict of drive intensities
- After step 1: `float` — drive_pressure per node (weighted sum)
- After step 2: `ProcessNode[]` — nodes with impulse >= threshold
- After step 3: `ActionResult` — execution outcome
- Output: `MomentNode` — graph record with EvidenceRef

### LC2: Telepathy Subcall (Frustration to Help Request)

**Purpose:** End-to-end path from frustration accumulation to subcall dispatch

```
frustration drive sustained
  -> impulse accumulates on process:ask_for_help
    -> threshold crossed
      -> SubcallTool.execute("@target 'I need help with {context}'")
        -> target citizen receives incoming Moment
          -> link edge created/strengthened
```

---

## MODULE DEPENDENCIES

### Internal Dependencies

```
runtime/cognition/dispatch/action_dispatch.py
    └── imports -> runtime/cognition/laws/law_13_to_18_limbic_engine.py
    └── imports -> mcp/tools/__init__.py (MCP_TOOL_REGISTRY)
    └── imports -> runtime/cognition/models.py (Node, NodeType, DriveName)

home_server.py
    └── imports -> mcp/tools/__init__.py
    └── imports -> runtime/cognition/dispatch/action_dispatch.py
```

### External Dependencies

| Package | Used For | Imported By |
|---------|----------|-------------|
| `subprocess` | Shell command execution in BashTool | `mcp/tools/act/bash.py` |
| `asyncio` | Async tool execution | `runtime/cognition/dispatch/action_dispatch.py` |
| `json` | EvidenceRef serialization | `runtime/cognition/dispatch/action_dispatch.py` |

---

## STATE MANAGEMENT

### Where State Lives

| State | Location | Scope | Lifecycle |
|-------|----------|-------|-----------|
| impulse | `ProcessNode.impulse` | per-node | Accumulates each tick, resets on firing |
| refractory_until | `ProcessNode.refractory_until` | per-node | Set on firing, cleared after N ticks |
| MCP_TOOL_REGISTRY | `mcp/tools/__init__.py` | global | Created at startup, immutable after |
| evidence files | `~/.mind/evidence/{node_id}/` | filesystem | Created on action firing, pruned by compaction |

### State Transitions

```
idle (impulse=0) ──accumulate──> charging (0 < impulse < threshold) ──threshold──> firing (dispatch) ──reset──> refractory ──cooldown──> idle
```

---

## RUNTIME BEHAVIOR

### Initialization

```
1. home_server.py registers all 15 MCP tool handlers in MCP_TOOL_REGISTRY
2. action_dispatch.py subscribes to tick_complete events
3. System ready — both conscious (LLM) and subconscious (physics) paths active
```

### Main Loop / Request Cycle

```
1. Tick completes -> limbic engine updates drive state (Laws 13-18)
2. dispatch_all() collects eligible process nodes
3. For each node: compute drive_pressure, accumulate/decay impulse
4. For nodes crossing threshold: parse action_command, dispatch to tool handler
5. Record results as moment nodes with EvidenceRef
6. Reset impulse, set refractory period
```

### Shutdown

```
1. Wait for in-flight action_commands to complete (timeout: 30s)
2. Flush pending moment nodes to graph
3. Persist impulse state for next startup
```

---

## CONCURRENCY MODEL

| Component | Model | Notes |
|-----------|-------|-------|
| Impulse accumulation | Sync (within tick) | Runs as part of the sequential tick loop |
| Action dispatch | Async (fire and track) | Shell commands may take seconds; dispatched async with timeout |
| MCP request handling | Async (per-request) | LLM tool calls handled as async requests |
| Evidence writes | Sync (blocking) | Must complete before moment node is created |

---

## CONFIGURATION

| Config | Location | Default | Description |
|--------|----------|---------|-------------|
| `IMPULSE_ACCUMULATION_RATE` | `runtime/cognition/constants.py` | 0.1 | Rate at which impulse grows under sustained pressure |
| `IMPULSE_DRIVE_THRESHOLD` | `runtime/cognition/constants.py` | 0.3 | Minimum drive_pressure to accumulate impulse |
| `IMPULSE_CONTEXT_THRESHOLD` | `runtime/cognition/constants.py` | 0.2 | Minimum context_match to accumulate impulse |
| `IMPULSE_DECAY` | `runtime/cognition/constants.py` | 0.95 | Multiplicative decay per tick when pressure absent |
| `REFRACTORY_TICKS` | `runtime/cognition/constants.py` | 10 | Ticks before a fired node can fire again |
| `EVIDENCE_DIR` | `home_server.py` | `~/.mind/evidence/` | Filesystem path for EvidenceRef storage |

---

## BIDIRECTIONAL LINKS

### Code -> Docs

Files that reference this documentation:

| File | Line | Reference |
|------|------|-----------|
| `runtime/cognition/laws/law_13_to_18_limbic_engine.py` | 1-33 | `# Spec: docs/cognition/l1/ALGORITHM_L1_Physics.md` |
| `runtime/cognition/dispatch/action_dispatch.py` | TBD | `# DOCS: docs/interaction/IMPLEMENTATION_Interaction.md` |

### Docs -> Code

| Doc Section | Implemented In |
|-------------|----------------|
| ALGORITHM step 2 (drive pressure) | `law_13_to_18_limbic_engine.py:_law_17_desire_activation()` |
| ALGORITHM step 3 (impulse accumulate) | `law_13_to_18_limbic_engine.py:_law_17_desire_activation()` |
| ALGORITHM step 5 (dispatch) | `action_dispatch.py:dispatch_action_command()` |
| BEHAVIOR B4 | `action_dispatch.py:dispatch_all()` |
| VALIDATION V1 | pending test |
| VALIDATION V2 | pending test |
| VALIDATION V3 | pending test |

---

## EXTRACTION CANDIDATES

Files approaching WATCH/SPLIT status - identify what can be extracted:

| File | Current | Target | Extract To | What to Move |
|------|---------|--------|------------|--------------|
| `law_13_to_18_limbic_engine.py` | ~700L | <400L | `law_17_impulse.py` | `_law_17_desire_activation()` and impulse-specific helpers |

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Create action_dispatch.py with dispatch_all() and dispatch_action_command() -->
<!-- @mind:todo Create all 15 MCP tool handler files -->
<!-- @mind:todo Extract Law 17 impulse accumulation into its own module -->
<!-- @mind:proposition Consider a tool execution audit log separate from EvidenceRef -->
<!-- @mind:escalation home_server.py structure — does it exist yet or needs creation? -->
