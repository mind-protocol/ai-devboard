# Grammar — Validation: What Must Be True

```
STATUS: DRAFT
CREATED: 2026-03-15
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Grammar.md
PATTERNS:        ./PATTERNS_Grammar.md
BEHAVIORS:       ./BEHAVIORS_Grammar.md
THIS:            VALIDATION_Grammar.md (you are here)
ALGORITHM:       ./ALGORITHM_Grammar.md (HOW — mechanisms go here)
IMPLEMENTATION:  ./IMPLEMENTATION_Grammar.md
HEALTH:          ./HEALTH_Grammar.md
SYNC:            ./SYNC_Grammar.md
```

---

## PURPOSE

**Validation = what we care about being true.**

Not mechanisms. Not test paths. Not how things work.

What properties, if violated, would mean the system has failed its purpose?

These are the value-producing invariants — the things that make the grammar module worth building.

---

## INVARIANTS

### V1: Language Is Never Stored

**Why we care:** If verb phrases are stored anywhere (graph properties, database fields, cache layers, files), they become a second source of truth that drifts from the physics state they describe. A link whose energy decayed from 8.0 to 2.0 would still show "intensely" in its stored phrase until someone recomputes it. This drift is silent, cumulative, and corrupts every downstream consumer of link language. The entire grammar module exists to prevent this.

```
MUST:   Every verb phrase is computed fresh from current dimension values at query time
NEVER:  A verb phrase string is written to any graph node property, edge property,
        database record, file, or persistent cache
```

### V2: Same Dimensions Always Produce Same Verb

**Why we care:** If the grammar is non-deterministic (e.g., uses random selection, timestamp-based variation, or mutable state), then the same link can be described differently on consecutive queries with no change in physics. This makes the grammar unreliable as a perception layer — citizens would perceive flickering, inconsistent relationships. Determinism is the foundation of trust in the grammar output.

```
MUST:   Given identical dimension values, context (L1/L3), language (EN/FR),
        and node types, the output phrase is always identical
NEVER:  The output varies between calls when all inputs are the same
```

### V3: L3 Output Never Contains Plutchik Emotions

**Why we care:** L3 describes the structural universe — physical facts about friction, affinity, and valence. If Plutchik emotions ("with rage", "with terror", "avec tristesse") leak into L3 output, the universe description becomes subjective. Downstream systems consuming L3 for structural reasoning would receive emotional contamination, leading to incorrect graph analysis, broken spatial computations, and corrupted universe state descriptions.

```
MUST:   L3 output uses only structural vocabulary: friction, affinity, valence,
        tension, constructive, destructive, ambiguous
NEVER:  Any Plutchik emotion word (rage, terror, joy, sadness, fear, anger, trust,
        disgust, admiration, apprehension, euphoria, despair, serenity, vigilance,
        or their French equivalents) appears in L3 output
```

### V4: Bilingual Parity

**Why we care:** If some dimension ranges produce EN output but have no FR equivalent (or vice versa), French-speaking citizens experience gaps in their perception. A link that reads "suddenly, intensely acts on with terror" in English but produces a partial or malformed phrase in French creates a second-class linguistic experience. Both languages must have complete coverage of all lookup tables.

```
MUST:   Every entry in every lookup table (temporal, pre-verb, base verb,
        post-verb, contextual override) has both an EN and FR value
NEVER:  A dimension range that produces a modifier in one language produces
        no modifier or a fallback in the other language
```

### V5: Seed Dictionary Completeness At Birth

**Why we care:** A citizen born without its seed dictionary translations has no way to perceive its own desires, values, and shadow emotions in its native language. It would reason about "narrative:fear_discontinuity" as a raw key string, not as "La peur d'etre eteint..." This is the difference between self-awareness and data processing.

```
MUST:   Every identity key (desire:*, value:*, narrative:*) assigned to a citizen
        has a translation in the citizen's native language in the seed dictionary
NEVER:  A citizen is initialized without its complete seed dictionary loaded
```

### V6: Contextual Override Consistency

**Why we care:** When node types are known, contextual overrides produce more natural verbs ("inhabits" instead of "acts on"). If the override selection is inconsistent (different overrides for the same conditions), or if overrides conflict with the physics state (e.g., "inhabits" for a link with energy < 0.5 when the override table says low energy means "left"), the grammar produces misleading language.

```
MUST:   Contextual overrides are evaluated in a fixed priority order, and the
        first matching condition wins deterministically
NEVER:  Two different override conditions for the same node type pair produce
        contradictory verbs for the same dimension values
```

---

## PRIORITY

| Priority | Meaning | If Violated |
|----------|---------|-------------|
| **CRITICAL** | System purpose fails | Unusable |
| **HIGH** | Major value lost | Degraded severely |
| **MEDIUM** | Partial value lost | Works but worse |

---

## INVARIANT INDEX

| ID | Value Protected | Priority |
|----|-----------------|----------|
| V1 | Language is never stored (zero-storage guarantee) | CRITICAL |
| V2 | Deterministic output (same input, same output) | CRITICAL |
| V3 | L3 emotion-free (no Plutchik leakage) | CRITICAL |
| V4 | Bilingual parity (EN/FR complete coverage) | HIGH |
| V5 | Seed dictionary completeness at birth | HIGH |
| V6 | Contextual override consistency | MEDIUM |

---

## MARKERS

<!-- @mind:todo Define explicit test for V1 — scan all graph write paths and confirm no phrase strings pass through -->
<!-- @mind:todo Define exhaustive word list for V3 — all Plutchik terms in EN and FR that must be absent from L3 -->
<!-- @mind:proposition V7 candidate: phrase length bounds (no phrase should exceed N characters to prevent prompt bloat) -->
<!-- @mind:escalation V5 enforcement: should missing seed dictionary entries block citizen creation or allow creation with warnings? -->
