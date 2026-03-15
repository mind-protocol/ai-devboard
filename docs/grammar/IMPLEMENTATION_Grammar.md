# Grammar — Implementation: Code Architecture and Structure

```
STATUS: DRAFT
CREATED: 2026-03-15
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Grammar.md
BEHAVIORS:       ./BEHAVIORS_Grammar.md
PATTERNS:        ./PATTERNS_Grammar.md
MECHANISMS:      n/a
ALGORITHM:       ./ALGORITHM_Grammar.md
VALIDATION:      ./VALIDATION_Grammar.md
THIS:            IMPLEMENTATION_Grammar.md
HEALTH:          ./HEALTH_Grammar.md
SYNC:            ./SYNC_Grammar.md

IMPL:            runtime/physics/synthesis.py
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

---

## CODE STRUCTURE

```
runtime/
├── physics/
│   ├── synthesis.py              # Primary synthesis engine (653 lines)
│   └── (lookup tables embedded)  # EN/FR tables inline in synthesis.py
├── cognition/
│   └── wm_prompt_serializer.py   # Consumes grammar output for citizen prompts
docs/
├── schema/
│   ├── GRAMMAR_Link_Synthesis.md  # L1 grammar specification
│   └── GRAMMAR_L3_Link_Synthesis.md  # L3 grammar specification
```

### File Responsibilities

| File | Purpose | Key Functions/Classes | Lines | Status |
|------|---------|----------------------|-------|--------|
| `runtime/physics/synthesis.py` | All grammar computation: dimension extraction, modifier selection, verb lookup, phrase assembly | `synthesize_link_phrase()`, `select_plutchik_modifier()`, `select_structural_modifier()`, `lookup_contextual_verb()`, `load_seed_dictionary()` | ~653 | WATCH |
| `docs/schema/GRAMMAR_Link_Synthesis.md` | L1 grammar specification: Plutchik mappings, temporal modifiers, pre-verb tables | (spec, not code) | — | OK |
| `docs/schema/GRAMMAR_L3_Link_Synthesis.md` | L3 grammar specification: structural modifiers, contextual overrides | (spec, not code) | — | OK |
| `runtime/cognition/wm_prompt_serializer.py` | Consumes grammar output to build citizen working memory prompts | `serialize_link()`, `build_context()` | — | OK |

**Size Thresholds:**
- **OK** (<400 lines): Healthy size, easy to understand
- **WATCH** (400-700 lines): Getting large, consider extraction opportunities
- **SPLIT** (>700 lines): Too large, must split before adding more code

> When a file reaches WATCH status, identify extraction candidates in the EXTRACTION CANDIDATES section below.
> When a file reaches SPLIT status, splitting becomes the next task before any feature work.

---

## DESIGN PATTERNS

### Architecture Pattern

**Pattern:** Pipeline (Pure Functional)

**Why this pattern:** Grammar synthesis is a linear transformation from float dimensions to string output. Each stage (temporal, pre-verb, base verb, post-verb, override) depends on the previous stage's decisions but not its output text. A pipeline of pure functions guarantees determinism, testability, and zero side effects. No shared mutable state exists.

### Code Patterns in Use

| Pattern | Applied To | Purpose |
|---------|------------|---------|
| Lookup Table | All modifier selection functions | Fixed-size tables replace branching logic; easy to audit, extend, and test |
| Strategy | L1 vs L3 post-verb selection | Context parameter selects which modifier strategy to apply |
| Pure Function | `synthesize_link_phrase()` | No side effects, no state mutation, deterministic output |
| Registry | Seed dictionary | Key-value registry of identity translations, loaded once at citizen birth |

### Anti-Patterns to Avoid

- **Caching verb phrases**: Tempting for performance, but violates V1 (zero storage). Recomputation is O(1) and under 1ms — caching saves nothing and risks staleness.
- **God Object**: `synthesis.py` at 653 lines is approaching WATCH. Do not add more responsibilities — extraction candidates identified below.
- **Dynamic table modification**: Lookup tables must be immutable constants. No runtime modification of the verb/modifier mappings.
- **Emotional bleeding**: Do not share modifier selection code between L1 and L3. Keep them as separate functions even if they look similar — their vocabularies must never cross-contaminate.

### Boundaries

| Boundary | Inside | Outside | Interface |
|----------|--------|---------|-----------|
| Grammar module | All dimension-to-language computation | Graph storage, physics tick, prompt assembly | `synthesize_link_phrase(dimensions, context, language, source_type, target_type) -> str` |
| L1/L3 separation | Modifier selection logic per context | The decision of which context to use | `context` parameter (L1 or L3) |
| Seed dictionary | Identity key translations | Citizen creation, identity assignment | `load_seed_dictionary(keys, language) -> Dict[str, str]` |

---

## SCHEMA

### LinkDimensions

```yaml
LinkDimensions:
  required:
    - hierarchy: float          # -1.0 to +1.0
    - polarity: [float, float]  # [activity, bidirectionality]
    - permanence: float         # 0.0 to 1.0
    - energy: float             # 0.0 to 10.0
    - surprise: float           # -1.0 to +1.0
    - recency: float            # seconds since last interaction
    - link_age: float           # seconds since link creation
    - moment_status: enum       # BRIEF | ONGOING | PENDING | WELL_TRODDEN
  optional:
    - trust: float              # 0.0 to 1.0 (used in L3)
    - friction: float           # 0.0 to 1.0 (used in both L1 and L3)
    - affinity: float           # -1.0 to +1.0 (used in both)
    - aversion: float           # 0.0 to 1.0 (used in L1 Plutchik)
    - valence: float            # -1.0 to +1.0 (used in both)
  constraints:
    - All float values clamped to their stated ranges before processing
    - polarity is always a 2-element array
    - moment_status must be one of the 4 enum values
