"""runtime/cognition/dispatch/action_dispatch.py

Subconscious action dispatch — converts impulse-driven process node firings
into concrete tool executions. Zero LLM calls.

Spec:
  docs/interaction/ALGORITHM_Interaction.md (steps 5-6)
  docs/interaction/IMPLEMENTATION_Interaction.md
  docs/process/ALGORITHM_Process.md (step 4-5)
  docs/process/IMPLEMENTATION_Process.md

DOCS: docs/interaction/IMPLEMENTATION_Interaction.md

Flow:
  Law 17 accumulates impulse on process nodes → impulse >= threshold →
  dispatch_action_command() parses action_command → looks up MCP tool →
  executes handler directly → records result as moment node with EvidenceRef.
"""

from __future__ import annotations

import json
import logging
import shlex
import subprocess
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger("mind.dispatch")

# Default constants — importable from cognition/constants.py when available.
try:
    from runtime.cognition.constants import REFRACTORY_TICKS
except ImportError:
    REFRACTORY_TICKS = 5

DISPATCH_TIMEOUT_S = 30
EVIDENCE_DIR = Path.home() / ".mind" / "evidence"


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


class CommandType(Enum):
    """Discriminator for action_command parsing."""
    MCP_TOOL = "mcp_tool"
    SHELL = "shell"
    SUBCALL = "subcall"


@dataclass
class ActionResult:
    """Result of dispatching an action_command."""
    success: bool
    tool: str
    duration_ms: int = 0
    evidence_ref: str = ""
    stdout: str = ""
    stderr: str = ""
    exit_code: int = 0
    error: str = ""


@dataclass
class FiredProcess:
    """Record of a process node that fired."""
    process_id: str
    action_command: str
    result: ActionResult
    fired_at: int = 0  # tick number
    drive_snapshot: Dict[str, float] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# MCP Tool Registry
# ---------------------------------------------------------------------------

# Maps tool name -> handler callable.
# Populated at startup by register_mcp_tools().
MCP_TOOL_REGISTRY: Dict[str, Callable] = {}


def register_mcp_tools(
    tool_map: Optional[Dict[str, Callable]] = None,
) -> Dict[str, Callable]:
    """Build the MCP_TOOL_REGISTRY mapping tool names to handler functions.

    If *tool_map* is provided, use it directly (useful for testing or
    when handlers are already imported).  Otherwise, attempt to import
    the canonical handlers from mcp.tools.

    Returns the populated registry dict (also stored as module-level
    MCP_TOOL_REGISTRY).

    See: docs/interaction/IMPLEMENTATION_Interaction.md
    """
    global MCP_TOOL_REGISTRY

    if tool_map is not None:
        MCP_TOOL_REGISTRY.update(tool_map)
        logger.info("MCP_TOOL_REGISTRY loaded: %d tools (explicit)", len(MCP_TOOL_REGISTRY))
        return MCP_TOOL_REGISTRY

    # Auto-discover from the canonical handler modules.
    _handler_map = {
        "graph_query": ("mcp.tools.graph_query_handler", "handle_graph_query"),
        "graph_write": ("mcp.tools.graph_write_handler", "handle_graph_write"),
        "procedure":   ("mcp.tools.procedure_handler",   "handle_procedure"),
        "task":        ("mcp.tools.task_handler",         "handle_task"),
        "think":       ("mcp.tools.think_handler",        "handle_think"),
        "send":        ("mcp.tools.send_handler",         "handle_send"),
        "read":        ("mcp.tools.read_handler",         "handle_read"),
        "media":       ("mcp.tools.media_handler",        "handle_media"),
        "alarm":       ("mcp.tools.alarm_handler",        "handle_alarm"),
        "place":       ("mcp.tools.place_handler",        "handle_place"),
        "call":        ("mcp.tools.call_handler",         "handle_call"),
        "subcall":     ("mcp.tools.subcall_handler",      "handle_subcall"),
        "profile":     ("mcp.tools.profile_handler",      "handle_profile"),
        "spawn":       ("mcp.tools.spawn_handler",        "handle_spawn"),
        "debug":       ("mcp.tools.debug_handler",        "handle_debug"),
    }

    import importlib

    for tool_name, (module_path, func_name) in _handler_map.items():
        try:
            mod = importlib.import_module(module_path)
            handler = getattr(mod, func_name)
            MCP_TOOL_REGISTRY[tool_name] = handler
        except (ImportError, AttributeError) as exc:
            logger.debug("Could not load tool '%s': %s", tool_name, exc)

    logger.info("MCP_TOOL_REGISTRY loaded: %d tools (auto-discover)", len(MCP_TOOL_REGISTRY))
    return MCP_TOOL_REGISTRY


