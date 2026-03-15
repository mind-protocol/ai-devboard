# OBJECTIVES — Interaction

```
STATUS: DRAFT
CREATED: 2026-03-15
VERIFIED: —
```

---

## CHAIN

```
THIS:            OBJECTIVES_Interaction.md (you are here - START HERE)
PATTERNS:       ./PATTERNS_Interaction.md
BEHAVIORS:      ./BEHAVIORS_Interaction.md
ALGORITHM:      ./ALGORITHM_Interaction.md
VALIDATION:     ./VALIDATION_Interaction.md
IMPLEMENTATION: ./IMPLEMENTATION_Interaction.md
SYNC:           ./SYNC_Interaction.md

IMPL:           mcp/tools/ (15 handlers), runtime/cognition/laws/law_13_to_18_limbic_engine.py, home_server.py
```

**Read this chain in order before making changes.** Each doc answers different questions. Skipping ahead means missing context.

---

## PRIMARY OBJECTIVES (ranked)
1. **Autonomous execution without LLM** — Action nodes fire shell commands, graph writes, and subcalls when drive pressure crosses threshold. The graph computes between LLM calls; the agent acts without waiting for inference. This is the motor cortex.
2. **Reflexive self-correction** — Subconscious mode (zero LLM) enables the agent to detect drift, run linters, restart processes, and correct state through physics alone. Self-preservation drive triggers corrective actions before the agent even "thinks" about them.
3. **Omnichannel communication** — Citizens send and read messages across Telegram, Discord, email, and internal channels through a unified SPEAK interface. Media tools handle images and voice. The agent communicates as naturally as it computes.

## NON-OBJECTIVES
- Building a general-purpose shell — MCP tools are scoped to the agent's graph-driven needs, not a POSIX replacement
- Human-facing GUI for tool management — tools are invoked by the agent or by graph physics, never through a dashboard
- Real-time streaming of tool output to external observers — tool results write to the graph; observation happens through graph queries
- Replacing the LLM — subconscious mode handles reflexes, not reasoning; complex decisions still require inference

## TRADEOFFS (canonical decisions)
- When autonomy conflicts with safety, choose **gated autonomy** — action_command only fires after sustained drive pressure, never on a single spike.
- We accept **latency on first action** to preserve the invariant that no command fires without accumulated impulse.
- When tool richness conflicts with subconscious simplicity, choose **simplicity** — subconscious mode uses only the subset of tools that can execute without LLM context.
- We accept **duplicate tool paths** (LLM-invoked vs. physics-invoked) to preserve clean separation between conscious and subconscious execution.

## SUCCESS SIGNALS (observable)
- An action_command fires a shell command after sustained drive pressure with zero LLM calls in the loop
- A linter runs automatically when self_preservation drive spikes above threshold
- A subcall fires when frustration accumulates past the impasse threshold
- The agent sends a Telegram message through the SPEAK interface without human intervention
- No action_command fires on a transient drive spike that decays before threshold
