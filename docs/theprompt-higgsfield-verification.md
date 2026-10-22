# Higgsfield read-only implementation: verification and decisions

2026-10-22. Base main 139a45c. Branch codex/theprompt-video-design-20261022. Isolated Windows worktree, Node 22.22.3, SDK @modelcontextprotocol/client 2.3.1.

## Delivered scope

Project-owned encrypted OAuth and a vNext Settings panel that reads balance, model parameters and one fixed price quote. No generator registered, no media cron, SimpleNewsReel, social-token or provider-registry changes. No production migration, deployment, paid generation or real-account inspection was performed.

## Evidence

- Focused seven-file Higgsfield Vitest suite: **68/68 PASS** after review fixes. Includes official SDK OAuth against a synthetic HTTP provider, real Next route handlers, cryptography, store adapter, tool allowlist, lifecycle and UI controller/SSR.
- Typecheck: **PASS**, npm run typecheck --workspace=apps/web, exit 0 after fixes.
- SQL: **PASS**, migration and apps/web/supabase/tests/higgsfield_mcp_readonly.sql applied to fresh isolated PostgreSQL 17 database higgsfield_final. Covers denied anon/authenticated CRUD/RPC, RLS, SECURITY INVOKER, actor/state expiry/replay, version CAS, active/expired refresh leases and disconnect.
- UI: **PASS**, actual compiled React panel in Chromium, desktop 1100x750 and mobile 390x844; no mobile overflow, explicit project request, zero balance, and unavailable backend. Stubbed API; not live consent.
- Build before review fixes: **PASS** with process-local nonsecret public Supabase placeholders pointing at an unused localhost port. First attempt without public configuration compiled but failed prerendering existing forgot-password/update-password pages. Final post-fix rebuild also **PASS**, exit 0 (65.02 seconds), using the same process-local public placeholders. No production secrets were read.
- Whole web suite: **FAIL**, 127 failed / 526 passed / 35 skipped files; 421 failed / 13552 passed / 1397 skipped tests, 679.46 seconds. Command: npm test --workspace=apps/web -- --maxWorkers=1 --minWorkers=1. Ran before final review fixes. Full failing-name inventory: [theprompt-higgsfield-full-suite-failures.md](theprompt-higgsfield-full-suite-failures.md). Windows/POSIX command failures, missing fixtures and stale baselines are present; this is not a base comparison, so no assertion that all failures predate this branch. Broad CI/triage remains a merge gate.
- Local SQL checks replace hosted schema advisors for this unapplied migration. Hosted advisors were not claimed run.
- Live Clerk callback, authenticated tool schema compatibility and unchanged credit balance: **NOT TESTED**. Runbook requires reviewed deployment/configuration and operator consent before smoke.

## Independent review

One fresh whole-branch review of 139a45c..98ca1cd. A transient model-capacity error interrupted the review; the same review resumed, without a second review of fixes. No Critical findings. Two Important findings fixed in one TDD pass:

1. SDK auth recovery logged raw provider error_description and retried the code. Actual-driver invalid_grant and invalid_client sentinel tests failed first, then passed. Rejected token/registration responses now stop at a sanitized HTTP boundary before SDK parsing; exactly one exchange and no console warning.
2. Fetch abort did not settle an SDK request reading hanging SSE. Actual SDK hanging-stream and shared refresh/open deadline tests failed first, then passed. Inspection now carries one absolute 20-second provider deadline through refresh, initialization and requests, with SDK request cancellation and transport closure.

Deferred minors:
- A 401 during tools/list bypasses readiness refresh normalization. Inspection can report unavailable; reconnect may be required.
- A transient inspection failure disables another inspect until reload/reconnect.

## Rulings, in decision order

1. Bundled task-start/task-done/sdd-workspace and writing-good-tests helper resources were unavailable. Equivalent manual ledger with bases/commands/results used. Cost if wrong: reconstruct bookkeeping from git/test evidence.
2. Resource metadata advertises Clerk while root metadata advertises a proxy. Pin the resource-bound Clerk issuer. Cost if wrong/provider changes: refuse connection until reviewed.
3. Add a server-only pending-state project peek to recheck ownership before consuming state. Cost if wrong: callback refusal.
4. Generated Database types omit the unapplied migration. Use a narrow nine-name typed RPC port, without weakening shared types. Cost if wrong: runtime RPC mismatch; local adapter/SQL checks provide coverage.
5. Expired abandoned refresh leases must permit a new OAuth save, while active leases exclude it. The SQL regression failed first, then passed. Cost if wrong: overwrite a live refresh; active-lease tests cover exclusion.
6. Leave reviewer-declined live callback/schema/credit behavior explicitly untested because configuration, deployment and consent are outside this delivery. Cost if wrong: provider compatibility remains unknown until smoke.
7. Validate the unapplied schema with real isolated PostgreSQL ACL/RLS/invoker tests rather than hosted advisors. Cost if wrong: advisor findings may remain for deployment review.
8. Deliver the already-authorized draft PR with exact broad-suite failures, without merge, following the approved plan rather than the finishing skill's green-suite integration menu. Cost if wrong: additional CI/triage is required before merge readiness.

The per-plan ignored test workspace is disposable after this evidence is committed. The feature worktree and branch remain for PR follow-up.

## Follow-up review 2026-10-22 — PR #514 integration checks

Scope remains strictly read-only. Work was performed only in the dedicated Hultgren worktree on branch `codex/theprompt-video-design-20261022`. No production migration, deployment, credentials setup, OAuth consent, provider read, generation or publishing activation occurred.

