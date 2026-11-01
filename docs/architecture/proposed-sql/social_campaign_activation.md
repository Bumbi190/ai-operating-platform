# Nova image campaign activation — owner approved, rollout in progress
Prepared 2026-10-31. Continues live PR609; this branch is additive and default OFF.

## What this change provides
An explicit owned-project request from any owned chat can prepare 1–3 LinkedIn drafts with one newly generated image per item. Native runs and an owned status page report actual progress. The final immutable content revision uses existing human review. Intended Stockholm dates do not authorize publication.

## Owner decision received 2026-11-01
Owner approved the new two-table service-only schema and activation for Handlarbörsen only (8f673c09-1c8f-4d78-876e-4c14bf1c89b3). Approved maximum image allocation: SEK5 total per explicit requested campaign of at most three images, charged to existing canonical project/global budgets. No budget increase, approval, account connection or publication follows from installing the schema. Before any wider activation, agree which projects and standing limits are authorized; a global flag alone is not a project-specific spending authorization.

## Exact activation sequence, only after approval
1. Rebase/reconcile once against current main and production migration inventory. Assign one canonical migration timestamp to the exact reviewed social_campaign_preparation_NOT_APPLIED.sql, move it to apps/web/supabase/migrations, and update the test loader to its assigned canonical filename and strict expected/source/ledger reconciliation counts. Never forge ledger entries or grandfather a migration.
2. Run the canonical migration against a disposable PG17 fixture, then apply exactly once to the intended Supabase project. Confirm actual names, function checksums/ACL, service-only FORCE RLS and exact current production ledger. The proposal is currently outside canonical migrations specifically because it is NOT applied.
3. Deploy with SOCIAL_CAMPAIGN_PREPARATION unset. Confirm existing PR609 behavior and no paid requests.
4. Verify the current approved LinkedIn channel plan and company profile for the chosen project; preserve original owned source chat. Confirm enforced SPEND_GATE policy, live canonical rates and existing project/global headroom. Read the exact current spend flag from lib/cost/spend-gate-flag.ts; no advisory override.
5. Pin SOCIAL_CAMPAIGN_IMAGE_ORIGINS to the independently verified provider origin. Official Ideogram V3 documentation currently returns https://ideogram.ai/api/images/ephemeral/...; https://ideogram.ai is the documented origin, not a wildcard. Verify current actual response origin before a paid pilot; refuse other origins, credentials, ports and redirects. Do not log or save expiring signed URLs as image identity.
6. Enable SOCIAL_CAMPAIGN_PREPARATION=1 only inside the approved project/budget rollout scope. Set SOCIAL_CAMPAIGN_PROJECT_IDS to only the separately authorized project UUIDs. Both enqueue and the last pre-dispatch check require that allow-list; empty or malformed configuration refuses paid work. A project authorization permits at most SEK5 per explicit requested campaign, subject also to existing project/global budgets.
7. Run one approved bounded pilot, record real provider + private asset + immutable content receipts, and review the actual text/image UI. A mocked HTTP contract is not proof of provider success.
8. Leave SOCIAL_LINKEDIN_PUBLISHER unset. The LinkedIn adapter has no route, schedule or tool caller and lacks a live native delivery-authority integration. Existing scheduling supports FB/IG; LinkedIn account consent, API permissions, exact delivery grant, durable create latch and version checks require a separate release.

## Rollback and uncertainty
Unset SOCIAL_CAMPAIGN_PREPARATION and deploy that immutable environment change; cancel pending campaigns through the owned control. Queued native runs become cancelled; in-flight work is watched and evidence is retained. Keep real assets, revisions and cost receipts. Roll back application deployment if necessary; do not delete audit rows or rewrite applied history.
A started item never blindly regenerates. A real admitted-asset checkpoint can resume content save on a reclaimed live run. Three native attempts permit crash recovery; the durable dispatch latch prevents those attempts from becoming three paid images. Normal uncertain or permanent worker failures do not automatically retry.
Each item has a65s total deadline (55s claim/work plus10s bounded settlement) and requires80s invocation headroom. The existing300s drain claims max3. Non-abortable storage work may preserve an orphaned canonical asset after timeout; the worker stops content continuation and records uncertainty.

## Primary API references checked
- https://developer.ideogram.ai/v1/api-reference/generate-images/generate-v3 — legacy V3 multipart request; only the new constrained campaign invocation uses this documented encoding. Existing V3 callers retain their prior transport contract.
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api?view=li-lms-2026-10
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-10
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/vector-asset-api?view=li-lms-2026-10#upload-the-image — linked Images API upload reference, PUT requires OAuth; credentials never leave the exact permitted LinkedIn origin.

## Nov1 rollout evidence (in progress)
- Current main remains b2335bc; original reviewed SQL moved byte-for-byte to apps/web/supabase/migrations/20261101062259_social_campaign_preparation.sql, SHA256 1c2606bbb98cb3192b4a240b017fc6452a005e93d81183ae8373e11c97367aa1. Its historical proposal header is deliberately preserved; this rollout record determines apply status.
- Production inventory before our apply:191 unique names. Parallel human_story_exact_claim is already live at20261031204433. Exact8806-character SQL restored to canonical source with SHA256 a7ffd88a4b1881b3173e4dfe98af5d6d6ea1d7bb47b0c09411954cbd698a32e6; never reapply it.
- Strict source counts169/155; expected post-apply ledger192, frozen14/30 unchanged. Native PG fixture now loads the actual live claim selector and wrapper, with matching body hashes.
- HB approved LinkedIn plan6ab87e6b-09c9-4c67-8bae-2796595fa8e6 verified. Existing global budget headroom sufficient at check; no project budget row exists and no limit was increased. Current canonical price0.84SEK/image, three2.52SEK, max5SEK allocation.
- HB profile saved through native authenticated UI, current revisioncba2787b-0816-4d4b-ad61-6f1e19bc0eb2, using owner handoff facts; no pricing/guarantee claims.

- APPLIED ONCE to Omnira at ledger20261101062748_social_campaign_preparation. Applied SQL SHA256 matches canonical exactly.192 unique known ledger names,169 canonical/155 enforced; two tables FORCE RLS/service-only, all14 function bodies/ACL/search_path verified. Evidence: docs/validation/nova-campaign-schema-20261101.json.
- Local activation validation146/146 tests, zero skipped;24/24 current-native PG17 tests. Image flags remain OFF at this schema checkpoint; no campaign/image dispatch yet.
