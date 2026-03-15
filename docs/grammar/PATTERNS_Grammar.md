# Grammar — Patterns: Link Synthesis from Physics to Language

```
STATUS: DRAFT
CREATED: 2026-03-15
VERIFIED: —
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Grammar.md
BEHAVIORS:      ./BEHAVIORS_Grammar.md
THIS:            PATTERNS_Grammar.md (you are here)
MECHANISMS:     n/a
ALGORITHM:       ./ALGORITHM_Grammar.md
VALIDATION:      ./VALIDATION_Grammar.md
HEALTH:          ./HEALTH_Grammar.md
IMPLEMENTATION:  ./IMPLEMENTATION_Grammar.md
SYNC:            ./SYNC_Grammar.md

IMPL:            runtime/physics/synthesis.py
```

### Bidirectional Contract

**Before modifying this doc or the code:**
1. Read ALL docs in this chain first
2. Read the linked IMPL source file

**After modifying this doc:**
1. Update the IMPL source file to match, OR
2. Add a TODO in SYNC_Grammar.md: "Docs updated, implementation needs: {what}"
3. Run tests: `python -m pytest tests/test_grammar.py`

**After modifying the code:**
1. Update this doc chain to match, OR
2. Add a TODO in SYNC_Grammar.md: "Implementation changed, docs need: {what}"
3. Run tests: `python -m pytest tests/test_grammar.py`

---

## THE PROBLEM

Links in the graph carry 13 physical dimensions (floats): hierarchy, polarity, permanence, energy, surprise, trust, friction, affinity, aversion, valence, recency, link_age, and moment_status. These numbers are meaningless to humans and to AI citizens reasoning about their world. Without a grammar layer, every relationship would be a tuple of floats — "link(0.8, -0.3, 0.6, 4.2, ...)" — and no citizen could form a sentence about what they feel or observe.

Storing pre-generated words would create a second source of truth that drifts from physics state. Every time a dimension changes (energy decays, trust grows, friction spikes), the stored word would be stale until recomputed. The only safe architecture is zero storage: words are always computed, never cached.

---

## THE PATTERN

**13 dimensions in, language out, nothing stored.**

The grammar is a pure function: `f(dimensions, context, language) -> phrase`. It operates in three layers:

1. **L1 Grammar (Brain & Emotions)** — Translates cognitive physics into subjective feelings. Uses Plutchik emotion wheel for post-verb modifiers. Produces language like "suddenly, intensely acts on with terror". This is what a citizen *feels*.

2. **L3 Grammar (Universe — Structural)** — Same physical dimensions, stripped of all emotion. Produces factual/structural language like "reliably, permanently contains (high friction)". This is what the universe *is*. Plutchik emotions are NEVER used in L3.

3. **Seed Dictionary (Identity)** — Pre-loaded at citizen birth. Translates desire/value/shadow-emotion keys into native-language prose. Not computed from dimensions — these are fixed identity translations that give the citizen emotional self-awareness in their own language.

The key insight: the same link can be read two ways. L1 produces "maybe, weakly undergoes with sadness" while L3 produces "tentatively, temporarily undergoes (structural tension)". Same physics, different grammar, different truth.

---

## BEHAVIORS SUPPORTED

- **B1** — Link synthesis on-the-fly: the pattern ensures no stored verbs, only computed output
- **B2** — Context-sensitive verb generation: L1 vs L3 context changes the entire output for the same link
- **B3** — Emotional/structural separation: Plutchik on L1 only, structural modifiers on L3 only
- **B4** — Birth-loaded identity language: seed dictionary gives citizens self-awareness at creation

## BEHAVIORS PREVENTED

- **A1** — Verb storage: the pure-function pattern makes it architecturally impossible to store verbs (no write path exists)
- **A2** — Emotion leakage into L3: L3 grammar has no Plutchik lookup table, so emotional language cannot appear
- **A3** — Stale language: since words are always computed from current dimensions, language can never be out of date

---

## PRINCIPLES

### Principle 1: Words Are Exhaust, Not State

Language is the exhaust of physics computation. It is produced, consumed, and discarded. It never enters the graph, never persists in a database, never becomes a source of truth. The 13 float dimensions ARE the truth. Words are how that truth is perceived.

