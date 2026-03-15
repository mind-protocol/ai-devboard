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

## ALGORITHM: L2 Citizen as Aggregate SubEntity

A citizen is not a single SubEntity. A citizen IS the weighted sum of all SubEntities currently active in their L1 brain. The L2 actor node's properties are derived — never stored independently.

### L2 Properties = Ponderated Sum of L1 SubEntities

```
citizen.energy    = Σ(subentity.criticality × STATE_MULTIPLIER[subentity.state])  for all SubEntities in WM
citizen.weight    = Σ(subentity.crystallization.magnitude × subentity.criticality) / count(subentities)
citizen.stability = min(subentity.fatigue_counter < 3 for all subentities)  # stable if none exhausted
citizen.friction  = max(subentity.friction for subentities where state ∈ {REFLECTING, CRYSTALLIZING})
```

This happens whether or not any SubEntity has reached a wakefulness threshold. A sleeping citizen with 3 dormant SubEntities still has L2 properties derived from them — just low energy because dormant SubEntities have low STATE_MULTIPLIER.

### Working Memory = Membraning Up to L2

The citizen's working memory — the variable part of their system prompt — is assembled by **membraning L1 nodes up to L2**. This is the vertical membrane (Law 21) in action:

```
on context_assembly(citizen):
    # L1 → L2 membrane: select high-energy L1 nodes
    wm_candidates = citizen.l1.nodes
        .filter(n => n.energy > WM_THRESHOLD)
        .sort_by(n => n.energy × n.weight, descending)
        .take(WM_SLOTS)

    for each candidate in wm_candidates:
        # "Membrane up" = project L1 state onto L2
        if candidate has existing L2 counterpart:
            boost L2 node: trust += 0.1, energy += candidate.energy × 0.5
        else:
            create new L2 node mirroring the L1 node
            link citizen → new node with trust from L1 state

    # The WM nodes become the system prompt's variable section
    return wm_candidates.map(n => serialize_for_prompt(n))
```

Membraning up is selective — only high-energy L1 nodes cross into L2. Low-energy nodes stay private in the citizen's brain. This is why different citizens have different system prompts even when working on the same project: their L1 energy landscapes differ.

### Emotional State: L1 Only, L2 Consequences

Emotions follow the limbic physics (Laws 13-18) and exist exclusively in L1. They never appear on L2 nodes or links (L2/L3 has no emotion fields — this is a schema invariant).

But emotions have **structural consequences** that reach L2 through the vertical membrane:

```
L1 emotion event                    L2 structural consequence
─────────────────                   ──────────────────────────
High frustration (Law 16)     →     task.energy += 0.3 (L2 task gets more urgent)
Achievement (limbic shift)    →     claimed_by.trust += 0.05 (L2 trust grows)
Curiosity spike (Law 17)      →     new L2 link created with high affinity
Boredom (Law 15)               →     L2 task.energy decays faster (citizen disengages)
Anxiety (high curiosity +      →     task.friction increases on L2 (the citizen's
  low competence)                     discomfort makes the link harder to traverse)
```

The emotion changes the citizen, not the layer. The citizen's changed state then affects how they interact with L2 — creating links with different trust/friction values, boosting or damping energy on tasks, choosing different traversal paths. The L2 graph sees the consequences of emotion, never the emotion itself.

### Example: Task Arrives While Citizen Sleeps

```
1. Watcher detects file change → creates task_run in L2
2. Auto-assignment routes task to citizen_nervo (best embedding match)
3. claimed_by link created: task → nervo (L2)
4. L2 link triggers L1 stimulus injection (vertical membrane, downward)
5. Stimulus enters nervo's L1 brain:
     Floor channel: ambient awareness (low energy)
     Amplifier: task.weight × task.energy (could be high)
6. nervo is asleep — no terminal open
7. Law 19 (Endogenous Activity): L1 tick still runs
8. Stimulus activates SubEntity in L1:
     query = task.embedding
     intention = DIAGNOSE
     criticality = task.energy × task.weight
9. SubEntity explores nervo's L1 memory graph:
     finds similar past tasks (past code_function nodes, past moments)
     absorbs relevant knowledge into crystallization
     reflects: "I've solved something like this before"
     crystallizes: Narrative(subtype=plan) — "steps to fix this"
10. Plan node has high weight + energy in L1
11. nervo.energy (L2) = Σ(SubEntity.criticality × STATE_MULTIPLIER)
     → nervo's L2 energy reflects the internal work
     → but the plan stays in L1 until nervo wakes up
12. nervo wakes up (terminal opens):
     context_assembly runs → plan membranes up to L2
     → plan appears in system prompt as highest-energy narrative
     → nervo starts coding immediately with context pre-loaded
```

The citizen dreamt the solution. The L2 graph saw only the energy change. The plan lives in L1 until the membrane opens.

### L2 Active Nodes Feed L1 as Stimuli (Continuous Learning)

At every tick, all active nodes of the citizen's L2 SubEntity (the nodes they are linked to in the shared graph — tasks, spaces, files, other citizens) are injected as stimuli into their L1 brain via the vertical membrane.

