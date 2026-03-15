# {Module} — Implementation: Code Architecture and Structure

```
STATUS: {DRAFT | STABLE | DEPRECATED}
CREATED: {DATE}
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_{name}.md
BEHAVIORS:      ./BEHAVIORS_{name}.md
PATTERNS:       ./PATTERNS_{name}.md
MECHANISMS:     ./MECHANISMS_{name}.md (if applicable)
ALGORITHM:      ./ALGORITHM_{name}.md
VALIDATION:     ./VALIDATION_{name}.md
THIS:           IMPLEMENTATION_{name}.md
HEALTH:         ./HEALTH_{name}.md
SYNC:           ./SYNC_{name}.md

IMPL:           {path/to/main/source/file.py}
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

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
        hierarchy: "position-based: OBJECTIVES=-1.0, PATTERNS=-0.75, ..., IMPLEMENTATION=+0.5, SYNC=+1.0"
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

## CODE STRUCTURE

```
{area}/
├── {module}/
│   ├── __init__.py          # {what this exports}
│   ├── {file}.py             # {responsibility}
│   ├── {file}.py             # {responsibility}
│   └── {submodule}/
│       └── {file}.py         # {responsibility}
```

```yaml
# CONVERSION RULE: CODE STRUCTURE tree
# Creates: Space(subtype=module) per directory, Thing(subtype=code_file) per file
# Parse: the ASCII tree structure — directories become Spaces, files become Things
rule: code_structure_tree
  trigger: "fenced code block under ## CODE STRUCTURE"
  parse_tree:
    for_each_directory:
      - parse: "{indent}├── {dir_name}/" OR "{indent}└── {dir_name}/"
      - create_node:
          node_type: Space
          subtype: "module"
          id: "space:module_{slugify(dir_name)}"
          content: "{dir_name}"
          weight: 0.7
          stability: 0.8
          energy: 0.3
      - if parent_directory exists:
          - create_link:
              from: this_node
              to: "space:module_{slugify(parent_dir)}"
              r.type: "BELONGS_TO"
              hierarchy: -0.5
              permanence: 0.9
              trust: 1.0
              friction: 0.0
    for_each_file:
      - parse: "{indent}├── {filename}" OR "{indent}└── {filename}" (no trailing /)
      - extract: comment from "# {comment}" if present
      - create_node:
          node_type: Thing
          subtype: "code_file"
          id: "thing:code_file_{slugify(filename)}"
          content: "{filename}"
          synthesis: "{comment}"     # the inline responsibility description
          weight: 0.5
          stability: 0.7
          energy: 0.3
      - create_link:
          from: this_node
          to: "space:module_{slugify(parent_dir)}"
          r.type: "BELONGS_TO"
          hierarchy: -0.5
          permanence: 0.9
          trust: 1.0
          friction: 0.0
```

### File Responsibilities

| File | Purpose | Key Functions/Classes | Lines | Status |
|------|---------|----------------------|-------|--------|
| `{path}` | {what it does} | `{func}`, `{class}` | ~{n} | {OK/WATCH/SPLIT} |
| `{path}` | {what it does} | `{func}`, `{class}` | ~{n} | {OK/WATCH/SPLIT} |

**Size Thresholds:**
- **OK** (<400 lines): Healthy size, easy to understand
- **WATCH** (400-700 lines): Getting large, consider extraction opportunities
- **SPLIT** (>700 lines): Too large, must split before adding more code

> When a file reaches WATCH status, identify extraction candidates in the EXTRACTION CANDIDATES section below.
> When a file reaches SPLIT status, splitting becomes the next task before any feature work.

```yaml
# CONVERSION RULE: File Responsibilities table
# Updates: existing code_file nodes with content, status, line count
# Creates: Thing(subtype=code_function) / Thing(subtype=code_class) for key exports
# Parse: each table row → update the code_file node, create function/class child nodes
rule: file_responsibilities
  trigger: "table under ### File Responsibilities"
  for_each_row:
    - parse: "| `{path}` | {purpose} | `{func_or_class}`, ... | ~{lines} | {status} |"
    - update_node:
        id: "thing:code_file_{slugify(filename_from_path)}"
        content: "{purpose}"
        weight: |
          if status == "OK":    0.5
          if status == "WATCH": 0.6
          if status == "SPLIT": 0.8    # higher weight = needs attention
        stability: |
          if status == "OK":    0.8
          if status == "WATCH": 0.5
          if status == "SPLIT": 0.2    # low stability = file is volatile
        metadata:
          lines: "{lines}"
          status: "{status}"
    - for_each_key_export in "{func_or_class}".split(", "):
        - create_node:
            node_type: Thing
            subtype: "code_function"    # covers functions AND classes
            id: "thing:code_fn_{slugify(path)}_{slugify(export)}"
            content: "{export}"
            weight: 0.4
            stability: 0.7
            energy: 0.2
        - create_link:
            from: this_node
            to: "thing:code_file_{slugify(filename_from_path)}"
            r.type: "BELONGS_TO"
            hierarchy: -0.5
            permanence: 0.85
            trust: 1.0
            friction: 0.0
