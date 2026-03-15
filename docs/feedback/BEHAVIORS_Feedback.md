# Live Feedback — Behaviors: Graph State Becomes Spatial Experience

```
STATUS: DRAFT
CREATED: 2026-03-15
VERIFIED: —
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Feedback.md
THIS:            BEHAVIORS_Feedback.md (you are here)
PATTERNS:        ./PATTERNS_Feedback.md
MECHANISMS:      (not applicable)
ALGORITHM:       ./ALGORITHM_Feedback.md
VALIDATION:      ./VALIDATION_Feedback.md
HEALTH:          ./HEALTH_Feedback.md
IMPLEMENTATION:  ./IMPLEMENTATION_Feedback.md
SYNC:            ./SYNC_Feedback.md

IMPL:            src/server/place-server.js
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

---

## BEHAVIORS

> **Naming:** Name behaviors by observable result, not by concept.

### B1: Linter Error Appears as Spatial Alert in Triage Room

**Why:** A linter failure is not a log line — it is a graph event. When a linter fails, friction is injected into the graph at the relevant node. That friction propagates to the triage room Place node. The SSE stream picks up the energy change. The Blood Ledger renders it as a visual alert in the triage room. The user does not check logs — the room tells them something is wrong.

```
GIVEN:  A linter runs and produces an error
WHEN:   The linter error is recorded as friction on the relevant graph node
THEN:   The friction propagates to place://ui/triage via graph edges
AND:    The SSE stream emits the energy delta to connected clients
AND:    The Blood Ledger renders the friction as a visual alert (color shift, pulse, spatial marker)
```

### B2: Changing Room Shifts Working Memory Focus

**Why:** Context is spatial, not manual. When a user moves from one Place to another, the physics tick begins injecting energy into the new active Place and stops injecting into the old one. The old room's content decays; the new room's content gains salience. Working memory is not a selection — it is a consequence of position.

```
GIVEN:  A user is viewing place://ui/triage (active Place)
WHEN:   The user navigates to place://ui/manager
THEN:   Energy injection shifts from place://ui/triage to place://ui/manager
AND:    Salience of place://ui/manager content increases within one tick
AND:    Salience of place://ui/triage content begins to decay
```

### B3: Energy Pulses Visible on Each Tick

**Why:** The physics tick is not invisible infrastructure — it is a heartbeat the user can feel. Each tick propagates energy through graph edges, and the Blood Ledger translates energy values into visual transforms: brightness, motion, size, opacity. A node with high energy pulses visibly. A decaying node fades. The user sees the system breathe.

```
GIVEN:  The physics tick runs and propagates energy through graph edges
WHEN:   Energy values change on nodes visible in the active Place
THEN:   The SSE stream emits the updated energy values
AND:    The Blood Ledger applies visual transforms proportional to energy levels
AND:    The user observes pulsing, brightness, or motion corresponding to energy state
```

### B4: Moments Are Local Until Promoted

**Why:** A Moment (a state flip, an insight, a conflict) belongs to the Place where it occurred. It does not pollute other rooms. If a Moment in the triage room matters to the whole system, it must be explicitly promoted to a global Narrative. This preserves spatial locality — each room is its own context, not a firehose of everything happening everywhere.

```
GIVEN:  A Moment is created in place://ui/triage
WHEN:   No explicit promotion action is taken
THEN:   The Moment is visible only within place://ui/triage
AND:    Other Places (place://ui/manager, etc.) do not display this Moment
AND:    The Moment remains attached as a child node of place://ui/triage in the graph
```

---

## OBJECTIVES SERVED

| Behavior ID | Objective | Why It Matters |
|-------------|-----------|----------------|
| B1 | Real-time graph-to-visual translation | Proves the graph-to-visual pipeline works end-to-end: friction in → alert out |
| B2 | Spatial context bias | Demonstrates that position determines focus, not manual filtering |
| B3 | Real-time graph-to-visual translation | Makes the physics tick visible — the system's heartbeat is perceptible |
| B4 | Salience-driven filtering | Ensures spatial locality — content stays where it belongs unless promoted |

---

## INPUTS / OUTPUTS

### Primary Function: `streamPlaceState()`

**Inputs:**

| Parameter | Type | Description |
|-----------|------|-------------|
| playthrough_id | string | Identifies the active playthrough / session |
| active_place_uri | string | URI of the Place node receiving focus (e.g., `place://ui/triage`) |
| graph_state | GraphSnapshot | Current graph node/edge state including energy, weight, friction |

**Outputs:**

| Return | Type | Description |
|--------|------|-------------|
| sse_event | SSEEvent | Server-sent event containing graph deltas for the active Place |

**Side Effects:**

- Energy injected into active Place node each tick
- Previous active Place loses energy injection (begins decay)
- SSE connection held open for duration of session

---

## EDGE CASES

### E1: No Active Place Selected

```
GIVEN:  A client connects to the SSE stream but has not navigated to any Place
THEN:   No energy injection occurs; stream emits global-level events only
```

### E2: Place Node Deleted While Active

```
GIVEN:  A user is viewing a Place that is removed from the graph
THEN:   SSE stream emits a place_removed event
AND:    Client falls back to a default Place (place://ui/triage)
```

### E3: Moment Promoted During Active View

```
GIVEN:  A user is viewing a Place where a Moment exists
WHEN:   That Moment is promoted to a global Narrative
THEN:   The Moment remains visible in the current Place
AND:    The Moment also becomes visible in all other Places that display Narrative-level content
```

### E4: SSE Connection Drops

```
GIVEN:  The SSE connection between client and server is lost
THEN:   Client reconnects automatically using Last-Event-ID
AND:    Server replays missed events from the event buffer
```

---

## ANTI-BEHAVIORS

What should NOT happen:

### A1: Client Polls for State Updates

```
GIVEN:   SSE stream is available
WHEN:    Graph state changes
MUST NOT: Client sends HTTP requests asking "what changed?"
INSTEAD:  Server pushes delta via SSE stream
```

### A2: Moments Leak Across Places

```
GIVEN:   A Moment is created in place://ui/triage
WHEN:    A user is viewing place://ui/manager
MUST NOT: The Moment appears in place://ui/manager without explicit promotion
INSTEAD:  The Moment remains scoped to place://ui/triage
```

### A3: Raw Graph Data Exposed to User

```
GIVEN:   The Blood Ledger renders graph state
WHEN:    Energy, weight, and friction values are transmitted
MUST NOT: Node IDs, raw edge weights, or debug labels appear in the visual output
INSTEAD:  Blood Ledger translates values into visual transforms (color, size, motion, opacity)
```

### A4: Context Determined by Menu Selection

```
GIVEN:   A user wants to focus on a different area
WHEN:    They want to change context
MUST NOT: A dropdown, filter panel, or settings menu determines what's shown
INSTEAD:  The user navigates to a different Place, and energy injection shifts focus spatially
```

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Define SSE reconnection protocol and event buffer size -->
<!-- @mind:proposition Consider visual decay curve options (linear, exponential, stepped) for B2 -->
<!-- @mind:escalation What happens when two clients view different Places in the same playthrough? -->
