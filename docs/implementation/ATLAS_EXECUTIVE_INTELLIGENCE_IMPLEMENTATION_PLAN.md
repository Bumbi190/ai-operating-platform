# Atlas Executive Intelligence — Implementation Plan

> **Status:** Active · living document
> **Version:** 1.0
> **Date:** 2026-06-29
> **Author:** Lead Software Architect
> **Authoritative spec:** `docs/architecture/ATLAS_EXECUTIVE_INTELLIGENCE.md` — v1.0 (Canonical), frozen
> **Governing ADR:** `decisions/adr-executive-intelligence-conformance.md`
>
> This document is the official implementation roadmap for Executive Intelligence (EI). It exists downstream of the canonical architecture and the conformance ADR. It never overrides either. When this plan and the canonical spec appear to conflict, the spec wins; halt and report.

---

## 0. How to read this document

**Part I** records the results of the codebase conformance analysis — which code already conforms, which must be refactored, which must be replaced, and which must remain untouched.

**Part II** contains the Epic roadmap: eight independently mergeable increments that converge the codebase toward the canonical architecture without a big-bang rewrite.

Every epic is a unit of work small enough to be reviewed, merged, and rolled back independently. No epic requires another to be deployed before it ships, except where an explicit dependency is stated. The sequence is an ordering recommendation, not a hard constraint — with the exception of Epic 4 (which must follow Epics 1–3) and the ordering enforced by data-model dependencies.

**Principle gate.** Every epic, before it merges, is checked against all six principles (P1–P6) per ADR §7. A "no" on any gate stops the epic; it does not relax the principle.

---

## Part I — Codebase Conformance Analysis

### 1.1 Files under evaluation

```
apps/web/lib/atlas/executive.ts                    ← LEGACY
apps/web/lib/atlas/intelligence/types.ts
apps/web/lib/atlas/intelligence/store.ts
apps/web/lib/atlas/intelligence/retrieval.ts
apps/web/lib/atlas/intelligence/postgres-store.ts
apps/web/lib/atlas/intelligence/producers/
  brief-producer.ts
  brief-orchestrator.ts
  trend-producer.ts
  trend-orchestrator.ts
  insight-producer.ts
  insight-orchestrator.ts
  risk-producer.ts
  opportunity-producer.ts
  assessment.ts
  assessment-orchestrator.ts
apps/web/app/(platform)/atlas/page.tsx             ← LIVE SURFACE
apps/web/supabase/migrations/20260629_120000_atlas_intelligence.sql
apps/web/supabase/migrations/20260629_120100_atlas_entities.sql
```

### 1.2 Conformance verdict by file

#### ✅ CONFORMS — no changes required

| File | Why it conforms | Canonical ref |
|---|---|---|
| `intelligence/types.ts` | Storage-agnostic domain contracts. `IntelligenceObject`, `EvidenceChain`, `Finding`, `Confidence` are the right abstractions. P4 is baked in: every object carries `evidence`. `IntelligenceKind` includes `executive_brief`, `recommendation`, `risk`, `opportunity`, `attention_request` (reserved). | §14 |
| `intelligence/store.ts` | `IntelligenceStore` interface is the sole Memory boundary for EI outputs. Append-only by convention; `supersede` rather than delete. | §2, §3, P2 |
| `intelligence/postgres-store.ts` | Pure infrastructure. No producer or consumer logic. The `createIntelligenceStore` factory is the swap point for a future graph backend. `createAdminClient()` is correct here — this is Memory's infrastructure, not EI reaching out. | §3, P6 |
| `intelligence/retrieval.ts` | Read-only; the single consumer door. Lazy store initialization with a test-seam override (`__setIntelligenceStore`). Scope is correct: EI never reads here — consumers do. | §6 |
| `intelligence/producers/assessment.ts` | Shared pure helpers. `hasFactualGrounding`, `propagateConfidence`, `sortById`, `metricImportance`, `horizonFromMagnitude` are all deterministic, no I/O. | §8.3, §9 |
| `intelligence/producers/brief-producer.ts` | Functional core: `buildBrief` is pure and synchronous. Evidence chain complete (one entry per signal + per memory item). Confidence formula is deterministic. P2 conforms: zero retained state. | §2, §4, §13, P2, P3, P4 |
| `intelligence/producers/trend-producer.ts` | `buildTrend` is pure; least-squares regression inline; confidence derived deterministically from R², point count, significance, and prior intelligence. No I/O, no LLM. | §8.1, P2, P3, P4 |
| `intelligence/producers/insight-producer.ts` | `buildInsight` is pure; pattern detection (acceleration/deceleration/divergence/plateau) is deterministic; confidence propagated from source objects per spec §8.2. | §8.1, §8.2, P3, P4 |
| `intelligence/producers/risk-producer.ts` | `buildRisk` is pure; factual-evidence invariant enforced (returns `null` with no factual driver); `likelihood` and `confidence` kept strictly independent. | §9, P3, P4 |
| `intelligence/producers/opportunity-producer.ts` | `buildOpportunity` mirrors risk producer; positive-valence signed finding; factual-evidence invariant enforced. | §9, P3, P4 |
| `20260629_120000_atlas_intelligence.sql` | Table structure, RLS, and indexes match `IntelligenceStore` contract. Append-only enforced by convention. `superseded_by` FK enables track record. | §8.4, §14 |
| `20260629_120100_atlas_entities.sql` | Canonical entity registry with stable natural key `(kind, key)`. Matches `Entity` / `EntityRef` contracts. | §14 |

#### ⚠️ PARTIAL CONFORMANCE — needs targeted refactoring

| File | What is partial | Gap ref | Increment |
|---|---|---|---|
| `intelligence/producers/brief-orchestrator.ts` | Conformant architecture (shell/core split), but: (a) signal-kind lists are hard-coded rather than intent-expressed scope, and (b) not wired to any cron or API route — dead code in production. | G2, G6 | Epic 1 |
| `intelligence/producers/trend-orchestrator.ts` | Same shell/core split pattern; not wired. Series extraction (pulling numeric values from signals) is hard-coded per signal kind rather than schema-driven. | G2, G6 | Epic 1 |
| `intelligence/producers/insight-orchestrator.ts` | Not wired; otherwise conformant. | G2 | Epic 1 |
| `intelligence/producers/assessment-orchestrator.ts` | Not wired; runs both `runRiskProducer` and `runOpportunityProducer` as independent calls. Canonical §9 wants a single signed operation, not two separate producers. | G2, G3 | Epics 1, 3 |
| `intelligence/types.ts` | `IntelligenceKind` reserves `attention_request`, `delegation_request`, `knowledge_request` but they have no producer or body type. `outcome` and `experience` kinds exist but decision-ledger field ownership is not enforced. | G4, G5, G7 | Epics 5, 6, 7 |

#### ❌ NON-CONFORMANT — must be replaced or retired

| File | Violation | Gap ref | Increment |
|---|---|---|---|
| `lib/atlas/executive.ts` | Violates P1 (collects its own data), P6 (calls `createAdminClient()` and six downstream services directly), P2 (no evidence chain, no provenance), P4 (outputs are raw strings, not reasoned artifacts with traces). Currently powers the live Atlas page. | G1 | Epic 4 |

#### 🔒 UNTOUCHED — out of EI scope, do not modify

| Path | Reason |
|---|---|
| `lib/atlas/context.ts` | Context Brain / Manager-side context gathering. |
| `lib/atlas/signals.ts` | Signal layer boundary. EI reads signals only via orchestrators. |
| `lib/atlas/collectors/` | Knowledge Acquisition. EI never touches collectors. |
| `lib/atlas/memory/` | Memory layer. EI reads memory through injected `memoryRecall`, never directly. |
| `app/(platform)/atlas/` (all except `page.tsx`) | Voice / UX surfaces. EI does not own delivery. |
| `supabase/migrations/` (all existing) | Applied to production; retroactive edits forbidden. |

