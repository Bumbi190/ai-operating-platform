# Atlas — Workflow Architecture (v0.1)

**Status:** Draft for validation. Operational architecture and system behavior only — no implementation technologies.
**Builds on:** `Atlas_Conceptual_Architecture` v0.3 (validated). Primitives: Observation, Signal, Entity Graph, Hypothesis Space, Intelligence, Content/Action.
**Frame:** Three independent loops, not one pipeline. This document defines each loop *in isolation*. How they interact as a complete operating model is the next phase.

---

## Reading guide

Each loop is specified along nine dimensions: **Purpose · Inputs · Outputs · States · Transitions · Human involvement · Failure modes · Quality controls · Scaling considerations.**

One concept threads all three: **autonomy posture** — how much each loop is allowed to run without a human. This is where the "no autonomous publishing" constraint is operationalized.

- **Loop 1 (Accumulation):** fully autonomous. It only builds understanding; it touches nothing external.
- **Loop 2 (Maturation):** autonomous for sense-making, with *internal* human review for stale knowledge and *optional, non-blocking* curation. Still touches nothing external.
- **Loop 3 (Output):** human-gated and mandatory. The only loop that reaches the outside world, and only through a person.

---

# Loop 1 — The Accumulation Loop

### Purpose
Continuously observe the world and convert observation into structured, scored signals that (a) update the entity graph as evolving state and (b) attach as evidence to active hypotheses. It manufactures the raw and refined asset. **Autonomy posture: fully autonomous** — it produces understanding, never output, so no human sits in its hot path.

