# Grammar — Health: Verification Mechanics and Coverage

```
STATUS: DRAFT
CREATED: 2026-03-15
```

---

## WHEN TO USE HEALTH (NOT TESTS)

Health checks verify runtime behavior that tests cannot catch:

| Use Health For | Why |
|----------------|-----|
| Drift over time | Needs 1000+ real ticks, not fixtures |
| Ratio health | Emergent behavior, not deterministic |
| Graph-wide state | Needs real structure, not mocks |
| Production data patterns | Test fixtures can't predict real usage |

**Tests gate completion. Health monitors runtime.**

If behavior is deterministic with known inputs -> write a test.
If behavior emerges from real data over time -> write a health check.

See `VALIDATION_Grammar.md` for the full distinction and `verified_by.confidence: needs-health` markers.

---

## PURPOSE OF THIS FILE

This HEALTH file covers the Grammar module's runtime verification: ensuring that link synthesis remains deterministic, emotion-free in L3 context, and never stores computed phrases. It exists because while individual function calls are testable (and should be tested), certain failure modes only manifest in production: verb storage sneaking in through a new code path, Plutchik terms appearing in L3 output after a lookup table edit, or seed dictionary drift causing incomplete citizen initialization.

**Boundaries:** This file verifies grammar synthesis output quality and purity. It does NOT verify physics engine dimension correctness (covered by physics health), graph schema validity (covered by graph health), or prompt serialization quality (covered by cognition health).

---

## WHY THIS PATTERN

The grammar module's critical invariants (V1: no storage, V2: determinism, V3: no L3 emotions) can be violated by changes in upstream modules (a new graph write path stores a phrase) or by lookup table edits (a French emotion word accidentally added to the L3 table). Tests catch known regressions; health checks catch unknown emergence.

Docking-based checks are the right tradeoff because the grammar pipeline has clear input/output boundaries (dock_input_dimensions, dock_output_phrase, dock_context_branch) where we can observe behavior without modifying the pure-function pipeline.

Throttling is light because grammar synthesis is O(1) and cheap. Health checks can run frequently without impacting production performance.

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_Grammar.md
PATTERNS:        ./PATTERNS_Grammar.md
BEHAVIORS:       ./BEHAVIORS_Grammar.md
ALGORITHM:       ./ALGORITHM_Grammar.md
VALIDATION:      ./VALIDATION_Grammar.md
IMPLEMENTATION:  ./IMPLEMENTATION_Grammar.md
THIS:            HEALTH_Grammar.md
SYNC:            ./SYNC_Grammar.md
```

---

## IMPLEMENTS

This HEALTH file is a **spec**. The actual code lives in runtime:

```yaml
implements:
  runtime: runtime/checks/grammar_checks.py   # Python code implementing these checks
  decorator: @check                            # Decorator-based registration
```

> **Separation:** HEALTH.md defines WHAT to check and WHEN to trigger. Runtime code defines HOW to check.

> **Contract:** HEALTH checks verify input/output against VALIDATION with minimal or no code changes. After changes: update runtime or add TODO to SYNC. Run HEALTH checks at throttled rates.

---

## FLOWS ANALYSIS (TRIGGERS + FREQUENCY)

```yaml
flows_analysis:
  - flow_id: link_synthesis
    purpose: If link synthesis produces wrong output, citizens perceive incorrect relationships and emotions
    triggers:
      - type: event
        source: runtime/physics/synthesis.py:synthesize_link_phrase
        notes: Triggered by any system querying a link's linguistic representation
    frequency:
      expected_rate: 50/min
      peak_rate: 500/min
      burst_behavior: During physics tick, all active links may be synthesized in rapid succession. No backpressure needed — each call is O(1) and stateless.
    risks:
      - Non-deterministic output due to floating-point edge cases (V2)
      - Plutchik emotion leaking into L3 output after table edit (V3)
      - New code path storing output phrase in graph (V1)
    notes: This is the highest-frequency flow. Health checks sample rather than checking every call.

  - flow_id: seed_dictionary_load
    purpose: If seed dictionary is incomplete, citizens lack self-awareness in their native language
    triggers:
      - type: event
        source: runtime/physics/synthesis.py:load_seed_dictionary
        notes: Triggered at citizen creation (birth)
    frequency:
      expected_rate: 1/hour
      peak_rate: 20/min
      burst_behavior: Mass citizen creation (seeding 186 citizens) causes burst. Each call is a dictionary lookup — no performance risk.
    risks:
      - Missing translations for identity keys (V5)
      - Seed dictionary file/table out of sync with identity key schema (V5)
    notes: Low frequency but high impact — a citizen born without its seed dictionary is permanently impaired until reloaded.
