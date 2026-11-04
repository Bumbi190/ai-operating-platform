# Harvey / Handlarbörsen – live SCB candidate review bridge

Date: 2026-11-02. Continuation of existing Draft PR #386.

## Purpose

Bridge the already-qualified SCB Preview probe into the existing Handlarbörsen human-review candidate table without making any discovered company contactable.

The flow is deliberately two-stage:

1. read-only SCB workplace + legal-entity verification,
2. explicit owner click to save exactly one blocked candidate for later human review.

No SCB result is persisted automatically.

## Database migration

Migration:
`20261102064659_handlarborsen_scb_live_preview_candidates.sql`

Reviewed SHA-256:
`CF12468800265C9B54F42FDAA5F27F2EADB9357EB6EDE833D95B5F3A0A3F26B7`

Applied through Supabase migration API after explicit owner approval.

Actual production ledger:
`20261102070352_handlarborsen_scb_live_preview_candidates`

The migration changes only `hb_lead_candidates_provenance_check`. It preserves the exact historical 2026-10-27 snapshot contract and additionally admits live Preview provenance:

- `source=scb_foretagsregistret`
- `review=awaiting_human_review`
- `audit=hb-scb-live-preview-v1`
- bounded `YYYY-MM-DD` retrieval date
- numeric workplace CFAR

RLS, grants, legal-form restrictions, SNI restrictions, unique project/orgnr identity, marketing guards, `BLOCKED_PENDING_VERIFICATION` and `outreach_ready=false` are unchanged.

## Candidate admission gates

The Preview-only candidate route requires all of:

- `VERCEL_ENV != production`
- `HB_LEADFINDER_SCB_PREVIEW_ENABLED=true`
- `HB_LEADFINDER_SCB_CANDIDATE_WRITE_ENABLED=true`
- authenticated project-owner access
- exact human confirmation phrase
- exact CFAR rediscovered in the bounded Malmö / SNI 47.811 SCB query
- a fresh legal-entity lookup
- a complete read of the currently connected Omnira sales-contact baseline
- duplicate check by exact Handlarbörsen project + legal organisation number

If known-contact history is incomplete/unavailable, no row is written.

A saved row is always blocked:
- ordinary verified candidate: `needs_review`
- prior contact/history match: `excluded`
- SCB marketing restriction: `suppressed`
- `contactability=BLOCKED_PENDING_VERIFICATION`
- `outreach_ready=false`

No contact details are persisted by this bridge.

## Verification before database apply

Production read-only preflight:
- `hb_lead_candidates=0`
- `sales_contacts=139`
- `sales_jobs=0`
- `sales_draft_revisions=0`
- `sales_discovery_batches=0`
- `sales_discovery_candidates=0`

Local verification:
- full Lead Finder / SCB group: **149/149** across 9 files
- migration/security + bridge group: **317/317** across 6 files
- full TypeScript: exit 0
- `git diff --check`: no errors

## Post-apply verification

After ledger version `20261102070352`:
- `hb_lead_candidates=0`
- `sales_contacts=139`
- `sales_jobs=0`
- `sales_draft_revisions=0`
- `sales_discovery_batches=0`
- `sales_discovery_candidates=0`
- the live provenance branch is present in the actual check constraint
- no RLS/grant/status/outreach constraint was changed

The Supabase security advisor produced no migration-specific new warning/error; the project's existing advisory inventory remains separate.

## Preview configuration

Restricted to branch `codex/atlas-harvey-sales-20261017` only:

- `SCB_API_KEY`: Sensitive
- `HB_LEADFINDER_SCB_PREVIEW_ENABLED=true`
- `HB_LEADFINDER_CONTACT_READ_ENABLED=true`
- `HB_LEADFINDER_SCB_CANDIDATE_WRITE_ENABLED=true`
- `HB_LEADFINDER_CANDIDATE_READ_ENABLED=true`

Production is not activated.

## Remaining acceptance

After exact-head Preview is READY:
1. owner reruns the bounded SCB probe,
2. owner adds exactly one suitable row to manual review,
3. verify exactly one blocked candidate exists,
4. verify Sales jobs/drafts/discovery and customer messages remain zero,
5. stop before Harvey draft generation.

Draft generation, continuous hosting, Production release and customer sending remain separate steps.
