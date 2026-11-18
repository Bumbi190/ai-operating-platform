# Harvey / Handlarbörsen – SCB juridisk granskningsvy

Date: 2026-11-02. Continuation of existing Draft PR #386.

## Purpose

The first live SCB probe proved that workplace discovery works, but workplace names such as FOSIE or SEAT MALMÖ are branch/location names and are not safe identifiers for matching historical outreach. This follow-up enriches at most five visible Malmö workplaces with the exact legal entity before any history comparison.

## Exact SCB contract reused

The existing reviewed SCB path from the October Lead Finder work is reused:

- `GET https://apiafr.scb.se/v1/juridiskaenheter/16<10-digit organisation number>`
- API key in `X-API-Key` only.
- Redirects disabled, no-store, 15-second request timeout.
- The 12-digit PeOrgNr path was previously fixed and tested in commit `d3e480d`.
- Unsupported/person-linked identities are rejected before the legal-entity fetch.

The response is evaluated by the already-existing `scb-status-policy.ts`. That policy allowlists legal identity, SCB status, legal form and marketing-restriction signals and always returns `BLOCKED_PENDING_VERIFICATION` / `outreachReady:false`.

## Preview-only flow

The existing workplace probe remains fixed to SNI 2025 `47.811`, Malmö municipality `1280`, max two pages. From the matched workplaces, at most five are looked up as legal entities with a 400 ms gap between lookups.

The route also loads existing `sales_contacts` through the ordinary owner session, project-filtered and read-only. The Vercel flag `HB_LEADFINDER_CONTACT_READ_ENABLED=true` exists only for Preview and only this branch. History matching combines these known Omnira contacts with the existing documented partial pilot history.

No complete-history claim is made. A no-match is shown explicitly as incomplete history, never as permission or proof that the company is new.

## Browser response restrictions

The browser receives only:
- workplace name and city,
- legal company name when SCB confirms it,
- SCB status class and legal-form class,
- matched historical exclusion reasons,
- bounded non-secret warnings.

It never receives the SCB key, organisation numbers, e-mail, phone, address or raw JE payload. Nothing is persisted.

## Local verification

- Focused Lead Finder + SCB status/probe: **71/71 passed**.
- Full Lead Finder/SCB group: **144/144 across 8 files**.
- Full TypeScript: **exit 0**.
- Existing source probe remains fail-closed in production.
- Exact JE URL/header, 404 handling and personal/unsupported identity rejection have targeted tests.

## Operational boundary

This change does not enable Production, candidate persistence, import, model jobs, inbox/reply/send loops, continuous hosting or customer messages. All results remain manual-review-only.