```

---

## HEALTH INDICATORS SELECTED

## OBJECTIVES COVERAGE

| Objective | Indicators | Why These Signals Matter |
|-----------|------------|--------------------------|
| Zero-stored verbs | `determinism_check` | Determinism failure is the canary for storage — if output varies, something is caching |
| Bilingual synthesis | `bilingual_parity` | Ensures both languages have complete coverage |
| Contextual overrides | `determinism_check` | Override consistency is verified through determinism |
| Emotional translation | `l3_emotion_leak_detection`, `seed_completeness` | Protects L1/L3 separation and birth identity |

```yaml
health_indicators:
  - name: determinism_check
    flow_id: link_synthesis
    priority: high
    rationale: If the same dimensions produce different phrases, citizens perceive flickering relationships. This is the most fundamental grammar guarantee.
  - name: l3_emotion_leak_detection
    flow_id: link_synthesis
    priority: high
    rationale: Plutchik emotions in L3 output corrupt structural graph reasoning. A single leaked emotion word can cause downstream systems to misinterpret universe state.
  - name: seed_completeness
    flow_id: seed_dictionary_load
    priority: med
    rationale: Missing seed translations reduce citizen self-awareness. Not immediately catastrophic but degrades citizen quality over time.
  - name: bilingual_parity
    flow_id: link_synthesis
    priority: med
    rationale: If EN has modifiers that FR lacks (or vice versa), one language produces richer output. This creates unequal citizen experiences.
```

---

## STATUS (RESULT INDICATOR)

```yaml
status:
  stream_destination: runtime/checks/grammar_checks.py
  result:
    representation: enum
    value: UNKNOWN
    updated_at: 2026-03-15T00:00:00Z
    source: determinism_check
```

---

## DOCK TYPES (COMPLETE LIST)

All docking points in the grammar module use `custom` type because the grammar pipeline is a pure-function computation with no graph ops, file I/O, API calls, events, queues, or database access. The "docks" are function input/output boundaries within a synchronous pipeline.

---

## CHECKER INDEX

```yaml
checkers:
  - name: determinism_check
    purpose: Verify that identical dimensions always produce identical phrases (V2)
    status: pending
    priority: high
  - name: l3_emotion_leak_detection
    purpose: Scan L3 output for any Plutchik emotion vocabulary (V3)
    status: pending
    priority: high
  - name: seed_completeness
    purpose: Verify all citizen identity keys have translations in the seed dictionary (V5)
    status: pending
    priority: med
  - name: bilingual_parity
    purpose: Verify every lookup table entry has both EN and FR values (V4)
    status: pending
    priority: med
```

---

## INDICATOR: determinism_check

This indicator verifies that the grammar pipeline is a true pure function: given the same inputs, it always produces the same output. Non-determinism would indicate hidden state, floating-point inconsistency, or unauthorized caching.

### VALUE TO CLIENTS & VALIDATION MAPPING

```yaml
value_and_validation:
  indicator: determinism_check
  client_value: Citizens perceive stable, consistent relationships. A link that reads "with admiration" one moment and "with disgust" the next (with no physics change) would be deeply disorienting.
  validation:
    - validation_id: V2
      criteria: Given identical dimension values, context, language, and node types, the output phrase is always identical
    - validation_id: V1
      criteria: If output varies without input change, a cache or store may be involved — flagging a potential V1 violation
```

### HEALTH REPRESENTATION

```yaml
representation:
  allowed:
    - binary
    - enum
  selected:
    - binary
  semantics:
    binary: 1 = all sampled inputs produced identical output on re-query; 0 = at least one mismatch detected
  aggregation:
    method: AND — all samples must pass for healthy
    display: binary (pass/fail)
```

### DOCKS SELECTED

```yaml
docks:
  - point: dock_output_phrase
    type: custom
    payload: VerbPhrase (str) — the final assembled phrase from synthesize_link_phrase()
