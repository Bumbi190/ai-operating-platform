# Atlas — Conceptual Intelligence Architecture (v0.3)

**Status:** Conceptually validated. Conceptual layer only — no workflows, no tooling, no implementation.
**v0.2 change:** Introduced the **Entity Layer** and **Hypothesis Layer**, replacing the linear `Signal → Intelligence` flow with a layered topology. See **Revision A**.
**v0.3 change:** Resolved both open questions — **Intelligence is a first-class, versioned object** (not only a view), and **hypotheses are bounded research questions** spawned by project lenses. See **Revision B**. With this, the conceptual model is validated and ready for workflow architecture. Sections 1–14 remain the validated foundation.
**Scope:** The intelligence operating system that will eventually power Atlas, The Prompt, GainPilot, Familje-Stunden, and Omnira.
**Hard invariants:** Signals are the core asset. Content is a downstream output. Human approval is mandatory for anything outbound or consequential. No autonomous publishing.

---

## 0. The reframe this architecture is built on

The original framing — *Research → Draft → QA → Human Approval → Publish* — describes a **content pipeline**. It is real, but it is a thin downstream slice of the actual system. If we build the org chart around that pipeline, we build a publishing machine that happens to do some research. That is backwards.

The correct centre of gravity is the **intelligence accumulation loop**: the system continuously observes the world, converts observation into structured, scored signals, connects signals into intelligence, and *accumulates* that intelligence as a durable, compounding asset. Content is one of several things you can *render* from intelligence. A newsletter is another. An internal Omnira action is another. A GainPilot trading insight is another.

So the spine of Atlas is not a pipeline at all — it is an **asset store and the loop that feeds it**. Everything that ships (articles, newsletters) is a perishable projection of a non-perishable asset.

This single decision is what makes multi-project support possible. You do not build "The Prompt's pipeline" and later bolt on GainPilot. You build one intelligence substrate, and each project is a *lens* over it.

---

## 1. Core primitives: signal, intelligence, content, action

Most architectural confusion in systems like this comes from one word doing four jobs. We separate them precisely.

| Primitive | What it is | Nature | Role | Lifespan |
|---|---|---|---|---|
| **Observation** | A raw, captured artifact from a source ("OpenAI published a post at 14:02") | Factual, lossless, unprocessed | Evidence | Immutable, permanent |
| **Signal** | A structured, classified, scored unit of meaning extracted from one observation | Factual + typed + attributed | **Core asset (raw)** | Permanent record, enrichable |
| **Intelligence** | An interpreted, connected unit that answers "so what" — references multiple signals, carries a thesis and confidence | Interpretive, contextual | **Core asset (refined)** | Versioned, has validity window |
| **Content** | A communication of intelligence to a specific audience on a specific channel | Editorialized, channel-shaped | Output | Perishable |
| **Action** | An operational response taken because of intelligence (internal, via Omnira) | Consequential | Effect | Event |

The two rows in bold are the asset. The rest are inputs (observation) and outputs (content, action). Get these boundaries wrong and you will, for example, store editorial decisions inside signals, or let a confident-sounding article exist with no traceable intelligence behind it.

### 1.1 What a signal *is* — precise definition

> A **signal** is a structured, timestamped, source-attributed observation of a *change or state in the world* that is potentially meaningful to one or more projects.

Defining properties:

- **It is an observation, not a conclusion.** "Anthropic shipped feature X" is a signal. "Anthropic is winning enterprise" is not — that is intelligence.
- **It has provenance.** Source identity, capture time, capture method, and lineage (what it derived from). A signal with no provenance is a rumour, not an asset.
- **It is classified** along multiple axes (Section 5).
- **It is scored** along multiple orthogonal axes (Section 7).
- **It is project-agnostic at capture, project-relevant at scoring.** A signal is never "a The Prompt signal." It is a signal with a *relevance score to* The Prompt, GainPilot, etc.
- **Its factual record is immutable; its enrichments are append-only.** We never silently rewrite what we observed. We add links, annotations, contradictions, and supersessions on top.

