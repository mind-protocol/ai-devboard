# {Module Name} — Patterns: {Brief Design Philosophy Description}

```
STATUS: DRAFT | REVIEW | STABLE
CREATED: {DATE}
VERIFIED: {DATE} against {COMMIT}
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_{name}.md
BEHAVIORS:      ./BEHAVIORS_*.md
THIS:            PATTERNS_*.md (you are here)
MECHANISMS:     ./MECHANISMS_*.md (if applicable)
ALGORITHM:       ./ALGORITHM_*.md
VALIDATION:      ./VALIDATION_{name}.md
HEALTH:          ./HEALTH_{name}.md
IMPLEMENTATION:  ./IMPLEMENTATION_{name}.md
SYNC:            ./SYNC_{name}.md

IMPL:            {path/to/main/source/file.py}
```

```yaml
# CONVERSION RULE: CHAIN section
# Creates: link CHAIN_NEXT between this doc node and each referenced doc node
# Parse: each line "KEY: ./PATH" → link to target doc node
rule: chain_pointers
  trigger: "any line matching /^[A-Z]+:\s+\.\//"
  for_each_match:
    - resolve: target_doc_node_id from path (e.g., "./OBJECTIVES_{name}.md" → "narrative:objectives_{module}")
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

### Bidirectional Contract

**Before modifying this doc or the code:**
1. Read ALL docs in this chain first
2. Read the linked IMPL source file

**After modifying this doc:**
1. Update the IMPL source file to match, OR
2. Add a TODO in SYNC_*.md: "Docs updated, implementation needs: {what}"
3. Run tests: `{test command}`

**After modifying the code:**
1. Update this doc chain to match, OR
2. Add a TODO in SYNC_*.md: "Implementation changed, docs need: {what}"
3. Run tests: `{test command}`

---

## THE PROBLEM

{What problem does this module solve?}
{What's wrong with NOT having this?}
{What pain does this address?}

```yaml
# CONVERSION RULE: THE PROBLEM
# Creates: one Narrative(subtype=problem_statement) for the entire section
# Parse: all non-blank lines after "## THE PROBLEM" until next "---" → joined as content
rule: problem_statement
  trigger: "## THE PROBLEM section body"
  parse: "all paragraph text between header and next ---"
  create_node:
    node_type: Narrative
    subtype: "problem_statement"
    id: "narrative:problem_{module}"
    content: "{full_section_text}"
    weight: 0.8
    stability: 0.7
    energy: 0.6              # problems carry energy — they demand resolution
  create_link:
    from: this_node
    to: "space:module_{module}"
    r.type: "BELONGS_TO"
    hierarchy: -0.7           # problem is subordinate to the module
    permanence: 0.85
    trust: 0.9
    friction: 0.3             # problems inherently carry friction
```

---

## THE PATTERN

{What is the core design approach?}
{What shape does the solution take?}
{What's the key insight that makes this work?}

```yaml
# CONVERSION RULE: THE PATTERN
# Creates: one Narrative(subtype=pattern) for the entire section
# Links to the problem it solves via SOLVES
rule: pattern_definition
  trigger: "## THE PATTERN section body"
  parse: "all paragraph text between header and next ---"
  create_node:
    node_type: Narrative
    subtype: "pattern"
    id: "narrative:pattern_{module}"
    content: "{full_section_text}"
    weight: 0.9               # the pattern is the central insight of this doc
    stability: 0.75
    energy: 0.5
  create_link:
    - from: this_node
      to: "space:module_{module}"
      r.type: "BELONGS_TO"
      hierarchy: -0.6
      permanence: 0.9
      trust: 0.9
      friction: 0.1
    - from: this_node
      to: "narrative:problem_{module}"
      r.type: "SOLVES"
      hierarchy: 0.3           # pattern is above the problem — it resolves it
      permanence: 0.85
      trust: 0.8               # how well the pattern solves the problem is debatable
      friction: 0.2
      valence: 0.8             # positive — solution resolves pain
