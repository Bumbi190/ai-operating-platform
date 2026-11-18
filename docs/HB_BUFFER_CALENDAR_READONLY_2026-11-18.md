# Handlarbörsen -> Omnira Calendar: Buffer read-only integration

Date: 2026-11-18. Scope: local isolated design/prototype; **not deployed**.

## Verified starting point

- Buffer workspace: My organization; channel: Handlarbörsen LinkedIn company page.
- 3 scheduled items: 2026-11-18 14:30, 2026-11-19 15:30, 2026-11-20 15:30 (Europe/Stockholm).
- 5 historical sent items (from October-November 2026). No Buffer errors in last read-only check.
- Buffer MCP OAuth is present on Hultgren for Codex, **not** automatically available to the Omnira backend.
- Calendar code exists on integration branch integrate/calendar-week-readonly-20261106, not on the active Omnira base working branch.
- This branch provides a pure Buffer projection with no network requests and no write capabilities.

## Required architecture for a live calendar

1. **Credential boundary**: use scoped server-side OAuth for Buffer, or a trusted scheduled sync using the existing authorized Codex MCP client. Never copy Codex OAuth tokens into Next.js client components or a repository.
2. **Sync and persistence**: fetch only the verified Handlarbörsen Buffer channel. Persist idempotently by (provider='buffer', channel_id, provider_post_id). Retain original provider timestamp and last successful refresh. Upsert status transitions, keep historical sent records; do not remove previous posts just because provider pagination changes.
3. **Authorisation**: resolve current Omnira user and allowed Handlarbörsen project ID before reading. Backend must enforce owner/organisation scope. Never expose Buffer records to unrelated projects.
4. **Calendar read**: add a bounded read-only source to readCalendarWeek, respecting Europe/Stockholm range and DST; expose status, full text, provider ID and link. Entries must not be editable by the current calendar mutation API.
5. **Status semantics**: scheduled means provider queued; published requires Buffer sentAt and provider sent status; failed requires an actual failure; unknown/stale must remain unknown, not shown as published. Display sync freshness.
6. **UI**: show content title, full text in detail panel, platform icon, local scheduled/sent time, direct post link only when verified. Include filter for LinkedIn, scheduled, published and errors.
7. **Safety**: read-only sync is not a publishing agent. No post creation, no duplicated publishing, no secret logging. A later publishing workflow must separately verify Buffer queue and use existing automation.
8. **Acceptance**: tests for mixed historical+future records, duplicate provider IDs, unrelated channel exclusion, empty/failed provider response, timezone, DST, pagination, no credentials client-side, and no Calendar mutation capability.

## Validation and remaining blocker

- Projection implementation: apps/web/lib/calendar/buffer-projection.ts
- Vitest test cases: apps/web/lib/calendar/buffer-projection.test.ts
- Local Node 22 smoke check passed: scheduled->sent deduplication, channel isolation, unscheduled draft exclusion.
- Full Vitest/TypeScript not run: dependencies are not installed in this isolated worktree.
- **Not completed**: authenticated live ingestion, DB migration, UI wiring, deployment, end-to-end calendar verification.
- Do not merge/deploy until handoff/source ownership, permissions and production credential strategy are approved and validated.

No commits, pushes, merges, deploys or changes to Buffer posting queue were made by this prototype.

## Work performed in the isolated branch (2026-11-18)

- Added calendar data-source read, project/owner-scoped status mirror, UI text preview, status labels and an additive SQL migration proposal.
- LinkedIn Buffer entries display planned and observed sent time in Europe/Stockholm. Sent is derived only from provider status `sent` with `sentAt`; no inference from elapsed schedule.
- Applied no SQL migrations, no Buffer write operations, no production code changes, no commit, no push, no deployment.
- Project mapping verified by read-only SQL: Omnira Handlarbörsen project slug `handlarborsen`, ID `8f673c09-1c8f-4d78-876e-4c14bf1c89b3` (do not confuse with Handlarbörsen Demo Motors).
- Automated Buffer release check scheduled for Nov 18, 2026 at 17:00 Europe/Stockholm. A first delivery cannot be proven before scheduled time.
- Local projection and source reader tests: 11/11 passed (includes media queue regression).
- Full calendar suite: 192 tests passed, 39 skipped, 1 unrelated fixture failure subsequently fixed and focused regression passed. Nine DB-backed test suites could not start because protected Docker test container was not running. Do not start/alter protected Docker setup without separate approval.
- Full TypeScript check passed once before final changes; final rerun is pending at time of writing.
- Git preflight receipt: `D:/Projekt/Omnira/Verifiering/hb-buffer-calendar-readonly-preflight-20261118.json`. Decision `review_required`: release cannot be marked GO; matching open PR metadata require manual scope/ownership review.
- No live Buffer OAuth token exists in Omnira server runtime. Secure future source of sync must be approved and built. Don't copy local Codex OAuth secrets.
- Release remains NO-GO until: confirm owning base branch/PR; verify migration/test environment; implement authenticated sync worker and actual data persistence; verify client calendar against real Buffer statuses; passing CI+preview+owner release approval; deploy; verify first provider receipt and next weekly automation.

## Production state

**Local implementation only.** Buffer remains the sole live LinkedIn scheduling service; Omnira production calendar is not yet receiving Buffer data. Never tell user the in-Omnira calendar is live until server sync + release verification.
