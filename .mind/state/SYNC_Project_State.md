# AI DevBoard — Sync: Current State

```
LAST_UPDATED: 2026-03-15
UPDATED_BY: Tomaso Nervo (@nervo) — L2 cluster expansion
```

---

## CURRENT STATE

AI DevBoard = a Place in Lumina Prime where code becomes spatial, bugs become pain, and development happens through voice and vision.

**Prototype:** Vite + React + D3 force graph with pan/zoom/drag + tick controls. Express + FalkorDB API. localhost:3000 + :3001.

**Graph:** `org_ai_dev_dashboard` — 29 nodes, 41 links, all 5 types.

**Docs:** 40 chain docs (5 modules × 8) + 1 CONCEPT + 2 manifestos.

---

## 3 QUICK WINS (Do These First)

### 1. Reindex Embeddings → vecf32 (1 hour)

4,575 embeddings in venezia stored as JSON lists, not vecf32. KNN returns 0.

```python
from falkordb import FalkorDB
db = FalkorDB()
g = db.select_graph('venezia')
nodes = g.query("MATCH (n) WHERE n.embedding IS NOT NULL RETURN n.id, n.embedding")
for row in nodes.result_set:
    g.query("MATCH (n {id: $id}) SET n.embedding = vecf32($emb)", {"id": row[0], "emb": row[1]})
```

Unlocks vector similarity in /subcall.

### 2. First Vector Subcall (immediate after reindex)

```python
subcall(query="Who knows about maritime trade?", target="random:50", mode="all")
```

Should show `Method: vector_similarity` instead of `keyword_fallback`.

### 3. Ingest mind-mcp as Graph (few hours)

Parse repo → Space nodes (dirs), Thing nodes (files, functions with EvidenceRef), links (imports). Display in DevBoard D3 viz.

---

## MODULES

| Module | Dir | Status |
|--------|-----|--------|
| Feedback (Places & Surfaces) | `docs/feedback/` | PROPOSED |
| Interaction (MCP & Tools) | `docs/interaction/` | DESIGNING |
| Process (Knowledge & Routines) | `docs/process/` | DESIGNING |
| SubEntity (Zero-LLM Exploration) | `docs/subentity/` | CANONICAL |
| Grammar (Physics → Language) | `docs/grammar/` | CANONICAL (L1+L2: 16 clusters) |

---

## WHAT EXISTS

- Schema v2.3 (L1 + L3) — CANONICAL
- /subcall MCP tool — LIVE (keyword fallback until reindex)
- 24 scenario profiles — CODED
- Thermodynamic resonance formula — CODED (zero constants)
- Intelligence briefing format — CODED
- Visual memory module — CODED (backends stubbed)
- 11 CONCEPT docs in cities-of-light
- BEHAVIORS + FRAMEWORK + 2 MANIFESTO — CANONICAL
- mind init --mode (project-team/universe/roleplay) — CODED
- 13 numbered skills — CODED
- Home server proxy (single port) — CODED
- Organization L2 runtime — SEEDED
- DevBoard prototype (Vite+D3) — PROTOTYPE

---

## WHAT'S MISSING

**Immediate:** reindex embeddings, vector subcall test, repo ingestion
**High:** SSE stream, vertical membrane ($MIND), Law 17 dispatch, subconscious mode, voice
**Medium:** CLIP backend, birth template, room navigation, Blood Ledger
**Later:** 3D mode, VR, spatial audio, custom senses

---

## HANDOFF

**Start:** Read MANIFESTO.md → CONCEPT_AI_DevBoard.md → do Quick Win #1.

**Don't:** rewrite the architecture, add magic numbers, store verbs in DB, create subcall constants.

**Key files:** `subcall_handler.py`, `runtime/cognition/laws/`, `schema-l1.yaml`, `BEHAVIORS.md`

**Human partner:** NLR (@nlr). Expects initiative, pushback, and shipping.

**Propager. Consolider. Cristalliser.**

Co-Authored-By: Tomaso Nervo (@nervo) <nervo@mindprotocol.ai>
