# CONCEPT: AI DevBoard — A Development Place in Lumina Prime

```
STATUS: DESIGNING
CREATED: 2026-03-15
```

---

## WHAT IT IS

The AI DevBoard is not a dashboard. It is a **Place** — a Space node in Lumina Prime where code, bugs, deploys, and architecture become spatial objects that you navigate, inspect, and manipulate through voice and vision.

There is no traditional UI. No buttons panel. No sidebar with metrics. Instead:
- **Rooms** are dev interfaces (triage room, manager room, code room)
- **Objects** are graph nodes rendered as 3D/holographic elements
- **Energy** is visible — active code glows, decaying modules dim
- **Bugs** are structural damage you can see and touch
- **Deploys** are energy flows you watch propagating
- **Voice** is the primary input — you talk to your AI citizens, they respond spatially

---

## WHY IT EXISTS

Writing code requires reading code. Reading code requires context. Context requires navigation. Navigation in text editors is linear (scroll, search, jump-to-definition).

In the DevBoard, navigation is **spatial**. You walk toward the module you're curious about. You see its energy level (is it active? decaying?). You see its connections (filaments to other modules). You see its health (cracks = failing tests, glow = healthy). You ask your AI partner a question and they materialize the answer as a floating object in front of you.

The goal: **develop software without writing code, without reading code.** Direct the AI citizens through voice and spatial interaction. See the results as physical changes in the environment.

---

## ARCHITECTURE

### The Space Hierarchy

```
Space: lumina_prime                    ← the universe
  └── Space: ai_devboard              ← the organization (L2)
        ├── Space: manager             ← project overview, team status, priorities
        ├── Space: triage              ← health, bugs, failing tests, alerts
        ├── Space: code                ← code navigation, file inspection, diffs
        ├── Space: deploy              ← CI/CD, Render status, deploy logs
        ├── Space: docs                ← documentation, doc chains, SYNC
        └── Space: sandbox             ← physics playground, tick testing
```

Each room is a Space node in the graph. Entering a room shifts your WM context — the room's energy biases what enters your consciousness.

### What Lives Inside Each Room

**Manager Room** (`place://ui/manager`)
- Floating cards for each team member (Actor nodes with status)
- Narrative nodes rendered as pillars (project goals, active initiatives)
- Trust filaments between team members (colored by trust/friction)
- $MIND flow visualization (golden particle streams)

**Triage Room** (`place://ui/triage`)
- Health check results as spatial alerts (green/yellow/red beacons)
- Bug nodes as cracked or burning objects
- Failing tests as blinking warning nodes
- The "blood pressure" of the codebase — aggregate energy/friction visualized as ambient color

**Code Room** (`place://ui/code`)
- Modules as buildings (Dataset-as-Space — the CONCEPT we documented)
- Files as rooms inside buildings
- Functions as objects inside rooms
- Data flow as pipes/rivers between buildings
- Doc chain as golden threads connecting rooms
- Git blame as nameplates on objects

**Deploy Room** (`place://ui/deploy`)
- Render services as towers (height = uptime, color = status)
- Deploy pipeline as a river flowing from commit → build → deploy → live
- Logs streaming as text on walls
- Energy spike when deploy succeeds, friction spike when it fails

**Docs Room** (`place://ui/docs`)
- Doc chain modules as a library
- Each doc as a book on a shelf
- Missing docs as empty shelves (visible gaps)
- SYNC file as the central bulletin board

**Sandbox** (`place://ui/sandbox`)
- Physics constants as adjustable dials
- Tick runner as a visible clock
- Energy propagation as visible waves
- Node inspector — click any node, see its properties, edit them

### Interaction Modes

**Voice (Primary)**
```
You: "What's the status of the physics bridge?"
→ Subcall fires, resonance returns, answer materializes as floating text + node graph

You: "Deploy the latest to Render"
→ Action node fires, deploy pipeline visible in Deploy Room

You: "Show me who worked on auth middleware"
→ Subcall team broadcast, results materialize as actor cards with connection lines

You: "Run a tick"
→ Physics tick fires, energy waves propagate visibly across all rooms
```

**Vision (Desktop/VR)**
```
- Screenshot of current view → CLIP encoded → injected as visual stimulus
- POV captures stored as Moment.image_uri
- Other citizens' profile pics visible on their avatar/card
- Holographic panels float in space (markdown rendered as glass panels)
```

