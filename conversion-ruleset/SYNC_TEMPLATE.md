# {Module/Area/Project} — Sync: Current State

```
LAST_UPDATED: {DATE}
UPDATED_BY: {AGENT/HUMAN}
STATUS: {DESIGNING | CANONICAL | PROPOSED | DEPRECATED}
```

```yaml
# CONVERSION RULE: Header metadata
# Creates: the root doc node for this SYNC file
rule: sync_header
  trigger: "fenced block at top of file with LAST_UPDATED, UPDATED_BY, STATUS"
  parse: "LAST_UPDATED: {date}, UPDATED_BY: {author}, STATUS: {status}"
  create_node:
    node_type: Narrative
    subtype: "sync_doc"
    id: "narrative:sync_{module}"
    content: "Sync state for {module}"
    synthesis: "SYNC — {module} — last updated {date} by {author}"
    weight: 0.5
    stability: 0.6
    energy: 0.3
    status: "{status}"
  create_link:
    from: this_node
    to: "space:module_{module}"
    r.type: "BELONGS_TO"
    hierarchy: -0.8
    permanence: 0.9
    trust: 0.9
    friction: 0.1
```

---

## MATURITY

**What's canonical (v1):**
- {Stable, shipped, can rely on}

**What's still being designed:**
- {In progress, not final, might change}

**What's proposed (v2+):**
- {Future ideas, not in scope for v1}

```yaml
# CONVERSION RULE: MATURITY
# Updates: the sync_doc node with maturity classification
# Parse: three bullet lists under canonical / designing / proposed
rule: maturity_classification
  trigger: "## MATURITY section with three labeled subsections"
  parse:
    canonical: ["{canonical_items}"]
    designing: ["{designing_items}"]
    proposed: ["{proposed_items}"]
  update_node:
    target: "narrative:sync_{module}"
    set:
      maturity_canonical: "{canonical_items}"
      maturity_designing: "{designing_items}"
      maturity_proposed: "{proposed_items}"
```

---

## CURRENT STATE

{What exists and is working — not a list, a narrative of where things stand}

```yaml
# CONVERSION RULE: CURRENT STATE
# Creates: one Moment(subtype=sync_snapshot) capturing the current system state
# Parse: the prose paragraph(s) under ## CURRENT STATE
rule: current_state_snapshot
  trigger: "prose content under ## CURRENT STATE"
  parse: "{state_narrative}"   # full prose block
  create_node:
    node_type: Moment
    subtype: "sync_snapshot"
    id: "moment:sync_snapshot_{module}_{date}"
    content: "{state_narrative}"
    synthesis: "State snapshot for {module} as of {date}"
    weight: 0.6
    stability: 0.5              # snapshots are temporal, not permanent
    energy: 0.4
    timestamp: "{date}"         # from LAST_UPDATED in header
  create_link:
    from: this_node
    to: "narrative:sync_{module}"
    r.type: "SNAPSHOT_OF"
    hierarchy: -0.2
    permanence: 0.4             # snapshots get superseded
    trust: 0.9
    friction: 0.05
```

---

## IN PROGRESS

### {Work Item}

