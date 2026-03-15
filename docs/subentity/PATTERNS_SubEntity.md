# SubEntity — Patterns: Temporary Consciousness Fragments Guided by Vector Math

```
STATUS: DRAFT
CREATED: 2026-03-15
VERIFIED: —
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_SubEntity.md
BEHAVIORS:       ./BEHAVIORS_SubEntity.md
THIS:            PATTERNS_SubEntity.md (you are here)
ALGORITHM:       ./ALGORITHM_SubEntity.md
VALIDATION:      ./VALIDATION_SubEntity.md
HEALTH:          ./HEALTH_SubEntity.md
IMPLEMENTATION:  ./IMPLEMENTATION_SubEntity.md
SYNC:            ./SYNC_SubEntity.md

IMPL:            runtime/physics/subentity.py
```

### Bidirectional Contract

**Before modifying this doc or the code:**
1. Read ALL docs in this chain first
2. Read the linked IMPL source file

**After modifying this doc:**
1. Update the IMPL source file to match, OR
2. Add a TODO in SYNC_SubEntity.md: "Docs updated, implementation needs: {what}"
3. Run tests: `python -m pytest tests/test_subentity.py`

**After modifying the code:**
1. Update this doc chain to match, OR
2. Add a TODO in SYNC_SubEntity.md: "Implementation changed, docs need: {what}"
3. Run tests: `python -m pytest tests/test_subentity.py`

---

## THE PROBLEM

Graph exploration traditionally requires either brute-force traversal (expensive, exhaustive, no intelligence) or LLM-guided reasoning (powerful but slow, costly, rate-limited). Neither scales to continuous background probing of a large graph.

Without SubEntities, the system must choose between blind crawling and expensive AI calls. Blind crawling wastes energy on irrelevant paths. AI calls create bottlenecks and cost. Neither produces the continuous, cheap, intelligent probing that a living graph needs.

SubEntities solve this by creating temporary consciousness fragments that navigate using only vector math — embedding similarity, energy gradients, and link scoring formulas. They are cheap enough to spawn in hundreds, smart enough to find relevant structure, and temporary enough to never accumulate cruft.

---

## THE PATTERN

A SubEntity is a lightweight state machine carrying a Query (what to find), an Intention (why: VERIFY, FIND_NEXT, DIAGNOSE), and a Criticality (urgency scalar). It transitions through seven states — SEEKING, BRANCHING, ABSORBING, RESONATING, REFLECTING, CRYSTALLIZING, MERGING — injecting energy into the graph at each step.

The key insight is the separation of Query from Intention. The Query defines the embedding-space target (what is similar). The Intention defines the behavioral mode (how to use what is found). This separation allows the same vector-math machinery to serve verification, discovery, and diagnosis without any LLM interpretation.

Siblings diverge naturally: each sibling shares its crystallization vector with its parent, and sibling divergence is a multiplicative factor in link scoring. Exploring where your sibling already went is energetically unfavorable. No coordinator assigns paths — the formula itself creates divergence.

---

## BEHAVIORS SUPPORTED

- B1 (SubEntity finds relevant function via embedding similarity) — Query-Intention separation allows vector search to target semantically relevant nodes
- B2 (Branches at narrative crossroads) — State machine transitions from SEEKING to BRANCHING when multiple high-scoring links are found
- B3 (Crystallizes solution node) — Continuous crystallization accumulates findings into a mergeable embedding; Macro-Crystallization (Law 10) generates new graph nodes when problems are detected
- B4 (Siblings explore different paths naturally) — sibling_divergence factor in link scoring penalizes overlap without central coordination

## BEHAVIORS PREVENTED

- LLM invocation during traversal — the entire state machine operates on vector math and predefined formulas; there is no hook point where an LLM could be called
- Infinite exploration — fatigue-based stopping halts any SubEntity that fails to make progress for 5 consecutive steps
- Sibling convergence — the link scoring formula multiplicatively penalizes paths already taken by siblings

