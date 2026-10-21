# Atlas build workspace validation

Source implementation and independent review fix pass complete. Delivery is prepared for a draft PR; publication is blocked as recorded below. No activation or production migration.

## Baseline before runtime implementation

436 files; 72 failing files; 367 failed tests; 12022 passed; 1110 pending. Full suite was run on this exact clean feature worktree before new artifact implementation. Windows FIND/path/CRLF failures and other existing fixture failures are not silently excluded.

- apps/web/lib/qa/activity-stream.test.ts
- apps/web/lib/qa/admission-inventory.test.ts
- apps/web/lib/qa/analysis-draft-sql.test.ts
- apps/web/lib/qa/atlas-chat.test.ts
- apps/web/lib/qa/atlas-knowledge-boundary.test.ts
- apps/web/lib/qa/atlas-knowledge-snapshot.test.ts
- apps/web/lib/qa/atlas-launcher-vnext.test.ts
- apps/web/lib/qa/atlas-memory-dream-producers.test.ts
- apps/web/lib/qa/atlas-memory-emit-durability.test.ts
- apps/web/lib/qa/atlas-memory-terminal-outcomes.test.ts
- apps/web/lib/qa/autonomy-bind-guards.test.ts
- apps/web/lib/qa/autonomy-license.test.ts
- apps/web/lib/qa/autonomy-runtime-foundation.test.ts
- apps/web/lib/qa/autonomy-trace-guards.test.ts
- apps/web/lib/qa/budget-scopes.test.ts
- apps/web/lib/qa/canonical-evidence-pin.test.ts
- apps/web/lib/qa/cl-shadow.test.ts
- apps/web/lib/qa/content-center.test.ts
- apps/web/lib/qa/delegation-mission-activation.test.ts
- apps/web/lib/qa/desktop-commander-unlicensed.test.ts
- apps/web/lib/qa/execution-contract-propagation.test.ts
- apps/web/lib/qa/executive-brief-apex.test.ts
- apps/web/lib/qa/executive-intelligence-schema-activation.test.ts
- apps/web/lib/qa/external-dispatch-guards.test.ts
- apps/web/lib/qa/global-auth-retired.test.ts
- apps/web/lib/qa/global-design-tokens.test.ts
- apps/web/lib/qa/leads-dual-accept.test.ts
- apps/web/lib/qa/leads-legacy-auth-removed.test.ts
- apps/web/lib/qa/legacy-v1-api-removed.test.ts
- apps/web/lib/qa/licensed-bind-m4b-guards.test.ts
- apps/web/lib/qa/marketing-review.test.ts
- apps/web/lib/qa/media-orchestration-retry-authority.test.ts
- apps/web/lib/qa/media-token-authority.test.ts
- apps/web/lib/qa/memory-vnext.test.ts
- apps/web/lib/qa/mission-brief-v1.test.ts
- apps/web/lib/qa/mobile-chrome-contract.test.ts
- apps/web/lib/qa/money-overview.test.ts
- apps/web/lib/qa/monthly-release-v2.test.ts
- apps/web/lib/qa/muapi-media-provider.test.ts
- apps/web/lib/qa/platform-credential-events.test.ts
- apps/web/lib/qa/project-api-credentials.test.ts
- apps/web/lib/qa/project-command-center.test.ts
- apps/web/lib/qa/project-workspace-vnext.test.ts
- apps/web/lib/qa/release-gate-proof-workflow.test.ts
- apps/web/lib/qa/review-queue.test.ts
- apps/web/lib/qa/run-bound-provider-spend.test.ts
- apps/web/lib/qa/schema-security-invariant.test.ts
- apps/web/lib/qa/scoped-read-isolation.test.ts
- apps/web/lib/qa/sdf1b2-code-work-operator-plane.test.ts
- apps/web/lib/qa/sdf1c-broker-claim-credential.test.ts
- apps/web/lib/qa/sdf1c-trusted-broker.test.ts
- apps/web/lib/qa/sdf1c2-broker-control-channel.test.ts
- apps/web/lib/qa/sdf1c3-isolation-integration.test.ts
- apps/web/lib/qa/sdf1c3-isolation-substrate.test.ts
- apps/web/lib/qa/session-only-routes.test.ts
- apps/web/lib/qa/social-credentials.test.ts
- apps/web/lib/qa/spend-financial-decoupling.test.ts
- apps/web/lib/qa/stop-authority-authorization.test.ts
- apps/web/lib/qa/survival-funding-sql.test.ts
- apps/web/lib/qa/survival-history-sql.test.ts
- apps/web/lib/qa/system-health.test.ts
- apps/web/lib/qa/vnext-intelligence-graph.test.ts
- apps/web/lib/qa/vnext-settings.test.ts
- apps/web/lib/qa/workflows-definition-familje-stunden.test.ts
- apps/web/lib/qa/youtube-project-oauth.test.ts
- apps/web/lib/architecture-knowledge/architecture-knowledge.test.ts
- apps/web/lib/architecture-knowledge/executive-knowledge.test.ts
- apps/web/lib/trading/market-data/import-discipline.test.ts
- apps/web/lib/trading/market-view/import-discipline.test.ts
- apps/web/lib/trading/provider-normalization/recorded-adapter.test.ts
- apps/web/lib/trading/replay/import-discipline.test.ts
- apps/web/lib/trading/session-calendar/import-discipline.test.ts

