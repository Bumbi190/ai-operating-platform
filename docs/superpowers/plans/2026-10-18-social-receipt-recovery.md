# Social Publication Receipt Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve slow Facebook publication receipts and safely reconcile an existing uncertain attempt without sending another post.

**Architecture:** Keep the manual publication state machine and no-retry guarantees. Add a fixed Facebook read adapter, short-lived candidate proofs, and an operator-only reconciliation transition; never use a text match as automatic image proof.

**Tech Stack:** Next.js 14, TypeScript, existing Supabase/Postgres RPCs, Vitest, existing native Browser verification.

**Spec:** docs/superpowers/specs/2026-10-18-family-social-scheduling-design.md, sections 2, 4, 8, 10–14.

## Global Constraints
- Facebook POST timeout 30 seconds; existing reads and Instagram requests eight seconds; manual route maxDuration=60.
- No automatic POST retry, direct production row repair, credential copying or cross-project fallback.
- Candidate creation window: requested_at minus 60 seconds through requested_at plus five minutes. Candidate proof lifetime: five minutes.
- A candidate must match the original attempt/account/revision/text and contain a photo; the operator explicitly attests the reviewed image.
- New RPCs use security invoker, an empty search_path and explicit service_role privileges; revoke PUBLIC/anon/authenticated execution and table access. Enable RLS.
- Generate migration filenames with the installed Supabase CLI; do not invent timestamps.
- No dependency upgrades. Production currently reports Node 24.x.
- Ship without new public test posts. Reconcile the already published Family Facebook attempt only after native UI review.
- This plan is not authorization to activate recurring publishing.

## Review Focus
- Unicode/whitespace lookalikes: no normalization that turns different captions into an exact match (Task 2).
- Candidate content changes after inspection: reread and reject the changed proof (Task 2).
- Another tab already completed the receipt: identical replay is harmless; conflicting completion is rejected (Task 2).
- A project is paused after its post was published: history can be reconciled by its operator without permitting a send (Task 2).
- A forged permalink/image host or raw provider error: reject/redact without arbitrary network requests (Tasks 1–2).

---

## Preparation at execution time
Use the selected execution skill and its worktree procedure. Start from freshly fetched main and verify that the reviewed design still matches it. Do not reuse another chat's checkout. Use the repository's labeled local SQL fixture and a task-owned website_test_<digits> database via WEBSITE_BUILD_TEST_DATABASE_NAME; never point tests at hosted Supabase. If fixture ownership cannot be established, stop SQL tests and provision the owned fixture before proceeding.

Commands below run from the repository root. Native UI testing uses Browser, not an independent browser-control client. Existing e2e files can be adapted and served as fixtures, then exercised through Browser.

### Task 1: Slow Facebook responses and safe uncertainty copy

**Files:** Modify apps/web/lib/social-launch/publication/provider.ts and provider.test.ts; extend dispatch.test.ts; modify components/social-launch/SocialPublicationPanel.tsx and its existing e2e fixture.

**Interfaces:** Keep MetaManualProvider.facebook(c, {text,linkUrl,imageUrl}) -> Promise<{providerId,permalink}> and all public error types unchanged. Extend the private json method with an optional timeoutMs argument defaulting to 8000; only facebook's POST supplies 30000.

- [ ] Write failing tests named accepts_a_facebook_receipt_after_nine_seconds, stops_waiting_after_thirty_seconds_without_retry and retains_eight_seconds_for_instagram_and_reads. Use Vitest fake timers and a fetch fixture that listens to init.signal. Assertions: at 9000ms the Facebook signal is not aborted and one successful receipt is returned; at 30000ms a nonreplying write rejects with outcome=unknown and call count=1; an Instagram/read signal aborts at 8000ms.
  Test seam: fake AbortSignal.timeout with an AbortController driven by the same Vitest clock, so the delayed-response test actually exercises cancellation; restore the spy and timers in finally. Do not merely assert the timeout argument.

~~~ts
it('accepts_a_facebook_receipt_after_nine_seconds', async () => {
  const result = provider.facebook(facebook, {text:'Exakt text',linkUrl:null,imageUrl:media});
  await vi.advanceTimersByTimeAsync(9000);
  expect(await result).toMatchObject({providerId:'12345_67890'});
  expect(fetchCalls).toHaveLength(1);
});
~~~

  Here provider uses a 9000ms abort-aware fetch fixture, and fetchCalls records that fixture. facebook/media reuse the existing test constants.
- [ ] Run: pnpm --dir apps/web exec vitest run lib/social-launch/publication/provider.test.ts. Expected red specifically for the eight-second Facebook cutoff.
- [ ] Implement the timeout distinction and update uncertainty text to explain that the channel may already have published. Preserve header-only credentials, bounded JSON, exact caption and no automatic retry.
- [ ] Run provider.test.ts and dispatch.test.ts. The existing lost-response and simultaneous-request tests must still show exactly one POST. Verify the native fixture shows the uncertainty warning and no resend button.
- [ ] Commit only these changes with message fix(social): allow slow Facebook publication receipts.

### Task 2: Verified Facebook reconciliation, including native review

**Files:** Create publication/reconciliation/{types,provider,store,service,api}.ts and matching .test.ts files and fixtures.test-utils.ts under apps/web/lib/social-launch; create app/api/social-publication-reconciliation/route.ts; create components/social-launch/SocialReconciliationPanel.tsx; modify SocialPublicationPanel.tsx, publication/{types,store,test-db}.ts and e2e/social-publication-{entry.tsx,server.mjs}. Generate migration with: cd apps/web; supabase migration new social_publication_reconciliation. The CLI-generated file with that suffix is this task's SQL artifact.

