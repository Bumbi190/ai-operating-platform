# Atlas Analytics P1 — local implementation evidence

Approved base: `22923263a09500ebb601a6c38a53e7f91ce808d8` (PR322, still OPEN at that exact head when checked). Isolated branch/worktree: `codex/omnira-atlas-p1-implementation-20261012` / `Omnira/.worktrees/omnira-atlas-p1-implementation-20261012`. Original checkout and other worktrees were not modified.

## Scope

Immutable project-local manual analysis drafts for existing company-status/bid-window proposals. Frozen Swedish P0 insight, original ID, complete bounded source, exact decimal counts/UTF-8 source encoding, owner-scoped API, default-off Save and persisted history. No workflow, instance, run, action, approval, authority, dispatch, provider, collector, scheduler, publishing or memory writes. No PostHog/collection changes. No production DB query, migration, deployment, feature-flag activation, secrets change, preview share link, merge or collector trigger.

## Local SQL

Cached image `public.ecr.aws/supabase/postgres:17.11.0.004`, image ID `sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108`. Runner creates only its uniquely named disposable container, refuses an existing name, uses `--pull=never --network none`, zero port bindings and synthetic credentials. Docker CLI API 1.47 was selected only in the test process for this host's compatibility. Cached image has existing Supabase auth objects; isolated bootstrap/verification uses `supabase_admin`, actual existing roles, explicit default grants and `extensions.digest` catalog check. Cron launch is disabled; only pg_stat_statements is preloaded.

`node apps/web/scripts/verify-analysis-drafts-local.mjs` passed clean dependency replay (actual P1B, P1E, P1 SQL), not the full historical corpus. Exact committed-byte digest transcript is recorded after the final commit below. Migration was scaffolded with cached Supabase CLI 2.118.0 `migration new atlas_analysis_drafts`; actual filename is `20261012183305_atlas_analysis_drafts.sql`, not the plan placeholder.

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

Keyboard Enter Save, 503 alert/retry, lost response after commit, pending disabled state retaining the proposal, committed retry with the same UUID and focus on the detail link all verified. Detail reload recovers frozen source/checklist. Twenty-one equal-created-at records paginate 20 + 1 without duplicates; the final page survives reload. At 360px expanded evidence had scrollWidth345; at 1440px scrollWidth1425. 409 shows a refresh link and no immediate retry. Viewport override reset. Safe screenshots and the interaction summary remain in the retained plan workspace.

API tests use fake DB and denied fetch: authentication/RLS/live-owner prerequisites precede source/history reads; exact selector keys, streamed 4096-byte limit, same-origin, default-off, 201/200/409/503, retry, retired-mode history, cursor/foreign/missing 404 and frozen stale/superseded/new/unknown warnings. Captured writes are only `atlas_save_analysis_draft`.

## Verification status

Final focused suite, broad suite, same-dependency baseline typecheck, scoped ESLint, diff and fresh whole-branch review results will be appended after those gates finish. Prior recorded base had three media errors; fresh implementation typecheck currently passes. A baseline archive with the same nested npm dependencies is also being checked; no media code was modified.

## Rulings

1. Plan's English checklist descriptions are Swedish product text: `Granska den citerade rapporten`, exact P0 nextCheck, `Dokumentera resultatet utanför detta analysutkast`. This changes template identity intentionally; frozen P0 text remains exact.
2. Actual P0 ID is a version-prefixed URI JSON array; slot 2 is freshness, slot 5 is lastAttempt (no today state). Decode this schema and strip known clock projections recursively; keep the full original ID. Future ID shapes require review.
3. Use actual CLI-scaffolded migration filename and exact enforced ledger name. Operator must compare that file/hash, not the plan placeholder.
4. Remove only check-migrations.mjs's hashbang to avoid Vitest 2 VM parsing failure. Node syntax/import passed beforehand; all guard logic remains. Direct Unix executable invocation now requires node; package already invokes node.
5. Continue independent API/UI tasks while Task4 verification is investigated. Completion lines are written only after actual gates; ranges can overlap.
6. Keep mandated project FOR UPDATE and acknowledge FK-delayed INSERTs rather than promise nonblocking insertion. Possible cost is collector insertion waiting for a short save transaction.
7. Use Vite middleware behind Node HTTP listen(0,127.0.0.1) for an actual ephemeral test port, because Vite's port0 config selected 5173. Test-only wrapper, no product dependency.
8. Retain the ledger/worktree until coordinator review, overriding skill cleanup. Cost is retained local ignored evidence.

## Pending production activation (separate approval)

P1 storage installation, actual live grants/triggers/ledger/hash and production readiness remain unverified. The migration stays enforced (113 canonical / 99 enforced, frozen 14 grandfathered / 30 legacy-only). Synthetic post-apply fixture 136 is not a production ledger observation. Preview builds may correctly fail until operator-approved storage activation; the guard is not weakened. Deploy with feature off; enabling Save needs separate storage/API readiness approval. No collection/cron or execution activation follows from this implementation.