### 1.3 Gap inventory (canonical reference)

| Gap ID | Description | Severity | Increment |
|---|---|---|---|
| G1 | `executive.ts` violates P1, P2, P4, P6 and powers the live surface | Critical | Epic 4 |
| G2 | All conformant producers/orchestrators are unwired — dead code in production | High | Epic 1 |
| G3 | Risk and opportunity are two separate producers; canonical §9 requires one signed Deviation & Significance operation | Medium | Epic 3 |
| G4 | Decision-ledger field ownership unspecified; `outcome`/`experience` persist in `atlas_intelligence` without defined authorship chain | Medium | Epic 5 |
| G5 | No Attention layer: neither the triage gate (§5) nor full salience ranking and cognitive-load budget (§10) exist | High | Epics 2, 6 |
| G6 | Context Framing uses hard-coded signal-kind lists; canonical §6 wants EI to state intent-level scope that Memory fills | Low | Epic 1 (partial) |
| G7 | No Knowledge Request or Delegation Request artifacts; EI cannot express knowledge gaps or proposed delegations | Medium | Epic 7 |
| G8 | No externalized-hypothesis path; standing concerns cannot survive across cycles | Low | Epic 7 (deferred) |

### 1.4 Structural assessment summary

The existing `lib/atlas/intelligence/` layer is a **strong partial implementation** of the canonical architecture. The core design choices — functional cores with pure producers, imperative orchestrator shells that own all I/O, a single IntelligenceStore boundary, an append-only track record, complete evidence chains — are all correct and must be preserved. The work ahead is:

1. **Wiring** (G2): connect the dormant producers to live cron/API routes.
2. **Gap-closing** (G3–G8): add the missing capabilities the spec demands.
3. **Replacement** (G1): retire `executive.ts` once the conformant path is live.

No big-bang rewrite. No redesign. Converge incrementally.

---

## Part II — Implementation Roadmap

### Epic sequencing overview

```
Epic 1 — Wire conformant slice end-to-end          [establishes the spine]
Epic 2 — Triage gate                               [protects reasoning budget]
Epic 3 — Deviation & Significance                  [unifies risk/opportunity]
  ↓ all three above should be live before Epic 4
Epic 4 — Retire legacy executive.ts               [live surface goes conformant]
Epic 5 — Decision ledger ownership                [closes the learning loop]
Epic 6 — Full Attention model                     [salience + budget]
Epic 7 — Delegation & Knowledge requests          [Manager boundary complete]
Epic 8 — Vocabulary migration (optional, late)    [cosmetic; never blocks behavior]
```

---

## Epic 1 — Wire One Conformant Slice End-to-End

### Goal

Prove the stateless-core / stateful-shell split in production by connecting the existing brief producer through a cron-triggered API route to `IntelligenceStore`, and exposing the resulting objects on a read surface that is distinct from the live Atlas page. No behavior change to the live Atlas page. No changes to `executive.ts`.

This epic creates the canonical EI pipeline's spine. Every subsequent epic adds to this spine rather than replacing it.

### Scope

- New API route: `POST /api/atlas/intelligence/cron/brief`
- New API route: `GET /api/atlas/intelligence/brief` (internal read surface)
- Wire `runBriefProducer` (global scope, and per-project for active projects) to the cron route
- Wire `runTrendProducer` → `runInsightProducer` in sequence as the second and third steps of the same cron run
- Context Framing tightening: replace hard-coded signal-kind lists with a `ContextRequest` type that expresses *intent* rather than exact kind names; Memory/signals layer resolves to actual kinds (partial G6 fix)
- Supabase `pg_cron` entry: run the brief cron daily at 06:00 UTC
- One migration: register the cron job
- Verify that `atlas_intelligence` table and `atlas_entities` table are applied to the target project (they are, per the existing migrations)

### Files affected

**New files**
```
apps/web/app/api/atlas/intelligence/cron/brief/route.ts
apps/web/app/api/atlas/intelligence/brief/route.ts
apps/web/lib/atlas/intelligence/context-request.ts
supabase/migrations/YYYYMMDD_atlas_intelligence_cron.sql
```

**Modified files**
```
apps/web/lib/atlas/intelligence/producers/brief-orchestrator.ts
  — accept ContextRequest in addition to the current hard-coded kind lists
apps/web/lib/atlas/intelligence/producers/trend-orchestrator.ts
  — same; also fix the series extraction to be metric-driven, not kind-driven
apps/web/lib/atlas/intelligence/producers/insight-orchestrator.ts
  — not modified in logic; added to the cron invocation chain
```

**Untouched**
```
apps/web/lib/atlas/executive.ts        — not touched in this epic
apps/web/app/(platform)/atlas/page.tsx — not touched in this epic
```

### Architectural sections implemented

- §2 (referential statelessness): the running slice proves it
- §3 (position): establishes the Memory → EI → Memory write cycle
- §5 (cognitive cycle): implements the "Trigger → Context Framing → Core → Emit → Persist" path for briefs/trends/insights; triage gate is absent (added in Epic 2)
- §6 (Context Framing boundary): partial; intent-level context request introduced
- §13 (Executive Briefing): partial; `brief` kind (situational, input-tier) is produced, not yet the apex `executive_brief`

### `ContextRequest` design

The existing orchestrators load signals with explicit `PROJECT_SIGNAL_KINDS` / `GLOBAL_SIGNAL_KINDS` arrays. This is an early-phase design decision that works but violates the canonical §6 boundary: EI should state *intent*, not select specific data.

Introduce a thin `ContextRequest` type:

```typescript
// lib/atlas/intelligence/context-request.ts
export interface ContextRequest {
  scope: 'project' | 'global'
  projectId?: string | null
  /** Intent labels, not signal kinds. Retrieval resolves these to actual queries. */
  intents: ('revenue' | 'audience' | 'content_performance' | 'agent_activity')[]
  window: { since: string; until: string }
}
```

A `resolveContextRequest(req: ContextRequest): SignalQuery[]` function lives in the *orchestrator* (the shell, not the producer core), mapping intents to the actual signal kinds the signals layer understands. The producer core never sees signal kinds — it sees pre-loaded `SignalRecord[]`. This keeps the producer testable without needing to know the signal schema.

This does not fully close G6 (which requires Memory itself to resolve the intent) but it removes the hard-coded kind lists from the producer core, which is the more important boundary to protect.

### Cron API route design

```
POST /api/atlas/intelligence/cron/brief
  — protected by the omnira-cron shared secret (matches existing pattern)
  — runs: runBriefProducer (global) → runTrendProducer (per metric) → runInsightProducer
  — no LLM calls; entirely deterministic
  — idempotent: producing a new brief does not break old ones (append-only)
  — returns: { produced: string[], errors: string[] }
```

The cron route follows the existing pattern in `/api/media/cron/*` and `/api/business/cron/*`: it calls the omnira_cron helper and is invoked by `pg_cron` via `call_vercel`.

### Migration content

```sql
-- Register the Atlas Intelligence daily brief cron
select cron.schedule(
  'omnira_atlas_intelligence_brief',
  '0 6 * * *',
  $$select omnira_cron.call_vercel('/api/atlas/intelligence/cron/brief');$$
);
```

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `atlas_intelligence` migration not yet applied to production project | Low (migration files exist) | Verify via `supabase db push` / remote table check before wiring; add guard that logs and exits cleanly if table is absent |
| Brief cron runs before prior signals exist (cold start) | Medium | `buildBrief` already handles zero-signal case gracefully (emits a low-confidence brief); no guard needed, but add structured log |
| `pg_cron` cron name collision | Low | Use namespace prefix `omnira_atlas_intelligence_*`; check `cron.job` before scheduling in migration |

### Dependencies

- `atlas_intelligence` and `atlas_entities` migrations applied to target project ✅ (files confirmed)
- `querySignals` API stable and tested ✅
- `omnira_cron.call_vercel` helper exists ✅

### Test strategy