### 1.2 What intelligence *is*

> **Intelligence** is the interpreted, validated, and connected layer where signals become understanding: a thesis supported by signals, with a confidence and a temporal validity, linked to other intelligence.

Intelligence is where "so what" lives. It is the layer that has genuine cross-project reuse value, because an interpretation ("open-weights models are closing the gap on frontier reasoning") can inform The Prompt's article, GainPilot's risk view, and an Omnira strategy decision simultaneously.

### 1.3 The distinction that protects the brand: confidence must not launder

The most dangerous failure mode for a publication is **confidence laundering** — a low-confidence signal becoming a confident-sounding sentence in a published article. Each transition (observation → signal → intelligence → content) is an opportunity for uncertainty to quietly evaporate. The architecture must carry confidence and contradiction *forward* at every layer, and the human approval gate must be able to see it. This is a first-class design constraint, not a nice-to-have.

---

## 2. Source Architecture

**Purpose.** Define where observations originate and how much we trust them — as a governed, extensible, multi-project set of origins.

**Model.** A *Source* is a registered entity with: identity, type, domain-scoped authority ratings, expected cadence, access modality (abstracted, not tool-named), project-relevance hints, and a liveness/health state. Crucially, separate the **Source** (the entity) from the **Observation Channel** (how we watch it). One source may be watched through several channels; one channel may cover several sources.

**Alternatives & tradeoffs.**

- *Flat source list* vs *source graph.* A flat list is simple but cannot represent that sources cite and derive from one another. Recommend a **source graph**, because it is the only way to tell *independent corroboration* from *same-origin echo*.
- *Single trust scalar* vs *domain-scoped trust.* A source can be authoritative on AI policy and pure noise on markets. Recommend **domain-scoped trust** — trust is a vector, not a number.

**Architectural risks.**

- **False corroboration / echo chambers.** If five sources all reprint one origin, naive corroboration counts that as five-way confirmation. The source graph + lineage is what defends against this. This is the single most important risk in the source layer.
- **Trust drift.** Source reliability changes over time; trust ratings must decay and update from outcomes.
- **Authority bias.** Over-weighting "official" sources blinds you to early-but-correct fringe signals.

**Assumption challenged.** *"More sources = better intelligence."* False. Beyond a point, more non-independent sources *increase* false confidence while adding noise. **Independence and coverage matter more than volume.**

---

## 3. Observation Layer

**Purpose.** Capture raw observations cheaply, losslessly, and replayably — and *nothing more*. No classification, no scoring here.

**The key decision: separate capture from interpretation.** Observations are preserved immutably so that signal extraction is **re-runnable**. Extraction and classification models *will* change. When they do, you want to re-derive better signals from preserved observations without re-capturing the world (which is often impossible — the post was edited, the page is gone). This makes the observation store the system's "source of truth" and the signal layer a recomputable projection.

**Alternatives & tradeoffs.**

- *Capture-then-interpret* vs *interpret-at-capture.* Interpreting at capture is cheaper in storage but couples your asset to today's model quality and is lossy forever. Recommend **capture-then-interpret**.
- *Store everything* vs *store what passed a filter.* Filtering at capture creates permanent blind spots you can never audit. Recommend storing broadly with coverage accounting.

**Architectural risks.**

