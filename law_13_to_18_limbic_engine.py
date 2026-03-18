"""law_13_to_18_limbic_engine.py
Law 17 — _law_17_desire_activation() and impulse-specific helpers.

Top-level re-export for convenience. Delegates to
runtime/cognition/laws/law_17_impulse.py for the full implementation.
"""

import sys
import os

# Ensure runtime package is importable.
_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

from runtime.cognition.laws.law_17_impulse import (
    activate_desires,
    accumulate_impulse,
    check_threshold,
    cosine_similarity,
    goal_proximity,
    narrative_legitimacy,
    update_impulse,
    ImpulseResult,
)


def _law_17_desire_activation(state) -> tuple:
    """Law 17 — Latent desire activation + impulse accumulation.

    Scans all desire nodes and ignites dormant ones whose context aligns
    (goal_proximity × limbic_alignment × cognitive_load_inverse ×
    narrative_legitimacy > threshold). Then scans action nodes and
    accumulates energy under sustained drive pressure.

    Parameters
    ----------
    state:
        CitizenCognitiveState (or any object with .nodes, .limbic, .wm).
        Modified in-place.

    Returns
    -------
    (desires_ignited, action_impulses_accumulated)
    """
    result = update_impulse(state)
    return result.desires_ignited, result.action_impulses_accumulated
