# Omnira calendar — external schedule writer consistency gate

**Scope:** architectural audit only, NO migration, enabled endpoint, or production change.

## Verified writers and current read paths

- Calendar's social source reader `lib/calendar/source-social.ts` invokes `readSchedules` and `readSocialContent` separately for each allowed project using `Promise.all`, across projects. These calls are not a shared database transaction.
- `lib/social-launch/scheduling/store.ts` exposes separate RPCs: `social_schedule_propose`, `social_schedule_approve`, `social_schedule_revoke`, `social_schedule_monthly_rule_save`, and others. These are independent of calendar_event_apply's proposed owner advisory lock.
- Workflow scheduling in `lib/workflows/store.ts` writes through `workflow_schedule_wake` and `workflow_clear_wake` RPCs, among other lifecycle writers. The calendar reads workflow wake_at via `readCalendarWorkflows` / `listInstancesForProjects`; it is not a locked transaction snapshot with social data.
- The preview snapshot checksum (#435/#436) detects observed differences across reads, but does not prevent a source mutation after the last read and before the batch commit.

## Required interoperability before batch booking

1. Enumerate every RPC or direct DB path capable of changing a calendar-visible social time, approval, revision, monthly schedule, or workflow wake_at, including background workers and cron jobs. An incomplete writer inventory is a hard release blocker.
2. Define a durable per-project/per-owner calendar-source revision guard in Postgres. Each relevant writer must increment it **in the same transaction as its change**, and the batch commit must lock and compare revisions in one transaction. A read-only hash taken before commit is not enough.
3. Establish unambiguous lock ordering across owners and projects to avoid deadlocks and ensure cross-project reads are consistently scoped to the authenticated owner.
4. Until all writers participate, batch approval MUST reject plans whose conflict evaluation depends on those sources. Do not pretend a best-effort reread provides atomicity.
5. Test a social schedule approval racing a batch write, workflow wake rearm racing batch, disabled/unavailable source, unobserved new job, changed revision with unchanged time, and source truncation. For every case prove fail-closed, exactly-once receipt, and no partial calendar writes.
6. Separate this source-consistency boundary from the owner's explicit approval identity and normal event writer interval checks.

## No deployment yet

The observed RPC names and non-atomic read pattern support the *need* for a guard; they do not prove all writer paths have been enumerated. This document is a release blocker checklist, not a claim that the guarantee exists.
