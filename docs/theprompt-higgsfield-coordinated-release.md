# Higgsfield PR #514: coordinated, fail-closed release preflight (2026-10-22)

**Status: PREPARATION ONLY. No production schema update, merge, deploy, OAuth consent, key provisioning or paid generation authorized by this document.**
Scope: read-only provider connection; still-image reels remain unchanged and the Higgsfield feature flag defaults off.

## Exact repositories, environment and evidence

- PR: `Bumbi190/ai-operating-platform#514`; feature source `codex/theprompt-video-design-20261022`.
- Original `main` base: `139a45ce199ff73da91a1039f962fe3b3559754d`, canonical SQL 151 / enforced 137.
- Higgsfield feature commit before this note: `f2d76289a5813835fe07bd180a07ab8ef9fafdd6`, canonical SQL 152 / enforced 138.
- Intended production database: Omnira's `AI Operating Platform` Supabase project, confirmed ACTIVE_HEALTHY (Postgres 17); **not** the separate Familje-Stunden or Handlarbörsen databases.
- Read-only production check 2026-10-22: 174 applied migration names; no `higgsfield_mcp_readonly` record; neither `public.media_provider_connections` nor `public.media_provider_oauth_states` exists.
- Intended Vercel app: `ai-operating-platform-web` for `omniraos.se` / `app.omniraos.se`; PR preview fails on `higgsfield_mcp_readonly (fail-closed)`, while local build passes.
- The complete 4-state proof was run using the ACTUAL exported `evaluateAppliedMigrationLedger` function in both git worktrees, with the 174 production ledger names:
  | Repository code | Ledger | Guard result |
  | --- | --- | --- |
  | old main (151) | current 174 | PASS |
  | feature PR (152) | current 174 | FAIL missing Higgsfield |
  | old main (151) | hypothetical 175 including Higgsfield | FAIL unknown Higgsfield |
  | feature PR (152) | hypothetical 175 including Higgsfield | PASS |
- A repeatable synthetic 4-state assertion is now in `apps/web/lib/qa/migration-guard-v2.test.ts`. The synthetic test is not a claim that the migration has been applied.
- Current targeted Higgsfield and security suites were 323/323 green; all seven original GitHub PR workflows were green at `f2d7628`. This note adds a further guard test, which must pass on the new commit before release.
- The old full Vitest suite was **not green** (127 failing files); no blanket baseline classification is made.
- Baseline comparison of 20 representative old failing test files on exact base `139a45c` versus feature `f2d7628`, same machine and command: 19 files had identical failing assertion sets. One additional feature timeout occurred for an unrelated Atlas operator test, which separately PASSED on both commits (feature ~3.09 s, base ~4.14 s using 15-second timeout). This does not prove the entire suite is baseline-equivalent or that timeout sensitivity is fixed.

## Why unilateral migration application is unsafe

The v2 migration guard rejects both missing repository migrations and any UNKNOWN ledger name. **Applying the production DB migration before moving source to the PR code makes subsequent old-`main` Vercel builds fail**, even though the existing live site continues to serve. Merging the code before DB application also fails the NEW build until the ledger catches up. Do not bypass the guard (`MIGRATION_GUARD_OVERRIDE`) or forge ledger records to make previews green.

## Explicit prerequisites before a coordinated release

1. Independent code + SQL review, including the server-only RPC grants, project binding, CAS/lease and recovery. Confirm current main, PR head, migration file contents and all required GitHub checks at release time; rebase/reconcile if other PRs have moved main.
2. Resolve or explicitly disposition the broad-suite differences with evidence against the true merge base; do not label 127 failures pre-existing without comparison. Capture a release checkpoint and current Git/Vercel deployment IDs.
3. Read-only production baseline: migration count and names, linked Supabase project, catalog tables, RLS policies, function EXECUTE grants and relevant security-advisor warnings. A database restore or compatible forward-migration recovery plan must be available.
4. Confirm the production feature flag is disabled and no Higgsfield credentials are configured. Have the protected HTTPS OAuth callback hostname and server-only encryption key provisioning procedure ready but do not expose actual values in Git, chat or logs.
5. Coordinate an actual release window: temporarily avoid unrelated merges/deploys to main. This is necessary to contain the unavoidable temporary guard mismatch.

