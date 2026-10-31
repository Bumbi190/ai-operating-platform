# Proposed Nova image campaign activation — NOT ACTIVATED
Prepared 2026-10-31. Continues live PR609; this branch is additive and default OFF.

## What this change provides
An explicit owned-project request from any owned chat can prepare 1–3 LinkedIn drafts with one newly generated image per item. Native runs and an owned status page report actual progress. The final immutable content revision uses existing human review. Intended Stockholm dates do not authorize publication.

## Separate owner decision required
Approve the new two-table service-only schema and bounded image preparation for the intended pilot project. Proposed standing maximum image allocation: SEK5 total per explicit requested campaign of at most three images, charged to existing canonical project/global budgets. No budget increase, approval, account connection or publication follows from installing the schema. Before any wider activation, agree which projects and standing limits are authorized; a global flag alone is not a project-specific spending authorization.

## Exact activation sequence, only after approval
1. Rebase/reconcile once against current main and production migration inventory. Assign one canonical migration timestamp to the exact reviewed social_campaign_preparation_NOT_APPLIED.sql, move it to apps/web/supabase/migrations, and update strict expected/source/ledger reconciliation counts. Never forge ledger entries or grandfather a migration.
2. Run the canonical migration against a disposable PG17 fixture, then apply exactly once to the intended Supabase project. Confirm actual names, function checksums/ACL, service-only FORCE RLS and exact current production ledger. The proposal is currently outside canonical migrations specifically because it is NOT applied.
3. Deploy with SOCIAL_CAMPAIGN_PREPARATION unset. Confirm existing PR609 behavior and no paid requests.
4. Verify the current approved LinkedIn channel plan and company profile for the chosen project; preserve original owned source chat. Confirm enforced SPEND_GATE policy, live canonical rates and existing project/global headroom. Read the exact current spend flag from lib/cost/spend-gate-flag.ts; no advisory override.
5. Pin SOCIAL_CAMPAIGN_IMAGE_ORIGINS to the independently verified provider origin. Official Ideogram V3 documentation currently returns https://ideogram.ai/api/images/ephemeral/...; https://ideogram.ai is the documented origin, not a wildcard. Verify current actual response origin before a paid pilot; refuse other origins, credentials, ports and redirects. Do not log or save expiring signed URLs as image identity.
6. Enable SOCIAL_CAMPAIGN_PREPARATION=1 only inside the approved project/budget rollout scope. Set SOCIAL_CAMPAIGN_PROJECT_IDS to only the separately authorized project UUIDs. Both enqueue and the last pre-dispatch check require that allow-list; empty or malformed configuration refuses paid work. A project authorization permits at most SEK5 per explicit requested campaign, subject also to existing project/global budgets.
7. Run one approved bounded pilot, record real provider + private asset + immutable content receipts, and review the actual text/image UI. A mocked HTTP contract is not proof of provider success.
8. Leave SOCIAL_LINKEDIN_PUBLISHER unset. The LinkedIn adapter has no route, schedule or tool caller and lacks a live native delivery-authority integration. Existing scheduling supports FB/IG; LinkedIn account consent, API permissions, exact delivery grant, durable create latch and version checks require a separate release.

## Rollback and uncertainty
Unset SOCIAL_CAMPAIGN_PREPARATION; cancel pending campaigns through the owned control. Queued native runs become cancelled; in-flight work is watched and evidence is retained. Keep real assets, revisions and cost receipts. Roll back application deployment if necessary; do not delete audit rows or rewrite applied history.
A started item never blindly regenerates. A real admitted-asset checkpoint can resume content save on a reclaimed live run. Three native attempts permit crash recovery; the durable dispatch latch prevents those attempts from becoming three paid images. Normal uncertain or permanent worker failures do not automatically retry.
Each execution-bearing item has a65s deadline and requires80s invocation headroom. The existing300s drain claims max3. Non-abortable storage work may preserve an orphaned canonical asset after timeout; the worker stops content continuation and records uncertainty.

## Primary API references checked
- https://developer.ideogram.ai/v1/api-reference/generate-images/generate-v3 — legacy V3 multipart request; only the new constrained campaign invocation uses this documented encoding. Existing V3 callers retain their prior transport contract.
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api?view=li-lms-2026-10
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-10
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/vector-asset-api?view=li-lms-2026-10#upload-the-image — linked Images API upload reference, PUT requires OAuth; credentials never leave the exact permitted LinkedIn origin.