**Unit tests (no DB, no I/O)**
- `buildBrief` already designed to be pure; add test matrix:
  - zero signals → low-confidence brief with "no signals" summary
  - one signal per kind → expected findings and evidence chain
  - all three kinds → confidence formula verification
  - with memory enrichment → memory evidence present, confidence bump

**Integration test (against local Supabase)**
- `runBriefProducer({ projectId: null })` → verifies end-to-end store write
- `queryIntelligence({ kinds: ['brief'] })` returns the produced object
- `supersede` path: run producer twice; first object has `supersededBy` set

**Smoke test (staging)**
- Trigger cron route manually with `curl -X POST ... -H "Authorization: Bearer $CRON_SECRET"`
- Verify row appears in `atlas_intelligence` via SQL
- Verify the internal read route returns it

**Principle gate (required before merge)**
- P1: No I/O in `buildBrief`, `buildTrend`, `buildInsight` ✅
- P2: Producers are pure functions; orchestrators own all I/O ✅
- P3: Outputs are `IntelligenceObject`s (interpreted), not raw signal rows ✅
- P4: Every object carries `evidence` with one entry per consumed source ✅
- P5: No user-visible change; no attention surface in this epic ✅
- P6: No external service calls inside producers; orchestrators call only `querySignals` and `IntelligenceStore` ✅

### Migration strategy

This epic introduces no schema changes (table already exists). The cron migration is the only SQL change. The cron can be applied to staging first and held there until the API route is deployed and smoke-tested.

### Exit criteria

- [ ] `POST /api/atlas/intelligence/cron/brief` returns 200 with at least one produced object ID
- [ ] `GET /api/atlas/intelligence/brief` returns the latest brief for a given scope
- [ ] `atlas_intelligence` rows are written with correct `kind`, `evidence`, `confidence`, `producedBy`
- [ ] Previous brief row has `supersededBy` set after a second run
- [ ] All unit tests pass; no regressions in existing test suite
- [ ] P1–P6 gate: all six pass
- [ ] `executive.ts` and `atlas/page.tsx` are unmodified

---

## Epic 2 — Triage Gate

### Goal

Implement the early attention filter described in canonical §5 and §10.1. The triage gate is the "cheap, high-recall, deliberately permissive" check that runs *before* expensive reasoning. Its job is to protect the reasoning budget by discarding obviously irrelevant triggers without spending a full cognitive cycle on them.

This is the single most architecturally critical ordering decision in the spec (§5: "the brief's original ordering — reason about everything, filter at the end — caps scale and burns budget"). It must be established before the live surface is switched over (Epic 4), so that the switched-over path is already protected.

### Scope

- New module: `lib/atlas/intelligence/triage.ts`
- `TriageGate` — a pure function that evaluates a `TriggerContext` and returns `TriageDecision`
- `TriggerContext` — the struct passed to EI when something wants it to reason
- `TriageDecision` — `{ pass: boolean; reason: string; cost: 'skip' | 'cheap' | 'deep' }`
- The triage gate is inserted as the first step inside the cron route (`/api/atlas/intelligence/cron/brief`) before the producer chain runs
- Trigger types handled in this epic: `scheduled_brief` (always passes at cheap cost), `new_observation` (passes if the observation changes signal baseline by ≥ threshold), `user_question` (always passes at deep cost)

### Files affected

**New files**
```
apps/web/lib/atlas/intelligence/triage.ts
apps/web/lib/atlas/intelligence/trigger.ts
```

**Modified files**
```
apps/web/app/api/atlas/intelligence/cron/brief/route.ts
  — add triage gate call; log and return early on triage=skip
```

**Untouched**
```
All producer cores, executive.ts, page.tsx
```

### Architectural sections implemented

- §5 (cognitive cycle): triage gate at step 2
- §10.1 (two-stage attention model): the cheap early stage

### `TriageGate` design

```typescript
// lib/atlas/intelligence/trigger.ts
export type TriggerKind =
  | 'scheduled_brief'       // pg_cron fires
  | 'new_observation'       // Knowledge Acquisition surfaced something
  | 'user_question'         // Voice/UX forwarded a user query
  | 'manager_callback'      // Manager completed work and is reporting back

export interface TriggerContext {
  kind: TriggerKind
  /** Optional: the observation payload for 'new_observation' triggers. */
  observation?: {
    signalKind: string
    magnitude?: number        // fractional change, 0–1
    subject?: string
  }
  /** Tenant/project scope. */
  projectId: string | null
  tenantId: string
  /** ISO 8601. */
  triggeredAt: string
}

// lib/atlas/intelligence/triage.ts
export interface TriageDecision {
  pass: boolean
  reason: string
  /** Cost estimate for the downstream reasoning pass. */
  estimatedCost: 'skip' | 'cheap' | 'deep'
}

/**
 * Pure triage gate. Determines whether a trigger justifies a reasoning cycle.
 * Called BEFORE any producer or expensive operation. Never calls I/O.
 */
export function triage(ctx: TriggerContext, policy?: TriagePolicy): TriageDecision
```

**Triage rules (initial policy)**

| Trigger kind | Default decision | Cost |
|---|---|---|
| `scheduled_brief` | pass | `cheap` (briefs are the designed use case) |
| `new_observation` with magnitude ≥ 0.1 | pass | `cheap` |
| `new_observation` with magnitude < 0.1 | skip | `skip` (noise floor) |
| `new_observation` with no magnitude | pass | `cheap` (unknown magnitude, err permissive) |
| `user_question` | pass | `deep` |
| `manager_callback` | pass | `cheap` |

The policy is injected (not hard-coded) so it can evolve without changing the function signature. A `TriagePolicy` is a simple config object or a per-tenant override.

### Reasoning budget protection

When triage returns `skip`, the cron route logs the decision (with the reason) to the `atlas_intelligence` table as a `kind: 'triage_log'` entry at minimum confidence. This keeps the "suppress → log for provenance" discipline of canonical §10.3 without surfacing anything to the user. The log row is not a cognitive artifact — it is an audit entry.

> Note on log row kind: `triage_log` is not in the canonical `IntelligenceKind` union. Options: (a) use an existing `kind` loosely, or (b) write to a separate lightweight table. Decision: use a separate `atlas_triage_log` table with `(triggered_at, kind, reason, project_id, pass)` — never touches `atlas_intelligence`, which remains the home of reasoned artifacts only. This is a new migration.

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Triage incorrectly drops a legitimate trigger | Medium | Gate is explicitly permissive (threshold is low); unknown magnitudes pass. Log all decisions for review. |
| Policy drift — rules become silently wrong as signal volumes change | Medium | `TriagePolicy` is a config object; make the threshold tenant-configurable in a later epic. For now, record skip reasons in triage log. |

### Dependencies

- Epic 1 complete: the cron route to instrument exists

### Test strategy

**Unit tests (pure)**
- `triage({ kind: 'scheduled_brief', ... })` → always passes
- `triage({ kind: 'new_observation', observation: { magnitude: 0.05 } })` → skip
- `triage({ kind: 'new_observation', observation: { magnitude: 0.15 } })` → pass
- `triage({ kind: 'user_question', ... })` → always passes at `deep`
- Custom policy override → overrides default rule

**Integration test**
- Low-magnitude observation trigger → cron returns early, no `atlas_intelligence` row written, `atlas_triage_log` row written

**Principle gate**
- P1: `triage()` is pure; no I/O ✅
- P2: No retained state; every triage call is independent ✅
- P5: This is the primary defense for P5 — early filtering means less output, not more ✅

### Migration strategy

One new migration: `atlas_triage_log` table. Lightweight, no FK to `atlas_intelligence`. Apply before Epic 2 routes deploy.

### Exit criteria

- [ ] `triage()` unit tests cover all trigger kinds and policy override
- [ ] Cron route exits early (no producers called) when triage returns skip
- [ ] Skip decisions are written to `atlas_triage_log`
- [ ] Passing decisions proceed to the producer chain unchanged
- [ ] P1–P6 gate: all six pass

