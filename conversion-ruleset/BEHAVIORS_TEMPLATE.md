# {Module Name} — Behaviors: {Brief Description of Observable Effects}

```
STATUS: DRAFT | REVIEW | STABLE
CREATED: {DATE}
VERIFIED: {DATE} against {COMMIT}
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_{name}.md
THIS:            BEHAVIORS_*.md (you are here)
PATTERNS:        ./PATTERNS_*.md
MECHANISMS:      ./MECHANISMS_*.md (if applicable)
ALGORITHM:       ./ALGORITHM_*.md
VALIDATION:      ./VALIDATION_{name}.md
HEALTH:          ./HEALTH_{name}.md
IMPLEMENTATION:  ./IMPLEMENTATION_*.md
SYNC:            ./SYNC_{name}.md

IMPL:            {path/to/main/source/file.py}
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

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
        hierarchy: "position-based: OBJECTIVES=-1.0, BEHAVIORS=-0.75, ..., SYNC=+1.0"
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

## BEHAVIORS

> **Naming:** Name behaviors by observable result, not by concept.
> Bad: "Moment Creation — Exhaust of Thinking"
> Good: "Thinking Produces Graph State"

### B1: {Observable Result}

**Why:** {Why this behavior exists. What problem it solves. What objective it serves.}

```
GIVEN:  {precondition — what state must exist}
WHEN:   {action or trigger — what happens}
THEN:   {outcome — what should result}
AND:    {additional outcome if needed}
```

### B2: {Observable Result}

**Why:** {Why this behavior matters.}

```
GIVEN:  {precondition}
WHEN:   {action}
THEN:   {outcome}
```

### B3: {Observable Result}

**Why:** {Why this behavior matters.}

```
GIVEN:  {precondition}
WHEN:   {action}
THEN:   {outcome}
```

```yaml
# CONVERSION RULE: BEHAVIORS
# Creates: one Moment(subtype=behavior) per ### B{N} heading
# Parse: heading text as observable result, GIVEN/WHEN/THEN as structured fields
rule: behaviors
  trigger: "### B{N}: heading under ## BEHAVIORS"
  for_each_heading:
    - parse:
        id_key: "B{N}" from heading (e.g., "B1", "B2", "B3")
        observable_result: heading text after "B{N}: "
        why: paragraph after "**Why:**"
        given: line starting with "GIVEN:" inside fenced code block
        when: line starting with "WHEN:" inside fenced code block
        then: line starting with "THEN:" inside fenced code block
        and: line starting with "AND:" inside fenced code block (optional)
    - create_node:
        node_type: Moment
        subtype: "behavior"
        id: "moment:behavior_{module}_{id_key}"
        content: "{observable_result}"
        synthesis: "{why}"
        precondition: "{given}"
        trigger: "{when}"
        outcome: "{then}"
        additional: "{and}"          # null if absent
        weight: 0.8
        stability: 0.7
        energy: 0.5
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "BELONGS_TO"
        hierarchy: -0.6
        permanence: 0.9
        trust: 0.9
        friction: 0.1
```

---

## OBJECTIVES SERVED

| Behavior ID | Objective | Why It Matters |
|-------------|-----------|----------------|
| B1 | {Objective} | {what the behavior protects or enables} |
| B2 | {Objective} | {what the behavior protects or enables} |

```yaml
# CONVERSION RULE: OBJECTIVES SERVED
# Creates: one VALIDATES link per table row, from behavior to objective
# Parse: each row "| B{N} | {Objective} | {justification} |"
rule: objectives_served
  trigger: "table rows under ## OBJECTIVES SERVED"
  for_each_row:
    - parse: "| {behavior_id} | {objective_text} | {justification} |"
    - resolve:
        behavior_node: "moment:behavior_{module}_{behavior_id}"
        objective_node: "narrative:obj_{slugify(objective_text)}"
    - create_link:
        from: behavior_node
        to: objective_node
        r.type: "VALIDATES"
        hierarchy: -0.4              # behavior serves the objective
        trust: 0.85
        friction: 0.1
        permanence: 0.85
        synthesis: "{justification}"
