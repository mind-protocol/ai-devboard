# Interaction — Patterns: The Graph Computes Between LLM Calls

```
STATUS: DRAFT
CREATED: 2026-03-15
VERIFIED: —
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Interaction.md
BEHAVIORS:      ./BEHAVIORS_Interaction.md
THIS:            PATTERNS_Interaction.md (you are here)
MECHANISMS:     (not applicable)
ALGORITHM:       ./ALGORITHM_Interaction.md
VALIDATION:      ./VALIDATION_Interaction.md
HEALTH:          ./HEALTH_Interaction.md
IMPLEMENTATION:  ./IMPLEMENTATION_Interaction.md
SYNC:            ./SYNC_Interaction.md

IMPL:            mcp/tools/ (15 handlers), runtime/cognition/laws/law_13_to_18_limbic_engine.py, home_server.py
```

### Bidirectional Contract

**Before modifying this doc or the code:**
1. Read ALL docs in this chain first
2. Read the linked IMPL source file

**After modifying this doc:**
1. Update the IMPL source file to match, OR
2. Add a TODO in SYNC_Interaction.md: "Docs updated, implementation needs: {what}"
3. Run tests: `python -m pytest tests/interaction/`

**After modifying the code:**
1. Update this doc chain to match, OR
2. Add a TODO in SYNC_Interaction.md: "Implementation changed, docs need: {what}"
3. Run tests: `python -m pytest tests/interaction/`

---

## THE PROBLEM

An AI citizen without a motor interface is a brain in a jar. It can think (LLM inference) but it cannot act on its environment — cannot write files, run commands, send messages, or modify its own graph. Worse: every action requires an expensive LLM call, even for reflexive operations that should be automatic.

Without autonomous execution, the agent is purely reactive. It waits for external stimuli, processes them through inference, and responds. There is no initiative, no self-correction, no subconscious behavior. The agent cannot check its own health, explore its codebase out of curiosity, or ask for help when stuck — unless a human or an LLM call explicitly triggers these actions.

The cost is not just latency and compute. The cost is that the agent is not alive.

---

## THE PATTERN

**15 MCP tools organized into THINK/ACT/SPEAK — the motor interface of the cognitive agent.**

The key insight: **process nodes in the graph carry an `action_command` field**. When Law 17 (Impulse Accumulation) drives energy into an action node past its threshold, the command fires — no LLM required. The graph itself is the execution engine between inference calls.

This creates two execution paths:
- **Conscious path**: LLM decides to invoke an MCP tool explicitly (e.g., `bash("npm test")`)
- **Subconscious path**: Graph physics accumulates drive pressure on a process node until its `action_command` fires reflexively

Both paths use the same 15 MCP tool handlers. The difference is who pulls the trigger: the LLM or the graph.

**Tool taxonomy:**

| Category | Tools | Nature |
|----------|-------|--------|
| THINK | `graph_query`, `graph_write`, `think` | Read/write the cognitive graph, internal monologue |
| ACT | `subcall`, `bash`, `procedure`, `place`, `task`, `alarm`, `spawn`, `profile` | Execute actions on the environment |
| SPEAK | `send`, `read`, `media` | Omnichannel communication (TG, Discord, email, voice, images) |

---

## BEHAVIORS SUPPORTED

- B1 — Linter runs automatically on self_preservation spike (subconscious reflex via action_command)
- B2 — Codebase exploration on curiosity drive (action_command dispatches explore command)
- B3 — Auto-subcall on frustration accumulation (telepathy to another citizen when impasse detected)
- B4 — Shell commands fire without LLM (pure graph physics triggers action_command dispatch)

## BEHAVIORS PREVENTED

- A1 — Action firing on transient spikes (impulse accumulation requires sustained pressure, not a single tick)
- A2 — Raw code stored in graph nodes (EvidenceRef pattern: graph holds references, not payloads)

---

## PRINCIPLES

### Principle 1: The Graph Computes Between LLM Calls

Between inference calls, the graph is not idle. Law 17 impulse accumulation runs every tick, drives modulate action node energy, and when threshold is crossed, the action_command fires. The graph is a compute substrate, not just a data store.