---

## Epic 3 — Deviation & Significance

### Goal

Converge the existing `risk-producer.ts` and `opportunity-producer.ts` from two independent valence-specific producers into a single **Deviation & Significance** operation that emits **signed findings** — the canonical §9 model. This closes G3.

The resulting behavior is equivalent to calling both producers today, but the architectural shape is correct: one operation evaluates both positive and negative deviations over the same context, and a single event is correctly reported as both a risk and an opportunity when it has dual faces (canonical §9: "the same event is frequently both").

### Scope

- New module: `lib/atlas/intelligence/producers/deviation-producer.ts`
- Pure function `buildDeviation(input: DeviationInput): DeviationResult` where `DeviationResult` contains signed findings and optionally produces both a risk draft and an opportunity draft from a single pass
- New orchestrator: `lib/atlas/intelligence/producers/deviation-orchestrator.ts` — replaces `assessment-orchestrator.ts` as the primary entry point
- `assessment-orchestrator.ts` is kept but deprecated (internal callers migrated; file stays for one release cycle then removed)
- The `risk`/`opportunity` `IntelligenceKind` values are **preserved** — they remain the storage projection; Deviation & Significance is the *operation*, not a new kind
- The `RiskBody` and `OpportunityBody` types are preserved; `buildDeviation` produces drafts of both kinds from a single analysis pass

### Files affected

**New files**
```
apps/web/lib/atlas/intelligence/producers/deviation-producer.ts
apps/web/lib/atlas/intelligence/producers/deviation-orchestrator.ts
```

**Modified files**
```
apps/web/app/api/atlas/intelligence/cron/brief/route.ts
  — replace runRiskProducer + runOpportunityProducer calls with runDeviationProducer
apps/web/lib/atlas/intelligence/producers/assessment-orchestrator.ts
  — add @deprecated JSDoc; keep exports for one release cycle
```

**Untouched**
```
risk-producer.ts, opportunity-producer.ts, assessment.ts
  — these become internal helpers called by deviation-producer.ts
```

### Architectural sections implemented

- §9 (Deviation & Significance): unified signed operation
- §4 (Collapse 1 resolved): risk and opportunity are one operation with opposite sign

### `DeviationInput` / `DeviationResult` design

```typescript
// deviation-producer.ts

export interface DeviationInput {
  subject: Subject
  projectId: string | null
  window: { since: string; until: string }
  trends: IntelligenceObject<TrendBody>[]
  insights: IntelligenceObject<InsightBody>[]
  briefs: IntelligenceObject<BriefBody>[]
  precedent?: Evidence[]
  /** Optional LLM narrative for each sign; deterministic summary used when absent. */
  narratives?: { risk?: string; opportunity?: string }
}

export interface DeviationResult {
  /** Signed findings across the full context. */
  findings: SignedFinding[]
  /** Draft to persist, or null when no factual driver exists for that sign. */
  riskDraft: IntelligenceDraft<RiskBody> | null
  opportunityDraft: IntelligenceDraft<OpportunityBody> | null
  /** Whether any deviation (either sign) was detected. */
  hasDeviation: boolean
}

export interface SignedFinding extends Finding {
  /** Positive = opportunity; negative = risk; zero = neutral. */
  utilitySign: 1 | -1 | 0
  goalRef?: string         // which goal this affects
  horizon: 'near_term' | 'mid_term'
  likelihood: number
  magnitude: number
}
```

The key invariant: `buildDeviation` makes a **single pass** over the same `trends` / `insights` / `briefs` arrays. It partitions by direction (rising vs. falling) once, and internally delegates to `buildRisk` and `buildOpportunity` with the pre-partitioned drivers. This eliminates the double-scan issue the canonical spec identifies.

### Dual-face event handling

When both `riskDraft` and `opportunityDraft` are non-null from the same input (i.e., some metrics are rising while others are falling — a divergence), both are persisted. The `findings` array in each carries a cross-reference: the risk finding notes "this accompanies an opportunity finding (ref: ...)" and vice versa. This is the "same event is both" case from §9.

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Breaking change to assessment-orchestrator callers | Low | `assessment-orchestrator.ts` is currently unwired; only cron route calls it. Migrate the cron route atomically. |
| Behavioral regression in risk/opportunity output | Low | `buildDeviation` calls the existing `buildRisk` / `buildOpportunity` with the same partitioned inputs; outputs are structurally identical |

### Dependencies

- Epics 1 and 2: cron route exists with triage gate inserted

### Test strategy

**Unit tests**
- All-rising trends input → `riskDraft` is null, `opportunityDraft` non-null
- All-falling trends input → `riskDraft` non-null, `opportunityDraft` is null
- Mixed trends (divergence) → both non-null; cross-reference in findings
- No factual drivers → both null; `hasDeviation` is false
- Determinism check: same input twice → identical output

**Regression tests**
- Run `buildRisk` and `buildOpportunity` on the same inputs independently, then `buildDeviation` on the same inputs; assert `riskDraft` body equals `buildRisk` output body and `opportunityDraft` body equals `buildOpportunity` output body

**Principle gate**
- P3: Signed findings are interpretations of deviations, not raw trend data ✅
- P4: Every finding carries evidence referencing the source intelligence objects ✅

### Exit criteria

- [ ] `buildDeviation` produces structurally equivalent risk/opportunity drafts to the independent producers given the same input
- [ ] Divergence case produces both drafts with cross-references
- [ ] Zero-driver case produces no drafts
- [ ] `runDeviationProducer` replaces `runRiskProducer` + `runOpportunityProducer` in the cron route
- [ ] `assessment-orchestrator.ts` marked `@deprecated` but still exported
- [ ] P1–P6 gate: all six pass

---

## Epic 4 — Retire Legacy `executive.ts`

### Goal

Repoint the live Atlas page (`app/(platform)/atlas/page.tsx`) from `atlasExecutiveSummary` (legacy, P1/P6-violating) to the conformant `executive_brief` path. Delete or quarantine `executive.ts`. Close G1.

This is the first epic that changes something the user sees. It must not ship until Epics 1–3 are live and have been producing objects in production for at least one full day, so there is real data to display.

### Scope

- New producer: `lib/atlas/intelligence/producers/executive-brief-producer.ts` — produces an `IntelligenceObject<ExecutiveBriefBody>` of kind `executive_brief` by reading the already-produced `brief`, `trend`, `insight`, `risk`, and `opportunity` objects for the current window and synthesizing them into the five-section shape of canonical §13.1
- New orchestrator: `lib/atlas/intelligence/producers/executive-brief-orchestrator.ts`
- `apps/web/app/(platform)/atlas/page.tsx` refactored: replace `atlasExecutiveSummary(db)` with a call to `queryIntelligence({ kinds: ['executive_brief'] })` for the latest conformant brief
- `executive.ts` quarantined: rename to `_legacy_executive.ts` (single underscore prefix, no callers); deleted in a cleanup PR after two weeks of stable production on the conformant path
- The page's existing UI columns ("Vad funkade", "Vad föll", "Kräver uppmärksamhet") are fed from the `executive_brief` body rather than from the legacy string arrays
- No UI layout changes — same columns, same data shape, data sourced from conformant layer

### Files affected

**New files**
```
apps/web/lib/atlas/intelligence/producers/executive-brief-producer.ts
apps/web/lib/atlas/intelligence/producers/executive-brief-orchestrator.ts
```

**Modified files**
```
apps/web/app/(platform)/atlas/page.tsx
  — replace atlasExecutiveSummary call; read from IntelligenceStore
apps/web/app/api/atlas/intelligence/cron/brief/route.ts
  — add executive brief production as the final step in the chain
```

**Renamed/quarantined**
```
apps/web/lib/atlas/executive.ts → apps/web/lib/atlas/_legacy_executive.ts
```

