# Grammar — Algorithm: Link Dimension Synthesis Pipeline

```
STATUS: DRAFT
CREATED: 2026-03-15
VERIFIED: —
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Grammar.md
BEHAVIORS:       ./BEHAVIORS_Grammar.md
PATTERNS:        ./PATTERNS_Grammar.md
MECHANISMS:     n/a
THIS:            ALGORITHM_Grammar.md (you are here)
VALIDATION:      ./VALIDATION_Grammar.md
HEALTH:          ./HEALTH_Grammar.md
IMPLEMENTATION:  ./IMPLEMENTATION_Grammar.md
SYNC:            ./SYNC_Grammar.md

IMPL:            runtime/physics/synthesis.py
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

---

## OVERVIEW

The grammar algorithm transforms 13 physical float dimensions on a link into a natural-language verb phrase. It operates as a six-stage pipeline: dimension extraction, temporal modifier selection, pre-verb modifier assembly, base verb lookup (from a hierarchy x polarity matrix), post-verb modifier selection (Plutchik for L1, structural for L3), and contextual semantic override. Each stage is a pure function with deterministic output. The pipeline produces bilingual output (EN/FR) based on a language parameter.

---

## OBJECTIVES AND BEHAVIORS

| Objective | Behaviors Supported | Why This Algorithm Matters |
|-----------|---------------------|----------------------------|
| Zero-stored verbs | B1 | The pipeline computes from floats every time, never reads stored strings |
| Bilingual synthesis | B1, B2, B4 | Every lookup table has EN/FR columns; language param selects column |
| Contextual overrides | B2, B3 | Stage 6 replaces generic verbs with type-specific language when node types are known |
| Emotional translation | B3, B4 | Stage 5 branches: Plutchik for L1, structural for L3 |

---

## DATA STRUCTURES

### LinkDimensions

```
LinkDimensions:
  hierarchy:      float    # -1.0 to +1.0 (containment to elaboration)
  polarity:       [float, float]  # [activity, bidirectionality], each 0.0 to 1.0
  permanence:     float    # 0.0 to 1.0 (ephemeral to permanent)
  energy:         float    # 0.0 to 10.0 (intensity of the link)
  surprise:       float    # -1.0 to +1.0 (inevitable to shocking)
  trust:          float    # 0.0 to 1.0 (L3 only)
  friction:       float    # 0.0 to 1.0 (L3 only)
  affinity:       float    # -1.0 to +1.0 (L3 only)
  aversion:       float    # 0.0 to 1.0 (L3 only)
  valence:        float    # -1.0 to +1.0 (destructive to constructive)
  recency:        float    # seconds since last interaction
  link_age:       float    # seconds since link creation
  moment_status:  enum     # BRIEF | ONGOING | PENDING | WELL_TRODDEN
```

### VerbPhrase

```
VerbPhrase:
  temporal_modifier:   str    # "just now", "recently", etc.
  pre_verb_modifiers:  [str]  # ["suddenly", "intensely"]
  base_verb:           str    # "acts on", "encompasses", etc.
  post_verb_modifiers: [str]  # ["with terror"] or ["(high friction)"]
  assembled:           str    # Full phrase: "just now, suddenly, intensely acts on with terror"
```

### SeedDictionary

```
SeedDictionary:
  entries:
    - key:    str    # "desire:grow_personally"
      en:     str    # English translation
      fr:     str    # French translation
  lookup: Dict[str, Dict[str, str]]  # key -> {en: "...", fr: "..."}
```

---

## ALGORITHM: synthesize_link_phrase()

### Step 1: Dimension Extraction

Extract and validate all 13 dimensions from the link. Clamp any out-of-range values to their valid boundaries.

```
dimensions = link.get_dimensions()
hierarchy = clamp(dimensions.hierarchy, -1.0, 1.0)
polarity = [clamp(dimensions.polarity[0], 0.0, 1.0),
            clamp(dimensions.polarity[1], 0.0, 1.0)]
