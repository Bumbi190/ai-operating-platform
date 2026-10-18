# Approved Social Batches and Monthly Sneak Peeks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish exactly approved Family Facebook/Instagram batches at their Stockholm times, including a new-month sneak peek on the first of every month.

**Architecture:** Store immutable batch manifests and owner publication decisions. A service-only queue worker uses a DB-issued claim bound to that decision, with the existing publication journal as its no-duplicate authority. Monthly recurrence creates planning slots, not standing authority to publish unreviewed content.

**Tech Stack:** Existing Next.js/TypeScript, Supabase Postgres/RPC, Intl for Stockholm time, Vitest and native Browser fixtures. No new product dependencies.

**Spec:** docs/superpowers/specs/2026-10-18-family-social-scheduling-design.md. Receipt dependency: docs/superpowers/plans/2026-10-18-social-receipt-recovery.md.

## Global Constraints
- Ordinary posts: weeks 1/3 Tuesday 17.00, Friday 20.30; weeks 2/4 Tuesday 20.30, Friday 17.00; Europe/Stockholm.
- Monthly slot: day 1 at 20.30, year/month-specific sneak peek of the active month's actual story/activities on both Family channels.
- At most three content occasions per Stockholm Monday–Sunday week and two channels per occasion; one provider job per tick.
- Every approval pins project/post/revision/hash, media/hash, content decision, channel plan, binding/account, time and any release predicate. Edits require new review.
- No provider write before scheduledAt or later than scheduledAt+10 minutes, including Instagram media_publish.
- maxDuration=60; internal worker budget 45 seconds; lease 90 seconds; CAS on every state change.
- Release evidence is owner_verified_access for the same releaseMonth and catalogSha256, no older than 24 hours at every provider write. Store the actual evidence ID in the job event.
- Batch authority is distinct from content approval. No worker-supplied fake human principal. Stop/revocation/current owner access are rechecked before every provider write.
- Unknown outcomes never retry a POST or create a replacement container. Read-only reconciliation is allowed.
- Server flags: SOCIAL_SCHEDULE_DISPATCH_ENABLED defaults to 'false'; SOCIAL_SCHEDULE_PROJECT_IDS defaults to an empty allowlist. Both must explicitly permit Family at activation.
- Ship disabled. No subscriptions, secret changes, external notifications or The Prompt changes. No automatic week-content generation or engagement collector is claimed by this plan.
- Use CLI-generated migration names, RLS, explicit service_role grants and security-invoker RPCs. No public/anon/authenticated access to queue/proof tables or RPCs.

## Review Focus
- A monthly slot shares a day with an ordinary slot: independent content occasions, no duplicate channel jobs, weekly cap still enforced (Task 2).
- December–January rollover and months lacking prepared catalog/media: correct year/month or a visible unprepared slot, never recycled content (Tasks 1, 4).
- Approval owner loses access after scheduling: block dispatch rather than honoring stale membership (Tasks 2, 3).
- Stop/revoke arrives during image verification or between Instagram stages: recheck immediately before the next write (Task 3).
- A worker lease expires just after a successful provider call but before checkpoint: never resend on recovery (Task 3).

---

## Preparation at execution time
Use the execution method selected by André and the corresponding Superpowers skill. Create an execution worktree from freshly fetched main. Bring in the reviewed receipt change first. Revalidate the spec if main has changed its interfaces.

Use only a labeled task-owned local SQL fixture and WEBSITE_BUILD_TEST_DATABASE_NAME, as described by the receipt plan. Never run Vitest SQL fixtures against hosted Supabase. Native browser control follows Browser skill. All listed commands run from repository root.

### Task 1: Exact schedule and monthly planning contracts

**Files:** Create apps/web/lib/social-launch/scheduling/{types,time,manifest}.ts and matching .test.ts files.