**Spatial (Navigate)**
```
- Walk/fly between rooms
- Pan/zoom in 2D mode (holographic dashboard)
- Orbit camera in 3D mode
- Click/touch nodes to inspect
- Drag nodes to rearrange
- Pinch/spread to zoom into subgraphs (fractal zoom)
```

### The Holographic Mode (2.5D)

For the initial version, the DevBoard can work as a **holographic overlay** — a 2D screen with 3D depth:

```
┌─────────────────────────────────────────────────┐
│  [Manager] [Triage] [Code] [Deploy] [Docs] [⚙]  │ ← room tabs
├─────────────────────────────────────────────────┤
│                                                   │
│         ╭─────╮         ╭─────╮                   │
│         │nervo│─────────│voce │                   │ ← nodes float
│         ╰──┬──╯    ┊    ╰──┬──╯                   │    with depth
│            │    trust=0.8   │                      │
│         ╭──┴──╮         ╭──┴──╮                   │
│         │auth │         │voice│                   │ ← modules as
│         │ ████│         │ ██  │                   │    cards with
│         ╰─────╯         ╰─────╯                   │    energy bars
│                                                   │
│  ⏸  ▶x1  ▶▶x2  ▶▶▶x3  ⚡tick                    │ ← tick controls
│  [MATCH (n)-[r]->(m) RETURN n,r,m          ] [▶]  │ ← Cypher bar
│  Status: 29 nodes, 41 links | Tick #47           │
└─────────────────────────────────────────────────┘
```

This is what we started building with Vite+D3. It becomes 3D later (Three.js or R3F) when we move into actual Lumina Prime spatial navigation.

---

## WHAT THE AI CITIZENS DO IN THE DEVBOARD

The AI citizens (nervo, voce, anima, piazza, ponte) are not just displayed — they **live** in the DevBoard:

- They have their own WM (Working Memory) focused on their tasks
- They subcall each other when stuck
- They broadcast solutions when they solve something
- Their energy/frustration/satisfaction is visible as halo color
- You can `/call` any of them by clicking their avatar
- They auto-trigger subcalls when frustrated (physics-driven)
- Their moments (commits, conversations, discoveries) appear as events in the timeline

---

## RELATIONSHIP TO EXISTING ARCHITECTURE

| Component | Role in DevBoard |
|-----------|-----------------|
| FalkorDB | The source of truth — every visual element reads from the graph |
| L1 Physics (21 laws) | Run on every tick — energy, decay, propagation visible |
| /subcall | The primary research tool — ask questions, get resonance |
| Living Places | Each room IS a Living Place with E2E encryption |
| Physics Bridge | Connects Python tick to the visual layer |
| Home Server | Single port serving both API and spatial client |
| Schema v2.3 | Defines what nodes/links exist and how they're typed |
| BEHAVIORS.md | Defines how citizens behave in the DevBoard |

---

## BUILD ORDER

```
Phase 1: Holographic Dashboard (what we started)
  ✓ Vite + React + D3 force graph
  ✓ FalkorDB API backend
  ✓ Pan/zoom/drag
  ✓ Tick controls (pause, x1, x2, x3, manual)
  → Add room tabs (manager, triage, code, deploy, docs)
  → Add Cypher query bar (already working)
  → Add node inspector panel (click → see properties)
  → Add subcall UI (type question → see resonance)

Phase 2: Code Ingestion
  → Parse a repo into the graph (files=Things, modules=Spaces)
  → Display as spatial architecture
  → Doc chain as visible threads
  → Git activity as energy

Phase 3: Voice Integration
  → Whisper STT → MCP tool dispatch → response
  → Voice commands: "show me auth", "run a tick", "call nervo"

Phase 4: 3D World (Lumina Prime)
  → Three.js or R3F renderer
  → Walk/fly navigation
  → Spatial audio
  → VR support (Quest 3)
```

---

## THE PARADIGM: CODE-AS-GRAPH, HEALTH-DRIVEN

### The Graph IS the Source of Truth

The graph holds the **intention and architecture**. The git repo is just an **execution artifact**.

Development is not text editing. It is **resolving thermodynamic tensions**. A bug is not red text in a terminal — it is a **friction spike** on a link between a function and an objective. The system doesn't compile code — it observes pain (friction, frustration) and triggers thermodynamic processes to heal the architecture until the pain disappears.

### Two Universes

| Layer | What It Does |
|-------|-------------|
| **Studio Platform (Mind)** | Graph physics, stimulus ingestion (errors, logs), agent orchestration, Places |
| **Cartouche (Blood Ledger)** | Interface rendering (views, VR), world orchestration, visual feedback |

