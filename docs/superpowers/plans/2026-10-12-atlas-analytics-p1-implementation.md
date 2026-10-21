# Atlas Analytics P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the authenticated Handlarbörsen owner save existing proposal insights as immutable internal analysis drafts and reopen their original evidence and manual checks after reload.

**Architecture:** Reuse P0 derivation and the scoped report reader, adding a raw source bundle and a separate analysis contract. Two append-only tables and one service-only atomic RPC bind saves to current source evidence; project-local history separates frozen evidence from present applicability. This is observer assistance with no execution or review decisions.

**Tech Stack:** Existing Node >=20, TypeScript, Next.js 14.2.29/React 18, Vitest 2, Supabase/PostgreSQL, node:crypto SHA-256; no new product dependencies.

**Spec:** `docs/superpowers/specs/2026-10-12-atlas-analytics-p1-design.md` (approved); read it alongside this plan.

## Global Constraints

- "The smallest slice saves only existing `company-status` and `bid-window` insights of kind `proposal`."
- "No editing, review decisions, new business rules, LLM, scheduler, execution or automatic collection is included."
- "No workflows, instances, runs, workflow actions, approvals, authorization requests/grants or dispatch grants are created."
- "No authoring/tick/gate/rearm/drain/provider/publish/feedback-memory invocation."
- "No mode/pause/resume changes." Execution stops do not prevent explicit internal annotation and never grant execution.
- "Do not run its remote ledger check or weaken/override the guard." Canonical migrations: `apps/web/supabase/migrations`; root history stays untouched.
- "default feature flag off." Use server-only `ATLAS_ANALYSIS_DRAFTS_ENABLED === 'true'`; no env/secrets changes in implementation.
- "No external DB." All implementation verification uses fixtures, fake DB or a named disposable local DB with denied external egress.
- Freshness age ≤26 h, not future, zoned and matching UTC date; partial permits known required metrics, unknown/failed audit refuses save.
- Full bounded source ≤30 snapshots and ≤30 audit rows; history 20/page; POST body max 4 KiB.
- Unknown population, historical collector version and rolling coverage stay unknown. No causal/conversion/demand/rolling-trend/competitor/PostHog evidence.
- No protected-preview fetch/share links, production testing, collection-frequency changes or unrelated cleanup.
- This branch changes only this plan and the code-only freshness note. All tasks below are future work after human plan review, using Codex via Desktop Commander.

## Review Focus

1. Same UUID/date with refreshed or older-but-better source must invalidate the old selector; Task 2 raw-bundle and Task 4 race tests own this.
2. Unicode, timestamp precision and SQL bigint values must hash identically across TS/SQL without losing nulls; Tasks 1/4 own parity fixtures.
3. Identical requests, changed evidence and lost responses must commit one identity/event and never resurrect old drafts; Tasks 3/4/5 own these cases.
4. Ownership/mode can change between rendering, reading and saving; Tasks 2/4/5 prove gates before evidence/history admin reads and inside the transaction.
5. History can remain readable while current evidence is stale/unavailable or pagination changes; Tasks 5/6 prove honest warnings, stable cursors, reload and failure recovery.

---

## Source anchors and file boundaries

All paths below are repository-relative. New names are deliberate; no entity is named WorkflowDraft.
Existing interfaces: `deriveHandlarborsenInsights(report: MarketplaceReport, now: Date)` returns evaluatedAt/quality/insights;
`loadHandlarborsenMarketplaceReport(project: {id:string;slug:string}, scope: MarketplaceReadScope, options?: MarketplaceReadOptions)`;
`buildMarketplaceReport(rows, now?, runs?)`; `canonicalJson(value: unknown): string` in `apps/web/lib/atlas/mission/binding.ts`.
`resolveProjectAccess(): Promise<ProjectAccess>` returns session-derived userId and owner IDs; its admin ownership enumeration is permitted, evidence reads are not yet permitted.
`assertSameOrigin(request: Request): NextResponse|null` is reusable, but `readJsonBody` has no size bound and is insufficient alone.
`getProjectBySlug` is RLS-bound and request-cached. `createAdminClient` forces fetch no-store.
The present reader selects no snapshot/audit IDs; P0 snapshotRef is descriptive. Today's snapshot is mutable through the guarded store.