**Interfaces:**
- resolveStockholmSchedule(localMinute:string) -> string UTC ISO with milliseconds. Only strict YYYY-MM-DDTHH:mm and Europe/Stockholm; invalid/nonexistent/ambiguous input rejects.
- monthlyReleaseSlot(releaseMonth:string) -> {releaseMonth,localMinute,scheduledAt,requiresReleaseEvidence:true}; accepts YYYY-MM and always day 1 at 20.30.
- ScheduleItem = {postId,revisionId,sha256,decisionId,planRevisionId,bindingId,accountId,channel:'facebook'|'instagram',asset:{id,sha256},localMinute,scheduledAt,expiresAt,occasionId,kind:'ordinary'|'month_release',releaseCondition:{releaseMonth,catalogSha256}|null}.
- ScheduleManifest = {projectId:string,items:ScheduleItem[]}; canonical hash uses stable key ordering and full bound values.
- validateManifest(input:unknown, now:string) -> ScheduleManifest; at most six jobs per batch, future dates within the existing 366-day content horizon, UTC/local agreement, ten-minute expiry and two channels per occasion.
- QueueState = 'queued'|'claimed'|'waiting'|'published'|'failed'|'uncertain'|'blocked'|'cancelled'|'missed'. ScheduleJob = {id:string,batchId:string,postId:string,channel:'facebook'|'instagram',state:QueueState,scheduledAt:string,expiresAt:string,publicationId:string|null,reason:string|null,version:number}.
- ScheduleBatchView = {projectId:string,batchId:string,revisionId:string,sha256:string,status:'proposal'|'approved'|'revoked',manifest:ScheduleManifest,approval:{id:string,approvedBy:string,approvedAt:string}|null,jobs:ScheduleJob[]}.
- ApprovedScheduleSnapshot = {projectId:string,manifestSha256:string,approvalId:string,item:ScheduleItem,revision:SocialContentRevision,publication:PublicationRecord|null}.
- MonthlyRule = {dayOfMonth:1,localTime:'20:30',timeZone:'Europe/Stockholm',channels:['facebook','instagram'],enabled:boolean}; preparing upcoming slots does not create jobs or approve content.

- [ ] Write failing tests asserting 2026-10-23T17:00 -> 2026-10-23T15:00:00.000Z; 2026-10-27T17:00 -> 16:00Z; 2026-10-25T02:30 and 2027-03-28T02:30 reject; monthlyReleaseSlot('2027-01') returns January 1 at 19:30Z. Assert manifest hash changes for a one-character caption revision/hash, image, account or time change; reject duplicate channels, UTC mismatch and unknown fields.
~~~ts
it('resolves_both_sides_of_the_october_clock_change', () => {
  expect(resolveStockholmSchedule('2026-10-23T17:00')).toBe('2026-10-23T15:00:00.000Z');
  expect(resolveStockholmSchedule('2026-10-27T17:00')).toBe('2026-10-27T16:00:00.000Z');
  expect(() => resolveStockholmSchedule('2026-10-25T02:30')).toThrow();
  expect(monthlyReleaseSlot('2027-01').scheduledAt).toBe('2027-01-01T19:30:00.000Z');
});
~~~
- [ ] Run: pnpm --dir apps/web exec vitest run lib/social-launch/scheduling/time.test.ts lib/social-launch/scheduling/manifest.test.ts. Expected red for missing modules.
- [ ] Implement the contracts. For Stockholm minute resolution, derive candidate UTC instants using offsets +60 and +120 minutes, compare full Intl.DateTimeFormat parts to the requested local value, and require exactly one match. Never let JavaScript silently normalize an invalid date.
- [ ] Run the same tests to green; run typecheck. Commit feat(social): define exact batch and monthly release contracts.

### Task 2: Durable batches, release conditions and job claims

**Files:** Create scheduling/{store,test-db,fixtures.test-utils}.ts and store.test.ts. Generate migrations via cd apps/web; supabase migration new social_schedule_batches. Extend publication/types.ts, the publication record SQL projection and local test bootstrap as needed.

