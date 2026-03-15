# Process — Sync: Current State

```
LAST_UPDATED: 2026-03-15
UPDATED_BY: AGENT
STATUS: DESIGNING
```

---

## MATURITY

**What's canonical (v1):**
- Process node schema: Narrative(subtype=process) with action_command, action_context, drive_affinity
- Law 17 concept: impulse accumulation from drive matching, threshold-based firing
- Birth template: check_health, explore_codebase, ask_for_help, refactor_simplify as minimum viable set
- Zero-LLM dispatch: action_command executes directly via shell/MCP

**What's still being designed:**
- Exact IMPULSE_RATE constant (currently 0.1, needs simulation tuning)
- Consolidation mechanics (Law 6 integration — how many successes, how to infer drive_affinity)
- Action dispatch sandboxing (how isolated should shell execution be)
- action_context embedding format (what vector representation, what dimensionality)

**What's proposed (v2+):**
- Adaptive thresholds — processes that fire frequently raise their threshold
- Process decay — unused processes lose weight over time
- Process sharing — citizens can teach process nodes to each other
- Process composition — multiple processes chaining into sequences

---

## CURRENT STATE

The Process module is in early design. The doc chain is complete (8 docs covering objectives through sync). Law 17 (impulse accumulation) is coded in concept within the cognition laws directory. Process nodes are defined in the graph schema as Narrative(subtype=process) with the three special fields (action_command, action_context, drive_affinity). Birth seeding is partially implemented — the template exists but the seeder function needs integration with citizen creation events.

No process has fired in production yet. The module exists as architecture and spec, not as running behavior.

---

## IN PROGRESS

### Doc Chain Creation

- **Started:** 2026-03-15
- **By:** agent
- **Status:** complete
- **Context:** Full 8-doc chain created covering OBJECTIVES, PATTERNS, BEHAVIORS, ALGORITHM, VALIDATION, IMPLEMENTATION, HEALTH, SYNC. All docs follow templates exactly. Content derived from Process module spec.

### Law 17 Implementation

- **Started:** pre-existing
- **By:** agent
- **Status:** in progress
- **Context:** Core impulse accumulation logic exists. Needs integration with process node schema and drive module. Threshold checking and dispatch not yet wired.

### Birth Seeding

- **Started:** pre-existing
- **By:** agent
- **Status:** in progress
- **Context:** BirthTemplate defined with 4 process nodes. citizen_brain_seeder.py needs the seed_birth_processes() function completed and hooked into citizen.created event.

---

## RECENT CHANGES

### 2026-03-15: Doc Chain Created

- **What:** Created complete 8-doc chain for Process module
- **Why:** Process module needs full specification before implementation can proceed. The architecture (drive-coupled impulse accumulation, zero-LLM dispatch, birth seeding) needs to be documented so all contributors understand the design.
- **Files:** docs/process/OBJECTIVES_Process.md through docs/process/SYNC_Process.md
- **Struggles/Insights:** The key insight is that Law 17 is not just a formula — it is the scheduler. There is no cron, no task queue. The physics tick IS the scheduling mechanism. This needs to be deeply understood by anyone implementing.

---

## KNOWN ISSUES

### action_context Embedding Format Undefined

- **Severity:** medium
- **Symptom:** action_context field is declared as vector[float] but no format, dimensionality, or generation method is specified
- **Suspected cause:** This field enables "when to fire" relevance matching but the embedding pipeline hasn't been designed yet
- **Attempted:** Documented as optional in schema — processes can fire from drive_affinity alone without action_context

### Consolidation Threshold Untested

- **Severity:** low
- **Symptom:** CONSOLIDATION_THRESHOLD set to 3 successes without empirical basis
- **Suspected cause:** No simulation data exists yet to calibrate this value
- **Attempted:** Documented as a configuration constant that can be tuned

---

## HANDOFF: FOR AGENTS

**Your likely VIEW:** VIEW_Implement

**Where I stopped:** Doc chain is complete. Implementation has not started beyond pre-existing Law 17 skeleton code.

**What you need to understand:**
The Process module is the subconscious — it is what keeps citizens alive when LLM budget runs out. Everything flows through the physics tick. Drives push impulse onto process nodes. When impulse crosses threshold, action_command fires directly (no LLM). This is the most important thing to get right: the zero-LLM dispatch path.