```

---

## DESIGN PATTERNS

### Architecture Pattern

**Pattern:** {MVC | Layered | Event-Driven | Pipeline | Repository | etc.}

**Why this pattern:** {rationale for choosing this architecture}

```yaml
# CONVERSION RULE: Architecture Pattern
# Creates: one Narrative(subtype=pattern) for the top-level architecture pattern
# This is the root pattern that other patterns nest under
rule: architecture_pattern
  trigger: "### Architecture Pattern"
  parse:
    - extract: pattern_name from "**Pattern:** {pattern_name}"
    - extract: rationale from "**Why this pattern:** {rationale}"
  create_node:
    node_type: Narrative
    subtype: "pattern"
    id: "narrative:pattern_arch_{slugify(pattern_name)}_{module}"
    content: "{pattern_name}"
    synthesis: "{rationale}"
    weight: 0.9                # architecture pattern is high-weight
    stability: 0.9             # architecture rarely changes
    energy: 0.3
  create_link:
    from: this_node
    to: "space:module_{module}"
    r.type: "GOVERNS"
    hierarchy: 0.8             # pattern is above the module it governs
    permanence: 0.95
    trust: 0.9
    friction: 0.1
```

### Code Patterns in Use

| Pattern | Applied To | Purpose |
|---------|------------|---------|
| {Factory} | `{file}:{class}` | {why this pattern here} |
| {Strategy} | `{file}:{class}` | {why this pattern here} |
| {Observer} | `{file}:{class}` | {why this pattern here} |

```yaml
# CONVERSION RULE: Code Patterns in Use table
# Creates: one Narrative(subtype=pattern) per row, linked to code_file nodes
# Parse: each row → pattern narrative linked to the file(s) it applies to
rule: code_patterns
  trigger: "table under ### Code Patterns in Use"
  for_each_row:
    - parse: "| {pattern_name} | `{file}:{target}` | {purpose} |"
    - create_node:
        node_type: Narrative
        subtype: "pattern"
        id: "narrative:pattern_{slugify(pattern_name)}_{slugify(file)}"
        content: "{pattern_name}"
        synthesis: "{purpose}"
        weight: 0.6
        stability: 0.8
        energy: 0.2
    - create_link:
        from: this_node
        to: "thing:code_file_{slugify(file)}"
        r.type: "GOVERNS"
        hierarchy: 0.4             # pattern is above the code it shapes
        permanence: 0.8
        trust: 0.85
        friction: 0.1
    - create_link:
        from: this_node
        to: "narrative:pattern_arch_{slugify(arch_pattern)}_{module}"
        r.type: "BELONGS_TO"
        hierarchy: -0.4            # child pattern under architecture pattern
        permanence: 0.8
        trust: 0.9
        friction: 0.0
```

### Anti-Patterns to Avoid

- **{Anti-pattern}**: {why it's tempting here} → {what to do instead}
- **God Object**: Don't let any single class/file handle too many responsibilities
- **Premature Abstraction**: Don't create helpers until you have 3+ uses

```yaml
# CONVERSION RULE: Anti-Patterns to Avoid
# Creates: one Narrative(subtype=anti_pattern) per bullet
# Anti-patterns have NEGATIVE valence — they repel, like NON-OBJECTIVES
rule: anti_patterns
  trigger: "bullet list under ### Anti-Patterns to Avoid"
  for_each_line:
    - parse: "- **{name}**: {description} → {alternative}"
      OR: "- **{name}**: {description}"
    - create_node:
        node_type: Narrative
        subtype: "anti_pattern"
        id: "narrative:anti_pattern_{slugify(name)}_{module}"
        content: "{name}: {description}"
        synthesis: "{alternative}"     # null if no alternative given
        weight: 0.5
        stability: 0.8
        energy: 0.2
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "EXCLUDES"
        hierarchy: -0.3
        valence: -0.7                  # NEGATIVE — this is what we DON'T do
        permanence: 0.8
        trust: 0.9
