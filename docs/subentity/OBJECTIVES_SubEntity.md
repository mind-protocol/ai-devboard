# OBJECTIVES — SubEntity

```
STATUS: DRAFT
CREATED: 2026-03-15
VERIFIED: —
```

---

## CHAIN

```
THIS:            OBJECTIVES_SubEntity.md (you are here - START HERE)
PATTERNS:       ./PATTERNS_SubEntity.md
BEHAVIORS:      ./BEHAVIORS_SubEntity.md
ALGORITHM:      ./ALGORITHM_SubEntity.md
VALIDATION:     ./VALIDATION_SubEntity.md
IMPLEMENTATION: ./IMPLEMENTATION_SubEntity.md
SYNC:           ./SYNC_SubEntity.md

IMPL:           runtime/physics/subentity.py
```

**Read this chain in order before making changes.** Each doc answers different questions. Skipping ahead means missing context.

---

## PRIMARY OBJECTIVES (ranked)
1. Zero-LLM exploration — SubEntities traverse the graph using only vector math and embedding similarity, never calling an LLM. This keeps exploration cheap, fast, and infinitely parallelizable.
2. Structural problem detection — When a SubEntity encounters a graph defect (broken link, orphan node, tension anomaly), it generates a new node via Macro-Crystallization (Law 10) rather than silently ignoring the problem. The graph heals itself through exploration.
3. Continuous crystallization — The SubEntity's embedding is updated at every step, not just at the end. Parents and siblings can observe crystallization in real-time, making the exploration process itself a visible, useful signal.
4. Sibling divergence — Siblings spawned from the same parent naturally diverge by sharing crystallization vectors and penalizing overlap in link scoring. No central coordinator needed; divergence is energetically favorable.

## NON-OBJECTIVES
- Natural language understanding — SubEntities do not parse or generate language. They operate entirely in embedding space.
- Persistent identity — SubEntities are temporary consciousness fragments. They merge back into their parent and cease to exist.
- Exhaustive graph coverage — SubEntities explore along energy gradients, not breadth-first. They may miss low-energy regions entirely, and that is by design.

## TRADEOFFS (canonical decisions)
- When exploration depth conflicts with computation cost, choose cost. SubEntities stop via fatigue, not completeness.
- We accept incomplete coverage to preserve zero-LLM constraint. If a problem requires language understanding to detect, SubEntities will not detect it.
- When sibling divergence conflicts with individual optimality, choose divergence. A sibling exploring a suboptimal but novel path is more valuable than two siblings converging on the same optimal path.

## SUCCESS SIGNALS (observable)
- Zero LLM API calls during any SubEntity traversal
- Energy injection at each step equals criticality x STATE_MULTIPLIER[state] exactly
- Sibling SubEntities never traverse the same link in the same direction
- Crystallization embedding changes measurably at every state transition
- SubEntities halt within 5 steps of progress stagnation (fatigue-based stopping)
- Detected problems produce well-formed graph nodes via Macro-Crystallization
