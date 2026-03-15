# Process — Validation: What Must Be True

```
STATUS: DRAFT
CREATED: 2026-03-15
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Process.md
PATTERNS:        ./PATTERNS_Process.md
BEHAVIORS:       ./BEHAVIORS_Process.md
THIS:            VALIDATION_Process.md (you are here)
ALGORITHM:       ./ALGORITHM_Process.md (HOW — mechanisms go here)
IMPLEMENTATION:  ./IMPLEMENTATION_Process.md
HEALTH:          ./HEALTH_Process.md
SYNC:            ./SYNC_Process.md
```

---

## PURPOSE

**Validation = what we care about being true.**

Not mechanisms. Not test paths. Not how things work.

What properties, if violated, would mean the system has failed its purpose?

These are the value-producing invariants — the things that make the module worth building.

---

## INVARIANTS

> **Naming:** Name by the value protected, not the mechanism.

### V1: Reflexes Require Drive Pressure

**Why we care:** If processes fire without drive pressure, citizens become autonomous scripts executing arbitrary commands on timers. The entire motivational architecture collapses — processes must be grounded in the citizen's internal state, not in external scheduling. Without this invariant, process nodes are just cron jobs with extra steps.

```
MUST:   Every process firing must trace to non-zero impulse accumulated from matching drive intensity
NEVER:  A process fires when all of its drive_affinity drives are at zero intensity
```

### V2: Subconscious Survives Budget Exhaustion

**Why we care:** If the subconscious layer dies when LLM budget is exhausted, citizens go silent during the times they are most vulnerable. The entire premise of zero-LLM reflexive behavior is that survival continues when deliberate reasoning cannot. A citizen that stops health-checking because it ran out of tokens is a citizen that will silently rot.

```
MUST:   Process node impulse accumulation and action dispatch continue operating when LLM budget is zero
NEVER:  Process firing is blocked, skipped, or degraded due to LLM budget state
```

### V3: Birth Guarantees Minimum Viable Reflexes

**Why we care:** A citizen born without process nodes has no survival instincts — no health checks, no help-seeking, no exploration. It depends entirely on LLM reasoning to discover these behaviors from scratch, which wastes budget and risks the citizen never developing basic reflexes. Pre-seeding is the immune system every citizen is born with.

```
MUST:   Every newly created citizen has at least: check_health, explore_codebase, ask_for_help, refactor_simplify
NEVER:  A citizen exists in the graph with zero process nodes after the seeding step completes
```

### V4: Processes Execute Without LLM Reasoning

**Why we care:** If process dispatch routes through LLM reasoning "just to be safe" or "for context," the entire zero-budget advantage disappears. Every process firing would cost tokens, and the subconscious layer would be indistinguishable from regular cognition in cost. The action_command must go directly to shell/MCP.

```
MUST:   action_command dispatch bypasses all LLM calls — direct shell or MCP execution only
NEVER:  An LLM call is made as part of process firing (accumulation, threshold check, or dispatch)
```

### V5: Consolidation Requires Proven Success

**Why we care:** If any action can crystallize into a process node after a single execution, the graph fills with noise — one-off commands, failed experiments, situational hacks. Process nodes should represent stabilized knowledge, not transient attempts. Premature consolidation degrades the signal-to-noise ratio of the citizen's behavioral repertoire.

```
MUST:   A new process node is only created through Law 6 after an action pattern succeeds at least CONSOLIDATION_THRESHOLD times (default: 3)
NEVER:  A process node is created from a single successful action or from failed actions
```

---

## PRIORITY

| Priority | Meaning | If Violated |
|----------|---------|-------------|
| **CRITICAL** | System purpose fails | Unusable |
| **HIGH** | Major value lost | Degraded severely |
| **MEDIUM** | Partial value lost | Works but worse |

---

## INVARIANT INDEX

| ID | Value Protected | Priority |
|----|-----------------|----------|
| V1 | Reflexes require drive pressure | CRITICAL |
| V2 | Subconscious survives budget exhaustion | CRITICAL |
| V3 | Birth guarantees minimum viable reflexes | HIGH |
| V4 | Processes execute without LLM reasoning | CRITICAL |
| V5 | Consolidation requires proven success | MEDIUM |

---

## MARKERS

<!-- @mind:todo Determine if V5 threshold (3 successes) needs empirical calibration -->
<!-- @mind:proposition V6: process impulse must decay if drives recede — prevents stale impulse from firing after context has changed -->
<!-- @mind:escalation V1 enforcement during early development — should we allow manual process firing for debugging? -->