**Deleted (cleanup PR, two weeks later)**
```
apps/web/lib/atlas/_legacy_executive.ts
```

### Architectural sections implemented

- §13 (Executive Briefing): apex `executive_brief` production
- §13.1 (brief shape): Situation, What changed, What it means, What I recommend, What needs you
- §13.3 (briefs as cognitive artifacts): brief is persisted; tomorrow's brief reads yesterday's
- §14 (outputs as cognitive artifacts): `executive_brief` kind formally emitted and persisted
- P1, P6: live surface no longer calls services directly; it reads from Memory

### `ExecutiveBriefBody` design

```typescript
export interface ExecutiveBriefBody {
  horizon: 'morning' | 'evening' | 'weekly' | 'project' | 'strategic'
  window: { since: string; until: string }
  /** One reasoned sentence — the whole situation. Not a list. */
  situation: string
  /** Deviations that matter (not all activity). From Deviation & Significance. */
  whatChanged: BriefSection[]
  /** EI's interpretation: implications for goals. */
  whatItMeans: BriefSection[]
  /** Decision-ready recommendations, each beating do-nothing. */
  recommendations: RecommendationRef[]
  /** Things that actually need the user's attention or decision. */
  whatNeedsYou: BriefSection[]
  /** IDs of the source intelligence objects this brief was derived from. */
  sourcedFrom: string[]
  /** Provenance: which prior executive_brief this was read (for continuity). */
  priorBriefId?: string | null
}

export interface BriefSection {
  label: string
  detail: string
  confidence: Confidence
  evidence: EvidenceChain
}

export interface RecommendationRef {
  summary: string
  counterfactual: string   // "do nothing" baseline
  defeater: string         // what would change this recommendation
  confidence: Confidence
  evidence: EvidenceChain
}
```

### Fallback strategy for cold start

During the first days after Epic 1 goes live but before `executive_brief` objects accumulate, `queryIntelligence({ kinds: ['executive_brief'] })` returns an empty array. The page must gracefully fall back:

```typescript
const latestBrief = await queryIntelligence({ kinds: ['executive_brief'], limit: 1 })
if (latestBrief.length === 0) {
  // Render a "Briefing not yet available — check back after 06:00 UTC" notice
  // Do NOT call atlasExecutiveSummary() as a fallback (that re-introduces P1/P6)
}
```

The fallback is a static notice, not a live data call. This is intentional: once `executive.ts` is quarantined, no path may call it.

### Continuity: reading prior briefs

The `executive_brief` producer reads the most recent prior brief as an input:

```typescript
const priorBrief = await queryIntelligence({ kinds: ['executive_brief'], limit: 1 })
```

This satisfies canonical §13.3: "tomorrow's brief should know what yesterday's said." The prior brief's ID is recorded in `priorBriefId` and evidenced in the chain.

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `executive_brief` is empty on first load (cold start) | Certain (first day) | Graceful fallback notice; cron produces the first brief at 06:00 UTC the morning after deploy |
| Page regression: existing UI breaks | Medium | Extract current page data shape into an adapter type; map `ExecutiveBriefBody` to the same adapter before passing to render components |
| Quarantined `_legacy_executive.ts` re-imported by mistake | Low | IDE search for imports; CI lint rule if needed |

### Dependencies

- Epic 1 complete and producing data in production for ≥1 day
- Epic 2 complete (triage gate protecting the cron chain)
- Epic 3 complete (deviation producer in place so executive brief can consume signed findings)

### Test strategy

**Unit tests**
- `buildExecutiveBrief` with a full set of source objects → all five sections populated, `sourcedFrom` contains source IDs
- `buildExecutiveBrief` with empty source objects → sections populated with "nothing to report" text; confidence = 0.1; `executive_brief` is still a valid artifact
- Continuity: with a `priorBrief` input → `priorBriefId` is set; summary references prior

**Integration test**
- End-to-end cron run → `atlas_intelligence` contains a `kind: 'executive_brief'` row
- `GET /api/atlas/intelligence/brief?kind=executive_brief` returns the latest
- Page renders without error with the conformant brief

**Visual regression test**
- Screenshot diff of Atlas page before and after: column layout should be identical; only data source changes

**Principle gate**
- P1: `executive_brief` producer reads from `IntelligenceStore` only; no direct service calls ✅
- P6: no `createAdminClient()` inside the producer core ✅

### Exit criteria

- [ ] `executive_brief` objects appearing in `atlas_intelligence` table in production
- [ ] Atlas page renders using `executive_brief` data; no call to `atlasExecutiveSummary`
- [ ] `executive.ts` renamed to `_legacy_executive.ts`; no callers remain
- [ ] Fallback notice renders correctly when no brief is available
- [ ] Continuity: second brief has `priorBriefId` pointing to the first
- [ ] P1–P6 gate: all six pass
- [ ] Cleanup PR scheduled: `_legacy_executive.ts` deletion after two-week observation window

---

## Epic 5 — Decision Ledger Ownership

### Goal

Implement the three-field, three-owner decision ledger as specified in canonical §8.4. EI authors only the *prediction* field. *Disposition* is authored by Voice/Manager. *Outcome* is reported by Manager/Knowledge Acquisition. Memory (the `atlas_intelligence` table) persists all three. EI reads the ledger back as an input each cycle to calibrate future confidence.

This closes G4 and unlocks honest calibration (canonical §8.2) — subject to the R5 caveat that thin outcome history limits calibration early on.

### Scope

- New migration: `atlas_decision_ledger` table (separate from `atlas_intelligence`; the ledger has a different write pattern — it is updated by multiple owners over time, unlike `atlas_intelligence` which is append-only)
- New API route: `POST /api/atlas/intelligence/ledger/disposition` — for Voice/Manager to record accept/reject/defer
- New API route: `POST /api/atlas/intelligence/ledger/outcome` — for Manager/KA to record the observed outcome
- `executive-brief-producer.ts` modified: each `RecommendationRef` now writes a ledger *prediction* row as a side-effect via the orchestrator shell (not inside the pure core)
- `brief-orchestrator.ts` (and `executive-brief-orchestrator.ts`) modified: after calling the pure producer, the shell writes prediction rows to the ledger for each recommendation
- `queryIntelligence` context for calibration: the orchestrators read the relevant ledger rows back as inputs to the producer cores via the existing `memoryRecall` injection point or a new `calibrationRecall` seam

### Open item resolution (ADR §10 / O1)

Per ADR open item O1: ownership of the `disposition` field (Voice vs. Manager) follows canonical open question Q6 (recommendation authority gradient). Resolution for implementation purposes:

> **Disposition is authored by Voice** when a human decision is required (the user accepts/rejects via the UI). **Disposition is authored by Manager** when standing delegated authority exists (Manager executes without asking). Both write to the same ledger field via the same API route; the `authoredBy` column records which.

This does not resolve the full Q6 question of *how the gradient is set* — that remains open. But it provides a concrete path to implement the field.

### `atlas_decision_ledger` schema

```sql
create table public.atlas_decision_ledger (
  id                  uuid primary key default gen_random_uuid(),
  -- The EI-authored prediction (FK to the recommendation in atlas_intelligence)
  intelligence_id     uuid references public.atlas_intelligence(id),
  project_id          uuid references public.projects(id) on delete set null,
  -- EI's prediction, authored at recommendation time
  prediction_summary  text not null,
  predicted_at        timestamptz not null default now(),
  -- Disposition: authored by Voice or Manager
  disposition         text check (disposition in ('accepted', 'rejected', 'deferred', 'expired')),
  disposition_by      text,  -- 'voice' | 'manager'
  disposition_at      timestamptz,
  -- Outcome: authored by Manager or Knowledge Acquisition
  outcome_summary     text,
  outcome_matched_prediction boolean,
  outcome_at          timestamptz,
  outcome_reported_by text   -- 'manager' | 'knowledge_acquisition'
);
```

### Calibration read path

The `executive-brief-orchestrator.ts` reads the ledger before calling the producer:

```typescript
const calibrationHistory = await queryLedger({
  projectId: args.projectId,
  hasOutcome: true,
  limit: 50,
})
// Passed into the producer as a new `calibrationHistory` input field
```

The producer uses this to reason about its track record. The calibration computation is a pure function over the history array — no state retained.

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Thin outcome history (R5): calibration has no data early on | Certain (early weeks) | Producer accepts empty history gracefully; confidence defaults to spec formula without calibration adjustment. Log "calibration cold-start" state. |
| Disposition is never written (no one calls the disposition API) | Medium | Ledger rows with null disposition are still useful for outcome tracking; disposition is optional. Monitor in operations. |
| `intelligence_id` FK breaks if `atlas_intelligence` row is superseded | Low | FK is nullable; set `on delete set null` |

### Dependencies

- Epic 4 complete: `executive_brief` is being produced and displayed
- ADR O1 resolved (above): disposition ownership is specified

### Test strategy

**Unit tests**
- Producer with empty calibration history → confidence = base formula
- Producer with calibration history (75% correct) → confidence reasoning changes (higher for similar situations)
- Producer with calibration history (25% correct) → confidence dampened

**Integration tests**
- `POST /api/atlas/intelligence/cron/brief` → ledger prediction rows written for each recommendation
- `POST /api/atlas/intelligence/ledger/disposition` → disposition field set
- `POST /api/atlas/intelligence/ledger/outcome` → outcome field set
- Next cron run → producer receives calibration history including the settled ledger row

**Principle gate**
- P2: calibration history is read as an *input*; no confidence factor is retained in EI between cycles ✅
- P4: `RecommendationRef` in `ExecutiveBriefBody` now carries `ledgerEntryId` linking to the prediction row ✅
- P6: ledger writes happen in the orchestrator shell, never in the producer core ✅

### Exit criteria

- [ ] `atlas_decision_ledger` table created and applied
- [ ] Prediction rows written for every `executive_brief` recommendation
- [ ] Disposition API route operational
- [ ] Outcome API route operational
- [ ] Producer reads calibration history and passes it through; confidence reasoning changes measurably with a history of 10+ settled rows
- [ ] P1–P6 gate: all six pass
- [ ] ADR O2 resolved: whether `outcome`/`experience` IntelligenceKinds are migrated out of `atlas_intelligence` or retained

---

## Epic 6 — Full Attention Model

### Goal

Implement the complete two-stage Attention model from canonical §10: salience ranking across the five axes (impact, urgency, actionability, novelty, horizon-weight), the cognitive-load budget, and the four attention decisions (interrupt, surface, defer, suppress). The budget lives in Memory + Voice + config — not inside EI.

This closes G5.

### Scope

- New module: `lib/atlas/intelligence/attention.ts`
- `computeSalience(finding: SignedFinding, goals: GoalState[], priorSurfaces: SurfaceRecord[]): SalienceScore`
- `applyAttentionGate(items: RankedItem[], budget: AttentionBudget): AttentionDecision[]`
- New type: `AttentionRequest` (the EI output artifact sent to Voice)
- New IntelligenceKind: `attention_request` (already reserved in `types.ts`)
- `AttentionBudget` is read from Memory per cycle; its consumption record is written by Voice, not by EI
- `executive-brief-orchestrator.ts` modified: after producing the executive brief, run salience ranking and produce `attention_request` objects for items that pass the gate
- New migration: register `atlas_attention_log` table (consumption record of what has been surfaced; Voice writes here, EI reads it as budget input)

### Files affected

**New files**
```
apps/web/lib/atlas/intelligence/attention.ts
apps/web/lib/atlas/intelligence/producers/attention-producer.ts
apps/web/lib/atlas/intelligence/producers/attention-orchestrator.ts
supabase/migrations/YYYYMMDD_atlas_attention.sql
```

**Modified files**
```
apps/web/lib/atlas/intelligence/types.ts
  — add AttentionRequestBody interface; keep kind 'attention_request' reserved marker
apps/web/lib/atlas/intelligence/producers/executive-brief-orchestrator.ts
  — add attention gate pass after brief production; persist attention_request objects
```

### Salience ranking design

```typescript
export interface SalienceScore {
  impact: number        // 0–1: magnitude of utility on in-play goals
  urgency: number       // 0–1: how fast the decision window closes
  actionability: number // 0–1: is there something the user can do?
  novelty: number       // 0–1: not previously surfaced
  horizonWeight: number // 0–1: long-horizon up-weight to prevent starvation
  composite: number     // weighted sum — the ranking key
}
```

**Horizon-weight formula.** Near-term items (horizon ≤ 7 days) get weight 1.0. Mid-term items (7–30 days) get 1.3. Long-term items (>30 days) get 1.6. The up-weighting of long items is the structural defense against R7 (long horizon starvation) from the canonical spec §16.

**Novelty.** The `priorSurfaces` input is the consumption record from `atlas_attention_log`. An item with the same `subject` + `signedFinding.label` surfaced in the past 24 hours has novelty = 0. Items never surfaced have novelty = 1. Partial re-surfacing: decay by time elapsed.

### AttentionBudget ownership (canonical §10.3)

The budget is **not** a value EI holds. It is composed at the start of each orchestrator shell run from three sources:

```typescript
// In the orchestrator shell (not the producer core):
const budget: AttentionBudget = {
  // How much has already been consumed this period — read from atlas_attention_log
  consumed: await readAttentionConsumption({ projectId, period: 'today' }),
  // User/tenant config — per-project settings (existing projects.settings JSONB)
  capacity: project.settings?.attentionBudget ?? DEFAULT_ATTENTION_BUDGET,
  // Signals from Voice about user engagement — initially static; extended in a later sprint
  userEngagementSignal: 'neutral',
}
```

EI receives the budget as an input and reasons against it. It does not write to it. Voice writes to `atlas_attention_log` when it surfaces an item to the user.

### Four attention decisions

```typescript
export type AttentionDecision =
  | { action: 'interrupt';     item: RankedItem; rationale: string }
  | { action: 'surface';       item: RankedItem; rationale: string }
  | { action: 'defer';         item: RankedItem; nextEvalAt: string }
  | { action: 'suppress';      item: RankedItem; suppressReason: string }
```

**Interrupt threshold:** composite salience ≥ 0.85 AND urgency ≥ 0.8 AND actionability ≥ 0.5. Deliberately rare.
**Surface threshold:** composite ≥ 0.5.
**Defer:** composite ≥ 0.3 AND urgency < 0.5 (window not yet open).
**Suppress:** everything else.

All four decisions are logged to `atlas_attention_log`. The log entry for `suppress` includes the reason — this is the "logged for provenance" discipline from canonical §10.3.

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Interrupt threshold calibration wrong (too many interrupts) | Medium | Initial threshold is very conservative (≥ 0.85); instrument `atlas_attention_log` and review after one week |
| `atlas_attention_log` consumption not written by Voice yet | High (Voice integration is later) | Default budget to a static value until Voice integration; EI can still run the gate against the static capacity |
| Horizon-weight formula starves near-term urgent items | Medium | Near-term weight = 1.0 (no downweight); the up-weight only promotes long-horizon items |

### Dependencies

- Epic 3 complete: signed findings exist as inputs to salience ranking
- Epic 4 complete: `executive_brief` producer is the anchor for attention gate integration

### Test strategy

**Unit tests**
- `computeSalience` with various input combinations → scores within expected ranges
- Long-horizon item scores higher than near-term item with same impact (horizon-weight verification)
- Known item (novelty = 0) scores lower than novel item with same other axes
- `applyAttentionGate` with full budget → all items suppressed except the top
- `applyAttentionGate` with empty budget and high-salience item → `interrupt` decision

**Principle gate**
- P2: salience scores are computed fresh each cycle from inputs; not retained ✅
- P5: attention gate is the primary P5 enforcement mechanism ✅
- The budget (consumption) is read from Memory, not held by EI ✅