```

### Boundaries

| Boundary | Inside | Outside | Interface |
|----------|--------|---------|-----------|
| {boundary name} | {what's encapsulated} | {what can't see inside} | `{public API}` |

```yaml
# CONVERSION RULE: Boundaries table
# Creates: one Narrative(subtype=boundary) per row
# Boundaries define encapsulation — they create SEPARATES links
rule: boundaries
  trigger: "table under ### Boundaries"
  for_each_row:
    - parse: "| {boundary_name} | {inside} | {outside} | `{interface}` |"
    - create_node:
        node_type: Narrative
        subtype: "boundary"
        id: "narrative:boundary_{slugify(boundary_name)}_{module}"
        content: "{boundary_name}"
        synthesis: "Inside: {inside}. Outside: {outside}. Interface: {interface}"
        weight: 0.7
        stability: 0.85
        energy: 0.2
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "GOVERNS"
        hierarchy: 0.3
        permanence: 0.85
        trust: 0.9
        friction: 0.3                  # boundaries create friction by design
```

---

## SCHEMA

### {Data Structure Name}

```yaml
{StructureName}:
  required:
    - {field}: {type}          # {description}
    - {field}: {type}          # {description}
  optional:
    - {field}: {type}          # {description}
  constraints:
    - {constraint description}
```

### {Data Structure Name}

```yaml
{StructureName}:
  required:
    - {field}: {type}
  relationships:
    - {relation}: {target structure}
```

```yaml
# CONVERSION RULE: SCHEMA section
# Creates: Thing(subtype=data_structure) per schema definition
# Creates: Thing(subtype=field) per required/optional field
# Parse: each YAML block under ### headers within ## SCHEMA
rule: schema_definitions
  trigger: "YAML code blocks under ## SCHEMA subsections"
  for_each_schema_block:
    - parse: "{StructureName}:" as the top-level key
    - create_node:
        node_type: Thing
        subtype: "data_structure"
        id: "thing:schema_{slugify(StructureName)}_{module}"
        content: "{StructureName}"
        weight: 0.7
        stability: 0.8
        energy: 0.3
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "BELONGS_TO"
        hierarchy: -0.4
        permanence: 0.9
        trust: 1.0
        friction: 0.0
    - for_each_field in required + optional:
        - parse: "- {field_name}: {field_type}    # {description}"
        - create_node:
            node_type: Thing
            subtype: "field"
            id: "thing:field_{slugify(StructureName)}_{slugify(field_name)}"
            content: "{field_name}: {field_type}"
            synthesis: "{description}"
            weight: 0.3
            stability: 0.8
            energy: 0.1
        - create_link:
            from: this_node
            to: "thing:schema_{slugify(StructureName)}_{module}"
            r.type: "BELONGS_TO"
            hierarchy: -0.5
            permanence: 0.9
            trust: 1.0
            friction: 0.0
    - if relationships exist:
        - for_each_relationship:
            - parse: "- {relation}: {target_structure}"
            - create_link:
                from: "thing:schema_{slugify(StructureName)}_{module}"
                to: "thing:schema_{slugify(target_structure)}_{module}"
                r.type: "{slugify(relation)}"
                hierarchy: 0.0
                permanence: 0.85
                trust: 0.8
                friction: 0.1
    - if constraints exist:
        - for_each_constraint:
            - store as metadata on the data_structure node
            - metadata.constraints: ["{constraint_1}", "{constraint_2}", ...]
```

---

## ENTRY POINTS

| Entry Point | File:Line | Triggered By |
|-------------|-----------|--------------|
| {name} | `{file}:{line}` | {what triggers this} |
| {name} | `{file}:{line}` | {what triggers this} |

```yaml
# CONVERSION RULE: ENTRY POINTS table
# Creates: Thing(subtype=code_function) with high weight per entry point
# Creates: ENTRY_POINT links from the function to the module
# Parse: each row → function node as a high-weight entry into the system
rule: entry_points
  trigger: "table under ## ENTRY POINTS"
  for_each_row:
    - parse: "| {name} | `{file}:{line}` | {triggered_by} |"
    - create_node:
        node_type: Thing
        subtype: "code_function"
        id: "thing:entry_{slugify(name)}_{module}"
        content: "{name}"
        synthesis: "Triggered by: {triggered_by}"
        weight: 0.9                    # entry points are HIGH weight — they are where execution starts
        stability: 0.8
        energy: 0.6
        metadata:
          file: "{file}"
          line: "{line}"
    - create_link:
        from: this_node
        to: "thing:code_file_{slugify(file)}"
        r.type: "BELONGS_TO"
        hierarchy: -0.3
        permanence: 0.9
        trust: 1.0
        friction: 0.0
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "ENTRY_POINT"
        hierarchy: 0.5                 # entry points are above the module they enter
        permanence: 0.9
        trust: 0.95
        friction: 0.1
