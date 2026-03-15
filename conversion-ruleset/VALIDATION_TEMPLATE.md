# {Module Name} — Validation: What Must Be True

```
STATUS: DRAFT | DESIGNING | CANONICAL
CREATED: {DATE}
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_{name}.md
PATTERNS:        ./PATTERNS_*.md
BEHAVIORS:       ./BEHAVIORS_*.md
THIS:            VALIDATION_*.md (you are here)
ALGORITHM:       ./ALGORITHM_*.md (HOW — mechanisms go here)
IMPLEMENTATION:  ./IMPLEMENTATION_{name}.md
HEALTH:          ./HEALTH_{name}.md
SYNC:            ./SYNC_{name}.md
```

```yaml
# CONVERSION RULE: CHAIN section
# Creates: link CHAIN_NEXT between this doc node and each referenced doc node
# Parse: each line "KEY: ./PATH" → link to target doc node
rule: chain_pointers
  trigger: "any line matching /^[A-Z]+:\s+\.\//"
  for_each_match:
    - resolve: target_doc_node_id from path (e.g., "./ALGORITHM_*.md" → "narrative:algorithm_{module}")
    - create_link:
        from: this_node
        to: target_doc_node_id
        r.type: "CHAIN_NEXT"
        hierarchy: "position-based: OBJECTIVES=-1.0, PATTERNS=-0.75, BEHAVIORS=-0.5, VALIDATION=-0.25, ALGORITHM=0.0, IMPLEMENTATION=+0.5, SYNC=+1.0"
        permanence: 0.95
        trust: 1.0
        friction: 0.0
```

---

## PURPOSE

**Validation = what we care about being true.**

Not mechanisms. Not test paths. Not how things work.

What properties, if violated, would mean the system has failed its purpose?

These are the value-producing invariants — the things that make the module worth building.

```yaml
# CONVERSION RULE: PURPOSE section
# Creates: nothing — PURPOSE is prose context, not a graph entity
# It provides human-readable framing but carries no graph semantics.
# The content is implicitly captured by the module's Narrative node.
rule: purpose_prose
  trigger: "## PURPOSE section"
  action: skip   # no nodes or links — context only
```

---

## INVARIANTS

> **Naming:** Name by the value protected, not the mechanism.
> Bad: "Energy decay runs each tick"
> Good: "Attention fades without reinforcement"

```yaml
# CONVERSION RULE: INVARIANTS section header
# Creates: nothing directly — individual V1/V2/V3 subsections create nodes below
# The naming guidance is prose for humans, not graph structure.
rule: invariants_header
  trigger: "## INVARIANTS section"
  action: skip   # individual ### Vn subsections handle node creation
```

### V1: {Value Protected}

**Why we care:** {What breaks or what value is lost if this invariant fails}

```
MUST:   {What must be true}
NEVER:  {What must never happen}
```

```yaml
# CONVERSION RULE: V1 invariant
# Creates: one Narrative(subtype=invariant) node
# Parse: "### V1: {title}" → invariant name
#        "**Why we care:** {text}" → synthesis
#        "MUST: {text}" → must_condition
#        "NEVER: {text}" → never_condition
rule: invariant_v1
  trigger: "### V1: heading with MUST/NEVER code block"
  action:
    - parse:
        title: "### V1: {value_protected}"
        why: "**Why we care:** {consequence}"
        must: "MUST:   {must_text}"
        never: "NEVER:  {never_text}"
    - create_node:
        node_type: Narrative
        subtype: "invariant"
        id: "narrative:invariant_{module}_v1"
        content: "{value_protected}"
        synthesis: "{consequence}"
        must: "{must_text}"
        never: "{never_text}"
        weight: 0.95             # derived from INVARIANT INDEX priority — see below
        stability: 0.95          # invariants resist change
        energy: 0.4
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "BELONGS_TO"
        hierarchy: -0.6
        permanence: 0.95
        trust: 1.0
        friction: 0.0
```

### V2: {Value Protected}

**Why we care:** {Consequence of violation}

```
MUST:   {What must be true}
NEVER:  {What must never happen}
```

```yaml
# CONVERSION RULE: V2 invariant
# Creates: one Narrative(subtype=invariant) node
# Same parse pattern as V1
rule: invariant_v2
  trigger: "### V2: heading with MUST/NEVER code block"
  action:
    - parse:
        title: "### V2: {value_protected}"
        why: "**Why we care:** {consequence}"
        must: "MUST:   {must_text}"
        never: "NEVER:  {never_text}"
    - create_node:
        node_type: Narrative
        subtype: "invariant"
        id: "narrative:invariant_{module}_v2"
        content: "{value_protected}"
        synthesis: "{consequence}"
        must: "{must_text}"
        never: "{never_text}"
        weight: 0.8              # derived from INVARIANT INDEX priority — see below
        stability: 0.95          # invariants resist change
        energy: 0.4
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "BELONGS_TO"
        hierarchy: -0.6
        permanence: 0.95
        trust: 1.0
        friction: 0.0
```

