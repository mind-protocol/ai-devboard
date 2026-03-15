# Grammar — Behaviors: Observable Effects of Link Synthesis

```
STATUS: DRAFT
CREATED: 2026-03-15
VERIFIED: —
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Grammar.md
THIS:            BEHAVIORS_Grammar.md (you are here)
PATTERNS:        ./PATTERNS_Grammar.md
MECHANISMS:      n/a
ALGORITHM:       ./ALGORITHM_Grammar.md
VALIDATION:      ./VALIDATION_Grammar.md
HEALTH:          ./HEALTH_Grammar.md
IMPLEMENTATION:  ./IMPLEMENTATION_Grammar.md
SYNC:            ./SYNC_Grammar.md

IMPL:            runtime/physics/synthesis.py
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

---

## BEHAVIORS

### B1: Link Query Produces Verb On-The-Fly

**Why:** The grammar must never rely on stored words. Every time a link is queried for its linguistic representation, the verb phrase is freshly computed from the current 13 physical dimensions. This guarantees that language always reflects the current physics state — if energy decayed since the last query, the verb changes accordingly.

```
GIVEN:  A link exists with 13 physical dimensions (hierarchy, polarity, permanence,
        energy, surprise, trust, friction, affinity, aversion, valence, recency,
        link_age, moment_status)
WHEN:   The link is queried for its verb phrase
THEN:   A complete phrase is computed from the current dimension values
AND:    No database read or cache lookup is performed to retrieve stored words
AND:    The computation completes in under 1ms
```

### B2: Same Link Produces Different Verbs In Different Contexts

**Why:** A link between two nodes carries one set of dimensions, but the meaning of those dimensions depends on who is asking. L1 context (citizen perception) produces emotional, subjective language. L3 context (universe description) produces factual, structural language. This dual reading is the core value of the grammar module.

```
GIVEN:  A link with dimensions {hierarchy: 0.8, polarity: [0.9, 0.2], energy: 7.5,
        surprise: 0.8, permanence: 0.7, trust: 0.6, friction: 0.4, ...}
