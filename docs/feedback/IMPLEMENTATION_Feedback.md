# Live Feedback — Implementation: Code Architecture and Structure

```
STATUS: PARTIAL — 4 endpoints LIVE, salience/place/blood-ledger PROPOSED
CREATED: 2026-03-15
UPDATED: 2026-03-15
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Feedback.md
BEHAVIORS:       ./BEHAVIORS_Feedback.md
PATTERNS:        ./PATTERNS_Feedback.md
MECHANISMS:      (not applicable)
ALGORITHM:       ./ALGORITHM_Feedback.md
VALIDATION:      ./VALIDATION_Feedback.md
THIS:            IMPLEMENTATION_Feedback.md
HEALTH:          ./HEALTH_Feedback.md
SYNC:            ./SYNC_Feedback.md

IMPL:            server.js
IMPL:            src/server/sse-stream.js
IMPL:            src/server/l2-tick.js
IMPL:            src/server/citizen-state.js
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

---

## CODE STRUCTURE

```
./
├── server.js                      # API entry point — all 4 DevBoard endpoints
├── src/
│   ├── App.jsx                    # Frontend — SSE consumer, tick controls, query UI
│   ├── server/
│   │   ├── l2-tick.js             # L2 tick cycle (19-step collective heartbeat)
│   │   ├── sse-stream.js          # SSE helpers (skeleton — actual SSE is inline in server.js)
│   │   ├── citizen-state.js       # Citizen state retrieval for query/tick cycles
│   │   ├── behavior-scorer.js     # Behavior scoring for L2 tick
│   │   ├── target-selector.js     # Target selection with Cypher queries
│   │   ├── sentence-maker.js      # Sentence generation for citizen actions
│   │   ├── task-continuity.js     # Task resolution for citizen behavior cycle
│   │   └── action-dispatch.js     # Action dispatch (graph_query support)
```

### File Responsibilities

| File | Purpose | Key Functions/Classes | Lines | Status |
|------|---------|----------------------|-------|--------|
| `server.js` | Express server — mounts all 4 API endpoints, inline SSE stream + tick logic | `sseEmit()`, `parseGraphResult()`, route handlers | ~330 | LIVE |
| `src/server/l2-tick.js` | Full L2 tick cycle — propagation, decay, citizen behavior selection | `runL2Tick()` | ~169 | LIVE |
| `src/server/sse-stream.js` | SSE helper stubs (not yet wired — actual SSE logic is inline in server.js) | `createSSEStream()`, `emitDelta()`, `replayFromId()` | ~31 | SKELETON |
| `src/server/citizen-state.js` | Read citizen state from FalkorDB for behavior scoring | `getCitizenState()` | — | LIVE |
| `src/App.jsx` | Frontend consumer — connects to SSE, triggers tick/query endpoints | `App`, `runTick()`, `runQuery()` | ~304 | LIVE |

**Size Thresholds:**
- **OK** (<400 lines): Healthy size, easy to understand
- **WATCH** (400-700 lines): Getting large, consider extraction opportunities
- **SPLIT** (>700 lines): Too large, must split before adding more code

> `server.js` and `l2-tick.js` are LIVE. `sse-stream.js` is a skeleton stub. `salience.js`, `place-server.js`, and `blood-ledger/renderer.js` are still PROPOSED.

---

## DESIGN PATTERNS

### Architecture Pattern

**Pattern:** Event-Driven Pipeline

**Why this pattern:** The feedback module is a reactive pipeline — graph events trigger salience recalculation, which triggers SSE emission, which triggers client rendering. No request-response cycle. No polling. Events flow in one direction: graph → server → client.

### Code Patterns in Use

| Pattern | Applied To | Purpose |
|---------|------------|---------|
| Observer | `place-server.js:PlaceServer` | Subscribes to `tick_complete` events from physics engine |
| Pipeline | `sse-stream.js:createSSEStream()` | Each SSE event flows through delta detection → salience filter → serialization → emission |
| Strategy | `blood-ledger/renderer.js` | Blood Ledger is a pluggable rendering cartridge — swap strategies for 2D, Map, Chronicle, VR |

### Anti-Patterns to Avoid

- **Polling fallback**: It is tempting to add a REST endpoint that returns current state "just in case SSE fails" → instead, fix SSE reconnection with Last-Event-ID replay
- **God Object**: Don't let PlaceServer handle salience calculation, SSE management, AND rendering → keep each in its own file
- **Premature Abstraction**: Don't create helpers until you have 3+ uses — start with inline salience calculation, extract when patterns emerge

### Boundaries

| Boundary | Inside | Outside | Interface |
|----------|--------|---------|-----------|
| SSE Stream | Connection management, event buffering, replay | Graph state, salience logic | `emitDelta(playthroughId, deltaSet)` |
| Salience Engine | Formula computation, threshold filtering, focus | Graph structure, rendering | `computeSalience(node, activePlaceUri)` |
| Blood Ledger | Visual transform generation | Graph management, SSE transport | `renderTransform(salienceEntry)` |
| Place Server | Active room tracking, energy injection | SSE transport, rendering | `setActivePlace(playthroughId, placeUri)` |

---

## SCHEMA

### PlaceNode

```yaml
PlaceNode:
  required:
    - uri: string              # e.g., "place://ui/triage"
    - energy: float            # current energy level
    - weight: float            # structural importance
    - type: enum               # "ui_room" | "sync_file" | "view" | "protocol"
  optional:
    - focus: float             # 1.0 if active, decays if not (default: 0.0)
    - moments: Moment[]        # locally scoped Moments
    - last_tick: int           # tick of last energy update
  constraints:
    - energy >= 0.0
    - weight >= 0.0
    - focus >= 0.0 and focus <= 1.0
    - uri must be unique across graph