```

---

## BEHAVIORS SUPPORTED

- {Behavior ID} — {short explanation of how this pattern enables it}
- {Behavior ID} — {short explanation}

```yaml
# CONVERSION RULE: BEHAVIORS SUPPORTED
# Creates: links from the pattern to existing behavior nodes via ENABLES
# Parse: "- {behavior_id} — {explanation}" → split on " — "
rule: behaviors_supported
  trigger: "bullet list under ## BEHAVIORS SUPPORTED"
  for_each_line:
    - parse: "- {behavior_id} — {explanation}"
    - create_link:
        from: "narrative:pattern_{module}"
        to: "narrative:behavior_{slugify(behavior_id)}"
        r.type: "ENABLES"
        hierarchy: 0.2           # pattern is slightly above behavior — it enables it
        permanence: 0.8
        trust: 0.8
        friction: 0.1
        valence: 0.7             # positive — enabling is constructive
        synthesis: "{explanation}"
```

## BEHAVIORS PREVENTED

- {Anti-behavior ID} — {short explanation of how this pattern blocks it}

```yaml
# CONVERSION RULE: BEHAVIORS PREVENTED
# Creates: links from the pattern to existing behavior nodes via PREVENTS
# These have NEGATIVE valence — the pattern actively blocks these behaviors
rule: behaviors_prevented
  trigger: "bullet list under ## BEHAVIORS PREVENTED"
  for_each_line:
    - parse: "- {behavior_id} — {explanation}"
    - create_link:
        from: "narrative:pattern_{module}"
        to: "narrative:behavior_{slugify(behavior_id)}"
        r.type: "PREVENTS"
        hierarchy: 0.2           # pattern is above the anti-behavior
        permanence: 0.8
        trust: 0.8
        friction: 0.6            # prevention implies friction — the pattern resists this behavior
        valence: -0.7            # NEGATIVE — this behavior is blocked
        synthesis: "{explanation}"
```

---

## PRINCIPLES

### Principle 1: {Name}

{Description of principle}
{Why this matters}

### Principle 2: {Name}

{Description of principle}
{Why this matters}

### Principle 3: {Name}

{Description of principle}
{Why this matters}

```yaml
# CONVERSION RULE: PRINCIPLES
# Creates: one Narrative(subtype=principle) per ### subsection
# Each principle links to the pattern it supports via SUPPORTS
rule: principles
  trigger: "### Principle N: {name} subsections under ## PRINCIPLES"
  for_each_subsection:
    - parse: "### Principle {rank}: {name}\n\n{body}"
    - create_node:
        node_type: Narrative
        subtype: "principle"
        id: "narrative:principle_{module}_{slugify(name)}"
        content: "{body}"
        synthesis: "{name}"
        weight: "0.8 - (rank - 1) * 0.1"   # #1=0.8, #2=0.7, #3=0.6
        stability: 0.85          # principles are stable — they don't change often
        energy: 0.3
    - create_link:
        from: this_node
        to: "narrative:pattern_{module}"
        r.type: "SUPPORTS"
        hierarchy: -0.3          # principle is subordinate to the pattern — it justifies it
        permanence: 0.85
        trust: 0.9
        friction: 0.05
        valence: 0.6             # positive — principles reinforce the pattern
```

---

## DATA

| Source | Type | Purpose / Description |
|--------|------|-----------------------|
| {path/to/data} | FILE | {What this file contains} |
| {https://url} | URL | {Why this external data matters} |
| {description} | OTHER | {Other data sources} |

```yaml
# CONVERSION RULE: DATA
# Creates: one Thing(subtype=data_source) per table row
# Parse: "| {source} | {type} | {purpose} |" → split on "|"
rule: data_sources
  trigger: "table rows under ## DATA (skip header and separator rows)"
  for_each_row:
    - parse: "| {source} | {type} | {purpose} |"
    - create_node:
        node_type: Thing
        subtype: "data_source"
        id: "thing:data_{module}_{slugify(source)}"
        content: "{source}"
        synthesis: "{purpose}"
        weight: 0.4
        energy: 0.2
        metadata:
          source_type: "{type}"    # FILE, URL, or OTHER
          source_path: "{source}"
    - create_link:
        from: this_node
        to: "narrative:pattern_{module}"
        r.type: "FEEDS"
        hierarchy: -0.5           # data is subordinate — it serves the pattern
        permanence: 0.7
        trust: 0.7                # data reliability varies
        friction: 0.1