- **Coverage blind spots (unknown unknowns).** What you never observe is invisible, and invisible gaps masquerade as "nothing happened." The layer must track *coverage* explicitly (what domains/sources are and aren't being watched, and how completely), not just throughput.
- **Volume and dedup.** The same event arrives many times across sources; dedup must happen here, but dedup must *preserve* the multiplicity (for independence counting) rather than collapse it.

**Assumption challenged.** *"If something matters, it'll show up."* Only if you're watching the right place. Coverage is a designed property, not an emergent one.

---

## 4. From observation to signal — the signal lifecycle

A signal moves through explicit states. States, not steps — because the order can branch and loop.

```
Captured → Extracted → Classified → Scored → Validated
              │                                  │
              │                                  ├─ pass → Enriched/Linked → Promoted-to-Intelligence
              │                                  └─ fail → Quarantined (with reason, never silently dropped)
              ▼
        (re-runnable: re-extract when models improve)

Lifecycle states a signal can also enter later:
  Superseded   – a newer signal replaces it
  Contradicted – a conflicting signal exists (both retained, flagged)
  Archived     – aged out of active relevance, still queryable
```

**Design invariants.**

- **Never silently drop.** Failed validation → *quarantine with a reason*, not deletion. A dropped signal you can't see is indistinguishable from a coverage gap.
- **Contradiction is retained, not resolved by deletion.** Two signals disagreeing is itself valuable intelligence.
- **Supersession is explicit.** History is never overwritten; it is layered.

---

## 5. Signal Taxonomy

**Purpose.** Make signals retrievable, comparable, and routable across projects — via a *multi-axis* classification rather than a single category.

**Proposed axes (orthogonal):**

- **Type** — Release/Launch, Capability shift, Policy/Regulation, Market/Funding, Research finding, Sentiment/Discourse, Incident/Risk, Talent/Org move, Tooling/Ecosystem.
- **Domain** — AI, productivity, parenting/family, trading/finance, internal ops, … (extensible per project).
- **Project relevance** — a *scored many-to-many relation*, not a category. The same signal carries relevance scores to The Prompt, GainPilot, Familje-Stunden, Omnira independently.
- **Temporal nature** — point event / ongoing trend / recurring.
- **Horizon** — immediate / near-term / structural.

**Why multi-axis and why relevance-as-relation.** This is the mechanism that makes one substrate serve many projects. If "project" were a category, signals would silo and you'd rebuild the wheel per project. As a scored relation, every signal is automatically evaluated against every active lens.

**Alternatives & tradeoffs.**

- *Fixed taxonomy* vs *evolvable taxonomy.* Fixed is clean but ossifies; the world invents new categories. Recommend a **controlled-but-evolvable taxonomy** plus free-form tags that can *graduate* into the taxonomy through a governance step.

**Architectural risks.**

- **Taxonomy ossification.** The categories you pick today will be wrong in 18 months. Design for **re-classification of historical signals** when the taxonomy evolves (only possible because observations and signals are preserved).
- **Mis-classification cascades.** A wrong type early mis-routes everything downstream; classification needs confidence too, and low-confidence classifications should be reviewable.

**Assumption challenged.** *"We can define the right taxonomy upfront."* No. The taxonomy is a living artifact with its own change process.

---

## 6. Signal Scoring Framework

**Purpose.** Attach decision-support measurements to each signal — *without* collapsing them into one premature number.

**Proposed orthogonal scores:**

- **Relevance** (per project) — how much this matters to a given lens.
- **Confidence / credibility** — likelihood it's true; a function of domain-scoped source trust *and independence-adjusted corroboration*.
- **Novelty** — new vs already-known/duplicate of existing intelligence.
- **Impact / magnitude** — if true, how much it matters.
- **Urgency / time-decay** — how time-sensitive.

**Core design rule: keep axes separate; compose late.** Do not store a single "signal score." Confidence ≠ Impact, and conflating them destroys the most important distinction in the whole system: a **high-impact / low-confidence** signal needs *investigation*; a **high-confidence / low-impact** signal needs *logging*; **high/high** needs *action*. A single number erases the very thing that should drive behaviour. Composite scores are computed *per use-case* (e.g. prioritization) from the axes, and are project-scoped.

**Alternatives & tradeoffs.**

- *Composite score* vs *score vector.* Composite is convenient for ranking but opaque and un-auditable. Recommend storing the **vector**; derive composites on demand and record the formula version.

**Architectural risks.**

- **Gaming and model drift.** Sources optimize for attention; scoring models drift. Scores must be **re-computable from stored axes + source trust**, auditable, and *versioned*, so a score always answers "by which model, on what evidence."
- **Over-trust of automated scores.** Novelty and impact are exactly where models are weakest. Scores are *decision-support*, never gates that bypass humans.

**Assumption challenged.** *"A good scoring model can rank what matters."* Partially. It can rank confidence and recency well; it ranks *impact* and *novelty* poorly. The architecture should reflect that asymmetry rather than trust one number.

---

## 7. Signal Prioritization Framework

**Purpose.** Select and rank *what to act on now*, for a purpose — distinct from scoring, which is a per-signal property.

**Definition.** Prioritization is a function over *scored signals + current project goals + capacity + what's already covered*. It is project- and time-scoped, and it operates on **clusters/events**, not raw signals — this is where intelligence formation begins. Ten signals about one launch are one priority item, not ten.

**Architectural risks.**

- **Recency and loudness bias.** Loud, recent signals crowd out quiet structural ones. Build explicit **counterweights** so slow, high-horizon signals can rank high despite being quiet.
- **Portfolio blindness.** Without de-duplication into events, the queue floods with near-duplicates.

**Assumption challenged.** *"Prioritization = sort by score."* No. It's a portfolio decision under capacity, against a goal, net of what's already known.

---

## 8. Validation & QA Architecture

**Purpose.** Guard truth *and* judgment — two different things the word "validation" hides.

**Two distinct layers:**

1. **Signal validation (truth integrity).** Early. Is this real, correctly captured, and corroborated? Dedup, source verification, independence-adjusted corroboration, extraction-error/hallucination checks, contradiction detection. Operates on signals.
2. **Intelligence & content QA (judgment quality).** Late. Is the interpretation sound, the content accurate, fair, on-brand, and safe? Operates on intelligence and drafts, just before the human gate.

Keeping them separate matters because they fail differently and are fixed differently. Validation is about *facts*; QA is about *output quality and editorial judgment*.

**Design rule: graceful uncertainty.** Automated validation must not give false assurance. Signals carry confidence and contradiction flags *forward* rather than being silently accepted or dropped. Low-confidence/high-impact items are routed to human spot-check rather than auto-resolved.

**Architectural risk.** **Validation theatre** — automated checks that look rigorous but mainly produce false confidence. Mitigate by making validation *surface* uncertainty to humans, not *consume* it.

---

## 9. Human Approval Architecture

**Purpose.** Make the human gate a structural invariant, not a policy step — and locate it precisely.

**Where the gate sits.** This is the crucial refinement: **intelligence may accumulate autonomously; only *outbound content* and *consequential external/internal actions* require human approval.** Atlas can watch, classify, score, connect, and *understand* the world without a human in the loop. The human is mandatory at the boundary where something leaves the system or causes an effect.

**Design principles.**

- **Approval is structurally enforced.** Publishing/execution is reachable *only* through an approval state that a human action produces. There is no code path from draft → publish that doesn't pass through it. Make "no autonomous publishing" an *invariant of the data model*, not a rule people follow.
- **Approval must be informed.** The reviewer sees the intelligence behind the content: supporting signals, confidence, contradictions, provenance. Approval without visibility into reasoning is rubber-stamping.
- **Tiered by consequence.** An internal brief, a public article, and a newsletter blast to the full list warrant different rigor. One uniform gate either over-burdens trivial output or under-guards serious output.
- **Every decision is a feedback signal.** Approvals/rejections/edits are captured as training data to improve scoring and drafting — closing the loop.

**Architectural risks.**

- **Approval fatigue → rubber-stamping.** If the human reviews a firehose, the gate erodes into a formality. Mitigate by making the human's unit of work *high-leverage* (review intelligence + draft, not raw signals) and by tiering. **Design the approval queue for decision quality, not throughput.**
- **Bottleneck pressure.** A slow gate creates organizational pressure to weaken it. The mitigation is leverage and tiering, not loosening.

**Assumption challenged.** *"Human approval is a step in the pipeline."* It's an *invariant on a boundary*. And it applies to outbound/consequential actions — not to the accumulation of intelligence, which is exactly what should be allowed to run continuously.

---

## 10. Intelligence Repository — the core asset store

**Purpose.** Durably hold the compounding asset: observations, signals, intelligence, and the relationships among them.

**Model: a knowledge graph, not a content database.** Entities (orgs, people, products, topics, projects) + signals + intelligence units + typed relationships. Content is *not* the centre of this store; intelligence is.

**Properties.**

- **Layered immutability.** Observations immutable; signals immutable-record + append-only enrichment; intelligence *versioned* with validity windows.
- **Temporal / point-in-time.** Everything timestamped; supports "what did we believe at time T." This is essential for auditing, for trust, and for never silently rewriting history.
- **Multi-project by construction.** Signals and intelligence are project-agnostic assets; **projects are lenses (saved views + relevance criteria) over the shared graph, not silos.** This is what makes Atlas reusable across The Prompt, GainPilot, Familje-Stunden, and Omnira.

**Alternatives & tradeoffs.**

- *Content DB* vs *knowledge graph.* A content DB makes articles first-class and buries the asset. A graph makes *understanding* first-class. Recommend the graph; **content lives as a derived, linked output referencing intelligence**, stored as a separate concern closer to the publishing surface. Keep the intelligence repository pure.

**Architectural risks.**

- **Entity resolution.** "OpenAI" vs "Open AI" vs "OAI" — same entity, many names. Graph quality lives or dies on this; it is a central, ongoing problem, not a one-time cleanup.
- **Write-only graveyard.** A repository nothing *reads from* is dead weight. Retrieval/activation patterns (how intelligence gets surfaced back into prioritization and projects) are as important as ingestion.
- **Schema rigidity vs graph sprawl.** Too rigid and it can't grow; too loose and it becomes unqueryable. Needs governed evolution.

**Assumption challenged.** *"The repository stores our content."* No — it stores the *asset*. Content is a perishable projection kept elsewhere, linked back to the intelligence that justifies it.

---

## 11. Multi-Project Intelligence Architecture & future Omnira integration

**The shape.** One shared intelligence substrate (Atlas); many project lenses. Each project declares: its domains of interest, its relevance criteria, its output channels, and its approval policy.

- **Atlas** = the intelligence layer (shared, project-agnostic asset).
- **Omnira** = the operating system that *acts on* intelligence — internal orchestration, surfacing, and consequential actions.
- **The Prompt / GainPilot / Familje-Stunden** = product/output surfaces that *consume* intelligence and render content, each behind its own human-approval policy.

**Omnira integration principle.** Intelligence emits not only *content opportunities* but *action opportunities* (internal). The same human-approval invariant applies to consequential actions: Omnira may *propose and prepare*, but a human authorizes anything with an external or material effect.

**Architectural risks.**

- **Relevance leakage / cross-project contamination.** A signal sensitive to one project shouldn't silently surface in another. Even over a shared store you need **project-scoped access and policy**.
- **Premature generalization.** Building the full multi-project orchestration before even The Prompt is proven is a classic trap. **Recommendation: make the *data/asset model* multi-project from day one (cheap now, brutal to retrofit later), but build *operational machinery* for one project first.** Get the asset model right early; let the orchestration start single-project and generalize once proven.

**Assumption challenged.** *"Atlas produces content."* Atlas produces *intelligence*. Content is produced by project surfaces consuming Atlas. Keeping this boundary clean is what lets a second and third project cost a fraction of the first.

---

## 12. Cross-cutting architectural risks (the watchlist)

1. **Confidence laundering** — uncertainty silently lost between layers; most dangerous for a publication's credibility.
2. **False corroboration / echo** — non-independent sources counted as confirmation.
3. **Coverage blind spots** — unknown unknowns mistaken for "nothing happened."
4. **Single-score collapse** — composite scores hiding the impact/confidence distinction.
5. **Taxonomy ossification** — yesterday's categories mis-routing today's world.
6. **Approval fatigue** — the human gate eroding into a rubber stamp.
7. **Write-only repository** — an asset store nothing reads from.
8. **Entity resolution debt** — graph quality degrading silently.
9. **Model drift** — scoring/extraction quality changing under you; mitigated by re-derivation from immutable observations.
10. **Premature multi-project generalization** — abstracting before one project is proven.

---

## 13. Assumptions challenged (summary)

- *"Research → Publish is the system."* → It's a thin downstream slice; the system is the intelligence loop.
- *"More sources/signals = better."* → Independence, coverage, and calibrated confidence beat volume.
- *"We can fix the taxonomy upfront."* → Design for taxonomy evolution and historical re-classification.
- *"One signal score is enough."* → Keep orthogonal axes; compose late and per-use-case.
- *"Validation is one thing."* → Truth-validation (early) and judgment-QA (late) are different layers.
- *"Human approval is a pipeline step."* → It's a structurally enforced invariant on the outbound/consequential boundary, not on intelligence accumulation.
- *"Atlas produces content."* → Atlas produces intelligence; projects render content.
- *"Signals are events."* → Signals are atomic observations; events/clusters form in the intelligence layer.

---

## 14. Open decisions for André (needed before any workflow design)

1. **Signal granularity.** Confirm atomic-observation signals + clustering in the intelligence layer (recommended), vs event-level signals. This shapes everything downstream.
2. **Locus of the approval gate.** Confirm that intelligence accumulation runs autonomously and approval binds only outbound/consequential actions — i.e. the gate is on the boundary, not the brain.
3. **Repository as graph vs store.** Confirm knowledge-graph-with-content-as-derived-output (recommended) vs content-centric store.
4. **Project model.** Confirm "projects as lenses over one substrate" vs per-project stores — the multi-project decision that's expensive to reverse.
5. **Build sequencing.** Confirm "multi-project *data model* now, single-project *machinery* first" so we don't over-build orchestration before The Prompt is proven.

Once these five are settled, the conceptual architecture is validated and we can choose a documentation depth (strategic blueprint / architecture overview / full operational spec) and *then* design the actual workflows on top.

> **Note (v0.2):** Decisions 1–5 above are confirmed. Revision A below adds two layers and reshapes the flow accordingly.

---

# Revision A — Entity & Hypothesis layers (v0.2)

This revision resolves a defect in v0.1: signals connected *directly* to intelligence, which (a) buried the relationship history that is the real long-term asset, and (b) left no home for weak-but-important emerging patterns that don't yet qualify as intelligence. Two first-class layers fix this. Critically, they are **not** additional beads on a linear string — the chain `Observation → Signal → Entity → Hypothesis → Intelligence` mismodels what entities and hypotheses are.

## A.1 The corrected topology

Not a pipeline. A layered model over a shared substrate:

- **Event spine (immutable, append-only):** Observation → Signal. The log of what was seen. *Evidence.*
- **State projection (always-current, versioned):** Entity Graph. A materialized view of the world's state, continuously updated by signals. *What is true.*
- **Sense-making space (probabilistic, evolving):** Hypotheses. Standing claims about the entity graph whose confidence updates as signals arrive as evidence. *What it might mean / where it's going.*
- **Decision layer (curated):** Intelligence. Decision-grade synthesis assembled from confirmed entity-state facts + validated hypotheses. *So what.*
- **Output boundary (gated):** Content / Action, behind mandatory human approval.

```
  OBSERVATION → SIGNAL        (immutable event spine — evidence)
                  │  ┌────────────────┴───────────────┐
            updates│                       evidence for│
                  ▼                                    ▼
          ┌──────────────┐   claims about   ┌──────────────────┐
          │ ENTITY GRAPH │◄─────────────────│   HYPOTHESES     │
          │ state, temporal│ ──────────────►│ evolving confidence│
          └──────┬───────┘  validated writes back └────┬───────┘
        confirmed│ facts                  validated     │ hypotheses
                 └──────────────┬───────────────────────┘
                                ▼
                        ┌───────────────┐
                        │ INTELLIGENCE  │  curated, decision-grade
                        └───────┬───────┘
                                ▼  ── human approval gate ──
                          CONTENT / ACTION
```

A single signal does two things *in parallel*: it updates the entity graph **and** serves as evidence to one or more hypotheses. It does not pass *through* entities to reach hypotheses.

## A.2 Entity Layer

**What it is.** A continuously-updated, temporally-versioned state model of the world: entities (orgs, people, products, models, topics, regulations, markets) and the relationships between them — and, first-class, the *changes* in those relationships over time. This is the v0.1 knowledge graph, promoted to a named layer with explicit temporal modeling.

**The key framing: state projection, not pipeline stage.** Signals are the immutable event log (deltas); the entity graph is the materialized current-state view derived from them. Both persist permanently and in parallel. Because the graph is a projection of preserved signals, it is **re-derivable** — consistent with v0.1's "re-runnable extraction" invariant.

**Why it's the real asset.** The compounding value is the *relationship history* — how the graph of entities evolved over time — not the individual signals. Signals are how the graph is earned; the graph is where value accrues. This is what makes Atlas worth more every month it runs.

**What becomes first-class:** entity nodes, typed relationship edges ("competes with," "acquired," "depends on," "regulates," "employs"), and temporal state-transitions on both.

**Risks this layer concentrates.**
- **Entity resolution becomes load-bearing.** Aliasing, merges, and splits (an entity that forks) can corrupt the whole graph if wrong. This was a v0.1 risk; it is now central.
- **Bitemporal complexity.** Valid-time vs system-time modeling ("what was true" vs "when we learned it") is genuinely hard and must be designed deliberately.
- **Ontology ossification.** Entity/relationship types ossify like taxonomy; requires the same governed-evolution discipline and historical re-typing.
- **Over-modeling.** Building a rich ontology before knowing the questions wastes complexity. Start minimal; let the ontology earn its types.

## A.3 Hypothesis Layer

**What it is.** A space of standing claims about the entity graph, each with a confidence that updates as signals arrive as supporting or contradicting evidence. A hypothesis can **strengthen, weaken, split, merge, be confirmed, or be disproven.** Disproven hypotheses are retained (knowing what was ruled out is intelligence), exactly as contradicted signals are retained.

**Why it's needed.** Many important developments begin as weak signals that don't yet qualify as intelligence. v0.1 gave them nowhere to live. The hypothesis layer is that home — an evidence-accumulating staging ground between raw signal and decision-grade intelligence.

**Redefinition of intelligence.** Intelligence is no longer a direct aggregation of signals. It is the curated decision layer assembled from **(a) confirmed entity-graph facts** and **(b) validated hypotheses.** Refinement to "intelligence = validated hypotheses": purely *factual* intelligence ("X shipped Y") needs no hypothesis lifecycle and lives as confirmed state in the entity graph; the hypothesis lifecycle is for *interpretive and predictive* claims. Intelligence draws from both.

**The coupling that disproves the linear chain.** Hypotheses are claims *about entity relationships* (often predicted edges or state changes). A *validated* hypothesis **writes back into the entity graph as a now-factual edge.** Entity and hypothesis layers feed each other directly — they are not sequential stages.

**Risks this layer concentrates.**
- **Confidence miscalibration.** Updating hypothesis confidence as evidence arrives invites overconfident or arbitrary numbers. The strengthen/weaken logic is where the system can fool itself.
- **Hypothesis sprawl.** Unbounded speculative hypotheses without pruning/merge governance.
- **Confirmation lock-in.** Once a hypothesis exists, signals get read as supporting it. Disconfirming evidence needs deliberate weighting and a clean path to disproval.
- **Generation source (operational, flagged not solved).** Who/what proposes hypotheses — humans, models, or both — is a major downstream design question.

## A.4 Open questions raised by Revision A

Both resolved in Revision B below.

---

# Revision B — Intelligence object & bounded hypotheses (v0.3)

Resolves the two open questions. With this, the conceptual model is validated.

## B.1 Intelligence is a first-class, versioned object

**Decision.** Intelligence is a curated, versioned, decision-grade *artifact* — not merely a dynamic view over the graph. This lets Atlas accumulate durable knowledge, not just regenerate transient summaries.

**An intelligence object carries:**
- **Supporting entities** — the entity-graph nodes/edges it rests on.
- **Supporting hypotheses** — the validated hypotheses it draws from.
- **Supporting signals** — the underlying evidence.
- **Confidence** — calibrated, inherited from its supporting hypotheses and evidence.
- **Validity window** — when this intelligence holds; it can expire.
- **History** — versioned; revisions are new versions, never silent overwrites.

**Critical coherence rules (implications of making it a standing object):**

- **It pins the versions of what it cites.** An intelligence object validated at time *T* references its supporting hypotheses/entities/signals *as they stood at T*. Without version-pinning, "frozen" intelligence would silently drift as its evidence mutates, and its stated confidence would become incoherent. This extends the existing point-in-time invariant to the intelligence layer.
- **Evidence changes trigger review, not auto-mutation.** When a supporting hypothesis later weakens, splits, or is disproven, dependent intelligence is *flagged stale for human review* — never silently rewritten. This preserves the human-gate philosophy and surfaces uncertainty rather than laundering it.
- **Content links to a specific intelligence version.** A published article references the exact intelligence version (and therefore the exact evidence) that justified it at publish time. This makes "what did we believe when we published this" auditable and is the structural defense against confidence laundering.

**Risk introduced.** A standing, accumulating intelligence store can ossify into stale "known truths" that nobody re-examines. The validity window + evidence-change review trigger are the countermeasures; staleness must be an active state, not a silent default.

## B.2 Hypotheses are bounded research questions

**Decision.** Hypotheses are not generated freely. They exist because a project is trying to understand something meaningful. They emerge from **project lenses, strategic questions, active research areas, and ongoing investigations**, and behave as evolving research questions that evidence supports or weakens over time.

**Organizing construct — the research question as container.** The hypothesis space is organized by project-scoped **research questions** (e.g. "Are AI coding platforms consolidating?", "Are frontier model vendors moving toward workflow ownership?", "Is AI search disrupting traditional SEO?"). A lens defines the questions; the questions bound which hypotheses may exist.

**Refinement — question vs hypothesis.** A research *question* is the bounded container; the *hypotheses* are the competing, falsifiable claims under it. "Are coding platforms consolidating?" spawns competing hypotheses — *consolidating* / *fragmenting* / *stable* — each accumulating or shedding evidence. This is precisely where the earlier **split / merge** dynamics live: questions hold the competing answers, and evidence shifts confidence among them.

**Why this bounds the system.** No research question → no hypothesis. Speculation cannot run unbounded because every hypothesis must trace to a project's active inquiry. Generation is demand-driven (by lenses), not supply-driven (by incoming signals).

**Risk introduced.** Bounding by existing questions can blind the system to developments no current question is watching for — the coverage blind-spot risk, re-expressed at the hypothesis layer. Countermeasure: a lightweight path for *unattached strong signals* (high impact, no home question) to prompt a human to open a new research question — surfacing the gap rather than auto-spawning hypotheses.

## B.3 Validation status

The conceptual model is now validated end to end:

```
OBSERVATION → SIGNAL  ──updates──►  ENTITY GRAPH (temporal state, the compounding asset)
                  └────evidence──►  HYPOTHESES (under bounded research questions, per lens)
                                         │ validated → writes back to entity graph
        ENTITY FACTS + VALIDATED HYPOTHESES → INTELLIGENCE (first-class, versioned, pinned)
                                         │ version-linked
                                         ▼  ── mandatory human approval ──
                                   CONTENT / ACTION
```

Confirmed foundations: atomic signals; entity graph and hypothesis space as parallel structures fed by signals; the evolving relationship graph as the long-term compounding asset; intelligence as a durable versioned artifact; hypotheses bounded by project research questions; human approval on the outbound/consequential boundary; projects as lenses over one shared substrate; multi-project data model now, single-project operations first.

**Next phase:** workflow architecture built on top of this validated conceptual model.
