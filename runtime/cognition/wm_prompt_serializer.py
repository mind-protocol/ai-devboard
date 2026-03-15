"""runtime/cognition/wm_prompt_serializer.py

Working Memory Prompt Serializer — export L1 cognitive state as natural language.

Spec:
  docs/grammar/ALGORITHM_Grammar.md
  docs/grammar/IMPLEMENTATION_Grammar.md

Converts the cognitive graph into first-person inner monologue that the
citizen's LLM can internalize: what I'm thinking, what I feel, what
connects to what, what shifted.

Budget: ~5000 chars (~1200-1500 tokens).

DOCS: docs/grammar/IMPLEMENTATION_Grammar.md
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger("cognition.wm_serializer")


# ---------------------------------------------------------------------------
# Link-type → natural language verbs
# ---------------------------------------------------------------------------

_LINK_VERBS: Dict[str, List[str]] = {
    "supports":        ["because", "rooted in", "drawing strength from"],
    "activates":       ["which makes me think of", "sparking", "lighting up"],
    "contradicts":     ["yet this is in tension with", "which contradicts"],
    "reminds_of":      ["which reminds me of", "echoing", "calling to mind"],
    "causes":          ["which leads to", "resulting in", "making possible"],
    "conflicts_with":  ["which conflicts with", "creating friction with"],
    "regulates":       ["held in check by", "governed by", "bounded by"],
    "projects_toward": ["pointing toward", "reaching toward", "converging on"],
    "depends_on":      ["which depends on", "built on top of", "requiring"],
    "exemplifies":     ["a living example of", "which embodies"],
    "specializes":     ["a specific form of", "which refines"],
    "associates":      ["connected to", "linked with", "associated with"],
    "contains":        ["containing", "which holds", "encompassing"],
    "abstracts":       ["an abstraction of", "distilling"],
}

# Node type → intro variants
_NODE_INTROS: Dict[str, List[str]] = {
    "value":     ["One of my core values", "A conviction of mine"],
    "desire":    ["Something I want", "A desire I'm carrying"],
    "concept":   ["An idea present in my mind", "Something I'm thinking about"],
    "memory":    ["Something I remember", "A memory that's surfacing"],
    "narrative": ["A story I'm living", "Part of my ongoing story"],
    "process":   ["A way I know how to act", "Something I can do"],
    "state":     ["A state I'm aware of", "Something I'm sensing"],
}

# Orientation → felt experience
_ORIENTATION_FELT = {
    "explore":   "I feel curious — drawn to investigate, dig deeper, understand something new.",
    "create":    "I feel a creative impulse — I want to build, express, produce something.",
    "care":      "I feel attentive to others — I want to reach out, support, nurture.",
    "verify":    "I feel the need to check — something needs validating, testing, verifying.",
    "rest":      "I feel settled — no urgency. Time to reflect, consolidate, or simply be.",
    "socialize": "I feel drawn to connection — I want to talk, interact, be present with others.",
    "act":       "I feel driven toward action — I want to make concrete progress, fix things, ship.",
}

# Emotion → (sentence template, node affinity field)
_EMOTION_FORMS: Dict[str, List[tuple]] = {
    "frustration": [
        ("Something is {level} frustrating me right now: {content}", "achievement_affinity"),
    ],
    "anxiety": [
        ("There's a {level} anxious undercurrent about: {content}", "risk_affinity"),
    ],
    "boredom": [
        ("Something feels {level} stale to me: {content}", "novelty_affinity"),
    ],
    "satisfaction": [
        ("I feel {level} satisfied about: {content}", "achievement_affinity"),
    ],
    "tenderness": [
        ("I feel {level} tender about: {content}", "care_affinity"),
    ],
    "solitude": [
        ("I'm {level} feeling the absence of connection around: {content}", "care_affinity"),
    ],
}

# Drive → felt description
_DRIVE_FELT = {
    "curiosity":         "I want to understand more",
    "care":              "I'm attentive to others' needs",
    "achievement":       "I want to make progress and accomplish things",
    "self_preservation": "I feel cautious, something could go wrong",
    "novelty_hunger":    "I crave something new and different",
    "frustration":       "Something isn't working and it's getting to me",
    "affiliation":       "I want to connect and belong",
    "rest_regulation":   "I need to slow down and recover",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _pick(variants: List[str], seed: str) -> str:
    """Deterministically pick a variant based on content hash."""
    if not variants:
        return ""
    idx = int(hashlib.md5(seed.encode()).hexdigest(), 16) % len(variants)
    return variants[idx]


def _felt_intensity(intensity: float) -> str:
    if intensity > 0.8:  return "strongly"
    if intensity > 0.6:  return "noticeably"
    if intensity > 0.4:  return "moderately"
    if intensity > 0.2:  return "mildly"
    return "barely"


def _energy_feel(energy: float) -> str:
    if energy > 0.8:  return "this is burning bright in my mind"
    if energy > 0.4:  return "this is clearly present in my thoughts"
    if energy > 0.15: return "this is quietly here"
    if energy > 0.05: return "this is at the edge of awareness"
    return ""


def _get_node_type(node: Any) -> str:
    """Extract node type as a lowercase string."""
    nt = getattr(node, "node_type", None)
    if nt is None:
        return getattr(node, "type", "concept")
    return nt.value if hasattr(nt, "value") else str(nt).lower()


def _get_link_type(link: Any) -> str:
    """Extract link type as a lowercase string."""
    lt = getattr(link, "link_type", None)
    if lt is None:
        return getattr(link, "type", "associates")
    return lt.value if hasattr(lt, "value") else str(lt).lower()


# ---------------------------------------------------------------------------
# serialize_link()
# ---------------------------------------------------------------------------


def serialize_link(
    link: Any,
    source_node: Any = None,
    target_node: Any = None,
    *,
    language: str = "en",
) -> str:
    """Serialize a single link as a natural-language phrase.

    Consumes link dimensions (trust, affinity, friction, weight, energy)
    and the link type to produce a first-person verb phrase connecting
    source to target.

    If ``runtime.physics.synthesis.synthesize_link_phrase`` is available,
    delegates to the full grammar pipeline. Otherwise falls back to
    built-in link verb tables + dimension qualifiers.

    See: docs/grammar/IMPLEMENTATION_Grammar.md

    >>> serialize_link(link, src, tgt)
    'which makes me think of: collaborative design — and I deeply trust that'
    """
    # Try the full grammar pipeline if available.
    try:
        from runtime.physics.synthesis import synthesize_link_phrase
        phrase = synthesize_link_phrase(link, language=language)
        if phrase:
            return phrase
    except (ImportError, Exception):
        pass

    # --- Fallback: built-in serialization ---

    link_type_str = _get_link_type(link)

    # Select verb from variants
    verb_variants = _LINK_VERBS.get(link_type_str, ["connected to"])
    target_content = ""
    if target_node is not None:
        target_content = getattr(target_node, "content", None) or getattr(target_node, "id", "?")
    seed = target_content[:30] if target_content else link_type_str
    verb = _pick(verb_variants, seed)

    # Build qualifier from link dimensions
    qualifiers: List[str] = []

    trust = getattr(link, "trust", 0.0) or 0.0
    if trust > 0.75:
        qualifiers.append("and I deeply trust that")
    elif trust < 0.3 and trust > 0:
        qualifiers.append("though I'm uncertain whether")

    affinity = getattr(link, "affinity", 0.0) or 0.0
    if affinity > 0.85:
        qualifiers.append("tightly bound")
    elif 0.0 < affinity < 0.3:
        qualifiers.append("loosely tied")

    friction = getattr(link, "friction", 0.0) or 0.0
    if friction > 0.3:
        qualifiers.append("despite some resistance")

    weight = getattr(link, "weight", 0.0) or 0.0
    if weight > 0.85:
        qualifiers.append("a strong connection")
    elif 0.0 < weight < 0.3:
        qualifiers.append("a tenuous link")

    # Assemble
    parts = [verb]
    if target_content:
        parts.append(f": {target_content}")
    if qualifiers:
        parts.append(" — " + ", ".join(qualifiers[:2]))

    return "".join(parts)


# ---------------------------------------------------------------------------
# build_context()
# ---------------------------------------------------------------------------


def build_context(
    state: Any,
    *,
    orientation: Optional[str] = None,
    max_chars: int = 5000,
    include_drives: bool = True,
    include_emotions: bool = True,
    previous_wm_ids: Optional[List[str]] = None,
    previous_emotions: Optional[Dict[str, float]] = None,
) -> str:
    """Build the full Working Memory context as first-person natural language.

    Serializes the citizen's cognitive state into inner monologue that
    the LLM internalizes before generating a response. Sections:

    1. Orientation (what mode I'm in)
    2. Shifts (what changed since last tick)
    3. Emotions (what I feel, anchored to nodes)
    4. Focus (WM nodes with relationships via serialize_link)
    5. Peripheral (high-energy nodes outside WM)
    6. Drives (inner tensions)
    7. System line (stats)

    See: docs/grammar/IMPLEMENTATION_Grammar.md

    Parameters
    ----------
    state : CitizenCognitiveState
        Full cognitive state. Read-only — nothing mutated.
    orientation : str, optional
        Current orientation mode (explore, create, care, verify, rest, etc.)
    max_chars : int
        Hard budget for output length.
    previous_wm_ids : list[str], optional
        WM node IDs from the previous serialization (for shift detection).
    previous_emotions : dict[str, float], optional
        Emotion intensities from previous serialization (for shift detection).

    Returns
    -------
    str : First-person inner monologue, markdown-flavored.
    """
    parts: List[str] = []

    # Access state attributes with safe fallbacks
    nodes: Dict[str, Any] = getattr(state, "nodes", {}) or {}
    links: List[Any] = getattr(state, "links", []) or []
    wm = getattr(state, "wm", None)
    limbic = getattr(state, "limbic", None)

    wm_node_ids: List[str] = getattr(wm, "node_ids", []) if wm else []
    wm_id_set = set(wm_node_ids)

    # Sort all nodes by salience (energy × weight)
    def _salience(n: Any) -> float:
        return (getattr(n, "energy", 0.0) or 0.0) * (getattr(n, "weight", 0.0) or 0.0)

    all_nodes = sorted(nodes.values(), key=_salience, reverse=True)

    # ── 1. Orientation ────────────────────────────────────────────────────
    if orientation:
        felt = _ORIENTATION_FELT.get(orientation, "")
        if felt:
            parts.append(felt)

    # ── 2. Shifts ─────────────────────────────────────────────────────────
    shift_lines = _build_shifts(
        nodes, wm_id_set, limbic, previous_wm_ids, previous_emotions,
    )
    if shift_lines:
        parts.append("**What shifted:**\n" + "\n".join(shift_lines))

    # ── 3. Emotions ───────────────────────────────────────────────────────
    if include_emotions and limbic:
        emo_text = _build_emotions(limbic, all_nodes)
        if emo_text:
            parts.append(emo_text)

    # ── 4. Focus (WM nodes + links) ──────────────────────────────────────
    focus_budget = max_chars // 2
    focus_text = _build_focus(nodes, links, wm_node_ids, wm_id_set, focus_budget)
    if focus_text:
        parts.append(focus_text)

    # ── 5. Peripheral ─────────────────────────────────────────────────────
    peripheral = [
        n for n in all_nodes
        if getattr(n, "id", "") not in wm_id_set
        and (getattr(n, "energy", 0.0) or 0.0) > 0.03
    ]
    if peripheral:
        periph_text = _build_peripheral(peripheral, max_chars // 5)
        if periph_text:
            parts.append(periph_text)

    # ── 6. Drives ─────────────────────────────────────────────────────────
    if include_drives and limbic:
        drive_text = _build_drives(limbic)
        if drive_text:
            parts.append(drive_text)

    # ── 7. System line ────────────────────────────────────────────────────
    memory_count = sum(
        1 for n in nodes.values() if _get_node_type(n) == "memory"
    )
    tick_count = getattr(state, "tick_count", 0) or 0
    parts.append(
        f"_[{len(nodes)} nodes in graph, {len(wm_id_set)} in focus, "
        f"{memory_count} memories, tick #{tick_count}]_"
    )

    result = "\n\n".join(parts)

    # Hard cap
    if len(result) > max_chars:
        result = result[: max_chars - 3] + "..."

    return result


# ---------------------------------------------------------------------------
# Section builders (private)
# ---------------------------------------------------------------------------


def _build_shifts(
    nodes: Dict[str, Any],
    current_wm: set,
    limbic: Any,
    previous_wm_ids: Optional[List[str]],
    previous_emotions: Optional[Dict[str, float]],
) -> List[str]:
    """Detect and narrate what changed since last serialization."""
    shifts: List[str] = []

    if previous_wm_ids is not None:
        prev_set = set(previous_wm_ids)
        for nid in current_wm - prev_set:
            node = nodes.get(nid)
            if node:
                content = getattr(node, "content", None) or getattr(node, "id", nid)
                shifts.append(f"- Just entered my focus: {content}")
        for nid in prev_set - current_wm:
            node = nodes.get(nid)
            if node:
                content = getattr(node, "content", None) or getattr(node, "id", nid)
                shifts.append(f"- Faded from focus: {content}")

    if previous_emotions is not None and limbic is not None:
        emotions = getattr(limbic, "emotions", {}) or {}
        for emo, current in emotions.items():
            prev = previous_emotions.get(emo, 0.0)
            delta = current - prev
            if abs(delta) > 0.15:
                direction = "rose" if delta > 0 else "eased"
                shifts.append(
                    f"- {emo.capitalize()} {direction} "
                    f"(was {_felt_intensity(prev)}, now {_felt_intensity(current)})"
                )

    return shifts


def _build_emotions(limbic: Any, all_nodes: List[Any]) -> str:
    """Connect emotions to the nodes they relate to."""
    emotions = getattr(limbic, "emotions", {}) or {}
    lines: List[str] = []

    for emo_name, intensity in emotions.items():
        if intensity < 0.25:
            continue
        forms = _EMOTION_FORMS.get(emo_name)
        if not forms:
            continue

        level = _felt_intensity(intensity)
        template, affinity_field = forms[
            int(hashlib.md5(emo_name.encode()).hexdigest(), 16) % len(forms)
        ]

        # Find the most relevant node for this emotion
        best_node = None
        best_score = 0.0
        for node in all_nodes[:30]:
            score = (getattr(node, affinity_field, 0.0) or 0.0) * (getattr(node, "energy", 0.0) or 0.0)
            if score > best_score:
                best_score = score
                best_node = node

        if best_node and best_score > 0.01:
            content = getattr(best_node, "content", None) or getattr(best_node, "id", "?")
            lines.append(template.format(level=level, content=content))

    return "\n".join(lines) if lines else ""


def _build_focus(
    nodes: Dict[str, Any],
    links: List[Any],
    wm_node_ids: List[str],
    wm_id_set: set,
    budget: int,
) -> str:
    """Narrate WM nodes with their relationships using serialize_link()."""
    focus_nodes = [nodes[nid] for nid in wm_node_ids if nid in nodes]
    if not focus_nodes:
        return ""

    focus_nodes.sort(key=lambda n: getattr(n, "energy", 0.0) or 0.0, reverse=True)

    # Build outgoing link index
    outgoing: Dict[str, List[Any]] = {}
    for link in links:
        src = getattr(link, "source_id", None)
        if src in wm_id_set:
            outgoing.setdefault(src, []).append(link)

    lines = ["**What's on my mind:**"]
    used = 0

    for node in focus_nodes:
        nid = getattr(node, "id", "?")
        ntype = _get_node_type(node)
        content = getattr(node, "content", None) or nid
        energy = getattr(node, "energy", 0.0) or 0.0

        intro = _pick(_NODE_INTROS.get(ntype, ["Something"]), nid)
        feel = _energy_feel(energy)

        line = f"{intro}: {content}"
        if feel:
            line += f" — {feel}."

        # Add relationships via serialize_link
        node_links = outgoing.get(nid, [])
        for link in node_links[:2]:
            tgt_id = getattr(link, "target_id", None)
            tgt_node = nodes.get(tgt_id) if tgt_id else None
            link_phrase = serialize_link(link, source_node=node, target_node=tgt_node)
            line += f"\n  {link_phrase}"

        if used + len(line) > budget:
            break
        lines.append(line)
        used += len(line) + 1

    if len(lines) <= 1:
        return ""
    return "\n\n".join(lines[:1] + ["\n".join(lines[1:])])


def _build_peripheral(nodes: List[Any], budget: int) -> str:
    """Narrate peripheral awareness nodes."""
    lines = ["**At the edge of my awareness:**"]
    used = 0
    for node in nodes:
        ntype = _get_node_type(node)
        content = getattr(node, "content", None) or getattr(node, "id", "?")
        intro = _pick(_NODE_INTROS.get(ntype, ["Something"]), getattr(node, "id", ""))
        line = f"- {intro}: {content}"
        if used + len(line) > budget:
            break
        lines.append(line)
        used += len(line) + 1

    return "\n".join(lines) if len(lines) > 1 else ""


def _build_drives(limbic: Any) -> str:
    """Narrate inner drives as felt experience."""
    drives = getattr(limbic, "drives", {}) or {}
    active: List[str] = []

    for drive_name, drive in drives.items():
        intensity = getattr(drive, "intensity", 0.0) if hasattr(drive, "intensity") else drive
        if intensity > 0.25:
            felt = _DRIVE_FELT.get(drive_name, drive_name)
            level = _felt_intensity(intensity)
            active.append(f"- {felt} ({level})")

    if not active:
        return ""
    return "**What I feel inside:**\n" + "\n".join(active)