Create focused modules under `apps/web/lib/atlas/project-analytics/`:
`analysis-review-contract.ts` (closed types, stable projections), `analysis-source-binding.ts` (evidence encoding),
`handlarborsen-marketplace-source.ts` (shared server reads), `analysis-draft-store.ts` (only persistence adapter),
`analysis-draft-service.ts` (session boundary orchestration), `analysis-draft-feature.ts` (default-off switch).
Each task owns the exact tests listed below; there is no generic final test-writing task.
Commands use repo root unless a task says `apps/web`; install with `npm ci` only in the future implementation worktree.

### Task 1: Pure source binding and closed review contract

**Files:** Create the contract/binding modules above; create `apps/web/lib/qa/analysis-review-contract.test.ts`,
`apps/web/lib/qa/analysis-source-binding.test.ts`, `apps/web/lib/qa/fixtures/analysis-source-parity.json`.
Read P0 insights/report/collector metric definitions and mission binding; do not change P0 rules.

**Interfaces:**
- `AnalysisRuleId = 'company-status'|'bid-window'`; `SaveSelector = {ruleId:AnalysisRuleId;ruleVersion:string;expectedEvidenceHash:string}`.
- `AnalysisSourceEnvelopeV1`: schemaVersion=1, reportContractVersion='handlarborsen-marketplace-report-1', projectId/slug, snapshots, auditReadable, runs, semantics.
- Snapshots retain named raw columns from SNAPSHOT_SELECT_COLUMNS plus id; counts are nullable decimal strings, timestamps canonical UTC with six fractional digits.
- Runs retain id/project_id/collector_id/status/ran_at/snapshot_date/storage_outcome (nullable); semantics freeze MARKETPLACE_METRIC_DEFINITIONS plus population-unverified and unknown rolling coverage/version.
- `AnalysisReviewDraftV1`: schemaVersion=1, workflowKey='handlarborsen.manual-insight-review', projectId, ruleId/ruleVersion, originalInsightId,
  evidenceHash/contentHash, sourceEnvelope, insight: Extract<HandlarborsenInsight,{kind:'proposal'}>, manualSteps: readonly string[], evaluatedAt/freshUntil.
  created_by/id/created_at belong to persisted rows, never HTTP inputs.
- `encodeAnalysisSource(source:AnalysisSourceEnvelopeV1):string`; `hashAnalysisSource(source):string`;
  `buildAnalysisReviewDraft(source, report:MarketplaceReport, selector:SaveSelector, now:Date): {status:'ok';draft:AnalysisReviewDraftV1}|{status:'conflict'}`.
- `validateAnalysisReviewDraft(value:unknown):AnalysisReviewDraftV1|null`; `analysisContentProjection(draft):unknown`.

- [ ] Write named failing cases: `company_10_6_and_bids_2_0_are_proposals`, `null_is_not_zero`, `partial_required_vs_unrelated_missing`,
  `fresh_26h_inclusive`, `future_unzoned_date_mismatch_refused`, `unknown_failed_audit_refused`, `fact_quality_withdrawn_version_refused`,
  `closed_schema_rejects_executable_fields`. Assert exact source metrics, P0 caveats, unknown provenance and three ordered text-only manual steps.
- [ ] Run `npm test --workspace=apps/web -- lib/qa/analysis-review-contract.test.ts lib/qa/analysis-source-binding.test.ts`; expect missing modules/exports, then behavioral failures.
- [ ] Implement the listed exports: rederive P0 on the server clock; require readable audit/lastAttempt/no latest failure; require selected proposal at current HANDLARBORSEN_INSIGHT_RULE_VERSION.
  Steps are "Inspect the cited report", the exact P0 nextCheck, "Record the result outside this analysis draft"; do not add action metadata.
