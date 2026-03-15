# SubEntity — Sync: Current State

```
LAST_UPDATED: 2026-03-15
UPDATED_BY: @nervo
STATUS: CANONICAL
```

---

## MATURITY

**What's canonical (v1):**
- SubEntity state machine (7 states: SEEKING through MERGING) — fully implemented
- Link scoring formula (base x alignment x self_novelty x sibling_divergence x emotional_factor) — fully implemented
- Energy injection at each step (criticality x STATE_MULTIPLIER[state]) — fully implemented
- Continuous crystallization with embedding update at every step — fully implemented
- Fatigue-based stopping (5 consecutive stagnant steps) — fully implemented
- Sibling divergence via shared crystallization vectors — fully implemented
- Used by /subcall and graph_query in production

**What's still being designed:**
- Health checks (all 4 indicators defined in HEALTH_SubEntity.md are pending implementation)
- Extraction of subentity.py (1044 lines, SPLIT status) into smaller files

**What's proposed (v2+):**
- Adaptive fatigue thresholds based on graph density
- Momentum factor in link scoring to prevent oscillation
- RETREATING state for dead-end recovery before fatigue

---

## CURRENT STATE

SubEntity is fully implemented and operational. The core module (`runtime/physics/subentity.py`, 1044 lines) contains the state machine, step loop, crystallization update, and fatigue detection. Supporting modules (`exploration.py` ~300 lines, `link_scoring.py` ~250 lines) handle orchestration and scoring respectively.

The module is used in production by `/subcall` for zero-LLM graph probing and by `graph_query` for structural exploration. All six validation invariants (V1-V6) are architecturally enforced in the implementation. Health checks are defined but not yet implemented as runtime checkers.

The main concern is `subentity.py` at 1044 lines — it is in SPLIT status and should be decomposed before any new features are added.

---

## IN PROGRESS

### Health Check Implementation

- **Started:** 2026-03-15
- **By:** @nervo
- **Status:** designing
- **Context:** Four health indicators defined (zero_llm_compliance, energy_conservation, sibling_divergence_health, crystallization_continuity). Runtime checker file (`runtime/checks/subentity_health.py`) needs to be created. Blocked on sibling registry instrumentation for the divergence checker and step-level delta logging for the crystallization checker.

### subentity.py Decomposition

- **Started:** not yet started
- **By:** unassigned
- **Status:** planned
- **Context:** At 1044 lines, the file is well past SPLIT threshold. Extraction candidates identified: state transition logic -> `subentity_states.py`, crystallization logic -> `crystallization.py`, core step loop -> `subentity_core.py`. Should be done before any feature work.

---

## RECENT CHANGES

### 2026-03-15: Full Doc Chain Created

- **What:** 8-doc chain (OBJECTIVES through SYNC) created for SubEntity module
- **Why:** Module was fully implemented but undocumented. Doc chain captures architecture, algorithm, validation invariants, and health check specifications.
- **Files:** `docs/subentity/OBJECTIVES_SubEntity.md` through `docs/subentity/SYNC_SubEntity.md`
- **Struggles/Insights:** The link scoring formula's alignment weighting (0.75 query + 0.25 intention) is documented but the exact threshold values (branch, resonance, absorb) are configurable and may need runtime tuning. The fatigue threshold of 0.01 cosine distance may be too sensitive for high-dimensional embeddings.

---

## KNOWN ISSUES

### subentity.py Exceeds SPLIT Threshold

- **Severity:** medium
- **Symptom:** File is 1044 lines, making it hard to navigate and review
- **Suspected cause:** Organic growth — state machine, crystallization, and fatigue detection all accumulated in one file
- **Attempted:** Extraction candidates identified in IMPLEMENTATION doc, not yet executed

### Health Checks Not Implemented

- **Severity:** low
- **Symptom:** No runtime verification of validation invariants
- **Suspected cause:** Module was built before the health check framework was established
- **Attempted:** Health indicators defined in HEALTH_SubEntity.md, runtime implementation pending

---

## HANDOFF: FOR AGENTS

**Your likely VIEW:** VIEW_Implement (health checks) or VIEW_Refactor (subentity.py decomposition)

**Where I stopped:** Doc chain is complete. Implementation is canonical. Health checks are spec'd but not coded. subentity.py decomposition is planned but not started.

