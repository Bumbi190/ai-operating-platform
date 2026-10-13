# Atlas Analytics P1: saved manual review draft

Date: 2026-10-12. Status: **proposed architecture for human review; no P1 persistence implemented**.
Inventory baseline: PR320, `8aed54816912a341c6cf908ae774d9d59e3b60d0`.
“Verified” below means present in code, never verified in a live database.
No external DB, credentials, collector, PostHog or provider was accessed for this inventory.

## Delivered now versus proposed next

This preflight removes only Marknadspuls recommendation cards and unused presentation
styles. Status values, completeness, report date, detail disclosure and report access
remain. Overview observation timestamps and quality notices are preserved. One full-width
column replaces the two-column layout. Atlas Intelligence, P0 rules, source values,
report reads and traffic composition are unchanged.

P1 lets the authenticated project owner explicitly save an Atlas proposal and reopen its
exact evidence and manual checks after reload. Saving is an internal annotation in
observer or active mode, never authoring an executable workflow. The smallest slice saves
only existing `company-status` and `bid-window` insights of kind `proposal`.
Facts and quality notices remain readable without Save. No editing, review decisions,
new business rules, LLM, scheduler, execution or automatic collection is included.
Reviewable means inspectable evidence and manual steps, not an approval or a promise
to perform those steps.

## Decision and alternatives

**P1 is an architectural extension with bounded reuse.** Pure rules and owner scope
exist; a non-executable draft entity, atomic persistence lifecycle and API/UI contract
do not. Written-design review must precede an implementation plan.

| Approach | Trade-off and decision |
|---|---|
| Separate analysis draft and append-only events | Chosen: two small tables and a narrow save RPC isolate observer analysis from runtime. Reuses validated evidence and owner scope without execution grants. |
| Legacy `workflows` with `active=false` | Rejected: mutable executable agent/trigger definitions, active defaults true. Disabling a workflow does not make it an immutable analysis draft. |
| Durable workflow instances/evidence or run approvals | Rejected: evidence requires an instance; instances carry state/wake/scheduler lineage. Approvals derive project through a run; resolution changes run status and can publish. |

## Concrete inventory and call paths

References identify baseline files/entry lines. Prefix `apps/web/` applies to abbreviated
paths in this table.

| Existing path | Evidence and permitted reuse |
|---|---|
| Project page → scoped report → panels | `app/(platform)/projects/[slug]/page.tsx:36,58,87` calls RLS-bound `getProjectBySlug` (`lib/project/get-project.ts:26`), then `loadHandlarborsenMarketplaceReport`, then Overview → VisualPulse/Insights. Reader `lib/atlas/project-analytics/handlarborsen-marketplace-read.ts:60,83,90` checks allowed IDs, fixed HB ID **and** slug before privileged reads, DB mode, then ≤30 snapshots and ≤30 audit rows. Reuse those boundaries. |
| P0 evidence → insight → manual check | `lib/atlas/project-analytics/handlarborsen-insights.ts:100,143,228` is pure, clock-injected, versioned `handlarborsen-insights-1.0.0`, with facts/quality/proposals, exact values/windows/caveats. `components/platform/vnext/HandlarborsenInsights.tsx:17` derives/renders without I/O or Save. Reuse derivation and presentation. |
| Chat authoring → legacy persistence | `app/api/chat/route.ts:1494,1506,1562` dispatches validate/save to `handleWorkflowAuthoring`, resolves owner scope and project agents, calls `validateWorkflowDraft` (`lib/atlas/workflow-authoring.ts:59`), then inserts/updates `workflows`. This handler does not enforce observer mode. `packages/db/full_schema_run_in_supabase.sql:37` defines agent-step JSON, manual/cron/webhook trigger and active default true. Never call for P1. |
| Durable admin → state/history store | `app/api/workflows/admin/route.ts:70` registers/creates/schedules; `lib/workflows/store.ts:64,159,330,461` stores defs/instances/transitions/evidence through tables and RPCs. `supabase/migrations/20260829_workflow_instance_core.sql:43,74,124,168` defines pinned defs, active instances, append-only transitions and instance-bound evidence. Reuse atomic/immutable patterns, not entities or RPCs. |
| Workflow routes → evaluation/authority | `app/api/workflows/tick/route.ts:25` → `tickDueWorkflows` (`lib/workflows/tick.ts:105` reads project pause); evaluation does not advance/dispatch. `api/workflows/evidence/route.ts` appends instance-bound attested evidence; `api/workflows/gate/route.ts` requests authorizations/rearms instances. Outside P1. |
| Queue → approval → run/publish/audit | `lib/os/review-queue.ts:175,241,256` reads `runs!inner(projects!inner(...))` and disables decisions without a run. `packages/db/full_schema_run_in_supabase.sql:342` scopes approval RLS through runs. `app/api/approvals/[id]/route.ts:45` PATCH checks ownership/run, invokes `resolve_approval`; `20260903120000_durable_cancellation_reaper.sql:251` locks run then approval and changes run status. Route then writes feedback/memory and may publish articles on winning approval. No P1 dummy runs, approvals or reuse of this decision path. |
| Modes/stops/grants | `lib/atlas/lifecycle.ts:38,46`: observer/active collect; only active is executable. `lib/governance/execution-stop.ts:423` distinguishes assistance from execution, refusing unknown/global/project stop for execution. `lib/governance/execution-dispatch.ts:74` checks before dispatch; already admitted in-flight work may finish after stop. `lib/workflows/action-run.ts:602` rechecks authority/target/evidence/claim/stop. `lib/atlas/authorization/human-execution-grant.ts:63` calls the human-JWT execution grant. P1 invokes none of these execution boundaries. |