### Exit criteria

- [ ] `computeSalience` unit tests cover all five axes and horizon-weight
- [ ] `attention_request` objects written to `atlas_intelligence` for surfaced items
- [ ] `atlas_attention_log` receives entries for all four decision types
- [ ] Atlas page's "Kräver uppmärksamhet" section is driven by `attention_request` objects with `action: 'surface'` or `action: 'interrupt'`
- [ ] P1–P6 gate: all six pass

---

## Epic 7 — Delegation & Knowledge Requests

### Goal

Implement the two outbound request types from canonical §12:

1. **Knowledge Requests** — EI emits a knowledge gap artifact tagged `blocking` or `enriching`; Manager is the sole orchestration boundary that acts on it
2. **Delegation Requests** — EI proposes a delegation attached to a recommendation (not as a separate wait); Voice or Manager accepts and executes

This closes G7. G8 (externalized hypotheses) is addressed minimally here: a hypothesis that must survive to the next cycle is externalized as a `kind: 'hypothesis'` IntelligenceObject — the machinery is the same `IntelligenceStore` write path; the producer pattern is established but no standing-concern use case is implemented yet.

### Scope

- `types.ts`: add `KnowledgeRequestBody` and `DelegationRequestBody` interfaces for the two new kinds (both already reserved in `IntelligenceKind`)
- New module: `lib/atlas/intelligence/producers/knowledge-request-producer.ts`
- New module: `lib/atlas/intelligence/producers/delegation-producer.ts`
- New API route: `GET /api/atlas/intelligence/requests` — Manager polls this for pending knowledge requests and delegation requests
- New API route: `POST /api/atlas/intelligence/requests/[id]/acknowledge` — Manager acknowledges receipt; changes request status
- `executive-brief-orchestrator.ts` modified: when reasoning identifies a gap worth closing, emit a knowledge request instead of guessing; attach delegation requests to recommendations

### Architectural sections implemented

- §11.3 (recommendation/delegation): delegation attached to recommendation; EI does not wait
- §12 (Delegation boundary): knowledge and delegation requests routed through Manager; blocking/enriching classification
- §8.1 (hypotheses): minimal externalization path for blocking hypotheses

### `KnowledgeRequestBody` design

```typescript
export interface KnowledgeRequestBody {
  /** What knowledge is needed. Intent-level description. */
  gapDescription: string
  /** Which decision would this knowledge improve? */
  linkedDecisionSummary: string
  /** Does reasoning block on this gap, or would it only enrich a future cycle? */
  classification: 'blocking' | 'enriching'
  /** The value of closing the gap: high/medium/low. Manager uses this for prioritization. */
  estimatedValue: 'high' | 'medium' | 'low'
  /** Status of this request. Updated by Manager acknowledge route. */
  status: 'pending' | 'acknowledged' | 'fulfilled' | 'cancelled'
}
```

### `DelegationRequestBody` design

```typescript
export interface DelegationRequestBody {
  /** What outcome is wanted. What/why, never how. */
  outcomeSummary: string
  /** Why this is being delegated. The reasoning. */
  rationale: string
  /** The recommendation this delegation is attached to. */
  linkedRecommendationId: string
  /** Who should execute: 'manager' | 'agent' | 'user'. */
  assignTo: 'manager' | 'agent' | 'user'
  /** EI's confidence that this delegation is the right action. */
  confidence: Confidence
  /** The defeater: what would make this delegation wrong. */
  defeater: string
  status: 'proposed' | 'accepted' | 'rejected' | 'executing' | 'completed'
}
```

### EI does not wait (canonical §11.3)