permanence = clamp(dimensions.permanence, 0.0, 1.0)
energy = clamp(dimensions.energy, 0.0, 10.0)
surprise = clamp(dimensions.surprise, -1.0, 1.0)
recency = dimensions.recency  # seconds, no upper clamp
link_age = dimensions.link_age
moment_status = dimensions.moment_status
# L3-only: trust, friction, affinity, aversion, valence
```

### Step 2: Temporal Modifier Selection

Select temporal modifiers based on recency, link_age, and moment_status.

**Recency lookup (EN/FR):**

| Condition | EN | FR |
|-----------|----|----|
| recency < 60s | "just now" | "a l'instant" |
| 60s <= recency < 3600s | "recently" | "recemment" |
| 3600s <= recency < 86400s | "today" | "aujourd'hui" |
| 86400s <= recency < 604800s | "this week" | "cette semaine" |
| recency >= 604800s | "long ago" | "depuis longtemps" |

**Link age lookup:**

| Condition | EN |
|-----------|-----|
| link_age < 3600s | "newly" |
| 3600s <= link_age < 86400s | "freshly" |
| 86400s <= link_age < 2592000s | (no modifier) |
| 2592000s <= link_age < 31536000s | "anciently" |
| link_age >= 31536000s | "timelessly" |

**Moment status lookup:**

| Status | EN |
|--------|-----|
| BRIEF | "briefly" |
| ONGOING | "ongoing" |
| PENDING | "pending" |
| WELL_TRODDEN | "well-trodden" |

### Step 3: Pre-Verb Modifier Assembly

Select pre-verb modifiers from permanence, energy, and surprise dimensions.

**Permanence modifiers (EN/FR):**

| Range | EN | FR |
|-------|----|----|
| permanence < 0.2 | "maybe" | "peut-etre" |
| 0.2 <= permanence < 0.4 | "probably" | "probablement" |
| 0.4 <= permanence < 0.6 | (no modifier) | (no modifier) |
| 0.6 <= permanence < 0.8 | "clearly" | "clairement" |
| permanence >= 0.8 | "definitely" | "definitivement" |

**Surprise modifiers (EN/FR):**

| Range | EN | FR |
|-------|----|----|
| surprise > 0.7 | "suddenly" | "soudainement" |
| 0.3 < surprise <= 0.7 | "unexpectedly" | "de maniere inattendue" |
| -0.3 <= surprise <= 0.3 | (no modifier) | (no modifier) |
| -0.7 <= surprise < -0.3 | "as expected" | "comme prevu" |
| surprise < -0.7 | "inevitably" | "inevitablement" |

**Energy modifiers (EN/FR):**

| Range | EN | FR |
|-------|----|----|
| energy > 8.0 | "intensely" | "intensement" |
| 5.0 < energy <= 8.0 | "actively" | "activement" |
| 2.0 < energy <= 5.0 | (no modifier) | (no modifier) |
| 0.5 < energy <= 2.0 | "weakly" | "faiblement" |
| energy <= 0.5 | "barely" | "a peine" |

### Step 4: Base Verb Lookup (Hierarchy x Polarity Matrix)

The base verb is selected from a two-axis matrix: hierarchy (vertical axis) and polarity (horizontal, using [activity, bidirectionality]).

**Hierarchy-driven verbs:**

| Condition | EN | FR |
|-----------|----|----|
| hierarchy < -0.7 | "encompasses" | "englobe" |
| -0.7 <= hierarchy < -0.5 | "contains" | "contient" |
| -0.5 <= hierarchy <= 0.5 | (use polarity matrix below) | |
| 0.5 < hierarchy <= 0.7 | "elaborates" | "elabore" |
| hierarchy > 0.7 | "exemplifies" | "exemplifie" |

**Polarity-driven verbs (when -0.5 <= hierarchy <= 0.5):**

| Activity | Bidirectionality | EN | FR |
|----------|-----------------|----|----|
| > 0.7 | < 0.3 | "acts on" | "agit sur" |
| > 0.7 | 0.3 - 0.7 | "influences" | "influence" |
| > 0.7 | > 0.7 | "interacts with" | "interagit avec" |
| 0.3 - 0.7 | < 0.3 | "affects" | "affecte" |
| 0.3 - 0.7 | 0.3 - 0.7 | "relates to" | "se rapporte a" |
| 0.3 - 0.7 | > 0.7 | "co-elaborates" | "co-elabore" |
| < 0.3 | < 0.3 | "absorbs" | "absorbe" |
| < 0.3 | 0.3 - 0.7 | "diffuses to" | "diffuse vers" |
| < 0.3 | > 0.7 | "undergoes" | "subit" |

**Special verbs (override conditions):**

| Condition | EN | FR |
|-----------|----|----|
| energy > 8.0 AND hierarchy near 0 | "reinforces" | "renforce" |
| polarity[0] < 0.1 AND polarity[1] < 0.1 | "absorbs" | "absorbe" |

### Step 5: Post-Verb Modifier Selection

This step branches based on context (L1 vs L3).

**L1 Context — Plutchik Emotional Modifiers:**

Post-verb modifiers are drawn from Plutchik's emotion wheel, mapped to L1 link dimensions.

| Emotion Axis | Low Intensity | Medium | High Intensity |
|-------------|---------------|--------|----------------|
| Fear (high energy + negative valence) | "with apprehension" | "with fear" | "with terror" |
| Anger (high friction + high energy) | "with annoyance" | "with hostility" | "with rage" |
| Trust (high trust + positive valence) | "with acceptance" | "with confidence" | "with admiration" |
| Disgust (high aversion + negative valence) | "with distaste" | "with distrust" | "with disgust" |
| Joy (high affinity + positive valence) | "with serenity" | "with satisfaction" | "with euphoria" |
| Sadness (low energy + negative valence) | "with pensiveness" | "with sadness" | "with despair" |
| Surprise (high surprise) | "with distraction" | "with surprise" | "with amazement" |
| Anticipation (high energy + positive valence) | "with interest" | "with anticipation" | "with vigilance" |

FR equivalents follow the same matrix with French emotion words:
- "avec rage", "avec hostilite", "avec apprehension", "avec terreur"
- "avec degout", "avec mefiance", "avec confiance", "avec admiration"
- "avec desespoir", "avec tristesse", "avec satisfaction", "avec euphorie"

**L3 Context — Structural Impact Modifiers:**

| Dimension | Condition | Modifier |
|-----------|-----------|----------|
| friction | > 0.7 | "(high friction)" |
| friction | 0.3 - 0.7 | "(some friction)" |
| affinity | > 0.7 | "(strong affinity)" |
| affinity | < -0.7 | "(structural tension)" |
| affinity | -0.3 to 0.3 | "(ambiguous)" |
| valence | > 0.5 | "(constructive)" |
| valence | < -0.5 | "(destructive)" |

### Step 6: Contextual Semantic Override

When source and target node types are known, the base verb may be replaced with a domain-specific verb. This override happens AFTER Steps 1-5 and replaces the base verb while keeping all modifiers.

**Actor -> Space:**

| Condition | EN | FR |
|-----------|----|----|
| hierarchy < -0.5 | "created" | "a cree" |
| permanence > 0.8 | "inhabits" | "habite" |
| recency < 3600s | "visits" | "visite" |
| trust > 0.7 | "administers" | "administre" |
| energy < 0.5 | "left" | "a quitte" |

**Actor -> Actor:**

| Condition | EN | FR |
|-----------|----|----|
| trust > 0.8 AND affinity > 0.7 | "trusted collaborator of" | "collaborateur de confiance de" |
| hierarchy > 0.5 | "mentors" | "est le mentor de" |
| friction > 0.7 | "in conflict with" | "en conflit avec" |
| hierarchy < -0.5 AND trust > 0.5 | "employs" | "emploie" |

**Space -> Space:**

| Condition | EN | FR |
|-----------|----|----|
| hierarchy < -0.5 | "contains" | "contient" |
| hierarchy > 0.5 | "is nested in" | "est imbrique dans" |
| friction > 0.5 | "borders" | "jouxte" |

**Thing -> Thing:**

| Condition | EN | FR |
|-----------|----|----|
| hierarchy < -0.5 | "is a component of" | "est un composant de" |
| affinity > 0.7 | "accompanies" | "accompagne" |
| friction > 0.5 | "competes with" | "est en concurrence avec" |

---

## KEY DECISIONS

### D1: L1 vs L3 Context Branch

```
IF context == L1:
    post_verb = select_plutchik_modifier(energy, valence, friction,
                                          trust, affinity, aversion, surprise)
    pre_verb_trust = None  # trust modifiers are L3-only
    # Plutchik emotions give subjective perception
