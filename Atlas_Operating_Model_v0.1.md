# Atlas — Operating Model (v0.1)

**Status:** Draft for validation. System behavior and operating model only — no implementation technologies.
**Builds on:** `Atlas_Conceptual_Architecture` v0.3 and `Atlas_Workflow_Architecture` v0.1 (both validated). Three loops — Accumulation (L1), Maturation (L2), Output (L3) — plus Retrieval & Reactivation as a shared capability.
**Purpose of this document:** describe how the pieces behave as *one* intelligence platform, and the architectural-integrity properties that hold the system together.

---

## 1. The core operating principle: three clocks over shared state

Atlas is not a pipeline and not a single program. It is **three independently-clocked loops operating over shared state, communicating only through that state and the events it emits.** They never call each other directly.

| Loop | Tempo | Trigger | Autonomy |
|---|---|---|---|
| **L1 Accumulation** | Fast, continuous | Source observation | Fully autonomous |
| **L2 Maturation** | Medium | Evidence change + time | Autonomous + internal review |
| **L3 Output** | Slow, demand-driven | Editorial / priority / schedule | Human-gated (mandatory) |

This tempo mismatch is deliberate and is the foundation of the whole operating model. Accumulation runs fast and unattended; output runs slow and gated. Because L3 **pulls** from settled shared state rather than being **pushed** by L1, "no autonomous publishing" holds *even though accumulation is fully autonomous*. Decoupling is what makes a fully-autonomous front end and a human-gated back end coexist safely.

Three integrity consequences follow immediately:

- **Tempo independence** — each loop runs on its own clock; none waits on another.
- **Failure containment** — a loop can stop without stopping the others (Section 11).
- **Replaceability** — any loop can be redesigned behind the shared-state contract without touching the others.

```
        ┌──────────────── SHARED STATE (the substrate) ────────────────┐
        │  Observation/Signal log · Entity Graph · Hypothesis Space ·  │
        │                     Intelligence Store                       │
        └───────▲───────────────▲───────────────▲────────────▲────────┘
        writes  │ reads/writes  │ reads/writes  │ reads      │
        ┌───────┴──┐      ┌──────┴─────┐    ┌────┴──────┐     │
        │   L1     │─emit→│    L2      │─emit→│   L3    │──┐  │
        │Accumulate│events│  Mature    │events│ Output  │  │  │
        └────┬─────┘      └─────┬──────┘    └────┬──────┘  │  │
             │                  │                │ feedback │  │
             └──────────────────┴── RETRIEVAL ───┴─ events ─┘  │
                       (shared faculty: reads all state)        │
                                                  ── one human gate ──→ world
```

---

## 2. Shared state and its ownership

The substrate is the only thing the loops share. Architectural integrity depends on **clear write-ownership**, even though multiple loops touch the same structures.

| State | Written by | Read by | Ownership rule |
|---|---|---|---|
| Observation / Signal log | L1 | all + retrieval | Immutable, append-only |
| Entity graph | L1 (*observed* edges), L2 (*inferred/validated* edges) | all | Two edge classes, distinguished by provenance |
| Hypothesis space | L2 (state/confidence), L1 (evidence links) | L2, L3, retrieval | L2 owns state; L1 only appends evidence |
| Intelligence store | L2 (internal tiers), L3 (Published tier) | L3, retrieval | L2 owns internal transitions; L3 owns Published |

**Key integrity property — observed vs inferred facts coexist but are labeled.** L1 writes what was *observed*; L2 writes what was *concluded* (validated hypothesis write-backs). They never collide because they write different, provenance-tagged edge classes. The graph always preserves the epistemic distinction between "we saw this" and "we concluded this" — which is what lets a later contradiction be resolved correctly.

**Consistency model — eventually consistent, explicitly timestamped.** L2 may lag L1's latest evidence; L3 may read intelligence that lags the newest signals. This is accepted and made *visible*: every artifact carries an "as-of" time, and L3's approval surface shows freshness. Strong cross-loop consistency would couple the tempos and destroy containment, so the system trades it for explicit, surfaced staleness.

---

## 3. Intelligence lifecycle across loops

A single intelligence object lives across all three loops, but **each transition is owned by exactly one loop:**

```
  L2 ─ Candidate → Validated → [Curated] → Active ───────────────┐
                                   │                              │
  L1 brings new evidence ──────────┘                             │
  L2 ─ Active → Stale → {Revised(new version) | Retired}         │
                                                                 │
  L3 ─ (reads Active/Validated) → Draft → QA → Approve → Published│
```