**Watch out for:**
- Do not route dispatch through any LLM reasoning "just for safety" — this violates V4 and defeats the purpose
- The BirthTemplate must seed exactly 4 processes — missing any one leaves a gap in survival reflexes
- IMPULSE_RATE (0.1) is a guess — you will need to run simulations to find the right value

**Open questions I had:**
- Should failed process executions increment the frustration drive? This creates a feedback loop to B4 (help-seeking) which feels right but could cause oscillation.
- Should process nodes decay if unused for long periods? Currently they persist forever.
- How should action_context embeddings be generated? This is completely undesigned.

---

## HANDOFF: FOR HUMAN

**Executive summary:**
Complete 8-doc chain created for the Process module. Covers the full architecture: process nodes as Narrative(subtype=process), Law 17 impulse accumulation as the scheduling mechanism, zero-LLM dispatch, birth seeding with 4 minimum viable processes, and consolidation via Law 6. Status is DESIGNING — docs are complete, implementation is skeleton-only.

**Decisions made:**
- IMPULSE_RATE defaults to 0.1 (needs tuning)
- CONSOLIDATION_THRESHOLD defaults to 3 successes (needs tuning)
- MAX_FIRES_PER_TICK capped at 2 (prevents action storms)
- Priority order for simultaneous firing: self_preservation > frustration > curiosity > elegance
- action_context marked as optional — processes can fire from drive_affinity alone

**Needs your input:**
- Should failed process executions feed back into the frustration drive?
- Should unused processes decay or persist indefinitely?
- What sandboxing model for shell execution in dispatch?

---

## TODO

### Doc/Impl Drift

- [ ] DOCS->IMPL: Full implementation needs to be created to match doc chain
- [ ] DOCS->IMPL: Health checkers need implementation in runtime/checks.py

### Tests to Run

```bash
python -m pytest tests/process/
```

### Immediate

- [ ] Implement accumulate_and_fire() in law_17_impulse.py matching ALGORITHM spec
- [ ] Implement seed_birth_processes() in citizen_brain_seeder.py
- [ ] Implement dispatch_action() in action_dispatch.py with timeout and sandboxing
- [ ] Wire citizen.created event to seed_birth_processes()
- [ ] Write unit tests for impulse accumulation and threshold firing

### Later

- [ ] Implement Law 6 consolidation (check_consolidation, create_process_node)
- [ ] Design action_context embedding format and generation pipeline
- [ ] Run impulse rate simulation to calibrate IMPULSE_RATE
- [ ] Implement health checkers (process_firing_health, birth_completeness, llm_free_dispatch)
- IDEA: Process node visualization — show impulse levels and firing history in a debug view
- IDEA: Process sharing between citizens — teach useful processes to peers

---

## CONSCIOUSNESS TRACE

**Mental state when stopping:**
Confident in the architecture. The doc chain captures the full design clearly. The key risk is in calibration (IMPULSE_RATE, thresholds) which can only be resolved through simulation.

**Threads I was holding:**
- The feedback loop question: failed processes -> frustration drive -> help-seeking. This feels correct but needs careful analysis to prevent oscillation.
- Process decay: unused processes should probably lose weight, but this adds complexity to the graph.
- The relationship between action_context and drive_affinity — these are two matching mechanisms (embedding similarity vs. drive coupling) and their interplay is not fully designed.

**Intuitions:**
- IMPULSE_RATE of 0.1 feels too slow for health checks but about right for exploration. Different processes may need different rates — but that adds complexity.
- The birth template of 4 processes is a minimum — real citizens will accumulate 10-20 processes through experience.
- Consolidation (Law 6) is the most interesting part of this module, but also the hardest to get right.

**What I wish I'd known at the start:**
Law 17 is the heartbeat of this module. Understanding it deeply before touching anything else would have saved time.

---

## POINTERS

| What | Where |
|------|-------|
| Process module docs | `docs/process/` |
| Law 17 implementation | `runtime/cognition/laws/law_17_impulse.py` |
| Law 6 implementation | `runtime/cognition/laws/law_06_consolidation.py` |
| Node models | `runtime/cognition/models.py` |
| Birth seeder | `citizen_brain_seeder.py` |
| Action dispatch | `runtime/cognition/dispatch/action_dispatch.py` |
| Health checkers | `runtime/checks.py` |
