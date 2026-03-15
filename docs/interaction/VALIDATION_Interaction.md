# Interaction — Validation: What Must Be True

```
STATUS: DRAFT
CREATED: 2026-03-15
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Interaction.md
PATTERNS:        ./PATTERNS_Interaction.md
BEHAVIORS:       ./BEHAVIORS_Interaction.md
THIS:            VALIDATION_Interaction.md (you are here)
ALGORITHM:       ./ALGORITHM_Interaction.md (HOW — mechanisms go here)
IMPLEMENTATION:  ./IMPLEMENTATION_Interaction.md
HEALTH:          ./HEALTH_Interaction.md
SYNC:            ./SYNC_Interaction.md
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

### V1: Actions Only Fire Under Sustained Drive Pressure

**Why we care:** If an action_command fires on a transient spike, the agent becomes erratic — running health checks when nothing is wrong, exploring codebases at random, asking for help when not stuck. The entire trust model of autonomous execution depends on actions being deliberate, even when they are subconscious. A single-tick spike that triggers a shell command is a seizure, not a reflex.

```
MUST:   action_command fires only after impulse accumulation exceeds firing_threshold,
        which requires sustained drive pressure above IMPULSE_DRIVE_THRESHOLD over multiple ticks
NEVER:  action_command fires from a single-tick drive spike that decays before the next tick
```

### V2: Subconscious Mode Maintains Reflexes Without LLM

**Why we care:** If subconscious reflexes require an LLM call to decide whether to fire, they are not reflexes — they are slow, expensive conscious decisions. The agent's immune system (self-preservation reflexes) must function even when the LLM is unavailable, rate-limited, or too expensive to call. Zero-LLM execution is what makes the agent alive between inference calls.

```
MUST:   the complete path from impulse threshold check to action_command dispatch
        executes with zero LLM inference calls
NEVER:  the dispatch path invokes an LLM to decide whether, when, or how to execute
        an action_command that has already crossed its firing threshold
```

### V3: No Raw Code or Large Payloads in Graph Nodes

**Why we care:** The cognitive graph must remain fast to traverse. If action results (shell output, file contents, error logs) are stored inline as node properties, graph queries slow down, memory bloats, and the graph becomes a document store instead of a cognitive substrate. The graph holds structure and references; the filesystem holds data.

```
MUST:   action results are stored as EvidenceRef (filesystem path + metadata)
        on moment nodes, with full output persisted to the filesystem
NEVER:  raw command output, file contents, or multi-line text blobs are stored
        directly as properties on graph nodes
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
| V1 | Actions reflect genuine sustained drive, not transient noise | CRITICAL |
| V2 | Autonomous execution works without LLM dependency | CRITICAL |
| V3 | Graph remains lean and fast for traversal | HIGH |

---

## MARKERS

<!-- @mind:todo Define quantitative threshold for "sustained" — how many ticks constitute sustained pressure? -->
<!-- @mind:todo Specify maximum allowed EvidenceRef payload size before compression/truncation -->
<!-- @mind:proposition Consider V4: "No action fires during system initialization" — prevent boot-time reflex storms -->
<!-- @mind:escalation V1 threshold values need empirical calibration against real drive dynamics -->
