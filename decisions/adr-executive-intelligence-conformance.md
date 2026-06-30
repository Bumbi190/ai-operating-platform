# ADR — Executive Intelligence: Conformance & Implementation Mapping

**Status:** Accepted · governs all Executive Intelligence implementation work
**Date:** 2026-06-29
**Owner:** André Hultgren
**Authoritative spec:** [`docs/architecture/ATLAS_EXECUTIVE_INTELLIGENCE.md`](../docs/architecture/ATLAS_EXECUTIVE_INTELLIGENCE.md) — **v1.0 (Canonical), frozen**
**Supersedes (as architectural authority, not as code):** the architecture role of `OMNIRA_ATLAS_INTELLIGENCE_ADR.md` and `OMNIRA_ATLAS_INTELLIGENCE_TAXONOMY.md`. Those remain valid descriptions of the *current implementation* and its near-term taxonomy; they are no longer the architectural definition.

---

## 1. Context

Two artifacts describe overlapping territory:

- **The canonical specification** (`ATLAS_EXECUTIVE_INTELLIGENCE.md`, v1.0) — the cognitive architecture of Executive Intelligence (EI). Frozen.
- **The existing implementation** (`apps/web/lib/atlas/intelligence/**` plus the legacy `apps/web/lib/atlas/executive.ts`) — a real, partly-built "Atlas Intelligence layer" that predates the canonical spec.

The two assign several of the same nouns (`brief`, `recommendation`, `risk`, `opportunity`, `outcome`, `experience`) to different layers, and they use the term *"Intelligence Object"* on opposite sides of the EI boundary. Beginning implementation without resolving this would bake the ambiguity into every increment.

## 2. Decision

1. **The canonical specification is the long-term architectural authority.** Implementation evolves toward it. The specification is never reshaped to fit existing code.
2. **`lib/atlas/intelligence` is the *current implementation*, not the architectural definition.** It is treated as a partial, in-progress realization of EI to be migrated, not as a competing design.
3. **The canonical spec stays frozen at v1.0.** This ADR is the bridge: it records how today's code maps onto the canonical architecture, where it conforms, where it diverges, and the sequence by which it converges. Reconciliation lives here and in the taxonomy's evolution — **not** in edits to the frozen spec.
4. **When this ADR and the code disagree with the spec, the spec wins** and the disagreement is logged in §6 (Gaps) as work, not as a spec change.

This ADR has **no authority to alter the canonical architecture.** If convergence ever appears to require changing a canonical *principle* (not just code), that halts implementation and is raised as a spec-versioning decision per the canonical doc's own governance rule — it is not resolved here.

## 3. Authority & precedence rules

For anyone implementing EI:

- **Vocabulary:** canonical terms (cognitive artifact, Executive Brief, Deviation & Significance, Attention, blocking/enriching, referential statelessness) are authoritative in all new design discussion. Legacy code identifiers (`IntelligenceObject`, per-kind producers) keep their names until a migration increment renames them; this ADR provides the mapping in the meantime (§5).
- **Boundaries:** the hard boundaries are with Memory, Manager, Knowledge Acquisition, and Voice (canonical §3, §12). Internal subdivisions of EI — the seven operations (§4) and the per-kind producers — are *soft* and must not be hardened into cross-network service boundaries (canonical §4 warning).
- **Principles are gates, not aspirations:** every increment is checked against P1–P6 before it lands (§7). An increment that violates a principle does not ship; the conflict is reported.

## 4. What already conforms (and it is a lot)

The existing intelligence layer is, in spirit, a strong partial implementation of the canonical architecture. This is the reason "evolve the code" is cheaper than "rebuild":

| Canonical principle / section | Existing implementation evidence | Verdict |
|---|---|---|
| **P2 referential statelessness** (§2) | Producers (`buildBrief`, etc.) are pure, deterministic, no DB/clock/I/O; all inputs passed by the orchestrator shell; "same input → same output." | **Conforms.** This is exactly the stateless-engine / stateful-shell split. |
| **P4 provenance** (§8.3) | Every `IntelligenceObject` carries an `evidence: EvidenceChain`; assessments must reference a factual object or the producer emits nothing. | **Conforms.** |
| **§8.4 track record / decision ledger** | `producedBy` + `version` stamped on every object; append-only with `supersede`. | **Partial** — identity & versioning present; the prediction→disposition→outcome loop is not yet owned as specified (see §6, G4). |
| **§6 Context Framing (boundary, not cognition)** | `retrieval.ts` is read-only; "writes do NOT belong here"; consumers read through one door; producers never read from consumers. | **Conforms in shape**; scope is currently fixed signal-kind lists rather than intent-expressed scope (§6, G6). |
| **Memory boundary** (§3) | Storage-agnostic `IntelligenceStore`; nothing else touches `atlas_intelligence`. | **Conforms.** |
| **P3 reasoned artifacts, never raw data** (§3) | Intelligence is a separate domain from `atlas_signals` ("what does it mean?" vs "what happened?"). | **Conforms.** |
| **§9 Deviation & Significance** | `risk` and `opportunity` are "valence-mirrored," evidence-gated, with confidence vs likelihood separated. | **Partial** — implemented as *two* producers, not one signed operation (§6, G3). |