```

---

## INPUTS / OUTPUTS

### Primary Function: `{function_name}()`

**Inputs:**

| Parameter | Type | Description |
|-----------|------|-------------|
| {name} | {type} | {what it is} |
| {name} | {type} | {what it is} |

**Outputs:**

| Return | Type | Description |
|--------|------|-------------|
| {name} | {type} | {what it is} |

**Side Effects:**

- {What state changes, if any}
- {What external effects, if any}

```yaml
# CONVERSION RULE: INPUTS / OUTPUTS
# Creates: one Thing(subtype=interface_contract) per input/output parameter
# The function itself becomes a Thing(subtype=function_contract)
# Side effects become Moment(subtype=side_effect) nodes
rule: inputs_outputs
  trigger: "### Primary Function: `{function_name}()`"
  create_function_node:
    - parse: function_name from heading backticks
    - create_node:
        node_type: Thing
        subtype: "function_contract"
        id: "thing:fn_{module}_{slugify(function_name)}"
        content: "{function_name}()"
        weight: 0.7
        energy: 0.4
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "BELONGS_TO"
        hierarchy: -0.5
        permanence: 0.9
        trust: 0.9
  for_each_input_row:
    - parse: "| {param_name} | {param_type} | {description} |"
    - create_node:
        node_type: Thing
        subtype: "interface_contract"
        id: "thing:input_{module}_{slugify(function_name)}_{slugify(param_name)}"
        content: "{param_name}"
        data_type: "{param_type}"
        synthesis: "{description}"
        weight: 0.5
        energy: 0.3
    - create_link:
        from: this_node
        to: "thing:fn_{module}_{slugify(function_name)}"
        r.type: "FEEDS"
        hierarchy: -0.3              # input serves the function
        trust: 0.9
        friction: 0.05
        permanence: 0.8
  for_each_output_row:
    - parse: "| {return_name} | {return_type} | {description} |"
    - create_node:
        node_type: Thing
        subtype: "interface_contract"
        id: "thing:output_{module}_{slugify(function_name)}_{slugify(return_name)}"
        content: "{return_name}"
        data_type: "{return_type}"
        synthesis: "{description}"
        weight: 0.5
        energy: 0.3
    - create_link:
        from: "thing:fn_{module}_{slugify(function_name)}"
        to: this_node
        r.type: "PRODUCES"
        hierarchy: 0.3               # function produces the output
        trust: 0.9
        friction: 0.05
        permanence: 0.8
  for_each_side_effect:
    - parse: "- {effect_text}"
    - create_node:
        node_type: Moment
        subtype: "side_effect"
        id: "moment:side_effect_{module}_{slugify(function_name)}_{slugify(effect_text)}"
        content: "{effect_text}"
        weight: 0.4
        energy: 0.3
    - create_link:
        from: "thing:fn_{module}_{slugify(function_name)}"
        to: this_node
        r.type: "CAUSES"
        hierarchy: 0.2
        trust: 0.7                   # side effects may not always fire
        friction: 0.2
        permanence: 0.7
```

---

## EDGE CASES

### E1: {Edge Case Name}

```
GIVEN:  {unusual or boundary condition}
THEN:   {what should happen}
```

### E2: {Edge Case Name}

```
GIVEN:  {unusual condition}
THEN:   {what should happen}
```

```yaml
# CONVERSION RULE: EDGE CASES
# Creates: one Moment(subtype=edge_case) per ### E{N} heading
# Links to parent behavior via EXTENDS
rule: edge_cases
  trigger: "### E{N}: heading under ## EDGE CASES"
  for_each_heading:
    - parse:
        id_key: "E{N}" from heading (e.g., "E1", "E2")
        edge_case_name: heading text after "E{N}: "
        given: line starting with "GIVEN:" inside fenced code block
        then: line starting with "THEN:" inside fenced code block
    - create_node:
        node_type: Moment
        subtype: "edge_case"
        id: "moment:edge_case_{module}_{id_key}"
        content: "{edge_case_name}"
        precondition: "{given}"
        outcome: "{then}"
        weight: 0.5
        stability: 0.6              # edge cases are less stable than core behaviors
        energy: 0.4
    - create_link:
        from: this_node
        to: "moment:behavior_{module}_{nearest_behavior_id}"   # link to closest B{N}
        r.type: "EXTENDS"
        hierarchy: -0.2             # edge case is subordinate to core behavior
        trust: 0.8
        friction: 0.3               # edge cases represent tension points
        permanence: 0.75
