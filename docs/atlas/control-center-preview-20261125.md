# Atlas Control Center – read-only preview (25 Nov 2026)

This feature lives on a separate draft pull request, never on production until reviewed.

## Design intent
An authenticated owner can open `/atlas/control-center`, see real per-project AI cost events, running workflow counts, failed runs and pending approvals, and focus on one authorized project. Supports 7-day and 30-day periods.

## Data integrity
- The new route uses the existing `loadOverviewModel` server-side reader and its scoped owner/project allowlist.
- If an upstream query returns unavailable or partial data, the UI shows an unavailable state; it never replaces missing readings with zero.
- Cost events in Omnira are **not** equivalent to invoiced AWS/Vercel costs. No model registry or automatic billing connector is claimed.
- No new cron, model calls, Lambda deployment, writable APIs, public endpoints or database migrations are introduced.

## Acceptance checks
- [ ] Build and TypeScript pass in a preview environment.
- [ ] Unauthenticated visitors are sent to login.
- [ ] Owner can view only authorized project summaries.
- [ ] Desktop and narrow mobile screens are usable.
- [ ] Period switch changes 7/30 days as requested.
- [ ] Project focus updates details and project link.
- [ ] Unavailable and partial data are clearly labeled.
- [ ] Confirm no automatic publication, spending, or approval controls were activated.

## Release boundary
Keep this PR as a draft until the owner approves the visual and access checks.