# ---------------------------------------------------------------------------
# Command parsing
# ---------------------------------------------------------------------------


def parse_command_type(action_command: str) -> CommandType:
    """Classify an action_command string as MCP tool, subcall, or shell.

    Classification rules:
      - Starts with ``@`` or ``subcall `` → SUBCALL
      - First token matches a key in MCP_TOOL_REGISTRY → MCP_TOOL
      - Everything else → SHELL

    See: docs/process/IMPLEMENTATION_Process.md

    >>> parse_command_type("send --platform telegram 'hello'")
    <CommandType.MCP_TOOL: 'mcp_tool'>
    >>> parse_command_type("@scout How do you handle X?")
    <CommandType.SUBCALL: 'subcall'>
    >>> parse_command_type("git status")
    <CommandType.SHELL: 'shell'>
    """
    cmd = action_command.strip()
    if not cmd:
        return CommandType.SHELL

    # Subcall shorthand: @target or explicit "subcall" prefix
    if cmd.startswith("@") or cmd.lower().startswith("subcall "):
        return CommandType.SUBCALL

    # Extract first token
    first_token = cmd.split()[0].lower()

    if first_token in MCP_TOOL_REGISTRY:
        return CommandType.MCP_TOOL

    return CommandType.SHELL


def parse_action_command(action_command: str) -> tuple[str, Dict[str, Any]]:
    """Parse an action_command string into (tool_name, args_dict).

    Parsing strategy (from ALGORITHM_Interaction.md step 5):
      1. Split on first space to get tool_name and remainder.
      2. If remainder looks like key=value pairs, parse as dict.
      3. If remainder is plain text, wrap in a context-appropriate key.

    Returns (tool_name, args_dict) where tool_name is the MCP tool name
    (or "bash" for shell commands, "subcall" for subcall shorthand).

    See: docs/interaction/IMPLEMENTATION_Interaction.md

    >>> parse_action_command("send --platform telegram --message hello")
    ('send', {'platform': 'telegram', 'message': 'hello'})
    >>> parse_action_command("bash git status")
    ('bash', {'command': 'git status'})
    >>> parse_action_command("@scout How do you handle X?")
    ('subcall', {'query': 'How do you handle X?', 'target': 'scout'})
    """
    cmd = action_command.strip()
    if not cmd:
        return ("bash", {"command": ""})

    cmd_type = parse_command_type(cmd)

    # --- Subcall ---
    if cmd_type == CommandType.SUBCALL:
        if cmd.startswith("@"):
            # @target message
            parts = cmd.split(None, 1)
            target = parts[0].lstrip("@")
            query = parts[1] if len(parts) > 1 else ""
            return ("subcall", {"target": target, "query": query})
        else:
            # "subcall ..." prefix
            remainder = cmd[len("subcall"):].strip()
            return ("subcall", {"query": remainder})

    # --- Shell ---
    if cmd_type == CommandType.SHELL:
        return ("bash", {"command": cmd})

    # --- MCP tool ---
    parts = cmd.split(None, 1)
    tool_name = parts[0].lower()
    remainder = parts[1] if len(parts) > 1 else ""

    args = _parse_args_string(remainder)
    return (tool_name, args)