**Interfaces:**
- proposeSchedule(db, principal, {projectId,manifest,expectedRevisionId,idempotencyKey}) -> ScheduleBatchView.
- approveSchedule(db, principal, {projectId,batchId,revisionId,sha256,confirmed:true,idempotencyKey}) -> ScheduleBatchView.
- revokeSchedule(db, principal, {projectId,batchId,expectedVersion}) -> ScheduleBatchView.
- saveMonthlyRule(db, principal, {projectId,rule}) and recordReleaseEvidence(db, principal, {projectId,releaseMonth,catalogSha256,customerViewUrl,confirmed:true}) require actual owner/operator; no Atlas tool exposes these mutations.
- claimScheduleJob(db,{workerId,now,dryRun:boolean}) -> ScheduleClaim|null. ScheduleClaim = {jobId:string,claimId:string,version:number,leaseExpiresAt:string,snapshot:ApprovedScheduleSnapshot}; it contains no credential.
- checkScheduleWrite(db,claim) -> authorized snapshot or typed refusal.
- recordScheduleStep(db,claim,step) -> {claim,publication,jobState}; step is the existing publication action set plus the job checkpoint. No arbitrary state setter.
- Add PublicationRecord.authoritySource:'manual'|'scheduled' and jobId:string|null. Existing manual rows default to manual.

Database artifacts: social_schedule_batches (immutable manifest revisions), social_schedule_decisions (approve/revoke audit), social_schedule_jobs (one item/attempt), social_schedule_events (append-only), social_monthly_release_rules (one project rule), social_monthly_release_evidence (immutable owner check). Use composite project foreign keys and unique constraints for a post revision and for non-null (project_id,release_month,channel). One currently queued/claimed/waiting job can reference an item.

Expose strict service-only RPCs with prefix social_schedule_: read, propose, approve, revoke, monthly_rule_save, release_confirm, claim, authorize_write and step. Human RPCs take p_principal/p_input; worker RPCs take only a DB-issued claim, never owner identity from the caller. Keep owner who authorized separate from worker who executed in audit. Extend publication event actor representation to allow actor_kind='worker' with job_id and no fabricated user actor; preserve human audit history.

- [ ] Write failing real-SQL tests using initializeSchedulingDb() and scheduleFixture(db,{kind?,releaseMonth?,items?:ScheduleItem[]}) -> {principal,manifest,batch,approval:Parameters<typeof approveSchedule>[2],dueAt:string}. Its default manifest has exactly one item so claim concurrency has one eligible intent; multi-item cap/collision tests supply items explicitly. Assert double approval/concurrent claim creates one intent; two batches cannot duplicate one month/channel; fresh matching release evidence may arrive after conditional batch approval; wrong year/catalog or evidence older than 24h denies authorize_write. Test lost owner access, paused project, revoked decision and authenticated/anon role denial. Test that a due scheduled revision passes the dedicated ten-minute window while the existing manual path still rejects its scheduledAt value.
~~~ts
it('two_claimers_share_only_one_intent', async () => {
  const f = await scheduleFixture(db, {kind:'ordinary'});
  await approveSchedule(db, f.principal, f.approval);
  const claims = await Promise.all(['a','b'].map(workerId =>
    claimScheduleJob(db, {workerId,now:f.dueAt,dryRun:false})));
  expect(claims.filter(Boolean)).toHaveLength(1);
});
~~~
- [ ] Run: pnpm --dir apps/web exec vitest run lib/social-launch/scheduling/store.test.ts. Expected missing RPC/table failures.
- [ ] Implement migrations and store. Approval/job creation is one transaction. Claims use row locks/SKIP LOCKED, a 90-second lease and version checks. A claim does not grant rights after revocation. Reclaim only a proven pre-provider queued intent; creating/publishing loss is uncertain, not queued. Enforce the global weekly occasion limit in SQL across batches, with a Monday Stockholm boundary. A monthly planning slot alone creates zero executable jobs. Do not pass a naturally due scheduled revision through the manual time_passed blocker: the dedicated scheduled guard replaces only that temporal rule with its exact due/expiry checks, and replaces activation_required with verified batch/feature authority. Revalidate every other content/account/media/plan requirement; the manual guard is unchanged.
- [ ] Run the tests to green; query grants/RLS/immutability in the owned fixture. Run changed-object Supabase advisors before preparing migration delivery. Commit feat(social): persist approved batches and fenced job authority.