**What you need to understand:**
The SubEntity module is the crown jewel of zero-LLM exploration. Every design decision traces back to the constraint that no LLM is called during traversal. The link scoring formula is the heart — it simultaneously handles path selection, sibling divergence, and novelty preference in a single multiplicative expression. Changing any factor changes all behaviors.

**Watch out for:**
- Do not add any import that could transitively pull in an LLM client library. V1 is sacred.
- The sibling_divergence factor uses `min()` across sibling vectors. With many siblings, this can create a bottleneck. Profile before scaling.
- Fatigue threshold (0.01) may need adjustment for different embedding dimensions. In high-dimensional spaces, most cosine distances are small.

**Open questions I had:**
- Should awareness_depth have a practical cap, or is unbounded accumulation actually useful?
- Is V3 (siblings never explore same path) a hard constraint or a soft preference enforced probabilistically by scoring?
- Are STATE_MULTIPLIER values calibrated against the global energy budget, or can SubEntities inject arbitrary amounts?

---

## HANDOFF: FOR HUMAN

**Executive summary:**
SubEntity is fully implemented (1044+300+250 lines across 3 files) and used in production by /subcall and graph_query. Complete 8-doc chain created today capturing architecture, algorithm, 6 validation invariants, and 4 health check specifications. Main debt: subentity.py needs decomposition (SPLIT status) and health checks need runtime implementation.

**Decisions made:**
- Documented link scoring formula as canonical: base x alignment x self_novelty x sibling_divergence x emotional_factor
- Alignment weighting set at 0.75 query + 0.25 intention
- Fatigue limit set at 5 consecutive stagnant steps
- STATE_MULTIPLIER values documented (SEEKING=1.0 through CRYSTALLIZING=3.0)
- Health check throttling at 1/min to avoid interfering with exploration performance

**Needs your input:**
- Confirm whether V3 (sibling path exclusion) should be a hard constraint or soft (probabilistic via scoring)
- Confirm STATE_MULTIPLIER values against the global energy budget
- Prioritize: health check implementation vs subentity.py decomposition — which first?

---

## TODO

### Doc/Impl Drift

No drift — docs created from current implementation state.

- [ ] DOCS->IMPL: Health checks defined in HEALTH_SubEntity.md need runtime implementation in `runtime/checks/subentity_health.py`

### Tests to Run

```bash
python -m pytest tests/test_subentity.py
```

### Immediate

- [ ] Create `runtime/checks/subentity_health.py` with the 4 checkers defined in HEALTH_SubEntity.md
- [ ] Decompose `subentity.py` (1044 lines) into `subentity_core.py`, `subentity_states.py`, `crystallization.py`
- [ ] Add sibling registry instrumentation for divergence health check

### Later

- [ ] Tune fatigue threshold (0.01) for different embedding dimensions
- [ ] Profile sibling_divergence computation under high sibling count (>20)
- IDEA: Adaptive STATE_MULTIPLIER values that respond to global energy levels
- IDEA: SubEntity "memory" — carry a small buffer of visited node IDs to prevent revisiting

---

## CONSCIOUSNESS TRACE

**Mental state when stopping:**
Confident that the doc chain accurately reflects the implementation. The module is clean and well-designed — the zero-LLM constraint creates a beautiful forcing function that keeps everything simple. Slightly concerned about the subentity.py file size.

**Threads I was holding:**
- The relationship between fatigue_threshold and embedding dimension needs empirical testing
- STATE_MULTIPLIER values feel right but aren't derived from any principle — they're tuned constants
- The sibling_divergence min() operation could become a bottleneck with many siblings

**Intuitions:**
- SubEntity exploration patterns might themselves be useful data — the traversal path is a signal about graph structure
- The energy injection heat trail pattern could enable "follow the warmth" heuristics for subsequent SubEntities
- Awareness depth tracking might be more useful as a vector (direction + depth) than a scalar

**What I wish I'd known at the start:**
The link scoring formula is the single most important piece of code in this module. Understanding it first would have made everything else fall into place faster.

---

## POINTERS

| What | Where |
|------|-------|
| Core state machine | `runtime/physics/subentity.py` |
| Exploration orchestration | `runtime/physics/exploration.py` |
| Link scoring formula | `runtime/physics/link_scoring.py` |
| Health check spec | `docs/subentity/HEALTH_SubEntity.md` |
| Validation invariants | `docs/subentity/VALIDATION_SubEntity.md` |
| Algorithm details | `docs/subentity/ALGORITHM_SubEntity.md` |