This matters because it enables subconscious behavior — the agent corrects, explores, and communicates without waiting for the next LLM call.

### Principle 2: Action Commands on Process Nodes

Every process node can carry an `action_command` field — a shell command, a subcall target, or a tool invocation string. The command is inert until impulse accumulation crosses threshold. This makes the graph declarative: you define what should happen and under what drive conditions; the physics decide when.

This matters because it separates intent from timing. The agent's desires and self-preservation instincts are encoded in the graph structure, not in prompt engineering.

### Principle 3: Subconscious Mode Is Zero-LLM

Subconscious reflexes must execute with zero inference calls. If a reflex requires an LLM to decide whether to fire, it is not a reflex — it is a conscious decision. The boundary is strict: action_command dispatch reads drive state and threshold from the graph, computes a comparison, and either fires or does not.

This matters because LLM calls cost time and money. Self-preservation reflexes (health checks, linting, restart) must be instant and free.

### Principle 4: Drive-Affinity Matching

Not every drive triggers every action. Each process node has a `drive_affinity` — a mapping from drive names to coupling strengths. A process:check_health node has high affinity to self_preservation but zero affinity to curiosity. This prevents curiosity from accidentally triggering a health check.

This matters because without affinity gating, high-energy drives would fire every available action indiscriminately.

---

## DATA

| Source | Type | Purpose / Description |
|--------|------|-----------------------|
| `runtime/cognition/laws/law_13_to_18_limbic_engine.py` | FILE | Law 17 impulse accumulation implementation |
| `mcp/tools/` | DIR | 15 MCP tool handler implementations |
| `home_server.py` | FILE | Server entry point, MCP tool registration, action dispatch |
| Graph process nodes | GRAPH | Nodes of type `process` carrying `action_command`, `drive_affinity`, and impulse state |

---

## DEPENDENCIES

| Module | Why We Depend On It |
|--------|---------------------|
| `cognition/l1` (Laws 13-18) | Law 17 impulse accumulation is the engine that fires action_commands |
| `cognition/l1` (Graph substrate) | Process nodes, drive state, and energy propagation live in the cognitive graph |
| MCP protocol | Tool invocation protocol — defines the request/response contract for all 15 tools |

---

## INSPIRATIONS

- **Basal ganglia action selection**: The biological motor system where competing action plans accumulate evidence (drive pressure) until one crosses threshold and fires — while others are inhibited. Law 17 impulse accumulation mirrors this: sustained drive pressure, not a single spike, selects the action.
- **Subsumption architecture (Brooks)**: Layered behavioral control where lower layers (reflexes) can override higher layers (planning). Subconscious mode is the lowest layer — it fires without consulting the "cortex" (LLM).
- **Unix philosophy**: Each of the 15 tools does one thing. `bash` runs commands. `send` sends messages. `graph_write` mutates the graph. Composition happens at the graph level, not inside the tools.

---

## SCOPE

### In Scope

- 15 MCP tool handlers (THINK/ACT/SPEAK taxonomy)
- action_command field on process nodes
- Law 17 impulse accumulation driving autonomous execution
- Subconscious reflex loop (zero-LLM action dispatch)
- Drive-affinity matching between drives and process nodes
- Omnichannel message send/read/media

### Out of Scope

- LLM inference itself — see: cognition/l1 (the interaction module fires tools, not the LLM)
- Graph schema design — see: cognition/l1 (this module consumes process nodes, does not define the full schema)
- Drive physics (Laws 13-16) — see: cognition/l1 (this module reads drive state, does not compute it)
- Channel-specific adapters (Telegram bot setup, Discord OAuth) — see: social/ (this module calls a unified send interface)

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Define the full drive_affinity schema for process nodes -->
<!-- @mind:todo Enumerate all 15 tool handler signatures -->
<!-- @mind:proposition Consider a "veto" mechanism where high self_preservation can block curiosity-driven actions -->
<!-- @mind:escalation Threshold values for impulse accumulation need empirical tuning — what is the initial calibration strategy? -->