The existing taxonomy even states that "reasoning is an Executive Intelligence *capability* (a process), not a stored object" — the code already concedes EI as the governing process. Convergence is therefore mostly **naming, boundary-tightening, and filling gaps**, not redesign.

## 5. Vocabulary reconciliation (the term collision, resolved)

The blocking ambiguity was *"Intelligence Object"* meaning two things. Resolution, at the implementation level only (spec unchanged):

**Direction of the boundary.** The canonical spec lists "Intelligence Objects" among EI's **inputs** (existing capability, out of scope). The code uses `IntelligenceObject` as a **produced artifact**. Both can be true because the *type* `IntelligenceObject` is a transport shape, and what matters is the **kind** and which side of EI it sits on. This ADR fixes that per kind:

| Code `IntelligenceKind` | Canonical role | Canonical ref |
|---|---|---|
| `brief` (situational "what is the state") | **Input substrate** — a meaning-making product EI *consumes* | input "structured knowledge / intelligence objects" |
| `trend` | **Input substrate** | input |
| `insight` | **Input substrate** (an Understanding product) | input |
| `entity_profile`, `goal_status` | **Input substrate** (standing context) | input; goals feed §7 Goal Arbitration |
| `risk` | **EI output** — Deviation & Significance, negative sign | §9, §14 |
| `opportunity` | **EI output** — Deviation & Significance, positive sign | §9, §14 |
| `recommendation` | **EI output** | §11, §14 |
| `executive_brief` | **EI output** — Executive Brief | §13, §14 |
| `outcome` | **Decision-ledger field**, authored outside EI (Manager/KA), persisted by Memory | §8.4 |
| `experience` | **Memory** belief derived from `outcome`; not an EI output | §8.4; Memory layer |
| *(none yet)* `attention_request` | **EI output** — Attention | §10, §14 — **gap** |
| *(none yet)* `delegation_request`, `knowledge_request` | **EI output** — Delegation (knowledge tagged blocking/enriching) | §12, §14 — **gap** |
| *(none — intentionally)* hypothesis | **EI working product**, externalized to Memory only when it must survive a cycle | §8.1 — **gap** |

**Rulings:**
- The lower-tier `brief`/`trend`/`insight` kinds are the *"Intelligence Objects" inputs* of the canonical spec. They are **not** the canonical **Executive Brief** — that is `executive_brief` (apex). This removes the "briefs are both input and output" contradiction: situational `brief` is input; `executive_brief` is output.
- Where one producer consumes another producer's object (e.g. a risk producer reading a `trend`), the consumed object is an **EI-internal working input**, not a re-entry of EI's own final output. EI consuming its own *final* artifacts (canonical §14 integrity test) remains forbidden; consuming lower-tier intermediates within one reasoning pass is the normal functional-core composition.
- A future increment may rename the code type from `IntelligenceObject` to `CognitiveArtifact` (and split input vs output unions). This is a **migration step**, not a prerequisite; until then, this table is the authority on which side of EI each kind sits.

## 6. Conformance gaps (work, not spec changes)

Each gap is a divergence the *implementation* must close to reach the canonical architecture. None justifies editing the spec.

- **G1 — Legacy `executive.ts` violates P1/P6.** It calls `createAdminClient()` and pulls from six services directly; it is unversioned and not evidence-linked (its own ADR admits this). It currently powers the Atlas page (`app/(platform)/atlas/page.tsx`), while the conformant producers are dormant. → Retire it behind the conformant path (§8, Increment 4).
- **G2 — The conformant layer is unwired.** Producers/orchestrators exist but no route/cron consumes them. → Wire one end-to-end slice first (§8, Increment 1).
- **G3 — Risk/opportunity are two producers, not one signed operation.** Canonical §9 unifies them into Deviation & Significance emitting *signed* findings. → Converge the two producers behind one operation that emits signed findings; the `risk`/`opportunity` kinds may remain as the persisted projection (§8, Increment 3).
- **G4 — Decision ledger ownership is not yet as specified.** Canonical §8.4: EI authors only the *prediction*; *disposition* is authored by Voice/Manager; *outcome* is reported by Manager/KA; Memory persists all three; EI never records outcomes. Current code places `outcome`/`experience` inside `atlas_intelligence`. → Define ledger field ownership and the outcome-reporting path before leaning on calibration (§8, Increment 5).
- **G5 — No Attention layer.** Canonical §10 (two-stage triage→salience, cognitive-load budget owned outside EI, blocking/enriching) has no implementation. The budget's consumption/signals/size must come from Memory + Voice + config, never be held or observed by EI (§10.3). → New capability (§8, Increment 2 for triage gate; Increment 6 for full salience + budget).
- **G6 — Context Framing expresses fixed scope, not intent.** Orchestrators load hard-coded signal-kind lists. Canonical §6 wants EI to state context *shape/intent*, with Memory/Retrieval selecting. → Tighten when wiring (§8, Increment 1), non-blocking.
- **G7 — No Knowledge/Delegation request artifacts.** Canonical §12 (requests routed through Manager; knowledge tagged blocking/enriching; delegation attached to the recommendation, EI never waits in the loop). → New capability (§8, Increment 7).
- **G8 — No externalized-hypothesis path.** Canonical §8.1. Low priority until a cross-cycle hypothesis is actually needed (YAGNI), but it must land before any "standing concern" feature (§10.3) is built.

