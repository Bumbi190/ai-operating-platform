# Atlas Intelligence — Complete Taxonomy

**Purpose:** Define the Intelligence Object kinds and the long-term cognitive lifecycle, with clear ownership across the Atlas layers (Memory · Knowledge · Intelligence · Executive Intelligence · Execution).
**Status:** Intelligence layer COMPLETE — Understanding (`brief`, `trend`, `insight`) + Assessment (`risk`, `opportunity`) implemented and tested. Decision/Executive, Execution and Memory artifacts are specified here for the complete picture but are owned by adjacent layers (not Intelligence Objects).
**Companions:** `OMNIRA_ATLAS_INTELLIGENCE_ADR.md` (domain decisions), `OMNIRA_ATLAS_INTELLIGENCE_MODEL_REVIEW.md` (object shape).

---

## 1. The Intelligence lifecycle

```
Observation → Signal → Brief → Trend → Insight → Recommendation → Execution → Outcome → Experience
```

Each stage refines the one before and is consumed by the one after. Crucially, the stages are **owned by different layers** — the Intelligence layer owns only the Understanding + Assessment band:

| Stage | Owner layer | Store | Atlas-Intelligence kind? | Meaning |
|---|---|---|---|---|
| Observation | Memory | `atlas.memory_events` | no | "Atlas saw something happen" |
| Signal | Knowledge | `atlas_signals` | no | "A normalized fact" |
| Brief | **Intelligence** | `atlas_intelligence` | `brief` | "What is the state?" |
| Trend | **Intelligence** | `atlas_intelligence` | `trend` | "What is changing?" |
| Insight | **Intelligence** | `atlas_intelligence` | `insight` | "Why does it matter?" |
| Risk / Opportunity | **Intelligence** | `atlas_intelligence` | `risk`, `opportunity` | "What could go wrong / be gained" |
| Recommendation | Executive Intelligence | `atlas_decisions` (future) | no | "What should we do?" |
| Execution | Manager | `atlas_actions` | no | "What the Manager did" |
| Outcome | Execution domain | (future) | no | "What actually happened" |
| Experience | Memory | `atlas.memories` | no | "What we learned" |

Only `brief`, `trend`, `insight`, `risk`, `opportunity` (and the cross-cutting `entity_profile`) are Intelligence Objects. Recommendation, Outcome, Experience and Goal Evaluation belong to adjacent layers — documented below for the complete picture.

**One cross-cutting Intelligence kind** sits alongside the linear flow: `entity_profile` (standing, descriptive intelligence about one entity). `executive_brief` and goal evaluation are **Executive Intelligence** (see ownership below), not Intelligence Objects.

### Layer ownership (final)

| Layer | Owns | Nature |
|---|---|---|
| **Knowledge** | Signals | normalized facts |
| **Intelligence** | `brief`, `trend`, `insight`, `risk`, `opportunity`, `entity_profile` | descriptive, context-free, reusable by any consumer |
| **Executive Intelligence** | `recommendation`, `executive_brief`, goal **evaluation** | prescriptive/decisional, depends on goals, policy, intent, priorities, budget, resources, workload |
| **Manager** | execution of actions (`atlas_actions`) | does the work |
| **Execution domain** | `outcome` | records what actually happened; bridges execution → learning |
| **Memory** | the long-lived **Goal**, consolidated belief, `experience` | persistent project knowledge |

**Why Recommendation is Executive, not Intelligence:** Intelligence Objects are descriptive and context-free, so they are reusable by *any* consumer. A recommendation is prescriptive and context-dependent — it requires goals, policy, intent, priorities, budget, resources and workload, which are Executive concerns. Baking those into a persisted Intelligence Object would destroy reusability. Reasoning was already located in Executive Intelligence (it is a capability, not an object); Recommendation is its first concrete output.

**Goal vs Goal Evaluation:** a **Goal** is a long-lived objective — persistent project knowledge, owned by **Memory**. The **evaluation** of that goal (its current status against present context and priorities) is owned by **Executive Intelligence**. `goal_status` denotes the evaluation, not the stored goal.

### Conceptual layers — Understanding · Assessment · Decision

The producing kinds group into three cognitive layers. This is a conceptual grouping, not a new object type:

| Layer | Kinds | Owner | Question |
|---|---|---|---|
| **Understanding** | `brief`, `trend`, `insight` | Intelligence | What is true, what is changing, why it matters |
| **Assessment** | `risk`, `opportunity` | Intelligence | What could go wrong / what could be gained (forward-looking) |
| **Decision** | `recommendation` | Executive Intelligence | What to do, synthesizing the layers below + goals + policy |

Understanding and Assessment are owned by the **Intelligence** layer. Decision is owned by **Executive Intelligence** — it synthesizes Intelligence Objects together with Executive inputs (goals, policy, intent, priorities, budget, resources, workload).

`risk` and `opportunity` are two valence-mirrored forms of **Assessment**: they consume Understanding objects and project them forward (negative vs positive). They are siblings of `insight`, not successors — Recommendation (in Executive Intelligence) synthesizes all three.

**Evidence invariant (Assessment):** every `risk` or `opportunity` MUST reference at least one *factual* Intelligence Object — a `brief`, `trend`, or `insight` — through its evidence chain. Memory/precedent alone is insufficient. No purely speculative Assessment objects may exist without traceable factual evidence. Producers return nothing rather than emit an ungrounded assessment.

**Confidence vs domain probability (Assessment):** `confidence` (evidential certainty) and the projected `likelihood`/`potential` (future probability or value) are independent and must never be conflated. Confidence propagates from sources (≤ strongest); likelihood/potential are computed from observed magnitude + precedent.

**Policy** is a governance layer that constrains Executive Intelligence and the Manager. It is **not** an Intelligence Object and does not participate in the pipeline; Recommendation reads it as a constraint, like a guardrail.

### The feedback loop — Experience derives from Outcome, never from Recommendation

```
Recommendation ──▶ Execution ──▶ (post-action Signals) ──▶ Outcome ──▶ Experience
      │  (intended)     (action)         (measured)         (observed)   (learned)
      └───────────────────────────────────────────────────────────────────┘
                                                                            ▼
                                                            atlas.memories (belief)
                                                                            │
                                          influences future Briefs / Insights / Recommendations
```

**Core architectural principle (Experience-from-Outcomes):** `experience` MUST be derived from observed `outcome` objects, not from the `recommendation` that triggered the action. We learn from what *happened*, not from what we *intended*. This prevents Atlas from "learning from its own advice" — a recommendation is a hypothesis; only a measured outcome confirms or refutes it. Experience is therefore the bridge from the Intelligence layer back into Memory, closing the loop without a parallel memory system. This is a permanent invariant of Atlas, not a producer-level choice.

---

## 2. Shared models (apply to every kind)

So the taxonomy stays coherent and Executive Intelligence can trust the whole chain, two models are defined once and inherited.

### Confidence model (platform-wide)

Confidence is always `0–1` (matching `atlas.memories`). Kinds fall into two families:

- **Measurement-grounded** (`brief`, `trend`, `entity_profile`, `goal_status`, `outcome`): confidence is computed deterministically from the data — volume, recency, statistical fit — as `trend` already does (point count + R² + magnitude). LLMs never set it.
- **Derived/aggregate** (`insight`, `risk`, `opportunity`, `recommendation`, `experience`, `executive_brief`): confidence is **propagated** from the source Intelligence Objects, never raised above them. The default rule is a weighted/min combination of source confidences, optionally modified down for conflict or up for corroboration (more independent sources agreeing). A conclusion can never be more confident than its weakest necessary input.

### Evidence model (platform-wide)

Every object carries a **complete `EvidenceChain`** (`{ sourceKind, refId, weight, observedAt, note }[]`).

- Fact-grounded kinds reference `signal` / `content` / `collector_run` / `memory`.
- Derived kinds reference the Intelligence Objects they consumed with `sourceKind: 'intelligence'`, so chains **nest** — a `recommendation` points to `insight`s → which point to `trend`/`brief`s → which point to `signal`s. `getEvidenceChain(id)` lets any consumer drill from the apex all the way to raw facts without re-analysis.
- **Forward extension flagged:** `outcome`/`experience` need to reference executions, so `EvidenceSourceKind` will gain `'action'` (→ `atlas_actions`) when those producers land. Noted, not implemented now.

### Reasoning vs Insight — a capability, not an object

**Reasoning is NOT an Intelligence Object kind.** Reasoning is the internal *cognitive process* by which Executive Intelligence weighs Briefs, Trends, Insights and other objects to reach a conclusion. `insight` is one possible *output* of that process — a persisted, evidence-backed conclusion — but the process itself is not stored as an object.

