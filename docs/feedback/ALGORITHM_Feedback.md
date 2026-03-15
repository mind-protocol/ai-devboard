# Live Feedback — Algorithm: SSE Stream Pipeline, Salience Calculation, Room Energy Injection

```
STATUS: DRAFT
CREATED: 2026-03-15
VERIFIED: —
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Feedback.md
BEHAVIORS:       ./BEHAVIORS_Feedback.md
PATTERNS:        ./PATTERNS_Feedback.md
MECHANISMS:     (not applicable)
THIS:            ALGORITHM_Feedback.md (you are here)
VALIDATION:      ./VALIDATION_Feedback.md
HEALTH:          ./HEALTH_Feedback.md
IMPLEMENTATION:  ./IMPLEMENTATION_Feedback.md
SYNC:            ./SYNC_Feedback.md

IMPL:            src/server/place-server.js
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

---

## OVERVIEW

The Live Feedback algorithm has four interconnected procedures: (1) the SSE stream pipeline that pushes graph deltas to clients in real time, (2) the salience calculation that determines what is visible and how prominent it is, (3) room energy injection that biases the physics tick toward the active Place, and (4) the moment-to-visual transform that converts graph state into Blood Ledger rendering instructions.

The core loop is: physics tick runs → energy propagates → active Place receives injection → salience recalculated for visible nodes → deltas emitted via SSE → Blood Ledger renders transforms on client. This happens every tick. No polling. No request-response. The graph pushes its state outward.

---

## OBJECTIVES AND BEHAVIORS

| Objective | Behaviors Supported | Why This Algorithm Matters |
|-----------|---------------------|----------------------------|
| Real-time graph-to-visual translation | B1, B3 | SSE pipeline + moment-to-visual transform guarantee that graph changes appear as visual changes within one tick |
| Spatial context bias | B2 | Room energy injection ensures the active Place dominates the salience field |
| Zero-polling (SSE) | B1, B3 | SSE stream pipeline eliminates client polling entirely |
| Salience-driven filtering | B2, B4 | Salience calculation determines visibility threshold, not listing order |

---

## DATA STRUCTURES

### PlaceState

```
PlaceState:
  place_uri: string          # e.g., "place://ui/triage"
  energy: float              # current energy level (0.0+)
  weight: float              # structural importance (0.0+)
  focus: float               # 1.0 if active Place, decays toward 0.0 if inactive
  moments: Moment[]          # local Moments attached to this Place
  children: NodeRef[]        # graph nodes visible from this Place
  last_tick: int             # tick number of last energy update
```

### SSEEvent

```
SSEEvent:
  id: string                 # monotonic event ID for reconnection
  event: string              # event type: "delta", "moment", "place_removed", "heartbeat"
  data: JSON                 # payload — varies by event type
  playthrough_id: string     # scoping identifier
```

### SalienceEntry

```
SalienceEntry:
  node_id: string            # graph node being scored
  weight: float              # node's structural weight
  energy: float              # node's current energy
  focus: float               # derived from active Place proximity
  salience: float            # computed: weight * energy * focus
  visible: boolean           # true if salience >= visibility threshold
```

### VisualTransform

```
VisualTransform:
  node_id: string            # target node
  opacity: float             # 0.0 (invisible) to 1.0 (fully visible)
  scale: float               # size multiplier based on salience
  pulse_rate: float          # animation speed based on energy
  color_shift: float         # hue/saturation shift based on friction/pressure
  alert_level: string        # "none" | "low" | "medium" | "high" — friction-driven
```

---

## ALGORITHM: SSE Stream Pipeline

### Step 1: Client Connection

A client opens `GET /api/stream/{playthrough_id}` with optional `Last-Event-ID` header. The server registers the connection in the active streams map, keyed by playthrough_id. If `Last-Event-ID` is present, the server replays missed events from the event buffer before entering the live stream.

```
client connects to GET /api/stream/{playthrough_id}
server registers connection in streams[playthrough_id]
if Last-Event-ID present:
    replay events from buffer where event.id > Last-Event-ID