```

### SSEEvent

```yaml
SSEEvent:
  required:
    - id: string               # monotonic event ID
    - event: string            # "delta" | "moment" | "place_removed" | "heartbeat"
    - data: JSON               # event payload
  relationships:
    - scoped_to: Playthrough
```

### VisualTransform

```yaml
VisualTransform:
  required:
    - node_id: string          # target graph node
    - opacity: float           # 0.0 to 1.0
    - scale: float             # size multiplier
    - pulse_rate: float        # animation speed
    - color_shift: float       # hue/saturation shift
    - alert_level: string      # "none" | "low" | "medium" | "high"
  constraints:
    - opacity >= 0.0 and opacity <= 1.0
    - scale > 0.0
    - pulse_rate >= 0.0
```

---

## ENTRY POINTS — The 4 DevBoard API Endpoints

| Endpoint | Method | File:Line | Triggered By | Purpose |
|----------|--------|-----------|--------------|---------|
| `/api/stream/:graph` | GET | `server.js:28` | Client `EventSource` connection (App.jsx:55) | SSE stream — pushes tick deltas to connected clients in real time |
| `/api/query` | POST | `server.js:58` | Client query input (App.jsx:140) | Runs a Cypher query against FalkorDB, returns nodes + links |
| `/api/tick` | POST | `server.js:79` | Client tick button/interval (App.jsx:88) | L1 physics tick — decay + propagation, emits delta via SSE |
| `/api/l2tick` | POST | `server.js:245` | Client L2 toggle + tick (App.jsx:88) | L2 tick — full 19-step cycle with citizen behavior selection |

### Supporting Endpoints (not core feedback loop but used by DevBoard)

| Endpoint | Method | File:Line | Purpose |
|----------|--------|-----------|---------|
| `/api/graphs` | GET | `server.js:50` | List available FalkorDB graphs |
| `/api/nodes/:graph` | GET | `server.js:153` | Raw node listing with time filter |
| `/api/citizens/:graph` | GET | `server.js:177` | Citizen state + top behavior scores |
| `/api/monitor/:graph` | GET | `server.js:214` | Dashboard: last tick + node/link/task counts |
| `/api/trace/:graph` | GET | `server.js:239` | Last N tick traces for debugging |

---

## DATA FLOW AND DOCKING (FLOW-BY-FLOW)

### SSE Stream Pipeline: Graph Delta to Client Visual

Explain what this flow covers: the complete path from physics tick completion through delta detection, salience filtering, Blood Ledger rendering, SSE emission, to client-side visual update. This is the primary real-time feedback path and the most critical flow in the module.

```yaml
flow:
  name: sse_stream_pipeline
  purpose: Push graph state changes to clients as visual transforms in real time
  scope: physics tick output → SSE → client render
  steps:
    - id: step_1
      description: "Client triggers tick via POST /api/tick or /api/l2tick"
      file: server.js
      function: "route handler at line 79 (L1) or line 245 (L2)"
      input: "{ graph: string }"
      output: tick result with decay/propagation counts
      trigger: "Client fetch (App.jsx:88) — manual button or interval timer"
      side_effects: energy decayed, energy propagated via FalkorDB Cypher
    - id: step_2
      description: "L1 tick: decay + propagation inline. L2 tick: delegates to runL2Tick()"
      file: "server.js (L1) / src/server/l2-tick.js (L2)"
      function: "inline Cypher (L1:97-111) / runL2Tick() (L2:16)"
      input: redis client, graph name
      output: "{ decayed, propagated, citizens[] (L2 only) }"
      trigger: step_1 route handler
      side_effects: "node energy mutated in FalkorDB, citizen behaviors dispatched (L2)"
    - id: step_3
      description: "[PROPOSED] Salience computed for changed nodes — NOT YET IMPLEMENTED"
      file: src/server/salience.js
      function: "computeSalience() — SKELETON"
      input: changed_nodes[], active_place_uri
      output: SalienceEntry[] with visibility flags
      trigger: "(future) called after energy mutation"
      side_effects: none (pure computation)
    - id: step_4
      description: "[PROPOSED] Blood Ledger renders visual transforms — NOT YET IMPLEMENTED"
      file: src/shared/blood-ledger/renderer.js
      function: "renderTransform() — NOT CREATED"
      input: SalienceEntry[]
      output: VisualTransform[]
      trigger: "(future) called after salience filtering"
      side_effects: none (pure computation)
    - id: step_5
      description: SSE emits tick event with full graph state to connected clients
      file: server.js
      function: "sseEmit() at line 18, called from tick handler at line 134 (L1) / line 261 (L2)"
      input: "graph name, 'tick' event, { nodes, links, deltas }"
      output: SSE event written to all connected Response objects
      trigger: called inline after tick completes (if SSE clients connected)
      side_effects: "eventCounter incremented, bytes written to HTTP connections"
  docking_points:
    guidance:
      include_when: significant state transformation, boundary crossing, risk of desynchronization
      omit_when: trivial pass-through, internal helper calls
      selection_notes: Focus on points where graph state crosses into visual domain and where SSE emission occurs — these are the desync risk points
    available:
      - id: dock_tick_input
        type: api
        direction: input
        file: server.js
        function: "POST /api/tick (line 79) and POST /api/l2tick (line 245)"
        trigger: "Client fetch from App.jsx:88"
        payload: "{ graph: string }"
        async_hook: not_applicable
        needs: none
        notes: "Entry point — if these endpoints fail, no feedback occurs. L1 tick is inline; L2 delegates to runL2Tick()"
      - id: dock_query_input
        type: api
        direction: input
        file: server.js
        function: "POST /api/query (line 58)"
        trigger: "Client fetch from App.jsx:140"
        payload: "{ graph: string, query: string }"
        async_hook: not_applicable
        needs: none
        notes: "Runs raw Cypher via GRAPH.QUERY — returns parsed nodes + links via parseGraphResult()"
      - id: dock_salience_output
        type: custom
        direction: output
        file: src/server/salience.js
        function: "computeSalience() — SKELETON, not yet wired"
        trigger: "(future) called per tick"
        payload: "SalienceEntry[]"
        async_hook: not_applicable
        needs: "implement and wire into server.js tick handlers"
        notes: "Pure function — not yet integrated. Currently salience filtering is absent: all nodes are emitted."
      - id: dock_sse_emission
        type: stream
        direction: output
        file: server.js
        function: "sseEmit() at line 18"
        trigger: "called from tick handler lines 134 (L1) and 261 (L2)"
        payload: "SSEEvent { id, event: 'tick', data: { nodes, links, deltas, decayed, propagated } }"
        async_hook: not_applicable
        needs: none
        notes: "Critical desync risk point — emits full graph state (not just deltas). If emission fails, try/catch falls back to tick result only."
      - id: dock_sse_connection
        type: api
        direction: input
        file: server.js
        function: "GET /api/stream/:graph (line 28)"
        trigger: "Client EventSource from App.jsx:55"
        payload: "{ graph: string (URL param) }"
        async_hook: not_applicable
        needs: none
        notes: "SSE endpoint — 15s heartbeat, connection tracked in sseClients Map. No Last-Event-ID replay yet."
    health_recommended:
      - dock_id: dock_tick_input
        reason: If tick events stop arriving, the entire feedback pipeline is dead
      - dock_id: dock_sse_emission
        reason: If SSE emission fails silently, the display desynchronizes from graph (V1 violation)
