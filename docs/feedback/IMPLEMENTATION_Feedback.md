# Live Feedback — Implementation: Code Architecture and Structure

```
STATUS: PROPOSED
CREATED: 2026-03-15
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

IMPL:            src/server/place-server.js
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

---

## CODE STRUCTURE

```
src/
├── server/
│   ├── place-server.js          # Place node management, room state, energy injection
│   ├── sse-stream.js            # SSE endpoint, connection management, event buffering
│   ├── salience.js              # Salience calculation (weight × energy × focus)
│   └── index.js                 # Server entry point — mounts SSE endpoint
├── shared/
│   └── blood-ledger/
│       └── renderer.js          # Blood Ledger rendering cartridge — graph state → visual transforms
```

### File Responsibilities

| File | Purpose | Key Functions/Classes | Lines | Status |
|------|---------|----------------------|-------|--------|
| `src/server/place-server.js` | Place node lifecycle, active room tracking, energy injection per tick | `PlaceServer`, `injectEnergy()`, `setActivePlace()` | ~0 | PROPOSED |
| `src/server/sse-stream.js` | SSE endpoint handler, connection registry, event buffer, reconnection replay | `createSSEStream()`, `emitDelta()`, `replayFromId()` | ~0 | PROPOSED |
| `src/server/salience.js` | Salience formula, visibility threshold, focus computation | `computeSalience()`, `filterByThreshold()`, `computeFocus()` | ~0 | PROPOSED |
| `src/shared/blood-ledger/renderer.js` | Transforms salience entries into VisualTransform objects for client rendering | `renderTransform()`, `frictionToAlert()`, `energyToVisual()` | ~0 | PROPOSED |

**Size Thresholds:**
- **OK** (<400 lines): Healthy size, easy to understand
- **WATCH** (400-700 lines): Getting large, consider extraction opportunities
- **SPLIT** (>700 lines): Too large, must split before adding more code

> All files are PROPOSED — no code exists yet. Size will be tracked once implementation begins.

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

## ENTRY POINTS

| Entry Point | File:Line | Triggered By |
|-------------|-----------|--------------|
| SSE stream connection | `src/server/sse-stream.js:createSSEStream()` | Client HTTP GET to `/api/stream/{playthrough_id}` |
| Tick delta processing | `src/server/place-server.js:onTickComplete()` | Physics engine `tick_complete` event |
| Room navigation | `src/server/place-server.js:setActivePlace()` | Client navigation action via REST |

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
      description: Physics tick completes, emits tick_complete with changed node set
      file: src/server/index.js
      function: physics_tick_handler
      input: graph_state
      output: tick_complete event with changed_nodes[]
      trigger: physics tick interval
      side_effects: energy propagated, decay applied
    - id: step_2
      description: Place server receives tick_complete, injects energy into active Place
      file: src/server/place-server.js
      function: onTickComplete()
      input: tick_complete event, active_places map
      output: updated Place nodes with injected energy
      trigger: tick_complete event
      side_effects: active Place energy increased
    - id: step_3
      description: Salience computed for all changed nodes visible from active Place
      file: src/server/salience.js
      function: computeSalience()
      input: changed_nodes[], active_place_uri
      output: SalienceEntry[] with visibility flags
      trigger: called by place-server after energy injection
      side_effects: none (pure computation)
    - id: step_4
      description: Blood Ledger transforms salience entries into visual instructions
      file: src/shared/blood-ledger/renderer.js
      function: renderTransform()
      input: SalienceEntry[]
      output: VisualTransform[]
      trigger: called by place-server after salience filtering
      side_effects: none (pure computation)
    - id: step_5
      description: SSE stream emits delta event to all connected clients
      file: src/server/sse-stream.js
      function: emitDelta()
      input: VisualTransform[], playthrough_id
      output: SSE event written to client connections
      trigger: called by place-server after rendering
      side_effects: event buffer updated, bytes written to HTTP connections
  docking_points:
    guidance:
      include_when: significant state transformation, boundary crossing, risk of desynchronization
      omit_when: trivial pass-through, internal helper calls
      selection_notes: Focus on points where graph state crosses into visual domain and where SSE emission occurs — these are the desync risk points
    available:
      - id: dock_tick_input
        type: event
        direction: input
        file: src/server/place-server.js
        function: onTickComplete()
        trigger: tick_complete event
        payload: "{ changed_nodes: NodeRef[], tick_number: int }"
        async_hook: not_applicable
        needs: add event listener
        notes: Entry point — if this dock fails, no feedback occurs
      - id: dock_salience_output
        type: custom
        direction: output
        file: src/server/salience.js
        function: computeSalience()
        trigger: called per tick
        payload: "SalienceEntry[]"
        async_hook: not_applicable
        needs: none
        notes: Pure function — custom type because it is an internal computation boundary, not a standard IO type
      - id: dock_sse_emission
        type: stream
        direction: output
        file: src/server/sse-stream.js
        function: emitDelta()
        trigger: called per tick after rendering
        payload: "SSEEvent { id, event, data: VisualTransform[] }"
        async_hook: optional
        needs: none
        notes: Critical desync risk point — if emission fails, display diverges from graph
      - id: dock_sse_connection
        type: api
        direction: input
        file: src/server/sse-stream.js
        function: createSSEStream()
        trigger: "HTTP GET /api/stream/{playthrough_id}"
        payload: "{ playthrough_id: string, last_event_id?: string }"
        async_hook: not_applicable
        needs: none
        notes: Client entry point — must support reconnection via Last-Event-ID
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
place-server.js
    └── imports → salience.js
    └── imports → sse-stream.js
    └── imports → blood-ledger/renderer.js
sse-stream.js
    └── imports → (no internal deps)
salience.js
    └── imports → (no internal deps)
blood-ledger/renderer.js
    └── imports → (no internal deps)
```

