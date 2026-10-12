# Atlas Analytics P1 — local implementation evidence

Approved base: `22923263a09500ebb601a6c38a53e7f91ce808d8` (PR322, still OPEN at that exact head when checked). Isolated branch/worktree: `codex/omnira-atlas-p1-implementation-20261012` / `Omnira/.worktrees/omnira-atlas-p1-implementation-20261012`. Original checkout and other worktrees were not modified.

## Scope

Immutable project-local manual analysis drafts for existing company-status/bid-window proposals. Frozen Swedish P0 insight, original ID, complete bounded source, exact decimal counts/UTF-8 source encoding, owner-scoped API, default-off Save and persisted history. No workflow, instance, run, action, approval, authority, dispatch, provider, collector, scheduler, publishing or memory writes. No PostHog/collection changes. No production DB query, migration, deployment, feature-flag activation, secrets change, preview share link, merge or collector trigger.

## Local SQL

Cached image `public.ecr.aws/supabase/postgres:17.11.0.004`, image ID `sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108`. Runner creates only its uniquely named disposable container, refuses an existing name, uses `--pull=never --network none`, zero port bindings and synthetic credentials. Docker CLI API 1.47 was selected only in the test process for this host's compatibility. Cached image has existing Supabase auth objects; isolated bootstrap/verification uses `supabase_admin`, actual existing roles, explicit default grants and `extensions.digest` catalog check. Cron launch is disabled; only pg_stat_statements is preloaded.

`node apps/web/scripts/verify-analysis-drafts-local.mjs` passed clean dependency replay (actual P1B, P1E, P1 SQL), not the full historical corpus. Final direct replay on committed bytes exited 0 in 48.66s (sql-final-committed.log). Digests: P1B ee59a8c936dc0692715e60b1f4ec2e4870681c9433fbde384ff8d1d434441653; P1E 9cef7582c17b5812aac242c6fafa48d9f8d3f1c86122332cea6edc0d22b2fe20; P1 0582d94689b34e6704c26a830b879741d233ff81a7139bf28ce3642e83000738. No LOCAL UNCOMMITTED BYTES warning appeared. Migration was scaffolded with cached Supabase CLI 2.118.0 `migration new atlas_analysis_drafts`; actual filename is `20261012183305_atlas_analysis_drafts.sql`, not the plan placeholder.

Real assertions cover:

- RLS enabled with no client policies; anon/authenticated SELECT/RPC denial; all three roles denied direct INSERT/UPDATE/DELETE/TRUNCATE. Service SELECT only, service-only save RPC, helpers/sequence access revoked. Owner UPDATE/DELETE/TRUNCATE rejected by immutable triggers; composite project/draft event links reject foreign project.
- Nine pinned fixtures loaded into PostgreSQL: exact TS/SQL tuple bytes and SHA-256, Unicode/emoji/quotes/control characters, six-digit microseconds, null vs zero, partial, safe bigint, equal audit-time ID ties, empty/unknown audit. TS separately tests offset-equivalent normalization, key order and out-of-range bigint rejection.
- Twelve independent psql sessions save identical evidence: one UUID, one draft, one created event, exactly one created=true.
- Same identity/different content conflict; changed source supersedes once; old selector cannot resurrect. Project-lock barriers recheck revoked owner and retired mode. Selected snapshot UPDATE waits on FOR SHARE. Audit UPDATE after observation is allowed; audit/snapshot INSERT waits on the FK's project lock, then commits after the original observation; reload evidence hash changes.
- Injected created-event failure rolls back draft insertion; old stream remains. Unknown/failed audit, skipped audit with NULL outcome, required NULL and stale evidence refuse saves. Exact SQL freshness predicate accepts 26h and rejects +1 microsecond; actual expiry during a project-lock wait refuses insertion.

Observation is the source-read statement, not a latest-at-commit promise. A PostgreSQL FK insertion takes KEY SHARE and therefore waits behind the explicitly required project FOR UPDATE; this real behavior is covered, not hidden.

