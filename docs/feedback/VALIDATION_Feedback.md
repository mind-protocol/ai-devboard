# Live Feedback — Validation: What Must Be True

```
STATUS: DRAFT
CREATED: 2026-03-15
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Feedback.md
PATTERNS:        ./PATTERNS_Feedback.md
BEHAVIORS:       ./BEHAVIORS_Feedback.md
THIS:            VALIDATION_Feedback.md (you are here)
ALGORITHM:       ./ALGORITHM_Feedback.md (HOW — mechanisms go here)
IMPLEMENTATION:  ./IMPLEMENTATION_Feedback.md
HEALTH:          ./HEALTH_Feedback.md
SYNC:            ./SYNC_Feedback.md
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

### V1: Display Never Desynchronizes from Graph

**Why we care:** The entire premise of Live Feedback is that the visual IS the graph. If the display shows stale state — an alert that was resolved, energy that was spent, a moment that was promoted — the user is making decisions on false information. The feedback loop is broken. The system is worse than a dashboard because it pretends to be live but lies.

```
MUST:   Every graph state change affecting the active Place must appear in the visual output within one tick
NEVER:  The display must never show a node's energy, weight, friction, or moment state that differs from the graph's current state by more than one tick
```

### V2: Moments Are Local by Default

**Why we care:** If Moments leak across Places, spatial locality is destroyed. The triage room shows manager concerns. The manager view shows triage noise. Every room becomes every other room. Context collapse makes the spatial model meaningless — the user might as well be looking at a flat list. Locality is the foundation of spatial context bias.

```
MUST:   A Moment created in a Place must be visible only within that Place unless explicitly promoted to a global Narrative
NEVER:  A Moment must never appear in a Place other than its parent Place without an explicit promotion action recorded in the graph
```

### V3: Salience Formula Is Consistent

**Why we care:** If salience is computed differently in different code paths — different ordering of operations, different rounding, different threshold values — then the same node appears differently depending on which path rendered it. The user sees inconsistent prominence. Trust in the visual system erodes. The formula `Salience = Weight * Energy * Focus` must be the single source of truth everywhere salience is evaluated.

```
MUST:   Salience must always be computed as Weight * Energy * Focus using the same formula in every code path
NEVER:  No alternative salience calculation, hardcoded visibility override, or manual prominence adjustment may exist outside the canonical formula
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
| V1 | Display never desynchronizes from graph | CRITICAL |
| V2 | Moments are local by default | HIGH |
| V3 | Salience formula is consistent | HIGH |

---

## MARKERS

<!-- @mind:todo Define acceptable latency bound for V1 — is "within one tick" sufficient or does sub-tick matter? -->
<!-- @mind:proposition Consider V4: SSE stream must never fall back to polling under any failure mode -->
<!-- @mind:escalation V1 "one tick" tolerance — what if tick rate varies? Need to define maximum tick interval -->