```

### SeedDictionaryEntry

```yaml
SeedDictionaryEntry:
  required:
    - key: str                  # e.g., "desire:grow_personally"
    - en: str                   # English translation
    - fr: str                   # French translation
  relationships:
    - loaded_by: Citizen (at birth)
```

---

## ENTRY POINTS

| Entry Point | File:Line | Triggered By |
|-------------|-----------|--------------|
| `synthesize_link_phrase()` | `runtime/physics/synthesis.py:main` | Any system querying a link's linguistic representation |
| `load_seed_dictionary()` | `runtime/physics/synthesis.py:seed` | Citizen initialization at birth |
| `serialize_link()` | `runtime/cognition/wm_prompt_serializer.py:serialize` | Working memory assembly before LLM call |

---

## DATA FLOW AND DOCKING (FLOW-BY-FLOW)

### Link Synthesis Flow: Dimension-to-Phrase Computation

This flow covers the core transformation: 13 float dimensions on a link become a natural-language verb phrase. This is the most-called flow in the grammar module and the one that must remain pure, fast, and deterministic.

```yaml
flow:
  name: link_synthesis
  purpose: Transform 13 physical dimensions into a natural-language verb phrase
  scope: Input is LinkDimensions + context + language; output is a string phrase
  steps:
    - id: step_extract
      description: Extract and clamp all 13 dimensions from the link
      file: runtime/physics/synthesis.py
      function: synthesize_link_phrase
      input: LinkDimensions (raw)
      output: LinkDimensions (clamped)
      trigger: External query for link language
      side_effects: none
    - id: step_temporal
      description: Select temporal modifier from recency, link_age, moment_status
      file: runtime/physics/synthesis.py
      function: select_temporal_modifier
      input: recency, link_age, moment_status, language
      output: temporal_modifier (str)
      trigger: Pipeline stage 2
      side_effects: none
    - id: step_preverb
      description: Assemble pre-verb modifiers from permanence, energy, surprise
      file: runtime/physics/synthesis.py
      function: select_preverb_modifiers
      input: permanence, energy, surprise, language
      output: pre_verb_modifiers ([str])
      trigger: Pipeline stage 3
      side_effects: none
    - id: step_baseverb
      description: Look up base verb from hierarchy x polarity matrix
      file: runtime/physics/synthesis.py
      function: select_base_verb
      input: hierarchy, polarity, language
      output: base_verb (str)
      trigger: Pipeline stage 4
      side_effects: none
    - id: step_postverb
      description: Select post-verb modifiers (Plutchik for L1, structural for L3)
      file: runtime/physics/synthesis.py
      function: select_plutchik_modifier / select_structural_modifier
      input: energy, valence, friction, trust, affinity, aversion, surprise, context, language
      output: post_verb_modifiers ([str])
      trigger: Pipeline stage 5
      side_effects: none
    - id: step_override
      description: Apply contextual semantic override if node types are known
      file: runtime/physics/synthesis.py
      function: lookup_contextual_verb
      input: source_type, target_type, dimensions, language
      output: override_verb (str or None)
      trigger: Pipeline stage 6
      side_effects: none
    - id: step_assemble
      description: Concatenate all parts into final phrase string
      file: runtime/physics/synthesis.py
      function: assemble_phrase
      input: temporal, pre_verbs, base_verb (or override), post_verbs
      output: VerbPhrase (str)
      trigger: Pipeline final stage
      side_effects: none
  docking_points:
    guidance:
      include_when: Input/output boundaries, context branching points, override decision
      omit_when: Internal string concatenation, trivial clamp operations
      selection_notes: Focus on the L1/L3 branch point and the override decision — these are where incorrect behavior would violate V3 and V6
    available:
      - id: dock_input_dimensions
        type: custom
        direction: input
        file: runtime/physics/synthesis.py
        function: synthesize_link_phrase
        trigger: External query
        payload: LinkDimensions + context + language + node_types
        async_hook: not_applicable
        needs: none
        notes: Entry point — all 13 dimensions arrive here
      - id: dock_context_branch
        type: custom
        direction: input
        file: runtime/physics/synthesis.py
        function: select_plutchik_modifier / select_structural_modifier
        trigger: Step 5 context check
        payload: context enum (L1 or L3)
        async_hook: not_applicable
        needs: none
        notes: Critical branch — wrong path here violates V3
      - id: dock_override_decision
        type: custom
        direction: output
        file: runtime/physics/synthesis.py
        function: lookup_contextual_verb
        trigger: Step 6 type check
        payload: override_verb (str or None)
        async_hook: not_applicable
        needs: none
        notes: Override replaces base verb — must be deterministic (V6)
      - id: dock_output_phrase
        type: custom
        direction: output
        file: runtime/physics/synthesis.py
        function: assemble_phrase
        trigger: Pipeline completion
        payload: VerbPhrase (str)
        async_hook: not_applicable
        needs: none
        notes: Final output — must never be empty (A4), must never be stored (V1)
    health_recommended:
      - dock_id: dock_context_branch
        reason: L1/L3 branch is where Plutchik emotion leakage into L3 would occur (V3)
      - dock_id: dock_output_phrase
        reason: Final output is where determinism (V2) and non-storage (V1) are verified