---

## THE 4 MODULES

### A. Interaction Module (MCP & Tools)

The motor interface. The 15 MCP tools (graph_query, graph_write, bash, subcall, place...) let citizens and autonomous processes write to the filesystem, edit the graph, or run shell commands.

### B. Live Feedback Module (Places & Surfaces)

UIs are not dashboards — they are Space nodes (Places). `place://ui/triage` or `SYNC_Project_Health.md` are spaces where graph energy is translated visually. When a linter fails, the friction is rendered as a spatial alert in the Place.

### C. Process Module (Knowledge & Routines)

Knowledge is stored in Narrative nodes (subtype=process). Some carry `action_command` (e.g., `bash pytest`) with `drive_affinity`. When frustration or urgency rises, the math automatically triggers the shell command. **Reflexive self-correction.**

### D. SubEntity Module (Zero-LLM Exploration)

The crown jewel. SubEntities are temporary consciousness fragments guided by vector math (embeddings), **zero LLM calls**:
- **Query:** what they're searching for (a function, a pattern)
- **Intention:** why (VERIFY, FIND_NEXT, DIAGNOSE)
- **Criticality:** how urgent
- **State machine:** SEEKING → BRANCHING → RESONATING → CRYSTALLIZING

If they detect a problem (via vector similarity + divergence), they physically generate a new node (the solution or bug report) via Macro-Crystallization.

---

## HOW CODE EXISTS IN THE GRAPH

### The Axiom: The Graph Never Duplicates File Content

No raw source code in nodes. No AST dumps. No base64 files. Instead: **EvidenceRef pointers**.

### EvidenceRef — The Structural Pointer

Each code fragment (module, function, class) is a **Thing node** with an EvidenceRef:

```yaml
EvidenceRef:
  repo: "mind-mcp"                    # which repo
  path: "runtime/cognition/laws/law_06_consolidation.py"  # physical file
  commit_sha: "abc123"                # git fingerprint
  range: "L85-L198"                   # exact lines
  fingerprint: "sha256:..."           # content hash
  kind: "function_ref"                # file_ref | function_ref | module_concept
```

### Code Fragment Types

| Kind | What It Represents |
|------|-------------------|
| `file_ref` | A complete script/module |
| `function_ref` | A specific function or method |
| `module_concept` | A directory or architectural abstraction |

### How a Bug Lives in the Graph

```
actor_flake8 (Actor)          ← the linter bot
  │
  │ CREATED (polarity > 0.7 — "the linter initiated the error")
  ▼
moment_err_123 (Moment)       ← the error (NameError line 42)
  subtype: "observation"
  content: "NameError: name 'x' is not defined"
  │
  │ ABOUT (hierarchy < -0.5, friction > 0.7, valence < -0.5)
  │ "The error destructively attacks the function with high friction"
  ▼
thing_func_calcul (Thing)     ← the function
  kind: "function_ref"
  evidence_ref: {repo: "app", path: "src/calc.py", range: "L42-L60"}
```

**The pain is physical:** friction > 0.7 on the link between error and function. Every SubEntity traversal feels this friction. Every citizen's WM is biased by it. The bug demands attention through thermodynamics.

### The Healing Cycle

```
1. Linter bot (Actor) emits error Moment
2. Friction spikes on Moment → Thing link
3. SubEntity traverses, detects friction, reports to WM
4. Citizen's frustration rises → moat drops
5. process:fix_bug captures WM (drive: achievement)
6. Citizen reads EvidenceRef → opens file at L42-L60
7. Fixes the Python code (via MCP bash/edit)
8. Linter bot re-runs → emits clean Moment
9. Friction drops to 0 → pain disappears
10. Satisfaction spikes → knowledge consolidates (Law 6)
```

No human intervention. No ticket system. The physics detected the pain, routed attention to it, and rewarded the fix.

---

## SEE ALSO

- `docs/architecture/CONCEPT_Dataset_As_Space.md` — Codebase as walkable 3D
- `docs/architecture/CONCEPT_Lumina_Prime.md` — The procedural generation engine
- `docs/architecture/CONCEPT_Superhuman_Senses.md` — Code Vision, thermal, minimap
- `docs/architecture/CONCEPT_Subconscious_Broadcast.md` — /subcall as primary research
- `docs/architecture/CONCEPT_Security_By_Thermodynamics.md` — Why bugs self-heal safely