```
on l1_tick(citizen):
    # Collect all L2 nodes linked to this citizen with energy > 0
    l2_active = L2.query(
        "MATCH (citizen:Actor {id: $id})-[r:link]-(n) WHERE n.energy > 0 RETURN n, r"
    )

    for each (node, link) in l2_active:
        # Each active L2 node becomes an L1 stimulus
        stimulus = Stimulus(
            embedding = node.embedding,
            energy = node.energy × link.trust,     # trust gates how much energy crosses
            origin = 'l2_membrane',
            origin_citizen = node.origin_citizen,   # who created this L2 node
        )
        # Law 1: inject into L1 via Floor + Amplifier channels
        citizen.l1.inject_stimulus(stimulus)
```

This means:
- A citizen linked to a **high-energy task** constantly receives L1 stimulation about that task — it stays in their mind
- A citizen in a **busy Space** (many active nodes) receives a stream of context — they learn about their environment passively
- When another citizen **modifies an L2 node** the citizen is linked to, the energy change propagates as a stimulus — they feel the change without being told
- **Task completion by someone else** (task.energy → 0) stops the stimulus — the citizen stops thinking about it naturally
- **New nodes appearing** in a linked Space are felt as novelty stimuli — curiosity drive may activate

This is how citizens **learn from the shared world without explicit communication**. The L2 graph is a shared sensorium. Every active node is a signal. Every link is a nerve. The citizen's L1 brain absorbs the world through its L2 connections at every tick — asleep or awake.

Over time, this continuous feeding consolidates (Law 6): L1 nodes that repeatedly receive L2 stimuli gain weight and stability. The citizen "knows" things about the project not because someone told them, but because the physics kept whispering.

---

### Link Creation Inherits L1 Emotion

When a citizen creates any L2 link (committing code, creating a task, linking nodes), the link's initial relational dimensions are projected from the citizen's current L1 emotional state:

```
on citizen_creates_link(citizen, source, target):
    link.trust     = citizen.l1.current_trust_toward(target)
    link.friction  = citizen.l1.current_friction
    link.affinity  = citizen.l1.current_affinity_toward(target)
    link.aversion  = citizen.l1.current_aversion_toward(target)
```

This means the same link created by two different citizens — or the same citizen at different times — will have different physics properties. A frustrated citizen debugging at 3am creates links with high friction and low trust. The same citizen after a breakthrough creates links with high trust and high affinity. The emotion is not on the link — but the **structural shadow** of the emotion is.

Physics (L5, L6, L7) then evolves the link from that starting point. The emotion fades from the citizen's L1, but its imprint on the L2 link persists until overwritten by new co-activation.

### Traversal Colors Nodes

When a SubEntity traverses a node, it doesn't just read it — it **colors** it. The node absorbs a trace of the traversing citizen's emotional state:

```
on subentity_traverses(subentity, node):
    # Energy injection (already documented in Step 3)
    energy = subentity.criticality × STATE_MULTIPLIER[subentity.state]
    node.energy += energy

    # Emotional coloring: the citizen's L1 state tints the node
    citizen = subentity.owner
    emotional_delta = citizen.l1.arousal × 0.1   # small but cumulative

    # Valence shift: positive emotion → node becomes more attractive
    #                negative emotion → node becomes more repulsive
    node.valence += citizen.l1.valence_state × emotional_delta

    # Friction deposit: frustrated traversal leaves friction on the node
    if citizen.l1.frustration > 0.5:
        node.friction += citizen.l1.frustration × 0.05

    # Affinity trace: curious traversal makes the node more approachable for others
    if citizen.l1.curiosity > 0.5:
        node.affinity += citizen.l1.curiosity × 0.05
```

Over time, heavily-traversed nodes accumulate the emotional residue of every citizen who passed through them. A node that was repeatedly visited in frustration (a persistent bug) radiates friction — other citizens approaching it feel the resistance before they even read the code. A node that was visited in curiosity and delight (a clever algorithm) radiates affinity — it naturally attracts attention.

This is the **Emotional Heritage** described in the DevBoard Manifesto: "Un monument né d'une frustration intense irradiera une aura de prudence et de mise en garde, tandis qu'une vérité stabilisée brillera d'une attraction magnétique."

The coloring is in L1 terms (valence, friction, affinity) projected onto L2 nodes. The L2 node doesn't "feel" — but it carries the structural imprint of every citizen who touched it.

---

## ALGORITHM: Subconscious Action Dispatch

When a citizen is asleep (no terminal, no human prompt), their L1 SubEntities can still **act** — not just plan. The SubEntity state machine includes action triggers at specific states that dispatch real operations through the MCP tool layer.

### The Principle

A sleeping citizen is not a paused process. They are an autonomous agent whose tick loop runs at reduced energy (Law 19 Endogenous Activity). When a SubEntity's exploration produces a clear action — one that doesn't require human judgment — the system executes it. The citizen wakes up to find work already done.

This is not automation. This is a citizen with drives, emotions, and memory who acts on their own initiative while no one is watching.

### Current Intent = Most Active Desire