- [ ] Define evidence bytes as canonicalJson of a fixed ordered tuple: contract tags, project identity, auditReadable, semantic definitions, ordered snapshot tuples, ordered audit tuples.
  Each nullable string becomes null or lowercase hex of its UTF-8 bytes; counts use exact decimal strings; no arbitrary JSON is serialized by SQL.
  Semantics use ordered [key,label,group,kind,populationCaveat,coverage,collectorVersion] tuples, with hex/null strings and null for unknown provenance; no unordered objects enter SQL bytes. Tags/semantics are fixed versioned constants; integers schema/window serialize as decimal numbers and auditReadable as boolean. Tuple string fields use the same hex/null rule in both languages.
  Snapshot tuple field order: id, project_id, snapshot_date, observed_at, captured_at, schema_version, window_hours, completeness,
  then each MARKETPLACE_METRIC_KEYS value/reason pair in its existing order. Audit order: id, project_id, collector_id, status, ran_at, snapshot_date, storage_outcome.
  Snapshot order date DESC/id DESC; audit ran_at DESC/id DESC. Validate unavailable keys/reasons; reject unrepresented raw fields rather than silently drop meaning.
  SQL constructs the same compact tuple bytes; never hash jsonb::text. Normalize DB timestamps without JS millisecond truncation; preserve microseconds in source identity.
- [ ] Define contentHash as SHA-256(canonicalJson(analysisContentProjection)); include schema/template versions, rule, original P0 identity, observation, all evidence/caveats/checklist.
  Decode the original P0 ID's URI JSON and remove clock-derived collection today/status/ages recursively for its stable identity projection; store originalInsightId unchanged.
  Exclude evaluatedAt, freshness age/today outcome and nested evidence.quality clock fields from content identity; retain them in frozen insight/quality_at_save.
  Test `key_order_and_clock_stable`: equal source at two fresh clocks gives equal hashes; IDs/raw reasons/audit outcomes/full bounded rows changing gives unequal evidence hashes.
- [ ] Pin assertions in the owned tests, e.g. `expect(build(unknownAudit).status).toBe('conflict')`, `expect(build(at26h).status).toBe('ok')`, `expect(hash(sameRowsNewAge)).toBe(hash(original))`, `expect(hash(sameUuidNewCapture)).not.toBe(hash(original))`; `build` is the test wrapper around buildAnalysisReviewDraft with its fixture report/selector/clock.
- [ ] Populate parity fixtures with complete/partial/null-vs-zero, Swedish/emoji/quotes/control characters, offset-equivalent timestamps, six-digit microseconds,
  max safe integer and out-of-range bigint rejection, equal-time ID ties, empty/unknown audit and key reorder. Pin expected encoding and 64 lowercase hex hashes.
- [ ] Rerun both suites; expect all pass with no skipped cases and no I/O; commit only Task 1 paths: `feat(atlas): define immutable analysis review contract`.

### Task 2: Shared scoped raw source loader

**Files:** Create `handlarborsen-marketplace-source.ts`; modify `handlarborsen-marketplace-read.ts` to consume shared reads;
create `apps/web/lib/qa/analysis-source-read.test.ts`. Existing report/insights/page-performance suites are regressions.

**Interfaces:**
- `readMarketplaceSourceRows(project:{id:string;slug:string},scope:MarketplaceReadScope,options?:MarketplaceReadOptions)`
  returns `{status:'not_permitted'}|{status:'ok';report:MarketplaceReport;source:AnalysisSourceEnvelopeV1|null}`.
- `loadHandlarborsenAnalysisSource` aliases that read boundary for P1. Existing public report loader retains its exact return type and failure semantics.
- Named snapshot select adds id; audit select adds id/project_id/collector_id, retaining storage_outcome alias. No extra read per panel.

- [ ] Write `denied_scope_never_creates_admin`, `fixed_id_and_slug_required`, `live_mode_before_source_reads`, `full_30_rows_and_id_ties_bound`,
  `audit_failure_keeps_report_but_blocks_save`, `refresh_same_uuid_changes_hash`, `older_quality_upgrade_changes_hash` with captured query order/columns.
