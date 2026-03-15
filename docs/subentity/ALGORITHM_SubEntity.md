# SubEntity — Algorithm: State Machine Transitions, Link Scoring, and Crystallization

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
PATTERNS:        ./PATTERNS_SubEntity.md
THIS:            ALGORITHM_SubEntity.md (you are here)
VALIDATION:      ./VALIDATION_SubEntity.md
HEALTH:          ./HEALTH_SubEntity.md
IMPLEMENTATION:  ./IMPLEMENTATION_SubEntity.md
SYNC:            ./SYNC_SubEntity.md

IMPL:            runtime/physics/subentity.py
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

---

## OVERVIEW

The SubEntity algorithm is a state-machine-driven graph traversal that uses embedding similarity and a multi-factor link scoring formula to navigate the graph without any LLM calls. At each step, the SubEntity evaluates outgoing links, selects the best one, transitions state, injects energy, and updates its crystallization embedding. Siblings share crystallization vectors to naturally diverge. Fatigue-based stopping halts exploration when progress stagnates.

The algorithm has three interconnected subsystems: (1) the state machine governing lifecycle transitions, (2) the link scoring formula governing path selection, and (3) the crystallization computation governing knowledge accumulation and sibling coordination.

---

## OBJECTIVES AND BEHAVIORS

| Objective | Behaviors Supported | Why This Algorithm Matters |
|-----------|---------------------|----------------------------|
| Zero-LLM exploration | B1, B4 | All path decisions are made by the link scoring formula using only vector math |
| Structural problem detection | B3 | State machine includes CRYSTALLIZING state that triggers Macro-Crystallization on problem detection |
| Continuous crystallization | B1, B2, B3 | Embedding is updated at every step, not just at terminal states |
| Sibling divergence | B4 | sibling_divergence factor in link scoring makes convergence energetically unfavorable |

---

## DATA STRUCTURES

### SubEntity

```
SubEntity:
  query: Embedding           # what to find (vector in embedding space)
  intention: Intention        # why: VERIFY | FIND_NEXT | DIAGNOSE
  criticality: float [0, 1]  # urgency scalar
  state: State                # current state in the state machine
  crystallization: Embedding  # accumulated findings, updated every step
  awareness_depth: int        # count of up/down hierarchy traversals (unbounded)
  fatigue_counter: int        # consecutive steps without meaningful progress
  current_node: NodeID        # current position in the graph
  parent_id: SubEntityID      # parent SubEntity (or None if root)
  sibling_vectors: list[Embedding]  # crystallization vectors of siblings
```

### State Enum

```
State:
  SEEKING        # searching for relevant nodes via link scoring
  BRANCHING      # multiple high-scoring links found, spawning siblings
  ABSORBING      # at a relevant node, absorbing its content into crystallization
  RESONATING     # crystallization resonates with query — strong match found
  REFLECTING     # evaluating accumulated findings, checking for problems
  CRYSTALLIZING  # generating output node via Macro-Crystallization (Law 10)
  MERGING        # terminal state — merging crystallization back to parent
```

### StepResult

```
StepResult:
  next_node: NodeID              # where the SubEntity moved (or stayed)
  energy_injected: float         # criticality x STATE_MULTIPLIER[state]
  new_crystallization: Embedding # updated crystallization vector
  spawned_siblings: list[SubEntity]  # new siblings (if BRANCHING)
  generated_nodes: list[Node]    # new graph nodes (if CRYSTALLIZING)
  should_stop: bool              # true if fatigue threshold reached
```

### STATE_MULTIPLIER

```
STATE_MULTIPLIER:
  SEEKING:        1.0   # base energy for search
  BRANCHING:      1.5   # higher energy at decision points
  ABSORBING:      0.8   # lower energy during passive intake
  RESONATING:     2.0   # high energy at strong matches
  REFLECTING:     0.5   # low energy during internal evaluation
  CRYSTALLIZING:  3.0   # highest energy when producing output
  MERGING:        0.2   # minimal energy during cleanup
```

---

## ALGORITHM: SubEntity.step()

### Step 1: Evaluate Outgoing Links

Score all outgoing links from current_node using the link scoring formula. Each link receives a composite score based on alignment, novelty, divergence, and emotional factors.

```
for each link in current_node.outgoing_links:
    score = score_link(link, query, intention, crystallization, sibling_vectors)
```

### Step 2: State Transition

Based on the scores and current state, determine the next state.

```
if state == SEEKING:
    if count(scores > branch_threshold) > 1:
        next_state = BRANCHING
    elif top_score > resonance_threshold:
        next_state = RESONATING
    elif top_score > absorb_threshold:
        next_state = ABSORBING
    else:
        next_state = SEEKING  (continue searching)

if state == BRANCHING:
    next_state = SEEKING  (after spawning siblings)

if state == ABSORBING:
    if crystallization_delta > resonance_trigger:
        next_state = RESONATING
    else:
        next_state = SEEKING

if state == RESONATING:
    next_state = REFLECTING

if state == REFLECTING:
    if problem_detected:
        next_state = CRYSTALLIZING
    else:
        next_state = SEEKING

if state == CRYSTALLIZING:
    next_state = MERGING

if state == MERGING:
    should_stop = True
```

### Step 3: Energy Injection

Inject energy into the graph at the current location.

```
energy = criticality * STATE_MULTIPLIER[next_state]
graph.inject_energy(current_node, energy)
```

### Step 4: Crystallization Update