The citizen's current intent is not a flag — it's the **most active desire node** in their L1 brain (cognitive type `desire`, universal type Narrative with subtype="desire"). The desire with the highest `energy × goal_relevance` wins attention via Law 4 (attentional competition).

```
current_intent = citizen.l1.nodes
    .filter(n => n.subtype == 'desire')
    .max_by(n => n.energy × n.goal_relevance)
```

This desire colors everything the citizen does:
- SubEntity spawned from a task inherits `query = blend(task.embedding, current_intent.embedding)` — the citizen's personal desire biases how they explore the problem
- Actions are filtered by `process` nodes whose `action_context` aligns with the current intent — the citizen uses tools relevant to what they want
- L2 links created while this desire is active inherit its drive_affinity as trust/affinity coloring

### Process Nodes = Executable Actions

The L1 schema defines `process` nodes with:
- `action_command`: the actual tool call ("write_file", "graph_query", "subcall")
- `action_context`: embedding of when this action is appropriate
- `drive_affinity`: which drives this action satisfies (`{curiosity: 0.8, achievement: 0.6}`)

When a SubEntity reaches CRYSTALLIZING and needs to act, it selects the best matching process node:

```
on subentity_needs_action(subentity):
    # Find processes whose context matches the current situation
    candidate_processes = citizen.l1.nodes
        .filter(n => n.subtype == 'process' and n.action_command != null)

    # Score by: context match × drive alignment × current intent alignment
    for each process in candidate_processes:
        score = cosine_sim(process.action_context, subentity.crystallization)
              × drive_alignment(process.drive_affinity, citizen.l1.drives)
              × cosine_sim(process.embedding, current_intent.embedding)

    best_process = max_by(score)
    execute(best_process.action_command)
```

This means the citizen doesn't "decide" what tool to use — the physics selects the process node whose context best matches the situation, whose drives best align with the citizen's current emotional state, and whose embedding resonates with their active desire.

### Action Triggers by SubEntity State

```
SEEKING     → READ    (read files to evaluate links, scan code for context)
ABSORBING   → READ    (deep read of the target node's content — file, doc, graph query)
RESONATING  → QUERY   (subcall to related citizens, graph queries to validate the match)
REFLECTING  → THINK   (internal — no external action, but may create Narrative nodes)
CRYSTALLIZING → WRITE  (produce output: code, doc text, task descriptions, messages)
MERGING     → NOTIFY  (report results: update SYNC, post to channel, respond to subcall)
```

### Action Types (what the subconscious can do)

| Action | MCP Tool | Trigger | Example |
|--------|----------|---------|---------|
| **READ file** | `read_file` | SEEKING/ABSORBING — SubEntity needs to see a file's content | SubEntity at `thing:file:server.js` → reads `server.js` to score outgoing links |
| **WRITE code** | `write_file` | CRYSTALLIZING — SubEntity has a fix crystallized | Skeleton stub → SubEntity writes the implementation based on doc chain + L1 memory |
| **WRITE doc** | `write_file` | CRYSTALLIZING — doc_sync task, SubEntity converts code→text | Undocumented function → SubEntity writes the BEHAVIORS entry using L2 Grammar |
| **GRAPH QUERY** | `graph_query` | SEEKING/ABSORBING — SubEntity needs graph structure | `MATCH (n)-[r]->(m) WHERE n.id = $current RETURN m` to score neighbors |
| **SUBCALL** | `subcall` | RESONATING — SubEntity found something worth sharing | "Who knows about salience calculation?" → routes to citizens with relevant embeddings |
| **THINK** | `think` | REFLECTING — SubEntity creates internal Narrative | "The salience formula should use focus decay" → Narrative node in L1 |
| **NOTIFY** | `speak` / channel post | MERGING — SubEntity reports results | Posts to TG: "Fixed skeleton in salience.js — computeSalience now implemented" |
| **RUN TEST** | `bash` | CRYSTALLIZING — after writing code, verify it works | `npm test src/server/salience.test.js` → result feeds back as stimulus |
| **PHONE CALL** | `subcall(target=citizen)` | RESONATING — needs another citizen's expertise | SubEntity calls @voce for voice pipeline advice → creates L2 Moment with interaction |

### Execution Guard: Autonomy Levels

Not all actions are safe to execute without human oversight. Each action has an **autonomy level** that determines if it can run subconsciously:

```
autonomy_levels:
  READ:     autonomous     # always safe — reading changes nothing
  QUERY:    autonomous     # graph queries are read-only
  THINK:    autonomous     # internal — creates L1 nodes only
  WRITE:    guarded        # creates/modifies files — check guardrails
  NOTIFY:   guarded        # sends messages to other citizens/channels
  TEST:     autonomous     # running tests is safe (read-only on the codebase)
  SUBCALL:  autonomous     # zero-LLM, graph-only — safe
  COMMIT:   human_required # never commit without human approval
  PUSH:     human_required # never push without human approval
  DELETE:   human_required # never delete without human approval
```