### Source schema and migrations: code only

Canonical migrations live in `apps/web/supabase/migrations`; root `supabase/migrations`
is historical. Guard policy `apps/web/scripts/migration-guard-policy.mjs:64` expects
112 canonical SQL files / 98 enforced migrations. `check-migrations.mjs` skips locally
and queries the ledger only on Vercel. It checks name-set coverage, not hashes, grants,
order or replayability. Do not run its remote ledger check or weaken/override the guard.

`20261010100000_handlarborsen_marketplace_snapshots.sql` defines row UUID, fixed project,
schema 1/window 24, 11 nullable counts, completeness/unavailable reasons and unique
(project_id, snapshot_date), server-only access.
`20261010130000_handlarborsen_guarded_snapshot_store.sql:47` supplies the guarded
write RPC; today's row can be upgraded/refreshed under a lock, even using an older
observation for a quality upgrade. Date/UUID alone is **not an immutable version**.
The report selects no UUID or raw version identity
(`handlarborsen-marketplace-report.ts:80,84`); P0 snapshotRef is descriptive text.
Historical collector version is explicitly null (`handlarborsen-insights.ts:42,199`).

Schema/functions are present in code; live installation, grants/RLS effectiveness and
ledger are **not confirmed here**. No analysis-draft table/migration exists in this base.
Additive local schema testing and a later explicit migration/deployment review are
prerequisites for real saving. No migration is added or applied by this preflight.

## Proposed schema and authoritative binding

New `AnalysisReviewDraftV1`, separate from executable WorkflowDraft/WorkflowStep.
One additive migration after design/plan approval creates:

- `atlas_analysis_drafts`: UUID id; non-null project FK RESTRICT; schema_version=1;
  workflow_key=`handlarborsen.manual-insight-review`; rule_id/version; evidence_hash
  and content_hash (64 lowercase hex); immutable source_envelope, insight and
  manual_steps JSONB; created_by/created_at; evaluated_at; fresh_until.
  Unique (project_id, workflow_key, rule_id, rule_version, evidence_hash).
- `atlas_analysis_draft_events`: UUID id, identity seq, project_id/draft_id,
  kind=`created|superseded`, optional superseded_by, actor_id, occurred_at.
  Composite project/draft FKs reject cross-project links. One created event per draft
  and one superseded event per old draft. Status is derived, not mutable approved state.

Both enable RLS with no client policies/grants; service_role has SELECT only.
Direct INSERT/UPDATE/DELETE/TRUNCATE is revoked. A SECURITY DEFINER
`atlas_save_analysis_draft` with search_path='' and service_role-only EXECUTE inserts
draft/events atomically. Mutation-rejection triggers back immutability independently.
No workflow/instance/run/action/authorization/dispatch/schedule/trigger/agent fields or
FKs. Closed JSON validation rejects executable fields too. Manual steps are ordered
text: inspect cited report, perform the insight's current manual next check, record
the result outside this slice. No completion tracking or hidden task creation.

A server-only source loader shares the existing scoped reader's mode/limits/report
builder, retaining named raw columns plus snapshot UUIDs and audit row IDs. Freeze
**all bounded source rows consumed by derivation** (≤30 each), with explicit ID
tie-breakers. Extract a common internal read helper; do not change existing page reads
or add unscoped queries. This is a necessary extension, not current report behavior.

