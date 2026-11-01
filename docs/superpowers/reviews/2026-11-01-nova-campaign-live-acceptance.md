# Nova image campaign: real acceptance follow-up, 2026-11-01

PR610 was merged at123d33fe5d59d768ea1aba2899d4e19bf4516f8a after17 green checks. The exact schema was applied once and the code deployed OFF first, then owner-approved HB-only configuration deployed. Both custom domains were verified at active deploymentdpl_C4uCcmu1ZxL9zHTc67Hexb4tCrsN. LinkedIn publisher remains0. No budget limits increased.

## Real defect
Two authenticated requests in the global source chat resolved the correct HB owner/project and read current profile/approved plan/content. The first used the idempotency key as a status campaignId; its real INVALID_BODY receipt was confirmed in conversation_messages. The next never called prepare_social_campaign, instead incorrectly treating publicationReady=false / absent LinkedIn connection as a preparation blocker. Zero campaign rows, zero image jobs and zero image provider dispatch existed at that checkpoint. No successful real image pilot is claimed.

## Bounded fix
Only after a successful owned content read, report imageCampaignPreparation configuration separately from publishing. Configuration requires explicit project activation, enforced H1 gate, exact provider origin and an existing server credential; it grants no execution or budget authority. Enqueue and physical dispatch retain all prior checks. Clarify each tool guide's own scope, distinguish delivery flags from preparation, require a UUID instead of an idempotency key for status, and provide actionable shape-error guidance rather than claiming enqueue failure.

Reproduction: new content-capability test RED (one real behavioral assertion failed). Fix tests cover publication disabled but preparation configured, refusal before capability metadata, project/flag/gate/origin/credential OFF cases, and status-key recovery with zero enqueue/read. Dedicated campaign CI includes the new regression. This follow-up is a small read-only metadata/guidance change, self-reviewed; no repeat independent review of PR610 is claimed.

## Existing work / preflight ruling
Exact script receipt: ../plans/preflight-NOVA-CAMPAIGN-LIVE-20261101.json. It returned review_required / matching_local_branch because this very owned branch/worktree exists, with no open PR candidate among123 inspected. PR610 is MERGED and cannot accept a new fix. Manual ruling: REUSE the same owned branch and worktree; fast-forward to current main, do not create any branch/worktree, do not touch parallel work. A single bounded follow-up PR is necessary for a newly observed live acceptance defect. The receipt is preserved unchanged and is NOT described as new_branch_approved. No guard, history, approval or migration is bypassed.

## Remaining acceptance
Reconcile green exact-head checks, merge/deploy this fix with the existing approved HB-only flags. Continue the same explicit request and idempotency key, max3 new images / max5 SEK. Verify actual provider receipts, private canonical assets and immutable unapproved native review revisions. Keep original global source project_id NULL and the two old HB drafts unchanged. No approval, account connection, executable delivery or publication is authorized.