```

---

## DATA FLOW AND DOCKING (FLOW-BY-FLOW)

Start with the most important flows to track: those that transform data, cross boundaries, or carry risk (security, money, state, or user-visible output).
Focus on flows that are complex, high-impact, or hard to reason about. Skip trivial pass-through paths.

Each flow should:
- Explain what belongs in this flow and why it matters.
- List concrete steps across files in order.
- Enumerate ALL available docking points in the flow (inputs/outputs).
- Decide which docks are significant enough for HEALTH to select, and why.

### {Flow Name}: {Brief Description}

Explain what this flow covers, what it transforms, and why it matters.
If this flow is low-risk or non-transformative, note why it is still tracked.

```yaml
flow:
  name: {flow_name}
  purpose: {what this flow accomplishes}
  scope: {inputs, outputs, boundaries}
  steps:
    - id: step_1
      description: {what happens in this step}
      file: {path/to/file.py}
      function: {function_or_method}
      input: {type_or_schema}
      output: {type_or_schema}
      trigger: {event_or_call_site}
      side_effects: {state/files/api}
    - id: step_2
      description: {what happens next}
      file: {path/to/file.py}
      function: {function_or_method}
      input: {type_or_schema}
      output: {type_or_schema}
      trigger: {event_or_call_site}
      side_effects: {state/files/api}
  docking_points:
    guidance:
      include_when: {significant, risky, complex, transformative}
      omit_when: {trivial pass-through, redundant, low-impact}
      selection_notes: {how to choose where HEALTH should dock}
    available:
      - id: dock_1
        type: {graph_ops|file|api|event|queue|db|custom}
        direction: {input|output}
        file: {path/to/file.py}
        function: {function_or_method}
        trigger: {event_or_call_site}
        payload: {type_or_schema}
        async_hook: {required|optional|not_applicable}
        needs: {add async hook|add watcher|add interceptor|none}
        notes: {context or risk}
      - id: dock_2
        type: {graph_ops|file|api|event|queue|db|custom}
        direction: {input|output}
        file: {path/to/file.py}
        function: {function_or_method}
        trigger: {event_or_call_site}
        payload: {type_or_schema}
        async_hook: {required|optional|not_applicable}
        needs: {add async hook|add watcher|add interceptor|none}
        notes: {context or risk}
    health_recommended:
      - dock_id: dock_1
        reason: {why this dock is significant}
      - dock_id: dock_2
        reason: {why this dock is significant}