### Inputs
- The **source registry** and its **observation channels** (governed entities, domain-scoped trust).
- The current **entity graph** (for entity resolution and context).
- The set of **active research questions / hypotheses** (so signals can be routed as evidence to what's being investigated).
- The **classification taxonomy**, **scoring model**, and **ontology** (all versioned).

### Outputs
- **Observations** — immutable, append-only records of what was seen.
- **Signals** — atomic, classified, multi-axis-scored units, with provenance and lineage.
- **Entity-graph deltas** — new entities, new/changed relationships, entity state transitions (temporal).
- **Evidence links** — signal → hypothesis edges marked supporting or contradicting.
- **Quarantined items** — failed-validation units, retained with a reason.
- **Coverage telemetry** — what was and was not observed, per source/channel/domain.

### States
Two distinct state machines run here.

*Item-level (a unit moving through the loop):*
`Captured → Normalized/Deduped → Extracted → Classified → Scored → Validated → Resolved-to-entities → Linked-as-evidence → Committed`
Branch: any failure → `Quarantined (with reason)`. Ambiguous resolution → `Entity-Resolution-Review`.

*Loop-level (operational health):* `Running → Backpressured → Degraded → Recovering`. Capture must never stop even when downstream is `Backpressured` — the observation store absorbs the lag.

### Transitions
- `Captured → … → Committed` on the happy path; **each step is re-runnable** from the preserved observation, so improved models can re-derive better signals without re-capturing.
- `Validated(fail) → Quarantined` — never silent deletion.
- `Scored/Classified(low-confidence) → Quarantined or Review` per threshold.
- `Resolved(ambiguous) → Entity-Resolution-Review` — below-threshold merges/splits are *never* auto-applied.
- `Committed → (later) Re-extracted` when a model version improves — produces a new signal version from the same observation.

### Human involvement
None in the hot path — by design. Humans operate at the **edges**: governing the source registry (add/rate/retire sources), adjudicating ambiguous entity resolution, evolving the taxonomy/ontology, and reviewing quarantine and coverage patterns. The loop runs without them; they shape its boundaries.

### Failure modes
- **Silent source death** — a channel stops; looks like "nothing is happening." Creates an invisible coverage gap.
- **Echo / false corroboration** — one origin reprinted by many sources counted as independent confirmation.
- **Hallucinated or malformed signals** from extraction.
- **Entity-resolution errors** — wrong merge corrupts the graph; wrong split fragments it. The highest-blast-radius failure in this loop.
- **Misclassification cascades** — a wrong type mis-routes everything downstream.
- **Score miscalibration.**
- **Volume spikes / backpressure** overwhelming extraction.

### Quality controls
- **Provenance mandatory** — no signal without source and lineage.
- **Independence-adjusted corroboration** via the source/lineage graph — defends against echo.
- **Dedup that preserves multiplicity** — collapse the noise, keep the count needed for independence.
- **Coverage monitoring** — per-source liveness; alert on silence rather than assume calm.
- **Confidence thresholds** on extraction, classification, and resolution → below-threshold routed to quarantine/review, never auto-committed.
- **Quarantine-with-reason** — failures are visible and inspectable.
- **Re-runnability / replay** — preserved observations make the whole loop auditable and re-derivable.
- **Versioned models** — every signal is attributable to the model version that produced it.

### Scaling considerations
- Throughput scales with *sources × cadence*; partition the loop by source/domain.
- **Entity resolution is the bottleneck**, not capture — its cost grows with graph size.
- **Capture is decoupled from interpretation** — cheap capture must never block on expensive extraction; the observation store is the buffer.
- Evidence-linking cost grows with *active questions × signal volume* → relevance pre-filtering required.
- Guard the instinct to add sources: independence and coverage beat raw count; more non-independent sources degrade signal quality while raising cost.

---

# Loop 2 — The Maturation Loop

### Purpose
Evolve hypotheses as evidence accumulates, validate matured hypotheses into durable intelligence, and detect when existing intelligence has gone stale. This is the sense-making loop — where signals become understanding and understanding becomes a decision-grade artifact. **Autonomy posture: autonomous sense-making, with internal human review.** It produces and updates *internal* knowledge, so it can run on its own; humans enter only for stale-knowledge review and optional curation. It still touches nothing external.

### Inputs
- **Hypotheses**, organized under project-scoped **research questions**.
- **Evidence links** arriving from Loop 1 (supporting/contradicting signals).
- The **entity graph** (hypotheses are claims about it).
- Existing **intelligence objects** (to detect staleness).
- The **confidence model** and **promotion thresholds** (versioned).

### Outputs
- **Updated hypotheses** — confidence and state changes.
- **Intelligence objects** — first-class, versioned, with pinned supporting entities/hypotheses/signals, confidence, validity window, and history.
- **Stale-intelligence flags** — routed to human review.
- **Entity-graph write-backs** — a validated hypothesis becomes a factual edge.
- **New-research-question prompts** — unattached strong signals surfaced to a human to consider opening an inquiry.

### States
*Hypothesis:* `Open → Accumulating → {Strengthening | Weakening} → {Confirmed | Disproven}`; plus `Split`, `Merged`, `Dormant` (no recent evidence). Disproven hypotheses are **retained**.

*Intelligence:* `Candidate → Validated → [Curated] → Active → Stale → {Revised (new version) | Retired}`.

**Three intelligence tiers (D1 resolved):**
- **Validated Intelligence** — system-driven, threshold-passed. Internal. *Promotion never requires a human.*
- **Curated Intelligence** — optionally human-blessed; **additive, asynchronous, non-blocking** — raises trust/priority but is not a promotion gate.
- **Published Intelligence** — has passed Loop 3's mandatory human gate and become external. Reachable *only* through Loop 3.

This preserves the autonomy of Loops 1 and 2 (Validated + Curated are internal) while keeping the single mandatory human gate in Loop 3 (Published).

### Transitions
- Evidence arrives → recompute hypothesis confidence → cross promotion threshold up → `Confirmed` → assemble `Candidate` intelligence → threshold validation → `Validated` (v1, evidence-pinned).
- Confidence crosses down → `Weakening → Disproven` (retained, never deleted).
- A research question's evidence bifurcates → `Split` into competing hypotheses; convergence → `Merge`.
- New evidence contradicts a confirmed hypothesis backing active intelligence → that intelligence → `Stale` → **human review** → `Revised` (new version) or `Retired`.
- Validated hypothesis → **write-back** to entity graph as a factual edge (itself threshold- and provenance-gated).
- No evidence for a window → hypothesis `Dormant` (ambiguous: settled, or a coverage blind spot — flagged, not assumed).

### Human involvement
- **Stale-intelligence review — mandatory.** A human decides revise vs retire. Internal, not the outbound gate, but non-skippable: intelligence is never silently rewritten.
- **Intelligence curation — optional, asynchronous, non-blocking.** A human can bless a `Validated` object to raise its trust/priority. The loop does **not** block on curation; absence of curation is simply surfaced downstream. *(Open decision — see note below.)*
- **Contested split/merge adjudication** — optional.
- **Opening new research questions** from unattached-signal prompts.
- **Confidence-model calibration** governance.

> **Decision D1 (resolved).** Promotion to *Validated* intelligence is **system-driven**. Human curation is **optional, asynchronous, and additive** — never a promotion requirement. See the three intelligence tiers under *States* above.

### Failure modes
- **Confidence miscalibration** — overconfident promotion ships weak intelligence; underconfident promotion freezes everything as perpetual hypothesis.
- **Confirmation lock-in** — incoming evidence read as supporting an existing hypothesis; disconfirming evidence under-weighted.
- **Stale intelligence not flagged** — a missed evidence dependency leaves a false "known truth" active. The most dangerous failure in this loop.
- **Premature promotion** on thin or echoed evidence.
- **Hypothesis sprawl** — too many sub-hypotheses under one question.
- **Dormancy ambiguity** — silence misread as "settled" when it's a blind spot.
- **Corrupt write-back** — a wrongly-confirmed hypothesis poisons the entity graph.

### Quality controls
- **Calibrated confidence** with explicit support/contradiction accounting, inheriting Loop 1's independence-adjustment.
- **Mandatory disconfirming-evidence tracking** — a hypothesis with no contradiction-search is itself flagged; disproval must have a clean path.
- **Evidence-dependency tracking** — any change to supporting evidence propagates a staleness check (the trigger that protects intelligence integrity).
- **Version-pinning on promotion** — intelligence freezes the versions of everything it cites.
- **Explicit, versioned, auditable promotion thresholds.**
- **Disproven/retired retained**, never deleted.
- **Write-back gated** by confirmation threshold + provenance.
- **No silent rewrite** — stale intelligence changes only through human review.

### Scaling considerations
- Cost scales with *active hypotheses × evidence rate* (confidence recomputation).
- **Staleness detection is the expensive part** — dependency traversal grows with *intelligence count × evidence churn*.
- **Research-question bounding is the scale lever** — capping inquiries caps hypothesis count.
- **Curation must stay optional/async** or it becomes a human-bandwidth bottleneck.
- Split/merge logic complexity grows; governance prevents runaway fragmentation.

---

# Loop 3 — The Output Loop

### Purpose
Turn intelligence into content or action for a specific project and audience, through the mandatory human approval gate. **Autonomy posture: human-gated, mandatory.** This is the only loop that reaches the outside world, and it can do so *only* through a person. It is built around the human, not around throughput.

### Inputs
- **Intelligence objects** (versioned; possibly curated).
- The **project lens** — audience, channel, voice, and approval policy.
- The **supporting evidence** behind the intelligence (for drafting depth and for *informed* approval).
- An **output trigger** — editorial decision, schedule, or intelligence crossing a project-priority threshold.

### Outputs
- **Draft content**, linked to a specific intelligence *version*.
- **QA reports** (fact and judgment).
- **Approval decisions** — approved / rejected / revise-requested.
- **Published content** or **executed action**.
- **Newsletter** — a composed output assembling multiple intelligence objects.
- **Feedback signals** — every human decision and edit captured to improve upstream scoring, drafting, and curation.

### States
`Triggered → Researched → Drafted → QA → Pending-Approval → Approved → {Queued →} Published/Executed`.
Branches: `QA-Failed → Drafted` (rework); `Revise-Requested → Drafted`; `Rejected → Cancelled`.

**Rejection semantics:** a rejected approval transitions to **`Cancelled`**, *not* `Failed`. A rejection is a deliberate human decision and a valuable feedback signal — not an execution error. This distinction is load-bearing: it keeps human judgment out of the error-handling path and preserves rejections as learning data.

### Transitions
- `Triggered → Researched → Drafted → QA`.
- `QA(pass) → Pending-Approval`; `QA(fail) → Drafted` (or to a human if unresolvable).
- `Pending-Approval → Approved` **only** via a human-produced approval state — there is no other path to publish/execute.
- `Approved → Published/Executed`, or `Approved → Queued → Published` if scheduled.
- `Pending-Approval → Cancelled` on rejection (retained, becomes a feedback signal).
- `Pending-Approval → Drafted` on revise-request.
- **Staleness re-check at approval time:** if the supporting intelligence went `Stale` between draft and approval, the unit is blocked and re-routed — never published on stale evidence.

### Human involvement
**Mandatory and central — this loop exists around the approver.**
- **Approval gate** — tiered by consequence (internal brief < public article < newsletter blast), each tier with its own rigor.
- **Informed approval** — the approver sees supporting intelligence, confidence, contradictions, provenance, and current staleness status. Approval without this visibility is rubber-stamping and is designed out.
- **Editorial triggering** — deciding *what* to produce (human or human-configured policy).

### Failure modes
- **Approval fatigue / rubber-stamping** — volume erodes the gate into a formality.
- **Confidence laundering at draft** — uncertain intelligence rendered as confident prose.
- **Publishing stale intelligence** — intelligence goes stale between draft and approval (mitigated by the approval-time re-check).
- **QA theater** — checks that look rigorous but miss judgment errors.
- **Approval bottleneck** — human throughput caps output.
- **Channel/audience mismatch** — wrong lens/voice for the surface.
- **Bypass** — any path to publish not through approval; catastrophic, and must be structurally impossible.

### Quality controls
- **Structural approval invariant** — publish/execute is reachable *only* through a human-produced approval state. "No autonomous publishing" is a property of the state machine, not a policy people remember.
- **Informed-approval surface** — evidence, confidence, contradictions, provenance, staleness presented at the gate.
- **Approval-time staleness re-check** — blocks output resting on now-stale intelligence.
- **Tiered approval** by consequence.
- **Split QA** — fact-QA (truth, checked against pinned evidence) and judgment-QA (brand, fairness, safety).
- **Content pinned to an intelligence version** — full publish-time auditability ("what did we believe when we published this").
- **Rejection = Cancelled** — deliberate decision, captured as feedback, never an error.
- **Queue designed for decision quality, not throughput** — high-leverage review units (intelligence + draft), not raw material.

### Scaling considerations
- **Human approval bandwidth is the system's binding constraint** — it does not scale with compute. Mitigate via tiering, batching, and high-leverage review units.
- **Output must be demand-bounded** (editorial priority), not supply-pushed (every intelligence → content), to protect the gate.
- **More projects/lenses concentrate demand on the same gate** — approval capacity must scale with project count, or projects share/tier approval policy.
- **Newsletter composition** scales with intelligence volume — assembling and curating many objects per issue.

---

---

# Cross-cutting capability — Retrieval & Reactivation

**Verdict: first-class — but a shared *capability*, not a fourth loop.** Retrieval is the faculty by which accumulation becomes *compounding* value rather than a growing archive. Treating it as an implementation detail re-creates the **write-only graveyard** risk named in the conceptual model; naming it first-class makes that risk owned and designed-against.

### Why it is first-class (not incidental)
- **Every loop already secretly depends on it.** Loop 1's entity resolution and evidence-linking, Loop 2's staleness detection and split/merge matching, Loop 3's evidence assembly and newsletter composition — all are retrieval. Left implicit, each loop reinvents matching, producing inconsistency *and* the graveyard.
- **It is the named countermeasure to a risk we already accepted.** The compounding asset (the evolving relationship graph) is worthless if it can't be found and re-activated.
- **It widens, and thereby tightens, the loops we have.** Loop 1's linking step was defined against *active* hypotheses only; retrieval widens it to *all historical structures, including dormant ones* — which closes the open `Dormant` state in Loop 2 (a dormant 2026 hypothesis is exactly what a 2028 signal should reawaken).

### Why a capability, not a loop
A loop owns a state machine and produces an asset. Retrieval owns neither — it produces *connections* that are consumed immediately by whichever loop asked. It has two faces:
- **Passive query** — any loop asks "what existing structures relate to this?"
- **Active reactivation** — an incoming signal is matched against the *entire historical store* and can *wake* dormant structures: reactivate a hypothesis, re-open a research question, or flag stale intelligence for refresh.

The active face participates in Loops 1 and 2 rather than standing apart from them.

### The 2028 → 2026 problem, and what first-class buys
A 2028 signal must find a 2026 entity-relationship, hypothesis, or intelligence object. This is hard for specific reasons, each of which maps to a control:
- **Concept drift** — 2026 vocabulary ≠ 2028 phrasing. Requires *semantic* matching robust to ontology/taxonomy versions — which depends on the re-derivable-index and historical-re-classification commitments already made.
- **Multi-hop relevance** — the 2028 signal may relate only *through* the graph (signal → entity A → relationship → entity B → 2026 hypothesis about B). Requires graph traversal, not surface match. This is *why* the graph substrate matters.
- **Dormancy ≠ death** — dormant structures must remain reactivatable, not archived out of reach.
- **Recall vs precision at scale** — over years the store is vast; matching everything against everything is costly and noisy.

### Cross-lens reactivation (portfolio-level value)
A signal in one project's domain can reawaken intelligence built by another (a GainPilot signal waking a Prompt hypothesis). This portfolio-level compounding is only possible because retrieval is a *shared faculty over the shared substrate* — and it must honor the project-scoped access policy already flagged.

### Inputs / Outputs
- **Inputs:** an incoming signal or an explicit query; the full historical entity graph, hypothesis space, and intelligence store (including dormant/retired, version-aware); the requesting lens.
- **Outputs:** ranked *connections* (entity matches, candidate evidence links, related hypotheses/intelligence); **reactivation events** (wake dormant hypothesis, re-open question, flag intelligence stale); provenance on every reactivation.

### Modes (in place of states)
`Idle → Matching → {Connections returned | Reactivation proposed}`; reactivation below confidence threshold → `Reactivation-Review` (human-surfaced).

### Human involvement
None in passive query. For active reactivation, **low-confidence reactivations are surfaced to a human** (consistent with the rest of the architecture) rather than auto-applied; high-confidence reactivations proceed and are logged with provenance.

### Failure modes
- **Missed reactivation** — the 2028 signal fails to find the 2026 structure; silent, masquerades as novelty. The graveyard failure.
- **False reactivation** — wakes the wrong structure; pollutes a hypothesis with irrelevant evidence (a cousin of confirmation lock-in).
- **Concept-drift blindness** — historical matching degrades as vocabulary/ontology evolves.
- **Reactivation storm** — one signal wakes too much; fan-out overwhelms Loop 2.

### Quality controls
- Semantic + graph-traversal matching, **version- and ontology-aware** so old structures stay findable.
- Reactivation **confidence thresholds**; ambiguity routed to human review, never silently applied.
- **Provenance on reactivation** — "this 2026 hypothesis was reawakened by this 2028 signal" is auditable.
- **Bounded fan-out** to prevent reactivation storms.
- Indexes are **re-derivable** from preserved observations/signals, consistent with the re-runnability invariant.

### Scaling considerations
- Cost grows with *store size × signal rate*; matching needs indexing and relevance cut-offs, not exhaustive comparison.
- Graph-traversal depth is the expensive knob — bound it.
- This capability is what keeps the value curve compounding instead of flattening as the archive grows; under-investing here caps the long-term worth of the whole system.

---

## What comes next

Each loop is defined in isolation, and retrieval/reactivation is established as the cross-cutting faculty they share. The next phase connects them into one Atlas operating model: how the entity graph and hypothesis space are shared state between Loops 1 and 2; how retrieval threads through all three; how intelligence priority triggers Loop 3; how Loop 3's feedback signals re-enter Loop 1; how staleness and reactivation events propagate across loops; and how the whole behaves under one autonomy and governance model across multiple projects.

**Decisions resolved to date:** atomic signals; parallel entity graph + hypothesis space; intelligence as first-class versioned object with pinned evidence; bounded hypotheses under project research questions; three intelligence tiers (Validated / Curated / Published); D1 (system-driven validation, optional additive curation); rejection = Cancelled; retrieval & reactivation as a first-class capability.