### Task 3: Shared publication executor and authenticated tick

**Files:** Create publication/executor.ts and executor.test.ts; refactor publication/dispatch.ts without broadening manual authority; create scheduling/{worker,api}.ts and matching tests; create app/api/social-schedule-tick/route.ts. Modify publication/media.ts or its lookup SQL only where required to preserve scheduled-job stop/expiry revocation.

**Interfaces:**
- ApprovedPublicationSnapshot = {projectId:string,postId:string,revision:SocialContentRevision}. PublicationJournal = {prepare:()=>Promise<PublicationRecord>,step:(record:PublicationRecord,action:PublicationAction,extra?:Partial<PublicationStep>)=>Promise<PublicationRecord>}.
- executeApprovedPublication(ctx:{snapshot:ApprovedPublicationSnapshot,record:PublicationRecord|null,credential:ManualCredential,journal:PublicationJournal,authorizeWrite:()=>Promise<void>}, deps:{provider:MetaManualProvider,verifyImage:typeof verifyPublicationImage,now:()=>number,signal:AbortSignal}) -> Promise<PublicationRecord>; snapshot is the frozen reviewed content; journal persists prepared/claimed/container/receipt steps using the caller's validated authority; authorizeWrite is invoked after costly media I/O and immediately before every provider POST.
- Consumes assertExecutionDispatchAllowed(execution:ExecutionContract,target?:DispatchTarget):Promise<void> from apps/web/lib/governance/execution-dispatch.ts at the final write boundary, in addition to the DB batch guard. Existing dispatchPublication/checkPublication adapt the current human guard. runScheduledPublication(db,claim:ScheduleClaim,deps:ScheduledPublicationDependencies) adapts the Task 2 worker guard. Neither constructs the other's principal.
- ScheduledPublicationDependencies = {provider:MetaManualProvider,resolveCredential:(projectId:string,channel:'facebook'|'instagram')=>Promise<ManualCredential & {bindingId:string}>,verifyImage:typeof verifyPublicationImage,now:()=>number}; no fake owner identity. Export these shared contracts from publication/executor.ts and scheduling/worker.ts respectively.
- runScheduleTick(db,{workerId,now,dryRun},deps:ScheduledPublicationDependencies) -> {mode:'dry_run'|'execute',jobId:string|null,result:string}. One provider job, 45-second budget; no LLM.
- Tick route accepts authenticated internal GET only, validates the existing cron bearer contract, maxDuration=60 and no-store. A project allowlist/feature flag defaults to disabled. dryRun=1 reads eligibility only: no job claim/event, media capability, provider POST or DB mutation.

- [ ] Write failing tests named one_post_for_two_workers, no_send_after_stop_during_image_read, no_publish_after_revoked_instagram_container, unknown_write_never_reclaimed and checkpoint_loss_is_uncertain_without_retry. Assert first-write counts and journal states exactly. Add fake clock tests for scheduledAt-1ms, +10min and +10min+1ms; +10min is permitted, +1ms denies every POST including media_publish. Add a lease-expiry case after a provider response but before a lost checkpoint.
  Test table must include both checkpoint outcomes: a committed-but-unacknowledged receipt is read back as published; an uncommitted receipt remains uncertain without another POST.