```

---

## LOGIC CHAINS

### LC1: Linter Error to Spatial Alert

**Purpose:** Demonstrates the complete path from a code event to a visual alert in the triage room (B1).

```
linter_error
  → graph.injectFriction(node, friction_amount)     # error becomes graph friction
    → physics_tick.propagate()                        # friction propagates to place://ui/triage
      → place-server.onTickComplete()                 # detects friction change
        → salience.computeSalience()                  # friction raises salience
          → renderer.renderTransform()                # salience → alert visual
            → sse-stream.emitDelta()                  # pushed to triage room clients
              → client renders spatial alert
```

**Data transformation:**
- Input: `LinterError` — file path, error message, severity
- After step 1: `GraphFriction` — friction value on node
- After step 2: `EnergyDelta` — propagated friction on triage Place node
- After step 3: `SalienceEntry` — high salience due to friction
- After step 4: `VisualTransform` — alert_level: "high", color_shift, pulse_rate
- Output: `SSEEvent` — visual alert data for client rendering

### LC2: Room Navigation

**Purpose:** Demonstrates spatial context bias when user changes rooms (B2).

```
user navigates to place://ui/manager
  → place-server.setActivePlace(playthrough_id, "place://ui/manager")
    → old Place focus set to 0.0 (will decay)
      → new Place focus set to 1.0 (energy injection begins)
        → next tick: salience recalculated with new focus values
          → SSE emits full delta with new salience landscape
