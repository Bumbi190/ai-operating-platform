# Handlarbörsen LinkedIn -> Omnira Calendar

Date: 2026-11-18
Branch: feat/hb-buffer-calendar-readonly-20261118
Current scope: isolated code implementation, **not production deployed**.

## Live-source architecture

The calendar reads directly from Buffer's official read API using server-side GraphQL:
`POST https://api.buffer.com`

No new database table, migration, server cron, Vercel cron, or local Codex dependency is required for calendar reading.

- Only fetches Buffer organization `6afccee04775b0917da20baf`.
- Only fetches Handlarbörsen LinkedIn company page `6afccf7eece6dfde5fff4341`.
- Only shows records to Omnira users whose authorized project scope includes Handlarbörsen project `8f673c09-1c8f-4d78-876e-4c14bf1c89b3`.
- Only reads statuses `scheduled`, `sent`, `error`.
- A post is shown as published only if Buffer returns `sent` and a valid `sentAt`.
- Provider records are strictly deduplicated by provider post ID and scoped to the expected channel.
- Historical and planned entries appear in Omnira Calendar on their actual sent or scheduled local times (Europe/Stockholm).
- Clicking an entry shows full text, last read timestamp, and a verified HTTPS external LinkedIn link if Buffer returns one.
- All Buffer entries are read-only and cannot be scheduled, edited, or republished by calendar mutations.
- Fetch requests are bounded at five pages of 100 posts with timeout and cursor validation.
- If API access fails, the rest of Omnira Calendar remains functional and the Buffer feed is marked unavailable.
- No secret is exposed to the browser. Only server-side GraphQL calls carry the key.
- Buffer API rate limits for the Free plan apply. Avoid unnecessary repeated refreshes.

## Required Vercel configuration

The deployment must have a single protected environment variable:
`BUFFER_API_KEY`

User should generate a personal API key through Buffer Settings -> API, and enter it **directly in Vercel** for the `ai-operating-platform-web` project. Never paste keys into chat, logs, public code, pull requests, or documentation. Do not decrypt other account secrets.

The key is account-wide and not individually scoped to one LinkedIn page, so the server enforces exact organization/channel/project constraints for reads. This calendar implementation never performs mutations.

## Code and tests

- apps/web/lib/calendar/source-buffer.ts (read-only GraphQL provider)
- apps/web/lib/calendar/buffer-projection.ts (sanitized pure projection)
- apps/web/lib/calendar/read.ts (calendar feed composition)
- apps/web/components/calendar/CalendarEventPanel.tsx (full text)
- apps/web/lib/calendar/progress.ts (status labels)

Tests: `buffer-projection.test.ts` and `source-buffer.test.ts`.

After aligning with current `origin/main`, 12/12 focused tests passed and full TypeScript typecheck passed. Previous full calendar suite was partially blocked by an unrelated shared stopped Docker test container. It must not be altered without project-owner coordination.

## Release gate (NO-GO until satisfied)

1. Add BUFFER_API_KEY securely to Vercel production environment.
2. Validate the Buffer GraphQL query with a real read-only request without logging the key.
3. Complete Git preflight ownership/review and CI for this isolated branch; update PR against current main as needed.
4. Preview test authenticated calendar with Handlarbörsen project, and confirm three scheduled + five sent historical posts; verify the rendering and status.
5. Deploy reviewed exact commit to Omnira production with user's approval.
6. Verify the live `/calendar` view, and confirm first post actually sent when due. Confirm next weekly content-creation automation works on its first scheduled run.

The existing Buffer -> LinkedIn scheduled posts remain unchanged. Calendar visibility is separate from publication.

## Latest known provider data

As verified by Buffer on Nov 18, about 07:01 Europe/Stockholm: three scheduled for Nov 18 14:30, Nov 19 15:30, Nov 20 15:30 and five historical sent. No provider errors reported in that read; future delivery cannot be confirmed before scheduled time.

## Source of truth

- Official docs: https://developers.buffer.com/guides/authentication.html
- Post retrieval: https://developers.buffer.com/guides/rest-migration.html
- API reference: https://developers.buffer.com/reference.html

Do not declare the Omnira calendar integration live until the production deployment and authenticated smoke check are successful.