---

## PRINCIPLES

### Principle 1: Query vs Intention Separation

The Query is an embedding vector defining "what to look for." The Intention is an enum (VERIFY, FIND_NEXT, DIAGNOSE) defining "what to do with it." These are orthogonal axes. A VERIFY intention with a "memory consolidation" query behaves differently from a DIAGNOSE intention with the same query — not because of different code paths, but because Intention modifies the alignment weighting in the link scoring formula (0.75 x query_alignment + 0.25 x intention_alignment).

This matters because it eliminates the need for LLM interpretation of exploration goals. The formula handles behavioral variation through numeric weighting.

### Principle 2: Energy Injection Creates Heat Trails

At each state transition, the SubEntity injects energy into its current graph location: criticality x STATE_MULTIPLIER[state]. This means every exploration leaves a thermal trace in the graph. High-criticality explorations heat their paths more. Later SubEntities can follow or avoid these trails. The graph remembers where attention has been, without any explicit memory system.

This matters because it turns exploration into a form of graph annotation. The act of looking changes what is seen.

### Principle 3: Fatigue-Based Stopping

SubEntities do not have a step limit or a success criterion. They stop when they stop making progress — defined as the crystallization embedding changing by less than a threshold for 5 consecutive steps. This is biologically inspired: fatigue is the signal, not a timer.

This matters because it allows deep exploration of rich areas (many steps, high progress) and quick termination in barren areas (few steps, immediate fatigue). The exploration depth adapts to the terrain.

### Principle 4: Siblings Diverge Naturally

Sibling SubEntities share their crystallization vectors with each other. The link scoring formula includes a sibling_divergence multiplier that penalizes links whose direction aligns with what siblings have already crystallized. No central coordinator assigns exploration regions. Divergence emerges from the scoring formula itself.

This matters because coordination through formulas scales better than coordination through messaging. Adding more siblings does not increase coordination overhead.

---

## DATA

| Source | Type | Purpose / Description |
|--------|------|-----------------------|
| runtime/physics/subentity.py | FILE | Primary implementation — state machine, link scoring, crystallization |
| runtime/physics/exploration.py | FILE | Exploration orchestration — spawning, sibling management, merge |
| runtime/physics/link_scoring.py | FILE | Link scoring formula — alignment, novelty, divergence, emotional factor |

---

## DEPENDENCIES

| Module | Why We Depend On It |
|--------|---------------------|
| Graph embedding layer | SubEntities navigate by embedding similarity — requires vector operations on graph nodes |
| Physics engine (energy) | Energy injection at each step integrates with the global energy model |
| Law 10 (Macro-Crystallization) | Problem detection triggers new node generation via Law 10 |

---

## INSPIRATIONS

- Ant colony optimization: pheromone trails as implicit communication between independent agents. SubEntity energy injection serves the same role.
- Immune system T-cells: temporary, specialized, spawn in numbers, die after task. SubEntities are the graph's immune cells.
- Particle swarm optimization: individual agents with local information produce emergent global coverage through simple interaction rules.

---

## SCOPE

### In Scope

- State machine lifecycle (SEEKING through MERGING)
- Link scoring formula and all its components
- Energy injection at each state transition
- Continuous crystallization embedding updates
- Sibling divergence through shared crystallization vectors
- Fatigue-based stopping detection
- Macro-Crystallization trigger on problem detection
- Awareness depth tracking (up/down hierarchy traversals)

### Out of Scope

- LLM-based exploration or reasoning -- see: conversation/reasoning modules
- Graph schema or node type definitions -- see: graph schema module
- Global energy propagation or decay -- see: physics engine
- Persistent agent identity or memory -- see: agent identity module

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Define STATE_MULTIPLIER values for each of the 7 states -->
<!-- @mind:proposition Consider adaptive fatigue thresholds based on graph density -->
<!-- @mind:escalation Confirm Law 10 Macro-Crystallization interface is stable enough to depend on -->