def _parse_args_string(remainder: str) -> Dict[str, Any]:
    """Best-effort parse of an argument string into a dict.

    Supports two formats:
      --key value    (CLI-style flags)
      key=value      (assignment pairs)

    Falls back to {"message": remainder} if no structure detected.
    """
    if not remainder.strip():
        return {}

    args: Dict[str, Any] = {}

    # Try CLI-style --key value parsing
    if "--" in remainder:
        try:
            tokens = shlex.split(remainder)
        except ValueError:
            tokens = remainder.split()

        i = 0
        positional = []
        while i < len(tokens):
            tok = tokens[i]
            if tok.startswith("--"):
                key = tok.lstrip("-").replace("-", "_")
                # Next token is the value (unless it's also a flag or end-of-list)
                if i + 1 < len(tokens) and not tokens[i + 1].startswith("--"):
                    args[key] = tokens[i + 1]
                    i += 2
                else:
                    args[key] = True
                    i += 1
            else:
                positional.append(tok)
                i += 1

        if positional and not args:
            # All positional — treat as plain message
            return {"message": " ".join(positional)}
        if positional:
            args["_positional"] = positional
        return args

    # Try key=value parsing
    if "=" in remainder:
        for part in shlex.split(remainder):
            if "=" in part:
                k, v = part.split("=", 1)
                args[k.strip()] = v.strip()
            else:
                args.setdefault("_positional", []).append(part)
        if args:
            return args

    # Fallback: plain text
    return {"message": remainder}


# ---------------------------------------------------------------------------
# Dispatch execution
# ---------------------------------------------------------------------------


def dispatch_action(
    action_command: str,
    *,
    timeout: int = DISPATCH_TIMEOUT_S,
) -> ActionResult:
    """Execute an action_command string via shell or MCP tool.

    This is the Process-module entry point (docs/process).
    Routes to dispatch_action_command() for MCP tools or runs shell
    commands directly via subprocess.

    Returns an ActionResult with execution outcome.

    See: docs/process/IMPLEMENTATION_Process.md
    """
    cmd_type = parse_command_type(action_command)

    if cmd_type == CommandType.SHELL:
        return _dispatch_shell(action_command.strip(), timeout=timeout)

    # MCP tool or subcall — delegate to the full dispatch path.
    tool_name, args = parse_action_command(action_command)
    return dispatch_action_command(tool_name, args)


def dispatch_action_command(
    tool_name: str,
    args: Dict[str, Any],
    *,
    ctx: Any = None,
) -> ActionResult:
    """Parse and dispatch an action_command to the appropriate MCP tool handler.

    This is the Interaction-module entry point (docs/interaction).
    Looks up *tool_name* in MCP_TOOL_REGISTRY, executes the handler
    directly (zero LLM), and returns an ActionResult.

    The result is also written to the evidence filesystem for
    EvidenceRef linking.

    See: docs/interaction/IMPLEMENTATION_Interaction.md
    """
    start_ns = time.monotonic_ns()

    handler = MCP_TOOL_REGISTRY.get(tool_name)
    if handler is None:
        # Unknown tool — try shell fallback if it looks like a command.
        if tool_name == "bash":
            return _dispatch_shell(args.get("command", ""))
        return ActionResult(
            success=False,
            tool=tool_name,
            error=f"Unknown tool '{tool_name}'. Registered: {sorted(MCP_TOOL_REGISTRY.keys())}",
        )

    try:
        # MCP handlers expect (args_dict, ctx).
        result_raw = handler(args, ctx)
        duration_ms = (time.monotonic_ns() - start_ns) // 1_000_000

        # Extract text from MCP response format.
        stdout = ""
        if isinstance(result_raw, dict):
            content = result_raw.get("content", [])
            if content and isinstance(content, list):
                stdout = content[0].get("text", "") if content[0] else ""
            elif isinstance(content, str):
                stdout = content

        success = True
        if isinstance(result_raw, dict):
            text = stdout.lower()
            if text.startswith("error:"):
                success = False

        # Write evidence.
        evidence_ref = _write_evidence(tool_name, args, stdout, duration_ms)

        return ActionResult(
            success=success,
            tool=tool_name,
            duration_ms=duration_ms,
            stdout=stdout,
            evidence_ref=evidence_ref,
        )

    except Exception as exc:
        duration_ms = (time.monotonic_ns() - start_ns) // 1_000_000
        logger.error("Tool '%s' execution failed: %s", tool_name, exc, exc_info=True)
        return ActionResult(
            success=False,
            tool=tool_name,
            duration_ms=duration_ms,
            error=str(exc),
        )


# ---------------------------------------------------------------------------
# Shell dispatch
# ---------------------------------------------------------------------------