~~~ts
expect(result.publication.state).toBe(checkpointCommitted ? 'published' : 'uncertain');
expect(providerPosts).toBe(1);
expect(secondTickProviderPosts).toBe(0);
~~~
- [ ] Run worker/executor tests to red. Refactor only after preserving the existing manual-dispatch tests; move provider execution into the shared executor, keep authority resolution outside it. Extend MetaManualProvider's constructor with an optional {signal?:AbortSignal} second argument, preserving existing callers. Combine that signal with each request timeout using AbortSignal.any; a 45-second worker abort must stop waiting and preserve uncertainty after a write. No request may start after the budget. Existing uncertain attempts and saved containers remain authoritative.
- [ ] Implement worker selection, safe checkpoints and tick auth. Missing release evidence can be rechecked within the same ten-minute window only before any provider write; after expiry mark missed. A changed predicate or content requires a new review. Never refresh a lost image-creation intent by generating a new container.
- [ ] Run: pnpm --dir apps/web exec vitest run lib/social-launch/publication lib/social-launch/scheduling. Assert dry-run produces zero provider writes and zero SQL writes; missing/invalid cron bearer returns 401; disabled flag returns without a claim. Verify current manual APIs still enforce same-origin/operator and reject scheduled-time manual dispatch.
- [ ] Commit feat(social): execute approved jobs with durable receipt guards.

### Task 4: Native weekly review, monthly slots and Atlas preparation

**Files:** Create components/social-launch/{SocialSchedulePanel.tsx,SocialSchedulePanel.module.css}, scheduling/atlas-tools.ts, scheduling/atlas-tools.test.ts, app/api/social-schedules/route.ts and scheduling/owner-api.test.ts. Modify SocialContentPanel.tsx, SocialPublicationPanel.tsx, content/atlas-tools.ts and apps/web/app/api/chat/route.ts (actual registry and dispatch) and publication/api.test.ts (existing registry assertions). Add e2e/social-scheduling-{entry.tsx,server.mjs}; use Browser for interaction.

**Interfaces:**
- Owner API operations read/propose/approve/revoke/monthly_rule_save/release_confirm map exactly to Task 2 interfaces and existing auth/same-origin/operator rules.
- Atlas tools get_social_schedule({projectId}) -> ScheduleBatchView and propose_social_schedule({projectId,manifest,expectedRevisionId,idempotencyKey}) -> ScheduleBatchView. Both require the actual project-bound conversation. Atlas cannot call approve, activate, release_confirm or dispatch.
- Queue view includes next six monthly planning slots even without prepared content; such slots explicitly say Innehåll saknas – inget schemalagt.
- Exact approval label: Godkänn och schemalägg veckans inlägg, with every account, image, caption and Stockholm date/time shown. An explicit conditional-release label explains that access must be confirmed for that month/catalog.
- Current manual panel may read scheduled receipts but must not offer its manual continue action for authoritySource='scheduled'.

- [ ] Write failing owner/tool tests for a reader trying to approve, a conversation from another project, Atlas attempting an approval operation and unknown fields. Browser fixture assertions: no approve until all exact snapshots load; editing time marks prior review stale; monthly slots show January's own year/catalog; missing media remains unprepared; owner sees delayed/uncertain/missed outcomes after reload.
~~~ts
expect(atlasToolNames).toContain('get_social_schedule');
expect(atlasToolNames).toContain('propose_social_schedule');
expect(atlasToolNames).not.toContain('approve_social_schedule');
expect(await readerApproveResponse.status).toBe(403);
~~~
- [ ] Run owner-api/atlas-tools tests to red. Implement the owner API and panel with the existing UI module patterns. Monthly rule enabled means planning recurrence only. A repeated month cannot reuse the previous month's approved post; use actual releaseMonth/catalog predicate and current owned material.
- [ ] Wire read/proposal tools into the actual registry and update SOCIAL_CONTENT_GUIDE: calendar drafts are still non-executable; only an explicitly approved batch can execute. Keep get_social_publication truthful. Add only in-app action items for blocked/missed/uncertain jobs; no mail/SMS.
- [ ] Run the focused tests and typecheck; exercise the served fixture through native Browser for weekly approval, stale manifest, revoked queue, missing-release evidence and the 1st-of-month slot. Save safe screenshots after changes. Confirm The Prompt's existing workspace/account flow has no new batch activation.
- [ ] Commit feat(social): review weekly batches and monthly sneak peeks.

