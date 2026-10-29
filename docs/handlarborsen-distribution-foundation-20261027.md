# Handlarbörsen: Distribution Engine — parallel foundation (2026-10-27)

## Purpose and status

Status: **INERT local foundation**; separate worktree `feat/hb-distribution-20261027`. No database changes, production import, messaging, background jobs, cron, additional APIs or model costs. This branch does **not** modify the simultaneously active SCB lead finder branch or the existing Atlas Sales branch.

**Business outcome:** active professional dealers with their first real listing — not a count of emails sent.

## Boundaries and existing assets

1. SCB Lead Finder (separate worktree `feat/hb-leadfinder-scb-20261027`) discovers organisations and performs SCB source-side checks. Current V3 is a partial preview, NOT contact approval. The historical approximately 139 pilot companies are not yet fully matched; suppressions, company activity and SNI relevance require further verification. Do not import the local CSV into live sales.
2. Atlas Sales (separate existing worktree `codex/atlas-harvey-sales-20261017`) already has `lib/sales` and a project Sales workspace: contacts, offers, draft revisions, email-copy revisions, reviews, send workflow, inbox and replies. **Reuse**, don't rebuild. Verify branch merge/release/feature flags before integrating.
3. Handlarbörsen (separate site/repo) owns registration, dealer approval and first-vehicle-listing evidence. Exact source tables/events must be mapped and verified later; do not assume an analytics event means an approved dealer.
4. Omnira Atlas aggregates source-backed, project-scoped data for owner review. Make attribution by cohort/channel possible, but never invent counts. Human decision required before any new outreach.

## Phase A: safe, independently testable work — this branch

- `apps/web/lib/handlarborsen/distribution/funnel.ts`: pure, offline analytics contract for nine source-backed stages, no network or actions.
- `apps/web/lib/qa/handlarborsen-distribution-funnel.test.ts`: unit tests including unknown vs verified zero, partial reads, impossible conversions, validation, duplicates.
- Provenance and cohort identity are inputs; no raw emails, names, phone numbers, personal identification numbers or API credentials are read/stored by this module.
- No page, API route, database migration, sender or background worker is connected. That separation is deliberate.

## Handoff contract (after SCB is ready)

SCB -> Atlas review boundary:
- Candidate: verified **legal** company ID, display name, source reference, SNI, county/city and retrieval time (the eventual minimal payload will be agreed with SCB workstream).
- Do not carry sole-trader/personnummer records, mailboxes or phone data from SCB discovery by default.
- Every record gets a review-only status. Lack of exclusion match is NOT proof of permission to contact.
- Integrate the **complete** historical pilot/outreach records including opt-outs, declines, interested businesses and pending registrations. Omnira `sales_contacts` and historical external contact lists must not be silently treated as the same complete source.
- Independently verify registered legal entity, operating status and meaningful dealer relevance.
- Before any marketing message: SCB advertisement/email/phone suppression semantics, intended communication channel, GDPR lawful basis and rights handling must be reviewed and recorded. Never assume 'B2B' overrides an individual's rights.
- Human operator must approve the recipient and actual message in Atlas Sales. No auto-send directly from SCB or these analytics.

Atlas Sales -> Handlarbörsen business outcome boundary:
- Log actual provider acceptance separately from verified delivery. SMTP accepted != delivered.
- Preserve reply state, declines and unsubscribe/objection as suppression.
- Dealer registration is not approved dealer; approved dealer is not first genuine published listing.
- Choose the same known organisation cohort and observation period for every conversion ratio; mixed months or channels must show 'unavailable', not a fake percent.

## Metric stages and interpretations

| Stage | What counts | Minimum evidence to be mapped later |
|---|---|---|
| identified | Potential registered company seen by SCB search | Source-referenced unique legal-entity ID |
| company_verified | Independently reviewed dealer/active legal company | Review and reputable source evidence |
| outreach_review_passed | Human/legal/suppression checks cleared for **draft review**, not send | Decision + exclusion history completeness |
| draft_approved | Final text approved by responsible operator | Atlas Sales immutable draft decision |
| send_accepted | Email provider/SMTP accepted the send | Provider result, never claim delivery |
| reply_received | Relevant incoming response recorded | Inbox/reply ledger |
| registered | Business has completed registration | Verified Handlarbörsen event |
| dealer_approved | Business account has been approved | Source-of-truth approval |
| first_listing_published | First valid non-test vehicle listing is published | Source-of-truth vehicle state |

These are **measurements**, not an automated linear state machine. Events such as inbound registration without outbound email exist. Cohort attribution rules must explicitly account for them; do not force a conversion on mismatched populations.

## Phase B: integration after upstream readiness

1. Review SCB V3 output and validated classification/legality; complete exclusion history and suppression checks, confirm SCB has passed its own tests and review.
2. Confirm which Atlas Sales code/version is merged, feature-gated and verified on production. Reuse its existing operator approval and reply mechanisms.
3. Confirm the actual Handlarbörsen registrations, dealer approvals and listing schema or reliable events.
4. Build owner-only, RLS-safe, read-only adapter to retrieve accurate counts; return `partial` or `unavailable` on incomplete reads. Keep one explicit `cohortId` per cohort and source evidence metadata.
5. Connect the pure `summariseDistributionCohort` helper to a UI. Show contact-to-registration, registration-to-first-listing and identified-to-first-listing only when counts are complete for the same cohort.
6. Pilot with a **manually reviewed** small regional segment. Observe authentic dealer behaviour and amend the messaging. Only later consider extra channels or automations, with separate approvals.

## Operational gates

- **Default deny outreach:** no automatic approval, no mail to leads sourced from an unverified register, no personal-contact enrichment without lawful-basis review, no cron/sending by this branch.
- **No synthetic business KPIs in live UI:** unknown source must show 'unavailable'; partial counts remain visibly partial. A confirmed zero may appear as 0 but not a conversion with zero denominator.
- **Retention and privacy:** no export of real SCB row-level data to this branch, logs or external third-party tools; preserve data-minimisation policies.
- **Safe rollout:** targeted tests + typecheck + independent diff review, then upstream merges and release verification; activation requires separate decision.
- **Budget:** first version reuses existing tools and local logic; no paid provider introduced by this foundation.

## Legal source notes — verify again before any contact

- Sweden, Marknadsföringslagen (2008:486), particularly 19–20 §§: communication to natural persons has specific prior-consent conditions, and email marketing must always provide a valid opt-out address, including messages to legal persons: https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/marknadsforingslag-2008486_sfs-2008-486/
- IMY says processing for direct marketing **may** use legitimate interest subject to balancing, but the right to object to direct marketing is absolute: https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/rattslig-grund/intresseavvagning/
- This document is a product gate/engineering checklist, not an individual legal determination.

## Merge discipline

This branch lives at `C:\Users\Andre\Projects\Omnira\.worktrees\hb-distribution-20261027` on `feat/hb-distribution-20261027`. SCB remains in `feat/hb-leadfinder-scb-20261027`. The original working tree with autonomy changes remains untouched. Do **not** merge until SCB and Atlas Sales contracts are stable and both owners have reviewed the integration.