```

### Seed Dictionary Flow: Identity Translation at Birth

This flow covers citizen initialization: loading the seed dictionary for a new citizen's identity keys in their native language.

```yaml
flow:
  name: seed_dictionary_load
  purpose: Load native-language translations for citizen identity keys at birth
  scope: Input is identity keys + language; output is translation dictionary
  steps:
    - id: step_load_keys
      description: Receive identity keys from citizen creation
      file: runtime/physics/synthesis.py
      function: load_seed_dictionary
      input: identity_keys (List[str]), language (EN/FR)
      output: translation_dict (Dict[str, str])
      trigger: Citizen initialization
      side_effects: none
    - id: step_lookup
      description: Look up each key in the seed dictionary for the target language
      file: runtime/physics/synthesis.py
      function: load_seed_dictionary (internal loop)
      input: key, language
      output: translation or fallback
      trigger: Per-key iteration
      side_effects: Warning log if key not found
  docking_points:
    guidance:
      include_when: Missing key detection, complete dictionary validation
      omit_when: Individual key lookups (too granular)
      selection_notes: The missing-key warning is important for V5 enforcement
    available:
      - id: dock_seed_input
        type: custom
        direction: input
        file: runtime/physics/synthesis.py
        function: load_seed_dictionary
        trigger: Citizen birth
        payload: identity_keys + language
        async_hook: not_applicable
        needs: none
        notes: Entry point for seed dictionary loading
      - id: dock_seed_output
        type: custom
        direction: output
        file: runtime/physics/synthesis.py
        function: load_seed_dictionary
        trigger: Completion
        payload: Dict[str, str] translations
        async_hook: not_applicable
        needs: none
        notes: Must contain all keys — missing keys indicate V5 violation
    health_recommended:
      - dock_id: dock_seed_output
        reason: Completeness check ensures V5 (all identity keys have translations)