| | Reasoning | `insight` |
|---|---|---|
| **What it is** | A cognitive process / capability | A persisted Intelligence Object |
| **Where it lives** | Executive Intelligence (Manager, `executive_brief` assembly) | `atlas_intelligence` |
| **Lifetime** | Transient (runs at consumption time) | Durable, versioned, append-only |
| **Produces** | May emit `insight` (and other) objects | — (it *is* an output) |

Consequence: the placeholder `reasoning` kind is **removed** from the object taxonomy (it was never produced). Reasoning lives as an Executive Intelligence capability that reads Intelligence Objects and may persist `insight` results. This keeps the object taxonomy strictly about durable artifacts and the cognitive layer separate.

---

## 3. Kind-by-kind specification

### `brief` — situational state *(implemented)*
- **Purpose:** Aggregate current facts into a readable snapshot of "where things stand."
- **Inputs:** Signals (`stripe.mrr_snapshot`, `social.account_snapshot`, `impact_score`); optional Memory (injected seam).
- **Outputs:** Metrics, per-kind counts, findings, window. Subject = project or global.
- **Consumers:** Manager, `executive_brief`, The Prompt.
- **Confidence:** Measurement-grounded — coverage breadth + signal volume + memory presence.
- **Evidence:** One `signal` entry per signal; `memory` entries when enriched.

### `trend` — directional change over time *(implemented)*
- **Purpose:** Detect meaningful change in a metric.
- **Inputs:** A metric time-series from Signals; prior `trend` objects (continuity).
- **Outputs:** Direction, %/abs change, slope, R², significance. Subject = entity/project/global.
- **Consumers:** Manager, `insight`, `entity_profile`, `goal_status`, `executive_brief`.
- **Confidence:** Measurement-grounded — point count + R² + magnitude + prior corroboration.
- **Evidence:** One `signal` per series point + `intelligence` for the prior trend.

### `insight` — interpreted meaning
- **Purpose:** Explain *why* the state/changes matter — correlate briefs and trends into non-obvious, material conclusions. An `insight` is one durable *output* of the Reasoning capability (see §2); reasoning itself is not an object.
- **Inputs:** `brief` + `trend` objects (and the signals beneath them for grounding).
- **Outputs:** A classified conclusion (e.g. acceleration, divergence, plateau), a `materiality` score, affected subject(s).
- **Consumers:** `recommendation`, `risk`, `opportunity`, `entity_profile`, `executive_brief`, Manager.
- **Confidence:** Derived — propagated from source brief/trend confidences, modified by corroboration/conflict.
- **Evidence:** `intelligence` references to the exact briefs/trends; signals as secondary grounding.

### `risk` — anticipated negative outcome
- **Purpose:** Surface a credible threat with likelihood and impact. A forward-looking, negative-valence specialization at the Insight stage.
- **Inputs:** `insight`/`trend`/`brief` objects + memory of prior incidents.
- **Outputs:** Risk statement, `likelihood` (0–1), `impact` (severity), time horizon, affected subject.
- **Consumers:** `recommendation`, `executive_brief`, Manager.
- **Confidence:** Derived — propagated from sources; likelihood is a separate field, not the confidence.
- **Evidence:** `intelligence` (insights/trends) + `memory` (precedent) + `signal` grounding.
- **Invariant:** must cite ≥1 factual object (`brief`/`trend`/`insight`); never produced from precedent alone. No factual driver → no risk.

### `opportunity` — anticipated positive outcome
- **Purpose:** Surface a credible upside with potential and effort. Positive-valence Insight specialization.
- **Inputs:** `insight`/`trend`/`brief` objects + entity context.
- **Outputs:** Opportunity statement, `potential`, `effort`, confidence, target subject.
- **Consumers:** `recommendation`, `executive_brief`, Manager.
- **Confidence:** Derived — propagated from sources.
- **Evidence:** `intelligence` references + signal grounding.
- **Invariant:** must cite ≥1 factual object (`brief`/`trend`/`insight`); never produced from precedent alone. No factual driver → no opportunity.
- **Coexistence note:** This is the *append-only detected* opportunity (a snapshot), distinct from the existing workflow table `public.opportunities` (stateful: open/dismissed/actioned). Per the original ADR they coexist — a `recommendation` may spawn/update an `opportunities` row, but the Intelligence Object is never mutated.

