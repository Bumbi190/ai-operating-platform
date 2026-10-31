# Nova Social Campaign Implementation Plan

> **For agentic workers:** use superpowers:executing-plans inline, with one fresh whole-branch reviewer at the end. Steps use checkbox syntax.

**Goal:** Nova queues a bounded real-image campaign for an explicitly owned project from any owned chat and returns genuine editorial review receipts.
**Architecture:** Reuse native claimed runs, governed Ideogram and private canonical assets. Add durable campaign/item intent and once-only dispatch state; save final posts through current social-content RPCs. LinkedIn publishing remains an independently gated adapter requiring real account and schedule authority.
**Tech Stack:** Next.js14, TypeScript, PostgreSQL17, Vitest; no new runtime dependency.
**Spec:** docs/superpowers/specs/2026-10-31-nova-social-campaign-design.md

## Global Constraints
- Max3 image posts, max SEK5 per campaign proposed cap; fresh canonical rates plus existing budget/STOP policy.
- Default OFF, no live SQL/spend/account/publish activation during implementation.
- Target owner/allow-list and source owner checked independently; preserve PR609 scope and Studio.
- Preserve parallel PR552,581,558,578,608,605 and all their worktrees.
- Once an image starts, no automatic redispatch after uncertainty; preserve evidence and stable item/post IDs.
- Use current social plan/profile/content/assets, human exact-revision review, no autoapproval.

## Review Focus
- Concurrent identical requests and reaped run claims must never produce two paid images.
- Owner transfer, plan/profile change, revoke/cancel and STOP during generation.
- Provider success followed by admission/save failure must not invite a paid retry.
- Private URL/dimension/MIME errors and cross-project media must fail before content approval.
- A queued/status/review link must reflect durable state; caller cannot forge claim, rate, approval or provider URL.

### Task1: Campaign contract and validation
Files: lib/social-launch/campaign/types.ts,validate.ts,validate.test.ts.
Interfaces: parseCampaignInput(unknown,now):CampaignInput; CampaignItemDraft(title,text,imagePrompt,localMinute); CampaignView(id,projectId,conversationId,status,items,workspaceUrl).
- [ ] Write failing behavioral tests for max3, exact fields, future distinct Stockholm times, length limits, invalid UUID/rate fields.
- [ ] Run RED; implement narrow parser with existing Stockholm resolver.
- [ ] Run GREEN and commit.

### Task2: Durable owner-scoped queue and claim store
Files: proposed SQL outside canonical migrations until reviewed activation; campaign/store.ts; scripts/atlas/verify-nova-campaign.test.mjs.
Interfaces: enqueueCampaign(db,principal,conversationId,input); readCampaign(...); cancelCampaign(...); claimCampaignItem(db,{projectId,campaignId,itemId,runId,claimId}); commitCampaignItem(...); markCampaignItemUncertain(...).
- [ ] Write real PG17 behavioral tests before SQL: atomic max3 runs, idempotency, global/cross source, foreign scope, plan/profile/stops, claim lease and concurrent winner.
- [ ] Observe RED; implement server-only RLS tables/RPCs with exact closed JSON and stable IDs.
- [ ] Verify started items cannot redispatch, stale claims cannot commit, cancellation/owner change refuses, anon/auth direct write and EXECUTE denied.
- [ ] Run GREEN and commit. SQL stays proposed until release review, avoiding a knowingly broken build guard.

### Task3: Claimed image preparation worker
Files: campaign/image.ts,image.test.ts,worker.ts,worker.test.ts; app/api/runs/drain/route.ts.
Interfaces: prepareCampaignImage(writer,item,unitCeilingSek):AdmittedAsset; executeCampaignImageRun(db,run,claimId):void.
- [ ] Tests RED: only current native claim may start, one physical image, budget/feature/STOP refusal before HTTP, no retry on unknown, private image admission, stable content save receipt.
- [ ] Reuse generateIdeogramV3 and canonical admission, with finite timeout/closed provider image retrieval. Save through current social_content_propose.
- [ ] Integrate exact run kind into existing drainer; fence lifecycle and permanent errors without changing other executors.
- [ ] Verify reaper/replay/cancel/partial item failures and no false review-ready.
- [ ] Run GREEN and commit.

### Task4: Chat tools and owned campaign status
Files: campaign/atlas-tools.ts,api.ts,view component/page; chat route/tool labels; campaign route tests.
Interfaces: prepare_social_campaign,get_social_campaign,cancel_social_campaign; owned status URL.
- [ ] Tests RED for feature-off, foreign target/source, Studio restriction, closed fields, safe action receipts and owned status/cancel.
- [ ] Register bounded tool, exact capability guidance; reuse profile/plan readers and native review links.
- [ ] Show genuine per-item status and saved post links, no claim that queued is complete.
- [ ] Run focused route/UI regression and commit.

### Task5: Gated LinkedIn company-page publication seam
Files: lib/social-launch/publication/linkedin-adapter.ts and test.
Interface: publishReviewedLinkedInImage(verified server authority,canonical bytes,approved text,fetch):definite/uncertain receipt.
- [ ] Tests RED for exact org/version headers, image upload and readiness then one Posts create; client URL/redirect refusal, stale approval, unknown create result no retry.
- [ ] Implement against current official API contracts, default-disabled and never callable by preparation tools.
- [ ] Preserve current manual reviewed export; account setup and schedule activation are explicit remaining boundaries.
- [ ] Run GREEN and commit.

### Task6: Review and concrete activation proposal
- [ ] Run standalone PG17, affected app suites, scoped types and diff check; report baseline suite/fixture limitations.
- [ ] Fresh whole-branch review; substantive findings get reproducing RED/GREEN tests.
- [ ] One Draft PR with spec/preflight/test evidence, proposed schema and activation risk/cap/rollback.
- [ ] Return exact required owner decision for new production SQL and paid-generation activation only after code is concrete and reviewable.