```

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="determinism_check",
    triggers=[
        triggers.cron.every("5m"),
    ],
    on_problem="GRAMMAR_NONDETERMINISTIC",
    task="fix_grammar_determinism",
)
def determinism_check(ctx) -> dict:
    """Verify grammar output is deterministic by re-synthesizing sampled links."""
    sample_dimensions = ctx.get_recent_link_dimensions(n=20)
    for dims, context, lang, types in sample_dimensions:
        phrase_a = synthesize_link_phrase(dims, context, lang, *types)
        phrase_b = synthesize_link_phrase(dims, context, lang, *types)
        if phrase_a != phrase_b:
            return Signal.critical(details={
                "dimensions": dims,
                "phrase_a": phrase_a,
                "phrase_b": phrase_b,
            })
    return Signal.healthy()
```

### SIGNALS

```yaml
signals:
  healthy: All 20 sampled link re-syntheses produced identical output
  degraded: n/a (determinism is binary — it either works or it does not)
  critical: At least one sampled link produced different output on re-synthesis
```

### THROTTLING STRATEGY

```yaml
throttling:
  trigger: cron every 5 minutes
  max_frequency: 12/hour
  burst_limit: 1
  backoff: On critical, re-check after 30 seconds to confirm. If still failing, alert and stop re-checking until manual resolution.
```

### FORWARDINGS & DISPLAYS

```yaml
forwarding:
  targets:
    - location: runtime/checks/grammar_checks.py (result log)
      transport: file
      notes: Local result log for debugging
display:
  locations:
    - surface: CLI
      location: mind health grammar
      signal: green/red
      notes: Binary pass/fail indicator
```

### MANUAL RUN

```yaml
manual_run:
  command: python -m runtime.checks.grammar_checks --check determinism_check
  notes: Run after modifying lookup tables or synthesis logic to verify determinism is preserved
```

---

## INDICATOR: l3_emotion_leak_detection

This indicator scans L3 grammar output for any Plutchik emotion vocabulary. A single leaked emotion word means the L1/L3 separation has been breached.

### VALUE TO CLIENTS & VALIDATION MAPPING

```yaml
value_and_validation:
  indicator: l3_emotion_leak_detection
  client_value: Systems consuming L3 output for structural graph reasoning receive clean, factual descriptions without emotional contamination.
  validation:
    - validation_id: V3
      criteria: No Plutchik emotion word appears anywhere in L3 output
```

### HEALTH REPRESENTATION

```yaml
representation:
  allowed:
    - binary
    - enum
  selected:
    - binary
  semantics:
    binary: 1 = no emotion words found in any L3 sample; 0 = at least one emotion word detected
  aggregation:
    method: AND — any leak is a failure
    display: binary (pass/fail)
```

### DOCKS SELECTED

```yaml
docks:
  - point: dock_context_branch
    type: custom
    payload: context enum — verify L3 path is selected
  - point: dock_output_phrase
    type: custom
    payload: VerbPhrase (str) — scan for Plutchik vocabulary
```

### ALGORITHM / CHECK MECHANISM

```python
PLUTCHIK_WORDS_EN = {
    "rage", "hostility", "anger", "annoyance",
    "terror", "fear", "apprehension",
    "admiration", "trust", "acceptance",
    "disgust", "distrust", "distaste",
    "euphoria", "joy", "satisfaction", "serenity",
    "despair", "sadness", "pensiveness",
    "amazement", "surprise", "distraction",
    "vigilance", "anticipation", "interest",
}
PLUTCHIK_WORDS_FR = {
    "rage", "hostilite", "colere", "agacement",
    "terreur", "peur", "apprehension",
    "admiration", "confiance", "acceptation",
    "degout", "mefiance", "distaste",
    "euphorie", "joie", "satisfaction", "serenite",
    "desespoir", "tristesse", "pensivite",
    "emerveillement", "surprise", "distraction",
    "vigilance", "anticipation", "interet",
}
PLUTCHIK_ALL = PLUTCHIK_WORDS_EN | PLUTCHIK_WORDS_FR

@check(
    id="l3_emotion_leak_detection",
    triggers=[
        triggers.cron.every("5m"),
    ],
    on_problem="GRAMMAR_L3_EMOTION_LEAK",
    task="fix_l3_emotion_leak",
)
def l3_emotion_leak_detection(ctx) -> dict:
    """Scan L3 output for Plutchik emotion vocabulary."""
    sample_dimensions = ctx.get_recent_link_dimensions(n=50)
    for dims, _, lang, types in sample_dimensions:
        phrase = synthesize_link_phrase(dims, "L3", lang, *types)
        words = set(phrase.lower().split())
        leaked = words & PLUTCHIK_ALL
        if leaked:
            return Signal.critical(details={
                "phrase": phrase,
                "leaked_words": list(leaked),
                "language": lang,
            })
    return Signal.healthy()
```