Source envelope binds project/id/slug, raw null/value/reason pairs, observation/capture
dates, snapshot IDs, audit IDs/status/time/storage outcome, schema, report-contract
version and semantic definitions; unknown provenance remains unknown.
Exclude evaluation time, ages and today's derived status from identity. Server reloads
source and re-derives the insight; HTTP values/text/quality/actor/mode are never trusted.

Reuse `canonicalJson` (`apps/web/lib/atlas/mission/binding.ts:93`) with SHA-256 for
selector/content hashes. Define one fixed-field source encoding with TS/PostgreSQL
parity fixtures for evidence_hash: do not hash PostgreSQL's default jsonb formatting
against different TypeScript bytes. evidence_hash covers the full source envelope,
not metric values/date alone. content_hash covers schema/template versions, rule,
original P0 ID, observation, caveats/evidence and exact checklist, excluding all nested clock-derived ages/today-status fields.
Store full original insight (including quality_at_save) and original source rather
than rendering historical text with future rules. Keep P0 ID for audit, not as a
client-controlled unique key.

## Proposed API/UI and concurrent save

`POST /api/projects/[slug]/atlas/analysis-drafts` accepts exactly
`{ruleId, ruleVersion, expectedEvidenceHash}`, max 4 KiB; reject unknown fields.
Save button receives the hash from server-rendered analysis.
Reuse same-origin validation (`lib/atlas/executive/http.ts`) and
`resolveProjectAccess` (`lib/auth/project-access.ts:49`).
Derive user from session; prove current owner scope and fixed HB ID+slug **before**
privileged source reads. No caller allow-list, actor, clock or first-project fallback. Verify current session
ownership on every GET as well; a prior save is not continuing access permission.

Route reloads authoritative source, derives P0 with server clock, validates proposal/
quality and builds immutable payload. Service-only RPC locks project FOR UPDATE and
rechecks ownership against the session-derived actor, identity and observer/active mode.
This serializes draft writers even when no draft exists. RPC reads bounded source in
one DB statement, locks selected snapshot rows FOR SHARE, recomputes source hash,
compares route payload and checks DB-clock freshness. Changed evidence, quality,
mode, unsupported rule version or non-proposal → 409 with no insert.
RPC trusts the internal rule-derived payload, not HTTP JSON; constraints validate
project/source/closed schema. Actor comes only from authenticated route code.

The source-read statement is the evidence observation point. Selected-row refreshes
wait for commit. New snapshot/audit inserts after that point can yield newer evidence
on reload; **do not promise latest-at-commit** or that collectors take the project
lock. Saving is an observation of evidence for manual review, not execution readiness.
Reload must display newer-evidence warnings for these insert races.

Check unique identity before any supersede action. Identical concurrent saves/
lost-response retries return one committed UUID, created=false, no duplicate events.
Different immutable content under the same identity → conflict, never overwrite.
New authoritative evidence inserts once and supersedes the latest unsuperseded draft
in the project/workflow/rule stream, including across rule versions. Do not sort
lexical versions or observation time alone: quality upgrades may move time backwards.
A retry while source is unchanged returns the existing draft; after newer source arrives,
an old selector yields 409 and its historical record remains reachable through GET.
It never resurrects a draft or supersedes newer evidence. Project lock + uniqueness +
transaction rollback enforce this; fake store alone cannot prove concurrency.

201 new committed draft; 200 existing committed identity; 400 malformed; 401 no session;
404 unknown/foreign project/draft (same answer); 409 evidence/mode/quality/version drift;
503 storage unavailable. No optimistic saved label, fake status or localStorage store.
GET list/detail use current ownership, project filters, named columns and cursor
pagination (20/page). Historical frozen evidence is separate from current warnings.

UI: only Atlas Intelligence gains Save later. Success shows “Sparat analysutkast ·
Att granska” and persisted UUID/link; authenticated reload must recover it.
Project-local “Sparade analysutkast” list/detail is the first review surface.
Do not integrate the global run-approval queue. Pending/error/retry retains the proposal.
There is no approve/run/publish button or review-decision endpoint in this slice.

## Quality, freshness and observer safety

New save requires valid/fresh latest observation (age ≤26 h, not future, zoned and
matching UTC date), usable completeness and known selected-rule metrics; readable
audit with a last attempt and no latest failed attempt. P1 deliberately tightens P0's
unknown-audit case: display existing analysis/warning but refuse save until audit exists.
Partial can save if required metrics are known. Preserve population caveat, unknown
historical collector version and unknown rolling coverage; saving verifies none of them.
No conversion, causality, demand, rolling trend, PostHog or competitor evidence is added.