begin live streaming
```

### Step 2: Tick Delta Collection

Each physics tick, after energy propagation and decay, the tick engine emits a tick_complete event. The feedback module captures the set of nodes whose energy, weight, or friction changed since the previous tick. Only deltas are collected — unchanged nodes produce no events.

```
on tick_complete:
    changed_nodes = diff(graph_state_current, graph_state_previous)
    for each changed_node:
        if node is visible from any active Place:
            add to delta_set
```

### Step 3: Salience Filtering

For each node in the delta set, salience is calculated. Nodes below the visibility threshold are marked as invisible (they will fade out on the client). Nodes above threshold are included in the SSE event with their updated salience score.

```
for each node in delta_set:
    salience = node.weight * node.energy * node.focus
    if salience >= VISIBILITY_THRESHOLD:
        include in sse_payload with visual transform
    else:
        include fade-out instruction if previously visible
```

### Step 4: SSE Emission

The filtered delta set is serialized as an SSE event and pushed to all clients subscribed to the relevant playthrough_id. Each event gets a monotonic ID for reconnection support.

```
event = SSEEvent(
    id = next_event_id(),
    event = "delta",
    data = { nodes: filtered_delta_set, tick: current_tick },
    playthrough_id = playthrough_id
)
for each connection in streams[playthrough_id]:
    connection.write(event)
buffer.append(event)  # retain for reconnection replay
```

---

## ALGORITHM: Salience Calculation

### Step 1: Compute Focus

Focus is 1.0 for the active Place and its direct children. For nodes connected via edges, focus decays by edge distance. Nodes with no path to the active Place have focus = 0.0.

```
for each node in graph:
    if node == active_place or node.parent == active_place:
        node.focus = 1.0
    else:
        distance = shortest_path_length(active_place, node)
        if distance == INFINITY:
            node.focus = 0.0
        else:
            node.focus = 1.0 / (1.0 + distance)
```

### Step 2: Compute Salience

```
salience = weight * energy * focus
```

All three factors are non-negative floats. Weight is structural (how important is this node in the graph). Energy is dynamic (how much energy is flowing through it right now). Focus is spatial (how close is it to where the user is standing).

### Step 3: Apply Visibility Threshold

```
VISIBILITY_THRESHOLD = 0.01  # tunable

if salience >= VISIBILITY_THRESHOLD:
    visible = true
    visual_prominence = normalize(salience, 0.01, max_salience)
else:
    visible = false
```

---

## ALGORITHM: Room Energy Injection

### Step 1: Identify Active Place

Each playthrough has exactly one active Place at a time. When the user navigates, the active Place changes.

```
on navigation(playthrough_id, new_place_uri):
    old_place = active_places[playthrough_id]
    active_places[playthrough_id] = new_place_uri
    old_place.focus = 0.0  # will decay naturally
    new_place.focus = 1.0
```

### Step 2: Inject Energy Per Tick

Each tick, a fixed amount of energy is injected into the active Place node. This energy propagates through edges to child nodes, biasing the salience field toward the active room's content.

```
INJECTION_AMOUNT = 0.1  # per tick, tunable

on tick:
    active_place = active_places[playthrough_id]
    active_place.energy += INJECTION_AMOUNT
    propagate_energy(active_place, decay_rate=0.02)
```

---

## ALGORITHM: Moment-to-Visual Transform

### Step 1: Detect Moment Creation

When a Moment node is created (e.g., linter error → friction → moment flip), it is attached to its parent Place.

```
on moment_created(moment, parent_place):
    parent_place.moments.push(moment)
    moment.energy = initial_energy(moment.type)
```

### Step 2: Transform to Visual

The Blood Ledger reads moment properties and produces a VisualTransform.

```
transform = VisualTransform(
    node_id = moment.id,
    opacity = min(1.0, moment.energy),
    scale = 1.0 + (moment.weight * 0.5),
    pulse_rate = moment.energy * 2.0,
    color_shift = friction_to_hue(moment.friction),
    alert_level = friction_to_alert(moment.friction)
)
```

### Step 3: Emit via SSE

```
event = SSEEvent(
    id = next_event_id(),
    event = "moment",
    data = { moment: moment, transform: transform, place_uri: parent_place.uri }
)
emit_to_subscribers(event)
```

---

## KEY DECISIONS

### D1: SSE vs WebSocket

```
IF bidirectional real-time communication is needed:
    Use REST for client→server commands + SSE for server→client updates
    SSE is simpler, auto-reconnects, works through proxies
    Why: unidirectional push covers all feedback use cases