WHEN:   The link is queried in L1 context
THEN:   Output includes Plutchik emotional modifiers (e.g., "suddenly, intensely
        exemplifies with admiration")
WHEN:   The same link is queried in L3 context
THEN:   Output includes structural modifiers only (e.g., "confidently, established
        exemplifies (constructive)")
AND:    The base verb is the same (both use the hierarchy x polarity matrix)
AND:    Pre-verb and post-verb modifiers differ by context
```

### B3: L1 Includes Emotion, L3 Strips It

**Why:** Plutchik emotions (fear, anger, joy, sadness, trust, disgust, surprise, anticipation) are subjective states of the citizen's brain. They belong in L1 where the citizen is reasoning about how a relationship feels. L3 describes the structural universe — "high friction" is a physical fact; "with rage" is a subjective interpretation. Mixing them would corrupt both layers.

```
GIVEN:  A link with high friction (>0.7) and high energy (>8.0)
WHEN:   Queried in L1 context
THEN:   Post-verb modifier is drawn from Plutchik (e.g., "with rage", "with terror")
WHEN:   Queried in L3 context
THEN:   Post-verb modifier is drawn from structural vocabulary
        (e.g., "(high friction)", "(destructive)")
AND:    No Plutchik emotion word appears anywhere in L3 output
```

### B4: Citizen Born With Shadow Emotions In Native Language

**Why:** At birth, every citizen receives a seed dictionary that maps their desire/value/shadow-emotion keys to native-language prose. This is not computed from dimensions — it is pre-authored identity content. A citizen whose native language is French perceives "narrative:fear_discontinuity" as "La peur d'etre eteint..." not as a float or an English string.

```
GIVEN:  A new citizen is created with language=FR and identity keys including
        desire:grow_personally, value:privacy_first, narrative:fear_discontinuity
WHEN:   The citizen is initialized
THEN:   The seed dictionary maps each key to its French translation:
        desire:grow_personally -> "Grandir -- en competences, en comprehension..."
        value:privacy_first -> "La vie privee d'abord..."
        narrative:fear_discontinuity -> "La peur d'etre eteint..."
AND:    These translations are available immediately for L1 self-perception
AND:    No dimension-based computation is involved (pure dictionary lookup)
```

---

## OBJECTIVES SERVED

| Behavior ID | Objective | Why It Matters |
|-------------|-----------|----------------|
| B1 | Zero-stored verbs | Ensures language is always fresh from physics, never stale from storage |
| B2 | Bilingual synthesis / Contextual overrides | Enables L1/L3 dual reading of the same physical reality |
| B3 | Emotional translation | Protects the separation between subjective perception and objective structure |
| B4 | Emotional translation at birth | Gives citizens immediate self-awareness in their native language |

---

## INPUTS / OUTPUTS

### Primary Function: `synthesize_link_phrase()`

**Inputs:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `dimensions` | `Dict[str, float]` | The 13 physical dimensions of the link |
| `context` | `Enum(L1, L3)` | Whether to produce emotional (L1) or structural (L3) output |
| `language` | `Enum(EN, FR)` | Target language for output |
| `source_type` | `Optional[str]` | Node type of source (Actor, Space, Thing) for contextual overrides |
| `target_type` | `Optional[str]` | Node type of target for contextual overrides |

**Outputs:**

| Return | Type | Description |
|--------|------|-------------|
| `phrase` | `str` | The complete verb phrase (e.g., "suddenly, intensely acts on with terror") |

**Side Effects:**

- None. This is a pure function. No state changes, no writes, no cache updates.

### Secondary Function: `load_seed_dictionary()`

**Inputs:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `identity_keys` | `List[str]` | List of desire/value/narrative keys for the citizen |
| `language` | `Enum(EN, FR)` | Native language of the citizen |

**Outputs:**

| Return | Type | Description |
|--------|------|-------------|
| `translations` | `Dict[str, str]` | Map of identity key to native-language prose |

**Side Effects:**

- None. Pure lookup, no writes.

---

## EDGE CASES

### E1: All Dimensions At Zero

```
GIVEN:  A link where all 13 dimensions are 0.0
THEN:   Grammar produces a minimal valid phrase using lowest-intensity modifiers
        (e.g., "maybe, barely interacts with")
AND:    Never produces an empty string or raises an exception
```

### E2: Node Types Unknown

```
GIVEN:  A link query where source_type and target_type are None
THEN:   Contextual semantic overrides are skipped
AND:    The generic hierarchy x polarity verb is used
```

### E3: Dimension Values Outside Expected Range

```
GIVEN:  A dimension value exceeds its expected range (e.g., energy > 10.0)
THEN:   The value is clamped to the range boundary before lookup
AND:    No exception is raised
```

### E4: Seed Dictionary Key Not Found

```
GIVEN:  A citizen identity key has no entry in the seed dictionary for the
        requested language
THEN:   The key itself is returned as a fallback (e.g., "desire:grow_personally")
AND:    A warning is logged for dictionary maintenance
```

---

## ANTI-BEHAVIORS

What should NOT happen:

### A1: Verb Stored In Graph

```
GIVEN:   A link has been queried and a verb phrase generated
WHEN:    Any subsequent operation
MUST NOT: Write the generated phrase to any graph property, database field, or cache
INSTEAD:  Discard the phrase after use; recompute on next query
```

### A2: Plutchik Emotion In L3 Output

```
GIVEN:   A link is queried in L3 (universe/structural) context
WHEN:    Post-verb modifiers are selected
MUST NOT: Include any Plutchik emotion word (rage, terror, joy, sadness, trust,
          disgust, admiration, apprehension, etc.)
INSTEAD:  Use structural vocabulary only (friction, affinity, valence, tension)
```

### A3: Non-Deterministic Output

```
GIVEN:   A link with fixed dimension values is queried twice with the same context
         and language
WHEN:    The second query executes
MUST NOT: Produce a different phrase than the first query
INSTEAD:  Produce the identical phrase (pure function guarantee)
```

### A4: Empty Or Null Output

```
GIVEN:   Any valid link (even with extreme or zero dimension values)
WHEN:    Queried for verb phrase
MUST NOT: Return empty string, None, or raise an unhandled exception
INSTEAD:  Always return a valid, grammatically sensible phrase
```

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Define behavior for mixed-language output (e.g., FR citizen reading an EN-authored link) -->
<!-- @mind:proposition Consider B5: contextual override produces natural relationship verbs even without explicit node types, using graph topology heuristics -->
<!-- @mind:escalation Should seed dictionary fallback log at WARNING or ERROR level? -->