fresh_until=latest observed_at+26 h. GET derives stale from server clock; no expiry cron.
Frozen quality never changes. Superseded comes from the event; newer unsaved evidence
shows “Nytt underlag finns” without rewriting history. Failed/unknown current audit,
changed required values or withdrawn rule version needs new assessment. Failed current
source read means applicability unknown, while authorized historical evidence remains.
Hibernate/archived allow historical owner reads but refuse new saves.

Explicit internal annotation remains available while execution is stopped, consistent
with interactive assistance. Never interpret a stop decision as an execution grant.
No mode/pause/resume changes. **No workflows, instances, runs, workflow actions,
approvals, authorization requests/grants or dispatch grants are created.**
No authoring/tick/gate/rearm/drain/provider/publish/feedback-memory invocation.
A later execution slice needs its own live mode/stops, canonical action/policy, exact
target/evidence binding, cost and human authority review. Reviewing a draft cannot
license execution; even a future content-review decision must remain separate.

## Actual blockers and selected resolutions

| Inspected blocker | Resolution |
|---|---|
| No isolated persistent analysis entity | Two tables/narrow RPC after written design and implementation-plan review; no P1 product writes in this preflight. |
| Today's source row mutable, report loses IDs/raw provenance | Extend scoped source bundle, freeze full bounded input, verify live hash with selected-row locks. |
| Long P0 encoded ID and clock-dependent quality ages | Keep ID for audit; bounded SHA-256 selector, stable source encoding and TS/SQL parity tests. |
| Validator expects executable agent/trigger steps | New closed analysis schema; never call validate/save_workflow or instantiate. |
| Run-bound approval/RLS/queue and publish-on-approve | Project-local inspectable draft view; no dummy run/orphan approval/approved status. Review decisions are a separate later contract. |
| Unknown audit/provenance/window coverage | Require readable audit to save; preserve remaining unknowns and limit outcome to manual checks. |
| Live migration/grants unverified; guard enforces ledger names | Isolated SQL verification first; later explicit operator apply/deploy with actual ledger/grants/triggers/hash verification. No guard bypass or live DB verification here. |

## Explicit staged acceptance

1. **Written design → implementation-plan review.** Confirm proposal-only, isolated
   storage and no execution/review decisions. Preflight ends with UI draft PR and spec.
2. **Pure/fake-store tests, no deployment.** Company 10/6; bids total 2 / rolling 0;
   null/0; partial required/unrelated missing; 26 h boundary; future/timezone/date errors;
   unknown/failed audit; withdrawn version; hashes stable across key order/age;
   equal values but changed evidence; same key/different content conflict; executable
   checklist fields rejected; idempotent retry and no old-draft resurrection.
3. **Isolated local SQL.** Anon/authenticated/service grants and RLS, immutable triggers,
   foreign actor/project/mode, TS/SQL hashes, concurrent same-evidence single insert/event,
   changed-evidence serialization, refresh between read/save refusal, new source inserted
   after observation → warning, failed transaction rolls back draft/supersede together.
   No external DB. Fake-store tests alone do not satisfy this gate.
4. **API/UI with fake DB and denied egress.** Ownership before reads/writes; forged
   actor/mode/clock/payload rejection; 409/503/200/201; lost-response retry; real persisted
   reload/detail/pagination; retired-mode history; stale/superseded/unknown labels;
   keyboard/focus/error and narrow/wide layout. Captured calls prove zero writes to all
   runtime/approval/authority tables and zero provider/LLM/PostHog/scheduler calls.
5. **Separate storage activation review.** Local gates first, then explicit operator
   migration/grants/deployment approval; default feature flag off. Protected preview
   must not write production for testing. READY does not prove storage readiness.
   Disable flag to hide/refuse Save; retain history, no destructive rollback.
   No execution activation follows from this acceptance.

## This preflight's verification

Seven focused suites: marketplace-report 39, overview 22, page-performance 4,
visual-pulse 7, dashboard-design-v2 2, insights 25, workflow-authoring 8.
Baseline **107/107**, final **107/107**. Updated pulse expectations failed against
duplicate cards before removal, then passed. Fixtures/mocked DB, no live reads.
Typecheck: baseline and final same three lambda-render.ts errors (missing
@remotion/lambda/client; two region-on-unknown errors), **delta zero**.
Scoped ESLint next/core-web-vitals passed through temporary config. next lint itself
cannot run unattended because repository has no ESLint config; none was added.
Diff whitespace check passed. Visual review remains with the owner in logged-in preview.