### `entity_profile` — standing intelligence about an entity *(Intelligence)*
- **Owner:** Intelligence layer (descriptive, cross-cutting).
- **Purpose:** A cumulative, canonical profile for one entity (the standing "what Atlas knows" about OpenAI, a competitor, a topic). Subsumes the earlier `entity_momentum` idea — momentum is just a `trend` with an entity subject, surfaced here.
- **Inputs:** Signals, `trend`s and `insight`s about the entity, Memory, (later) relationships.
- **Outputs:** Standing summary, key metrics, current momentum, notable insights, related entities.
- **Consumers:** Manager, agents, `insight` producer, Executive Intelligence.
- **Confidence:** Mixed — measurement-grounded on metrics, propagated on incorporated insights.
- **Evidence:** `intelligence` + `signal` + `memory`, keyed to `atlas_entities(kind, key)`.
- **Forward note:** subject = `entity`; references the canonical registry.

---

## 3b. Adjacent-layer artifacts (specified for completeness — NOT Intelligence Objects)

These close the lifecycle and reuse the same Evidence model, but are owned outside the Intelligence layer. They consume Intelligence via the Retrieval API; they are not produced by Intelligence producers and do not live in `atlas_intelligence`.

### `recommendation` — proposed action *(Executive Intelligence)*
- **Owner:** Executive Intelligence. The first Executive capability; **not** an Intelligence Object. Lives in a future `atlas_decisions` domain with its own store.
- **Purpose:** Turn Intelligence (insights/risks/opportunities) into a prioritized, actionable proposal for a specific actor.
- **Inputs:** Intelligence Objects (`insight`, `risk`, `opportunity`, `trend`, `brief`) **plus Executive inputs** — goals, policy, user intent, current priorities, budget, available resources, workload. The Executive inputs are why it cannot be a context-free Intelligence Object.
- **Outputs:** Proposed action(s), `expectedEffect`, `priority`, `effort`, `target`.
- **Consumers:** Manager (execution), operator (approval).
- **Confidence:** Derived — propagated from the Intelligence it cites; selection/priority deterministic, LLM narrates rationale only.
- **Evidence:** `intelligence` references to the source Intelligence Objects (drill-down preserved across the layer boundary).

### `outcome` — observed result of an execution *(Execution domain)*
- **Owner:** Execution domain. It bridges execution and learning: Executive decides, Manager executes, the Execution domain records what actually happened. **Not** an Intelligence Object. Becomes the input to `experience`.
- **Purpose:** Measure what actually happened after an action, vs. what the recommendation expected. The truth-check that powers learning.
- **Inputs:** A `recommendation`, its `execution` (`atlas_actions`), and post-execution Signals.
- **Outputs:** Measured effect, expected-vs-actual delta, verdict (`confirmed`/`partial`/`refuted`/`inconclusive`).
- **Consumers:** `experience`, `executive_brief`, Manager.
- **Confidence:** Measurement-grounded — based on post-action signal volume/clarity, not on the recommendation's confidence.
- **Evidence:** `action` (the execution) + `intelligence` (the recommendation) + `signal` (measured effect).

### `experience` — consolidated lesson *(Memory)*
- **Owner:** Memory. **Not** an Intelligence Object. The endpoint of the loop, promoted into `atlas.memories`.
- **Purpose:** Distill recurring outcomes into a reusable lesson that improves future producers. The bridge back to Memory.
- **Inputs:** One or more `outcome` objects (**never** recommendations directly).
- **Outputs:** A generalized lesson (pattern → expected result → confidence), promoted into `atlas.memories`.
- **Consumers:** Memory consolidation; downstream every producer indirectly (via recalled memory).
- **Confidence:** Derived — grows with the number of corroborating outcomes; decays/flips on refuting ones.
- **Evidence:** `intelligence` references to the `outcome`s it generalizes.

### `goal_status` — goal **evaluation** *(Executive Intelligence)*
- **Owner:** Executive Intelligence. This is the *evaluation* of a goal (its current status against present context, priorities and reasoning) — **not** an Intelligence Object. The long-lived **Goal** itself is persistent project knowledge owned by **Memory**; `goal_status` reads the Goal from Memory and evaluates it.
- **Purpose:** Report status of a stored goal/OKR — on track, at risk, or off track — with projection.
- **Inputs:** The Goal (from Memory) + Intelligence (`brief`/`trend`/`insight`/`risk`) as evidence of progress + Executive context.
- **Outputs:** Status enum, progress %, projected completion, blocking risks.
- **Consumers:** Manager, operator, `executive_brief`.
- **Confidence:** Measurement-grounded on progress data; propagated where it cites Intelligence.
- **Evidence:** `intelligence` + `memory` (the Goal) + `signal`.