```

```yaml
# CONVERSION RULE: DATA FLOW AND DOCKING section
# Creates: Narrative(subtype=data_flow) per flow
# Creates: FLOWS_TO links between code_files in step order, with docking point metadata
# Parse: each flow YAML block → flow narrative + sequential links between files
rule: data_flows
  trigger: "YAML code blocks under ### {Flow Name} subsections within ## DATA FLOW"
  for_each_flow:
    - parse: flow.name, flow.purpose, flow.scope
    - create_node:
        node_type: Narrative
        subtype: "data_flow"
        id: "narrative:flow_{slugify(flow_name)}_{module}"
        content: "{flow_name}"
        synthesis: "{flow_purpose}"
        weight: 0.8
        stability: 0.7
        energy: 0.5
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "BELONGS_TO"
        hierarchy: -0.3
        permanence: 0.85
        trust: 0.9
        friction: 0.1
    - for_each_step_pair (step_n, step_n+1):
        - resolve: source_file = "thing:code_file_{slugify(step_n.file)}"
        - resolve: target_file = "thing:code_file_{slugify(step_n+1.file)}"
        - create_link:
            from: source_file
            to: target_file
            r.type: "FLOWS_TO"
            hierarchy: 0.0            # flow is lateral, not hierarchical
            permanence: 0.8
            trust: 0.85
            friction: 0.2
            metadata:
              flow: "{flow_name}"
              from_function: "{step_n.function}"
              to_function: "{step_n+1.function}"
              input_type: "{step_n+1.input}"
              output_type: "{step_n.output}"
              step_order: "{n} → {n+1}"
    - for_each_docking_point in available:
        - create_node:
            node_type: Thing
            subtype: "docking_point"
            id: "thing:dock_{slugify(flow_name)}_{dock_id}"
            content: "{dock_id}: {dock_type} ({direction})"
            synthesis: "{notes}"
            weight: |
              if dock_id in health_recommended: 0.7
              else: 0.4
            stability: 0.7
            energy: 0.3
            metadata:
              type: "{dock_type}"
              direction: "{direction}"
              file: "{file}"
              function: "{function}"
              async_hook: "{async_hook}"
              needs: "{needs}"
        - create_link:
            from: this_node
            to: "thing:code_file_{slugify(dock_file)}"
            r.type: "DOCKS_AT"
            hierarchy: -0.2
            permanence: 0.75
            trust: 0.8
            friction: 0.1
        - create_link:
            from: this_node
            to: "narrative:flow_{slugify(flow_name)}_{module}"
            r.type: "BELONGS_TO"
            hierarchy: -0.5
            permanence: 0.8
            trust: 0.9
            friction: 0.0
```

---

## LOGIC CHAINS

### LC1: {Chain Name}

**Purpose:** {what this chain accomplishes}

```
{input}
  → {module_a}.{function}()     # {what it does}
    → {module_b}.{function}()   # {transformation}
      → {module_c}.{function}() # {final step}
        → {output}
```

**Data transformation:**
- Input: `{type}` — {description}
- After step 1: `{type}` — {what changed}
- After step 2: `{type}` — {what changed}
- Output: `{type}` — {final form}

### LC2: {Chain Name}

**Purpose:** {what this chain accomplishes}

```
{flow description}
```

```yaml
# CONVERSION RULE: LOGIC CHAINS section
# Creates: Narrative(subtype=logic_chain) per chain
# Creates: CALLS links between code_functions in sequence
# Parse: each LC block → chain narrative + sequential function call links
rule: logic_chains
  trigger: "### LC{N}: {Chain Name} subsections under ## LOGIC CHAINS"
  for_each_chain:
    - parse: chain_id (e.g., "LC1"), chain_name, purpose
    - create_node:
        node_type: Narrative
        subtype: "logic_chain"
        id: "narrative:chain_{slugify(chain_name)}_{module}"
        content: "{chain_id}: {chain_name}"
        synthesis: "{purpose}"
        weight: 0.7
        stability: 0.75
        energy: 0.4
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "BELONGS_TO"
        hierarchy: -0.3
        permanence: 0.85
        trust: 0.9
        friction: 0.1
    - parse_call_chain from code block:
        - extract: each line "→ {module}.{function}()   # {comment}"
        - for_each_call_pair (call_n, call_n+1):
            - resolve_or_create: source_fn = "thing:code_fn_{slugify(module_a)}_{slugify(function_a)}"
            - resolve_or_create: target_fn = "thing:code_fn_{slugify(module_b)}_{slugify(function_b)}"
            - create_link:
                from: source_fn
                to: target_fn
                r.type: "CALLS"
                hierarchy: 0.1        # caller is slightly above callee
                permanence: 0.8
                trust: 0.85
                friction: 0.15
                metadata:
                  chain: "{chain_id}"
                  step_order: "{n} → {n+1}"
                  comment: "{comment}"
    - if data_transformation section exists:
        - for_each_step:
            - parse: "- {label}: `{type}` — {description}"
            - attach as metadata to the corresponding CALLS link:
                metadata.input_type: "{type}"
                metadata.transformation: "{description}"
```

---

## MODULE DEPENDENCIES

### Internal Dependencies

```
{module_a}
    └── imports → {module_b}
    └── imports → {module_c}
        └── imports → {module_d}
