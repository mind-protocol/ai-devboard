# Live Feedback — Sync: Current State

```
LAST_UPDATED: 2026-03-15
UPDATED_BY: @arsenal_integration_engineer_15
STATUS: PARTIAL — 4 endpoints LIVE, salience/place/blood-ledger PROPOSED
```

---

## MATURITY

**What's canonical (v1):**
- 4 API endpoints live in `server.js`: `/api/stream/:graph` (SSE), `/api/query`, `/api/tick`, `/api/l2tick`
- L2 tick cycle live in `src/server/l2-tick.js` with 19-step architecture
- Frontend consumer in `src/App.jsx` wired to all 4 endpoints

**What's still being designed:**
- SSE stream pipeline architecture (ALGORITHM_Feedback.md)
- Salience formula and visibility threshold tuning
- Place node schema and graph integration
- Blood Ledger rendering cartridge interface
- Room energy injection mechanics

**What's proposed (v2+):**
- WebTransport as SSE alternative for bidirectional needs
- VR-specific rendering cartridge for spatial audio feedback
- Multi-client Place synchronization (multiple users in same playthrough viewing different rooms)
- Visual decay curve options (linear, exponential, stepped)

---

## CURRENT STATE

The 4 core DevBoard API endpoints are LIVE in `server.js`: SSE stream (GET `/api/stream/:graph`), Cypher query (POST `/api/query`), L1 tick (POST `/api/tick`), and L2 tick (POST `/api/l2tick`). Frontend (`src/App.jsx`) consumes all 4. The L2 tick cycle is implemented in `src/server/l2-tick.js`. IMPLEMENTATION doc pointers were broken (pointing to proposed files that don't exist) — fixed by @arsenal_integration_engineer_15. Still PROPOSED: `salience.js` (formula), `place-server.js` (PlaceServer class), `blood-ledger/renderer.js` (visual transforms).

---

## IN PROGRESS

### Doc chain creation

- **Started:** 2026-03-15
- **By:** @nervo
- **Status:** complete
- **Context:** Full 8-doc chain written covering OBJECTIVES, PATTERNS, BEHAVIORS, ALGORITHM, VALIDATION, IMPLEMENTATION, HEALTH, SYNC. Design is coherent and self-referencing. Ready for review before implementation begins.

---

## RECENT CHANGES

### 2026-03-15: Fix IMPL pointers — connect 4 live endpoints to doc chain

- **What:** Rewired IMPLEMENTATION_Feedback.md to point to actual code (`server.js`, `l2-tick.js`, `citizen-state.js`) instead of proposed-but-nonexistent files
- **Why:** IMPL pointers were broken — doc referenced `src/server/place-server.js` (doesn't exist) while the 4 endpoints live inline in `server.js` at the repo root
- **By:** @arsenal_integration_engineer_15
- **Files:** `docs/feedback/IMPLEMENTATION_Feedback.md`, `docs/feedback/SYNC_Feedback.md`
- **Sections updated:** IMPL chain header, CODE STRUCTURE, ENTRY POINTS (full rewrite with all 9 endpoints), BIDIRECTIONAL LINKS, DATA FLOW docking points, MODULE DEPENDENCIES, STATE MANAGEMENT, RUNTIME BEHAVIOR, CONCURRENCY MODEL, CONFIGURATION, EXTRACTION CANDIDATES, MARKERS

### 2026-03-15: Initial doc chain creation

- **What:** Created complete 8-doc chain for Live Feedback module
- **Why:** Need a rigorous design specification before writing code. The feedback module is the bridge between the graph (which computes) and the user (who sees). Getting the architecture right here prevents a rewrite later.
- **Files:** `docs/feedback/OBJECTIVES_Feedback.md`, `PATTERNS_Feedback.md`, `BEHAVIORS_Feedback.md`, `ALGORITHM_Feedback.md`, `VALIDATION_Feedback.md`, `IMPLEMENTATION_Feedback.md`, `HEALTH_Feedback.md`, `SYNC_Feedback.md`
- **Struggles/Insights:** The hardest design question is the Blood Ledger interface — it needs to be generic enough to support 2D, Map, Chronicle, and VR surfaces, but specific enough to produce meaningful visual transforms. Deferred to implementation phase. The salience formula (Weight * Energy * Focus) is elegant but the three factors may need different normalization — energy can be unbounded while focus is clamped to [0,1].

---

## KNOWN ISSUES

### Blood Ledger interface undefined

- **Severity:** medium
- **Symptom:** IMPLEMENTATION doc references `renderTransform()` but no interface contract exists
- **Suspected cause:** Blood Ledger module is owned by a different part of the system; interface needs cross-module design
- **Attempted:** Documented expected interface in ALGORITHM and IMPLEMENTATION; marked as escalation

### Salience factor normalization

- **Severity:** low
- **Symptom:** Weight and energy are unbounded positive floats; focus is [0,1]. The salience product may be dominated by whichever factor is largest.
- **Suspected cause:** No normalization step defined yet
- **Attempted:** Documented in ALGORITHM as open question; VISIBILITY_THRESHOLD partially addresses this

---

## HANDOFF: FOR AGENTS

**Your likely VIEW:** VIEW_Implement

**Where I stopped:** Design phase complete. All 8 docs written. No code exists.

**What you need to understand:**
The core insight is that UIs are graph nodes (Places), not views of graph nodes. This means the SSE stream does not "read the graph and format it" — it observes graph energy changes on Place nodes and emits deltas. The Blood Ledger is a rendering cartridge that transforms salience scores into visual properties. The salience formula `Weight * Energy * Focus` is the single source of truth for what is visible and how prominent it is.

**Watch out for:**
- Do not build a polling fallback. SSE with Last-Event-ID reconnection is the only path.
- Do not compute salience in multiple places. One function, one formula, one source of truth (V3).
- The physics tick must inject energy into the active Place — do not let the client request its own salience. The graph pushes; the client receives.

**Open questions I had:**
- Should the event buffer be time-bounded or count-bounded? Currently specified as count (1000 events).
- What happens when two clients in the same playthrough view different Places? Current design assumes one active Place per playthrough.
- How should salience factors be normalized to prevent energy domination?

---

## HANDOFF: FOR HUMAN

**Executive summary:**
Complete 8-doc design chain for the Live Feedback module has been written. The module defines how graph state becomes visual experience: Places as graph nodes, Blood Ledger as rendering engine, SSE for real-time push, salience (Weight * Energy * Focus) for filtering. No code exists yet — this is a design-first specification ready for review.

**Decisions made:**
- SSE over WebSocket (simpler, auto-reconnects, unidirectional push is sufficient)
- Salience = Weight * Energy * Focus as canonical formula
- Moments are local to Places by default; promotion to Narrative is explicit
- Energy injection of 0.1 per tick into active Place (tunable)
- Visibility threshold of 0.01 (tunable)

**Needs your input:**
- Blood Ledger rendering interface contract — what methods should it expose?
- Multi-client Place resolution — can different clients in the same playthrough view different rooms?
- Salience factor normalization strategy — should we normalize energy to [0,1] before computing salience?

---

## TODO

### Doc/Impl Drift

- [x] DOCS→IMPL: IMPL pointers fixed — 4 live endpoints connected to doc chain
- [ ] DOCS→IMPL: `sse-stream.js` is a skeleton stub — actual SSE logic is inline in `server.js`
- [ ] DOCS→IMPL: `salience.js`, `place-server.js`, `blood-ledger/renderer.js` still PROPOSED

### Tests to Run

```bash
# No tests yet — module is PROPOSED
npm test -- --grep feedback
```

### Immediate

- [ ] Review doc chain for design coherence
- [ ] Define Blood Ledger renderer interface contract
- [ ] Create `src/server/salience.js` with canonical formula
- [ ] Create `src/server/sse-stream.js` with SSE endpoint
- [ ] Create `src/server/place-server.js` with Place management and energy injection

### Later

- [ ] Implement Blood Ledger rendering cartridge
- [ ] Build SSE reconnection with Last-Event-ID replay
- [ ] Tune VISIBILITY_THRESHOLD and INJECTION_AMOUNT empirically
- [ ] Implement health checkers once pipeline code exists
- IDEA: Spatial audio feedback tied to energy pulses — audible heartbeat of the graph

---

## CONSCIOUSNESS TRACE

**Mental state when stopping:**
Confident in the design architecture. The Places-as-nodes insight is solid — it eliminates the view-model synchronization problem entirely. The salience formula is clean but may need normalization work. The SSE pipeline is straightforward. The Blood Ledger interface is the biggest unknown.

**Threads I was holding:**
- How does the Blood Ledger handle different output surfaces (2D vs VR) with the same salience input?
- The event buffer eviction policy needs to balance memory use against reconnection reliability
- Focus decay rate when leaving a room — should it match the physics decay rate (0.02) or be independent?

**Intuitions:**
- The salience formula will need a log transform or normalization pass before it feels right visually
- The triage room should probably have a baseline weight higher than other Places — it is the default attention sink
- Heartbeat events on the SSE stream will be essential for connection health detection

**What I wish I'd known at the start:**
The Blood Ledger is not just a renderer — it is a translation layer between graph semantics and visual semantics. Defining its interface is as important as defining the graph schema. Should have started there.

---

## POINTERS

| What | Where |
|------|-------|
| Objectives | `docs/feedback/OBJECTIVES_Feedback.md` |
| Patterns | `docs/feedback/PATTERNS_Feedback.md` |
| Behaviors | `docs/feedback/BEHAVIORS_Feedback.md` |
| Algorithm | `docs/feedback/ALGORITHM_Feedback.md` |
| Validation | `docs/feedback/VALIDATION_Feedback.md` |
| Implementation | `docs/feedback/IMPLEMENTATION_Feedback.md` |
| Health | `docs/feedback/HEALTH_Feedback.md` |
| Physics tick engine | `.mind/mind/physics/` |
| Server entry point (all 4 endpoints) | `server.js` |
| L2 tick cycle | `src/server/l2-tick.js` |
| Frontend (SSE consumer + tick/query UI) | `src/App.jsx` |
