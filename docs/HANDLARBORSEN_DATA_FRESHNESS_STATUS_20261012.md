# Handlarbörsen data freshness status — 2026-10-12

**CODE-ONLY findings**, based on PR321 head `9383827792ce28eece9ede8603798c32efac07e8`. No live calls, database checks, secrets access or activation.

The marketplace panel reads stored snapshots, not real-time marketplace data. The scoped reader loads up to 30 rows from `handlarborsen_marketplace_snapshots` and up to 30 audit rows from `collector_runs`; P0 derives analysis from that report. The guarded store can refresh or improve today's row, so a snapshot date/UUID is not an immutable evidence version.

| Concept | What the code establishes |
|---|---|
| Snapshot freshness | The report/insights use a **≤26 h** freshness threshold. "Aktuell" means within that daily-data tolerance, not real-time. Null remains unknown, and failed/unknown collection audit remains a separate quality concern. |
| UI refresh | The project page resolves the owner project through RLS and reloads the scoped stored report. Admin Supabase fetches force `cache: 'no-store'`; refreshing the page reads stored data again. It does not invoke collection or fetch current Handlarbörsen counts. |
| Collector frequency | The prepared pg_cron job `omnira_handlarborsen_marketplace` uses `55 6 * * *`: **06:55 UTC daily**, **08:55 in Sweden on October 12**, **07:55 in winter**. A prepared SQL schedule is not proof that production runs it. |

The configured marketplace route is `GET /api/collectors/handlarborsen/marketplace`, protected by the existing CRON_SECRET and fixed Handlarbörsen ID+slug/observer-or-active checks. It fetches the marketplace aggregate endpoint and uses the guarded store; normal calls write collection audit and may emit a stored-data signal. Its `dry_run=1` still fetches external data, so it was not called here. The route itself schedules nothing. The prepared cron calls it through `omnira_cron.call_vercel`; there is no marketplace Vercel cron registration in this design. Separate Stripe/social collector routes do not establish marketplace frequency.

PostHog traffic is independent of these marketplace snapshots. The traffic reader returns `not_connected` when its configuration is absent/invalid. A disconnected PostHog widget neither stops marketplace collection nor explains snapshot age; no production configuration was inspected.

The user's reported screenshots show latest October 12 at 08:55, approximately 11 hours old, and saved dates October 10/12 only. That is compatible with the daily schedule and freshness label. Matching the scheduled time cannot prove automation is active: manual collection can produce the same time, and those two dates do not establish daily continuity. These are user-reported screenshot observations, not additional code or live verification.

`docs/handlarborsen-p1e/README.md` says "prepared, not activated" and separates migration, deployment, manual run and cron activation. `activate-cron.sql` defines operator-only prerequisite checks and idempotent registration. Neither document proves today's production cron/job state, actual migration/grants, successful next-day runs or deployed collector version. Activation evidence would require a separately authorized operational check; none was attempted.

A future refresh-on-demand or 5–15 minute collector requires a separate bounded change and an operational quota/cost decision (source limits, overlapping runs, audit volume and failure handling). Page reload alone cannot supply fresher source observations. These options are outside Atlas Analytics P1.

Code references: `apps/web/app/(platform)/projects/[slug]/page.tsx`, `apps/web/lib/project/get-project.ts`,
`apps/web/lib/supabase/admin.ts`, `apps/web/lib/atlas/project-analytics/handlarborsen-marketplace-read.ts`,
`handlarborsen-marketplace-report.ts`, `handlarborsen-insights.ts`, `handlarborsen-posthog-traffic.ts` in the same analytics directory,
`apps/web/app/api/collectors/handlarborsen/marketplace/route.ts`,
`apps/web/lib/atlas/collectors/handlarborsen-marketplace.ts`,
`docs/handlarborsen-p1e/README.md`, `docs/handlarborsen-p1e/activate-cron.sql`.