ELSE IF only server→client push is needed:
    Use SSE exclusively
    Why: lower complexity, better browser support, no connection upgrade
```

### D2: Salience Threshold Tuning

```
IF salience < 0.01 (VISIBILITY_THRESHOLD):
    Node is invisible — not rendered, not transmitted
    Why: prevents visual noise from irrelevant nodes
ELSE:
    Node is visible with prominence proportional to salience
    Why: graduated visibility reflects actual importance
```

### D3: Energy Injection Amount

```
IF active Place energy is already high (> 5.0):
    Injection still occurs but natural decay balances it
    Why: consistent injection simplifies the model; decay prevents runaway
ELSE:
    Standard injection of 0.1 per tick
    Why: enough to bias salience without overwhelming other signals
```

---

## DATA FLOW

```
Physics tick completes
    ↓
Energy propagation + decay applied to all nodes
    ↓
Active Place receives energy injection (+0.1)
    ↓
Delta detection: which nodes changed?
    ↓
Salience calculation: weight × energy × focus
    ↓
Visibility threshold filtering
    ↓
Blood Ledger: salience → VisualTransform
    ↓
SSE emission to subscribed clients
    ↓
Client renders visual transforms
```

---

## COMPLEXITY

**Time:** O(N) per tick where N = number of nodes in the active Place's visibility scope — each node's salience is computed once per tick

**Space:** O(E) for event buffer where E = number of events retained for reconnection replay

**Bottlenecks:**
- Shortest-path calculation for focus decay could be expensive on large graphs — mitigate with BFS bounded to max_depth
- Event buffer growth if clients disconnect for long periods — mitigate with buffer size cap and oldest-event eviction

---

## HELPER FUNCTIONS

### `computeSalience(node, activePlaceUri)`

**Purpose:** Calculate the salience score for a single node relative to the active Place.

**Logic:** Retrieve node.weight, node.energy, and compute focus based on graph distance to activePlaceUri. Return weight * energy * focus.

### `emitDelta(playthroughId, deltaSet)`

**Purpose:** Serialize a set of node changes into an SSE event and push to all subscribers.

**Logic:** Build SSEEvent, assign monotonic ID, serialize as `data: {json}\n\n`, write to each connection in streams[playthroughId], append to replay buffer.

### `injectEnergy(playthroughId)`

**Purpose:** Apply per-tick energy injection to the active Place node.

**Logic:** Look up active Place for playthrough, add INJECTION_AMOUNT to its energy, trigger propagation along edges with decay.

### `frictionToAlert(friction)`

**Purpose:** Map a friction value to an alert level for visual rendering.

**Logic:** friction < 0.3 → "none", < 0.6 → "low", < 0.8 → "medium", >= 0.8 → "high".

---

## INTERACTIONS

| Module | What We Call | What We Get |
|--------|--------------|-------------|
| Physics tick engine | Subscribe to `tick_complete` event | Set of changed nodes with updated energy/weight/friction |
| Blood Ledger renderer | `renderTransform(salienceEntry)` | VisualTransform for client-side rendering |
| Graph (FalkorDB / in-memory) | `getNode()`, `getEdges()`, `shortestPath()` | Node state, edge weights, path distances |
| home_server | `registerSSEStream(playthroughId, response)` | HTTP response object for SSE writing |

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Define exact event buffer eviction policy (time-based vs count-based) -->
<!-- @mind:proposition Consider spatial indexing for focus computation to avoid BFS on large graphs -->
<!-- @mind:escalation VISIBILITY_THRESHOLD and INJECTION_AMOUNT need empirical tuning — what is the calibration process? -->