## Task 1

Artifact tests: observed 29 failures before implementation, then 29/29 pass. Typecheck exit 0. Multi-page files, UTF-8 export, immutable hash, hostile markup rejection, interaction runtime, CSP, and non-delivering form notice covered. Browser behavior remains to be verified in tasks 5/6.

## Task 2

Actual CLI migration: 20261014065527_website_build_sessions.sql; no production change. Store6/6 and artifact29/29 pass. Local SQL25 assertions and both lock-order outcomes (commit-first/cancel-first) pass using multiple real connections. Retry/pausing and pending-cancel stale control flags were observed RED then fixed GREEN. Candidate hash/feedback binding survives pause/resume; unknown project/generation, stale claim and expired lease cannot activate previews.

Supabase CLI2.120.0 gen types and db advisors succeeded against the isolated loopback DB (sslmode=disable only on that local fixture). Regenerated only three new tables and fourteen new RPC definitions; unrelated database type entries unchanged. Advisor findings: zero for owned tables/functions. Four fixture-only warnings: owner_read initplan, two temporary test helpers mutable search_path, and pgcrypto in public. These fixture objects are not added by the product migration.

## Task 3

Governed website worker and actual drain dispatch implemented. 128/128 selected tests pass (artifact29, store6, interpreter4, worker10, actual-drain5, post-claim46, spend-bound28). Real local SQL transport executes the production RPCs and canonical stop/claim/release functions; only the paid provider response and unrelated legacy/notification dependencies are controlled doubles. No live-provider success claimed.

Pause during interpretation was observed RED and fixed with independently cached interpretation/feedback cutoff. Invalid artifacts are permanent and do not trigger automatic paid regeneration. Canonical dispatch-unknown surfaces awaiting_decision, retains the unknown run for reconciliation, forbids resume, and closing the build session does not claim rollback. Windows-required provider inventory now uses git grep --untracked instead of missing Unix grep, preserving the same three expected implementations. Typecheck exit0; no production migration or deployment.

## Task 4 — API and Atlas
Seven real-SQL API tests verify authentication, tenant scope, idempotency/conflict, feedback and private authenticated ZIP. The actual Atlas POST tool loop queues a real session/run and returns its workspace URL. 125/125 combined API/chat assertions pass; tsc exit0. Existing chat SHA guards now canonicalize Windows CRLF while preserving pinned content hashes.

## Task 5 — browser workspace
Real browser, real API/store/RPC and actual website worker with deterministic zero-cost provider:5/5 Chromium flows pass. Preview history/navigation, concurrent composer/reload, failure retaining previous preview, keyboard splitter at1440 and mobile tabs768/390/320 at200% text, opaque origin/CSP/network/popup/top-navigation and forged message denial. Export downloaded and unpacked: menu and page navigation work from file://. Three reducer/draft assertions pass. Screenshots inspected. Typecheck exit0. Two existing project-command-center regression failures remain (legacy content hash and outdated no-handlarborsen assertion); unchanged from baseline, final comparison required.

## Task 6 — voice and release limits
4/4 utterance lifecycle assertions GREEN after RED4/4. Browser suite7/7 with actual AtlasRuntimeProvider, actual capture mechanics and mocked browser SpeechRecognition: editable transcript requires explicit Send, binds viewed revision, v3, stop-audio does not cancel, durable pause/resume/cancel and v4 survive reload, denied/unsupported mic text fallback and late old-session transcript dropped. Real microphone permission/device quality and audible TTS remain manual checks. No paid model request made. Provider credentials are absent in the isolated checkout, so the limited live-provider smoke cannot be claimed. The first Next build compiled successfully but password-page prerender failed for absent public Supabase URL/key; a clearly test-only public loopback configuration is used for the final configured build check. Production schema is not applied by this task.

## Whole suite and integration follow-up
Initial post-main full run:463 files,377 failed assertions,12,139 passed,1,110 pending. Compared by file and full assertion name with the436-file baseline:15 newly failing assertions. Four were this feature's omitted schema-registry entries / unproven owner predicate, reproduced and fixed with canonical gate RED->GREEN without an allowlist. Eleven were merged-main middleware tests whose older Supabase double omitted the newly required membership query; the double now explicitly models an existing Owner, with separate containment regressions retained. A second full run on the final source will be compared by the same names.
Actual new migration with explicit owner read policies: all25 SQL assertions and both two-connection commit/cancel races pass. Website migration has zero canonical security blockers. Three remaining broad security suites pass except an inherited Windows path/root assertion, reported by name in the final comparison. Collaborator sanitizer explicitly removes the new build link; its regression observed RED before the fix.
Configured Next production build exited0 with non-production public loopback Supabase values; standalone tsc is required because this repository's Next config skips type checking. No actual provider key or production service credential was configured.