- [ ] Run `npm test --workspace=apps/web -- lib/qa/analysis-source-read.test.ts`; expect missing helper or wrong raw columns.
- [ ] Extract the common bounded reads without changing page report content: session ownership is established by the caller; fixed ID+slug and live observer/active mode precede snapshot/audit reads.
  Normalize raw rows for identity, build report with safe number conversion, and distinguish audit unreadable from empty. Include every consumed raw row, including invalid rows; invalid source refuses saving.
  Existing overview/brief share one report. P1 selector is composed from that same source bundle, never an independent later query.
- [ ] Run new suite plus `handlarborsen-marketplace-report.test.ts`, `handlarborsen-insights.test.ts`, `handlarborsen-page-performance.test.ts`;
  expect existing results/query parallelism preserved, no collector/network calls. Commit Task 2 paths: `refactor(atlas): share scoped marketplace source evidence`.

### Task 3: Persistence adapter and fake-store lifecycle

**Files:** Create `analysis-draft-store.ts`; create `apps/web/lib/qa/analysis-draft-store.test.ts`.

**Interfaces:**
- `SavedAnalysisDraft = AnalysisReviewDraftV1 & {id:string;createdBy:string;createdAt:string}`.
- `AnalysisDraftStore.save(actorId:string,draft:AnalysisReviewDraftV1):Promise<{status:'ok';id:string;created:boolean}|{status:'not_found'|'conflict'|'unavailable'}>`.
- `list(projectId:string,cursor:{createdAt:string;id:string}|null):Promise<{items:SavedAnalysisDraft[];nextCursor:string|null}>`;
  `get(projectId:string,id:string):Promise<SavedAnalysisDraft|null>`; `events(projectId:string,draftIds:readonly string[]):Promise<AnalysisDraftEvent[]>` where `AnalysisDraftEvent = {seq:string;draftId:string;kind:'created'|'superseded';supersededBy:string|null;actorId:string;occurredAt:string}`. Adapter accepts injected DB for tests.
- Adapter RPC: `atlas_save_analysis_draft(p_actor_id uuid,p_payload jsonb) RETURNS jsonb` -> status/id/created; no direct table writes.
  List/detail select named columns and project filters; stable order created_at DESC/id DESC, 20 items, fetch 21 to detect next page.

- [ ] Write `same_identity_retry_one_id`, `same_key_different_content_conflict`, `new_evidence_supersedes_once`,
  `old_selector_never_resurrects`, `rollback_preserves_old_current`, `cursor_ties_no_duplicates`, `foreign_detail_filter`.
  Fake store models unique project/workflow/rule/version/evidence identity and created/superseded events; label this non-concurrency evidence.
- [ ] Run `npm test --workspace=apps/web -- lib/qa/analysis-draft-store.test.ts`; expect missing adapter.
- [ ] Implement only the RPC/read adapter and fake test seam. Map sanitized RPC not_found/conflict/unavailable results; never echo SQL errors or substitute localStorage.
- [ ] Rerun suite; assert writes captured are exactly one permitted RPC per attempt and no runtime writes; commit Task 3 paths: `feat(atlas): add analysis draft persistence adapter`.

### Task 4: Additive migration, guard integrity and isolated real SQL verification

**Files:** Create `apps/web/supabase/migrations/20261012120000_atlas_analysis_drafts.sql`;
`apps/web/scripts/verify-analysis-drafts-local.mjs`, `apps/web/lib/qa/fixtures/analysis-drafts-local-bootstrap.sql`,
`apps/web/lib/qa/analysis-draft-sql.test.ts`; modify `apps/web/scripts/migration-guard-policy.mjs` and `apps/web/lib/qa/migration-guard-v2.test.ts`.
No migration file is created by this planning task.

**Interfaces:** Implement Task 3 RPC; private `atlas_analysis_source_encoding(p_project_id uuid) RETURNS text` uses Task 1 encoding.
New tables match the spec: non-null RESTRICT project FK, schema=1, closed workflow/rule/hash fields, source/insight/manual_steps JSONB, actor and timestamps.
Events: UUID id, identity seq, project_id/draft_id, created|superseded, superseded_by nullable, actor_id/occurred_at.
Unique draft identity; composite (project_id,id) FKs including successor; one created per draft and one superseded per old draft.