### External Dependencies

| Package | Used For | Imported By |
|---------|----------|-------------|
| `express` | HTTP server, SSE endpoint routing | `src/server/index.js` |
| Graph engine (FalkorDB / in-memory) | Node/edge queries, shortest path | `src/server/place-server.js` |

---

## STATE MANAGEMENT

### Where State Lives

| State | Location | Scope | Lifecycle |
|-------|----------|-------|-----------|
| Active Places map | `place-server.js:activePlaces` | module | Created on first navigation, updated on room change, destroyed on playthrough end |
| SSE connection registry | `sse-stream.js:streams` | module | Created on client connect, destroyed on disconnect |
| Event replay buffer | `sse-stream.js:eventBuffer` | module | Grows with events, evicted when buffer cap reached |
| Place node energy/focus | Graph (FalkorDB / in-memory) | global | Lives in graph, updated each tick |

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
1. Server starts, mounts GET /api/stream/:playthrough_id endpoint
2. Place server initializes active places map (empty)
3. SSE stream manager initializes connection registry and event buffer
4. Place server subscribes to tick_complete events from physics engine
```

### Main Loop / Request Cycle

```
1. Physics tick completes → tick_complete event emitted
2. Place server injects energy into active Place
3. Salience computed for changed nodes
4. Blood Ledger generates visual transforms
5. SSE stream emits delta event to connected clients
```

### Shutdown

```
1. Close all SSE connections with retry: header
2. Unsubscribe from tick_complete events
3. Flush event buffer
```

---

## CONCURRENCY MODEL

| Component | Model | Notes |
|-----------|-------|-------|
| SSE stream | async (Node.js event loop) | Non-blocking writes to multiple connections per tick |
| Salience calculation | sync | Pure computation, runs within tick handler |
| Energy injection | sync | Graph mutation within tick handler — must complete before salience |

---

## CONFIGURATION

| Config | Location | Default | Description |
|--------|----------|---------|-------------|
| `VISIBILITY_THRESHOLD` | `src/server/salience.js` | `0.01` | Minimum salience for a node to be visible |
| `INJECTION_AMOUNT` | `src/server/place-server.js` | `0.1` | Energy injected into active Place per tick |
| `EVENT_BUFFER_SIZE` | `src/server/sse-stream.js` | `1000` | Maximum events retained for reconnection replay |
| `HEARTBEAT_INTERVAL_MS` | `src/server/sse-stream.js` | `15000` | Interval between SSE heartbeat events to keep connection alive |

---

## BIDIRECTIONAL LINKS

### Code → Docs

Files that reference this documentation:

| File | Line | Reference |
|------|------|-----------|
| (none yet — files are PROPOSED) | — | — |

### Docs → Code

| Doc Section | Implemented In |
|-------------|----------------|
| ALGORITHM: SSE Stream Pipeline | `src/server/sse-stream.js:createSSEStream()` |
| ALGORITHM: Salience Calculation | `src/server/salience.js:computeSalience()` |
| ALGORITHM: Room Energy Injection | `src/server/place-server.js:injectEnergy()` |
| BEHAVIOR B1 | `src/server/place-server.js:onTickComplete()` |
| BEHAVIOR B2 | `src/server/place-server.js:setActivePlace()` |
| VALIDATION V1 | (no test yet) |

---

## EXTRACTION CANDIDATES

No extraction candidates — all files are PROPOSED and not yet written.

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Create place-server.js with PlaceServer class -->
<!-- @mind:todo Create sse-stream.js with SSE endpoint and connection management -->
<!-- @mind:todo Create salience.js with canonical salience formula -->
<!-- @mind:todo Create blood-ledger/renderer.js with visual transform generation -->
<!-- @mind:proposition Consider shared salience constants module to prevent formula drift (V3) -->
<!-- @mind:escalation Blood Ledger renderer interface needs definition — what methods does it expose? -->
