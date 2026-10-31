# Nova social campaign preparation design
Date: 2026-10-31. Work ID NOVA-SOCIAL-CAMPAIGN.
Continuation after released PR609. Owner asked for three LinkedIn texts and real images next week, selected days/times, ready for review. Existing autonomy policy delegates routine technical choices; no new paid/provider/SQL activation is inferred.

## Approaches and chosen implementation
1. Reuse native Omnira runs, governed Ideogram image client, canonical private assets and immutable social content review. Chosen engineering default: existing credentials and spending controls, no extra service, no idle agent.
2. Higgsfield: current Omnira transport explicitly read-only; PR552 is a separate video allowance for two other projects. Do not broaden it or use the ChatGPT connector as Nova runtime credentials.
3. External automation service: adds another credential, queue and spend boundary without solving current project/review needs. Not chosen.
Existing PR581 is Family-only recurring text preparation from pre-owned imagery. It is not this owner-triggered multi-project request; preserve it. Previous preflight matches to old workflow-read and Windows hardlink branches were inspected and ruled unrelated. Final preflight approves one new branch; three receipts retained.

## User-visible behavior
Nova resolves an explicitly owned target from any owned conversation, reads that project's approved channel plan, company facts, own assets and existing posts, drafts up to three distinct texts with image briefs and intended Stockholm local times, then submits one bounded campaign preparation.
The save receipt gives a durable run/campaign identifier and a real review URL. A request is queued only when its durable records exist. Worker progress is visible, with queued, generating, review-ready, blocked and uncertain distinguished.
Each image is generated once under the selected project's current budget/STOP authorities, admitted as a canonical private image with dimensions/checksum/provenance, then attached to an ordinary immutable content proposal. No synthetic success images in production.
No draft or time is approval or permission to publish. Existing native editorial review remains mandatory. A provider timeout or lost result is uncertain and cannot automatically regenerate or refund.
First real campaign, after separate activation: next week begins 2026-11-02; proposed Tuesday 2026-11-03 08:30, Thursday 2026-11-05 08:30, Friday 2026-11-06 08:30 Europe/Stockholm. These are an editorial default, not an analytics-backed optimal-time claim.

## Architecture
New module lib/social-launch/campaign. One campaign root plus max three item records; one canonical runs row per image item, kind social.campaign.image.v1, picked by existing claim_runs/drain. No empty agents or fake workflows. Native workflow definition and run kind are the execution identity.
Enqueue RPC validates current project owner + allow-list + source-chat owner, exact approved plan and profile revision, fixed provider/model, bounded input, future distinct times, immutable intent hash and idempotency. It atomically creates all item/run rows or none.
Fresh worker claims compare project, owner, campaign/item/run/claim and live lease. Durable generating latch is written before the paid request. A second claimant cannot dispatch an already-started item. Run retry/reaper must never duplicate paid images.
One image per run bounds Vercel invocation. Existing generateIdeogramV3 remains the paid boundary and withGovernedSpend remains the project/global budget authority. Use explicit AUTONOMOUS / PROJECT / RUN_BOUND context; no OPERATOR_INTERACTIVE escape.
Preparation defaults OFF. Enable requires a reviewed SQL rollout, explicit owner budget for this operation, separate server flag and enforced canonical spend gate. Proposed hard maximum SEK5 for the entire max-three-image campaign, in addition to existing project/global caps; generation stops if current rate exceeds the campaign's reserved unit ceiling. No blind retry/fallback.
Provider image retrieval must use server-issued validated HTTPS origins with no redirects, size/type/dimension checks and a finite timeout; never a model-supplied URL or hostname. Reuse canonical admitAssetBytes rather than exposing vendor URLs as asset identity. If dispatch/admission outcome is uncertain, preserve evidence and stop.
Each successfully admitted item is saved via the existing social_content_propose RPC against its exact approved plan, one stable postId and idempotency key. SQL replay returns the same content revision. A completed item can resume without more paid calls.
Owner may read status and cancel remaining work from any owned chat. Cancel races suppress future generation and completion claims while preserving real charged/created evidence.
UI uses existing social workspace review; campaign status is a small additional owned view, never implementation jargon in the normal flow.

## LinkedIn release boundary
Current account setup is missing and scheduling SQL supports FB/IG only. Implement and test a separately gated LinkedIn company-page publisher seam against official Images/Posts API contracts, with exact approved content/destination/image hash, server-held credentials, no redirect token forwarding, one create attempt and an ambiguous-outcome receipt. It must not be reachable from draft preparation.
Do not connect accounts, change app permissions, publish test posts or enable automatic jobs without explicit account/schedule authority. Use existing reviewed manual LinkedIn export as the honest fallback while account/API access is pending. A mocked publisher is not a live connection.
Official sources: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api and https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api ; current API version must be verified before activation.
Ideogram existing v1 generate contract is supported legacy; do not silently migrate working provider calls. https://developer.ideogram.ai/v1/api-reference/generate-images/generate-v3 . Source reports v3 TURBO USD0.03/default USD0.06; runtime uses fresh canonical rates and hard caps, never these prose prices.

## Verification and failure criteria
Real PostgreSQL17 disposable networkless tests: atomic enqueue, global/cross source audit, replay/conflict, foreign owner/allow-list, current plan/profile, stops, exact claim/lease, concurrency winner, started/no redispatch, cancelled/fenced/uncertain and ACL.
Unit/route tests: malformed/extra fields, one-to-three bound, duplicate slots/posts, Stockholm DST, source context, feature gates before writes, current budget and price, genuine private asset/content receipt, no success before save, no publish tool reachable.
Provider/LinkedIn HTTP tests use controlled fake fetch at network boundary; no external paid or publication calls.
Full relevant app regression, targeted type check, independent branch review, exact-head CI and signed-in Preview before proposed production approval.

## Activation, risk and rollback
No new production SQL, credentials, paid image calls, flag change or publishing is authorized by development. Prepare concrete SQL, cap, risk and rollback for one owner decision after tests/review.
Risk: legitimate owner can request paid generation; retry ambiguity and races could duplicate cost, so durable once-only admission plus refusal on unknown are mandatory. Wrong-project content is mitigated by owner/allow-list/source checks and target-specific context. Rollback disables new enqueue/worker flag, cancels pending campaigns, keeps audit/private assets/drafts and rolls app back. Never remove real receipts or rewrite migration history.
Baseline:28 project-context tests pass. Existing social DB test suites cannot initialize because their shared labelled fixture container is absent;17 tests skipped by failed setup, not reported green. Use a standalone disposable PG17 proof for this feature, as PR609 did.