def _dispatch_shell(command: str, *, timeout: int = DISPATCH_TIMEOUT_S) -> ActionResult:
    """Execute a shell command via subprocess with timeout."""
    if not command:
        return ActionResult(success=False, tool="bash", error="Empty command")

    start_ns = time.monotonic_ns()
    try:
        proc = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        duration_ms = (time.monotonic_ns() - start_ns) // 1_000_000
        evidence_ref = _write_evidence(
            "bash", {"command": command}, proc.stdout, duration_ms, proc.stderr
        )
        return ActionResult(
            success=proc.returncode == 0,
            tool="bash",
            duration_ms=duration_ms,
            stdout=proc.stdout[:4096],  # cap output
            stderr=proc.stderr[:2048],
            exit_code=proc.returncode,
            evidence_ref=evidence_ref,
        )
    except subprocess.TimeoutExpired:
        duration_ms = (time.monotonic_ns() - start_ns) // 1_000_000
        return ActionResult(
            success=False,
            tool="bash",
            duration_ms=duration_ms,
            error=f"Timeout after {timeout}s: {command[:80]}",
        )
    except Exception as exc:
        duration_ms = (time.monotonic_ns() - start_ns) // 1_000_000
        return ActionResult(
            success=False,
            tool="bash",
            duration_ms=duration_ms,
            error=str(exc),
        )


# ---------------------------------------------------------------------------
# Evidence filesystem
# ---------------------------------------------------------------------------


def _write_evidence(
    tool: str,
    args: Dict[str, Any],
    stdout: str,
    duration_ms: int,
    stderr: str = "",
) -> str:
    """Persist action output to filesystem for EvidenceRef.

    Writes to ~/.mind/evidence/{tool}/{timestamp}.json.
    Returns the path string (the EvidenceRef).
    """
    try:
        tool_dir = EVIDENCE_DIR / tool
        tool_dir.mkdir(parents=True, exist_ok=True)

        ts = int(time.time() * 1000)
        evidence_path = tool_dir / f"{ts}.json"
        evidence_path.write_text(json.dumps({
            "tool": tool,
            "args": {k: str(v)[:500] for k, v in args.items()},
            "stdout": stdout[:8192],
            "stderr": stderr[:2048],
            "duration_ms": duration_ms,
            "timestamp": ts,
        }, indent=2, ensure_ascii=False))

        return str(evidence_path)
    except Exception as exc:
        logger.warning("Evidence write failed: %s", exc)
        return ""


# ---------------------------------------------------------------------------
# Tick integration — dispatch_all()
# ---------------------------------------------------------------------------


def dispatch_all(
    process_nodes: List[Any],
    tick: int,
    drive_state: Optional[Dict[str, float]] = None,
) -> List[FiredProcess]:
    """Collect eligible process nodes and dispatch those above threshold.

    Called once per tick by the physics engine after Law 17 impulse
    accumulation. Nodes whose impulse >= firing_threshold get their
    action_command dispatched. After firing, impulse resets to 0 and
    refractory_until is set.

    See: docs/interaction/IMPLEMENTATION_Interaction.md § Entry Points
    """
    fired: List[FiredProcess] = []
    max_fires = 2  # MAX_FIRES_PER_TICK from spec

    for node in process_nodes:
        if len(fired) >= max_fires:
            break

        # Skip nodes without action commands.
        action_cmd = getattr(node, "action_command", None)
        if not action_cmd:
            continue

        # Skip nodes in refractory period.
        refractory_until = getattr(node, "refractory_until", 0) or 0
        if tick < refractory_until:
            continue

        # Check impulse against threshold.
        impulse = getattr(node, "impulse", 0.0) or 0.0
        threshold = getattr(node, "firing_threshold", 0.5) or 0.5
        if impulse < threshold:
            continue

        # --- Fire! ---
        logger.info(
            "FIRE process=%s impulse=%.3f threshold=%.3f cmd=%s",
            getattr(node, "id", "?"), impulse, threshold, action_cmd[:60],
        )

        result = dispatch_action(action_cmd)

        fp = FiredProcess(
            process_id=getattr(node, "id", "unknown"),
            action_command=action_cmd,
            result=result,
            fired_at=tick,
            drive_snapshot=drive_state or {},
        )
        fired.append(fp)

        # Reset impulse and set refractory period.
        node.impulse = 0.0
        node.refractory_until = tick + REFRACTORY_TICKS

        # Increment fire count.
        fire_count = getattr(node, "fire_count", 0) or 0
        node.fire_count = fire_count + 1
        node.last_fired = tick

    return fired
