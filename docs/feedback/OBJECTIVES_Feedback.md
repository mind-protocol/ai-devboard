# OBJECTIVES — Feedback

```
STATUS: DRAFT
CREATED: 2026-03-15
VERIFIED: —
```

---

## CHAIN

```
THIS:            OBJECTIVES_Feedback.md (you are here - START HERE)
PATTERNS:       ./PATTERNS_Feedback.md
BEHAVIORS:      ./BEHAVIORS_Feedback.md
ALGORITHM:      ./ALGORITHM_Feedback.md
VALIDATION:     ./VALIDATION_Feedback.md
IMPLEMENTATION: ./IMPLEMENTATION_Feedback.md
SYNC:           ./SYNC_Feedback.md

IMPL:           src/server/place-server.js
```

**Read this chain in order before making changes.** Each doc answers different questions. Skipping ahead means missing context.

---

## PRIMARY OBJECTIVES (ranked)
1. Real-time graph-to-visual translation — the Blood Ledger renders graph state (pressure, energy, weight) into visual transforms across every surface (2D, Map, Chronicle, VR). If the graph changes, the display changes. No polling, no manual refresh. The visual IS the graph.
2. Spatial context bias — changing rooms changes working-memory focus. The active Place node receives energy injection each tick, biasing salience toward what's relevant in that room. Context is not selected by the user — it is shaped by where the user stands.
3. Zero-polling (SSE) — all real-time updates flow through Server-Sent Events (`GET /api/stream/{playthrough_id}`). No client polling. No WebSocket complexity. One persistent HTTP connection per playthrough, server pushes graph deltas as they occur.
4. Salience-driven filtering — what appears on screen is determined by `Salience = Weight × Energy × Focus`, not by recency or alphabetical order. High-salience items surface; low-salience items fade. The display is a living filter, not a static list.

## NON-OBJECTIVES
- Building a traditional dashboard with widgets and refresh buttons
- Providing raw graph data or debug views to end users
- Supporting multiple simultaneous SSE streams per client
- Replacing the Blood Ledger rendering engine — this module consumes it, does not rebuild it

## TRADEOFFS (canonical decisions)
- When display completeness conflicts with salience filtering, choose salience filtering. Users see what matters, not everything.
- When SSE simplicity conflicts with bidirectional communication needs, choose SSE. Commands go via REST; updates come via SSE. No WebSocket.
- We accept that Moments are invisible outside their Place to preserve spatial locality. Promotion to global Narrative is an explicit act.
- We accept energy injection bias toward the active room even though it means inactive rooms decay faster. Attention has a cost.

## SUCCESS SIGNALS (observable)
- Graph state change appears in the active Place's visual within one tick
- Changing rooms visibly shifts what content is foregrounded within one tick
- No HTTP polling requests observed in network traffic for state updates
- High-salience items are visually prominent; low-salience items are visually receded or hidden
- Linter failure produces a visible spatial alert in the triage room without manual intervention
