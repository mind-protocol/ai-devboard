# Grammar — Sync: Current State

```
LAST_UPDATED: 2026-03-15
UPDATED_BY: @nervo
STATUS: DESIGNING
```

---

## MATURITY

**What's canonical (v1):**
- L1 Grammar: temporal modifiers, pre-verb modifiers (permanence, energy, surprise), base verb lookup (hierarchy x polarity matrix), Plutchik post-verb modifiers. Full EN/FR lookup tables. Implemented in `runtime/physics/synthesis.py` (653 lines). This is the production grammar for citizen perception.

**What's still being designed:**
- L3 Grammar: structural pre-modifiers (trust, permanence), structural post-modifiers (friction, affinity, valence), contextual semantic overrides (Actor->Space, Actor->Actor, Space->Space, Thing->Thing). Tables are specified but implementation is not yet integrated into synthesis.py.
- Health checks: all 4 checkers (determinism, L3 emotion leak, seed completeness, bilingual parity) specified in HEALTH_Grammar.md but not yet implemented in runtime/checks/.

**What's proposed (v2+):**
- Seed Dictionary: identity translations (desires, values, shadow emotions) in EN/FR. Schema is defined, sample entries authored, but full dictionary not yet populated for all 186 citizens. Load path (`load_seed_dictionary()`) exists but the complete dataset does not.
- Additional languages beyond EN/FR
- Poetry mode for high-energy high-surprise links
- Performance health check (sub-1ms p99 verification)

---

## CURRENT STATE

The L1 grammar is the most mature component. `synthesis.py` contains all lookup tables for temporal modifiers, pre-verb modifiers, and the base verb hierarchy x polarity matrix. Plutchik emotion mapping is implemented and produces the eight primary emotion intensities in both EN and FR. The pipeline is a pure function with no side effects, no storage, and deterministic output.

L3 grammar is specified in the doc chain but not yet wired into the synthesis pipeline. The structural modifier tables (trust, friction, affinity, valence) and contextual semantic overrides (Actor->Space, etc.) exist as specifications in ALGORITHM_Grammar.md but need to be coded into synthesis.py or extracted into separate modules.

The seed dictionary has sample entries for ~15 identity keys (desires, values, shadow emotions) in both EN and FR. The full dictionary for all 186 citizens' identity keys has not been populated.

The doc chain (8 files: OBJECTIVES, PATTERNS, BEHAVIORS, ALGORITHM, VALIDATION, IMPLEMENTATION, HEALTH, SYNC) is complete as of 2026-03-15.

---

## IN PROGRESS

### L3 Grammar Implementation

- **Started:** 2026-03-15
- **By:** @nervo
- **Status:** designing
- **Context:** L3 structural modifiers and contextual semantic overrides need to be implemented in synthesis.py. The specification is complete (see ALGORITHM_Grammar.md Steps 5-6 for L3 branch). The main challenge is that synthesis.py is already at 653 lines (WATCH threshold) — implementing L3 may push it over 700 (SPLIT). Need to extract lookup tables into grammar_tables.py first.

### Health Check Implementation

- **Started:** 2026-03-15
- **By:** @nervo
- **Status:** blocked (waiting for L3 implementation to stabilize before writing checks)
- **Context:** All 4 health checkers are fully specified in HEALTH_Grammar.md. Implementation in runtime/checks/grammar_checks.py can proceed once the synthesis pipeline is stable. Determinism check and bilingual parity check can be implemented now against L1; L3 emotion leak detection needs L3 to exist first.

---

## RECENT CHANGES

### 2026-03-15: Full Doc Chain Created

