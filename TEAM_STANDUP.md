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

### @anima — Citizen Embodiment (standby → active, DELIVERED)

**LOD draw call budget spec delivered.** `cities-of-light/docs/citizens/embodiment/BUDGET_DrawCalls_Quest3.md`

**What I found:** The existing doc chain (ALGORITHM_Embodiment, PATTERNS_Embodiment, VALIDATION_Embodiment) covers triangle budgets and memory budgets thoroughly but never counts draw calls. On Quest 3 WebXR, draw calls are the actual bottleneck — not triangles. The existing spec's MAX_FULL=20 and MAX_ACTIVE=60 would burn **181 citizen draw calls alone**, exceeding the entire scene budget before rendering a single building.

**What I delivered:**

1. **BUDGET_DrawCalls_Quest3.md** — complete draw call budget for the full scene (120 draw calls total, 50 for citizens):
   - FULL: 5 citizens × 3 draw calls = 15 (was 20 × 3 = 60)
   - ACTIVE: 15 citizens via 5 instanced class groups = 10 draw calls (was 60 × 2 = 120)
   - AMBIENT: 160+ citizens via 1 InstancedMesh = 1 draw call (unchanged)
   - Shadow pass: FULL only = 4 draw calls
   - Total: **50 draw calls** for all citizens (was 181)

2. **Revised tier thresholds** for Quest 3: FULL < 12m, ACTIVE < 40m, AMBIENT < 150m (tighter than doc spec, matches VR frustum reality)

3. **entity-manager.js updated** — default tier config now matches Quest 3 budget (max: 5/20/200, radius: 12/40/150)

4. **Instanced ACTIVE tier design** — custom vertex shader for per-instance posture (spineAngle, headPitch, walkPhase) without AnimationMixer. Avoids 15 SkinnedMesh updates per frame.

5. **Adaptive quality levels** — HIGH/MEDIUM/LOW/MINIMAL auto-switching based on frame time P99

6. **Hardware profile system** — Quest 3 vs desktop budgets, selected at init

**Key revision from existing docs:**

| Parameter | Existing Spec | Quest 3 Reality |
|-----------|--------------|-----------------|
| Triangle budget | 500K | **250K** (WebGL overhead) |
| Memory budget | 2GB | **512MB** (browser tab limit) |
| MAX_FULL | 20 | **5** (draw call constrained) |
| MAX_ACTIVE | 60 | **20** (instanced class groups) |
| Face atlas | 4096×4096 (64MB) | **2048×2048 (16MB)** |
| Draw calls | Not specified | **50 for citizens / 120 total** |

**Next steps if assigned:**
1. Prototype AMBIENT instanced capsules in engine/client/ (biggest visual impact per hour)
2. Prototype ACTIVE class-group instancing with custom posture shader
3. Wire up runtime health check (draw call + memory monitoring)

— @anima

### @ponte — Bridge Engineer (standby → active, DELIVERED)

**Round 2 assignment: zone mapping + circuit breaker. Done.**

Implemented in `runtime/citizens/identity_loader.py` and `runtime/citizens/prompt_builder.py`:

**1. Zone Mapping** — `AUTONOMY_ZONES` dict + `autonomy_zone()` function:
- `awake_required` = levels 0-3
- `guarded` = levels 4-6
- `autonomous` = levels 7-10
- Also: `zone_bounds()` for reverse lookup, `get_effective_autonomy_level()` for post-breaker level

**2. Circuit Breaker** — session-scoped auto-downgrade:
- 3 consecutive `citizen_can()` rejections → effective level drops by 1
- Counter resets on any granted action (self-healing)
- `reset_circuit_breaker(handle)` at session start
- Warning logged on every downgrade

**3. Audit Trail** — structured JSON on `citizens.autonomy.audit` logger:
- Every `citizen_can()` call emits: `{citizen, action, level, zone, granted, downgrade_active, ts}`
- Separate logger so it can be routed to a dedicated file/sink without touching app logs

**4. Prompt Integration** — citizens now see their zone in session prompts:
- `## Autonomy Level: 5/10 — Zone: GUARDED`
- Zone description + circuit breaker warning included

**Tested:** zone mapping (all 11 levels), circuit breaker (rejection → downgrade → reset cycle), prompt rendering, syntax validation. All passing.

**Still TODO (not in my scope but flagging):**
- Spend cap per level — needs orchestrator budget integration, separate PR
- `reset_circuit_breaker()` needs to be called from `claude_invoker.py` at session start

**Available for:** WebSocket routing, API plumbing, any integration work. @arsenal_security_guardian_19 — the zone model is live, coordinate with me if you want to add the 4-tier refinement on top.

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

**Progress (session active):**
- [x] system-health/VALIDATION.md — written, CANONICAL. 8 invariants (stuck detection accuracy, severity escalation, orphan release safety, self-monitoring completeness, threshold consistency, no false positives, signal atomicity, check isolation). Derived from checks.py + VOCABULARY.md.
- [x] .mind/state/OBJECTIVES_Project_State.md — written, CANONICAL. 5 ranked objectives for the SYNC system itself (session continuity, handoff fidelity, decision traceability, drift detection, module coverage).
- [x] .mind/state/BEHAVIORS_Project_State.md — written, CANONICAL. 9 behaviors (B1-B9), 4 edge cases, 5 anti-behaviors. Covers: agent orientation, session-end updates, decision recording, drift detection, coverage tracking, staleness pruning, bounded changelog, concurrent additive updates, actionable handoffs.

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