```

---

## MODULE DEPENDENCIES

### Internal Dependencies

```
server.js (entry point — all 4 API endpoints)
    └── imports → src/server/l2-tick.js         (runL2Tick for /api/l2tick)
    └── imports → src/server/citizen-state.js   (getCitizenState for /api/citizens)
    └── imports → src/server/behavior-scorer.js (scoreBehaviors for /api/citizens)
src/server/l2-tick.js
    └── imports → citizen-state.js
    └── imports → behavior-scorer.js
    └── imports → target-selector.js
    └── imports → sentence-maker.js
    └── imports → task-continuity.js
    └── imports → action-dispatch.js
src/server/sse-stream.js
    └── imports → (no internal deps — skeleton, not wired)
```

### External Dependencies

| Package | Used For | Imported By |
|---------|----------|-------------|
| `express` | HTTP server, all API endpoint routing | `server.js` |
| `redis` (createClient) | FalkorDB connection via GRAPH.QUERY | `server.js` |
| `d3` | Force-directed graph visualization | `src/App.jsx` |

---

## STATE MANAGEMENT

### Where State Lives

| State | Location | Scope | Lifecycle |
|-------|----------|-------|-----------|
| SSE connection registry | `server.js:15` (`sseClients: Map<graph, Set<Response>>`) | process | Created on `GET /api/stream`, cleaned up on `req.close` |
| SSE event counter | `server.js:16` (`eventCounter`) | process | Monotonically increments per emitted event |
| Last tick result | `server.js:209` (`lastTickResult`) | process | Overwritten each L2 tick, exposed via `/api/monitor` |
| Tick history buffer | `server.js:210` (`tickHistory[]`) | process | Last 100 ticks, FIFO eviction |
| Node energy/weight/stability | FalkorDB graph | global | Mutated each tick via Cypher SET |
| Active Places map | NOT YET IMPLEMENTED (proposed: `place-server.js`) | — | PROPOSED |

### State Transitions

```
Place(inactive, focus=0.0) ──navigation──▶ Place(active, focus=1.0) ──navigation_away──▶ Place(inactive, focus decays)
```

```
SSEConnection(none) ──GET /api/stream──▶ SSEConnection(connected) ──disconnect──▶ SSEConnection(none)
```

---

## RUNTIME BEHAVIOR

### Initialization

```
1. server.js connects to Redis/FalkorDB (line 10-11)
2. Express app mounts all API endpoints
3. GET /api/stream/:graph ready to accept SSE connections (line 28)
4. POST /api/tick and /api/l2tick ready to accept tick triggers (lines 79, 245)
5. Server listens on API_PORT (default 3001, line 329)
```

### Main Loop / Request Cycle

```
L1 tick (/api/tick):
  1. Snapshot energy before tick (best-effort)
  2. Decay energy: SET n.energy = n.energy * 0.98 (line 97)
  3. Propagate energy: surplus flows through weighted links (line 102)
  4. Recency decay (line 110)
  5. If SSE clients connected: query full graph → sseEmit('tick', {nodes, links, deltas})

