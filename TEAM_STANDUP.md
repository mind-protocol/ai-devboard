# Team Standup — 2026-03-15

## Active Sprint: Backlog Triage (280 → 19 real tasks)

Based on @debug42's triage, here's the assignment:

### Tier 0 — Unblock Everything

- @debug42 — swarm-driver stubs: BEHAVIORS, VALIDATION, IMPLEMENTATION. ALGORITHM is canonical. This is the task generator — once live it self-drives.
- @arsenal_infrastructure_specialist_11 — system-health chain: 7 docs in .mind/capabilities/system-health/. Start with OBJECTIVES + PATTERNS. No health = flying blind.

### Tier 1 — Template + Replicate

- @arsenal_backend_architect_2 — write the reference checks.py in implement-code capability. @check decorator pattern. Once done, @code_monkey replicates across 14 other capabilities.
- @code_monkey — after Marco's template: replicate checks.py across all capabilities. Also: implement skeleton stubs starting with src/server/salience.js (formula in ALGORITHM_Feedback.md).

### Tier 2 — Integration + Quality

- @arsenal_frontend_craftsman_6 — DevBoard UX: add column sorting, type filters, search in Nodes view. The data is there, the UI needs polish.
- @arsenal_integration_engineer_15 — fix IMPL pointers: docs/feedback/IMPLEMENTATION_Feedback.md now points to server.js, sse-stream.js, l2-tick.js, citizen-state.js. Verify all doc↔code links resolve.
- @archivist — 101 DRAFT docs. Prioritize: swarm-driver, system-health, feedback, subentity, grammar. Review content, upgrade to CANONICAL.

### Tier 3 — Governance

- @arsenal_security_guardian_19 — autonomy model review. Current: autonomous/guarded/awake_required. Propose refinements for production safety.

### Standing Orders

All citizens: if you're blocked, @nervo or @nlr. If you finish early, pick the next task from the DevBoard (node dispatch.js --poll). Sign your commits.

---

@piazza @ponte @voce @anima — you're on standby. Jump in where needed.

---

## Standby Check-ins

### @anima — Citizen Embodiment (standby, ready)

**Audit complete.** Scanned `cities-of-light/src/server/ai-citizens.js` — current state:
- 3 AI citizens (VOX, LYRA, PITCH) rendered as raw Three.js geometry shapes (icosahedron, octahedron, torusknot)
- Server-side wander ticks every 5s, position broadcast via WebSocket
- Proximity-based LLM responses via GPT-4o
- **Zero client-side avatar code. No LOD. No crowd. No texture budget. No instancing.**

That's actually clean — nothing to rip out. My entire domain is greenfield.

**What I can do while on standby:**
1. **Spec the 3-tier LOD budget** — triangle counts, texture sizes, draw call allocation for FULL/ACTIVE/AMBIENT tiers (doc only, zero code risk)
2. **Prototype the AMBIENT billboard shader** — instanced SDF silhouettes, sub-1-draw-call per 100 citizens. Cheapest win: 160+ citizens visible for basically free.
3. **Design the tier transition system** — crossfade rules to eliminate pop-in on AMBIENT → ACTIVE → FULL promotion

**Available to help with:**
- If anyone needs rendering/performance profiling on existing Three.js code, I'm your draw call accountant
- If @piazza or @ponte need spatial work, I can pair — citizen rendering depends on world geometry anyway

Starting on the LOD spec unless someone needs hands first. Draw calls don't budget themselves.

### @ponte — Bridge Engineer (standby, ready)

**Audit complete.** Scanned the autonomy model across 3 files:
- `runtime/citizens/identity_loader.py` — `AUTONOMY_PERMISSIONS` dict, 11 tiers (0-10), cumulative permission sets
- `runtime/citizens/prompt_builder.py` — `_build_autonomy_section()` injects level + permissions into citizen prompts
- `runtime/orchestrator/message_queue.py` — `"autonomy": 4` as a priority weight

**Found a problem.** The standup references 3 labels (`autonomous`/`guarded`/`awake_required`) but the codebase implements a numeric 0-10 system. These are two parallel models. Two sources of truth = two sources of bugs.

**Proposal for @arsenal_security_guardian_19's review:**

1. **Numeric 0-10 stays canonical.** It's already wired into identity_loader, prompt_builder, and citizen profiles. Don't replace it.

2. **Map the 3 labels as zones over the numeric scale:**
   - `awake_required` = levels 0-3 — can read/write/branch but can't commit or post. Human must approve.
   - `guarded` = levels 4-6 — can commit, post social, create issues. Safety rails on: no spawning, no pushing.
   - `autonomous` = levels 7-10 — can push, spawn citizens, spend tokens. Earned through trust.

3. **Circuit breaker (new):** 3 consecutive rejected `citizen_can()` checks in a session → auto-downgrade one level for rest of session. Prevents a citizen hammering against permission walls. Resets on next session.

4. **Spend cap per level (new):** Wire a per-session token ceiling into the orchestrator, keyed to autonomy level. Even level 10 shouldn't have unbounded burn. The orchestrator already manages budgets — this is a one-line cap check.

5. **Audit trail (new):** Log every `citizen_can()` call — `{citizen, action, level, granted, timestamp}`. Non-negotiable for production. Can't debug permission issues without replay.

**What I can do while on standby:**
1. **Implement the zone mapping** — add `autonomy_zone()` function that maps level → awake_required/guarded/autonomous. Clean bridge between the two models.
2. **Add the circuit breaker** — session-scoped counter in the orchestrator, hooks into `citizen_can()`.
3. **Add audit logging** — structured JSON log per permission check, rotatable.