Update the crystallization embedding by blending the current node's embedding.

```
node_embedding = graph.get_embedding(current_node)
crystallization = blend(crystallization, node_embedding, weight=absorption_rate)
```

The absorption_rate varies by state (higher in ABSORBING/RESONATING, lower in SEEKING).

### Step 5: Fatigue Check

Check whether progress has stagnated.

```
delta = cosine_distance(old_crystallization, new_crystallization)
if delta < fatigue_threshold:
    fatigue_counter += 1
else:
    fatigue_counter = 0

if fatigue_counter >= 5:
    next_state = MERGING
    should_stop = True
```

### Step 6: Traverse

Move to the highest-scoring node (unless state is MERGING or fatigue triggered).

```
if not should_stop:
    current_node = top_scoring_link.target
    if link.direction == UP:
        awareness_depth += 1
    elif link.direction == DOWN:
        awareness_depth -= 1
```

---

## KEY DECISIONS

### D1: Branch or Continue

```
IF multiple links score above branch_threshold:
    Transition to BRANCHING, spawn siblings
    Each sibling takes one of the high-scoring links
    Parent takes the highest-scoring link
    WHY: maximizes coverage at decision points
ELSE:
    Stay in SEEKING, follow the single best link
    WHY: no point branching when one path clearly dominates
```

### D2: Crystallize or Continue

```
IF problem_detected during REFLECTING:
    Transition to CRYSTALLIZING
    Generate new node via Macro-Crystallization (Law 10)
    WHY: problems must produce tangible graph artifacts
ELSE:
    Return to SEEKING
    WHY: no problem means no output needed yet
```

### D3: Fatigue Stop or Continue

```
IF fatigue_counter >= 5:
    Force transition to MERGING
    WHY: 5 steps without progress means this region is exhausted
ELSE:
    Continue exploration
    WHY: progress is still being made
```

---

## DATA FLOW

```
SubEntity(query, intention, criticality)
    |
    v
score_link() for each outgoing link
    |
    v
state_transition() based on scores
    |
    v
inject_energy(criticality x STATE_MULTIPLIER)
    |
    v
update_crystallization(blend with node embedding)
    |
    v
check_fatigue(crystallization delta)
    |
    v
traverse to highest-scoring node
    |
    v
StepResult(next_node, energy, crystallization, siblings, nodes, should_stop)
```

---

## COMPLEXITY

**Time:** O(L) per step — where L is the number of outgoing links from the current node. Link scoring is constant-time per link (dot products and multiplications).

**Space:** O(S x E) — where S is the number of active siblings and E is the embedding dimension. Each sibling stores its crystallization vector, and all siblings' vectors must be accessible for divergence computation.

**Bottlenecks:**
- High-degree nodes: nodes with many outgoing links increase per-step cost linearly
- Many siblings: the sibling_divergence computation scales with the number of active siblings per link evaluation
- Embedding dimension: all vector operations scale linearly with embedding dimension

---

## HELPER FUNCTIONS

### `score_link(link, query, intention, crystallization, sibling_vectors)`

**Purpose:** Compute the composite score for a single outgoing link.

**Logic:**
```
base = link.base_weight
alignment = 0.75 * cosine_sim(link.target_embedding, query) + 0.25 * intention_alignment(link, intention)
self_novelty = 1.0 - cosine_sim(link.target_embedding, crystallization)
sibling_divergence = min(1.0 - cosine_sim(link.target_embedding, sv) for sv in sibling_vectors) if sibling_vectors else 1.0
emotional_factor = compute_emotional_factor(link)

score = base * alignment * self_novelty * sibling_divergence * emotional_factor
```

### `blend(embedding_a, embedding_b, weight)`

**Purpose:** Blend two embeddings with a given weight for the new contribution.

**Logic:**
```
result = (1 - weight) * embedding_a + weight * embedding_b
return normalize(result)
```

### `check_fatigue(old_crystallization, new_crystallization, fatigue_counter)`

**Purpose:** Determine if the SubEntity should stop due to stagnation.

**Logic:**
```
delta = cosine_distance(old_crystallization, new_crystallization)
if delta < FATIGUE_THRESHOLD:
    return fatigue_counter + 1
else:
    return 0
```

### `intention_alignment(link, intention)`

**Purpose:** Score how well a link aligns with the SubEntity's intention type.

**Logic:**
```
if intention == VERIFY:
    prefer links to nodes with high certainty / existing validation
if intention == FIND_NEXT:
    prefer links to unexplored or recently-changed nodes
if intention == DIAGNOSE:
    prefer links to nodes with high tension or anomaly signals
```

---

## INTERACTIONS

| Module | What We Call | What We Get |
|--------|--------------|-------------|
| Graph embedding layer | `graph.get_embedding(node)` | Embedding vector for a node |
| Physics engine | `graph.inject_energy(node, amount)` | Energy deposited at node location |
| Law 10 (Macro-Crystallization) | `macro_crystallize(findings)` | New graph node generated from findings |
| Sibling registry | `get_sibling_vectors(parent_id)` | List of crystallization vectors for all active siblings |

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Define exact thresholds: branch_threshold, resonance_threshold, absorb_threshold, fatigue_threshold -->
<!-- @mind:proposition Consider momentum: weight recent traversal direction in link scoring to avoid oscillation -->
<!-- @mind:escalation Confirm STATE_MULTIPLIER values are calibrated against the global energy budget -->
