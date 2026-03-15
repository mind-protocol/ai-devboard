# OBJECTIVES — {Module}

```
STATUS: DRAFT | REVIEW | STABLE
CREATED: {DATE}
VERIFIED: {DATE} against {COMMIT}
```

---

## CHAIN

```
THIS:            OBJECTIVES_*.md (you are here - START HERE)
PATTERNS:       ./PATTERNS_*.md
BEHAVIORS:      ./BEHAVIORS_*.md
ALGORITHM:      ./ALGORITHM_*.md
VALIDATION:     ./VALIDATION_*.md
IMPLEMENTATION: ./IMPLEMENTATION_*.md
SYNC:           ./SYNC_*.md

IMPL:           {path/to/main/source/file.py}
```

**Read this chain in order before making changes.** Each doc answers different questions. Skipping ahead means missing context.

```yaml
# CONVERSION RULE: CHAIN section
# Creates: link CHAIN_NEXT between this doc node and each referenced doc node
# Parse: each line "KEY: ./PATH" → link to target doc node
rule: chain_pointers
  trigger: "any line matching /^[A-Z]+:\s+\.\//"
  for_each_match:
    - resolve: target_doc_node_id from path (e.g., "./PATTERNS_*.md" → "narrative:pattern_{module}")
    - create_link:
        from: this_node
        to: target_doc_node_id
        r.type: "CHAIN_NEXT"
        hierarchy: "position-based: OBJECTIVES=-1.0, PATTERNS=-0.75, ..., SYNC=+1.0"
        permanence: 0.95
        trust: 1.0
        friction: 0.0
  also:
    - if "IMPL:" line exists:
        - resolve: code_file_node_id from path
        - create_link:
            from: this_node
            to: code_file_node_id
            r.type: "REFERENCES"
            hierarchy: 0.3
            trust: 0.9
```

---

## PRIMARY OBJECTIVES (ranked)
1. {Objective} — {why it matters}
2. {Objective} — {why it matters}
3. {Objective} — {why it matters}

```yaml
# CONVERSION RULE: PRIMARY OBJECTIVES
# Creates: one Narrative(subtype=objective) per numbered line
# Parse: "N. {text} — {justification}" → split on " — "
rule: objectives_ranked
  trigger: "numbered list under ## PRIMARY OBJECTIVES"
  for_each_line:
    - parse: "{rank}. {objective_text} — {justification}"
    - create_node:
        node_type: Narrative
        subtype: "objective"
        id: "narrative:obj_{slugify(objective_text)}"
        content: "{objective_text}"
        synthesis: "{justification}"
        weight: "1.0 - (rank - 1) * 0.2"   # #1=0.9, #2=0.7, #3=0.5, etc.
        stability: 0.8
        energy: 0.5
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "BELONGS_TO"
        hierarchy: -0.8
        permanence: 0.9
        trust: 0.9
        friction: 0.1
```

## NON-OBJECTIVES
- {What we explicitly do NOT optimize}
- {What this module will not attempt}

```yaml
# CONVERSION RULE: NON-OBJECTIVES
# Creates: one Narrative(subtype=non_objective) per bullet
# These have NEGATIVE valence — they repel, not attract
rule: non_objectives
  trigger: "bullet list under ## NON-OBJECTIVES"
  for_each_line:
    - parse: "- {text}"
    - create_node:
        node_type: Narrative
        subtype: "non_objective"
        id: "narrative:non_obj_{slugify(text)}"
        content: "{text}"
        weight: 0.6
        stability: 0.8
        energy: 0.2
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "EXCLUDES"
        hierarchy: -0.5
        valence: -0.7          # NEGATIVE — this is what we DON'T do
        permanence: 0.85
        trust: 0.9
```

## TRADEOFFS (canonical decisions)
- When {X} conflicts with {Y}, choose {X}.
- We accept {cost} to preserve {value}.

```yaml
# CONVERSION RULE: TRADEOFFS
# Creates: one Narrative(subtype=tradeoff) per bullet
# Tradeoffs link TWO objectives with a CONFLICTS_WITH link
rule: tradeoffs
  trigger: "bullet list under ## TRADEOFFS"
  for_each_line:
    - parse: "When {concept_a} conflicts with {concept_b}, choose {winner}."
      OR: "We accept {cost} to preserve {value}."
    - create_node:
        node_type: Narrative
        subtype: "tradeoff"
        id: "narrative:tradeoff_{slugify(concept_a)}_{slugify(concept_b)}"
        content: full_line
        weight: 0.7
        stability: 0.85         # tradeoffs are canonical decisions
        energy: 0.3
    - create_link:
        from: "narrative:obj_{slugify(winner)}"   # the winning objective
        to: "narrative:obj_{slugify(loser)}"       # the losing objective
        r.type: "OVERRIDES"
        hierarchy: 0.3           # winner is above loser
        friction: 0.5            # there IS tension between them
        ambivalence: 0.6         # both have merit
        permanence: 0.85
```

## SUCCESS SIGNALS (observable)
- {metric/behavior}
- {metric/behavior}

```yaml
# CONVERSION RULE: SUCCESS SIGNALS
# Creates: one Thing(subtype=metric) per bullet
# Metrics are observable measurements — Things, not Narratives
rule: success_signals
  trigger: "bullet list under ## SUCCESS SIGNALS"
  for_each_line:
    - parse: "- {signal_text}"
    - create_node:
        node_type: Thing
        subtype: "metric"
        id: "thing:metric_{slugify(signal_text)}"
        content: "{signal_text}"
        weight: 0.5
        energy: 0.3
    - create_link:
        from: this_node
        to: "narrative:obj_{nearest_objective}"  # link to the objective it measures
        r.type: "MEASURES"
        hierarchy: -0.3          # metric serves the objective
        trust: 0.6               # metric may not perfectly capture the objective
        permanence: 0.6
```
