# SubEntity — Validation: What Must Be True

```
STATUS: DRAFT
CREATED: 2026-03-15
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_SubEntity.md
PATTERNS:        ./PATTERNS_SubEntity.md
BEHAVIORS:       ./BEHAVIORS_SubEntity.md
THIS:            VALIDATION_SubEntity.md (you are here)
ALGORITHM:       ./ALGORITHM_SubEntity.md (HOW — mechanisms go here)
IMPLEMENTATION:  ./IMPLEMENTATION_SubEntity.md
HEALTH:          ./HEALTH_SubEntity.md
SYNC:            ./SYNC_SubEntity.md
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

### V1: Exploration Requires No Language Model

**Why we care:** The entire premise of SubEntity is zero-LLM graph probing. If a single LLM call sneaks in, the cost model breaks, the parallelism model breaks, and the module loses its reason to exist. This is the defining constraint.

```
MUST:   Every SubEntity traversal from spawn to merge completes with zero LLM API calls
NEVER:  A SubEntity step invokes any external language model, embedding generation service, or AI inference endpoint
```

### V2: Energy Conservation at Every Step

**Why we care:** Energy injection is how SubEntities leave traces in the graph. If the injection amount deviates from the formula (criticality x STATE_MULTIPLIER[state]), the thermal trails become unreliable — too hot in some places, too cold in others. Other systems that read energy levels will make wrong decisions.

```
MUST:   Energy injected at each step equals exactly criticality * STATE_MULTIPLIER[current_state]
NEVER:  Energy is injected without corresponding to a state transition, or with a value that doesn't match the formula
```

### V3: Siblings Never Explore the Same Path

**Why we care:** If siblings converge on the same path, compute is wasted on redundant exploration. The entire sibling model is predicated on natural divergence through the link scoring formula. Convergence means the divergence mechanism is broken.

```
MUST:   No two sibling SubEntities (sharing the same parent) traverse the same link in the same direction during the same exploration
NEVER:  Two siblings from the same branch point follow identical link sequences
```

### V4: Crystallization Updates at Every Step

**Why we care:** Continuous crystallization is what makes SubEntity exploration visible in real-time to parents and siblings. If crystallization only updates at the end, parents lose visibility into in-progress exploration, and sibling divergence cannot work (it depends on live crystallization vectors).

```
MUST:   The crystallization embedding changes (or is re-evaluated) at every state transition
NEVER:  A SubEntity completes a step() call without updating its crystallization embedding
```

### V5: Fatigue Stops Stagnant Exploration

**Why we care:** Without fatigue-based stopping, a SubEntity in a low-information region of the graph would explore forever, wasting compute and injecting meaningless energy. The 5-step stagnation threshold is the pressure relief valve.

```
MUST:   A SubEntity that shows no meaningful crystallization progress for 5 consecutive steps transitions to MERGING
NEVER:  A SubEntity continues exploration beyond 5 stagnant steps
```

### V6: Problems Produce Graph Artifacts

**Why we care:** If SubEntities detect problems but don't generate graph nodes, the detection is invisible. The graph cannot heal through exploration unless exploration leaves tangible artifacts that other systems can act on.

```
MUST:   When a SubEntity detects a structural problem (broken link, orphan node, tension anomaly), it generates a new node via Macro-Crystallization (Law 10)
NEVER:  A detected problem is silently discarded or only logged without graph modification
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
| V1 | Exploration requires no language model | CRITICAL |
| V2 | Energy conservation at every step | HIGH |
| V3 | Siblings never explore the same path | HIGH |
| V4 | Crystallization updates at every step | HIGH |
| V5 | Fatigue stops stagnant exploration | MEDIUM |
| V6 | Problems produce graph artifacts | MEDIUM |

---

## MARKERS

<!-- @mind:todo Define "meaningful crystallization progress" threshold quantitatively -->
<!-- @mind:proposition Consider V7: awareness_depth must be monotonically tracked (never lost or reset mid-exploration) -->
<!-- @mind:escalation Confirm whether V3 (sibling path exclusion) is strict (hard constraint) or soft (probabilistic via scoring) -->