The two red GitHub CI workflows on original head `eb6599bb` were investigated from their actual Actions job logs (rather than classified as pre-existing failures):
- **Atlas Project Isolation:** two migration-security-gate assertions rejected the two new unclassified `public.media_provider_*` tables, and one schema-security invariant assertion found those same table names unregistered. The new tables are registered as `SERVER_ONLY` in `_meta.created_not_live`, explicitly **not** as inspected live production tables. The SQL migration enables RLS, creates no client policies, and revokes anon/authenticated grants.
- **Migration Guard Integrity:** the new canonical migration raised the SQL source count from 151 to 152, enforced count from 137 to 138. Bumped both exact tripwires without extending grandfathered or legacy-only allowlists. Updated historical captured-ledger tests to preserve actual captured history and require `higgsfield_mcp_readonly` only in clearly labelled hypothetical post-apply fixtures. The real ledger must still fail closed until a reviewed production application.

Two deferred connection issues now have failing-first regression coverage and repairs:
- An SDK `UnauthorizedError` during paginated `tools/list` now maps to the existing `reconnect_required` signal, allowing at most one governed refresh/retry through the versioned database lease rather than silently skipping refresh.
- A transient read-only inspection failure in the Settings controller keeps the known connected state, clears stale balance and quote, displays a safe retry warning, and permits another click without page reload. A revoked grant explicitly requires reconnect; 401/403 access refusal does not leave a misleading connected state.

Post-fix checks on Hultgren:
- Migration-security-gate 133/133, schema-security-invariant 76/76, migration-guard-v2 35/35, weekly-journal 4/4, sales-inbox 3/3: **251/251 passed**.
- Seven Higgsfield suites: **72/72 passed**; five security/migration suites: **251/251 passed**; one final combined 12-suite verification: **323/323 PASS**, exit 0 (28.76s). GitHub Actions on the updated head still require their own results.
- `npm run typecheck --workspace=apps/web`: **PASS**, exit 0.
- `npm run build --workspace=apps/web` with process-local, nonsecret localhost public Supabase placeholders: **PASS**, exit 0 (91.48s). No production secrets used.
- `git diff --check`: **PASS**.
- **Not claimed:** an exhaustive broad Vitest suite comparison against main, hosted database advisors, live Higgsfield tools/schema/price compatibility or unchanged real credit balance. Original broad-suite inventory remains historical and unclassified.

### Merge and activation gates still open

1. Review the fresh PR CI for the updated commit, especially the two previously red workflows; perform an independent reviewer check of changed code and migration.
2. Decide how to satisfy the repository's apply-before-merge production ledger guard without bypassing its security model. Applying migration is a separate change that requires the intended target, rollout and rollback review; do not falsify the production ledger.
3. Configure protected server-only flags, exact HTTPS redirect and independent encryption key only in the authorized environment. Do not reveal values in logs, PR comments, local tracked files or chat.
4. Complete real account consent and **read-only** balance → fixed quote → balance smoke after a reviewed deployment. Provider tool schemas remain unverified against the authenticated service.
5. Maintain image-only production publishing and zero Higgsfield generation until separate credit accounting/limits, asset retention, fallback and publishing tests pass.

## Full-suite base-versus-feature classification — 2026-10-22

This later evidence supersedes the previous statement that the broad Windows failures had **not yet been compared** with a base branch. Both complete web Vitest runs used the same Hultgren Windows host, Node 22, maxWorkers=1/minWorkers=1, no production service-role keys, and separate isolated git worktrees. Historical earlier counts in this file and in `theprompt-higgsfield-full-suite-failures.md` remain unchanged as historical runs.

- Baseline worktree: exact PR base `139a45ce199ff73da91a1039f962fe3b3559754d` (`origin/main` at PR creation). 681 test files; **116 failed files**, **405 failed tests**, 13,539 passed tests, 1,397 pending/skipped. Full JSON: `%TEMP%/omnira-pr514-main-full-20261022.json`.
- Feature worktree: PR #514 branch with implementation and preflight evidence. 688 test files; **116 failed files**, **404 failed tests**, 13,613 passed tests, 1,397 pending/skipped. Full JSON: `%TEMP%/omnira-pr514-feature-full-20261022.json`.
- Comparison of all test file paths and failed-assertion *names* in `%TEMP%/omnira-pr514-full-comparison-20261022.json` (with versioned redacted evidence receipt [2026-10-22-pr514-full-suite-parity.json](verification/2026-10-22-pr514-full-suite-parity.json), including SHA-256 hashes of both local full JSON reports): **681 files in common**, no missing baseline files, **seven additional Higgsfield test files all passing**, **679/681 common files identical in failure sets and file status**. One file failed on feature only: `lib/qa/platform-authority-closure.test.ts`, with **one 5-second timeout**. One file failed on baseline only: `lib/qa/atlas-pages-isolation.test.ts`, with **two 5-second timeouts**. No other added or removed failing assertion identities.
- Isolated timeout rechecks on the same host: the feature operator's unauthenticated test **PASS** under a 20-second timeout (3.55 s); the baseline Atlas pages isolation's two cases **PASS** (4.44 s and 0.38 s). The separate earlier operator non-owner check also PASSed on both worktrees with a 15-second timeout. Thus no repeatable new functional regression was identified by this comparison; this does **not** imply that the old full suite is green or that timeout sensitivity is fully repaired.
- Seven Higgsfield suites were PASS in the complete feature run, as were the 323/323 previously recorded targeted security+migration tests. The additional four-state migration assertion in this follow-up reports 36/36 migration-guard tests PASS.
- Full runs still generated Windows/POSIX command-not-found and Docker test-container errors on both sides. Leave unrelated infrastructure failures in their own backlog; never delete, skip, or loosen tests to make this PR appear green.
- Both 5-second timing deviations are in files untouched by PR #514. Source-level review still applies; comparison classifies test behavior, not implementation correctness or real provider compatibility.