- [ ] Write SQL scenarios first in runner/test harness: grants/RLS; anonymous/authenticated RPC denial; service direct INSERT/UPDATE/DELETE/TRUNCATE denial;
  immutable trigger rejection (including table-owner UPDATE/DELETE); cross-project event links; forged actor/wrong slug/retired mode;
  unknown/failed audit, required null, fresh boundary and expired during wait; parity for every Task 1 fixture.
- [ ] Run `node apps/web/scripts/verify-analysis-drafts-local.mjs`; expect missing migration/function, not a skipped suite.
- [ ] Implement migration: RLS on/no client policies, revoke PUBLIC/anon/authenticated/service direct mutations, service SELECT only;
  SECURITY DEFINER/search_path='' with qualified objects, service-only EXECUTE; revoke helper/sequence access from clients.
  Require pgcrypto digest at its verified extension schema (bootstrap uses extensions.digest); qualify it and fail prerequisites if unavailable, never dynamically trust search_path.
  Mutation-rejection triggers on drafts/events (row UPDATE/DELETE and statement TRUNCATE); JSON allowlists recurse into executable-field exclusions.
  Restrict payload columns/versions and enforce immutable JSON schema without executable lineage fields/FKs.
- [ ] Implement RPC transaction: lock project FOR UPDATE first; recheck owner_id against actor, fixed ID+slug and observer/active.
  One source-read statement selects bounded snapshot rows FOR SHARE in deterministic order and audit rows in the same MVCC statement snapshot.
  Recompute encoding/hash; compare payload source/evidence hash; DB clock after lock waits validates freshness/required metrics/audit/proposal/version. For company-status SQL requires registered > verified; for bid-window rolling=0 with known total; current supported version is exactly 'handlarborsen-insights-1.0.0'.
  Check existing unique identity/content BEFORE supersede; identical identity returns existing UUID/created=false even if superseded.
  New identity inserts once, then supersedes latest unsuperseded project/workflow/rule draft across rule versions; use event seq, never lexical version or observed time.
  Raise/return conflict without partial mutations; draft+created+superseded events commit together. Rule text is trusted only from internal server builder, not HTTP.
- [ ] Implement runner with a unique container name `omnira-atlas-p1-local`, cached image `public.ecr.aws/supabase/postgres:17.11.0.004`,
  `--network none`, no ports/production env, synthetic local password, docker exec psql ON_ERROR_STOP.
  Fail if name already exists; never attach to or reset another container. Bootstrap only roles/auth identity, minimal projects/collector_runs dependencies;
  apply actual committed P1B, P1E, then P1 SQL in order. Minimal fixture is not a claim that all 112 historical migrations replay.
  Assert catalog prerequisites/default role grants before tests. Construct fresh fixture observations on DB-clock UTC date even at midnight; historical/expiry tests use valid UTC-date pairs and explicit lock-held expiry, never midnight skips.
- [ ] Run TS encoding fixture generator and SQL encoding against the same persisted fixture rows; assert exact bytes and SHA-256, not just digest format.
  Use 12 independent psql sessions for same-evidence save: one UUID/draft/created event, exactly one created=true.
  Use explicit session barriers (`pg_locks`/runner IPC), not sleep timing, for refresh-before-read conflict, refresh-after-share-lock waiting,
  owner/mode change while project lock waits, changed-evidence serialization, old retry after new source, and injected rollback after draft insert.
  Audit/snapshot INSERT after the observation statement is permitted: commit original observation, then reload hash differs and applicability warns.
  Also mutate selected audit row after route read: before RPC observation -> conflict; after observation -> reload warning. Never promise latest-at-commit.
