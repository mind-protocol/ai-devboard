# {Module Name} — Algorithm: {Brief Description of Procedures and Logic}

```
STATUS: DRAFT | REVIEW | STABLE
CREATED: {DATE}
VERIFIED: {DATE} against {COMMIT}
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_{name}.md
BEHAVIORS:       ./BEHAVIORS_*.md
PATTERNS:        ./PATTERNS_*.md
MECHANISMS:     ./MECHANISMS_*.md (if applicable)
THIS:            ALGORITHM_*.md (you are here)
VALIDATION:      ./VALIDATION_{name}.md
HEALTH:          ./HEALTH_{name}.md
IMPLEMENTATION:  ./IMPLEMENTATION_{name}.md
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
    - resolve: target_doc_node_id from path (e.g., "./OBJECTIVES_*.md" → "narrative:objectives_{module}")
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

## OVERVIEW

{High-level description of what this algorithm does}
{One paragraph summary of the approach}

```yaml
# CONVERSION RULE: OVERVIEW
# Creates: one Narrative(subtype=algorithm) — the main node for this document
# This is the anchor node; all other nodes in this doc link back to it
rule: algorithm_overview
  trigger: "text block under ## OVERVIEW"
  action:
    - create_node:
        node_type: Narrative
        subtype: "algorithm"
        id: "narrative:algo_{slugify(module_name)}"
        content: "{full_overview_text}"
        weight: 0.9
        stability: 0.7
        energy: 0.5
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "BELONGS_TO"
        hierarchy: -0.7
        permanence: 0.9
        trust: 0.9
        friction: 0.1
```

---

## OBJECTIVES AND BEHAVIORS

| Objective | Behaviors Supported | Why This Algorithm Matters |
|-----------|---------------------|----------------------------|
| {Objective} | {Behavior IDs} | {what this algorithm guarantees} |

```yaml
# CONVERSION RULE: OBJECTIVES AND BEHAVIORS table
# Creates: IMPLEMENTS links from this algorithm node to existing objective/behavior nodes
# Does NOT create new nodes — objectives and behaviors already exist from their own docs
rule: algo_implements_objectives
  trigger: "table rows under ## OBJECTIVES AND BEHAVIORS"
  for_each_row:
    - parse: "| {objective_text} | {behavior_ids_csv} | {justification} |"
    - resolve: objective_node_id → "narrative:obj_{slugify(objective_text)}"
    - create_link:
        from: "narrative:algo_{slugify(module_name)}"
        to: objective_node_id
        r.type: "IMPLEMENTS"
        hierarchy: -0.5          # algorithm serves the objective
        permanence: 0.85
        trust: 0.8
        friction: 0.1
        synthesis: "{justification}"
    - for_each behavior_id in split(behavior_ids_csv, ","):
        - resolve: behavior_node_id → "narrative:behavior_{slugify(trim(behavior_id))}"
        - create_link:
            from: "narrative:algo_{slugify(module_name)}"
            to: behavior_node_id
            r.type: "IMPLEMENTS"
            hierarchy: -0.4
            permanence: 0.8
            trust: 0.8
            friction: 0.1
```

---

## DATA STRUCTURES

### {Structure Name}

```
{Description of the data structure}
{Fields, types, constraints}
```

### {Structure Name}

```
{Description}
```

```yaml
# CONVERSION RULE: DATA STRUCTURES
# Creates: one Thing(subtype=data_structure) per ### heading
# Fields inside the code block are parsed as sub-attributes
rule: data_structures
  trigger: "### headings under ## DATA STRUCTURES"
  for_each_heading:
    - parse: "### {structure_name}" + code block content as {fields_text}
    - create_node:
        node_type: Thing
        subtype: "data_structure"
        id: "thing:ds_{slugify(structure_name)}"
        content: "{structure_name}"
        synthesis: "{fields_text}"       # raw field definitions preserved
        weight: 0.6
        energy: 0.3
    - create_link:
        from: "narrative:algo_{slugify(module_name)}"
        to: this_node
        r.type: "USES"
        hierarchy: 0.3              # algorithm owns its data structures
        permanence: 0.8
        trust: 0.9
        friction: 0.05
    - for_each_field in parse_fields(fields_text):
        - store_as: attribute on this_node
          key: "field_{slugify(field_name)}"
          value: "{field_type}: {field_constraint}"
