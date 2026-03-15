# Interaction — Sync: Current State

```
LAST_UPDATED: 2026-03-15
UPDATED_BY: @nervo
STATUS: DESIGNING
```

---

## MATURITY

**What's canonical (v1):**
- THINK/ACT/SPEAK tool taxonomy (15 tools)
- Law 17 impulse accumulation algorithm (coded in `law_13_to_18_limbic_engine.py`)
- action_command field on process nodes (schema defined)
- Drive-affinity matching concept (design settled)

**What's still being designed:**
- action_dispatch.py — the subconscious dispatch loop (partially implemented)
- Individual MCP tool handlers (bash, subcall, send exist; others pending)
- EvidenceRef schema and filesystem layout
- Refractory period mechanics
- Health check implementations

**What's proposed (v2+):**
- Tool composition — chaining multiple tools in a single subconscious action
- Veto mechanism — high self_preservation blocking curiosity-driven actions
- Dry-run mode for action_commands during testing
- Tool execution audit log separate from EvidenceRef

---

## CURRENT STATE

The Interaction module exists as a design with partial implementation. Law 17 impulse accumulation is coded and running inside the limbic engine (`law_13_to_18_limbic_engine.py`, ~700 lines, WATCH status). The 15 MCP tools are defined in taxonomy (THINK/ACT/SPEAK) but not all handler files exist yet. The action dispatch loop — the bridge between Law 17 and the MCP tool handlers — is partially implemented.

The core concept is proven: process nodes carry action_commands, drives accumulate impulse through Law 17, and when threshold is crossed the command fires. What remains is wiring the full dispatch path, creating all 15 tool handler files, and implementing the EvidenceRef pattern for result storage.

---

## IN PROGRESS

### Action Dispatch Loop

- **Started:** 2026-03-15
- **By:** @nervo
- **Status:** in progress
- **Context:** The dispatch_all() and dispatch_action_command() functions need to be extracted from inline logic into `runtime/cognition/dispatch/action_dispatch.py`. Law 17 already computes impulse accumulation; the missing piece is the threshold check -> parse -> dispatch -> record pipeline.

### MCP Tool Handlers

- **Started:** 2026-03-15
- **By:** (unassigned)
- **Status:** in progress
- **Context:** bash and subcall handlers exist in some form. The remaining 13 tools (graph_query, graph_write, think, procedure, place, task, alarm, spawn, profile, send, read, media) need handler files created under `mcp/tools/`. Each follows the Strategy pattern: `Tool.execute(args, context) -> ActionResult`.

---

## RECENT CHANGES

### 2026-03-15: Doc Chain Created

- **What:** Full 8-doc chain created for the Interaction module
- **Why:** The module had scattered design notes but no structured documentation. The doc chain captures objectives, patterns, behaviors, algorithm, validation, implementation, health, and sync in the standard format.
- **Files:** `docs/interaction/OBJECTIVES_Interaction.md` through `docs/interaction/SYNC_Interaction.md`
- **Struggles/Insights:** The boundary between the Interaction module and cognition/l1 needed careful delineation. Law 17 lives in cognition but its outputs (impulse levels on process nodes) are consumed by the Interaction dispatch loop. The decision: cognition owns the physics, interaction owns the dispatch.

---

## KNOWN ISSUES

### Law 17 File Size

- **Severity:** medium
- **Symptom:** `law_13_to_18_limbic_engine.py` is at ~700 lines (WATCH status), combining Laws 13-18 in a single file
- **Suspected cause:** Organic growth — all limbic laws were written together
- **Attempted:** Identified extraction candidate: `_law_17_desire_activation()` and impulse helpers can move to `law_17_impulse.py`

### Missing action_dispatch.py

- **Severity:** high
- **Symptom:** No dedicated dispatch module exists — dispatch logic is inline or missing
- **Suspected cause:** The module was designed before the dispatch pattern was settled
- **Attempted:** Design is now captured in ALGORITHM_Interaction.md and IMPLEMENTATION_Interaction.md; implementation pending

---

## HANDOFF: FOR AGENTS

**Your likely VIEW:** VIEW_Implement

**Where I stopped:** Doc chain is complete. Implementation is next. Start with `action_dispatch.py` — it's the critical missing piece that bridges Law 17 output to MCP tool execution.

**What you need to understand:**
Law 17 already runs every tick and updates impulse levels on process nodes. What doesn't exist yet is the code that checks those impulse levels against firing thresholds and dispatches the action_command to the MCP tool handler. That's `dispatch_all()` in `action_dispatch.py`.