```

```yaml
# CONVERSION RULE: Internal Dependencies
# Creates: DEPENDS_ON links between Space(subtype=module) nodes
# Parse: the indented tree of imports → directed dependency links
rule: internal_dependencies
  trigger: "code block under ### Internal Dependencies"
  parse_tree:
    for_each_import_line:
      - parse: "{indent}└── imports → {target_module}"
      - resolve: source = "space:module_{slugify(parent_module)}"   # determined by indentation
      - resolve: target = "space:module_{slugify(target_module)}"
      - create_link:
          from: source
          to: target
          r.type: "DEPENDS_ON"
          hierarchy: 0.2               # importer is slightly above importee
          permanence: 0.85
          trust: 0.9
          friction: 0.1
          metadata:
            dependency_type: "internal"
```

### External Dependencies

| Package | Used For | Imported By |
|---------|----------|-------------|
| `{package}` | {purpose} | `{file}` |
| `{package}` | {purpose} | `{file}` |

```yaml
# CONVERSION RULE: External Dependencies table
# Creates: Thing(subtype=external_package) per row
# Creates: DEPENDS_ON links from code_file to external_package
# Parse: each row → external package node + dependency link
rule: external_dependencies
  trigger: "table under ### External Dependencies"
  for_each_row:
    - parse: "| `{package}` | {purpose} | `{file}` |"
    - create_node:
        node_type: Thing
        subtype: "external_package"
        id: "thing:pkg_{slugify(package)}"
        content: "{package}"
        synthesis: "{purpose}"
        weight: 0.3
        stability: 0.9                # external packages are stable
        energy: 0.1
    - create_link:
        from: "thing:code_file_{slugify(file)}"
        to: this_node
        r.type: "DEPENDS_ON"
        hierarchy: 0.1
        permanence: 0.8
        trust: 0.7                     # external deps can break on upgrade
        friction: 0.2
        metadata:
          dependency_type: "external"
```

---

## STATE MANAGEMENT

### Where State Lives

| State | Location | Scope | Lifecycle |
|-------|----------|-------|-----------|
| {state name} | `{file}:{var}` | {global/module/instance} | {when created/destroyed} |

```yaml
# CONVERSION RULE: Where State Lives table
# Creates: Thing(subtype=state_var) per state variable
# State vars link to their containing code_file
# Parse: each row → state variable node with scope and lifecycle metadata
rule: state_variables
  trigger: "table under ### Where State Lives"
  for_each_row:
    - parse: "| {state_name} | `{file}:{var}` | {scope} | {lifecycle} |"
    - create_node:
        node_type: Thing
        subtype: "state_var"
        id: "thing:state_{slugify(state_name)}_{module}"
        content: "{state_name}"
        synthesis: "{var} in {file}"
        weight: |
          if scope == "global":   0.8    # global state is high-weight (risky)
          if scope == "module":   0.6
          if scope == "instance": 0.4
        stability: |
          if scope == "global":   0.5    # global state is less stable
          if scope == "module":   0.7
          if scope == "instance": 0.8
        energy: 0.4
        metadata:
          scope: "{scope}"
          lifecycle: "{lifecycle}"
          variable: "{var}"
    - create_link:
        from: this_node
        to: "thing:code_file_{slugify(file)}"
        r.type: "BELONGS_TO"
        hierarchy: -0.4
        permanence: 0.8
        trust: 0.9
        friction: |
          if scope == "global":   0.5    # global state adds friction
          if scope == "module":   0.2
          if scope == "instance": 0.1
```

### State Transitions

```
{state_a} ──{event}──▶ {state_b} ──{event}──▶ {state_c}
```

```yaml
# CONVERSION RULE: State Transitions
# Creates: TRANSITIONS_TO links between state_var nodes
# Parse: each arrow in the transition diagram → directed link with event metadata
rule: state_transitions
  trigger: "code block under ### State Transitions"
  parse_transitions:
    for_each_arrow:
      - parse: "{state_a} ──{event}──▶ {state_b}"
      - resolve: source = "thing:state_{slugify(state_a)}_{module}"
      - resolve: target = "thing:state_{slugify(state_b)}_{module}"
      - create_link:
          from: source
          to: target
          r.type: "TRANSITIONS_TO"
          hierarchy: 0.0               # transitions are lateral
          permanence: 0.8
          trust: 0.85
          friction: 0.2
          metadata:
            event: "{event}"