## Proposed coordinated main release — only after prerequisites are satisfied

**Preferred failure order is merge-first, then production DB application, then verified Vercel redeploy.** This keeps the production ledger valid for the old main until the code merge succeeds. It requires a deliberately anticipated **red initial main build** while the database still lacks the new migration; an old READY deployment keeps serving until a new deployment passes. That short-lived red window is NOT a safe permanent state.

1. Confirm the exact mergeable reviewed commit and production target. Do not start if a competing main deployment or an unreviewed migration is in flight.
2. Merge the reviewed code into main, leaving `HIGGSFIELD_MCP_ENABLED` false. Confirm the current live deployment is still READY. The first automatic Vercel build can fail at the known fail-closed migration guard; no attempt to disable the guard.
3. Immediately apply the *exact reviewed* SQL migration `apps/web/supabase/migrations/20261022075921_higgsfield_mcp_readonly.sql` to the **AI Operating Platform** Supabase project using the supported migration mechanism, recording its canonical ledger name exactly once. Do not apply to either other project.
4. Query the live catalog to verify BOTH new tables, RLS ON, zero client policies, no `anon`/`authenticated` table grants, intended `service_role` rights, callable RPC signatures and absent `PUBLIC`/client EXECUTE grants. Confirm expected ledger membership and that no unrelated migration changed.
5. Verify the new-main source and live ledger now satisfy the guard. Redeploy exactly the reviewed main commit with the feature disabled; require Vercel READY and compare actual deployment SHA. Inspect errors and confirm normal existing image reel flow remains intact.
6. Only after stable deploy, set server-only flag/redirect/encryption key through protected project settings. Do not log, print or commit key material. Redeploy the same reviewed commit if environment updates require it.
7. The owner then completes Higgsfield OAuth consent from the correct project operator session. Run `balance -> fixed read-only quote -> balance` with actual provider schema verification. A quote MUST NOT initiate generation. Compare observed balances, verify project ownership.
8. Leave video mode, generation tools, automatic clip scheduling, media cron changes and future budgets **OFF** until their own reviewed implementation and dry-run/e2e/admission controls pass.

## Contingencies

- **Before merge:** no production changes; simply hold the PR.
- **After merge, before DB application:** keep the previous READY production deployment live. If DB application cannot be completed, revert the feature source in a coordinated commit (including migration source and policy count); verify the old ledger matches the reverted code. Do not use an override.
- **After DB application:** do NOT delete tables, live credentials or ledger names as a casual rollback. A mere source revert to old migration counts will fail all future main builds as UNKNOWN ledger. Prefer leaving new schema inert with the feature flag off while preparing a compatible forward repair. A Vercel alias rollback to a known safe deployment may mitigate runtime faults but does NOT undo the repository/ledger mismatch for new builds.
- Security-advisor baseline on 22 Oct contains pre-existing warnings (20 mutable search-path functions, 7 anon/8 authenticated executable definer findings, and leaked-password setting) as well as informational no-policy server-only tables. These are separate review work; do not treat those counts as new Higgsfield exposure without a before/after diff.

**Do not initiate paid work or promise scheduled video until live read-only proof, credit-governance accounting, hard daily/30-day limits, canonical asset storage and image fallback are implemented and independently checked.**

## Read-only Higgsfield plugin observation (not Omnira OAuth)

On 2026-10-22 the **separately connected ChatGPT Higgsfield application** returned an account balance of **1,170 credits**. Its model lookup confirmed `grok_video_v15_lite` supports 4 seconds, 720p and 9:16; an exact cost-only `estimate_video_cost` quote was **4 credits** for one video, with no job submitted. These results do **not** prove that Omnira's newly coded Clerk OAuth connection, SDK tools/list schema or project binding works; that remains a required later end-to-end read-only smoke. This information is a non-binding budget observation and is not authorization for paid auto-generation.

## Broad baseline run in progress

The isolated main baseline's entire Vitest suite produced an inspectable JSON result on Hultgren (`%TEMP%/omnira-pr514-main-full-20261022.json`): 681 test files, 405 failed tests, 13,539 passed tests, 1,397 pending/skipped. Baseline is **not green**. Identical full-suite run for the Higgsfield branch started after the main run; compare failure signatures (not only counts) before making any full-suite equivalence claim.
