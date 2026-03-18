"""home_server.py

Server entry point — MCP tool registration + tick integration.

Bridges the physics tick engine to the subconscious dispatch pipeline.
Each tick: limbic engine updates drives → dispatch_all() checks impulse
thresholds → eligible process nodes fire their action_commands → results
recorded as moment nodes with EvidenceRef.

DOCS: docs/interaction/IMPLEMENTATION_Feedback.md
DOCS: docs/interaction/IMPLEMENTATION_Interaction.md

Initialization:
  1. Register all 15 MCP tool handlers in MCP_TOOL_REGISTRY
  2. Subscribe dispatch_all() to tick_complete events
  3. System ready — conscious (LLM) and subconscious (physics) paths active

Main loop (per tick):
  1. Tick completes → limbic engine updates drive state (Laws 13-18)
  2. dispatch_all() collects eligible process nodes
  3. For nodes crossing threshold: parse → dispatch → record
  4. Reset impulse, set refractory period

Shutdown:
  1. Wait for in-flight action_commands (timeout: 30s)
  2. Flush pending moment nodes to graph
  3. Persist impulse state for next startup
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger("mind.home_server")

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

_tick_listeners: List[Callable] = []
_initialized: bool = False
_tick_count: int = 0
_last_tick_result: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# tick_integration()
# ---------------------------------------------------------------------------


def tick_integration(
    graph: Any = None,
    *,
    citizen_engines: Optional[Dict[str, Any]] = None,
    on_tick_complete: Optional[Callable] = None,
) -> Dict[str, Any]:
    """Integrate the physics tick with the subconscious dispatch pipeline.

    Called once at startup to wire everything, then called after each
    physics tick to run the dispatch cycle. Handles both initialization
    and per-tick execution based on internal state.

    Startup (first call):
      1. Register all 15 MCP tool handlers in MCP_TOOL_REGISTRY
      2. Wire dispatch_all() as a tick_complete listener
      3. Return initialization summary

    Per-tick (subsequent calls):
      1. Collect process nodes from all citizen engines
      2. Call dispatch_all() with process nodes and current tick
      3. Record fired processes as moments in the graph
      4. Emit results via on_tick_complete callback (for SSE)
      5. Return tick summary with fired actions

    Args:
        graph: Graph adapter (FalkorDB or in-memory) for node queries
            and moment recording. Required for per-tick execution.
        citizen_engines: Dict of citizen_id → engine state. Each engine
            contains the citizen's cognitive state with process nodes.
            If None, attempts to get from graph.
        on_tick_complete: Optional callback invoked with tick results
            (for SSE emission). Signature: (tick_number, results_dict).

    Returns:
        Dict with keys:
          - initialized (bool): Whether this was a startup call
          - tick (int): Current tick number
          - tools_registered (int): Number of MCP tools in registry
          - fired (list): FiredProcess summaries from this tick
          - errors (list): Any dispatch errors

    See: docs/interaction/IMPLEMENTATION_Interaction.md
    """
    global _initialized, _tick_count, _last_tick_result

    # ── Startup: register tools + wire listeners ─────────────────────────
    if not _initialized:
        return _initialize(on_tick_complete)

    # ── Per-tick: collect process nodes, dispatch, record ─────────────────
    _tick_count += 1

    from runtime.cognition.dispatch.action_dispatch import dispatch_all, MCP_TOOL_REGISTRY

    # Collect process nodes from citizen engines
    process_nodes = _collect_process_nodes(graph, citizen_engines)

    # Collect drive state (aggregate or per-citizen — simplified here)
    drive_state = _collect_drive_state(graph, citizen_engines)

    # Run the dispatch pipeline
    fired_results = []
    errors = []

    try:
        fired = dispatch_all(process_nodes, _tick_count, drive_state)
        for fp in fired:
            summary = {
                "process_id": fp.process_id,
                "action_command": fp.action_command,
                "tool": fp.result.tool,
                "success": fp.result.success,
                "duration_ms": fp.result.duration_ms,
                "evidence_ref": fp.result.evidence_ref,
            }
            fired_results.append(summary)

            if not fp.result.success and fp.result.error:
                errors.append({
                    "process_id": fp.process_id,
                    "error": fp.result.error,
                })

            # Record fired process as moment in graph
            _record_moment(graph, fp)

    except Exception as exc:
        logger.error("dispatch_all failed at tick %d: %s", _tick_count, exc, exc_info=True)
        errors.append({"error": str(exc), "phase": "dispatch_all"})

    result = {
        "initialized": False,
        "tick": _tick_count,
        "tools_registered": len(MCP_TOOL_REGISTRY),
        "fired": fired_results,
        "errors": errors,
        "process_nodes_scanned": len(process_nodes),
    }

    _last_tick_result = result

    # Emit to listeners (SSE, logging, etc.)
    if on_tick_complete:
        try:
            on_tick_complete(_tick_count, result)
        except Exception as exc:
            logger.warning("on_tick_complete callback failed: %s", exc)

    for listener in _tick_listeners:
        try:
            listener(_tick_count, result)
        except Exception as exc:
            logger.warning("tick listener failed: %s", exc)

    return result


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------


def _initialize(on_tick_complete: Optional[Callable] = None) -> Dict[str, Any]:
    """One-time startup: register tools, wire listeners."""
    global _initialized

    # 1. Register all MCP tool handlers
    from runtime.cognition.dispatch.action_dispatch import register_mcp_tools, MCP_TOOL_REGISTRY

    try:
        register_mcp_tools()
        tool_count = len(MCP_TOOL_REGISTRY)
        logger.info("MCP tools registered: %d", tool_count)
    except Exception as exc:
        logger.error("Failed to register MCP tools: %s", exc)
        tool_count = 0

    # 2. Wire tick_complete listener
    if on_tick_complete:
        _tick_listeners.append(on_tick_complete)

    _initialized = True

    return {
        "initialized": True,
        "tick": 0,
        "tools_registered": tool_count,
        "fired": [],
        "errors": [],
    }


# ---------------------------------------------------------------------------
# Process node collection
# ---------------------------------------------------------------------------


def _collect_process_nodes(
    graph: Any,
    citizen_engines: Optional[Dict[str, Any]],
) -> List[Any]:
    """Gather all process nodes eligible for dispatch.

    Tries citizen_engines first (in-memory, fast), falls back to
    graph query.
    """
    nodes = []

    # From in-memory citizen engines
    if citizen_engines:
        for citizen_id, engine in citizen_engines.items():
            state = getattr(engine, "state", None) or getattr(engine, "cognitive_state", None)
            if state is None:
                continue

            citizen_nodes = getattr(state, "nodes", {})
            if isinstance(citizen_nodes, dict):
                citizen_nodes = citizen_nodes.values()

            for node in citizen_nodes:
                # Filter to process nodes with action_commands
                node_type = getattr(node, "node_type", None)
                if node_type is not None:
                    type_val = node_type.value if hasattr(node_type, "value") else str(node_type)
                    if type_val.lower() != "process":
                        continue

                action_cmd = getattr(node, "action_command", None)
                if action_cmd:
                    nodes.append(node)

    # Fallback: query graph directly
    if not nodes and graph is not None:
        try:
            adapter = graph._graph._adapter if hasattr(graph, "_graph") else graph
            query = getattr(adapter, "query", None) or getattr(adapter, "execute", None)
            if query:
                result = query(
                    "MATCH (n) WHERE n.type = 'process' AND n.action_command IS NOT NULL "
                    "RETURN n"
                )
                if result:
                    nodes.extend(result)
        except Exception as exc:
            logger.debug("Graph query for process nodes failed: %s", exc)

    return nodes


def _collect_drive_state(
    graph: Any,
    citizen_engines: Optional[Dict[str, Any]],
) -> Dict[str, float]:
    """Collect aggregate drive state for the dispatch context.

    Returns a dict of drive_name → average intensity across all citizens.
    Used by dispatch_all for drive_snapshot recording.
    """
    drive_totals: Dict[str, float] = {}
    citizen_count = 0

    if citizen_engines:
        for citizen_id, engine in citizen_engines.items():
            state = getattr(engine, "state", None) or getattr(engine, "cognitive_state", None)
            if state is None:
                continue

            limbic = getattr(state, "limbic", None)
            if limbic is None:
                continue

            drives = getattr(limbic, "drives", {})
            for name, drive in drives.items():
                intensity = getattr(drive, "intensity", 0.0) if hasattr(drive, "intensity") else drive
                drive_totals[name] = drive_totals.get(name, 0.0) + intensity

            citizen_count += 1

    if citizen_count > 0:
        return {k: v / citizen_count for k, v in drive_totals.items()}

    return {}


# ---------------------------------------------------------------------------
# Moment recording
# ---------------------------------------------------------------------------


def _record_moment(graph: Any, fired_process: Any) -> None:
    """Record a fired process as a Moment node in the graph.

    Creates a moment node linked to the process node that fired,
    with the action result stored as an EvidenceRef.
    """
    if graph is None:
        return

    try:
        from runtime.cognition.dispatch.action_dispatch import create_task_runs
    except ImportError:
        pass

    result = fired_process.result
    process_id = fired_process.process_id
    ts = int(time.time())

    try:
        adapter = graph._graph._adapter if hasattr(graph, "_graph") else graph
        inject = getattr(adapter, "inject", None) or getattr(adapter, "execute", None)
        if inject is None:
            return

        moment_id = f"moment:action:{process_id}:{ts}"

        # Create moment node
        inject(
            f"CREATE (m:Moment {{"
            f"  id: '{moment_id}',"
            f"  type: 'action_result',"
            f"  tool: '{result.tool}',"
            f"  success: {str(result.success).lower()},"
            f"  duration_ms: {result.duration_ms},"
            f"  evidence_ref: '{result.evidence_ref}',"
            f"  created_at_s: {ts}"
            f"}})"
        )

        # Link moment to process node
        inject(
            f"MATCH (p {{id: '{process_id}'}}), (m {{id: '{moment_id}'}})"
            f" CREATE (p)-[:LINK {{verb: 'produced'}}]->(m)"
        )

    except Exception as exc:
        logger.debug("Moment recording failed for %s: %s", process_id, exc)


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


def subscribe_tick(listener: Callable) -> None:
    """Subscribe a listener to tick_complete events.

    Listener signature: (tick_number: int, result: dict) -> None
    """
    _tick_listeners.append(listener)


def get_last_tick_result() -> Optional[Dict[str, Any]]:
    """Get the result of the most recent tick."""
    return _last_tick_result


def get_tick_count() -> int:
    """Get the current tick count."""
    return _tick_count