```

---

## LOGIC CHAINS

### LC1: Link-to-Phrase Synthesis

**Purpose:** Transform a single link's physical dimensions into a human-readable verb phrase.

```
LinkDimensions (13 floats)
  -> synthesize_link_phrase()     # Entry point, clamps dimensions
    -> select_temporal_modifier()  # recency/age/status -> temporal str
    -> select_preverb_modifiers()  # permanence/energy/surprise -> [str]
    -> select_base_verb()          # hierarchy x polarity -> verb str
    -> select_postverb()           # L1: Plutchik | L3: structural -> [str]
    -> lookup_contextual_verb()    # node types -> optional override
    -> assemble_phrase()           # join all parts -> final str
      -> VerbPhrase (str)
```

**Data transformation:**
- Input: `LinkDimensions` — 13 raw float values + context + language
- After step 1: `LinkDimensions` — all values clamped to valid ranges
- After steps 2-5: `temporal: str, pre: [str], verb: str, post: [str]` — individual phrase components
- After step 6: `verb` possibly replaced by contextual override
- Output: `str` — assembled phrase like "recently, clearly influences with confidence"

### LC2: Citizen Birth Seed Loading

**Purpose:** Equip a new citizen with native-language emotional vocabulary at creation time.

```
Citizen creation event
  -> load_seed_dictionary(keys, language)    # Lookup all identity keys
    -> for each key: seed_table[key][lang]   # Direct dictionary access
      -> fallback to key string if missing   # With warning log
    -> Dict[str, str]                        # Complete translation map
```

**Data transformation:**
- Input: `List[str]` identity keys + language enum
- After lookup: `Dict[str, str]` mapping keys to native-language prose
- Output: Translation dictionary attached to citizen's cognitive state

---

## MODULE DEPENDENCIES

### Internal Dependencies

```
runtime/physics/synthesis.py
    └── imports -> (lookup tables, embedded constants)
    └── called by -> runtime/cognition/wm_prompt_serializer.py
```

### External Dependencies

| Package | Used For | Imported By |
|---------|----------|-------------|
| (none) | Grammar module has zero external dependencies | — |

> The grammar module intentionally has no external dependencies. All lookup tables are embedded constants. This ensures the module can never fail due to a missing dependency and remains a pure computation unit.

---

## STATE MANAGEMENT

### Where State Lives

| State | Location | Scope | Lifecycle |
|-------|----------|-------|-----------|
| EN/FR lookup tables | `synthesis.py` (module constants) | Module | Loaded at import, never modified |
| Seed dictionary | `synthesis.py` (module constants) | Module | Loaded at import, never modified |

### State Transitions

```
No state transitions. The grammar module is stateless.
All lookup tables are immutable constants loaded at module import.
No runtime state is created, modified, or destroyed.
```

---

## RUNTIME BEHAVIOR

### Initialization

```
1. Python imports synthesis.py
2. All lookup tables (temporal, pre-verb, base verb, post-verb, contextual,
   seed dictionary) are loaded as module-level constants