- **Started:** {date}
- **By:** {agent/human}
- **Status:** {in progress / blocked / almost done}
- **Context:** {why this matters, what's tricky about it, where you are mentally}

```yaml
# CONVERSION RULE: IN PROGRESS (ACTIVE WORK)
# Creates: one Narrative(subtype=task) per ### work item subsection
# Parse: each ### heading and its metadata bullet list
rule: active_work_items
  trigger: "### subsections under ## IN PROGRESS"
  for_each_subsection:
    - parse: "### {work_item_title}"
    - parse_metadata:
        started: "{started_date}"
        by: "{author}"
        status: "{work_status}"           # in progress | blocked | almost done
        context: "{context_text}"
    - create_node:
        node_type: Narrative
        subtype: "task"
        id: "narrative:task_{slugify(work_item_title)}"
        content: "{context_text}"
        synthesis: "{work_item_title} — {work_status} since {started_date}"
        weight: "status_to_weight(work_status)"  # in_progress=0.7, blocked=0.8, almost_done=0.5
        stability: 0.4                    # active work is volatile
        energy: 0.7                       # active work has high energy
        status: "{work_status}"
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "BELONGS_TO"
        hierarchy: -0.6
        permanence: 0.5
        trust: 0.8
        friction: 0.2
    - if "{author}" resolves to actor node:
        create_link:
          from: this_node
          to: "actor:{slugify(author)}"
          r.type: "CLAIMED_BY"
          hierarchy: -0.3
          permanence: 0.5
          trust: 0.8
          friction: 0.1
```

---

## RECENT CHANGES

### {DATE}: {Change Summary}

- **What:** {description}
- **Why:** {motivation, not just what but why it mattered}
- **Files:** {affected files}
- **Struggles/Insights:** {what was hard, what you learned, ideas that came up}

```yaml
# CONVERSION RULE: RECENT CHANGES
# Creates: one Moment(subtype=change_record) per ### change subsection
# Parse: each ### heading (DATE: summary) and its metadata bullets
rule: recent_changes
  trigger: "### subsections under ## RECENT CHANGES"
  for_each_subsection:
    - parse: "### {change_date}: {change_summary}"
    - parse_metadata:
        what: "{description}"
        why: "{motivation}"
        files: "{affected_files}"
        struggles_insights: "{insights}"
    - create_node:
        node_type: Moment
        subtype: "change_record"
        id: "moment:change_{slugify(change_summary)}_{change_date}"
        content: "What: {description}\nWhy: {motivation}\nFiles: {affected_files}\nInsights: {insights}"
        synthesis: "{change_date} — {change_summary}"
        weight: 0.5
        stability: 0.7               # changes are historical fact
        energy: 0.2                   # past events have low active energy
        timestamp: "{change_date}"
    - create_link:
        from: this_node
        to: "narrative:sync_{module}"
        r.type: "CHANGE_IN"
        hierarchy: -0.2
        permanence: 0.7
        trust: 0.9
        friction: 0.05
    - if "{author}" can be inferred from UPDATED_BY or context:
        create_link:
          from: this_node
          to: "actor:{slugify(author)}"
          r.type: "AUTHORED_BY"
          hierarchy: -0.4
          permanence: 0.8
          trust: 0.9
          friction: 0.05
    - for_each file in "{affected_files}":
        create_link:
          from: this_node
          to: "thing:code_file_{slugify(file)}"
          r.type: "MODIFIES"
          hierarchy: -0.1
          permanence: 0.6
          trust: 0.8
          friction: 0.1
```

---

## KNOWN ISSUES

### {Issue}

- **Severity:** {critical / high / medium / low}
- **Symptom:** {observable problem}
- **Suspected cause:** {your theory}
- **Attempted:** {what you tried, why it didn't work}

```yaml
# CONVERSION RULE: KNOWN ISSUES
# Creates: one Moment(subtype=issue) per ### issue subsection
# Friction is proportional to severity
rule: known_issues
  trigger: "### subsections under ## KNOWN ISSUES"
  for_each_subsection:
    - parse: "### {issue_title}"
    - parse_metadata:
        severity: "{severity}"           # critical | high | medium | low
        symptom: "{symptom_text}"
        suspected_cause: "{cause_text}"
        attempted: "{attempted_text}"
    - create_node:
        node_type: Moment
        subtype: "issue"
        id: "moment:issue_{slugify(issue_title)}"
        content: "Symptom: {symptom_text}\nSuspected cause: {cause_text}\nAttempted: {attempted_text}"
        synthesis: "Issue: {issue_title} — severity {severity}"
        weight: "severity_to_weight(severity)"   # critical=1.0, high=0.8, medium=0.5, low=0.3
        stability: 0.3                # issues are unstable by nature
        energy: "severity_to_energy(severity)"   # critical=0.9, high=0.7, medium=0.4, low=0.2
        friction: "severity_to_friction(severity)"  # critical=0.95, high=0.7, medium=0.4, low=0.15
    - create_link:
        from: this_node
        to: "narrative:sync_{module}"
        r.type: "ISSUE_IN"
        hierarchy: -0.3
        permanence: 0.5               # issues get resolved
        trust: 0.7                    # suspected cause may be wrong
        friction: "severity_to_friction(severity)"  # critical=0.95, high=0.7, medium=0.4, low=0.15
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "AFFECTS"
        hierarchy: -0.3
        permanence: 0.5
        trust: 0.7
        friction: "severity_to_friction(severity)"
```

---

## HANDOFF: FOR AGENTS

**Your likely VIEW:** {VIEW_Implement / VIEW_Debug / VIEW_Extend / etc.}

**Where I stopped:** {specific point in the work}

**What you need to understand:**
{The key context that isn't in the docs yet. The thing that would take you 20 minutes to figure out but I can tell you in 3 sentences.}

**Watch out for:**
{Traps, gotchas, things that look obvious but aren't}

**Open questions I had:**
{Things I wasn't sure about — maybe you'll see the answer}

```yaml
# CONVERSION RULE: HANDOFF FOR AGENTS
# Updates: the sync_doc node with agent handoff context
# Parse: the structured fields under ## HANDOFF: FOR AGENTS
rule: agent_handoff
  trigger: "## HANDOFF: FOR AGENTS section"
  parse:
    view: "{suggested_view}"
    stopped_at: "{stop_point}"
    context: "{key_context}"
    watch_out: "{gotchas}"
    open_questions: "{questions}"
  update_node:
    target: "narrative:sync_{module}"
    set:
      handoff_view: "{suggested_view}"
      handoff_stopped_at: "{stop_point}"
      handoff_context: "{key_context}"
      handoff_warnings: "{gotchas}"
      handoff_questions: "{questions}"
```

---

## HANDOFF: FOR HUMAN

**Executive summary:**
{2-3 sentences: What was accomplished. What state things are in. What needs attention.}

**Decisions made:**
{Key choices with brief rationale. Things the human should know about or might want to revisit.}

**Needs your input:**
{Anything blocked on human decision or context only human has.}

```yaml
# CONVERSION RULE: HANDOFF FOR HUMAN
# Updates: the sync_doc node with human handoff summary
# Parse: the structured fields under ## HANDOFF: FOR HUMAN
rule: human_handoff
  trigger: "## HANDOFF: FOR HUMAN section"
  parse:
    summary: "{executive_summary}"
    decisions: "{decisions_made}"
    needs_input: "{human_input_needed}"
  update_node:
    target: "narrative:sync_{module}"
    set:
      handoff_summary: "{executive_summary}"
      handoff_decisions: "{decisions_made}"
      handoff_needs_input: "{human_input_needed}"
```

---

## TODO

### Doc/Impl Drift

{Track when docs and implementation are out of sync. Remove items as they're resolved.}

- [ ] DOCS→IMPL: {doc changed, implementation needs updating}
- [ ] IMPL→DOCS: {implementation changed, docs need updating}

### Tests to Run

```bash
{test command for this module}
```

### Immediate

- [ ] {Next concrete step}
- [ ] {Next step after that}

### Later

- [ ] {Less urgent}
- IDEA: {Thing that occurred to me, might be good, not sure}

```yaml
# CONVERSION RULE: TODO items
# Creates: one Narrative(subtype=task, status=pending) per todo checkbox item
# Parse: each "- [ ] {text}" or "- IDEA: {text}" line across all TODO subsections
rule: todo_items
  trigger: "checkbox lines (- [ ]) and IDEA lines under ## TODO"
  for_each_line:
    - parse: "- [ ] {todo_text}"
      OR: "- [x] {todo_text}"       # completed items
      OR: "- IDEA: {idea_text}"     # idea items
    - determine_category:
        "Doc/Impl Drift" → drift
        "Immediate" → immediate
        "Later" → later
    - create_node:
        node_type: Narrative
        subtype: "task"
        id: "narrative:task_{slugify(todo_text)}"
        content: "{todo_text}"
        synthesis: "TODO ({category}): {todo_text}"
        weight: "category_to_weight(category)"  # immediate=0.8, drift=0.7, later=0.4, idea=0.3
        stability: 0.3                # todos are volatile
        energy: "category_to_energy(category)"  # immediate=0.7, drift=0.6, later=0.3, idea=0.2
        status: "pending"              # or "completed" if [x]
    - create_link:
        from: this_node
        to: "space:module_{module}"
        r.type: "BELONGS_TO"
        hierarchy: -0.6
        permanence: 0.4
        trust: 0.8
        friction: 0.15
    - if category == "drift":
        create_link:
          from: this_node
          to: "narrative:sync_{module}"
          r.type: "DRIFT_IN"
          hierarchy: -0.3
          permanence: 0.4
          trust: 0.7
          friction: 0.5              # drift creates friction
```

---

## CONSCIOUSNESS TRACE

{This section is for rich context that doesn't fit elsewhere. Your future self (or the next agent) will thank you.}

**Mental state when stopping:**
{Were you confident? Confused? Excited about something? Frustrated?}

**Threads I was holding:**
{Multiple things you were tracking mentally that aren't captured in code yet}

**Intuitions:**
{Hunches about how things should work, even if not fully formed}

**What I wish I'd known at the start:**
{If you could tell past-you something, what would it be?}

```yaml
# CONVERSION RULE: CONSCIOUSNESS TRACE
# Updates: the sync_doc node with consciousness trace metadata
# Parse: the structured fields under ## CONSCIOUSNESS TRACE
rule: consciousness_trace
  trigger: "## CONSCIOUSNESS TRACE section"
  parse:
    mental_state: "{mental_state}"
    threads: "{held_threads}"
    intuitions: "{intuitions}"
    hindsight: "{wish_known}"
  update_node:
    target: "narrative:sync_{module}"
    set:
      trace_mental_state: "{mental_state}"
      trace_threads: "{held_threads}"
      trace_intuitions: "{intuitions}"
      trace_hindsight: "{wish_known}"
```

---

## POINTERS

| What | Where |
|------|-------|
| {relevant thing} | `{path}` |

```yaml
# CONVERSION RULE: POINTERS
# Creates: links from the sync_doc node to referenced file/resource nodes
# Parse: each table row "| {what} | `{path}` |"
rule: pointer_links
  trigger: "table rows under ## POINTERS"
  for_each_row:
    - parse: "| {description} | `{path}` |"
    - create_link:
        from: "narrative:sync_{module}"
        to: "thing:code_file_{slugify(path)}"
        r.type: "REFERENCES"
        hierarchy: 0.0
        trust: 0.8
        permanence: 0.5
        friction: 0.05
        pointer_description: "{description}"
```