- [ ] Add guard work without bypass: exact name `atlas_analysis_drafts` is enforced; reviewed canonical/enforced pins become 113/99 from 112/98.
  Freeze grandfathered=14 and legacy-only=30; add missing-P1 rejection and synthetic post-apply fixture=136 from 135, explicitly hypothetical.
  Existing P1B/P1E pre-apply tests include P1 when isolating missing old names; their 133/134 fixture counts become 134/135, and post-P1E synthetic fixture assertions become 136. Preserve missing-old-name rejection rather than accidentally failing only on P1.
  Do not report synthetic fixture as actual ledger evidence; leave remote guard fail-closed until operator application.
- [ ] Run `npm test --workspace=apps/web -- lib/qa/analysis-draft-sql.test.ts lib/qa/migration-guard-v2.test.ts` and local runner;
  require nonzero assertions/zero skips, all privileges/concurrency/parity checks pass. `node --check` both guard modules; no remote guard run.
- [ ] Add runner mode `--mode=canonical-replay` in a second uniquely named network-none container: Supabase auth/extensions bootstrap, `packages/db/full_schema_run_in_supabase.sql`, then all canonical SQL filenames sorted ascending, ON_ERROR_STOP per file. Do not include root historical migrations or silently skip failures. This is a diagnostic full replay gate: record the first failing file/object and block a full-replay claim; repairing unrelated history needs separate scope. Disable local cron workers so historical scheduler definitions cannot initiate calls.
- [ ] Record migration SHA-256 and dependency replay transcript in future `docs/atlas-analytics-p1-local-verification.md`;
  explicitly record full historical replay NOT proven. Commit Task 4 paths plus this verification record: `feat(db): add atomic immutable analysis drafts`.

### Task 5: Owner API, authoritative saves and historical applicability

**Files:** Create `analysis-draft-service.ts`, `analysis-draft-feature.ts`;
`apps/web/app/api/projects/[slug]/atlas/analysis-drafts/route.ts`,
`apps/web/app/api/projects/[slug]/atlas/analysis-drafts/[id]/route.ts`;
`apps/web/lib/qa/analysis-draft-api.test.ts`.

**Interfaces:**
- POST selector only; return 201/200 `{id:string;created:boolean;href:string}`. No caller actor/mode/clock/quality/evidence/text or injection fields.
- GET list `{items:AnalysisDraftView[];nextCursor:string|null}`; GET detail `AnalysisDraftView`.
- `AnalysisDraftView = {draft:SavedAnalysisDraft;supersededBy:string|null;stale:boolean;applicability:'current'|'new_evidence'|'needs_assessment'|'unknown'}`.
- `saveAnalysisDraft(slug:string,selector:SaveSelector):Promise<SaveResult>`; `listAnalysisDrafts(slug:string,cursor:string|null)`;
  `getAnalysisDraft(slug:string,id:string)`. `SaveResult = {status:'ok';id:string;created:boolean}|{status:'no_session'|'not_found'|'conflict'|'unavailable'}`; list returns `{items:AnalysisDraftView[];nextCursor:string|null}` or the same failure statuses; detail returns AnalysisDraftView or those failures. Transport malformed separately.
- `analysisDraftsEnabled(env:NodeJS.ProcessEnv):boolean`; only literal true enables POST/Save. Historical owner GET remains available when switch is off.

- [ ] Write `auth_before_privileged_evidence_or_history`, `no_first_project_fallback`, `live_owner_revoked_after_render`, `mode_change_rpc_refusal`,
  `origin_required`, `streamed_4096_bytes_limit`, `all_unknown_fields_rejected`, `disabled_post_no_reads_or_rpc`,
  `201_200_409_503_no_false_success`, `lost_response_retry_same_id`, `retired_mode_history`, `cursor_invalid_foreign_missing_same_404`.
- [ ] Run `npm test --workspace=apps/web -- lib/qa/analysis-draft-api.test.ts`; expect missing service/routes.
- [ ] Implement current session resolution on every request, RLS slug resolution, allowed owner ID and fixed HB identity before evidence/history admin reads.
  Admin ownership enumeration and live project-mode check are prerequisites, never unscoped draft/source queries.
  POST: switch, same-origin, bounded streamed JSON (Content-Length alone insufficient), exact keys/rule/hash syntax; reload source, rederive using server clock, call RPC.
  Return 400 malformed/oversize, 401 session absent, uniform 404 unknown/foreign, 409 drift/nonproposal/quality/version/mode/disabled, 503 unavailable;
  same-origin refusal retains helper's 403. Auth loss at transactional owner check maps uniform 404, not evidence drift.