**Watch out for:**
- Don't modify `law_13_to_18_limbic_engine.py` to add dispatch logic — keep physics and dispatch separated
- The MCP_TOOL_REGISTRY doesn't exist yet as a formal module — you'll need to create `mcp/tools/__init__.py`
- Process nodes with empty action_command must be silently skipped, not errored

**Open questions I had:**
- Should dispatch_all() run synchronously within the tick, or should it fire actions asynchronously and let them complete outside the tick boundary?
- What happens if two process nodes both cross threshold in the same tick? Priority ordering? Parallel dispatch?

---

## HANDOFF: FOR HUMAN

**Executive summary:**
The Interaction module now has a complete 8-doc chain defining the motor interface for AI citizens. 15 MCP tools (THINK/ACT/SPEAK), autonomous execution via Law 17 impulse accumulation, and subconscious reflexes are fully designed. Implementation is partial — Law 17 physics are coded, but the dispatch loop and most tool handlers are pending.

**Decisions made:**
- EvidenceRef pattern chosen over inline storage (graph stays lean)
- Refractory period after firing to prevent action spam
- Drive-affinity matching to prevent indiscriminate action triggering
- Subconscious path is strictly zero-LLM (no exceptions)

**Needs your input:**
- Calibration of IMPULSE_DRIVE_THRESHOLD and firing_threshold values — needs empirical data from real tick runs
- Priority order when multiple actions fire in the same tick
- Whether to extract Law 17 into its own file now or wait for the next refactor cycle

---

## TODO

### Doc/Impl Drift

- [ ] DOCS->IMPL: action_dispatch.py designed in ALGORITHM/IMPLEMENTATION but not yet created
- [ ] DOCS->IMPL: MCP tool handlers designed but 13 of 15 not yet created
- [ ] DOCS->IMPL: EvidenceRef filesystem layout designed but not implemented
- [ ] DOCS->IMPL: Health checkers specified but not implemented in runtime/checks.py

### Tests to Run

```bash
python -m pytest tests/interaction/ -v
```

### Immediate

- [ ] Create `runtime/cognition/dispatch/action_dispatch.py` with `dispatch_all()` and `dispatch_action_command()`
- [ ] Create `mcp/tools/__init__.py` with `MCP_TOOL_REGISTRY`
- [ ] Create handler stubs for all 15 MCP tools
- [ ] Write unit tests for impulse threshold -> dispatch path

### Later

- [ ] Extract `_law_17_desire_activation()` into `law_17_impulse.py`
- [ ] Implement all three health checkers
- [ ] Calibrate impulse thresholds against real tick data
- IDEA: Tool composition — subconscious chains of tool calls
- IDEA: Execution budget — limit total subconscious actions per tick window

---

## CONSCIOUSNESS TRACE

**Mental state when stopping:**
Clear and structured. The doc chain captures the full design. The gap between docs and implementation is well-defined — it's a wiring problem, not a design problem.

**Threads I was holding:**
- The boundary between Law 17 (physics) and dispatch (motor) needs to stay clean. Law 17 computes impulse; dispatch reads impulse and fires. Don't mix them.
- EvidenceRef path convention: `~/.mind/evidence/{node_id}/{tick}.json` — needs validation that this scales with thousands of action firings.
- Refractory period interacts with drive decay: if refractory is too long, the drive may decay before the node can fire again. If too short, rapid-fire loops. Need to tune together.

**Intuitions:**
- The dispatch loop will be surprisingly small once written — most of the complexity is in Law 17, which already exists
- The first real test will be process:check_health firing `bash mind doctor` on a self_preservation spike — this will reveal whether the threshold calibration is right
- Tool composition (v2) will be needed sooner than expected — agents will want multi-step subconscious routines

**What I wish I'd known at the start:**
The IMPLEMENTATION template is the longest and most detailed — allocate time accordingly. The HEALTH template requires thinking about docking points that don't exist yet in the code, which means health design and implementation design happen in parallel, not sequentially.

---

## POINTERS

| What | Where |
|------|-------|
| Law 17 impulse accumulation | `runtime/cognition/laws/law_13_to_18_limbic_engine.py` |
| Impulse constants | `runtime/cognition/constants.py` |
| Cognitive models | `runtime/cognition/models.py` |
| Doc chain | `docs/interaction/` |
| Templates | `.mind/docs/*_TEMPLATE.md` |