### Task 5: Deployment readiness, disabled release and explicit activation

**Files:** Create scheduling/readiness.ts and readiness.test.ts, scripts/social-schedule-readiness.ts and docs/validation/2026-10-18-social-scheduling.md. Modify apps/web/vercel.json only after the actual hosting entitlement and invocation cost are verified.

**Interfaces:** readScheduleReadiness({projectId}) -> {ready:boolean,blockers:string[],nextJobs:ScheduleItem[]}; it does not send or claim. Blockers cover flag, clock/runner support, real account binding verification, missing exact approvals, missing monthly content/evidence and unverified receipt recovery.

- [ ] Write failing readiness tests: missing runner entitlement, disabled feature, stale binding, missing monthly content/evidence and no approved batch each block activation. Test that a monthly rule does not make ready=true on its own. Add owner API operation readiness and a native Kontrollera schemat utan publicering button which calls the same dry-run eligibility service; never expose the cron bearer to the browser.
~~~ts
expect(readiness.ready).toBe(false);
expect(readiness.blockers).toContain('runner_unverified');
expect(providerPosts).toBe(0);
expect(sqlWrites).toBe(0);
~~~
- [ ] Implement the read-only readiness report and run focused tests. Verify current primary Vercel scheduling rules and the actual project plan without exposing billing/private data. If minute execution is not supported, present a concrete priced alternative and stop activation; do not upgrade or silently substitute another scheduler. Do not add a ChatGPT reminder as a stand-in.
- [ ] Review changed-code CI, migration/grants/advisor output and the complete branch. Deploy disabled through normal main/production workflow. Verify actual deployment SHA and run authenticated dry-run on production through the native owner control (same eligibility code as dryRun=1), with SQL-before/after and provider-write counters showing no dispatch.
- [ ] Prepare a concrete first batch from the approved editorial topics, exact images and the revised 17.00/20.30 times. Show it and get its publication/activation approval in the native workspace. Reconfirm current Family bindings and month access evidence. Never create authority from this implementation-plan approval alone.
- [ ] Enable the authorized runner/feature only for Family, execute the approved controlled job and verify saved receipt plus actual channel link. Ensure first monthly job is November 1 at 20.30 Stockholm if ready in time; otherwise disclose that missed date and seek a new exact time rather than silently backfill.
- [ ] Record actual checks and any blocked step in the validation report. Confirm pause/revoke prevents future work, rollback leaves history intact and engagement/statistics automation is still a separate unimplemented follow-up. Commit the report.

## Validation commands
- pnpm --dir apps/web exec vitest run lib/social-launch/publication lib/social-launch/scheduling
- pnpm --dir apps/web typecheck
- pnpm --dir apps/web exec node scripts/check-migrations.mjs
- Native Browser fixture checks from Task 4; do not substitute standalone browser control.

Do not run broad expensive CI repeatedly after these checks pass unless a new change/failure warrants it. No tests are claimed as run by this plan document.

## Execution and review
Recommended: Native, implement the tasks in dependency order in this session, with one fresh whole-branch reviewer at the end. The shared manifest/authority/executor interfaces make sequential implementation simpler; concurrency and permission tests remain mandatory. Subagent-driven task-by-task implementation/review is the alternative if André prefers more independent gates.

After the user reviews these plans and chooses Native or Subagent-driven, invoke the matching required execution skill. Plan approval is not activation approval.