**Interfaces:**
- ReconciliationCandidate = {id:string,providerId:string,accountId:string,createdAt:string,text:string,permalink:string,photoId:string,imageUrl:string}; AttemptSnapshot = {publication:PublicationRecord,revision:SocialContentRevision}; persisted proof adds publicationId, revisionId, revisionSha256, reviewedAssetSha256, candidateHash, expiresAt and version.
- listFacebookCandidates(credential:ManualCredential, attemptSnapshot:AttemptSnapshot) -> Promise<ReconciliationCandidate[]>; readFacebookCandidate(credential:ManualCredential, providerId:string) -> Promise<ReconciliationCandidate>; fixed Meta host/path, maximum 50 candidates in the bounded window, no caller URL.
- ReconciliationDependencies = {provider:{list:typeof listFacebookCandidates,read:typeof readFacebookCandidate},resolveCredential:(projectId:string)=>Promise<ManualCredential & {bindingId:string}>,now:()=>number}. The service exports inspectReconciliation(db, principal, {projectId,postId,publicationId}, deps?:ReconciliationDependencies) -> Promise<{candidates:ReconciliationCandidate[],receipt:PublicationRecord}>.
- completeReconciliation(db, principal, {projectId,postId,publicationId,candidateId,expectedVersion,imageConfirmed:true}, deps?:ReconciliationDependencies) -> Promise<PublicationRecord>.
- RPCs: social_publication_reconciliation_inspect(p_principal,p_input) and social_publication_reconciliation_complete(p_principal,p_input). Both reject unknown fields.
- New API POST operations inspect and complete; resolve actual project access, same-origin protection and platform operator exactly as the current manual API.
- New event reconcile_verified records operator, original revision/image, provider account/ID, candidate hash and read time. PublicationRecord adds reconciledAt:string|null. A successful reconciliation still has confirmation=provider_id.

- [ ] Verify the required Facebook read fields and permissions against current official Meta material and an already published post. Record supported request/response shapes in a short code comment and sanitized fixture. If official contract/owned-post verification fails, do not implement a guessed adapter or unblock the production receipt.
- [ ] Write failing provider/service/real-SQL tests: exact caption/account/window with a photo yields selectable candidates; same text alone cannot complete; imageConfirmed=false, five-minute-expired proof, changed post, wrong project/account, dangerous link and missing photo all reject. Assert provider POST count=0 in every reconciliation case. Add exact Unicode and parallel-completion cases from Review Focus.
  Test fixtures live in reconciliation/fixtures.test-utils.ts; reconciliationFixture(db) returns {principal,scope,completeInput,deps,providerPosts}, with an existing uncertain attempt and a real-SQL proof after inspect. completeInput includes imageConfirmed:true. The scope contains projectId/postId/publicationId.

~~~ts
it('image_confirmation_is_required_and_never_posts', async () => {
  const f = await reconciliationFixture(db);
  await inspectReconciliation(db, f.principal, f.scope, f.deps);
  await expect(completeReconciliation(db, f.principal,
    {...f.completeInput,imageConfirmed:false} as never, f.deps)).rejects.toMatchObject({code:'INVALID_BODY'});
  expect(f.providerPosts).toBe(0);
});
~~~
- [ ] Run the reconciliation tests and record expected missing-module/RPC failures. Generate the migration. Add a service-only RLS-protected proof table, its expiry/version checks and the CAS transition from uncertain to published; preserve immutable event triggers. Use the original saved publication snapshot even when the current editor shows a newer revision. Require the currently resolved credential to match the original saved binding/account.
- [ ] Implement the service and native comparison panel. Show the approved image beside the candidate, its account/time/caption and safe permalink. Require explicit image confirmation before Koppla verifierat inlägg till kvittot. Re-read the candidate immediately before CAS; no arbitrary thumbnail proxy or URL fetching. A paused project permits history-only reconciliation; current owner/operator access is still required.
- [ ] Run: pnpm --dir apps/web exec vitest run lib/social-launch/publication. Expected all tests pass, including original manual dispatch. Run pnpm --dir apps/web typecheck; inspect only newly introduced failures. Exercise the native comparison fixture through Browser, including reload and stale candidate.
- [ ] Commit with message feat(social): reconcile verified Facebook publication receipts.

### Task 3: Production receipt verification and handoff to scheduler work

**Files:** Create docs/validation/2026-10-18-social-receipts.md; update only release notes needed by this change.

**Interfaces:** Consumes the native reconciliation endpoint and stored publication record. Produces a sanitized validation report with exact commit/deployment and receipt identity.

- [ ] Review the diff and required CI checks; open a focused PR. Apply the reviewed migration using the production migration workflow, run Supabase security advisors for changed objects and verify service-only RPC/table grants. Do not weaken grants to solve a failed check.
- [ ] Deploy through the repository's normal merged-main workflow. Verify the actual production commit and route; do not call a feature live from a green local test alone.
- [ ] Open the Family attempt ac0fbb74-de9f-4870-a401-0658bfbc75f8. Use inspect, compare the original approved image with the existing Facebook post, complete native reconciliation and reload saved status. Assert provider POST count has not increased and the returned real post link matches the inspected post. If credentials/fields are denied, report this specific blocked verification; keep uncertain and do not create another draft.
- [ ] Verify Family Instagram's existing receipt remains published and The Prompt's bindings are unchanged. Save safe native proof and sanitized validation evidence. This is a focused regression check, not another publication.
- [ ] Commit the validation report. Stop before executing Scheduler Plan until its review/execution gate is satisfied.

## References
- Approved design above; current code and tests named in each task.
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
- https://developers.facebook.com/docs/pages-api/posts/
- https://developers.facebook.com/docs/graph-api/reference/page/published_posts/
