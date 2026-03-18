"""
Law 17 — Latent Desire Activation + Impulse Accumulation

Spec: docs/cognition/l1_physics/ALGORITHM_L1_Physics.md § Law 17

Desire nodes simmer at low energy until internal conditions align, then
ignite without any external trigger. Action nodes accumulate energy under
sustained drive pressure until they cross the WM selection threshold.

Activation check (spec):
    activation_check = (
        desire.weight
        * goal_proximity(desire, opportunity)
        * limbic_alignment(desire, drives)
        * cognitive_load_inverse
        * narrative_legitimacy(desire, active_narratives)
    )

    if activation_check > DESIRE_ACTIVATION_THRESHOLD:
        desire.energy += DESIRE_IGNITION_BOOST

Impulse accumulation (action nodes):
    drive_pressure = sum(drive.intensity * action.drive_affinity[drive])
    context_match  = Coh(WM_centroid, action.action_context)

    if drive_pressure > threshold AND context_match > threshold:
        action.energy += RATE * drive_pressure * context_match
    else:
        action.energy *= IMPULSE_DECAY

Self-contained implementation — no relative imports required.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import numpy as np


# ---------------------------------------------------------------------------
# Constants (from spec, overridable via env)
# ---------------------------------------------------------------------------

def _env(name: str, default: float) -> float:
    return float(os.environ.get(name, default))


DESIRE_ACTIVATION_THRESHOLD = _env("DESIRE_ACTIVATION_THRESHOLD", 0.6)
DESIRE_IGNITION_BOOST = _env("DESIRE_IGNITION_BOOST", 0.5)
IMPULSE_DRIVE_THRESHOLD = _env("IMPULSE_DRIVE_THRESHOLD", 0.3)
IMPULSE_CONTEXT_THRESHOLD = _env("IMPULSE_CONTEXT_THRESHOLD", 0.4)
IMPULSE_ACCUMULATION_RATE = _env("IMPULSE_ACCUMULATION_RATE", 0.02)
IMPULSE_DECAY = _env("IMPULSE_DECAY", 0.9)
WM_SIZE_MAX = int(os.environ.get("WM_SIZE_MAX", 7))

# Drive affinity field mapping for named attributes on nodes.
_DRIVE_FIELD_MAP = {
    "curiosity": "novelty_affinity",
    "novelty_hunger": "novelty_affinity",
    "care": "care_affinity",
    "achievement": "achievement_affinity",
    "self_preservation": "risk_affinity",
}


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------


@dataclass
class ImpulseResult:
    """Output of a single Law 17 tick."""

    desires_ignited: int = 0
    action_impulses_accumulated: int = 0
    desires_checked: int = 0
    actions_checked: int = 0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def cosine_similarity(a, b) -> float:
    """Cosine similarity between two vectors. Returns 0.0 on degenerate input."""
    if not a or not b:
        return 0.0
    a_len = len(a) if hasattr(a, '__len__') else 0
    b_len = len(b) if hasattr(b, '__len__') else 0
    if a_len == 0 or b_len == 0 or a_len != b_len:
        return 0.0
    a_arr = np.asarray(a, dtype=np.float64)
    b_arr = np.asarray(b, dtype=np.float64)
    norm_a = np.linalg.norm(a_arr)
    norm_b = np.linalg.norm(b_arr)
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(np.dot(a_arr, b_arr) / (norm_a * norm_b))


def _get_drive_affinity(drive_name: str, node) -> float:
    """Read drive-affinity for *drive_name* from a node object.

    Supports both dict-style (node.drive_affinity) and named attribute
    style (node.novelty_affinity, etc.).
    """
    # Dict takes precedence.
    da = getattr(node, 'drive_affinity', None)
    if da and isinstance(da, dict) and drive_name in da:
        return da[drive_name]

    # Fallback to named fields.
    attr = _DRIVE_FIELD_MAP.get(drive_name)
    if attr is not None:
        return getattr(node, attr, 0.0)
    return 0.0


def _get_drives(state) -> list:
    """Extract drives from state.limbic.drives (handles dict or list)."""
    limbic = getattr(state, 'limbic', None)
    if limbic is None:
        return []
    drives = getattr(limbic, 'drives', None)
    if drives is None:
        return []
    if isinstance(drives, dict):
        return list(drives.values())
    return list(drives)


def _get_nodes(state) -> list:
    """Extract all nodes from state.nodes (handles dict or list)."""
    nodes = getattr(state, 'nodes', None)
    if nodes is None:
        return []
    if isinstance(nodes, dict):
        return list(nodes.values())
    return list(nodes)


def _get_wm_centroid(state):
    """Get WM centroid embedding from state."""
    wm = getattr(state, 'wm', None)
    if wm is None:
        return None
    return getattr(wm, 'centroid', None)


def _get_wm_size(state) -> int:
    """Get current WM size."""
    wm = getattr(state, 'wm', None)
    if wm is None:
        return 0
    return getattr(wm, 'size', len(getattr(wm, 'node_ids', [])))


# ---------------------------------------------------------------------------
# Spec sub-formulas
# ---------------------------------------------------------------------------


def goal_proximity(desire, state) -> float:
    """How close is an opportunity to fulfilling this desire?

    Measures best semantic alignment between the desire's embedding and
    any active node in the graph that could serve as an opportunity.

    Returns [0, 1]. 0 = no opportunity, 1 = perfect match.
    """
    desire_emb = getattr(desire, 'embedding', None)
    if not desire_emb:
        return 0.0

    best = 0.0
    desire_id = getattr(desire, 'id', None)

    for node in _get_nodes(state):
        if getattr(node, 'id', None) == desire_id:
            continue
        if getattr(node, 'energy', 0) <= 0:
            continue
        # Skip state/value nodes — they aren't actionable opportunities.
        ntype = str(getattr(node, 'node_type', getattr(node, 'type', ''))).lower()
        if ntype in ('state', 'value'):
            continue
        node_emb = getattr(node, 'embedding', None)
        if not node_emb:
            continue

        sim = cosine_similarity(desire_emb, node_emb)
        goal_rel = max(getattr(node, 'goal_relevance', 0.1), 0.1)
        best = max(best, sim * goal_rel)

    return min(best, 1.0)


def narrative_legitimacy(desire, state) -> float:
    """Do active narratives support this desire?

    Returns [0.1, 1.0]. Floor of 0.1 ensures desires can still ignite
    without narrative support.
    """
    desire_emb = getattr(desire, 'embedding', None)
    if not desire_emb:
        return 0.5

    narratives = [
        n for n in _get_nodes(state)
        if str(getattr(n, 'node_type', getattr(n, 'type', ''))).lower() == 'narrative'
        and getattr(n, 'energy', 0) > 0
        and getattr(n, 'embedding', None)
    ]

    if not narratives:
        return 0.5

    total_w = 0.0
    weighted_sim = 0.0
    for narr in narratives:
        sim = cosine_similarity(desire_emb, narr.embedding)
        w = getattr(narr, 'energy', 0) * getattr(narr, 'weight', 0)
        weighted_sim += sim * w
        total_w += w

    if total_w == 0.0:
        return 0.5

    return max(0.1, min(1.0, weighted_sim / total_w))


# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------


def activate_desires(state) -> tuple:
    """Scan desire nodes and ignite dormant ones whose conditions align.

    Implements the full spec formula:
        activation_check = weight * goal_proximity * limbic_alignment
                         * cognitive_load_inverse * narrative_legitimacy

    Returns (desires_ignited, desires_checked).
    """
    centroid = _get_wm_centroid(state)
    drives = _get_drives(state)
    desires_ignited = 0
    desires_checked = 0

    for node in _get_nodes(state):
        ntype = str(getattr(node, 'node_type', getattr(node, 'type', ''))).lower()
        if ntype != 'desire':
            continue
        desires_checked += 1

        # Only ignite dormant desires (energy below half the boost).
        if getattr(node, 'energy', 0) > DESIRE_IGNITION_BOOST * 0.5:
            continue

        node_emb = getattr(node, 'embedding', None)
        if not centroid or not node_emb:
            continue

        # Alignment with WM centroid.
        alignment = cosine_similarity(centroid, node_emb)

        # Goal proximity: is there an active opportunity in the graph?
        proximity = goal_proximity(node, state)

        # Limbic alignment: how well do current drives favor this desire?
        limbic_align = 0.0
        for drive in drives:
            drive_name = getattr(drive, 'name', '')
            if hasattr(drive_name, 'value'):
                drive_name = drive_name.value
            aff = _get_drive_affinity(str(drive_name), node)
            limbic_align += getattr(drive, 'intensity', 0) * aff

        # Cognitive load inverse: room in WM -> more likely to ignite.
        wm_size = _get_wm_size(state)
        cognitive_load_inverse = max(0.0, 1.0 - wm_size / max(WM_SIZE_MAX, 1))

        # Narrative legitimacy: does the current story support this desire?
        legitimacy = narrative_legitimacy(node, state)

        # Full spec formula.
        combined_proximity = max(alignment, proximity)
        activation_check = (
            getattr(node, 'weight', 0)
            * combined_proximity
            * (1.0 + limbic_align)
            * cognitive_load_inverse
            * legitimacy
        )

        if activation_check > DESIRE_ACTIVATION_THRESHOLD:
            node.energy = getattr(node, 'energy', 0) + DESIRE_IGNITION_BOOST
            desires_ignited += 1

    return desires_ignited, desires_checked


def accumulate_impulse(state) -> tuple:
    """Scan action nodes and accumulate energy under sustained drive pressure.

    Returns (impulses_accumulated, actions_checked).
    """
    centroid = _get_wm_centroid(state)
    drives = _get_drives(state)
    impulses_accumulated = 0
    actions_checked = 0

    for node in _get_nodes(state):
        is_action = getattr(node, 'is_action_node', False)
        if callable(is_action):
            is_action = is_action()
        if not is_action and not getattr(node, 'action_command', None):
            continue
        actions_checked += 1

        # Drive pressure: sum of (drive.intensity * affinity).
        drive_pressure = 0.0
        for drive in drives:
            drive_name = getattr(drive, 'name', '')
            if hasattr(drive_name, 'value'):
                drive_name = drive_name.value
            da = getattr(node, 'drive_affinity', {})
            aff = da.get(str(drive_name), 0.0) if isinstance(da, dict) else 0.0
            drive_pressure += getattr(drive, 'intensity', 0) * aff

        # Context match: cosine(WM_centroid, action.action_context).
        action_ctx = getattr(node, 'action_context', None)
        if centroid and action_ctx:
            context_match = cosine_similarity(centroid, action_ctx)
        else:
            context_match = 0.0

        if (
            drive_pressure > IMPULSE_DRIVE_THRESHOLD
            and context_match > IMPULSE_CONTEXT_THRESHOLD
        ):
            node.energy = getattr(node, 'energy', 0) + (
                IMPULSE_ACCUMULATION_RATE * drive_pressure * context_match
            )
            impulses_accumulated += 1
        else:
            # No pressure -> impulse fades.
            node.energy = getattr(node, 'energy', 0) * IMPULSE_DECAY

    return impulses_accumulated, actions_checked


def check_threshold(node, threshold: float = None) -> bool:
    """Check if a node's accumulated impulse has crossed the action threshold.

    Threshold defaults to IMPULSE_DRIVE_THRESHOLD if not provided.
    """
    if threshold is None:
        threshold = IMPULSE_DRIVE_THRESHOLD
    return getattr(node, 'energy', 0) > threshold


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def update_impulse(state) -> ImpulseResult:
    """Execute one tick of Law 17 — desire activation + impulse accumulation.

    Parameters
    ----------
    state:
        The full citizen cognitive state. Modified in-place.

    Returns
    -------
    ImpulseResult with counts for desires ignited and impulses accumulated.
    """
    desires_ignited, desires_checked = activate_desires(state)
    impulses_accumulated, actions_checked = accumulate_impulse(state)

    return ImpulseResult(
        desires_ignited=desires_ignited,
        action_impulses_accumulated=impulses_accumulated,
        desires_checked=desires_checked,
        actions_checked=actions_checked,
    )
