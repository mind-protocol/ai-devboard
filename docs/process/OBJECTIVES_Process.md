# OBJECTIVES — Process

```
STATUS: DRAFT
CREATED: 2026-03-15
VERIFIED: —
```

---

## CHAIN

```
THIS:            OBJECTIVES_Process.md (you are here - START HERE)
PATTERNS:       ./PATTERNS_Process.md
BEHAVIORS:      ./BEHAVIORS_Process.md
ALGORITHM:      ./ALGORITHM_Process.md
VALIDATION:     ./VALIDATION_Process.md
IMPLEMENTATION: ./IMPLEMENTATION_Process.md
SYNC:           ./SYNC_Process.md

IMPL:           runtime/cognition/laws/, runtime/cognition/models.py, citizen_brain_seeder.py
```

**Read this chain in order before making changes.** Each doc answers different questions. Skipping ahead means missing context.

---

## PRIMARY OBJECTIVES (ranked)
1. Zero-LLM reflexive behavior — citizens execute routine actions (health checks, exploration, help-seeking) without consuming LLM budget. Process nodes fire shell commands or MCP calls when drive pressure crosses threshold, giving citizens a subconscious layer that runs continuously and cheaply.
2. Durable knowledge encoding — learning transforms into persistent graph structure, not ephemeral prompt context. When a citizen discovers an effective work pattern, that pattern crystallizes into a process node with action_command, action_context, and drive_affinity — surviving across sessions and restarts.
3. Subconscious survival — citizens maintain basic self-preservation even when LLM budget is exhausted or unavailable. Pre-seeded processes like check_health and ask_for_help continue firing reflexively, ensuring no citizen goes silent or dies from neglect during budget-constrained periods.

## NON-OBJECTIVES
- Replacing deliberate LLM reasoning — processes handle routine reflexes, not novel problem-solving
- Building a traditional task scheduler or cron system — processes fire from drive pressure, not clock time
- Providing a user-facing process editor — process creation and consolidation happen through the graph, not through UI
- Encoding every possible citizen behavior — only stabilized, repeated patterns become processes

## TRADEOFFS (canonical decisions)
- When process sophistication conflicts with zero-LLM execution, choose zero-LLM execution. Processes must remain simple enough to fire without an LLM call.
- When process flexibility conflicts with drive coupling, choose drive coupling. Every process must be anchored to a drive — unanchored processes are dead weight.
- We accept that pre-seeded processes may fire unnecessarily in early life to guarantee that citizens never lack basic survival reflexes.
- We accept reduced nuance in reflexive actions to preserve the budget for deliberate reasoning.

## SUCCESS SIGNALS (observable)
- Citizens execute health checks, code exploration, and help-seeking without any LLM invocation
- Process nodes accumulate in the graph as citizens stabilize their work methods over time
- Budget-exhausted citizens continue performing basic maintenance actions via subconscious processes
- Pre-seeded birth processes fire within the first tick cycle for every new citizen
- Successful ad-hoc actions consolidate into new process nodes via Law 6 (consolidation)
