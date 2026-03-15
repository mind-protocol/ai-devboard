# SubEntity — Implementation: Code Architecture and Structure

```
STATUS: DRAFT
CREATED: 2026-03-15
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_SubEntity.md
BEHAVIORS:       ./BEHAVIORS_SubEntity.md
PATTERNS:        ./PATTERNS_SubEntity.md
ALGORITHM:       ./ALGORITHM_SubEntity.md
VALIDATION:      ./VALIDATION_SubEntity.md
THIS:            IMPLEMENTATION_SubEntity.md (you are here)
HEALTH:          ./HEALTH_SubEntity.md
SYNC:            ./SYNC_SubEntity.md

IMPL:            runtime/physics/subentity.py
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

---

## CODE STRUCTURE

```
runtime/
├── physics/
│   ├── subentity.py           # Core SubEntity state machine, step(), crystallization
│   ├── exploration.py         # Exploration orchestration — spawn, sibling management, merge
│   └── link_scoring.py        # Link scoring formula — alignment, novelty, divergence, emotional factor
```

### File Responsibilities

| File | Purpose | Key Functions/Classes | Lines | Status |
|------|---------|----------------------|-------|--------|
| `runtime/physics/subentity.py` | Core state machine, step loop, crystallization update, fatigue detection | `SubEntity`, `step()`, `update_crystallization()`, `check_fatigue()` | ~1044 | SPLIT |
| `runtime/physics/exploration.py` | Orchestrates SubEntity lifecycles — spawning, sibling registration, merge-back | `ExplorationManager`, `spawn()`, `merge()`, `get_sibling_vectors()` | ~300 | OK |
| `runtime/physics/link_scoring.py` | Computes composite link scores from alignment, novelty, divergence, emotional factor | `score_link()`, `compute_alignment()`, `compute_divergence()`, `compute_emotional_factor()` | ~250 | OK |

**Size Thresholds:**
- **OK** (<400 lines): Healthy size, easy to understand
- **WATCH** (400-700 lines): Getting large, consider extraction opportunities
- **SPLIT** (>700 lines): Too large, must split before adding more code

> When a file reaches WATCH status, identify extraction candidates in the EXTRACTION CANDIDATES section below.
> When a file reaches SPLIT status, splitting becomes the next task before any feature work.

---

## DESIGN PATTERNS

### Architecture Pattern

**Pattern:** State Machine + Strategy (link scoring is a pluggable formula)

**Why this pattern:** The SubEntity lifecycle is inherently sequential (SEEKING through MERGING) with well-defined transition rules. A state machine makes these transitions explicit and testable. Link scoring is separated as a strategy so the formula can evolve independently of the state machine.

### Code Patterns in Use

| Pattern | Applied To | Purpose |
|---------|------------|---------|
| State Machine | `subentity.py:SubEntity` | Explicit lifecycle with guarded transitions |
| Strategy | `link_scoring.py:score_link()` | Pluggable scoring formula independent of traversal logic |
| Factory | `exploration.py:spawn()` | Creates SubEntities with correct initialization from parent context |
| Observer | `exploration.py:ExplorationManager` | Siblings observe each other's crystallization vectors without direct coupling |

### Anti-Patterns to Avoid

- **LLM Fallback**: It is tempting to add an LLM call for "hard" decisions. Never. The zero-LLM constraint is absolute.
- **God Object**: `subentity.py` at 1044 lines is already in SPLIT territory. Do not add more responsibilities.
- **Premature Abstraction**: Don't create abstract base classes for different SubEntity types until there are 3+ concrete variants.
- **Central Coordinator**: Don't add a coordinator for sibling divergence. The formula handles it.

### Boundaries

| Boundary | Inside | Outside | Interface |
|----------|--------|---------|-----------|
| SubEntity lifecycle | State transitions, crystallization, fatigue | Graph structure, energy propagation | `SubEntity.step()` |
| Link scoring | Score computation, alignment, divergence | Which links exist, graph topology | `score_link()` |
| Exploration orchestration | Spawn, merge, sibling registry | Individual SubEntity decisions | `ExplorationManager` |

---

## SCHEMA

### SubEntity

```yaml
SubEntity:
  required:
    - query: Embedding            # what to find
    - intention: Intention         # VERIFY | FIND_NEXT | DIAGNOSE
    - criticality: float           # [0, 1] urgency scalar
    - state: State                 # current state machine state
    - crystallization: Embedding   # accumulated findings vector
    - current_node: NodeID         # current graph position
  optional:
    - parent_id: SubEntityID       # None if root SubEntity
    - awareness_depth: int         # default 0, unbounded accumulator
    - fatigue_counter: int         # default 0, resets on progress
  constraints:
    - criticality must be in [0, 1]
    - state must be one of the 7 defined states
    - fatigue_counter triggers MERGING at >= 5