- **L2 owns** Candidate → Validated → Curated → Stale → Revised/Retired (all internal).
- **L3 owns** the Published transition — the single external, human-gated step.
- The three tiers map cleanly to ownership: **Validated + Curated = L2 (internal, autonomous/additive); Published = L3 (external, gated).**

This clean ownership is the integrity guarantee: there is no transition for which two loops contend, and the only path to "external" runs through L3's gate.

---

## 4. Retrieval interactions across loops

Retrieval is the connective tissue — one faculty, invoked differently by each loop, reading all shared state and writing nothing but reactivation *proposals* (applied by the owning loop):

- **L1 calls retrieval** for entity resolution and to find which existing structures — *including dormant ones* — a new signal bears on. This is where the 2028→2026 reactivation happens.
- **L2 calls retrieval** for staleness dependency lookup and split/merge candidate finding.
- **L3 calls retrieval** to assemble the supporting evidence behind a draft and to compose newsletters from related intelligence.

**Integrity property — retrieval is side-effect-light.** It reads everything, mutates nothing directly. Reactivation is proposed as an event; the owning loop applies it under its own gates. This keeps the one faculty that touches all state from becoming a backdoor that mutates state outside any loop's ownership.

---

## 5. Priority propagation

Priority answers "what matters most" and flows *upward* through the layers, **lens-scoped** throughout:

```
signal scores (impact/urgency/relevance, per lens)
        → hypothesis priority (rises as high-impact evidence accrues under an active question)
        → intelligence priority (inherited from hypotheses + lens relevance)
        → L3 candidate surfacing (priority crosses a per-project threshold)
```

**The integrity boundary that matters most here: priority surfaces candidates; it never triggers output.** High priority moves an item to the *top of the human queue* — it does not move it past the gate. If priority could trigger output, it would become a backdoor to autonomous publishing. Priority propagation therefore *stops* at the boundary; the human starts there.

Priority is never global — the same intelligence can be top-priority for The Prompt and irrelevant to GainPilot. Propagation respects lenses end to end.

---

## 6. Staleness propagation

Staleness is the system's **self-correction signal**, and it flows *backward and outward* from new evidence:

```
new evidence (L1) → hypothesis weakens/disproves (L2)
        → dependent intelligence marked Stale (L2)
        → in-flight L3 outputs on that intelligence blocked / re-routed
        → Published content linked to now-stale version flagged for editorial review
        → retrieval down-ranks stale intelligence so it isn't reactivated as current
```

Two integrity rules govern it:

- **Staleness is a flag that propagates; mutations are human-gated.** The system never silently rewrites intelligence or content. It flags, and a human decides revise vs retire vs correct. This is the same principle as the approval gate, applied to self-correction.
- **Bounded blast radius.** Staleness travels only along evidence-dependency edges, not globally. A corrupted or reversed belief touches only what actually depended on it.

This is also why intelligence pins its evidence versions (Section 3 of the conceptual model): a later reversal triggers a *staleness review* of dependent artifacts rather than retroactively poisoning already-validated ones.

---

## 7. Feedback propagation

Every human decision in L3 — approve, reject (→ Cancelled), edit — and every reactivation outcome re-enters the system as **first-class feedback signals through the same front door as any other signal.**

- Rejections and edits → improve drafting, L2 curation, and scoring calibration.
- Approval patterns → refine priority thresholds and what gets surfaced.
- Reactivation outcomes → tune retrieval thresholds.

**Integrity property — no privileged learning path.** Feedback is subject to the same provenance and validation as external signals; the system learns from its own behavior through the normal front door, not a side channel. And a hard boundary: **feedback tunes scoring, drafting, curation, and retrieval — it never tunes the approval gate itself.** The human gate is not something the system can learn its way around.

---

## 8. Cross-project intelligence sharing

Projects are **lenses over one shared substrate**, not separate systems. This is the operating-model expression of the "projects as lenses" decision.

- **L1 and L2 are shared and project-agnostic.** Accumulation and maturation happen once, for all projects.
- **L3 is per-project.** Each project owns its output channels, voice, approval tiers, and approval policy.
- A signal captured via one project's sources can serve another project's hypotheses (**cross-lens evidence**), and retrieval can wake one project's intelligence from another's signal (**cross-lens reactivation**).

**This is what makes the second and third project cheap.** GainPilot and Familje-Stunden don't get new accumulation or maturation machinery — only a new lens (research questions, relevance criteria) and a new L3 output policy. The expensive substrate is built once.

**Sharing is default-on over the substrate, policy-gated where sensitivity requires** — a project-scoped access policy can restrict specific sources or intelligence to a lens.

---

## 9. Governance boundaries

Authority in the system is partitioned, and the partition is itself an integrity property:

| Domain | Scope | Owner |
|---|---|---|
| Source registry & trust | System-wide | Human governance |
| Ontology / taxonomy | System-wide | Human governance |
| Confidence / promotion thresholds | System-wide, versioned | Human governance |
| Research questions | Per-project | Project lens |
| Approval policy & tiers | Per-project | Project |
| Access policy over shared state | Per-project | Project |

**Integrity property — policy is versioned, and policy changes do not retroactively mutate settled or in-flight artifacts.** An intelligence object or an output in flight runs under the *policy snapshot* in effect when it began; policy changes apply to new work only. This makes runs immutable against mid-flight governance changes, preserves auditability ("under what policy was this decided"), and prevents a policy edit from silently altering work already underway. New behavior is opt-in by version, not retroactive by surprise.

---

## 10. Human touchpoints (the complete map)

Every place a human meets the unified system, classified:

| Touchpoint | Loop | Type | Blocks the system? |
|---|---|---|---|
| Source governance | L1 edge | Governance | No |
| Entity-resolution adjudication | L1 edge | Review | No (queue) |
| Ontology / taxonomy evolution | L1 edge | Governance | No |
| Quarantine / coverage review | L1 edge | Review | No |
| Low-confidence reactivation review | Retrieval | Review | No (queue) |
| Stale-intelligence review | L2 | Review (mandatory, internal) | No (internal only) |
| Intelligence curation | L2 | Additive (optional) | No |
| New-research-question prompt | L2 | Decision | No |
| Confidence-model calibration | L2 | Governance | No |
| **Approval gate** | **L3** | **Mandatory gate** | **Yes — the one true gate** |
| Editorial triggering | L3 | Decision | No |

**The defining integrity statement of the operating model: exactly one mandatory gate stands between the system and the outside world — the L3 approval.** Every other human touchpoint is governance, review, or additive. None is a bypass, and — critically — **none is required for the system to keep learning.** Accumulation and maturation run whether or not a human shows up; only *reaching the world* requires one. This is precisely how full autonomy of intelligence and zero autonomy of publishing coexist.

---

## 11. Failure containment between loops

Because loops are decoupled through shared state and events, failure degrades the system rather than crashing it:

- **L1 down** → no new signals; L2 and L3 keep operating on existing state, which ages (staleness rises and is surfaced). No data loss; the observation store is the buffer for spikes.
- **L2 down** → intelligence stops maturing; L1 keeps accumulating (buffered as evidence); L3 works on last-good intelligence with visibly aging freshness.
- **L3 down** → no output reaches the world; accumulation and maturation continue untouched. No asset is lost — only publishing pauses.
- **Retrieval degraded** → reactivation and evidence-linking weaken (risk of missed connections), but no loop crashes; the failure is reduced recall, surfaced as a health metric, not corruption.

Containment guarantees:

- **No cascade** — one loop's failure cannot crash another; they share state, not control flow.
- **Bounded blast radius** — staleness travels only along dependency edges; reactivation fan-out is bounded; priority is lens-scoped. No local fault goes global.
- **Poison containment** — a wrong entity merge or a wrongly-confirmed hypothesis is contained by provenance labeling (observed vs inferred), quarantine, and the review queues *before* it can reach output. Even the worst upstream corruption cannot auto-publish.
- **Epistemic containment** — evidence-version pinning means a later corruption triggers a staleness *review* of dependents rather than retroactively poisoning validated intelligence.

**The ultimate containment boundary is the L3 gate.** It is not only a quality control — it is the final guarantee that no single-loop failure, however severe, produces unreviewed external output.

---

## 12. The operating model in one paragraph

Atlas runs three independently-clocked loops over one shared substrate, connected by events and a shared retrieval faculty, never by direct calls. Accumulation runs fast and fully autonomous; maturation runs at medium tempo with internal-only human review; output runs slow and is the sole human-gated path to the world. Priority flows upward but stops at the gate; staleness flows backward as a flag whose mutations are human-gated; feedback re-enters through the normal front door and tunes everything except the gate itself. Projects are lenses sharing L1 and L2 while owning their own L3, which is what makes each new project cheap. Governance is partitioned and versioned so policy changes never retroactively rewrite settled work. And exactly one mandatory gate — L3 approval — stands between a fully autonomous intelligence engine and the outside world, which is how Atlas accumulates and reactivates compounding intelligence continuously while never publishing autonomously.

---

## What comes next

The conceptual architecture, the three loops, the retrieval faculty, and now the unified operating model are defined. Remaining design questions are operational-readiness rather than architecture: documentation depth for handoff, the multi-project rollout sequence (substrate + The Prompt first), and eventually — only when the model is to be built — mapping these tool-agnostic components to concrete technology. None of that changes the architecture; it instantiates it.