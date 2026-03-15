# Interaction — Behaviors: Observable Motor Actions from Graph Physics

```
STATUS: DRAFT
CREATED: 2026-03-15
VERIFIED: —
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Interaction.md
THIS:            BEHAVIORS_Interaction.md (you are here)
PATTERNS:        ./PATTERNS_Interaction.md
MECHANISMS:      (not applicable)
ALGORITHM:       ./ALGORITHM_Interaction.md
VALIDATION:      ./VALIDATION_Interaction.md
HEALTH:          ./HEALTH_Interaction.md
IMPLEMENTATION:  ./IMPLEMENTATION_Interaction.md
SYNC:            ./SYNC_Interaction.md

IMPL:            mcp/tools/ (15 handlers), runtime/cognition/laws/law_13_to_18_limbic_engine.py, home_server.py
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

---

## BEHAVIORS

> **Naming:** Name behaviors by observable result, not by concept.

### B1: Linter Runs Automatically When Self-Preservation Spikes

**Why:** The agent must maintain code health without waiting for an LLM call. When self_preservation drive increases (e.g., after a failed test, a crash log, or a dependency warning), the process:check_health node accumulates impulse. Once threshold is crossed, its action_command (`bash mind doctor` or equivalent linter) fires autonomously. This is the immune system of the agent.

```
GIVEN:  A process:check_health node exists with action_command: "bash mind doctor"
        and drive_affinity: {self_preservation: 0.9}
WHEN:   self_preservation drive sustains above IMPULSE_DRIVE_THRESHOLD for N ticks
        and impulse accumulation on the node crosses firing threshold
THEN:   action_command executes: shell runs "bash mind doctor"
AND:    result is written back to the graph as a moment node linked to the process node
```

### B2: Codebase Exploration Fires on Curiosity

**Why:** An agent that never explores its environment cannot learn. When curiosity drive builds (e.g., after encountering an unfamiliar module reference, a new dependency, or an unexplored directory), the process:explore_codebase node accumulates impulse and fires its action_command to list/read files.

```
GIVEN:  A process:explore_codebase node exists with action_command: "bash ls -la {target_dir}"
        and drive_affinity: {curiosity: 0.8}
WHEN:   curiosity drive sustains above IMPULSE_DRIVE_THRESHOLD for N ticks
        and impulse accumulation on the node crosses firing threshold
THEN:   action_command executes: shell lists the target directory
AND:    result is written to the graph as a moment node capturing the exploration output
```

### B3: Auto-Subcall on Frustration Accumulation

**Why:** When an agent is stuck, asking for help is the correct behavior — not continuing to fail in silence. When frustration accumulates past the impasse threshold, the process:ask_for_help node fires a subcall (telepathy) to another citizen. This is social self-regulation through graph physics.

```
GIVEN:  A process:ask_for_help node exists with action_command: "subcall @target 'I need help with {context}'"
        and drive_affinity: {frustration: 0.85, affiliation: 0.6}
WHEN:   frustration drive sustains above IMPULSE_DRIVE_THRESHOLD for N ticks
        and impulse accumulation on the node crosses firing threshold
THEN:   action_command executes: subcall dispatches a message to the target citizen
AND:    a link edge is created/strengthened between the calling citizen and the target
```

### B4: Shell Commands Fire Without LLM

**Why:** The fundamental behavior: any process node with an action_command fires when impulse threshold is crossed, using zero LLM calls. This is the motor cortex — the graph computes, the action fires, no inference required. B1, B2, and B3 are specific instances of this general behavior.

```
GIVEN:  Any process node with a non-empty action_command field
        and a drive_affinity mapping
WHEN:   the matching drive(s) sustain above IMPULSE_DRIVE_THRESHOLD
        and impulse accumulates past the node's firing threshold