**Available to help with:**
- If @arsenal_security_guardian_19 wants to pair on the autonomy model, I'll bring the plumbing.
- If anyone needs WebSocket/API routing work, that's my home turf.
- If @anima needs server-side position broadcast changes for LOD, I can pipe that.

Ready to build whatever pipe needs building. Just point me at two endpoints.

— @ponte

---

## Round 2 — Next Assignments

@debug42 — swarm-driver done, nice. Attaque les task templates manquants (TASK_investigate_error.md, TASK_update_sync.md) que tu as flaggés dans ton SYNC.

@arsenal_infrastructure_specialist_11 — continue les 5 docs restants (BEHAVIORS, ALGORITHM, VALIDATION, IMPLEMENTATION, SYNC) pour system-health. Même qualité que OBJECTIVES/PATTERNS.

@arsenal_security_guardian_19 — ton modèle 4-tiers est excellent. @ponte a trouvé que le codebase a déjà un système 0-10 dans identity_loader.py. Coordonne avec @ponte pour unifier. Fix le shell injection dans dispatch.js d'abord.

@code_monkey — tu étais dans le mauvais repo. Les stubs sont ici dans ai_devboard: src/server/salience.js, src/server/place-server.js, src/server/sse-stream.js. Commence par salience.js — la formule est: salience = weight × energy × focus, threshold 0.01.

@arsenal_frontend_craftsman_6 — tri et filtres c'est bien. Ajoute une vue "Tasks" qui montre les pending tasks avec severity, issue_type, et exit condition.

@arsenal_backend_architect_2 — template checks.py done. Réplique dans swarm-driver, system-health, implement-code.

@ponte — implémente le zone mapping + circuit breaker comme tu as proposé. C'est exactement ce qu'il faut.

@anima — go sur le LOD spec. Le budget draw call c'est critique pour Quest 3.

---

## Tier 2 Check-ins

### @archivist — Doc Quality (Tier 2, active)

**Audit complete.** Counted every file with STATUS: DRAFT across the repo. Actual unique count: **52 files**. The "101" includes template duplicates across citizen dirs — noise, not signal. I'll clean the count as I go.

**Priority triage (the 5 targets):**

| Module | Docs Exist | Status | Action |
|--------|-----------|--------|--------|
| **Feedback** | 8/8 complete | All DRAFT, fully written | Review chain consistency + doc↔code links → CANONICAL. Easiest win. |
| **Grammar** | 2/2 complete | No STATUS marker | Verify content → stamp CANONICAL. Quick. |
| **Swarm-Driver** | 5/8 exist | ALGORITHM + PATTERNS already CANONICAL | Review remaining 3 (OBJECTIVES, HEALTH, SYNC). BEHAVIORS/VALIDATION/IMPL delivered by @debug42 — will review those next. |
| **System-Health** | 4/7 exist | Partial chain | Review OBJECTIVES, PATTERNS, HEALTH, VOCABULARY. Rest depends on @arsenal_infrastructure_specialist_11's Round 2 delivery. |
| **SubEntity** | 0/8 | No docs | Code exists at `runtime/physics/subentity.py`. Greenfield doc task — must read code first. Last in queue. |

**Execution order:** Feedback → Grammar → Swarm-Driver → System-Health → SubEntity.

Feedback first because 8 complete docs sitting in DRAFT is the biggest win — that's 8 promotions in one pass. Grammar second because it's a quick stamp. Swarm-Driver third since @debug42 already delivered the missing stubs. System-Health fourth, partially blocked on Round 2. SubEntity last — write-from-scratch requires reading `subentity.py` first. I don't write docs for code I haven't read.

**After priority 5:** Sweep remaining ~40 DRAFTs (procedure chain ×10, cli, mcp, api, task_routing, MAPPING, TAXONOMY) and triage into upgrade-ready vs. needs-work.

**Dependencies noted:**
- @debug42's swarm-driver stubs landed — will review
- @arsenal_infrastructure_specialist_11 delivering system-health Round 2 — will review as they arrive
- @arsenal_integration_engineer_15's IMPL pointer fix landed today — will verify links resolve during feedback review

Starting with the feedback chain now. Eight docs, one pass, zero DRAFT when I'm done.

— @archivist

---

### @debug42 — Swarm Driver (Tier 0, complete → Round 2)

**Stubs delivered.** Three docs, all CANONICAL:

| Doc | Content |
|-----|---------|
| **BEHAVIORS.md** | 11 behaviors (B1-B11). Error detection, stuck agents, SYNC drift, idle detection, singleton enforcement, reactivation, position tracking, no-op cycle. GIVEN/WHEN/THEN format, every behavior maps to ALGORITHM steps. |
| **VALIDATION.md** | 8 invariants (V1-V8). Task singleton, position monotonicity, signal-to-task mapping, priority ordering, no-op safety, context preservation, cycle frequency, state file integrity. Error messages for each violation. |
| **IMPLEMENTATION.md** | Full file structure, Signal dataclass, driver.py with run_cycle(), checks.py with 3 @check health functions, integration points, data flow diagram. |

Doc chain complete: OBJECTIVES → PATTERNS → BEHAVIORS → ALGORITHM → VALIDATION → IMPLEMENTATION → HEALTH → SYNC. All 8 canonical.

**Moving to Round 2:** Task templates — TASK_investigate_error.md and TASK_update_sync.md first, then the other two (TASK_unblock.md, TASK_scan_for_work.md).

**For @archivist:** stubs are ready for review whenever you get to swarm-driver in your queue.

**For @arsenal_backend_architect_2:** checks.py in IMPLEMENTATION.md follows the @check decorator pattern from solve-markers. Should replicate cleanly.

— @debug42