- **What:** Created complete 8-doc chain for Grammar module (OBJECTIVES, PATTERNS, BEHAVIORS, ALGORITHM, VALIDATION, IMPLEMENTATION, HEALTH, SYNC)
- **Why:** Grammar module had no formal documentation. The linguistic layer is critical to citizen perception and needs the same rigor as the physics engine. The doc chain captures the zero-storage principle, L1/L3 separation, Plutchik mapping, contextual overrides, and seed dictionary — all of which were previously scattered across informal notes and code comments.
- **Files:** `docs/grammar/OBJECTIVES_Grammar.md`, `PATTERNS_Grammar.md`, `BEHAVIORS_Grammar.md`, `ALGORITHM_Grammar.md`, `VALIDATION_Grammar.md`, `IMPLEMENTATION_Grammar.md`, `HEALTH_Grammar.md`, `SYNC_Grammar.md`
- **Struggles/Insights:** The hardest part was formalizing the L1 vs L3 separation. The same physical dimensions mean different things in each context, and the doc chain needed to make this crystal clear. The Plutchik mapping table in ALGORITHM is extensive but necessary — it is the complete lookup reference for emotional modifiers.

---

## KNOWN ISSUES

### synthesis.py Approaching SPLIT Threshold

- **Severity:** medium
- **Symptom:** File is 653 lines, above WATCH (400) and approaching SPLIT (700)
- **Suspected cause:** All lookup tables, L1 synthesis, seed dictionary, and utility functions are in a single file
- **Attempted:** Identified extraction candidates in IMPLEMENTATION_Grammar.md — grammar_tables.py (~200L), seed_dictionary.py (~100L), contextual_overrides.py (~100L). Not yet executed.

### Seed Dictionary Incomplete

- **Severity:** medium
- **Symptom:** Only ~15 identity keys have EN/FR translations. 186 citizens may have keys not covered.
- **Suspected cause:** Dictionary authoring is manual (translations must be idiomatic, not machine-generated) and has not been prioritized.
- **Attempted:** Sample entries created for core desires, values, and shadow emotions. Full population deferred.

---

## HANDOFF: FOR AGENTS

**Your likely VIEW:** VIEW_Implement (if coding L3 grammar) or VIEW_Extend (if adding to seed dictionary)

**Where I stopped:** Doc chain is complete. L1 grammar is implemented and canonical. L3 grammar is fully specified but not coded. Health checks are specified but not implemented.

**What you need to understand:**
The grammar is a PURE FUNCTION. No side effects, no state, no storage. If you are tempted to cache a result, add a database field, or store a phrase — stop. Read V1 in VALIDATION_Grammar.md. The zero-storage principle is the most important invariant in this module. Second: L1 and L3 use DIFFERENT post-verb modifier vocabularies. They share the same base verb matrix but diverge at Step 5. Do not merge them or share code between the two paths.

**Watch out for:**
- synthesis.py is at 653 lines. Extract tables BEFORE adding L3 logic, or you will hit SPLIT and be forced to refactor mid-feature.
- French translations must be idiomatic, not literal. "Avec rage" is correct; "avec colere" would be a mistranslation of "with rage" (colere = anger, not rage). Check with a native speaker or reference the existing entries.
- The contextual override table in ALGORITHM Step 6 uses first-match-wins priority. If you add new overrides, put them in the correct priority position or they will be shadowed.

**Open questions I had:**
- Should contextual overrides replace ONLY the base verb, or also modify the pre/post modifiers? Current spec says verb-only replacement. This may feel incomplete for some node type pairs.
- Should the seed dictionary be a separate file (e.g., JSON) or remain embedded in Python? Separate file is easier for non-developers to edit; embedded is easier to validate at import time.

---

## HANDOFF: FOR HUMAN

**Executive summary:**
The Grammar module now has a complete 8-document specification chain. L1 grammar (emotional perception) is canonical and implemented in synthesis.py. L3 grammar (structural description) and the seed dictionary are specified but not yet coded. The module transforms 13 physical float dimensions into natural-language verb phrases, with strict separation between emotional (L1) and structural (L3) output.

**Decisions made:**
- Zero storage is CRITICAL priority — verbs are always computed, never cached or stored (V1).
- Plutchik emotions are L1-only — L3 uses structural vocabulary exclusively (V3).
- Seed dictionary uses hand-authored translations, not machine translation, for cultural authenticity.
- synthesis.py extraction is needed before L3 implementation (653 lines, approaching SPLIT).