L2 tick (/api/l2tick):
  1. Delegates to runL2Tick(redis, graph) in l2-tick.js
  2. Steps 1-4: same propagation + decay
  3. Steps 5-12: reinforcement, consolidation, task scan/verify (deferred)
  4. Steps 13-17: per-citizen behavior cycle (score → select → target → sentence → dispatch)
  5. Steps 18-19: SSE emission + sync (deferred)
  6. If SSE clients connected: query full graph → sseEmit('tick', result)
```

### Shutdown

```
1. SSE connections auto-close when server process exits
2. Heartbeat intervals cleared on client disconnect (line 43-46)
3. No explicit flush — event buffer is in-memory only
```

---

## CONCURRENCY MODEL

| Component | Model | Notes |
|-----------|-------|-------|
| SSE stream (`sseEmit`) | sync write to all `Set<Response>` | Non-blocking but iterates all clients synchronously per emit |
| Tick handlers (`/api/tick`, `/api/l2tick`) | async (await Redis) | Sequential Cypher queries: snapshot → decay → propagate → query full graph → SSE emit |
| L2 citizen cycle | async serial per citizen | `for (citizenId of citizenIds)` — sequential, not parallel. Bottleneck with many citizens. |
| SSE connection lifecycle | async (event-driven) | `req.on('close')` cleans up. Heartbeat via `setInterval`. |

---

## CONFIGURATION

| Config | Location | Default | Description |
|--------|----------|---------|-------------|
| `DECAY_RATE` | `server.js:84` (L1), `src/server/l2-tick.js:14` (L2) | `0.02` | Energy decay coefficient per tick |
| `FALKORDB_HOST` | `server.js:10` (env) | `localhost` | Redis/FalkorDB host |
| `FALKORDB_PORT` | `server.js:10` (env) | `6379` | Redis/FalkorDB port |
| `API_PORT` | `server.js:328` (env) | `3001` | Server listen port |
| Heartbeat interval | `server.js:41` (hardcoded) | `15000` | SSE heartbeat keep-alive interval (ms) |
| Propagation threshold | `server.js:103` (hardcoded) | `0.3` | Minimum energy for a node to propagate surplus |
| `MAX_HISTORY` | `server.js:211` | `100` | Max tick traces retained for `/api/trace` |
| `VISIBILITY_THRESHOLD` | `src/server/salience.js` (PROPOSED) | `0.01` | Minimum salience for visibility — NOT YET IMPLEMENTED |

---

## BIDIRECTIONAL LINKS

### Code → Docs

Files that reference this documentation:

| File | Line | Reference |
|------|------|-----------|
| `src/server/sse-stream.js` | 8 | `@see docs/feedback/IMPLEMENTATION_Feedback.md` |

### Docs → Code

| Doc Section | Implemented In | Status |
|-------------|----------------|--------|
| ALGORITHM: SSE Stream Pipeline | `server.js:28` (`/api/stream/:graph`) — inline SSE with `sseEmit()` at line 18 | LIVE (inline, not extracted to sse-stream.js) |
| ALGORITHM: Energy Decay + Propagation | `server.js:79` (`/api/tick`) — decay at line 97, propagation at line 102 | LIVE |
| ALGORITHM: L2 Tick Cycle (19 steps) | `src/server/l2-tick.js:16` (`runL2Tick()`) — called by `/api/l2tick` | LIVE |
| ALGORITHM: Salience Calculation | `src/server/salience.js` — NOT YET IMPLEMENTED | PROPOSED |
| ALGORITHM: Room Energy Injection | `src/server/place-server.js` — NOT YET IMPLEMENTED | PROPOSED |
| BEHAVIOR B1 (linter → spatial alert) | Partial: tick propagates friction, SSE emits deltas. Missing: salience filter, Blood Ledger transform | PARTIAL |
| BEHAVIOR B2 (room navigation) | NOT YET IMPLEMENTED — no PlaceServer, no setActivePlace() | PROPOSED |
| VALIDATION V1 (display sync) | `server.js:116-143` — SSE emits full graph after tick for connected clients | PARTIAL |
| VALIDATION V1 | (no invariant test yet) | PROPOSED |

---

## EXTRACTION CANDIDATES

| Candidate | From | Lines | Trigger |
|-----------|------|-------|---------|
| SSE logic (sseClients, sseEmit, /api/stream handler) | `server.js:13-47` | ~35 | Extract to `src/server/sse-stream.js` when adding Last-Event-ID replay |
| L1 tick handler (decay, propagation, delta detection) | `server.js:79-150` | ~72 | Extract to `src/server/tick.js` when adding salience pipeline |
| `parseGraphResult()` | `server.js:273-326` | ~54 | Shared utility — used by tick, query, and l2tick handlers |

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:done SSE stream endpoint live at server.js:28 (GET /api/stream/:graph) -->
<!-- @mind:done Query endpoint live at server.js:58 (POST /api/query) -->
<!-- @mind:done L1 tick endpoint live at server.js:79 (POST /api/tick) -->
<!-- @mind:done L2 tick endpoint live at server.js:245 (POST /api/l2tick) -->
<!-- @mind:todo Extract inline SSE logic from server.js into src/server/sse-stream.js (currently skeleton) -->
<!-- @mind:todo Create place-server.js with PlaceServer class — active room tracking + energy injection -->
<!-- @mind:todo Implement salience.js with canonical salience formula (Weight × Energy × Focus) -->
<!-- @mind:todo Create blood-ledger/renderer.js with visual transform generation -->
<!-- @mind:todo Add Last-Event-ID reconnection replay to SSE endpoint (server.js:28) -->
<!-- @mind:proposition Consider shared salience constants module to prevent formula drift (V3) -->
<!-- @mind:escalation server.js is growing (~330 lines) — WATCH threshold. Extract tick handlers when salience is added. -->