### V3: {Value Protected}

**Why we care:** {Consequence of violation}

```
MUST:   {What must be true}
NEVER:  {What must never happen}
```

```yaml
# CONVERSION RULE: V3 invariant
# Creates: one Narrative(subtype=invariant) node
# Same parse pattern as V1/V2
rule: invariant_v3
  trigger: "### V3: heading with MUST/NEVER code block"
  action:
    - parse:
        title: "### V3: {value_protected}"
        why: "**Why we care:** {consequence}"
        must: "MUST:   {must_text}"
        never: "NEVER:  {never_text}"
    - create_node:
        node_type: Narrative
        subtype: "invariant"
        id: "narrative:invariant_{module}_v3"
        content: "{value_protected}"
        synthesis: "{consequence}"
        must: "{must_text}"
        never: "{never_text}"
        weight: 0.6              # derived from INVARIANT INDEX priority — see below
        stability: 0.95          # invariants resist change
        energy: 0.4
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "BELONGS_TO"
        hierarchy: -0.6
        permanence: 0.95
        trust: 1.0
        friction: 0.0
```

---

## PRIORITY

| Priority | Meaning | If Violated |
|----------|---------|-------------|
| **CRITICAL** | System purpose fails | Unusable |
| **HIGH** | Major value lost | Degraded severely |
| **MEDIUM** | Partial value lost | Works but worse |

```yaml
# CONVERSION RULE: PRIORITY table
# Creates: no new nodes — this table defines the weight mapping used by invariants
# The priority levels map to invariant weight values:
#   CRITICAL → weight 0.95
#   HIGH     → weight 0.8
#   MEDIUM   → weight 0.6
# These weights are applied when creating invariant nodes (V1/V2/V3 above).
# The table itself is a reference legend, not a graph entity.
rule: priority_legend
  trigger: "## PRIORITY table"
  action: define_weight_mapping
  mapping:
    CRITICAL: 0.95
    HIGH: 0.8
    MEDIUM: 0.6
  note: "Weights are applied to invariant nodes via the INVARIANT INDEX below.
         If an invariant's priority in the INDEX differs from its positional default,
         the INDEX priority takes precedence."
```

---

## INVARIANT INDEX

| ID | Value Protected | Priority |
|----|-----------------|----------|
| V1 | {value} | CRITICAL |
| V2 | {value} | HIGH |
| V3 | {value} | MEDIUM |

```yaml
# CONVERSION RULE: INVARIANT INDEX
# Creates: summary links between invariant nodes and the behaviors they constrain
# Parse: each row "| Vn | {value} | {priority} |"
# This table is the authoritative source for invariant priority/weight.
# If weight on the invariant node conflicts with this table, this table wins.
rule: invariant_index
  trigger: "table under ## INVARIANT INDEX"
  for_each_row:
    - parse: "| {id} | {value_protected} | {priority} |"
    - resolve: invariant_node_id = "narrative:invariant_{module}_{lowercase(id)}"
    - update_node:
        target: invariant_node_id
        weight: "priority_legend.mapping[{priority}]"   # CRITICAL=0.95, HIGH=0.8, MEDIUM=0.6
        stability: 0.95
    - create_link:
        from: invariant_node_id
        to: "narrative:behavior_{module}_{lowercase(id)}_*"   # glob — links to all behaviors this invariant constrains
        r.type: "CONSTRAINS"
        hierarchy: 0.5             # invariant is above the behavior it constrains
        trust: 1.0                 # invariant authority is absolute
        friction: 0.2              # constraint creates some friction
        permanence: 0.95
        valence: 0.8               # constraining is a positive force — it protects value
```

---

## MARKERS

<!-- @mind:todo {Invariant that needs clarification} -->
<!-- @mind:proposition {Additional invariant to consider} -->
<!-- @mind:escalation {Unclear whether this is actually critical} -->

```yaml
# CONVERSION RULE: MARKERS
# Creates: one Narrative(subtype=marker) per comment marker
# Markers are lightweight attention signals — low energy, low stability
rule: markers
  trigger: "HTML comments matching /<!-- @mind:(todo|proposition|escalation) (.+) -->/"
  for_each_match:
    - parse: "<!-- @mind:{marker_type} {marker_text} -->"
    - create_node:
        node_type: Narrative
        subtype: "marker"
        id: "narrative:marker_{module}_{slugify(marker_text)}"
        content: "{marker_text}"
        marker_type: "{marker_type}"     # todo | proposition | escalation
        weight: 0.3
        stability: 0.2                   # markers are ephemeral — they get resolved
        energy: 0.6                      # markers need attention
    - create_link:
        from: this_node
        to: "narrative:validation_{module}"
        r.type: "FLAGS"
        hierarchy: -0.2
        trust: 0.5
        friction: 0.4                    # markers signal unresolved tension
        permanence: 0.3
```