```

### StepResult

```yaml
StepResult:
  required:
    - next_node: NodeID
    - energy_injected: float
    - new_crystallization: Embedding
    - should_stop: bool
  optional:
    - spawned_siblings: list[SubEntity]
    - generated_nodes: list[Node]
  relationships:
    - energy_injected: criticality * STATE_MULTIPLIER[state]
```

---

## ENTRY POINTS

| Entry Point | File:Line | Triggered By |
|-------------|-----------|--------------|
| SubEntity.step() | `subentity.py:~120` | ExplorationManager main loop |
| ExplorationManager.spawn() | `exploration.py:~45` | /subcall command or graph_query |
| ExplorationManager.merge() | `exploration.py:~180` | SubEntity reaching MERGING state |
| score_link() | `link_scoring.py:~30` | SubEntity.step() during link evaluation |

---

## DATA FLOW AND DOCKING (FLOW-BY-FLOW)

### Exploration Flow: SubEntity Lifecycle from Spawn to Merge

Explains the full lifecycle of a SubEntity from creation through traversal to merge-back. This is the primary flow — it transforms a query into crystallized findings and optionally new graph nodes. High-risk because energy injection and graph modification are side effects.

```yaml
flow:
  name: exploration_lifecycle
  purpose: Transform a query + intention into crystallized graph findings via zero-LLM traversal
  scope: spawn → step loop → merge (or crystallize + merge)
  steps:
    - id: step_1_spawn
      description: Create SubEntity with query, intention, criticality from parent or /subcall
      file: runtime/physics/exploration.py
      function: ExplorationManager.spawn()
      input: query (Embedding), intention (Intention), criticality (float), parent_id (optional)
      output: SubEntity instance
      trigger: /subcall command or graph_query API
      side_effects: SubEntity registered in sibling registry
    - id: step_2_step_loop
      description: Repeatedly call step() until should_stop is True
      file: runtime/physics/subentity.py
      function: SubEntity.step()
      input: current graph state, sibling_vectors
      output: StepResult
      trigger: ExplorationManager main loop
      side_effects: energy injected into graph, crystallization updated, awareness_depth changed
    - id: step_3_link_scoring
      description: Score all outgoing links from current node
      file: runtime/physics/link_scoring.py
      function: score_link()
      input: link, query, intention, crystallization, sibling_vectors
      output: float score
      trigger: SubEntity.step() link evaluation phase
      side_effects: none (pure function)
    - id: step_4_crystallize
      description: If problem detected, generate new graph node via Macro-Crystallization
      file: runtime/physics/subentity.py
      function: SubEntity._crystallize()
      input: accumulated findings, problem description
      output: new Node
      trigger: state transition to CRYSTALLIZING
      side_effects: new node added to graph
    - id: step_5_merge
      description: Merge crystallization back to parent, deregister from sibling registry
      file: runtime/physics/exploration.py
      function: ExplorationManager.merge()
      input: SubEntity with final crystallization
      output: merged crystallization in parent
      trigger: SubEntity reaching MERGING state
      side_effects: SubEntity removed from sibling registry, parent crystallization updated
  docking_points:
    guidance:
      include_when: significant state change, energy modification, graph mutation
      omit_when: internal variable updates, pure computations
      selection_notes: Dock at spawn (input validation), energy injection (conservation check), crystallization (update check), and merge (completion check)
    available:
      - id: dock_spawn
        type: event
        direction: input
        file: runtime/physics/exploration.py
        function: ExplorationManager.spawn()
        trigger: /subcall or graph_query
        payload: query, intention, criticality
        async_hook: not_applicable
        needs: none
        notes: Validates that no LLM-derived parameters are passed
      - id: dock_energy_injection
        type: graph_ops
        direction: output
        file: runtime/physics/subentity.py
        function: SubEntity.step()
        trigger: every state transition
        payload: node_id, energy_amount, state
        async_hook: optional
        needs: none
        notes: Critical for V2 — energy must equal criticality * STATE_MULTIPLIER
      - id: dock_crystallization_update
        type: graph_ops
        direction: output
        file: runtime/physics/subentity.py
        function: SubEntity.update_crystallization()
        trigger: every step
        payload: old_embedding, new_embedding, delta
        async_hook: optional
        needs: none
        notes: Critical for V4 — must change at every step
      - id: dock_link_scores
        type: custom
        direction: output
        file: runtime/physics/link_scoring.py
        function: score_link()
        trigger: link evaluation in step()
        payload: link_id, score, alignment, self_novelty, sibling_divergence, emotional_factor
        async_hook: not_applicable
        needs: none
        notes: Custom type because this is an internal computation result, not a system boundary. Useful for V3 sibling divergence validation.
      - id: dock_merge
        type: event
        direction: output
        file: runtime/physics/exploration.py
        function: ExplorationManager.merge()
        trigger: SubEntity reaches MERGING
        payload: subentity_id, final_crystallization, generated_nodes
        async_hook: not_applicable
        needs: none
        notes: Completion event — confirms exploration finished
    health_recommended:
      - dock_id: dock_spawn
        reason: Validate zero-LLM constraint at entry point
      - dock_id: dock_energy_injection
        reason: Verify energy conservation (V2) at every step
      - dock_id: dock_crystallization_update
        reason: Verify continuous crystallization (V4) at every step
      - dock_id: dock_link_scores
        reason: Verify sibling divergence (V3) in scoring formula
