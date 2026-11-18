# Harvey / Handlarbörsen – SCB Preview-probe

Date: 2026-11-02. Existing Draft PR #386, branch `codex/atlas-harvey-sales-20261017`.

## Decision and scope

SCB:s allmänna företagsregister is now the primary Swedish company-discovery source for Handlarbörsen testing. The API is free and the existing SCB integration already enforces server-only `X-API-Key`, bounded pagination, retries and strict contract parsing.

This change adds only an **owner-controlled Preview probe**:

- Preview/development only; `VERCEL_ENV=production` is hard-denied.
- Exact Handlarbörsen project owner required.
- Same-origin JSON POST and exact confirmation phrase required.
- Fixed source: `arbetsstallen`.
- Fixed SNI 2025: `47.811` (retail sale of passenger cars and light motor vehicles).
- Fixed Malmö municipality code `1280`.
- At most two SCB pages, 5,000 rows/page, max 10,000 scanned rows.
- At most five sample workplace names are rendered.
- No organization numbers, API keys or contact data are returned.
- No database writes, lead promotion, outreach, inbox work or sending.
- Every returned result remains `BLOCKED_PENDING_VERIFICATION` and `outreachReady:false`.

The general SCB live-search constant remains off. A separate branch-only flag `HB_LEADFINDER_SCB_PREVIEW_ENABLED=true` is required, and the SCB API key exists only as a Sensitive Preview variable for this branch. Production has neither the flag nor the key.

## UI

Lead Finder shows when the SCB Preview probe is ready and exposes a **Testa SCB-källa** button. The result reports aggregate counts and up to five sanitized Malmö workplace names. Nothing is persisted.

## Local verification on Hultgren

- Focused SCB + Lead Finder tests: **40/40 passed**.
- Full Lead Finder group: **113/113 passed across 7 files**.
- Full TypeScript: **exit 0**.
- `git diff --check`: passed; only ordinary Windows LF/CRLF warnings.

The initial focused run had one intentionally useful failure: the approval test tried a synthetic non-SCB base URL. The application correctly rejected it. The test was corrected to use exactly `https://apiafr.scb.se`; no application security check was weakened.

## Operational boundary

This does not enable production, import, persistence, customer contact, mailbox actions, background hosting or any paid provider. overpass.ch remains a free technical fallback only; no paid plan is approved.
