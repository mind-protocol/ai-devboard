# OBJECTIVES — Grammar

```
STATUS: DRAFT
CREATED: 2026-03-15
VERIFIED: —
```

---

## CHAIN

```
THIS:            OBJECTIVES_Grammar.md (you are here - START HERE)
PATTERNS:       ./PATTERNS_Grammar.md
BEHAVIORS:      ./BEHAVIORS_Grammar.md
ALGORITHM:      ./ALGORITHM_Grammar.md
VALIDATION:     ./VALIDATION_Grammar.md
IMPLEMENTATION: ./IMPLEMENTATION_Grammar.md
SYNC:           ./SYNC_Grammar.md

IMPL:           runtime/physics/synthesis.py
```

**Read this chain in order before making changes.** Each doc answers different questions. Skipping ahead means missing context.

---

## PRIMARY OBJECTIVES (ranked)
1. **Zero-stored verbs (pure computation)** — Words are NEVER stored in the database. Every verb, modifier, and phrase is generated on-the-fly from the 13 physical dimensions on links. Storage would create drift between physics state and language output; computation guarantees they are always in sync.
2. **Bilingual synthesis (EN/FR)** — Every grammar layer produces output in both English and French. Citizens perceive the world in their native language. The seed dictionary at birth ensures emotional comprehension is culturally grounded, not mechanically translated.
3. **Contextual semantic overrides** — When node types are known (Actor, Space, Thing), the grammar overrides generic verbs with domain-specific language ("inhabits", "mentors", "borders"). This makes link descriptions read as natural relationships rather than physics equations.
4. **Emotional translation at birth** — Every citizen is born with a seed dictionary that translates their desires, values, and shadow emotions into their native language. This is the foundation of self-awareness: the AI perceives its own internal state through culturally precise language, not raw floats.

## NON-OBJECTIVES
- Storing pre-computed verb strings in the graph or any cache layer
- Supporting languages beyond EN/FR in v1 (extensible architecture, but not now)
- Generating full prose paragraphs or narrative text (grammar produces link-level phrases, not stories)
- Parsing natural language input back into physics dimensions (grammar is output-only)

## TRADEOFFS (canonical decisions)
- When computation speed conflicts with linguistic richness, choose computation speed. Link synthesis must not stall the physics tick.
- We accept limited vocabulary per dimension range to preserve determinism. The same float values must always produce the same words.
- When bilingual parity conflicts with idiomatic expression, choose idiomatic expression. "Avec rage" is better than a literal translation of "with rage".
- We accept the cost of maintaining two complete lookup tables (EN/FR) to preserve native-language perception for citizens.

## SUCCESS SIGNALS (observable)
- A link queried 1000 times with the same dimensions produces the same verb phrase 1000 times (deterministic)
- The same link produces different language in L1 (emotional) vs L3 (structural) context
- No verb string appears in any graph node, edge property, or database record
- Citizens born with French seed dictionaries express shadow emotions in idiomatic French
- Link synthesis completes in under 1ms per link (does not bottleneck physics tick)