```

---

## LOGIC CHAINS

### LC1: Query to Traversal

**Purpose:** Transform a query embedding into a link selection decision

```
query (Embedding)
  -> score_link()                  # compute alignment + novelty + divergence
    -> rank links by score         # sort outgoing links
      -> select top link           # highest score wins
        -> traverse                # move to target node
```

**Data transformation:**
- Input: `Embedding` — query vector in embedding space
- After step 1: `list[float]` — scores for each outgoing link
- After step 2: `list[(LinkID, float)]` — sorted link-score pairs
- Output: `NodeID` — target node to move to

### LC2: Step to Energy Injection

**Purpose:** Transform a state transition into a calibrated energy deposit

```
state_transition(old_state, new_state)
  -> lookup STATE_MULTIPLIER[new_state]    # get multiplier
    -> multiply by criticality             # scale by urgency
      -> graph.inject_energy()             # deposit at current node
```

**Data transformation:**
- Input: `State` — new state after transition
- After step 1: `float` — state multiplier
- After step 2: `float` — energy amount (criticality * multiplier)
- Output: energy deposited in graph

---

## MODULE DEPENDENCIES

### Internal Dependencies

```
exploration.py
    └── imports -> subentity.py (SubEntity class, StepResult)
    └── imports -> link_scoring.py (score_link, used indirectly via SubEntity)
subentity.py
    └── imports -> link_scoring.py (score_link)