```

---

## DEPENDENCIES

| Module | Why We Depend On It |
|--------|---------------------|
| {path} | {reason} |
| {path} | {reason} |

```yaml
# CONVERSION RULE: DEPENDENCIES
# Creates: links from this module to other modules via DEPENDS_ON
# Parse: "| {module_path} | {reason} |" → split on "|"
rule: dependencies
  trigger: "table rows under ## DEPENDENCIES (skip header and separator rows)"
  for_each_row:
    - parse: "| {module_path} | {reason} |"
    - create_link:
        from: "space:module_{module}"
        to: "space:module_{slugify(module_path)}"
        r.type: "DEPENDS_ON"
        hierarchy: -0.4           # we depend on them — slight subordination
        permanence: 0.8
        trust: 0.85               # dependencies are assumed reliable
        friction: 0.2             # coupling creates friction
        synthesis: "{reason}"
```

---

## INSPIRATIONS

{What prior art informed this design?}
{What patterns from other systems?}
{What literature or theory applies?}

```yaml
# CONVERSION RULE: INSPIRATIONS
# Creates: one Narrative(subtype=inspiration) per paragraph or distinct reference
# Low weight — inspirations inform but do not constrain
rule: inspirations
  trigger: "## INSPIRATIONS section body"
  for_each_paragraph:
    - parse: "{paragraph_text}"
    - create_node:
        node_type: Narrative
        subtype: "inspiration"
        id: "narrative:inspiration_{module}_{slugify(first_10_words)}"
        content: "{paragraph_text}"
        weight: 0.3              # low weight — inspirations are background influence
        stability: 0.6
        energy: 0.15
    - create_link:
        from: "narrative:pattern_{module}"
        to: this_node
        r.type: "INSPIRED_BY"
        hierarchy: 0.1            # pattern is slightly above its inspirations
        permanence: 0.5           # inspirations may become less relevant over time
        trust: 0.5                # external references are less trusted than internal design
        friction: 0.05
        valence: 0.4              # mildly positive — inspirations are appreciated, not required
```

---

## SCOPE

### In Scope

- {Core responsibility 1}
- {Core responsibility 2}
- {What this module owns}

```yaml
# CONVERSION RULE: SCOPE — In Scope
# Creates: one Narrative(subtype=scope_boundary, valence=+0.7) per bullet
# Positive valence — these are things this module DOES own
rule: scope_in
  trigger: "bullet list under ### In Scope"
  for_each_line:
    - parse: "- {text}"
    - create_node:
        node_type: Narrative
        subtype: "scope_boundary"
        id: "narrative:scope_in_{module}_{slugify(text)}"
        content: "{text}"
        weight: 0.6
        stability: 0.8
        energy: 0.2
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "SCOPES"
        hierarchy: -0.4           # scope boundary serves the module
        permanence: 0.85
        trust: 0.9
        friction: 0.1
        valence: 0.7              # POSITIVE — this IS in scope
```

### Out of Scope

- {What this explicitly does NOT handle} → see: {other-module}
- {Common misconception about what belongs here}
- {Limitation that's by design, not oversight}

```yaml
# CONVERSION RULE: SCOPE — Out of Scope
# Creates: one Narrative(subtype=scope_boundary, valence=-0.7) per bullet
# Negative valence — these are things this module does NOT own
rule: scope_out
  trigger: "bullet list under ### Out of Scope"
  for_each_line:
    - parse: "- {text}"
      optional_parse: "- {text} → see: {other_module}"
    - create_node:
        node_type: Narrative
        subtype: "scope_boundary"
        id: "narrative:scope_out_{module}_{slugify(text)}"
        content: "{text}"
        weight: 0.6
        stability: 0.8
        energy: 0.2
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "SCOPES"
        hierarchy: -0.4
        permanence: 0.85
        trust: 0.9
        friction: 0.3             # out-of-scope items carry friction — they get asked about
        valence: -0.7             # NEGATIVE — this is NOT in scope
    - if "{other_module}" parsed:
        - create_link:
            from: this_node
            to: "space:module_{slugify(other_module)}"
            r.type: "DELEGATES_TO"
            hierarchy: 0.0         # peer delegation, no hierarchy
            permanence: 0.7
            trust: 0.8
            friction: 0.2
```

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo {Actionable task that needs doing} -->
<!-- @mind:proposition {Improvement idea or future possibility} -->
<!-- @mind:escalation {Blocker or decision needed from human} -->