## Independent whole-branch review and fixes
One fresh gpt-6-astra reviewer reviewed190e8f1..fe6b8c4 read-only. Two Important findings: ignored production route files (links404 in a clone), and mixed apply/decision parking losing instructions then falsely marking them applied; related superseded-decision parking. These were reproduced before correction. Both production routes are now tracked with a narrow build-directory ignore exception and a tracked-source regression. Snapshots retain unapplied apply/decision feedback; worker decisions ignore superseded items; committed receipts are limited to the exact accepted generation interpretation (including paused candidate reuse). Three real-SQL regressions pass.
The reviewer also flagged independent tab groups as Minor; regraded Important because unrelated visible site content disappears. New tab behaviors require validated groupId and operate within that group; renderer can update reviewed runtime in earlier stored inline artifacts. Browser two-group regression passes. Parent form integration notice is readable even when child CSS hides its note. Post-fix targeted267/267 and Chromium9/9 pass, standalone tsc0. No second review seat was dispatched.
Deferred Minor: definitive start rejection freezes its original request; corrected agent/brief requires reload while retaining the unsaved brief manually. This remains visible as draft-stage recovery friction.
Before review fixes, exhaustive disjoint full matrix464 files:12,155 passed,362 failed in70 files,1,110 pending; zero newly failing assertion names versus the initial baseline (five baseline assertions resolved). Subsequent DB-free CI portability work splits the website chat cases into a dedicated integration file; final post-fix matrix includes466 files, recorded below.


## Reproducible local SQL fixture

The existing DB-free Atlas chat suite remains DB-free (16/16). The three actual-SQL website chat tests live in lib/website-build/chat-tools.test.ts. No hosted CI workflow was invoked. Run these integration tests only against the labeled local test container, never a production database.

Start PostgreSQL16 with the label com.omnira.testplan=atlas-live-build-20261014, container name omnira-website-build-test-20261014, loopback127.0.0.1:54389:5432, POSTGRES_DB=omnira_website_test and POSTGRES_HOST_AUTH_METHOD=trust. Image digest: postgres@sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d.

From repository root in PowerShell:

```powershell
$env:WEBSITE_BUILD_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:54389/omnira_website_test'
$env:WEBSITE_BUILD_TEST_KEEP_DATABASE='1'
node apps/web/scripts/test-website-build-db.mjs
# Set the exact website_test_<timestamp> value printed as KEEP_DB:
$env:WEBSITE_BUILD_TEST_DATABASE_NAME='website_test_<printed timestamp>'
npm test --workspace=apps/web -- lib/website-build lib/qa/website-build-drain.test.ts --maxWorkers=1 --minWorkers=1
cd apps/web
npx playwright test --config=playwright.website-build.config.ts
```
The explicit database name is validated against the owned timestamp prefix, and the Docker ownership label is checked before queries. The plan scratch log is only a legacy fallback; a fresh checkout does not require it.


## Final delivery evidence

Final post-fix disjoint matrix:466 unique files (462 without the shared website fixture at four workers; four shared-fixture files serialized). 12,161 passed,362 failed in70 files,1,110 pending. Exhaustive comparison with the initial436-file baseline found zero new failed assertion names and five resolved baseline assertions. The full repository suite remains red; all362 exact remaining names are in ATLAS_BUILD_WORKSPACE_REMAINING_TESTS_20261014.md. Final SQL complement exited0; non-SQL complement exited1 from these inherited failures.

The reviewed source passed267/267 targeted assertions and9/9 Chromium flows; final portability split additionally passed the existing16/16 DB-free chat assertions and all three dedicated real-SQL chat assertions with an explicit owned fixture name. Standalone tsc exited0. The actual hardened migration passed25 SQL assertions plus both two-connection commit/cancel races. Configured Next production build exited0 and its app manifest lists both tracked workspace routes. The temporary public loopback build environment is removed at handoff; it proves compilation/prerender compatibility, not production connectivity.

One independent whole-branch review and one root RED→GREEN fix pass were performed; no re-review. Source checks use deterministic zero-cost provider responses and mocked browser speech recognition. Real model v1/v2/v3, microphone permission/accuracy and audible TTS remain release smoke checks. Migration20261014065527 is not applied to production. PR332 remains a design-runtime dependency; merged PR331/333/334 are already integrated from main. No public website, backend, payments or social-media workflow is delivered by this preview change.

The feature worktree is preserved for PR iteration. Only this plan ignored execution scratch and its own temporary dummy .env.local are removed after recording decisions and test names in git. No hosted GitHub Actions workflow is requested; final commit carries [skip ci]. Draft delivery does not claim merge or activation readiness.


## Publication status

The feature branch is committed locally. The automatic approval reviewer rejected the ordinary git push twice: first because destination/payload authorization was not verified, then because the repository is public and the user messages did not explicitly authorize publication of this branch to that exact destination. Read-only checks confirmed origin is https://github.com/Bumbi190/ai-operating-platform.git, signed-in login Bumbi190, ADMIN access, public repository, and the approved plan names this exact repository for feature-branch push/draft PR. No alternate transport or bypass was attempted; no push, new draft PR, merge or activation was completed. A specific user confirmation of public publication is the remaining blocker.
