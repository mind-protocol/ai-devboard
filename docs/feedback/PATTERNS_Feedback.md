# Live Feedback — Patterns: Places Are Real, Blood Ledger Renders, SSE Streams

```
STATUS: DRAFT
CREATED: 2026-03-15
VERIFIED: —
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Feedback.md
BEHAVIORS:      ./BEHAVIORS_Feedback.md
THIS:            PATTERNS_Feedback.md (you are here)
MECHANISMS:     (not applicable)
ALGORITHM:       ./ALGORITHM_Feedback.md
VALIDATION:      ./VALIDATION_Feedback.md
HEALTH:          ./HEALTH_Feedback.md
IMPLEMENTATION:  ./IMPLEMENTATION_Feedback.md
SYNC:            ./SYNC_Feedback.md

IMPL:            src/server/place-server.js
```

### Bidirectional Contract

**Before modifying this doc or the code:**
1. Read ALL docs in this chain first
2. Read the linked IMPL source file

**After modifying this doc:**
1. Update the IMPL source file to match, OR
2. Add a TODO in SYNC_Feedback.md: "Docs updated, implementation needs: {what}"
3. Run tests: `npm test -- --grep feedback`

**After modifying the code:**
1. Update this doc chain to match, OR
2. Add a TODO in SYNC_Feedback.md: "Implementation changed, docs need: {what}"
3. Run tests: `npm test -- --grep feedback`

---

## THE PROBLEM

UIs are traditionally disconnected from the system they observe. A dashboard polls an API, formats JSON into cards, and presents a stale snapshot. The user sees data, not state. They see listings, not salience. They see a frozen moment, not a living system.

Without this module, the graph computes energy, tension, and weight — but nobody sees it. State changes accumulate silently. A linter failure is a log line, not a spatial event. Context switching is a menu click, not a physical movement. The gap between the graph's reality and the user's perception grows with every tick.

The pain is desynchronization: the graph is alive but the interface is dead.

---

## THE PATTERN

**Places Are Real.** UIs are not dashboards — they are Space nodes (Places) in the graph. A triage room (`place://ui/triage`) is a node. A manager view (`place://ui/manager`) is a node. SYNC files are living chat rooms. Views and Protocols are Places too. Every surface the user sees is a first-class graph citizen with its own energy, edges, and moments.

**Blood Ledger as Rendering Cartridge.** The Blood Ledger takes graph state — pressure, energy, weight — and translates it into visual transforms. It is the rendering engine. It does not decide what to show; it decides how to show what the graph says is salient. It outputs to 2D, Map, Chronicle, and VR surfaces interchangeably.

**SSE Not Polling.** Real-time updates flow through a single SSE connection per playthrough (`GET /api/stream/{playthrough_id}`). The server pushes graph deltas. The client never asks "what changed?" — it is told.

**Salience Over Listing.** What appears is governed by `Salience = Weight × Energy × Focus`. This is not a sort order — it is a visibility threshold. Below-threshold items are not hidden in a collapsed section; they are visually receded, faded, or absent. The display is a salience field, not a list.

---

## BEHAVIORS SUPPORTED

- B1 — Places-as-nodes means linter errors inject friction into the graph, which SSE streams to the triage room as a spatial alert
- B2 — Spatial context bias works because changing rooms changes the active Place node, which changes energy injection, which changes Focus in the salience formula
- B3 — Energy pulses are visible because the Blood Ledger maps energy values to visual transforms each tick
- B4 — Moments stay local because they are children of a Place node; promotion to global Narrative is an explicit graph operation

## BEHAVIORS PREVENTED

- A1 — Polling loops prevented by SSE-only architecture; no client-initiated refresh path exists
- A2 — Context flooding prevented by salience filtering; changing rooms does not dump all data, it reshapes the salience field

---

## PRINCIPLES

### Principle 1: Places Are Real

A Place is not a view of the graph — it is a node in the graph. It has energy, edges, moments, and weight like any other node. When the user "opens the triage room," they are entering a Space node. When the triage room receives a linter error, that error is a Moment attached to that Place node. The UI is the graph is the UI.

This matters because it eliminates the view-model gap. There is no synchronization problem between "the data" and "the display" because they are the same structure.

### Principle 2: Blood Ledger as Rendering Cartridge

The Blood Ledger is a pluggable rendering engine that reads graph state and produces visual output. It does not own the data. It does not filter. It transforms. Pressure becomes color intensity. Energy becomes motion. Weight becomes size. The same graph state can render to 2D panels, geographic maps, chronological timelines, or VR environments — the Blood Ledger is the cartridge that determines the visual language.

This matters because it decouples what-to-show (the graph) from how-to-show (the renderer). New visual surfaces require a new cartridge, not a new data pipeline.

### Principle 3: Attention Is Spatial

Context is not selected from a menu — it is determined by position. The room you are in receives energy injection each tick. That energy biases the salience formula, making that room's content more prominent. Leave the room and its energy decays. This is not a metaphor — it is the actual energy propagation of the physics tick applied to UI navigation.

This matters because it makes context switching physical and intuitive. You do not "filter by project" — you walk into the project's room.

---

## DATA

| Source | Type | Purpose / Description |
|--------|------|-----------------------|
| Graph nodes (Place type) | GRAPH | Space nodes representing UI rooms, SYNC files, views |
| Blood Ledger renderer | MODULE | Transforms graph state (pressure/energy/weight) into visual output |
| SSE endpoint | API | `GET /api/stream/{playthrough_id}` — pushes graph deltas to clients |
| Physics tick | EVENT | Propagates energy, applies decay, triggers moment flips |

---

## DEPENDENCIES

| Module | Why We Depend On It |
|--------|---------------------|
| Blood Ledger (renderer) | Transforms graph pressure/energy/weight into visual output across surfaces |
| home_server (SSE endpoint) | Provides the `GET /api/stream/{playthrough_id}` real-time push channel |
| Physics tick engine | Propagates energy through graph, applies decay, injects energy into active Place |
| Graph (FalkorDB / in-memory) | Stores Place nodes, Moment nodes, edges, weights, energy values |

---

## INSPIRATIONS

Spatial computing interfaces where navigation IS context selection. The "desktop metaphor" taken literally — rooms instead of windows. Observability systems like Grafana, but inverted: instead of the user building queries, the graph pushes what's salient. MUD/MOO architectures where rooms are first-class objects with behavior. Christopher Alexander's pattern language — spaces shape behavior, not the other way around.

---

## SCOPE

### In Scope

- Place nodes as UI surfaces (triage room, manager view, SYNC chat rooms)
- SSE stream pipeline from graph to client
- Salience calculation and filtering
- Energy injection into active Place per tick
- Blood Ledger integration for visual transforms
- Moment locality (Place-scoped by default, promotable to Narrative)

### Out of Scope

- Blood Ledger renderer internals — see: blood-ledger module
- Physics tick engine — see: physics module
- Graph schema design — see: graph module
- Authentication and authorization for SSE streams — see: auth module
- VR-specific rendering optimizations — see: cities-of-light/client

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Define the exact Place node schema (fields, edges, constraints) -->
<!-- @mind:proposition Consider WebTransport as future SSE replacement for bidirectional needs -->
<!-- @mind:escalation Blood Ledger cartridge API not yet defined — need interface contract -->