- [ ] Implement private no-store GET/list/detail and validated opaque cursor (base64url createdAt/id); fetch scoped persisted rows/events first.
  For hibernate/archived, no privileged current source read: history stays available, applicability needs_assessment.
  Frozen quality stays immutable; stale is server-now > freshUntil; event derives superseded; source hash drift gives new_evidence;
  current failed audit/withdrawn rule/required value change gives needs_assessment, unreadable source gives unknown. Never hide authorized history on current-read failure.
- [ ] Rerun suite with fake DB and fetch denied. Capture all calls: only P1 RPC writes; zero workflows/instances/runs/actions/approvals/authority/dispatch,
  providers/LLM/PostHog/collectors/scheduler/publish/memory. Commit Task 5 paths: `feat(atlas): expose owner-scoped analysis draft API`.

### Task 6: Save UI and persisted project-local review surface

**Files:** Modify `apps/web/app/(platform)/projects/[slug]/page.tsx`,
`apps/web/components/platform/vnext/HandlarborsenOverview.tsx`, `HandlarborsenInsights.tsx`, `HandlarborsenInsights.module.css`;
create `AnalysisDraftSave.tsx`, `AnalysisDraftHistory.tsx`, `AnalysisDraftHistory.module.css` in that component directory;
create `apps/web/app/(platform)/projects/[slug]/atlas/analysis-drafts/page.tsx` and `[id]/page.tsx`;
create `apps/web/lib/qa/analysis-draft-ui.test.ts`, `apps/web/lib/qa/analysis-draft-ui.browser.test.ts`.

**Interfaces:** Insights/Overview accept optional `analysisSelectors:Partial<Record<AnalysisRuleId,SaveSelector>>` and projectSlug;
`AnalysisDraftSave({slug,selector})` is the only client write component. `AnalysisDraftHistory({items,nextCursor,slug})` renders Task 5 views.
Page composition reads one shared source/report only when enabled; when disabled use existing report path without new P1 reads.
Server list/detail pages use service entry points, never HTTP loopback/admin queries in client.

- [ ] Write rendering assertions: Save only for eligible proposals with server selectors; no Save for facts/quality/default-off;
  history shows UUID, frozen evidence/manual steps, original ID, no decision/action buttons, stale/superseded/new/unknown separately.
  Browser tests own keyboard focus, pending/error/retry, response loss, reload and 21-record pagination with equal created_at.
- [ ] Run `npm test --workspace=apps/web -- lib/qa/analysis-draft-ui.test.ts`; expect missing components/props.
- [ ] Implement Save pending state retaining proposal; no optimistic saved marker. On committed 200/201 show exact
  "Sparat analysutkast · Att granska" with UUID/detail link. 409 asks for refreshed assessment; 503 preserves retry; reload calls persisted reads.
  Project link "Sparade analysutkast"; new source warning "Nytt underlag finns"; frozen evidence rendered as saved, never reauthored with future P0.
- [ ] Implement browser verification using existing Vitest host plus a disposable React DOM browser harness; use cached local browser if available.
  Use a Vite localhost fixture server (existing transitive Vite) and browser UI tooling to drive the actual React components; `analysis-draft-ui.browser.test.ts` owns fixture HTTP/persistence/denied-egress checks. Browser-driven interactions are a separate recorded gate, not a claimed Vitest browser runner. First probe browser/tool support; if unavailable, record this gate blocked rather than treating SSR markup tests as interaction proof.
  Intercept all DB/API data with fake persistent store, deny nonlocal requests, reload reconstructed pages from that store; assert accessible name/focus and 360/1440px layouts.
  No new browser framework/product dependency; harness may use browser UI tooling with a localhost fixture server.