```

---

## ALGORITHM: {Primary Function Name}

### Step 1: {Step Name}

{What happens in this step}
{Why this step exists}

```
{pseudocode if helpful}
```

### Step 2: {Step Name}

{What happens}
{Key decisions or branches}

### Step 3: {Step Name}

{What happens}
{How results are assembled}

```yaml
# CONVERSION RULE: ALGORITHM steps
# Creates: one Narrative(subtype=algorithm_step) per ### Step N heading
# Steps are linked in sequence via NEXT_STEP
rule: algorithm_steps
  trigger: "### Step N headings under ## ALGORITHM"
  for_each_heading:
    - parse: "### Step {step_number}: {step_name}" + body text as {step_content}
    - create_node:
        node_type: Narrative
        subtype: "algorithm_step"
        id: "narrative:algo_{slugify(module_name)}_step_{step_number}"
        content: "{step_name}"
        synthesis: "{step_content}"
        weight: "0.8 - (step_number - 1) * 0.05"   # earlier steps slightly heavier
        stability: 0.7
        energy: 0.4
    - create_link:
        from: "narrative:algo_{slugify(module_name)}"
        to: this_node
        r.type: "CONTAINS"
        hierarchy: 0.5             # algorithm contains its steps
        permanence: 0.9
        trust: 0.95
        friction: 0.0
  after_all_steps:
    - for_each_consecutive_pair (step_a, step_b):
        - create_link:
            from: "narrative:algo_{slugify(module_name)}_step_{step_a.number}"
            to: "narrative:algo_{slugify(module_name)}_step_{step_b.number}"
            r.type: "NEXT_STEP"
            hierarchy: 0.0          # peer-to-peer, sequential
            permanence: 0.9
            trust: 0.95
            friction: 0.0
```

---

## KEY DECISIONS

### D1: {Decision Point}

```
IF {condition}:
    {what happens — path A}
    {why this path}
ELSE:
    {what happens — path B}
    {why this path}
```

### D2: {Decision Point}

```
IF {condition}:
    {path A}
ELSE:
    {path B}
```

```yaml
# CONVERSION RULE: KEY DECISIONS
# Creates: one Narrative(subtype=decision_point) per ### D{N} heading
# Each decision links to the algorithm step where the branching occurs
rule: key_decisions
  trigger: "### D{N} headings under ## KEY DECISIONS"
  for_each_heading:
    - parse: "### D{decision_number}: {decision_name}" + code block as {branch_logic}
    - create_node:
        node_type: Narrative
        subtype: "decision_point"
        id: "narrative:algo_{slugify(module_name)}_decision_{decision_number}"
        content: "{decision_name}"
        synthesis: "{branch_logic}"
        weight: 0.75
        stability: 0.7
        energy: 0.5               # decisions carry tension
    - create_link:
        from: "narrative:algo_{slugify(module_name)}"
        to: this_node
        r.type: "CONTAINS"
        hierarchy: 0.4
        permanence: 0.85
        trust: 0.9
        friction: 0.2             # decisions introduce friction by nature
    - resolve: branching_step → find algorithm_step whose content references {decision_name} or condition
    - if branching_step found:
        - create_link:
            from: this_node
            to: branching_step
            r.type: "BRANCHES_AT"
            hierarchy: 0.0         # peer relationship — decision annotates step
            permanence: 0.85
            trust: 0.8
            friction: 0.3          # branching = friction point
            ambivalence: 0.5       # both paths have merit
```

---

## DATA FLOW

```
{input}
    ↓
{transformation 1}
    ↓
{transformation 2}
    ↓
{output}
```

```yaml
# CONVERSION RULE: DATA FLOW
# Creates: FLOWS_TO links between algorithm steps based on the flow diagram
# Does NOT create new nodes — reuses existing algorithm_step nodes
rule: data_flow
  trigger: "flow diagram under ## DATA FLOW (lines separated by ↓)"
  action:
    - parse: sequence of {stage_name} entries separated by "↓"
    - for_each_consecutive_pair (stage_a, stage_b):
        - resolve: step_a_node → match stage_a text against algorithm_step nodes (by content similarity)
        - resolve: step_b_node → match stage_b text against algorithm_step nodes (by content similarity)
        - if both resolve:
            - create_link:
                from: step_a_node
                to: step_b_node
                r.type: "FLOWS_TO"
                hierarchy: 0.0       # data flows peer-to-peer
                permanence: 0.8
                trust: 0.85
                friction: 0.05
        - if stage is first entry (input):
            - create_link:
                from: "narrative:algo_{slugify(module_name)}"
                to: step_a_node
                r.type: "INPUT"
                hierarchy: 0.3
                permanence: 0.8
                trust: 0.9
        - if stage is last entry (output):
            - create_link:
                from: step_b_node
                to: "narrative:algo_{slugify(module_name)}"
                r.type: "OUTPUT"
                hierarchy: -0.3
                permanence: 0.8
                trust: 0.9