### `executive_brief` — apex synthesis *(Executive Intelligence)*
- **Owner:** Executive Intelligence. Actor-facing synthesis that includes the prescriptive "what to do next" — **not** an Intelligence Object. This is where the Reasoning capability (§2) runs: it weighs the objects below and may persist `insight` results as a side effect.
- **Purpose:** The top-level read for the operator/Manager — the five executive questions (what happened / worked / failed / needs attention / next), assembled from Intelligence Objects + Executive inputs.
- **Inputs:** `brief`, `trend`, `insight`, `risk`, `opportunity`, `entity_profile` (Intelligence) + `recommendation`, goal evaluations (Executive) across projects.
- **Outputs:** The five answers, prioritized, each linked to its supporting objects.
- **Consumers:** Operator, Manager, future agents.
- **Confidence:** Derived — propagated from the objects it cites; never re-analyzes raw signals.
- **Evidence:** `intelligence` references (+ Executive artifacts) — the cleanest demonstration of "Executive Intelligence consumes reusable Intelligence Objects without re-analyzing raw data."

---

## 4. `IntelligenceKind` — Intelligence Objects only

After the ownership decision, the Intelligence layer owns exactly these kinds:

```
'brief' | 'trend' | 'insight' | 'risk' | 'opportunity' | 'entity_profile'
```

- `recommendation`, `executive_brief` → moved to **Executive Intelligence** (a future `atlas_decisions` domain); removed from `IntelligenceKind`.
- `goal_status` (goal evaluation) → **Executive Intelligence**; the Goal itself → **Memory**.
- `outcome` → **Execution domain**; `experience` → **Memory**.
- `reasoning` → an Executive Intelligence *capability*, never an object.
- `entity_momentum` → folded into `entity_profile` + entity-subject `trend`.

`EvidenceSourceKind` already includes `'intelligence'`/`'memory'` and will gain `'action'` for the Execution-domain `outcome`. All changes are additive at the storage level (kinds are values in `atlas_intelligence.kind`), consistent with the storage-agnostic design. Implemented so far: `brief`, `trend`, `insight`, `risk`, `opportunity`. `entity_profile` is reserved.

---

## 5. At a glance

| Kind | Owner | Family | Reads | Primary consumer |
|---|---|---|---|---|
| `brief` | **Intelligence** | measured | signals (+memory) | Executive, Manager |
| `trend` | **Intelligence** | measured | signals, prior trend | insight, Executive |
| `insight` | **Intelligence** | derived | brief, trend | risk/opp, Executive |
| `risk` | **Intelligence** | derived | insight, trend, memory | Executive |
| `opportunity` | **Intelligence** | derived | insight, trend | Executive |
| `entity_profile` | **Intelligence** | mixed | signals, trend, insight, memory | Manager, agents |
| `recommendation` | Executive Intelligence | derived | intelligence + goals/policy/intent/budget/resources/workload | Manager, operator |
| `executive_brief` | Executive Intelligence | derived | all intelligence + executive | operator, Manager |
| `goal_status` (evaluation) | Executive Intelligence | measured | Goal (Memory) + intelligence | Manager, operator |
| `outcome` | Execution domain | measured | recommendation, action, signals | experience |
| Goal (objective) | Memory | stored | — | Executive |
| `experience` | Memory | derived | outcomes | every producer (via recall) |

---

## Status & next step

**Intelligence layer milestone: COMPLETE.** Implemented, tested and committed on `feat/atlas-memory`: the Signal Platform + Store + Retrieval API, and the producers for `brief`, `trend`, `insight`, `risk`, `opportunity` (Understanding + Assessment). `entity_profile` is reserved as the remaining Intelligence kind.

**Handover:** the Decision layer (`recommendation`), `executive_brief`, and goal **evaluation** are now owned by **Executive Intelligence** — a new architecture and (future) `atlas_decisions` domain that consumes Intelligence Objects via the Retrieval API plus Executive inputs (goals, policy, intent, priorities, budget, resources, workload). `outcome` belongs to the Execution domain; the Goal and `experience` belong to Memory.

Next milestone: design the **Executive Intelligence architecture**, with the **Recommendation** capability as its first concrete output.
