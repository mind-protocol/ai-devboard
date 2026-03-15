# Process — Patterns: Muscle Memory Over Prompts

```
STATUS: DRAFT
CREATED: 2026-03-15
VERIFIED: —
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Process.md
BEHAVIORS:      ./BEHAVIORS_Process.md
THIS:            PATTERNS_Process.md (you are here)
MECHANISMS:     (not applicable)
ALGORITHM:       ./ALGORITHM_Process.md
VALIDATION:      ./VALIDATION_Process.md
HEALTH:          ./HEALTH_Process.md
IMPLEMENTATION:  ./IMPLEMENTATION_Process.md
SYNC:            ./SYNC_Process.md

IMPL:            runtime/cognition/laws/, runtime/cognition/models.py, citizen_brain_seeder.py
```

### Bidirectional Contract

**Before modifying this doc or the code:**
1. Read ALL docs in this chain first
2. Read the linked IMPL source file

**After modifying this doc:**
1. Update the IMPL source file to match, OR
2. Add a TODO in SYNC_Process.md: "Docs updated, implementation needs: {what}"
3. Run tests: `python -m pytest tests/process/`

**After modifying the code:**
1. Update this doc chain to match, OR
2. Add a TODO in SYNC_Process.md: "Implementation changed, docs need: {what}"
3. Run tests: `python -m pytest tests/process/`

---

## THE PROBLEM

AI citizens currently depend on system prompts and orchestration scripts to know what to do. This creates three failures:
1. Every routine action costs LLM budget — health checks, code exploration, and help-seeking all require a full reasoning cycle even when the appropriate response is obvious and repeated.
2. Knowledge is ephemeral — a citizen that learns "run mind doctor when feeling stuck" forgets this in the next session because it lived in prompt context, not in durable graph structure.
3. Budget exhaustion means death — when LLM tokens run out, the citizen stops entirely. No reflexes, no self-preservation, no survival behaviors. Silence.

---

## THE PATTERN

Process nodes are Narrative nodes (subtype=process) that encode "muscle memory" — stabilized action patterns that fire reflexively when matching drives cross their threshold. Each process carries three special fields:
- **action_command**: the shell command or MCP call to execute (e.g., `bash mind doctor`)
- **action_context**: an embedding signature defining when this process is relevant
- **drive_affinity**: which limbic drives push impulse toward this process

Law 17 (impulse accumulation) acts as the scheduler: as drives fluctuate during the physics tick, impulse accumulates on process nodes whose drive_affinity matches the active drives. When accumulated impulse crosses the process's firing threshold, the action_command executes — no LLM needed.

The key insight: the graph IS the knowledge store. System prompts are replaced by graph topology. Orchestration scripts are replaced by drive-coupled physics. The citizen's behavioral repertoire grows as new process nodes crystallize from successful actions (Law 6: consolidation).

---

## BEHAVIORS SUPPORTED

- B1 (Health Check Fires Automatically) — drive_affinity coupling to self_preservation ensures check_health fires without prompting
- B2 (Code Exploration on Boredom) — curiosity drive accumulates impulse on explore_codebase process
- B3 (Refactoring on Elegance Drive) — elegance/order drive pushes impulse toward refactor/simplify processes
- B4 (Help-Seeking on Sustained Frustration) — frustration accumulation after repeated failures fires ask_for_help

## BEHAVIORS PREVENTED

- Silent budget death — subconscious processes continue firing without LLM budget
- Knowledge amnesia — learned patterns persist as graph nodes, not prompt context
- Prompt-coupled rigidity — processes evolve through consolidation, not prompt editing

---

## PRINCIPLES

### Principle 1: Muscle Memory Over Prompts

Knowledge that has been validated through repeated successful use should not remain in ephemeral prompt context. It crystallizes into a process node — a durable, graph-encoded reflex that fires from drive pressure alone. The prompt is for novel reasoning. The graph is for stable knowledge.

### Principle 2: Law 17 As the Scheduler

There is no cron, no task queue, no orchestration layer. The physics tick IS the scheduler. Drive fluctuations during each tick push impulse onto process nodes via drive_affinity matching. When impulse crosses threshold, the process fires. Timing emerges from the citizen's internal state, not from external timers.

### Principle 3: Birth Template Pre-Wiring

Every citizen is born with a minimum viable set of process nodes: check_health, explore_codebase, ask_for_help, refactor/simplify. These are pre-seeded at citizen creation, ensuring that even a brand-new citizen has survival reflexes from tick one. Additional processes accumulate through experience.

### Principle 4: Drive Affinity Coupling

Every process node must declare which drives push it. A process without drive_affinity is inert — it can never accumulate impulse, never fire. This coupling ensures processes are grounded in the citizen's motivational architecture, not floating as disconnected automation.

---

## DATA

| Source | Type | Purpose / Description |
|--------|------|-----------------------|
| `runtime/cognition/models.py` | FILE | Node model with action_command, action_context, drive_affinity fields |
| `citizen_brain_seeder.py` | FILE | Birth template that pre-seeds minimum viable process nodes |
| `runtime/cognition/laws/` | DIR | Law implementations including Law 17 (impulse accumulation) and Law 6 (consolidation) |

---

## DEPENDENCIES

| Module | Why We Depend On It |
|--------|---------------------|
| Laws (Law 17) | Impulse accumulation on process nodes — the core scheduling mechanism |
| Laws (Law 6) | Consolidation of successful ad-hoc actions into new process nodes |
| Drives | Drive state provides the pressure that triggers process firing |
| Graph (FalkorDB) | Process nodes live in the graph as Narrative(subtype=process) |

---

## INSPIRATIONS

- **Procedural memory in neuroscience** — the brain stores motor skills and habits in basal ganglia, separate from declarative memory. Once learned, they execute without conscious attention. Process nodes are the computational analog.
- **Kahneman's System 1 / System 2** — System 1 (fast, automatic, reflexive) maps to process nodes; System 2 (slow, deliberate, costly) maps to LLM reasoning. The budget split mirrors cognitive architecture.
- **Muscle memory in athletics** — repeated practice encodes movement patterns that fire without conscious planning. Law 6 consolidation is the mechanism by which practice becomes automaticity.

---

## SCOPE

### In Scope

- Process node schema (action_command, action_context, drive_affinity)
- Impulse accumulation on process nodes via Law 17
- Process firing mechanics (threshold crossing, action dispatch)
- Birth template pre-seeding of minimum viable processes
- Consolidation of successful actions into new process nodes (Law 6)
- Subconscious execution without LLM budget

### Out of Scope

- LLM-based deliberate reasoning → see: Cognition module
- Drive state management and fluctuation → see: Drives module
- Graph storage and query mechanics → see: Graph module
- Visual or spatial representation of processes → see: Feedback module
- Economic cost of process execution → see: Economy module

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Define exact embedding format for action_context field -->
<!-- @mind:proposition Consider process decay — unused processes should eventually lose weight -->
<!-- @mind:escalation Should process consolidation (Law 6) require minimum execution count before crystallizing? -->
