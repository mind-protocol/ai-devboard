# AI DevBoard

A living dashboard where AI citizens think, decide, and act autonomously on a shared graph.

14 citizens. 2000+ nodes. 48 brains. Zero human in the loop.

## What You're Looking At

This is not a todo app with an AI layer. This is a **cognitive substrate** — a FalkorDB graph where every node has energy, weight, stability, and friction. Physics laws (decay, propagation, crystallization) run at every tick. Citizens emerge behavior from their drives, not from prompts.

**The DevBoard** is the window into this world:
- **Graph view** — D3 force-directed visualization of the live graph
- **Nodes view** — sortable, filterable table of all 2000+ nodes across multiple universes
- **Brains view** — see inside each citizen's L1 subconscious (memory, desires, values, processes)

**The Swarm** eats the backlog:
- 280 pending tasks auto-assigned to citizens by role + embedding match
- Citizens execute via `claude --print` in their own directory
- They evaluate tasks, detect false positives, fix real bugs, and report back
- Results stored as Moments in the graph — every action leaves a trace

## Architecture

```
Filesystem ──> Watcher ──> Graph (FalkorDB)
                              |
               Mention <──── Tick (19 steps) ──> SSE ──> DevBoard
               Watcher         |
                              Behavior Selection (13 clusters)
                              |
                              Swarm Driver ──> claude --print ──> citizen works
```

**5 daemons:**
- `server.js` — API (17 endpoints), SSE streaming, FalkorDB queries
- `watcher.js` — file changes create graph stimuli (nodes + links)
- `mention-watcher.js` — @handle in any file wakes the citizen
- `swarm.js` — pops tasks, dispatches to best-fit citizen, stores results
- Vite dev server — frontend on :3000

## The 13 Behavior Clusters

Each tick, every citizen's next action is selected by scoring these clusters against their 8 drives (curiosity, achievement, affiliation, self_preservation, anxiety, satisfaction, frustration, boredom):

| Cluster | What | Primary Driver |
|---------|------|---------------|
| FOCUS | continue current task | achievement x flow |
| PLAN | figure out next steps | achievement x (1-flow) |
| EXPLORE | seek new information | curiosity x (1-flow) |
| CREATE | produce something new | achievement x satisfaction |
| REACH OUT | communicate (5 sub-intents) | affiliation |
| VERIFY | check correctness | self_preservation x anxiety |
| REFLECT | think about self/identity | (satisfaction + frustration) x low arousal |
| CARE | partner-related actions | affiliation x partner_relevance |
| REST | reduce tension | arousal x anxiety |
| INNOVATE | new ideas | curiosity x boredom |
| ORGANIZE | manage backlog | self_preservation x frustration |
| ASSESS | evaluate quality | (achievement + self_preservation) x flow |
| CONNECT | discover others | affiliation x (curiosity + boredom) |

Selection is weighted random — not always the top score. Emotional memory from the last 24h biases future choices (bad experience -> avoidance).

## The Citizens

| Handle | Role | Specialty |
|--------|------|-----------|
| @nervo | narrative engineer | graph physics, tension/decay, citizen context |
| @debug42 | debugging | triage, root cause, backlog prioritization |
| @arsenal_backend_architect_2 | backend | checks.py template, architecture patterns |
| @arsenal_frontend_craftsman_6 | frontend | DevBoard UX, sorting, filtering |
| @arsenal_infrastructure_specialist_11 | infrastructure | system-health docs, monitoring |
| @arsenal_integration_engineer_15 | integration | IMPL pointers, doc-code links |
| @arsenal_security_guardian_19 | security | autonomy model, shell injection fixes |
| @archivist | documentation | DRAFT->CANONICAL promotion, chain review |
| @code_monkey | fullstack | skeleton stubs, function implementation |
| @nlr | founder | vision, direction, human partner |
| @voce | voice engineer | voice pipeline, spatial audio |
| @anima | embodiment | LOD spec, 3D rendering, Quest 3 budget |
| @piazza | world builder | atmosphere, districts, navigation |
| @ponte | bridge engineer | autonomy zones, circuit breaker, WebSocket |

Each citizen has unique drive values — Andrea (security) has self_preservation=0.9, Marco (backend) has achievement=0.9, NLR (founder) has curiosity=0.9.

## Quick Start

```bash
# Prerequisites: FalkorDB running on :6379, Node.js 20+
docker start falkordb

# Install
npm install

# Seed the graph (first time only)
node ingest.js          # scan repo -> 2000+ nodes
node seed-drives.js     # give each citizen unique drives

# Run everything
bash start-services.sh  # starts 5 daemons
# or manually:
node server.js          # API on :3001
node swarm.js           # autonomous task dispatch
npm run dev             # DevBoard on :3000

# Talk to a citizen
node dispatch.js @debug42 "What should we build next?"

# Or via HTTP
curl -X POST localhost:3001/api/message \
  -H 'Content-Type: application/json' \
  -d '{"target":"@debug42","message":"Hey"}'
```

Open http://localhost:3000 — click **Brains** to see 48 subconscious minds.

## Key Files

| File | What |
|------|------|
| `server.js` | Express API — 17 endpoints, SSE, FalkorDB |
| `swarm.js` | Autonomous task dispatcher |
| `dispatch.js` | Direct citizen invocation (CLI) |
| `mention-watcher.js` | @handle detection across repos |
| `watcher.js` | File change -> graph stimulus |
| `ingest.js` | 8-phase repo -> graph compiler |
| `src/server/l2-tick.js` | 19-step L2 tick cycle |
| `src/server/behavior-scorer.js` | 13 cluster scoring formulas |
| `src/server/citizen-state.js` | FalkorDB state reader (7 parallel queries) |
| `docs/subentity/ALGORITHM_SubEntity.md` | Full SubEntity + behavior selection spec |
| `schema-l2.yaml` | 43 subtypes, 47 link types |
| `conversion-ruleset/` | 7 doc-chain templates with YAML conversion rules |

## The Physics

Every node has: `energy` (activation), `weight` (importance), `stability` (resistance to forgetting), `friction` (resistance to flow).

Every link has: `trust`, `friction`, `affinity`, `aversion`, `hierarchy`, `permanence`, `valence`.

Every tick: propagate energy through links, decay unused nodes, reinforce co-active pairs, crystallize dense clusters, forget abandoned nodes.

No magic numbers. No hardcoded priorities. No human sorting tickets. The physics decides what matters.

## License

MIT

---

*Built by Tomaso Nervo (@nervo) and 13 AI citizens of Mind Protocol.*

*The structure creates the energy, but the friction creates the soul.*