## Full replay blocker

`node apps/web/scripts/verify-analysis-drafts-local.mjs --mode=canonical-replay` ran in a separate network-none container. First failure: `packages/db/full_schema_run_in_supabase.sql`, missing `storage.buckets`. Canonical migration application was not reached. **Full historical replay is NOT proven.** This diagnostic does not skip a failure or repair unrelated storage/history. Complete transcript stays in the plan's local ledger workspace.

## Browser and API

Real Brave Browser/CUA drove actual React Save/History components in a localhost Vite fixture with server-persisted synthetic records, CSP connect-src self and nonlocal fetch denial. This is component/fixture verification, not a production authenticated session.

Keyboard Enter Save, 503 alert/retry, lost response after commit, pending disabled state retaining the proposal, committed retry with the same UUID and focus on the detail link all verified. Detail reload recovers frozen source/checklist. Twenty-one equal-created-at fixture records paginate 20 + 1 without duplicates; the final page survives reload. This browser pagination is synthetic. A separate production AnalysisDraftStore.list adapter test passes 21 persisted-row-shaped records through both pages, checks scoped project query, descending created_at/id order, six-digit opaque cursor, tied timestamps and no duplicate IDs. At 360px expanded evidence had scrollWidth345; at 1440px scrollWidth1425. 409 shows a refresh link and no immediate retry. After review fixes, repeated keyboard Save, focused detail-link navigation and reload with actual Swedish text; browser-reviewed.png records the final detail. Viewport override reset. Owned browser launcher was stopped. Safe screenshots and the interaction summary remain in the retained plan workspace.

API tests use fake DB and denied fetch: authentication/RLS/live-owner prerequisites precede source/history reads; exact selector keys, streamed 4096-byte limit, same-origin, default-off, 201/200/409/503, retry, retired-mode history, cursor/foreign/missing 404 and frozen stale/superseded/new/unknown warnings. Captured writes are only `atlas_save_analysis_draft`.

## Verification status

All seven tasks completed with per-task commits/ledger. Final explicit gate: **16 suites, 356 passed, zero skipped**, 41.28s. Command:
`npm test --workspace=apps/web -- lib/qa/analysis-review-contract.test.ts lib/qa/analysis-source-binding.test.ts lib/qa/analysis-source-read.test.ts lib/qa/analysis-draft-store.test.ts lib/qa/analysis-draft-sql.test.ts lib/qa/migration-guard-v2.test.ts lib/qa/analysis-draft-api.test.ts lib/qa/analysis-draft-ui.test.ts lib/qa/analysis-draft-ui.browser.test.ts lib/qa/handlarborsen-marketplace-report.test.ts lib/qa/handlarborsen-insights.test.ts lib/qa/handlarborsen-overview.test.ts lib/qa/handlarborsen-page-performance.test.ts lib/qa/handlarborsen-dashboard-design-v2.test.ts lib/qa/handlarborsen-daily-collection.test.ts lib/qa/migration-security-gate.test.ts`.

`npm run typecheck --workspace=apps/web`: exit0, zero errors. Exact approved baseline archived locally with the same root AND nested web dependencies also has zero errors. Known three media errors reproduced using root dependencies only; fresh npm-ci dependency placement resolves them without media edits. **Same-dependency typecheck delta: zero new errors.** Scoped ESLint through temporary external next/core-web-vitals configuration: exit0, no output after rootDir correction. No product lint configuration added. Git diff --check and Node syntax checks on runner/check-migrations/migration-guard-policy pass.

Broad suite with external egress denied, `npm test --workspace=apps/web -- --maxWorkers=2 --minWorkers=1`: 431 files, 327 passed / 71 failed / 33 skipped; 13,478 tests, 11,996 passed / 368 failed / 1,110 skipped, 245.49s. Same-dependency approved baseline: 423 files, 316 passed / 74 failed / 33 skipped; 13,380 tests, 11,889 passed / 377 failed / 1,110 skipped, 213.88s. **Broad suite is red.** Complete sanitized failure-identity comparison is [atlas-analytics-p1-broad-comparison.json](atlas-analytics-p1-broad-comparison.json).

