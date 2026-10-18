# Familje-Stunden social scheduling validation — 2026-10-18

## Delivery state
Implementation branch: codex/family-social-execution-20261018. Production remains f0a52321361b7f1a03d5336cbd7a5c8c4d769ac5. No production schema delivery, receipt mutation, new provider publication or feature activation has occurred in this execution.

## Existing public posts
Instagram has its saved successful receipt: https://www.instagram.com/p/DeoBu_ZETNS/
Facebook is already public: https://www.facebook.com/122154596379150002/posts/122154593805150002
Its historical uncertain receipt must be reconciled by the native exact comparison. Never resend this post.

## Verification
- Shared executor / immutable SQL queue / guards: 90/90 focused tests passed before UI completion.
- Native review: real served fixture covered images/captions/accounts/times, explicit approval, saved reload, revocation, stale versions/time, missing images, waiting/uncertain/missed, and January's own month/catalog.
- Task 4 owner / Atlas / planning: 5/5; actual chat registry 1/1; real-SQL stale review 1/1. TypeScript passed.
- Readiness service and owner endpoint: 7/7. No claim, media capability or provider POST is part of readiness. Credentials are verified in server memory and are absent from its response.
- Task 5 TypeScript passed code0 before final regression-test additions; the fresh final check also passed code0. The broad project suite is not green and is still running. A detached baseline at exact production f0a5232 reran31 initially failing files:28 failed,3 passed;261 failed/2140 passed/5 skipped tests. The feature-only differences were the migration security gate, the schema-registry invariant, and one5000ms timeout in platform-authority-closure. The two schema gates have since passed209/209 after static RLS/grants and pending-table classification were corrected. The timeout is not an authorization failure.
- All SQL tests use only the labeled task-owned local database website_test_1792309015341, never hosted Supabase.
- Native Browser plugin became unavailable after the Task 4 fixture checks. The new readiness button and production comparison have not yet been exercised through the native browser. No substitute browser session was started.

## Runner and cost
The actual Vercel team settings showed Pro on 2026-10-18. Pro supports a one-minute cron cadence. Existing plan was not changed.
Sources: https://vercel.com/docs/cron-jobs/usage-and-pricing and https://vercel.com/docs/functions/usage-and-pricing
A minute invocation is a normal Function invocation and consumes plan resources. No claim of free execution is made.
The route authenticates the existing cron bearer, defaults disabled, claims at most one job and has a 45-second internal budget / 60-second route / 90-second lease.
Reconfirm entitlement before activation. No secret or feature flag was changed.

## Remaining production gates
1. Fresh whole-branch review and assessment of complete project test failures.
2. Apply the reviewed migrations and verify service-only grants/RLS/advisors.
3. Deliver disabled and verify the actual production SHA.
4. Native read-only readiness check with before/after SQL evidence; reconcile the existing Facebook receipt with exact owner comparison.
5. Prepare actual next-week captions/images and November 1 20:30 Stockholm sneak peek using the real active month. Obtain exact native content/batch/activation approval; implementation approval is not publication authority.
6. Enable only Family after that approval, then verify real receipts/links. No catch-up publication outside a newly approved exact time.

## Scope
Atlas can read and propose only. The Prompt's connections/tokens/publishing pipeline were not changed.
Automatic recurring content generation, engagement collection and statistics-driven editorial decisions remain separate work.

## Whole-branch review
Fresh reviewer: gpt-6-astra; read-only static review. No Critical finding; two Important findings accepted. Cross-batch occasion identity reuse is now rejected under the project lock. Waiting release evidence no longer monopolizes selection, and processing Instagram containers yield while remaining eligible on later ticks. Three regressions were watched fail against the earlier SQL. Worker tests passed9/9 including the processing/fairness regression. The complete store rerun passed12/12 after a test-fixture UUID collision was corrected; that collision was not a provider or product failure.

## Environment metadata verification
Vercel encrypted metadata showed the existing CRON_SECRET for production/preview. SOCIAL_SCHEDULE_DISPATCH_ENABLED and SOCIAL_SCHEDULE_PROJECT_IDS are absent. No values were decrypted, printed or changed. Default dispatch is therefore disabled with an empty allowlist.

## Deferred minor
Repeated Facebook reconciliation inspection can reset original-image load state without firing another onLoad. Reloading the page restores first inspection. Reviewer graded this Minor; no extra change was included in this fix pass.

