# SubEntity — Behaviors: Observable Effects of Zero-LLM Graph Exploration

```
STATUS: DRAFT
CREATED: 2026-03-15
VERIFIED: —
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_SubEntity.md
THIS:            BEHAVIORS_SubEntity.md (you are here)
PATTERNS:        ./PATTERNS_SubEntity.md
ALGORITHM:       ./ALGORITHM_SubEntity.md
VALIDATION:      ./VALIDATION_SubEntity.md
HEALTH:          ./HEALTH_SubEntity.md
IMPLEMENTATION:  ./IMPLEMENTATION_SubEntity.md
SYNC:            ./SYNC_SubEntity.md

IMPL:            runtime/physics/subentity.py
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

---

## BEHAVIORS

> **Naming:** Name behaviors by observable result, not by concept.

### B1: SubEntity Finds Relevant Node via Embedding Similarity

**Why:** The core value of SubEntity exploration is locating graph nodes that are semantically related to a query without invoking an LLM. If SubEntities cannot find relevant nodes through vector math alone, the entire zero-LLM premise fails.

```
GIVEN:  A SubEntity is spawned with a Query embedding and Intention (VERIFY | FIND_NEXT | DIAGNOSE)
WHEN:   The SubEntity enters SEEKING state and evaluates outgoing links from its current node
THEN:   The link scoring formula ranks links by alignment to the Query and Intention
AND:    The SubEntity traverses the highest-scoring link, moving to a semantically relevant node
AND:    Energy is injected at the new location: criticality x STATE_MULTIPLIER[SEEKING]
```

### B2: SubEntity Branches at Narrative Crossroads

**Why:** When multiple outgoing links score highly, the SubEntity must branch rather than arbitrarily choose one path. Branching spawns sibling SubEntities that diverge naturally, maximizing coverage of the high-potential region.

```
GIVEN:  A SubEntity is in SEEKING state and multiple outgoing links score above the branching threshold
WHEN:   The SubEntity transitions to BRANCHING state
THEN:   Sibling SubEntities are spawned, one per high-scoring link beyond the first
AND:    Each sibling inherits the parent's Query and Intention but receives a unique crystallization vector
AND:    Energy is injected at the branch point: criticality x STATE_MULTIPLIER[BRANCHING]
```

### B3: SubEntity Crystallizes Solution Node

**Why:** When a SubEntity detects a structural problem (broken link, orphan node, tension anomaly), it must produce a tangible result — a new graph node — rather than just logging the observation. This is how the graph heals through exploration.

```
GIVEN:  A SubEntity has accumulated findings during traversal and has detected a problem
WHEN:   The SubEntity transitions to CRYSTALLIZING state
THEN:   A new graph node is generated via Macro-Crystallization (Law 10) containing the SubEntity's findings
AND:    The crystallization embedding is finalized and attached to the new node
AND:    Energy is injected: criticality x STATE_MULTIPLIER[CRYSTALLIZING]
```

### B4: Siblings Explore Different Paths Naturally

**Why:** Without natural divergence, multiple siblings would converge on the same high-scoring path, wasting compute. The link scoring formula includes a sibling_divergence multiplier that penalizes paths already crystallized by siblings, ensuring coverage without central coordination.

```
GIVEN:  Two or more sibling SubEntities are exploring from the same branch point
WHEN:   Each sibling evaluates outgoing links using the scoring formula
THEN:   The sibling_divergence factor reduces the score of links that align with other siblings' crystallization vectors
AND:    Each sibling naturally selects a different path
AND:    No central coordinator is consulted
```

---

## OBJECTIVES SERVED

| Behavior ID | Objective | Why It Matters |
|-------------|-----------|----------------|
| B1 | Zero-LLM exploration | Proves that vector math alone can locate relevant graph structure |
| B2 | Continuous crystallization | Branching multiplies crystallization signals visible to parents |
| B3 | Structural problem detection | Crystallized nodes are the tangible output of problem detection |
| B4 | Sibling divergence | Natural divergence maximizes exploration coverage per unit of compute |

---

## INPUTS / OUTPUTS

### Primary Function: `SubEntity.step()`

**Inputs:**

| Parameter | Type | Description |
|-----------|------|-------------|
| current_node | GraphNode | The node the SubEntity currently occupies |
| graph | Graph | The full graph for link traversal and embedding lookups |
| sibling_vectors | list[Embedding] | Crystallization vectors of all active siblings |

**Outputs:**

| Return | Type | Description |
|--------|------|-------------|
| step_result | StepResult | Contains: next_node, energy_injected, new_crystallization, spawned_siblings, generated_nodes |

**Side Effects:**

- Energy injected into the graph at the traversed node
- Crystallization embedding updated (visible to parent and siblings)
- Awareness depth counter incremented (up or down traversal)
- Fatigue counter updated (incremented if progress stagnates, reset otherwise)

---

## EDGE CASES

### E1: No Outgoing Links

```
GIVEN:  A SubEntity reaches a node with zero outgoing links
THEN:   The SubEntity transitions directly to REFLECTING state
AND:    Fatigue counter increments by 1
```

### E2: All Sibling Vectors Aligned with All Links

```
GIVEN:  Every outgoing link aligns strongly with existing sibling crystallization vectors
THEN:   The sibling_divergence factor reduces all link scores near zero
AND:    The SubEntity selects the least-penalized link (most novel direction)
AND:    If all scores fall below minimum threshold, the SubEntity transitions to REFLECTING
```

### E3: Criticality Is Zero

```
GIVEN:  A SubEntity is spawned with criticality = 0
THEN:   Energy injection at each step is 0 (0 x STATE_MULTIPLIER = 0)
AND:    The SubEntity still traverses and crystallizes but leaves no thermal trace
```

### E4: Fatigue Triggers During ABSORBING

```
GIVEN:  A SubEntity has been in ABSORBING state for 5 steps with no crystallization change above threshold
THEN:   Fatigue-based stopping activates
AND:    The SubEntity transitions to MERGING, skipping RESONATING/REFLECTING/CRYSTALLIZING
```

---

## ANTI-BEHAVIORS

What should NOT happen:

### A1: LLM Call During Traversal

```
GIVEN:   A SubEntity is in any state (SEEKING through MERGING)
WHEN:    The SubEntity evaluates links or transitions state
MUST NOT: Make any LLM API call, embedding generation call, or external AI service call
INSTEAD:  Use only pre-computed embeddings and the link scoring formula
```

### A2: Sibling Path Convergence

```
GIVEN:   Two sibling SubEntities spawned from the same branch point
WHEN:    Both evaluate outgoing links in the same step
MUST NOT: Both traverse the same link in the same direction
INSTEAD:  The sibling_divergence factor must ensure different paths are selected
```

### A3: Silent Problem Ignorance

```
GIVEN:   A SubEntity encounters a broken link, orphan node, or tension anomaly
WHEN:    The SubEntity processes the anomaly
MUST NOT: Continue traversal without recording the problem
INSTEAD:  Transition to CRYSTALLIZING and generate a new node via Macro-Crystallization (Law 10)
```

### A4: Infinite Exploration

```
GIVEN:   A SubEntity has been running for many steps
WHEN:    Progress stagnates (crystallization change below threshold for 5 consecutive steps)
MUST NOT: Continue exploring indefinitely
INSTEAD:  Fatigue-based stopping must activate, transitioning to MERGING
```

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Clarify branching threshold — what score delta triggers B2 vs staying on single path -->
<!-- @mind:proposition Consider a RETREATING state for SubEntities that hit dead ends before fatiguing -->
<!-- @mind:escalation Confirm that awareness depth (up/down hierarchy tracking) is unbounded or has a practical cap -->