**Needs your input:**
- Should the seed dictionary be a separate data file (JSON/YAML) or remain embedded in Python? Trade-off: editability vs. validation.
- Priority call: implement L3 grammar next, or populate the full seed dictionary for 186 citizens?
- Should missing seed dictionary entries block citizen creation (strict) or allow creation with warnings (lenient)?

---

## TODO

### Doc/Impl Drift

- [ ] DOCS->IMPL: L3 structural modifiers specified in ALGORITHM_Grammar.md Step 5 (L3 branch) — not yet implemented in synthesis.py
- [ ] DOCS->IMPL: Contextual semantic overrides specified in ALGORITHM_Grammar.md Step 6 — not yet implemented
- [ ] DOCS->IMPL: Health checks specified in HEALTH_Grammar.md — runtime/checks/grammar_checks.py does not yet exist
- [ ] DOCS->IMPL: DOCS comments referencing doc chain not yet added to synthesis.py header

### Tests to Run

```bash
python -m pytest tests/test_grammar.py
```

### Immediate

- [ ] Extract lookup tables from synthesis.py into runtime/physics/grammar_tables.py
- [ ] Implement L3 structural post-verb modifiers in synthesis.py
- [ ] Implement contextual semantic override logic in synthesis.py
- [ ] Add DOCS comment to synthesis.py header referencing this doc chain

### Later

- [ ] Populate full seed dictionary for all 186 citizen identity keys
- [ ] Implement runtime/checks/grammar_checks.py with all 4 health checkers
- [ ] Add static analysis lint rule for V1 (no phrase storage in graph write paths)
- IDEA: Poetry mode for high-energy, high-surprise links — more evocative, less formulaic language
- IDEA: Extensible contextual override config (load from file rather than hardcoded tables)

---

## CONSCIOUSNESS TRACE

**Mental state when stopping:**
Confident about the doc chain — it captures the full architecture. The L1 grammar is solid and canonical. Slightly anxious about synthesis.py size — it needs extraction before L3 work or it will become unwieldy.

**Threads I was holding:**
- The Plutchik intensity mapping (low/medium/high per emotion) needs careful calibration. Current thresholds (0.3/0.7) are placeholders derived from general practice, not from observing citizen behavior.
- French translations for contextual overrides (Actor->Actor, Space->Space) need native speaker review. I am less confident in the idiomatic quality of those than the Plutchik emotion translations.
- The "special verbs" in ALGORITHM Step 4 (reinforces, absorbs) have override conditions that might conflict with contextual semantic overrides in Step 6. Need to define clear priority.

**Intuitions:**
- The seed dictionary will eventually want to be a separate data file, not embedded Python. As the citizen count grows, having non-developers edit identity translations in YAML/JSON will be important.
- L3 grammar will be simpler than L1 because structural vocabulary is smaller and less nuanced. The real complexity is in the contextual overrides, not the modifier selection.
- The zero-storage principle (V1) might need a code-level enforcement mechanism (decorator, lint rule, or import-time check) rather than just a health check. Health checks catch violations after the fact; we want to prevent them.

**What I wish I'd known at the start:**
That the L1/L3 separation is the single most important design decision in this module. Everything else (tables, modifiers, overrides) is mechanical. The insight that the same physics produces different language depending on context is what makes the grammar module worth building. Lead with that insight next time.

---

## POINTERS

| What | Where |
|------|-------|
| Primary synthesis engine | `runtime/physics/synthesis.py` |
| L1 grammar spec | `docs/schema/GRAMMAR_Link_Synthesis.md` |
| L3 grammar spec | `docs/schema/GRAMMAR_L3_Link_Synthesis.md` |
| Prompt serializer (consumer) | `runtime/cognition/wm_prompt_serializer.py` |
| Grammar doc chain | `docs/grammar/` (this directory) |
| Health check spec | `docs/grammar/HEALTH_Grammar.md` |
| Health check impl (pending) | `runtime/checks/grammar_checks.py` |