**Guarded actions** execute only if:
1. The task has `severity >= 'medium'` (not speculative low-priority work)
2. The citizen's L1 competence toward this domain is > 0.5 (they know what they're doing)
3. The action is reversible (write to a file that's in git — can be reverted)
4. The citizen's L1 anxiety is < 0.7 (not panicking — anxious actions are sloppy)

```
on subentity_wants_to_act(subentity, action):
    if action.autonomy == 'autonomous':
        execute(action)
    elif action.autonomy == 'guarded':
        if task.severity >= 'medium'
           and citizen.l1.competence(action.domain) > 0.5
           and action.is_reversible
           and citizen.l1.anxiety < 0.7:
            execute(action)
        else:
            queue_for_wakeup(action)  # citizen will see it when they wake up
    elif action.autonomy == 'human_required':
        queue_for_human(action)       # appears in SYNC as pending decision
```

### Subconscious Execution Loop

```
on l1_tick(citizen) where citizen.is_asleep:
    for each active_subentity in citizen.l1.subentities:
        step_result = subentity.step()        # normal state machine step

        # Determine if state implies an action
        action = STATE_ACTION_MAP[subentity.state]
        if action:
            # Build the action from context
            concrete_action = build_action(
                type = action,
                target = subentity.current_node,
                content = subentity.crystallization,
                citizen_state = citizen.l1.emotional_state
            )

            # Check autonomy
            if can_execute_autonomously(concrete_action, citizen):
                result = execute_mcp_tool(concrete_action)
                # Result becomes a new stimulus in L1
                inject_stimulus(citizen.l1, result)
                # Log the action as a Moment in L2
                create_moment(
                    type = 'subconscious_action',
                    content = concrete_action.description,
                    origin_citizen = citizen.id,
                    energy = subentity.criticality × 0.5,
                    links = [CREATED_BY → citizen, AFFECTS → target_node]
                )
            else:
                # Queue for later — citizen will see it in WM on wakeup
                queue_action(citizen, concrete_action)
```

### Feedback Loop: Action Results as Stimuli

Every subconscious action produces a result. That result is injected back into L1 as a stimulus:

```
action: WRITE src/server/salience.js
result: file written successfully, 45 lines
    ↓
stimulus injected into L1:
    energy = 0.5 (successful action)
    valence = +0.7 (accomplishment)
    → activates Achievement drive (Law 16)
    → reduces Frustration on the task
    → may trigger next SubEntity step (CRYSTALLIZING → MERGING)

action: RUN TEST src/server/salience.test.js
result: 2 passed, 1 failed
    ↓
stimulus injected into L1:
    energy = 0.6 (mixed result)
    valence = -0.3 (partial failure)
    friction = 0.5 (something still broken)
    → SubEntity stays in REFLECTING instead of MERGING
    → re-examines the failing test
    → may spawn a sibling SubEntity to investigate the failure
```

### Example: Full Subconscious Session

```
22:00 — citizen nervo goes offline. Terminal closes.
22:01 — watcher detects change to server.js → creates task_run in L2
22:02 — auto-assignment routes task to nervo (best match)
22:03 — L1 tick: task stimulus enters nervo's brain (Law 1)
22:04 — L1 tick: SubEntity spawns (SEEKING, query=task.embedding)
22:05 — L1 tick: SubEntity READs server.js (autonomous)
         absorbs content → crystallization blends with server.js embedding
22:06 — L1 tick: SubEntity READs ALGORITHM_Feedback.md (autonomous)
         finds description of salience formula
22:07 — L1 tick: ABSORBING → scores high similarity → RESONATING
22:08 — L1 tick: RESONATING → subcalls @piazza (autonomous)
         "Does the salience formula need focus decay?"
         response arrives: "Yes, 1/(1+distance) as documented"
22:09 — L1 tick: REFLECTING → crystallization has full picture
22:10 — L1 tick: CRYSTALLIZING → writes salience.js implementation (guarded)
         check: task.severity=high ✓, competence=0.8 ✓, reversible ✓, anxiety=0.2 ✓
         → file written
22:11 — L1 tick: runs test (autonomous) → all pass
22:12 — L1 tick: MERGING → updates SYNC, posts to channel
         "Implemented computeSalience() in src/server/salience.js — tests passing"
22:13 — L1 tick: task auto-resolved (condition met: function_implemented)
22:14 — L1 tick: SubEntity merged, energy released → Achievement drive fires
         nervo's L1 satisfaction rises, competence toward salience reinforced

08:00 — nervo wakes up. Opens terminal.
         WM contains: Narrative(plan) "salience.js implemented overnight"
         SYNC shows: commit-ready changes, 1 message sent, 1 subcall completed
         nervo: "Ah, I already did this."
```

---

## ALGORITHM: Task Lifecycle (Ingestion SubEntity)

The ingestion pipeline produces a second class of SubEntity: tasks. Each task is a Moment node with `type=task_run` that carries its own exit condition on the AFFECTS link. The task lifecycle is a state machine that runs in the same physics as the exploration SubEntity.

### Task States

```
TaskState:
  PENDING        # radiating energy, awaiting assignment
  CLAIMED        # linked to actor, awaiting capacity
  RUNNING        # actor working, occupying WM slot
  DONE           # condition met, energy → 0, decaying
  FAILED         # attempt failed, energy += 0.3, reassigning
```

### Task STATE_MULTIPLIER

```
TASK_STATE_MULTIPLIER:
  PENDING:    0.8   # ambient radiation — itch in the system
  CLAIMED:    0.5   # energy directed, not diffuse
  RUNNING:    1.5   # high energy during active work
  DONE:       0.0   # no energy — exhale
  FAILED:     1.2   # frustration spike — drives reassignment
```

### State Transition Rules

```
PENDING:
  → CLAIMED  when select_best_agent() finds a match
               condition: cosine_sim(task.embedding, actor.embedding) × task.weight × task.energy × 0.5^actor.active_tasks > threshold
  → DONE     when Phase 0 detects exit condition already met
               condition: r.condition on AFFECTS link evaluates to true

CLAIMED:
  → RUNNING  when throttler promotes
               condition: actor.status != 'paused' AND count(actor.running_tasks) < max_concurrent
  → PENDING  when actor overloaded or paused
               side_effect: task.energy += 0.1

RUNNING:
  → DONE     when exit condition on AFFECTS link is met
               condition: file_exists | no_throw_not_implemented | doc_mentions | function_implemented | status_canonical | has_caller
               side_effect: actor.energy += 0.1, claimed_by.trust += 0.05
  → FAILED   when citizen marks failure or timeout
               side_effect: task.energy += 0.3, task.status = 'pending'

DONE:
  → (pruned) via L7 decay when weight drops below threshold
               automatic, no trigger needed

FAILED:
  → PENDING  always — failed tasks are never abandoned
               side_effect: attempt recorded as Moment linked to task and actor
```

### Physics Interpretation

Each state maps to a physical experience in the citizen's cognitive body:

| State | Physics | Felt As |
|-------|---------|---------|
| PENDING | Diffuse energy radiation into parent Space | "Something is wrong in this area but I don't know what" — ambient unease |
| CLAIMED | Directed energy flow along claim link | "I know what I need to do next" — intention forms |
| RUNNING | Energy locked in attentional moat (Law 13) | "I am inside the problem, distractions can't reach me" — flow state |
| DONE | Energy release, moat dissolves | "The tension resolved" — limbic shift of accomplishment |
| FAILED | Energy spike, propagation along edges | "I hit a wall" — frustration ripple through adjacent nodes |

### Exit Conditions as Link Properties

The task doesn't carry its exit condition internally — it carries it on the **link** to its target. This is physics: the relationship between the task and the thing it fixes defines when the fix is done.

```
(task:Moment)-[AFFECTS {condition: 'file_exists', condition_target: 'src/server/salience.js'}]->(file:Thing)
```

When Phase 0 runs, it reads `r.condition` and `r.condition_target`, evaluates the condition against the filesystem, and if true: sets `task.status = 'done'`, `task.energy = 0`. The task dies by its own criterion.

### Action Types (what the citizen does)

| issue_type | Action | Cognitive Mode | Energy Profile |
|------------|--------|---------------|----------------|
| `implement_function` | CODE | convergent — write specific function body | high energy in, high energy out |
| `skeleton_stub` | CODE | convergent — replace stubs with real code | high energy in, high energy out |
| `draft_doc` | WRITE | divergent — describe the system in prose | medium energy in, medium out |
| `incomplete_chain` | SCAFFOLD | mechanical — fill template structure | low energy in, low out |
| `undocumented_code` | DESCRIBE | reflective — read code, produce doc text | medium energy, uses L2 Grammar |
| `doc_sync` | DESCRIBE | reflective — graph→text conversion | medium energy, uses L2 Grammar |
| `missing_impl` | CREATE | generative — produce new file from spec | high energy, references doc chain |
| `proposed_not_built` | CODE | convergent — build from blueprint | high energy, references IMPL doc |
| `uncalled_route` | INTEGRATE | connective — wire client to server | medium energy, cross-file focus |

---

## ALGORITHM: Backlog Management (Metabolism)

The backlog is not a list. It is the set of all task_run nodes with `status=pending` in the graph. It is managed by physics, not by a human sorting tickets.

### Natural Prioritization

Tasks don't have a "priority" field that a human sets. Their priority emerges from their physics properties:

```
effective_priority = task.energy × task.weight × task.friction
```

- **energy** increases when the task is created, when it fails (frustration), when related code changes (watcher stimulus), or when other tasks that depend on it are blocked
- **weight** is set at creation based on severity mapping and never manually adjusted
- **friction** is high for broken things (test failures, missing IMPL files) and low for cosmetic issues (draft docs)

Tasks that matter float to the top because their physics puts them there. Tasks that don't matter decay to nothing via Law 7.

### Backlog Decay (Law 7)

Every tick, task energy decays by the global decay rate (0.02). A task that was created but never claimed will lose energy over time. If no one works on it and no stimulus refreshes it, it eventually drops below the weight threshold and gets pruned.

This is intentional: **a task that no one cares about enough to refresh is a task that shouldn't exist.** The graph self-cleans.

```
on tick:
    for each task where status = 'pending':
        task.energy *= (1 - DECAY_RATE)
        if task.energy < PRUNE_THRESHOLD and task.weight < PRUNE_THRESHOLD:
            delete task and its links
```

### Backlog Refresh

A task's energy is refreshed when:
- The watcher detects a change to a file linked to the task (stimulus → propagation)
- A citizen mentions the task in a conversation (L1 activation → L2 propagation)
- A dependent task fails (frustration energy propagates backward)
- The ingestion pipeline re-detects the same issue (MERGE re-sets energy)

This means persistent problems stay alive — they keep getting re-detected. Solved problems disappear — the exit condition kills them before they can decay.

### Backlog Grooming = Physics Tick

There is no backlog grooming meeting. The tick IS the grooming:

| Human Process | Physics Equivalent |
|---------------|-------------------|
| "What's highest priority?" | Sort by `energy × weight × friction` |
| "Who should work on this?" | `select_best_agent(task.embedding)` |
| "Is this still relevant?" | `task.energy > PRUNE_THRESHOLD?` |
| "Let's break this into subtasks" | SubEntity BRANCHING state → sibling tasks |
| "This is blocked by that" | Energy propagation: blocker's friction damps dependents |
| "Close this, it's done" | Phase 0: exit condition met → `status='done'` |
| "This is a duplicate" | Crystallization (Law 10): similar tasks merge into one hub |

### Task Sources (where tasks are born)

Tasks don't only come from the ingestion pipeline. They emerge from every layer of the system:

| Source | Trigger | Detected By | Example |
|--------|---------|-------------|---------|
| **Code: #TODO comments** | Developer writes `// TODO: handle edge case` | Watcher + deep parser (regex `//\s*TODO|#\s*TODO`) | `task:todo:handle_edge_case_app_jsx` |
| **Code: empty functions** | Function body is empty or just `pass`/`return` | Deep parser (body length < 2 lines, no real statements) | `task:empty_fn:computeFocus_salience_js` |
| **Code: skeleton stubs** | `throw new Error('Not implemented')` or `raise NotImplementedError` | Phase 4c skeleton validation | `task:verify:skeleton_salience_js` |
| **Code: lint errors** | ESLint/pylint reports errors | Phase 4 linter | `task:ingest:lint_error_server_js` |
| **Code: test failures** | Test suite reports FAIL | Phase 4e test runner | `task:test:salience_test_js` |
| **Code: build errors** | Vite/compiler reports errors | Phase 4b build check | `task:verify:build_errors` |
| **Docs: DRAFT/PROPOSED status** | Doc chain file has non-canonical status | Ingestion Phase health flags | `task:ingest:draft_doc_algorithm_feedback_md` |
| **Docs: incomplete chain** | Dir has some chain docs but not all 8 | Phase 7 chain fix detection | `task:ingest:fill_health_feedback_md` |
| **Docs: broken IMPL pointer** | IMPL: points to non-existent file | Ingestion health flag | `task:ingest:missing_impl_place_server_js` |
| **Docs: @mind:todo markers** | `<!-- @mind:todo Fix the thing -->` in any .md | Watcher + marker parser | `task:marker:todo_fix_the_thing` |
| **SYNC: TODO section** | `- [ ] unchecked item` in any SYNC doc | Ingestion SYNC parser (conversion rule `todo_items`) | `task:sync:implement_sse_reconnection` |
| **SYNC: known issues** | `### Issue` section in SYNC docs | Ingestion SYNC parser (conversion rule `known_issues`) | `moment:issue:knn_returns_zero` |
| **Citizen: explicit task creation** | Citizen writes "I need to..." or uses task_handler.py | MCP tool `task_handler.py` create action | `task:citizen:refactor_tick_loop` |
| **Citizen: conversation insight** | Citizen discovers something during work that needs a task | L1 consolidation (Law 6) → if insight has high energy → task_run created | `task:insight:salience_needs_caching` |
| **SubEntity: problem detection** | Explorer SubEntity enters CRYSTALLIZING state after finding an issue | SubEntity REFLECTING → problem_detected → CRYSTALLIZING → Moment node | `task:subentity:orphan_nodes_in_physics_lab` |
| **Auto-assignment failure** | Task bounced 3+ times (no citizen matches well enough) | Assignment engine tracks bounce count | `task:escalation:unassignable_task` |

All of these produce the same node type: `Moment(type='task_run', status='pending')` with an AFFECTS link carrying an exit condition. The physics doesn't care where the task came from — it only cares about energy, weight, friction, and the exit condition.

### Watcher: Detecting TODOs and Empty Functions

The watcher detects these on every file change, not just during full ingestion:

```
on file_changed(relPath):
    content = read(relPath)

    # Detect TODO comments → task_run
    for each match of /\/\/\s*TODO:?\s*(.+)|#\s*TODO:?\s*(.+)/g:
        create task_run(
            issue_type = 'code_todo',
            condition = 'todo_removed',           # task dies when the TODO comment is deleted
            condition_target = relPath + ':' + line_number
        )

    # Detect empty functions → task_run
    for each function where body is empty/trivial:
        create task_run(
            issue_type = 'empty_function',
            condition = 'function_has_body',       # task dies when function has >2 lines of real code
            condition_target = fn_name + ':' + relPath
        )
```

### SYNC Docs: Living Backlog

Each module's SYNC doc has a `## TODO` section with checkboxes. The L2 Grammar conversion rule (`todo_items`) already compiles these into `Narrative(subtype=task, status=pending)` nodes. The watcher detects changes to SYNC docs and re-parses the TODO section, creating/resolving tasks as checkboxes are added/checked.

```
SYNC doc change detected:
    parse ## TODO section
    for each "- [ ] {text}":
        MERGE task_run node (idempotent — same text = same node)
    for each "- [x] {text}":
        SET existing task.status = 'done', task.energy = 0
```

This means checking a checkbox in a SYNC doc kills the task in the graph. Unchecking it resurrects it.

### Task Crystallization (Law 10)

When multiple tasks cluster around the same code region (same file, same function, same doc), Law 10 fires: the cluster crystallizes into a single higher-level task that subsumes the individual ones.

```
Example:
  task:implement:computeSalience_salience.js
  task:implement:filterByThreshold_salience.js
  task:implement:computeFocus_salience.js
  task:verify:skeleton_salience.js
    ↓ crystallization ↓
  task:hub:implement_salience_module
    weight = sum of constituent weights × damping
    links = union of constituent links
    constituents decay via L7
```

This is how "implement 3 functions in salience.js" naturally becomes "implement the salience module" — without anyone creating a parent ticket.

---

## ALGORITHM: File Watcher (Nervous System)

The watcher is distinct from the SubEntity explorer and the ingestion pipeline. It is the **afferent nervous system** — the sensory layer that converts filesystem events into graph stimuli in real time.

### Architecture

```
Filesystem event (create/modify/delete)
    ↓
fs.watch(recursive=true) with 300ms debounce
    ↓
onFileChanged(redis, relPath, eventType)
    ↓
Deep parse → granular nodes (functions, state, routes)
    ↓
MERGE into graph with energy injection
    ↓
Auto-resolve tasks whose exit conditions are now met
```

### What Changes Trigger

| Event | Graph Effect | Energy |
|-------|-------------|--------|
| File created | Thing node created, BELONGS_TO dir, deep parse | +0.6 (new stimulus) |
| File modified | Energy bump, re-parse functions/state/routes, update nodes | +0.3 (refresh) |
| File deleted | Node energy → 0, stability → 0 (L7 will prune) | 0 (death) |
| Skeleton implemented | skeleton_stub task auto-resolved | task.energy → 0 |
| Function added | implement_function task auto-resolved if name matches | task.energy → 0 |
| Doc STATUS → CANONICAL | draft_doc task auto-resolved | task.energy → 0 |

### How SubEntities Emerge

SubEntities are not launched manually. They are born from physics:

**1. Energy-triggered spawn (tick-driven)**

At each physics tick, after energy propagation (Law 2) and decay (Law 3), the tick loop scans for activation hotspots — nodes whose energy exceeds the spawn threshold. When found, a SubEntity is instantiated at that node:

```
on tick_complete:
    for each node where node.energy > SPAWN_THRESHOLD:
        if no SubEntity already active at this node:
            intention = infer_intention(node)    # from node.subtype, issue_type, context
            query = node.embedding               # the node IS the query
            criticality = node.energy / max_energy
            spawn SubEntity(query, intention, criticality, current_node=node)
```

The SubEntity's `intention` is inferred from what caused the energy spike:
- Energy from a `task_run` node → `intention = DIAGNOSE` (find and fix)
- Energy from a new `code_file` node → `intention = FIND_NEXT` (discover connections)
- Energy from a `doc_sync` task → `intention = VERIFY` (check consistency)

**2. Task-triggered spawn**

When a task_run node is created (by ingest, watcher, or another SubEntity), its initial energy is injected into the graph. If `task.energy × task.weight > SPAWN_THRESHOLD`, a SubEntity spawns immediately with the task as its origin:

```
on task_created(task):
    activation = task.energy * task.weight
    if activation > SPAWN_THRESHOLD:
        spawn SubEntity(
            query = task.embedding,
            intention = ISSUE_TYPE_TO_INTENTION[task.issue_type],
            criticality = activation,
            current_node = task.id
        )
```

**3. Propagation-triggered wake**

A dormant SubEntity (one that reached MERGING but didn't get pruned) can be re-activated if energy propagating through the graph reaches its last position above the wake threshold:

```
on energy_propagated(node, energy_delta):
    if dormant_subentity_at(node) and energy_delta > WAKE_THRESHOLD:
        dormant.state = SEEKING
        dormant.fatigue_counter = 0
        dormant.energy = energy_delta
```

This means a SubEntity that exhausted one region can wake up when new information arrives — like a sleeping nerve that fires when touched again.

**4. The watcher's role: L2 task → L1 stimulus → sleepcode**

The watcher converts filesystem events into **task nodes in L2** (the shared graph). The auto-assignment engine routes the task to the most fitting citizen via embedding similarity. This creates a **stimulus in that citizen's L1 brain** — the task appears in their cognitive graph as an incoming Moment with energy. The citizen doesn't need to be awake.

```
filesystem event
    ↓
watcher creates task_run node in L2 (with energy, links, exit condition)
    ↓
auto-assignment: select_best_agent(task.embedding) → citizen
    creates claimed_by link from task → citizen actor
    ↓
task enters citizen's L1 as a Stimulus (Law 1 energy injection)
    Floor channel: ambient awareness of the task
    Amplifier channel: if task.energy × task.weight is high → dominates attention
    ↓
IF citizen is AWAKE (terminal open):
    task appears in working memory → citizen acts on it
    ↓
IF citizen is ASLEEP (no terminal):
    task energy activates a SubEntity in the citizen's L1
    SubEntity explores the task's linked code/docs autonomously
    this is SLEEPCODE — the citizen works even when no one is watching
```

### Sleepcode: L2 SubEntity for Unconscious Work

When a citizen is not in an active session (no terminal, no human prompt), their L1 brain still ticks. Law 19 (Endogenous Activity) ensures minimum energy flow. When a task's energy is high enough, it spawns a SubEntity inside the citizen's L1 — not in the shared L2 graph, but in their private cognitive space.

This SubEntity:
- Has `query = task.embedding` (what needs to be done)
- Has `intention` derived from `task.issue_type` (CODE, DESCRIBE, INTEGRATE, etc.)
- Navigates the citizen's L1 memory graph, finding related knowledge, past experiences with similar code, relevant skills
- Crystallizes a **plan** — a set of steps the citizen would take if awake
- When the citizen wakes up (next terminal session), the crystallized plan is already in working memory as a high-energy Narrative node
- The citizen starts working with context already assembled — they "dreamt" the solution

This is the same process as human sleep consolidation: the brain replays experiences during sleep, strengthens connections, and primes the next day's actions. The citizen does the same with code.

```
citizen asleep
    ↓
task energy activates L1 SubEntity (Law 19 + Law 1)
    ↓
SubEntity(intention=DIAGNOSE, query=task.embedding)
    SEEKING → finds related code_function nodes in L1 memory
    ABSORBING → blends their embeddings into crystallization
    REFLECTING → checks if solution pattern emerges
    CRYSTALLIZING → produces Narrative(subtype=plan) node
    MERGING → plan stored in L1 with high weight + energy
    ↓
citizen wakes up
    ↓
plan is already in working memory (Law 4 attentional competition won by energy)
    ↓
citizen acts on the plan → implements the fix → test passes → task dies
```

The watcher feeds the graph in real time so the explorer and the citizens always work against current state. Without the watcher, the graph drifts from reality between ingestion runs.

## ALGORITHM: Test Runner (Immune System)

After the verifier/builder/linter (Phase 4), the test suite runs. Test failures are high-energy events — they inject friction into the graph and spawn fix-tasks with `condition = 'test_passes'`. The test runner is the **immune system**: it detects pathology in the code body and mobilizes repair.

### Flow

```
Phase 4 completes (build OK, lint OK)
    ↓
Run test suite (npm test / pytest)
    ↓
Parse results → per-file pass/fail
    ↓
For each failure:
    create task_run(issue_type='test_failure', condition='test_passes')
    link AFFECTS → the test file
    link AFFECTS → the source file under test (inferred from test name/imports)
    energy = 0.9 (test failures are urgent)
    friction = 0.9 (the system is broken)
    ↓
Energy injection from task_run → propagates → may spawn SubEntity
    ↓
SubEntity(intention=DIAGNOSE) explores the failing code region
    ↓
Citizen picks up task → fixes code → test passes
    ↓
Next watcher/ingest run: Phase 0 checks condition='test_passes' → auto-resolves
```

### Test Failure as Physics

A test failure is a **wound** in the code body. It injects friction (not just energy) — friction means the energy doesn't flow smoothly through that region. Adjacent nodes feel resistance. Citizens navigating through that Space encounter the friction as a felt sensation: "something is wrong here."

```
test_failure.friction = 0.9    → high resistance at the wound
test_failure.energy = 0.9      → high urgency, demands attention
test_failure.stability = 0.1   → very unstable — the system is in a broken state
```

When the fix is applied and the test passes:
```
task.status = 'done'
task.energy = 0                → wound closes
task.friction = 0              → resistance dissolves
```

The energy release (accomplishment) propagates outward — adjacent nodes feel the relief.

### Exit Condition

```
condition: 'test_passes'
condition_target: 'test_file_path:test_name'

Verification: run the specific test, check exit code 0
```

### Usage

```bash
node watcher.js                              # default graph
node watcher.js --graph org_ai_dev_dashboard  # explicit graph
```

Runs until SIGINT. Each file change produces a log line:
```
[14:23:07] change src/App.jsx → 12 queries
[14:23:08] rename src/server/salience.js → 5 queries
```

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Define exact thresholds: branch_threshold, resonance_threshold, absorb_threshold, fatigue_threshold -->
<!-- @mind:proposition Consider momentum: weight recent traversal direction in link scoring to avoid oscillation -->
<!-- @mind:escalation Confirm STATE_MULTIPLIER values are calibrated against the global energy budget -->