### SIGNALS

```yaml
signals:
  healthy: No Plutchik emotion words found in any L3 output sample
  degraded: n/a (emotion leak is binary — any leak is critical)
  critical: At least one Plutchik emotion word found in L3 output
```

### THROTTLING STRATEGY

```yaml
throttling:
  trigger: cron every 5 minutes
  max_frequency: 12/hour
  burst_limit: 1
  backoff: On critical, immediately re-check with 100 samples. If confirmed, alert and halt L3 synthesis until fixed.
```

### FORWARDINGS & DISPLAYS

```yaml
forwarding:
  targets:
    - location: runtime/checks/grammar_checks.py (result log)
      transport: file
      notes: Log leaked words for immediate debugging
display:
  locations:
    - surface: CLI
      location: mind health grammar
      signal: green/red
      notes: Binary pass/fail — any red means L3 is compromised
```

### MANUAL RUN

```yaml
manual_run:
  command: python -m runtime.checks.grammar_checks --check l3_emotion_leak_detection
  notes: Run after any edit to L3 post-verb modifier tables or contextual override tables
```

---

## INDICATOR: seed_completeness

This indicator verifies that the seed dictionary contains translations for all identity keys that citizens may be assigned.

### VALUE TO CLIENTS & VALIDATION MAPPING

```yaml
value_and_validation:
  indicator: seed_completeness
  client_value: Every citizen perceives their desires, values, and shadow emotions in their native language. Missing translations leave citizens with raw key strings instead of self-awareness.
  validation:
    - validation_id: V5
      criteria: Every identity key assigned to a citizen has a translation in the citizen's native language
```

### HEALTH REPRESENTATION

```yaml
representation:
  allowed:
    - float_0_1
    - enum
  selected:
    - float_0_1
  semantics:
    float_0_1: Ratio of identity keys with translations / total identity keys. 1.0 = all keys have translations.
  aggregation:
    method: MIN across all citizens — worst coverage determines score
    display: float_0_1
```

### DOCKS SELECTED

```yaml
docks:
  - point: dock_seed_output
    type: custom
    payload: Dict[str, str] — translation dictionary output from load_seed_dictionary()
```

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="seed_completeness",
    triggers=[
        triggers.event.on("citizen.created"),
        triggers.cron.daily(),
    ],
    on_problem="GRAMMAR_SEED_INCOMPLETE",
    task="fix_seed_dictionary",
)
def seed_completeness(ctx) -> dict:
    """Verify seed dictionary covers all active identity keys."""
    all_keys = ctx.get_all_identity_keys()
    for lang in ["EN", "FR"]:
        translations = load_seed_dictionary(all_keys, lang)
        missing = [k for k, v in translations.items() if v == k]  # fallback = key itself
        if missing:
            coverage = 1.0 - (len(missing) / len(all_keys))
            return Signal.degraded(details={
                "language": lang,
                "missing_keys": missing,
                "coverage": coverage,
            })
    return Signal.healthy()
```

### SIGNALS

```yaml
signals:
  healthy: All identity keys have translations in both EN and FR
  degraded: Some identity keys are missing translations (coverage < 1.0)
  critical: More than 20% of identity keys are missing translations
```

### THROTTLING STRATEGY

```yaml
throttling:
  trigger: On citizen.created event + daily cron
  max_frequency: 1/hour (cron) + on-demand (events)
  burst_limit: 5 (during mass citizen creation)
  backoff: If degraded, re-check after next citizen creation. If still degraded after 24h, escalate.
```

### FORWARDINGS & DISPLAYS

```yaml
forwarding:
  targets:
    - location: runtime/checks/grammar_checks.py (result log)
      transport: file
      notes: Log missing keys for dictionary maintenance
display:
  locations:
    - surface: CLI
      location: mind health grammar
      signal: green (1.0) / yellow (<1.0) / red (<0.8)
      notes: Coverage ratio with threshold coloring