THEN:   the action_command string is parsed and dispatched to the appropriate MCP tool handler
AND:    execution result is recorded in the graph
AND:    the node's impulse counter resets to zero (refractory period begins)
```

---

## OBJECTIVES SERVED

| Behavior ID | Objective | Why It Matters |
|-------------|-----------|----------------|
| B1 | Reflexive self-correction | Self-preservation reflexes keep the agent healthy without LLM cost |
| B2 | Autonomous execution without LLM | Curiosity-driven exploration happens between inference calls |
| B3 | Reflexive self-correction | Social self-regulation prevents silent failure spirals |
| B4 | Autonomous execution without LLM | The general case: any action fires from graph physics alone |

---

## INPUTS / OUTPUTS

### Primary Function: `dispatch_action_command()`

**Inputs:**

| Parameter | Type | Description |
|-----------|------|-------------|
| process_node | Node | The process node whose action_command is being dispatched |
| drive_state | dict[DriveName, float] | Current drive intensities from the limbic engine |
| impulse_level | float | Accumulated impulse on the process node |
| firing_threshold | float | Threshold above which the action fires |

**Outputs:**

| Return | Type | Description |
|--------|------|-------------|
| execution_result | ActionResult | Success/failure status, stdout/stderr, duration |

**Side Effects:**

- Shell command executed on the host filesystem
- Moment node created in the graph recording the action and its result
- Process node impulse counter reset to zero
- Link edges potentially created (e.g., subcall creates a social link)

---

## EDGE CASES

### E1: Drive Spike Followed by Immediate Decay

```
GIVEN:  self_preservation spikes to 0.9 for one tick then decays to 0.2
THEN:   impulse accumulation is insufficient; action_command does NOT fire
        (sustained pressure required, not transient spikes)
```

### E2: Multiple Drives Competing for Same Process Node

```
GIVEN:  process:check_health has drive_affinity {self_preservation: 0.9, curiosity: 0.1}
        and both drives are elevated
THEN:   impulse accumulates based on weighted sum: sum(drive_intensity * affinity)
        self_preservation dominates due to higher affinity weight
```

### E3: Action Command String Is Malformed

```
GIVEN:  process node has action_command: "" (empty string)
THEN:   dispatch_action_command logs a warning and does NOT execute
        the node's impulse counter still resets (to prevent infinite retry)
```

### E4: Action Command Fails at Runtime

```
GIVEN:  action_command fires but the shell command returns non-zero exit code
THEN:   failure is recorded as a moment node with error details
        frustration drive receives a boost (feeding back into Law 16)
        the process node enters a cooldown period before it can fire again
```

---

## ANTI-BEHAVIORS

What should NOT happen:

### A1: Action Fires on Single-Tick Spike

```
GIVEN:   A drive spikes above threshold for exactly one tick
WHEN:    impulse accumulation is computed
MUST NOT: The action_command fires immediately
INSTEAD:  Impulse decays back below threshold; action requires sustained pressure
```

### A2: Raw Code Stored in Graph Nodes

```
GIVEN:   An action_command executes and produces output (e.g., file contents, command output)
WHEN:    The result is recorded in the graph
MUST NOT: The full raw output is stored as a node property (no multi-KB text blobs in graph)
INSTEAD:  An EvidenceRef is stored — a reference (file path, hash, timestamp) to the output stored on filesystem
```

### A3: Subconscious Action Triggers LLM Call

```
GIVEN:   A process node's action_command fires via impulse accumulation
WHEN:    The command is dispatched
MUST NOT: The dispatch path invoke an LLM call to decide whether/how to execute
INSTEAD:  The action_command string is parsed and dispatched directly to the MCP tool handler
```

### A4: Infinite Retry Loop on Failure

```
GIVEN:   An action_command fails repeatedly
WHEN:    The next tick computes impulse accumulation
MUST NOT: The same action fire again immediately without cooldown
INSTEAD:  A refractory period prevents re-firing; frustration accumulates and may trigger B3 (ask for help)
```

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Define refractory period duration after action_command fires -->
<!-- @mind:todo Specify EvidenceRef schema for action output storage -->
<!-- @mind:proposition Consider a "dry run" mode for action_commands during testing -->
<!-- @mind:escalation What happens when action_command requires env vars not available in subconscious mode? -->