- [ ] Run UI suite plus insights/overview/page-performance/dashboard-design-v2 regressions; run browser gate and capture reload/pagination/failure evidence.
  Existing independent traffic widget may remain; P1 handlers/harness never invoke PostHog. Commit Task 6 paths: `feat(ui): save and reopen analysis review drafts`.

### Task 7: Whole-change review gate (still no activation)

**Files:** Update only `docs/atlas-analytics-p1-local-verification.md` with gate evidence.
- [ ] Run all Task 1–6 suites explicitly, `npm run typecheck --workspace=apps/web`, scoped lint and `git diff --check`.
  Compare typecheck to base's three lambda-render.ts errors (missing @remotion/lambda/client and two region-on-unknown); require zero new errors.
  Existing next lint prompts without config: use a temporary external next/core-web-vitals config, do not add unrelated ESLint configuration.
- [ ] Review complete diff against every spec section: pure rules unchanged, full source identity, frozen text, SQL authority/locks/grants, stable retry/supersession,
  GET owner recheck, all UI failure states, feature off. Search call/import graph for all forbidden runtime/egress paths and confirm captured calls agree.
- [ ] Run `node apps/web/scripts/verify-analysis-drafts-local.mjs --mode=canonical-replay`; require a transcript with every canonical filename and digest or an explicit replay blocker. Validate clean dependency replay and no-skips real SQL transcript; explicitly separate it from full-schema replay and fake-store results.
  Reconcile guard counts against latest base at review time if other migrations landed; never resolve count conflicts mechanically.
- [ ] Commit verification record: `docs(atlas): record P1 implementation review gates`. Open reviewable PR; no merge/deployment/DB/env/cron actions.

## Later operator activation — separate approval, not an implementation task

After human code review and all local gates, operator performs separately authorized live read-only inventory of ledger, installed P1B/P1E,
actual grants/triggers/schema and deployed code. Docs and READY status prove none of these.
Compare reviewed committed P1 SQL bytes/SHA-256, dependency order and intended ledger name exactly once; determine operational window/backup/rollback.
Apply only reviewed P1 migration through the approved operator path; verify installed definitions/grants/RLS/immutability/encoding and ledger/hash evidence.
Only then can an enforced-migration Vercel build pass; keep the existing guard enabled. No protected preview writes production.
Deploy approved code with feature off; separately approve enabling Save after storage/API readiness. Off hides/refuses Save but retains history; rollback is flag disable, no data deletion.
Cron activation, PostHog connection, refresh on demand or 5–15 minute collection are separate bounded changes with quota/operational decisions, never consequences of P1.

## Planning evidence, blockers and self-review

Base PR321 OPEN/head `9383827792ce28eece9ede8603798c32efac07e8`; plan worktree branches from that exact commit.
Read exact P0 reader/derivation/report/page/owner auth/same-origin/admin cache/guard interfaces and P1B/P1E SQL plus local verification patterns.
On 2026-10-12 Desktop Commander read-only probes found Docker server 29.8.0 and cached Postgres 17.11.0.004; no host psql, graphify executable or graph.json.
Use docker exec psql (no host client needed). No container/DB/migration/test was created or run by this plan task.
Local feasibility is established for a disposable dependency fixture; bootstrap role/auth/default-grant fidelity and browser harness remain implementation gates.
Full historical replay is unproven and not supplied by the migration guard: any claim requires separate disposable full-schema rehearsal; unrelated historical failures block that claim.
Live storage installation, P1E application/cron activation, production ledger and operational permissions remain unverified; operator review is mandatory before activation.
Self-review coverage: contract/quality/manual steps/hash → 1; source/raw IDs/scope → 2; lifecycle/cursors → 3;
SQL races/grants/guard/dependency replay → 4; transport/auth/history → 5; Save/reload/warnings/pagination/accessibility → 6; no-runtime/egress/review → 7.
All five Review Focus items have task-owned tests; TS/SQL parity avoids jsonb formatting; selected-row updates lock, post-observation inserts only warn on reload.
Types and signatures align across tasks; no product implementation or new tests accompany this plan. Ready for human plan review before implementation.