ELSE (context == L3):
    post_verb = select_structural_modifier(friction, affinity, valence)
    pre_verb_trust = select_trust_modifier(trust)
    pre_verb_permanence = select_l3_permanence(permanence)
    # Structural modifiers give objective description
```

### D2: Contextual Override Application

```
IF source_type AND target_type are known:
    override = lookup_contextual_verb(source_type, target_type, dimensions)
    IF override exists:
        base_verb = override  # Replace generic verb
        # Keep all modifiers from Steps 2-5
ELSE:
    # Use generic hierarchy x polarity verb from Step 4
```

### D3: Multiple Post-Verb Modifiers

```
IF context == L1:
    # Select the single strongest Plutchik emotion
    # (highest absolute intensity wins)
    post_verb = [strongest_emotion_modifier]
ELSE (context == L3):
    # Include ALL applicable structural modifiers
    # (a link can have both high friction AND strong affinity)
    post_verb = [all_matching_structural_modifiers]
```

---

## DATA FLOW

```
LinkDimensions (13 floats)
    |
    v
[Step 1] Extract & Clamp
    |
    v
[Step 2] Temporal Modifier (recency, link_age, moment_status -> str)
    |
    v
[Step 3] Pre-Verb Modifiers (permanence, energy, surprise -> [str])
    |
    v