EI emits a delegation request and **moves on**. The delegation is attached to the recommendation in the same `executive_brief` production pass. The accept → execute transition belongs entirely to Voice (surfacing and capturing the user's decision) and Manager (executing). EI's next involvement is reading the disposition back from the ledger (Epic 5) and the outcome (when Manager reports it).

The `requested_at` on the delegation object is the EI-authored timestamp. EI has no further interaction with this object until the next cycle.

### Manager polling pattern

Manager polls `GET /api/atlas/intelligence/requests?status=pending` at the end of each workflow run. This is a pull pattern, not a push — consistent with how Manager currently operates. Blocking knowledge requests are prioritized by Manager via the `classification` field.

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Manager is not yet instrumented to consume knowledge requests | High (Manager integration is future work) | Knowledge requests are emitted and persist correctly; Manager integration is a separate Manager-layer increment that this epic does not block |
| Knowledge request spam — EI emits too many "enriching" requests | Medium | `estimatedValue` field and a per-cycle cap on enriching requests (max 3 per cycle in initial config) |
| EI waits on a delegation (violating §11.3) | Low | Design review: the delegation body has no callback channel; EI cannot be given one |

### Dependencies

- Epic 4 complete (executive brief is the anchor that recommendations come from)
- Epic 5 complete (decision ledger exists; delegation request links to a ledger prediction row)

### Test strategy

**Unit tests**
- `buildKnowledgeRequest` with blocking classification → `status: 'pending'`, `classification: 'blocking'`
- `buildDelegationRequest` with high-confidence recommendation → delegation body has `confidence`, `defeater`, `linkedRecommendationId`
- EI emits delegation and does not block: the producer returns immediately; no async wait

**Integration tests**
- Cron run with a deliberate knowledge gap (seed a scenario with missing revenue data) → knowledge request row in `atlas_intelligence`
- `GET /api/atlas/intelligence/requests` returns the pending requests
- `POST /api/atlas/intelligence/requests/[id]/acknowledge` updates status to `acknowledged`
- Next cron run: acknowledged blocking request not re-emitted; enriching request may be re-evaluated

**Principle gate**
- P1: EI emits requests and stops; it does not call Manager or KA ✅
- P6: All outbound work goes through defined artifacts read by Manager, not direct calls ✅

### Exit criteria

- [ ] Knowledge requests persisted in `atlas_intelligence` for identified gaps
- [ ] Delegation requests persisted and linked to recommendations
- [ ] Manager polling route returns pending requests in priority order (blocking first)
- [ ] Acknowledge route updates status
- [ ] EI does not re-emit a blocking request that has been acknowledged
- [ ] P1–P6 gate: all six pass

---

## Epic 8 — Vocabulary Migration (Optional, Late)

### Goal

Rename `IntelligenceObject` to `CognitiveArtifact` and split the single `IntelligenceKind` union into distinct `InputKind` (consumed by EI) and `OutputKind` (produced by EI) unions, as described in ADR §5. This is a cosmetic clarification that makes the code match the canonical vocabulary precisely.

This epic is deliberately last and deliberately optional. It blocks nothing. It never ships if the team judges the cost-benefit unfavorable after Epics 1–7 have settled.

### Scope

- Rename `IntelligenceObject<B>` → `CognitiveArtifact<B>` across the entire codebase
- Add `InputArtifactKind` (`brief`, `trend`, `insight`, `entity_profile`, `goal_status`) and `OutputArtifactKind` (`risk`, `opportunity`, `recommendation`, `executive_brief`, `attention_request`, `knowledge_request`, `delegation_request`, `hypothesis`)
- Keep `IntelligenceKind` as a union alias for backward compatibility until all consumers are migrated
- Rename `IntelligenceDraft` → `CognitiveArtifactDraft`
- Update all producer files, orchestrators, store interface, and consumer routes
- Update `IntelligenceStore` → `CognitiveArtifactStore`

### Files affected

All files in `apps/web/lib/atlas/intelligence/`. No schema changes (column names in `atlas_intelligence` are unaffected).

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Large diff increases review burden | Medium | Use `sed`/codemod for mechanical rename; human review for any semantic changes |
| External consumers (Manager, agents) break on renamed types | Medium | Alias the old names for one release cycle; remove aliases in a follow-up |

### Dependencies

- Epics 1–7 complete and stable

### Test strategy

- TypeScript compilation with no errors after rename is the primary test
- All existing unit tests pass without modification (types are internal; tests use the renamed types)

### Exit criteria

- [ ] `CognitiveArtifact<B>` replaces `IntelligenceObject<B>` everywhere
- [ ] `InputArtifactKind` and `OutputArtifactKind` split is enforced by TypeScript
- [ ] TypeScript compilation clean
- [ ] All unit and integration tests pass

---

## Part III — Cross-Cutting Engineering Standards

### Per-increment principle gate checklist

Every epic's PR description must include this checklist and every answer must be "yes" before merge:

```markdown
## Principle Gate (EI Conformance)

- [ ] P1 — EI only thinks here. No collecting, executing, or remembering inside the producer core.
- [ ] P2 — Cognitive core is referentially stateless. Inputs in, artifacts out; no retained state; I/O in shell only.
- [ ] P3 — All outputs are reasoned artifacts, not raw data. Every output interprets rather than reports.
- [ ] P4 — Every output carries evidence/provenance. For recommendations: includes defeater.
- [ ] P5 — This reduces cognitive load. Counterfactual honored. Attention budget respected.
- [ ] P6 — Core invokes zero external tools/APIs/services. All external interaction via Memory/Manager/Voice/KA boundaries.
```

### Naming conventions

Follow ADR §3 (vocabulary). In all new code:

| Use | Avoid |
|---|---|
| `cognitive artifact` | `intelligence object` (in comments/docs after Epic 8) |
| `Executive Brief` | `daily briefing`, `executive summary` |
| `Deviation & Significance` | `risk+opportunity`, `assessment` |
| `Attention` | `prioritization`, `filtering` |
| `blocking` / `enriching` | `urgent` / `nice to have` (for knowledge requests) |
| `referentially stateless` | `pure function`, `deterministic` (EI is not bit-reproducible, only auditable) |

### Testing pyramid

Each epic ships with:
1. **Pure unit tests** — cover every pure producer function; run in CI with no DB, no network
2. **Orchestrator integration tests** — run against local Supabase (`supabase start`); cover the full shell→core→store→retrieve round trip
3. **API integration tests** — cover the cron and read routes end-to-end against a staging database
4. **Smoke tests** — manual curl against staging before promoting to production

### File organization

```
apps/web/lib/atlas/intelligence/
  types.ts              ← domain contracts (modified only for new kinds)
  store.ts              ← IntelligenceStore interface (stable)
  retrieval.ts          ← consumer read API (stable; do not add writes)
  postgres-store.ts     ← storage implementation (stable)
  context-request.ts    ← new in Epic 1
  trigger.ts            ← new in Epic 2
  triage.ts             ← new in Epic 2
  attention.ts          ← new in Epic 6
  producers/
    assessment.ts       ← shared helpers (stable)
    brief-producer.ts   ← functional core (stable)
    brief-orchestrator.ts
    trend-producer.ts   ← functional core (stable)
    trend-orchestrator.ts
    insight-producer.ts ← functional core (stable)
    insight-orchestrator.ts
    risk-producer.ts    ← becomes internal to deviation-producer in Epic 3
    opportunity-producer.ts ← same
    deviation-producer.ts    ← new in Epic 3
    deviation-orchestrator.ts ← new in Epic 3
    assessment-orchestrator.ts ← @deprecated after Epic 3
    executive-brief-producer.ts ← new in Epic 4
    executive-brief-orchestrator.ts ← new in Epic 4
    attention-producer.ts  ← new in Epic 6
    attention-orchestrator.ts ← new in Epic 6
    knowledge-request-producer.ts ← new in Epic 7
    delegation-producer.ts ← new in Epic 7
```

### Conflict reporting protocol

If any increment appears to require violating a canonical principle (P1–P6), stop implementation and report:

1. State which principle is at risk
2. State the feature or requirement that seems to demand the violation
3. Do not resolve it in code or in this plan
4. Raise it as a spec-versioning decision against `docs/architecture/ATLAS_EXECUTIVE_INTELLIGENCE.md`

This plan has no authority to relax a principle. The canonical spec does.

---

## Part IV — Open Questions (Resolution Tracking)

These are the canonical §17 open questions and ADR §10 open items, with their current resolution status.

| ID | Question | Status | Resolution |
|---|---|---|---|
| Q1 | Trigger authority: what can wake EI? | **Resolved for implementation** | Epic 2: scheduled_brief, new_observation, user_question, manager_callback. Over-reactive expansion is controlled by the triage gate, not by restricting trigger types. |
| Q2 | Calibration cold-start | **Resolved for Epic 5** | Accept empty history gracefully; default to base confidence formula; log "cold-start" state in ledger rows. |
| Q3 | Conflicting cognitive artifacts | **Deferred to Epic 6 or later** | When a freshly-reasoned finding contradicts a standing concern, the Attention model re-evaluates both; the finding with higher confidence + novelty wins. Standing concerns are re-presented each cycle as inputs. Implementation detail resolved in Epic 6 design. |
| Q4 | Cross-tenant synthesis | **Deferred, architectural** | Not implemented. If ever built, it requires a spec-versioning decision against §15. This plan does not authorize it. |
| Q5 | Cognitive-load budget calibration | **Resolved for Epic 6** | Initial implementation: static per-project config in `projects.settings.attentionBudget`; default = 5 items/day. Adaptive learning from Voice engagement signals is a future sprint. |
| Q6 | Recommendation authority gradient | **Partially resolved in Epic 5** | See Epic 5 open item O1 resolution: Voice authors disposition for human decisions; Manager authors disposition under delegated authority. Who sets the gradient is a future product decision. |
| Q7 | Interrupt-fatigue feedback | **Deferred to Epic 6 follow-up** | Initial implementation: static thresholds. Adaptive dampening (reading dismissal history from `atlas_attention_log`) is a post-Epic-6 enhancement. |
| O1 (ADR) | Disposition field ownership | **Resolved in Epic 5** | See Epic 5 |
| O2 (ADR) | `outcome`/`experience` kinds in `atlas_intelligence` | **Decide at Epic 5** | Recommendation: migrate to `atlas_decision_ledger` at Epic 5; keep kinds reserved in the type union for backward compat |
| O3 (ADR) | Multi-user attention budget | **Deferred** | Out of scope until Epic 6 design; single-user budget in initial implementation |

---

## Part V — Delivery Schedule (Indicative)

Weeks are estimates, not commitments. Each epic's start date follows the prior epic's exit criteria being met — not a calendar date.

| Epic | Estimated duration | Gate before next epic |
|---|---|---|
| Epic 1 — Wire conformant slice | 1–2 weeks | Data producing in staging |
| Epic 2 — Triage gate | 3–5 days | Gate operational in cron chain |
| Epic 3 — Deviation & Significance | 3–5 days | Signed findings replacing dual producers |
| Epic 4 — Retire legacy executive.ts | 3–5 days + 2-week observation | Conformant path stable in production |
| Epic 5 — Decision ledger ownership | 1 week | Ledger writing and reading operational |
| Epic 6 — Full Attention model | 2 weeks | Attention requests surfaced to users |
| Epic 7 — Delegation & Knowledge requests | 1–2 weeks | Manager polling operational |
| Epic 8 — Vocabulary migration | 1 week | TypeScript clean; all tests pass |

**Total estimated range: 10–16 weeks** (excluding Epic 8 which may be deferred indefinitely).

The first user-visible improvement lands with **Epic 4** (Atlas page powered by conformant EI). Epics 1–3 are infrastructure; they are not invisible — they produce objects in `atlas_intelligence` that can be queried directly — but they do not change what the user sees on the Atlas page.

---

*This document is the official implementation roadmap. It is subordinate to `docs/architecture/ATLAS_EXECUTIVE_INTELLIGENCE.md` (canonical, frozen) and `decisions/adr-executive-intelligence-conformance.md` (conformance authority). Changes to this plan do not require architectural approval. Changes to either of those documents do.*