```

---

## RUNTIME BEHAVIOR

### Initialization

```
1. {what happens first}
2. {what happens next}
3. {system ready}
```

### Main Loop / Request Cycle

```
1. {trigger}
2. {processing}
3. {response}
```

### Shutdown

```
1. {cleanup step}
2. {final step}
```

```yaml
# CONVERSION RULE: RUNTIME BEHAVIOR section
# Creates: Narrative(subtype=runtime_phase) per phase (init, main_loop, shutdown)
# These are descriptive narratives — they don't create new code nodes,
# but link to existing code_function nodes when referenced
rule: runtime_behavior
  trigger: "### Initialization, ### Main Loop, ### Shutdown under ## RUNTIME BEHAVIOR"
  for_each_phase:
    - parse: phase_name from ### header (e.g., "Initialization", "Main Loop", "Shutdown")
    - create_node:
        node_type: Narrative
        subtype: "runtime_phase"
        id: "narrative:runtime_{slugify(phase_name)}_{module}"
        content: "{phase_name}"
        synthesis: concatenated step descriptions
        weight: 0.6
        stability: 0.7
        energy: 0.4
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "BELONGS_TO"
        hierarchy: -0.2
        permanence: 0.8
        trust: 0.9
        friction: 0.1
    - for_each_step:
        - if step references a known function/file:
            - create_link:
                from: this_node
                to: "thing:code_fn_{slugify(referenced_function)}"
                r.type: "EXECUTES"
                hierarchy: 0.2
                permanence: 0.75
                trust: 0.8
                friction: 0.1
                metadata:
                  phase: "{phase_name}"
                  step_order: "{n}"
```

---

## CONCURRENCY MODEL

{If applicable: threads, async, processes}

| Component | Model | Notes |
|-----------|-------|-------|
| {component} | {sync/async/threaded} | {considerations} |

```yaml
# CONVERSION RULE: CONCURRENCY MODEL section
# Creates: Narrative(subtype=concurrency) per component row
# Concurrency models are constraints that govern code behavior
rule: concurrency_model
  trigger: "table under ## CONCURRENCY MODEL"
  for_each_row:
    - parse: "| {component} | {model} | {notes} |"
    - create_node:
        node_type: Narrative
        subtype: "concurrency"
        id: "narrative:concurrency_{slugify(component)}_{module}"
        content: "{component}: {model}"
        synthesis: "{notes}"
        weight: 0.6
        stability: 0.8
        energy: 0.3
    - create_link:
        from: this_node
        to: "space:module_{module}"  # or specific code_file if component maps to one
        r.type: "GOVERNS"
        hierarchy: 0.3
        permanence: 0.85
        trust: 0.85
        friction: 0.2                  # concurrency adds inherent friction
```

---

## CONFIGURATION

| Config | Location | Default | Description |
|--------|----------|---------|-------------|
| `{key}` | `{file}` | `{value}` | {what it controls} |

```yaml
# CONVERSION RULE: CONFIGURATION table
# Creates: Thing(subtype=config) per config key
# Config nodes link to the code_file where they are defined
# Parse: each row → config node with default value and description
rule: configuration
  trigger: "table under ## CONFIGURATION"
  for_each_row:
    - parse: "| `{key}` | `{file}` | `{value}` | {description} |"
    - create_node:
        node_type: Thing
        subtype: "config"
        id: "thing:config_{slugify(key)}_{module}"
        content: "{key}"
        synthesis: "{description}"
        weight: 0.4
        stability: 0.85               # config is relatively stable
        energy: 0.2
        metadata:
          default: "{value}"
          file: "{file}"
    - create_link:
        from: this_node
        to: "thing:code_file_{slugify(file)}"
        r.type: "BELONGS_TO"
        hierarchy: -0.4
        permanence: 0.85
        trust: 0.9
        friction: 0.05                 # config is low-friction
```

---

## BIDIRECTIONAL LINKS

### Code → Docs

Files that reference this documentation:

| File | Line | Reference |
|------|------|-----------|
| `{file}` | {line} | `# DOCS: {path}` |

```yaml
# CONVERSION RULE: Code → Docs table
# Creates: REFERENCES links from code_file nodes to this doc node
# Parse: each row → link from code to the doc it references
rule: code_to_docs
  trigger: "table under ### Code → Docs"
  for_each_row:
    - parse: "| `{file}` | {line} | `# DOCS: {doc_path}` |"
    - create_link:
        from: "thing:code_file_{slugify(file)}"
        to: this_node                  # the IMPLEMENTATION doc node
        r.type: "REFERENCES"
        hierarchy: -0.3               # code is below its governing doc
        permanence: 0.8
        trust: 0.85
        friction: 0.1
        metadata:
          line: "{line}"
          reference_comment: "# DOCS: {doc_path}"