```

---

## ANTI-BEHAVIORS

What should NOT happen:

### A1: {Anti-Behavior Name}

```
GIVEN:   {condition}
WHEN:    {action}
MUST NOT: {what should never happen}
INSTEAD:  {what should happen}
```

### A2: {Anti-Behavior Name}

```
GIVEN:   {condition}
WHEN:    {action}
MUST NOT: {bad outcome}
INSTEAD:  {correct outcome}
```

```yaml
# CONVERSION RULE: ANTI-BEHAVIORS
# Creates: one Moment(subtype=anti_behavior) per ### A{N} heading
# NEGATIVE valence — these repel, they define what must NOT happen
# Links to parent behavior via PREVENTS
rule: anti_behaviors
  trigger: "### A{N}: heading under ## ANTI-BEHAVIORS"
  for_each_heading:
    - parse:
        id_key: "A{N}" from heading (e.g., "A1", "A2")
        anti_behavior_name: heading text after "A{N}: "
        given: line starting with "GIVEN:" inside fenced code block
        when: line starting with "WHEN:" inside fenced code block
        must_not: line starting with "MUST NOT:" inside fenced code block
        instead: line starting with "INSTEAD:" inside fenced code block
    - create_node:
        node_type: Moment
        subtype: "anti_behavior"
        id: "moment:anti_behavior_{module}_{id_key}"
        content: "{anti_behavior_name}"
        precondition: "{given}"
        trigger: "{when}"
        forbidden_outcome: "{must_not}"
        correct_outcome: "{instead}"
        weight: 0.7
        stability: 0.8              # anti-behaviors are firm constraints
        energy: 0.3
        valence: -0.8               # NEGATIVE — this is what must NOT happen
    - create_link:
        from: this_node
        to: "moment:behavior_{module}_{nearest_behavior_id}"   # link to the behavior it guards
        r.type: "PREVENTS"
        hierarchy: -0.1             # anti-behavior is a peer constraint, not subordinate
        trust: 0.9
        friction: 0.6               # high friction — this is a boundary
        valence: -0.7               # NEGATIVE — repulsive link
        permanence: 0.9             # anti-behaviors are durable constraints
```

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo {Behavior that needs clarification} -->
<!-- @mind:proposition {Potential future behavior} -->
<!-- @mind:escalation {Uncertain edge case needing decision} -->

```yaml
# CONVERSION RULE: MARKERS
# Creates: one Moment(subtype=marker) per HTML comment matching @mind:{type}
# Markers are lightweight signals — low weight, low permanence
rule: markers
  trigger: "HTML comment matching /<!-- @mind:(todo|proposition|escalation) (.+) -->/"
  for_each_match:
    - parse: "<!-- @mind:{marker_type} {marker_text} -->"
    - create_node:
        node_type: Moment
        subtype: "marker"
        id: "moment:marker_{module}_{marker_type}_{slugify(marker_text)}"
        content: "{marker_text}"
        marker_type: "{marker_type}"  # todo | proposition | escalation
        weight: 0.2
        stability: 0.3               # markers are transient
        energy: 0.6                   # but they want attention
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "FLAGS"
        hierarchy: -0.1
        trust: 0.5
        friction: 0.4
        permanence: 0.3              # markers are meant to be resolved and removed
```