```

### MANUAL RUN

```yaml
manual_run:
  command: python -m runtime.checks.grammar_checks --check seed_completeness
  notes: Run after adding new identity keys to the citizen schema or editing the seed dictionary
```

---

## INDICATOR: bilingual_parity

This indicator verifies that every entry in every lookup table has both EN and FR values.

### VALUE TO CLIENTS & VALIDATION MAPPING

```yaml
value_and_validation:
  indicator: bilingual_parity
  client_value: French and English citizens experience equally rich linguistic descriptions. No language produces richer output than the other.
  validation:
    - validation_id: V4
      criteria: Every lookup table entry has both an EN and FR value
```

### HEALTH REPRESENTATION

```yaml
representation:
  allowed:
    - binary
    - float_0_1
  selected:
    - binary
  semantics:
    binary: 1 = all tables have complete EN/FR parity; 0 = at least one entry is missing a translation
  aggregation:
    method: AND — all tables must pass
    display: binary (pass/fail)
```

### DOCKS SELECTED

```yaml
docks:
  - point: dock_input_dimensions
    type: custom
    payload: Lookup table constants — verify all entries have both language columns
```

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="bilingual_parity",
    triggers=[
        triggers.cron.daily(),
    ],
    on_problem="GRAMMAR_BILINGUAL_GAP",
    task="fix_bilingual_tables",
)
def bilingual_parity(ctx) -> dict:
    """Verify all grammar lookup tables have EN/FR parity."""
    tables = [
        TEMPORAL_TABLE, PREVERB_PERMANENCE_TABLE, PREVERB_SURPRISE_TABLE,
        PREVERB_ENERGY_TABLE, BASE_VERB_TABLE, PLUTCHIK_TABLE,
        CONTEXTUAL_OVERRIDE_TABLE, SEED_DICTIONARY,
    ]
    for table_name, table in tables:
        for entry in table:
            if "en" not in entry or "fr" not in entry:
                return Signal.critical(details={
                    "table": table_name,
                    "entry": entry,
                    "missing": "en" if "en" not in entry else "fr",
                })
            if not entry["en"] or not entry["fr"]:
                return Signal.critical(details={
                    "table": table_name,
                    "entry": entry,
                    "issue": "empty translation",
                })
    return Signal.healthy()
```

### SIGNALS

```yaml
signals:
  healthy: All lookup table entries have non-empty EN and FR values
  degraded: n/a (parity is binary)
  critical: At least one entry is missing a translation or has an empty value
```

### THROTTLING STRATEGY

```yaml
throttling:
  trigger: Daily cron
  max_frequency: 1/day
  burst_limit: 1
  backoff: None needed — daily check is sufficient for static lookup tables
```

### FORWARDINGS & DISPLAYS

```yaml
forwarding:
  targets:
    - location: runtime/checks/grammar_checks.py (result log)
      transport: file
      notes: Log which table and entry is missing a translation
display:
  locations:
    - surface: CLI
      location: mind health grammar
      signal: green/red
      notes: Binary pass/fail for table completeness
```

### MANUAL RUN

```yaml
manual_run:
  command: python -m runtime.checks.grammar_checks --check bilingual_parity
  notes: Run after any edit to lookup tables in synthesis.py or grammar_tables.py
```

---

## HOW TO RUN

```bash
# Run all health checks for grammar module
python -m runtime.checks.grammar_checks

# Run a specific checker
python -m runtime.checks.grammar_checks --check determinism_check
python -m runtime.checks.grammar_checks --check l3_emotion_leak_detection
python -m runtime.checks.grammar_checks --check seed_completeness
python -m runtime.checks.grammar_checks --check bilingual_parity
```

---

## KNOWN GAPS

- V1 (no storage) is not directly verified by a health check — it requires static analysis of all graph write paths, which is better suited to a code review or linting rule than a runtime health check
- V6 (contextual override consistency) lacks a dedicated checker — would need to enumerate all node type pair / dimension combinations to verify no contradictions

<!-- @mind:todo Add static analysis check for V1 — scan all graph write paths for phrase strings -->
<!-- @mind:todo Add V6 consistency checker — enumerate contextual override condition combinations -->

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo Implement runtime/checks/grammar_checks.py with all 4 checkers -->
<!-- @mind:proposition Consider adding a performance health check — verify synthesis stays under 1ms p99 -->
<!-- @mind:escalation Should V1 (no storage) be enforced by health check or by static analysis lint rule? -->