## 7. Per-increment principle gate (mandatory for every change)

Before any EI increment lands, it is checked against all six principles. The increment ships only if every answer is "yes":

- **P1** — Does EI only think here? (No collecting, no executing, no remembering inside the cognitive core.)
- **P2** — Is the cognitive core referentially stateless? (Inputs in, artifacts out; no retained state; the shell, not the core, does I/O.)
- **P3** — Are outputs reasoned artifacts, never raw data?
- **P4** — Does every output carry its evidence/provenance (and, for recommendations, a defeater)?
- **P5** — Does it reduce, not add, cognitive load? (Counterfactual/do-nothing respected; attention budget honored.)
- **P6** — Does the core invoke zero external tools/APIs/services directly? (All external interaction via Memory/Manager/KA/Voice boundaries.)

This gate is the standing definition of done for EI work, and it is the place a conflict surfaces. A "no" stops the increment and is reported, per the canonical governance rule.

## 8. Incremental migration sequence

Ordered to deliver a conformant end-to-end slice first, then widen — never a big-bang rewrite. Each increment names the canonical section(s) it implements and is gated by §7. **No code is written for an increment until its design is confirmed.**

1. **Wire one conformant slice end-to-end** — orchestrator (shell) → pure brief producer (core) → `IntelligenceStore` → one read surface. Implements §2, §5 (cycle skeleton), §6 (Context Framing boundary), §13 partial. Proves the stateless-core/stateful-shell path in production without touching the legacy page.
2. **Triage gate** — the cheap early attention filter that protects the reasoning budget. Implements §5 (triage), §10.1. Establishes that attention filtering happens *before* expensive reasoning, not after.
3. **Deviation & Significance** — unify risk + opportunity into one signed operation. Implements §9. Closes G3.
4. **Retire legacy `executive.ts`** — repoint the Atlas page at the conformant executive-brief path; delete or quarantine the direct-fetch summary. Closes G1; restores P1/P6 on the live surface.
5. **Decision ledger ownership** — prediction (EI) / disposition (Voice·Manager) / outcome (Manager·KA) / persistence (Memory). Implements §8.4. Closes G4; unlocks honest calibration (§8.2, with the R5 thin-history caveat).
6. **Full Attention model** — two-stage salience ranking + cognitive-load budget sourced from Memory/Voice/config. Implements §10.2–§10.4. Closes G5.
7. **Delegation & Knowledge requests** — request artifacts routed through Manager; knowledge tagged blocking/enriching; delegation attached to recommendations, no waiting. Implements §11.3, §12. Closes G7.
8. **Vocabulary migration (optional, late)** — rename `IntelligenceObject` → `CognitiveArtifact`, split input vs output unions. Cosmetic-but-clarifying; deferred so it never blocks behavior work.

Sequencing rationale: 1 establishes the spine; 2–3 make the spine conformant in cognition; 4 makes the *live* surface conformant; 5 closes the learning loop; 6–7 add the remaining canonical capabilities; 8 cleans vocabulary once behavior is settled.

## 9. Consequences

- **Positive:** the live system moves to a principled footing incrementally, with a working slice early; the strong existing producers are reused, not discarded; the frozen spec stays the stable reference a decade of work can lean on.
- **Cost:** EI temporarily runs two vocabularies (canonical vs legacy code identifiers) until Increment 8; this ADR's §5 table is the bridge that makes that survivable.
- **Risk:** scope creep during any increment re-importing the conflated layer model. Mitigation: the §7 gate and the §5 input/output table are checked on every PR.

## 10. Open items

- **O1** — Exact ownership of the `disposition` field in the ledger (Voice vs Manager) follows canonical open question Q6 (recommendation authority gradient). Resolve before Increment 5.
- **O2** — Whether `experience` (Memory belief) and `outcome` (ledger field) remain in `atlas_intelligence` transitionally or move at Increment 5. Decide at Increment 5 design time.
- **O3** — Multi-user attention (canonical §15 note: budget is per-person, tenants may have teams) is out of scope until Increment 6 design.

---

*This ADR governs implementation only. The architecture is defined solely by `ATLAS_EXECUTIVE_INTELLIGENCE.md` v1.0. If implementation cannot proceed without changing a canonical principle, stop and raise a spec-versioning decision — do not resolve it here.*