```

### Docs → Code

| Doc Section | Implemented In |
|-------------|----------------|
| ALGORITHM step 1 | `{file}:{function}` |
| ALGORITHM step 2 | `{file}:{function}` |
| BEHAVIOR B1 | `{file}:{function}` |
| VALIDATION V1 | `{test_file}:{test}` |

```yaml
# CONVERSION RULE: Docs → Code table
# Creates: REFERENCES links from doc section nodes to code_function nodes
# Parse: each row → link from the referenced doc section to the implementing code
rule: docs_to_code
  trigger: "table under ### Docs → Code"
  for_each_row:
    - parse: "| {doc_section} | `{file}:{function}` |"
    - resolve: doc_node from "{doc_section}" (e.g., "ALGORITHM step 1" → the algorithm doc node)
    - resolve_or_create: code_fn = "thing:code_fn_{slugify(file)}_{slugify(function)}"
    - create_link:
        from: this_node                # the IMPLEMENTATION doc node (proxy for the referenced section)
        to: code_fn
        r.type: "REFERENCES"
        hierarchy: 0.3                # doc is above implementing code
        permanence: 0.8
        trust: 0.85
        friction: 0.1
        metadata:
          doc_section: "{doc_section}"
          implemented_in: "{file}:{function}"
    - if doc_section starts with "VALIDATION":
        - update_link:
            r.type: "VALIDATED_BY"     # test files get a more specific link type
            trust: 0.9                 # tests are high-trust references
```

---

## EXTRACTION CANDIDATES

Files approaching WATCH/SPLIT status - identify what can be extracted:

| File | Current | Target | Extract To | What to Move |
|------|---------|--------|------------|--------------|
| `{file}` | ~{n}L | <400L | `{new_file}` | {functions/classes to extract} |

```yaml
# CONVERSION RULE: EXTRACTION CANDIDATES table
# Creates: Narrative(subtype=extraction) per row — these are planned refactors
# Links the source code_file to a proposed new code_file
# Parse: each row → extraction narrative linking source and target files
rule: extraction_candidates
  trigger: "table under ## EXTRACTION CANDIDATES"
  for_each_row:
    - parse: "| `{file}` | ~{current_lines}L | <{target_lines}L | `{new_file}` | {what_to_move} |"
    - create_node:
        node_type: Narrative
        subtype: "extraction"
        id: "narrative:extract_{slugify(file)}_{slugify(new_file)}"
        content: "Extract from {file} to {new_file}: {what_to_move}"
        synthesis: "Current: ~{current_lines}L, target: <{target_lines}L"
        weight: 0.6
        stability: 0.4                # extractions are proposals, not stable
        energy: 0.7                   # high energy — this is work that needs doing
    - create_link:
        from: "thing:code_file_{slugify(file)}"
        to: this_node
        r.type: "PROPOSES"
        hierarchy: 0.0
        permanence: 0.5               # low permanence — proposal may change
        trust: 0.7
        friction: 0.4                  # extraction has friction — it's a refactor
```

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo {Missing feature or technical debt} -->
<!-- @mind:proposition {Architecture improvement or pattern to apply} -->
<!-- @mind:escalation {Design uncertainty or pattern choice needing decision} -->

```yaml
# CONVERSION RULE: MARKERS section
# Creates: Narrative nodes for each marker type
# Markers are inline signals — they don't have their own section content,
# but are detected anywhere in the document by their HTML comment pattern
rule: markers
  trigger: "HTML comments matching /<!-- @mind:(todo|proposition|escalation) (.+) -->/"
  for_each_match:
    - parse: "<!-- @mind:{marker_type} {marker_text} -->"
    - create_node:
        node_type: Narrative
        subtype: "{marker_type}"
        id: "narrative:marker_{marker_type}_{slugify(marker_text)}_{module}"
        content: "{marker_text}"
        weight: |
          if marker_type == "escalation": 0.8   # escalations need attention
          if marker_type == "todo":       0.5
          if marker_type == "proposition": 0.4
        stability: 0.3                    # markers are transient by nature
        energy: |
          if marker_type == "escalation": 0.8   # high energy — needs resolution
          if marker_type == "todo":       0.6
          if marker_type == "proposition": 0.4
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "FLAGS"
        hierarchy: -0.2
        permanence: 0.3               # markers are meant to be resolved and removed
        trust: 0.7
        friction: 0.5                  # markers represent unresolved friction
```