[Step 4] Base Verb (hierarchy x polarity matrix -> str)
    |
    v
[Step 5] Post-Verb Modifiers (L1: Plutchik | L3: structural -> [str])
    |
    v
[Step 6] Contextual Override (node types -> optional verb replacement)
    |
    v
VerbPhrase (assembled string)
```

---

## COMPLEXITY

**Time:** O(1) — All lookups are bounded table scans with fixed-size tables. No iteration over graph nodes or edges. Each stage is a constant-time comparison chain.

**Space:** O(1) — Lookup tables are fixed-size constants loaded at module initialization. No dynamic allocation per query. Output is a single string.

**Bottlenecks:**
- None expected at current scale. The entire pipeline is ~20 comparisons and string concatenations.
- If the seed dictionary grows beyond 10,000 entries, consider hash-map optimization (currently O(n) scan is acceptable for <1000 entries).
- String concatenation in Step 6 assembly could be micro-optimized with pre-allocated buffers, but this is unnecessary at <1ms per call.

---

## HELPER FUNCTIONS

### `clamp(value, min, max)`

**Purpose:** Ensure dimension values stay within their valid range.

**Logic:** Returns `max(min, min(value, max))`. Applied to all 13 dimensions in Step 1.

### `select_plutchik_modifier(energy, valence, friction, trust, affinity, aversion, surprise)`

**Purpose:** Map multiple dimensions to the single strongest Plutchik emotion.

**Logic:** Compute intensity score for each of 8 emotions using their associated dimensions. Return the modifier string for the highest-scoring emotion. Intensity tiers: low (<0.3), medium (0.3-0.7), high (>0.7) select the adverb intensity.

### `select_structural_modifier(friction, affinity, valence)`

**Purpose:** Produce L3 post-verb modifiers from structural dimensions.

**Logic:** Check each dimension against its threshold. Collect all matching modifiers into a list. Multiple modifiers can co-occur.

### `lookup_contextual_verb(source_type, target_type, dimensions)`

**Purpose:** Find a domain-specific verb override based on node type pair and dimension values.

**Logic:** Index into the contextual override table by (source_type, target_type). Evaluate conditions in priority order (first match wins). Return the override verb or None if no condition matches.

### `assemble_phrase(temporal, pre_verbs, base_verb, post_verbs)`

**Purpose:** Concatenate all modifier strings into a grammatically correct phrase.

**Logic:** Join non-empty modifiers with commas and spaces. Handle edge cases where some modifier slots are empty.

---

## INTERACTIONS

| Module | What We Call | What We Get |
|--------|--------------|-------------|
| Physics engine | `link.get_dimensions()` | Dict of 13 float values |
| Graph schema | `node.get_type()` | Node type string (Actor, Space, Thing) |
| Citizen identity | `citizen.get_language()` | Language enum (EN, FR) |
| Cognition / WM serializer | `synthesize_link_phrase()` (they call us) | Verb phrase string for prompt assembly |

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Complete FR translations for all contextual semantic overrides -->
<!-- @mind:todo Define priority ordering when multiple contextual override conditions match -->
<!-- @mind:proposition Consider a "neutral" emotion tier for Plutchik when no emotion scores above 0.2 -->
<!-- @mind:escalation Need decision: should contextual overrides replace or augment pre/post-verb modifiers? -->