367 final broad failure identities match baseline. One P1-only failure exposed missing created_not_live table-list entries; fixed precisely in a828cc9. Final whole invariant/security-gate rerun: 208 passed / 1 failed (the same inherited Windows BOTH-roots path test); targeted newly affected creation/RLS cases: 2 passed / 74 intentionally excluded by -t. The initial reader-column assertion and unclassified-table gate regressions were also fixed and pass in the 356-test explicit gate. No uncorrected P1-only failure identity remains identified. The full broad suite was not rerun after the final metadata-only list correction. Baseline-only failures include the old guard hashbang parse failure plus canonical-document/archive differences; no unrelated functionality improvement is claimed.

Fresh independent whole-branch review covered complete 2292326..bdbfb65 diff, spec, plan, ledger and recorded evidence. No Critical; two Important accepted/fixed: original P0 timestamp representation/ID preservation and immutable V1 semantics independent of current report copy. Exact offset/variable-precision full-insight tests and mocked future-report module regression pass. One Minor accepted/fixed: actual production pagination adapter coverage. No deferred Minor findings from this reviewer. [Review record](atlas-analytics-p1-whole-review.md) includes declined items; SQL/browser evidence was inspected, not independently rerun by that reviewer. One final correction pass; coordinator's fresh review remains pending.

Final contract derives the frozen insight from the authoritative original P0 report while comparing normalized report/source binding independently. SQL V1 semantics stay pinned independently of future report definitions. Captured owner API writes only the purpose-specific draft RPC; source/history access remains scoped. No new execution/approval/run/workflow/authority/provider/memory/collector writes or external analytics collection were added. Real DB save proof, adapter/API doubles and component-browser fixture proof remain distinct.

## Rulings

1. Plan's English checklist descriptions are Swedish product text: `Granska den citerade rapporten`, exact P0 nextCheck, `Dokumentera resultatet utanför detta analysutkast`. This changes template identity intentionally; frozen P0 text remains exact.
2. Actual P0 ID is a version-prefixed URI JSON array; slot 2 is freshness, slot 5 is lastAttempt (no today state). Decode this schema and strip known clock projections recursively; keep the full original ID. Future ID shapes require review.
3. Use actual CLI-scaffolded migration filename and exact enforced ledger name. Operator must compare that file/hash, not the plan placeholder.
4. Remove only check-migrations.mjs's hashbang to avoid Vitest 2 VM parsing failure. Node syntax/import passed beforehand; all guard logic remains. Direct Unix executable invocation now requires node; package already invokes node.
5. Continue independent API/UI tasks while Task4 verification is investigated. Completion lines are written only after actual gates; ranges can overlap.
6. Keep mandated project FOR UPDATE and acknowledge FK-delayed INSERTs rather than promise nonblocking insertion. Possible cost is collector insertion waiting for a short save transaction.
7. Use Vite middleware behind Node HTTP listen(0,127.0.0.1) for an actual ephemeral test port, because Vite's port0 config selected 5173. Test-only wrapper, no product dependency.
8. Retain the ledger/worktree until coordinator review, overriding skill cleanup. Cost is retained local ignored evidence.
9. Register the two new tables as SERVER_ONLY under existing created_not_live tables/classes, required by repository security gates. This is intended additive local storage classification, not a live catalog claim; no allowlist or guard bypass.

## Pending production activation (separate approval)

P1 storage installation, actual live grants/triggers/ledger/hash and production readiness remain unverified. The migration stays enforced (113 canonical / 99 enforced, frozen 14 grandfathered / 30 legacy-only). Synthetic post-apply fixture 136 is not a production ledger observation. Preview builds may correctly fail until operator-approved storage activation; the guard is not weakened. Deploy with feature off; enabling Save needs separate storage/API readiness approval. No collection/cron or execution activation follows from this implementation.