3. Module ready — no async init, no file reads, no network calls
```

### Main Loop / Request Cycle

```
1. External caller invokes synthesize_link_phrase(dimensions, context, lang, types)
2. Pipeline executes stages 1-6 (all synchronous, all pure)
3. Assembled phrase string returned to caller
4. No state changed. No writes. No side effects.
```

### Shutdown

```
1. No cleanup needed — no open connections, files, or resources
2. Module garbage collected normally
```

---

## CONCURRENCY MODEL

| Component | Model | Notes |
|-----------|-------|-------|
| `synthesize_link_phrase()` | Fully reentrant (pure function) | No shared mutable state; safe to call from any number of concurrent threads/coroutines |
| Lookup tables | Read-only constants | No locking needed; immutable after module load |
| Seed dictionary | Read-only constants | Same as lookup tables; no write path exists |

---

## CONFIGURATION

| Config | Location | Default | Description |
|--------|----------|---------|-------------|
| (none) | — | — | Grammar module has no configuration. All behavior is determined by lookup tables embedded in source code. This is intentional: configuration would introduce a drift vector between code and behavior. |

---

## BIDIRECTIONAL LINKS

### Code -> Docs

Files that reference this documentation:

| File | Line | Reference |
|------|------|-----------|
| `runtime/physics/synthesis.py` | (header) | `# DOCS: docs/grammar/IMPLEMENTATION_Grammar.md` |
| `runtime/cognition/wm_prompt_serializer.py` | (link serialization) | `# DOCS: docs/grammar/ALGORITHM_Grammar.md` |

### Docs -> Code

| Doc Section | Implemented In |
|-------------|----------------|
| ALGORITHM step 1 (dimension extraction) | `synthesis.py:synthesize_link_phrase()` |
| ALGORITHM step 2 (temporal modifiers) | `synthesis.py:select_temporal_modifier()` |
| ALGORITHM step 3 (pre-verb modifiers) | `synthesis.py:select_preverb_modifiers()` |
| ALGORITHM step 4 (base verb lookup) | `synthesis.py:select_base_verb()` |
| ALGORITHM step 5 (post-verb: Plutchik) | `synthesis.py:select_plutchik_modifier()` |
| ALGORITHM step 5 (post-verb: structural) | `synthesis.py:select_structural_modifier()` |
| ALGORITHM step 6 (contextual override) | `synthesis.py:lookup_contextual_verb()` |
| BEHAVIOR B1 (on-the-fly generation) | `synthesis.py:synthesize_link_phrase()` |
| BEHAVIOR B4 (seed dictionary) | `synthesis.py:load_seed_dictionary()` |
| VALIDATION V1 (no storage) | verified by absence of write calls in synthesis.py |
| VALIDATION V2 (determinism) | `tests/test_grammar.py:test_determinism` |
| VALIDATION V3 (no Plutchik in L3) | `tests/test_grammar.py:test_l3_no_emotions` |

---

## EXTRACTION CANDIDATES

Files approaching WATCH/SPLIT status - identify what can be extracted:

| File | Current | Target | Extract To | What to Move |
|------|---------|--------|------------|--------------|
| `runtime/physics/synthesis.py` | ~653L | <400L | `runtime/physics/grammar_tables.py` | All lookup table constants (temporal, pre-verb, base verb, post-verb EN/FR tables) — ~200 lines of pure data |
| `runtime/physics/synthesis.py` | ~653L | <400L | `runtime/physics/seed_dictionary.py` | Seed dictionary entries and `load_seed_dictionary()` — ~100 lines |
| `runtime/physics/synthesis.py` | ~653L | <400L | `runtime/physics/contextual_overrides.py` | Contextual semantic override tables and `lookup_contextual_verb()` — ~100 lines |

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Extract lookup tables from synthesis.py into grammar_tables.py (file at WATCH threshold) -->
<!-- @mind:todo Add DOCS comments to synthesis.py referencing this doc chain -->
<!-- @mind:proposition Consider extracting L1 and L3 post-verb logic into separate files for clearer boundary enforcement -->
<!-- @mind:escalation synthesis.py at 653 lines — approaching SPLIT. Prioritize extraction before adding L3 contextual overrides. -->