```

### External Dependencies

| Package | Used For | Imported By |
|---------|----------|-------------|
| `numpy` | Vector operations (dot product, normalization, blending) | `subentity.py`, `link_scoring.py` |
| Graph engine | Node/link traversal, embedding lookup, energy injection | `subentity.py`, `exploration.py` |
| Law 10 (Macro-Crystallization) | Generating new nodes from findings | `subentity.py` |

---

## STATE MANAGEMENT

### Where State Lives

| State | Location | Scope | Lifecycle |
|-------|----------|-------|-----------|
| SubEntity instance | `subentity.py:SubEntity` | instance | Created at spawn, destroyed at merge |
| Sibling registry | `exploration.py:ExplorationManager._siblings` | module | Entries added at spawn, removed at merge |
| Crystallization embedding | `subentity.py:SubEntity.crystallization` | instance | Initialized at spawn, updated every step, read by siblings |
| Fatigue counter | `subentity.py:SubEntity.fatigue_counter` | instance | Initialized to 0, incremented/reset each step |
| Awareness depth | `subentity.py:SubEntity.awareness_depth` | instance | Initialized to 0, incremented/decremented on hierarchy traversal |

### State Transitions

```
SEEKING --[multiple high scores]--> BRANCHING --[siblings spawned]--> SEEKING
SEEKING --[high resonance]-------> RESONATING --[always]-----------> REFLECTING
SEEKING --[moderate score]-------> ABSORBING --[high delta]---------> RESONATING
ABSORBING --[low delta]----------> SEEKING
REFLECTING --[problem found]-----> CRYSTALLIZING --[always]---------> MERGING
REFLECTING --[no problem]--------> SEEKING
ANY STATE --[fatigue >= 5]-------> MERGING
```

---

## RUNTIME BEHAVIOR

### Initialization

```
1. ExplorationManager receives spawn request (query, intention, criticality)
2. SubEntity created with initial state SEEKING, crystallization = query (initial seed)
3. SubEntity registered in sibling registry under parent_id
4. Step loop begins
```

### Main Loop / Request Cycle

```
1. SubEntity.step() called by ExplorationManager
2. Link scoring evaluates all outgoing links
3. State transition computed
4. Energy injected at current node
5. Crystallization updated
6. Fatigue checked
7. SubEntity traverses to next node (or stops)
8. StepResult returned to ExplorationManager
9. If should_stop: merge and cleanup
10. If spawned_siblings: register new siblings
11. Loop continues for all active SubEntities
```

### Shutdown

```
1. SubEntity transitions to MERGING
2. Final crystallization merged back to parent
3. SubEntity deregistered from sibling registry
4. SubEntity instance garbage collected
```

---

## CONCURRENCY MODEL

| Component | Model | Notes |
|-----------|-------|-------|
| SubEntity.step() | sync | Each step is synchronous — no async within a single step |
| ExplorationManager | async | Multiple SubEntities step concurrently, sibling vectors read without locks (eventually consistent) |
| Sibling registry | thread-safe dict | Reads are lock-free, writes (spawn/merge) are serialized |

---

## CONFIGURATION

| Config | Location | Default | Description |
|--------|----------|---------|-------------|
| `FATIGUE_THRESHOLD` | `subentity.py` | `0.01` | Minimum crystallization delta to count as progress |
| `FATIGUE_LIMIT` | `subentity.py` | `5` | Consecutive stagnant steps before forced MERGING |
| `BRANCH_THRESHOLD` | `subentity.py` | `0.7` | Minimum link score to trigger BRANCHING |
| `RESONANCE_THRESHOLD` | `subentity.py` | `0.85` | Minimum link score to trigger RESONATING |
| `ABSORB_THRESHOLD` | `subentity.py` | `0.5` | Minimum link score to trigger ABSORBING |
| `ABSORPTION_RATE` | `subentity.py` | `0.3` | Blend weight for crystallization update |
| `STATE_MULTIPLIER` | `subentity.py` | `{see ALGORITHM}` | Energy multiplier per state |

---

## BIDIRECTIONAL LINKS

### Code -> Docs

Files that reference this documentation:

| File | Line | Reference |
|------|------|-----------|
| `runtime/physics/subentity.py` | ~1 | `# DOCS: docs/subentity/IMPLEMENTATION_SubEntity.md` |
| `runtime/physics/exploration.py` | ~1 | `# DOCS: docs/subentity/IMPLEMENTATION_SubEntity.md` |
| `runtime/physics/link_scoring.py` | ~1 | `# DOCS: docs/subentity/IMPLEMENTATION_SubEntity.md` |

### Docs -> Code

| Doc Section | Implemented In |
|-------------|----------------|
| ALGORITHM step 1 (link scoring) | `link_scoring.py:score_link()` |
| ALGORITHM step 2 (state transition) | `subentity.py:SubEntity._transition()` |
| ALGORITHM step 3 (energy injection) | `subentity.py:SubEntity._inject_energy()` |
| ALGORITHM step 4 (crystallization) | `subentity.py:SubEntity.update_crystallization()` |
| ALGORITHM step 5 (fatigue) | `subentity.py:SubEntity.check_fatigue()` |
| BEHAVIOR B1 | `subentity.py:SubEntity.step()` |
| BEHAVIOR B2 | `exploration.py:ExplorationManager.spawn()` |
| BEHAVIOR B3 | `subentity.py:SubEntity._crystallize()` |
| BEHAVIOR B4 | `link_scoring.py:compute_divergence()` |
| VALIDATION V1 | verified by architecture (no LLM imports) |
| VALIDATION V2 | `subentity.py:SubEntity._inject_energy()` |
| VALIDATION V3 | `link_scoring.py:compute_divergence()` |

---

## EXTRACTION CANDIDATES

Files approaching WATCH/SPLIT status - identify what can be extracted:

| File | Current | Target | Extract To | What to Move |
|------|---------|--------|------------|--------------|
| `runtime/physics/subentity.py` | ~1044L | <400L | `runtime/physics/subentity_states.py` | State transition logic, state-specific behavior methods |
| `runtime/physics/subentity.py` | ~1044L | <400L | `runtime/physics/crystallization.py` | Crystallization update, blend, fatigue detection |
| `runtime/physics/subentity.py` | ~1044L | <400L | `runtime/physics/subentity_core.py` | SubEntity class core, step() main loop |

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo subentity.py is in SPLIT status at 1044 lines — extract state logic and crystallization before adding features -->
<!-- @mind:proposition Consider extracting STATE_MULTIPLIER and thresholds into a config file for runtime tuning -->
<!-- @mind:escalation Confirm that eventually-consistent sibling vector reads don't cause divergence failures under high concurrency -->