```

---

## COMPLEXITY

**Time:** O({complexity}) — {explanation}

**Space:** O({complexity}) — {explanation}

**Bottlenecks:**
- {Where might this be slow?}
- {What could cause performance issues?}

```yaml
# CONVERSION RULE: COMPLEXITY
# Creates: Thing(subtype=metric) for time complexity and space complexity
# Bottlenecks become linked risk annotations
rule: complexity_metrics
  trigger: "## COMPLEXITY section"
  action:
    - parse: "**Time:** O({time_complexity}) — {time_explanation}"
    - create_node:
        node_type: Thing
        subtype: "metric"
        id: "thing:metric_{slugify(module_name)}_time_complexity"
        content: "Time: O({time_complexity})"
        synthesis: "{time_explanation}"
        weight: 0.5
        energy: 0.3
    - create_link:
        from: "narrative:algo_{slugify(module_name)}"
        to: this_node
        r.type: "MEASURED_BY"
        hierarchy: 0.2
        permanence: 0.7
        trust: 0.7
        friction: 0.1
    - parse: "**Space:** O({space_complexity}) — {space_explanation}"
    - create_node:
        node_type: Thing
        subtype: "metric"
        id: "thing:metric_{slugify(module_name)}_space_complexity"
        content: "Space: O({space_complexity})"
        synthesis: "{space_explanation}"
        weight: 0.5
        energy: 0.3
    - create_link:
        from: "narrative:algo_{slugify(module_name)}"
        to: this_node
        r.type: "MEASURED_BY"
        hierarchy: 0.2
        permanence: 0.7
        trust: 0.7
        friction: 0.1
    - for_each_bottleneck in "**Bottlenecks:**" bullet list:
        - parse: "- {bottleneck_text}"
        - create_node:
            node_type: Thing
            subtype: "metric"
            id: "thing:metric_{slugify(module_name)}_bottleneck_{index}"
            content: "{bottleneck_text}"
            weight: 0.4
            energy: 0.5           # bottlenecks carry latent risk energy
        - create_link:
            from: "narrative:algo_{slugify(module_name)}"
            to: this_node
            r.type: "RISK"
            hierarchy: 0.1
            permanence: 0.6
            trust: 0.6
            friction: 0.4         # bottlenecks are friction by definition
```

---

## HELPER FUNCTIONS

### `{helper_name}()`

**Purpose:** {what it does}

**Logic:** {brief description}

### `{helper_name}()`

**Purpose:** {what it does}

**Logic:** {brief description}

```yaml
# CONVERSION RULE: HELPER FUNCTIONS
# Creates: one Thing(subtype=code_function) per ### `{name}()` heading
# Each helper links to the main algorithm node
rule: helper_functions
  trigger: "### `{name}()` headings under ## HELPER FUNCTIONS"
  for_each_heading:
    - parse: "### `{helper_name}()`" + "**Purpose:** {purpose}" + "**Logic:** {logic}"
    - create_node:
        node_type: Thing
        subtype: "code_function"
        id: "thing:fn_{slugify(helper_name)}"
        content: "{helper_name}()"
        synthesis: "{purpose}. {logic}"
        weight: 0.5
        energy: 0.3
    - create_link:
        from: "narrative:algo_{slugify(module_name)}"
        to: this_node
        r.type: "USES"
        hierarchy: 0.4            # algorithm owns its helpers
        permanence: 0.8
        trust: 0.9
        friction: 0.05
    - resolve: calling_steps → find algorithm_step nodes whose content references {helper_name}
    - for_each calling_step:
        - create_link:
            from: calling_step
            to: this_node
            r.type: "CALLS"
            hierarchy: 0.2
            permanence: 0.75
            trust: 0.85
            friction: 0.05
```

---

## INTERACTIONS

| Module | What We Call | What We Get |
|--------|--------------|-------------|
| {path} | {function} | {result} |
| {path} | {function} | {result} |

```yaml
# CONVERSION RULE: INTERACTIONS table
# Creates: CALLS links from this algorithm node to external module nodes
# External modules are resolved by path; if the node doesn't exist, a placeholder is created
rule: interactions
  trigger: "table rows under ## INTERACTIONS"
  for_each_row:
    - parse: "| {module_path} | {function_called} | {result_description} |"
    - resolve: external_module_node_id from module_path
      fallback: create_node:
        node_type: Thing
        subtype: "code_function"
        id: "thing:fn_{slugify(function_called)}"
        content: "{function_called}"
        synthesis: "External: {module_path} → returns {result_description}"
        weight: 0.4
        energy: 0.2
    - create_link:
        from: "narrative:algo_{slugify(module_name)}"
        to: external_module_node_id
        r.type: "CALLS"
        hierarchy: 0.0             # peer-to-peer across modules
        permanence: 0.7
        trust: 0.75
        friction: 0.15             # cross-module calls carry integration friction
        synthesis: "calls {function_called}, receives {result_description}"
```

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo {Algorithm improvement to consider} -->
<!-- @mind:proposition {Optimization opportunity or alternative approach} -->
<!-- @mind:escalation {Design question needing decision} -->

```yaml
# CONVERSION RULE: MARKERS
# Markers are NOT graph nodes — they are transient annotations
# They are consumed by the sync process and converted to tasks/proposals/escalations
rule: markers
  trigger: "HTML comments matching /<!-- @mind:(todo|proposition|escalation) .* -->/"
  for_each_match:
    - parse: "<!-- @mind:{marker_type} {marker_text} -->"
    - action: "pass to SYNC process — markers are ephemeral, not persisted in graph"
    - note: "markers are processed by SYNC_*.md workflow, not stored as nodes"
```