## Rulings I made
- Ruling: Bundled sdd-workspace/task-start/task-done and writing-good-tests auxiliary resources are unavailable from the skill provider after canonical-package lookup. Use equivalent plan-owned briefs, BASE capture, logs and completion records manually, follow the test-quality rules present in the available TDD skill, and never claim the missing scripts ran — preserves execution while keeping evidence — cost if wrong: manual bookkeeping can drift, mitigated by persisted briefs/results/commits.
- Ruling: Plan commands name pnpm but the repository uses npm workspaces and package-lock.json. Execute the same Vitest/TypeScript entry points with the installed Node runtime and matching locked dependencies — no package changes — cost if wrong: CLI wrapper behavior could differ; recorded exact arguments and native npm full-suite command at finish catch this.
- Ruling: Deployment/activation steps in receipt Task 3 and scheduler Task 5 wait until the combined code branch has its required fresh review — resolves the plan ordering against Native's pre-merge review requirement — cost if wrong: receipt production correction is delayed until shared review; no extra publication is attempted.
- Ruling: Provisioned task-owned website_test_1792306627152 by a read-only template clone of the labeled disposable local fixture; no writes to the source database. All test commands explicitly select this owned database — prevents cross-chat state mutation — cost if wrong: inherited fixture state can affect tests, mitigated by canonical initializers and unique fixture identities.
- Ruling: Full publication run exposed pre-existing shared-fixture bootstrap races (tuple concurrently updated / duplicate stop trigger) under Vitest file parallelism. Run all real-SQL suites with --fileParallelism=false, preserving concurrency inside the actual claim/CAS tests — isolates schema setup without weakening race coverage — cost if wrong: slower suite, with explicit per-test parallel claim assertions retained. task2-all-publication.log retains the failed attempt.
- Ruling: Candidate hash pins photo ID and CDN origin/path but excludes its rotating query; exact caption/account/time/permalink remain pinned — transport signatures can change on reread without changing the photo — cost if wrong: a provider changing bytes under one photo ID needs the operator image attestation, and production reread still checks immutable photo identity.
- Ruling: reconciledAt is optional nullable in the TS compatibility shape while the new SQL projection always returns null or a timestamp — existing saved/manual fixture records stay readable — cost if wrong: old callers might omit the badge, never authority.
- Ruling: The schedule clock is a service-only SQL function returning clock_timestamp(); tests replace its body only inside the task-owned disposable database and restore it afterward — allows real SQL boundary/DST/lease tests without trusting caller time — cost if wrong: an un-restored fixture clock skews later local tests, covered by explicit reset hooks; production has no configurable clock.
- Ruling: Read workspace returns latest revisions for multiple independent batches plus rule/evidence; Atlas get will select a requested/current batch from that read model — weekly batches need history without a singleton overwrite — cost if wrong: callers must handle an empty/multiple batch workspace explicitly.
- Ruling: The monthly uniqueness reservation excludes cancelled pre-send jobs, and retains published/uncertain/missed reservations; cancellation cannot erase uncertain writes — allows newly reviewed replacements without enabling duplicates — cost if wrong: reservation state transitions could allow a repeat, guarded by permanent publication post identity and uncertainty tests.
- Ruling: Add two service-only read RPCs, peek and receipt, for zero-mutation dry run and lost-checkpoint readback; neither takes a human principal or grants send rights — avoids fabricated worker identity and fake read-only claims — cost if wrong: privileged read surface grows, mitigated by fixed scope, RLS/grants and no credentials in responses.
- Ruling: The base local RPC transport is synchronous, so Promise.all alone did not overlap SQL sessions. Scheduler test transport now starts independent psql processes (with a 150 ms transaction hold on claim) — tests actual row-lock contention — cost if wrong: fixture transport errors could mask product errors, checked against explicit null/JSON response handling and the canonical real RPCs.
- Ruling: Add a fenced, service-only history-recovery RPC and CLI-generated migration for a lost checkpoint after lease expiry. It checks the original claim/version, only records known receipts or uncertain/waiting/missed state, and never grants another send — expired workers need truthful history without regaining write authority — cost if wrong: a bad recovery transition could hide ambiguity, covered by committed/uncommitted checkpoint cases and zero second-POST assertions.

## Final scoped result
105 publication/scheduling tests are covered:104 passed in the19-file combined run, and the sole test-fixture UUID collision was corrected, followed by a complete12/12 store run. The processing-container regression passed within the9/9 worker run. TypeScript --noEmit --incremental false passed code0. Migration security and schema invariants passed209/209. This is not a claim that the entire project suite is green.

Next content draft: docs/validation/2026-10-18-family-next-batch-draft.md. It reuses saved draft facts and existing media, but grants no authority. The existing browser connection was searched through Plugin Management and is not callable in this session; no new provider or cloud browser was installed or substituted. Production/native readiness and receipt comparison are still pending.