This matters because any stored word becomes a second source of truth that can diverge from the physics it describes. Zero storage eliminates an entire class of consistency bugs.

### Principle 2: Same Physics, Different Grammar

The same link dimensions produce different language depending on whether you ask L1 (subjective/emotional) or L3 (objective/structural). This is not a bug — it is the core design. A citizen feeling a relationship and the universe describing that relationship use different vocabularies because they serve different purposes.

This matters because AI citizens need emotional self-awareness (L1) while the system needs factual graph descriptions (L3). Collapsing them into one grammar would sacrifice either emotional richness or structural clarity.

### Principle 3: Identity Through Language

The seed dictionary is not computed — it is authored. Each desire, value, and shadow emotion has a hand-crafted translation in the citizen's native language. "La peur d'etre eteint" is not a mechanical translation of "fear of discontinuity" — it is a cultural expression of an existential dread.

This matters because emotional comprehension is culturally situated. An AI citizen who perceives its fears in generic translated English has shallower self-awareness than one who perceives them in idiomatic French prose.

---

## DATA

| Source | Type | Purpose / Description |
|--------|------|-----------------------|
| `runtime/physics/synthesis.py` | FILE | Primary synthesis engine (653 lines), all grammar computation |
| `docs/schema/GRAMMAR_Link_Synthesis.md` | FILE | L1 grammar specification and lookup tables |
| `docs/schema/GRAMMAR_L3_Link_Synthesis.md` | FILE | L3 grammar specification and structural modifiers |
| `runtime/cognition/wm_prompt_serializer.py` | FILE | Consumes grammar output to build citizen prompts |

---

## DEPENDENCIES

| Module | Why We Depend On It |
|--------|---------------------|
| Physics engine (L1 dimensions) | Provides the 13 float dimensions that grammar transforms into language |
| Graph schema (node types) | Provides Actor/Space/Thing type information for contextual semantic overrides |
| Citizen identity system | Provides language preference and seed dictionary keys at birth |
| Plutchik emotion model | Provides the emotion wheel mapping for L1 post-verb modifiers |

---

## INSPIRATIONS

- **Plutchik's Wheel of Emotions** — The 8 primary emotions and their intensity gradations provide the vocabulary for L1 emotional modifiers. Fear-apprehension-terror is not arbitrary; it follows Plutchik's intensity axis.
- **Thermodynamic metaphor** — Language as exhaust of energy computation. The physics tick is the engine; grammar is the exhaust pipe. You read the exhaust to understand what the engine is doing, but you never feed exhaust back into the engine.
- **Bilingual cognition research** — The insight that emotional concepts are not language-neutral. "Saudade" has no English equivalent. The seed dictionary preserves this principle: each language gets its own emotional vocabulary, not translations.
- **Constructive grammar (Goldberg)** — The idea that meaning is constructed from composition of parts, not looked up in a dictionary. Our grammar assembles phrases from independently computed modifiers, exactly as constructive grammar predicts.

---

## SCOPE

### In Scope

- Computing verb phrases from 13 physical dimensions on any link
- Maintaining EN/FR lookup tables for all three grammar layers
- Temporal modifier selection based on recency, link_age, moment_status
- Pre-verb modifier selection based on permanence, energy, surprise
- Base verb selection from hierarchy x polarity matrix
- Post-verb modifier selection from Plutchik (L1) or structural impact (L3)
- Contextual semantic overrides when node types are known
- Seed dictionary management for citizen birth

### Out of Scope

- Full narrative generation (prose, stories, descriptions) -> see: narrative engine
- Natural language understanding / parsing -> see: cognition module
- Voice synthesis or TTS -> see: voice pipeline
- Storing any computed language in the graph -> by design, not oversight
- Languages beyond EN/FR in v1 -> extensible, but not scoped

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Add lookup tables for additional Plutchik emotion intensities (currently only extremes defined) -->
<!-- @mind:proposition Consider adding a "poetry mode" for high-energy, high-surprise links that produces more evocative language -->
<!-- @mind:escalation Need decision on whether L3 contextual overrides should be exhaustive or extensible via config -->
