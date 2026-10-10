# Handlarbörsen P1E — daily statistics collection

Status of this change: **prepared, not activated.** Nothing here schedules anything or touches
production by itself. The migration and the cron activation each need their own approval.

## What changed

| Part | Where | Effect |
|---|---|---|
| Guarded snapshot store | `apps/web/supabase/migrations/20261010130000_handlarborsen_guarded_snapshot_store.sql` | One `SECURITY DEFINER` function is the only write path to `handlarborsen_marketplace_snapshots`. `service_role` loses `INSERT`/`UPDATE` on the table. |
| Collector | `lib/atlas/collectors/handlarborsen-marketplace.ts` | `store()` calls the function. A declined snapshot makes the run `skipped` (reason + decision in `collector_runs.metadata`), emits **no** signal. Version 1.1.0. |
| Framework hook | `lib/atlas/collectors/types.ts` | Additive: `store()` may return `StoreDeclined`. Collectors that return nothing behave exactly as before. |
| Monitoring | report model / reader / overview / report page | Last successful collection, today's outcome, failed latest attempt, stale (> 26 h) report, saved-day history list. All from `collector_runs` and the stored snapshots; nothing invented, no chart. |
| Heartbeat | `app/api/media/cron/heartbeat/route.ts` | New daily check `handlarborsen_marketplace` for job `omnira_handlarborsen_marketplace` (06:55). Dormant until the job exists (`pending_first_run`, no alarm). |
| Cron | `activate-cron.sql`, `rollback-cron.sql` (this folder) | **Not migrations.** Applied by an operator only. |

## The storage rule (per `snapshot_date`; quality = number of available metrics, 11 = complete)

| Situation | Outcome | Written? | Signal? |
|---|---|---|---|
| no row yet | `inserted` | yes | yes |
| more available metrics than stored (even if the observation is older) | `upgraded` | yes | yes |
| equal quality, strictly newer observation | `refreshed` | yes | yes |
| equal quality, same `observed_at` | `unchanged` | no | no |
| fewer available metrics than stored | `rejected` / `lower_quality` | no | no |
| equal quality, older observation | `rejected` / `older_observation` | no | no |

A complete report can therefore only be replaced by a newer complete one. Only **today (UTC)**
can be written; earlier days are immutable. Completeness is derived by the database from the
metrics; `null` is stored as `NULL`, never `0`. Concurrent runs serialize on the row lock
(`INSERT … ON CONFLICT DO NOTHING`, then `SELECT … FOR UPDATE`, then decide).

## Schedule

`omnira_handlarborsen_marketplace`, `55 6 * * *` (06:55 UTC; pg_cron is GMT), command
`select omnira_cron.call_vercel('/api/collectors/handlarborsen/marketplace')`.

Why 06:55: it is free (06:45 stripe, 06:50 social, 07:00 intelligence brief + account snapshot),
it runs after the other collectors, and it lands **before** the 07:00 Executive Brief so the
brief can use the day's statistics. It is 5 minutes after the social collector, so no
cold-start pile-up. `call_vercel` targets the production URL stored in `omnira_cron.config` and
sends the existing `CRON_SECRET`; there is no Vercel cron entry, so previews never run it.

`ensure_core_schedules()` is **deliberately not changed.** In production it guards only the three
core jobs (drain, reaper, workflow tick); the stripe/social/atlas jobs are not in it either (the
`20260623_150300` version of the function is superseded by `20260829`). Re-declaring a shared
function inside this change would risk undoing that. If the guardian should also heal the
collector jobs, that is a separate change for all collectors.

## Verification performed (throwaway local Postgres, never production)

* `verify-guarded-store.sh` — 46 checks incl. 12 parallel sessions and a 20× complete-vs-partial race.
* `verify-cron-sql.sh` — activation, idempotency, rollback, every refusal path.

## Production sequence (each step needs its own go)

0. Review and approve the draft PR. The Vercel **build is RED on the PR until step 2**: the migration
   guard requires every enforced migration to be in the production ledger (same contract as P1B).
1. Pre-flight (read-only): `cron.job` has no job matching `%/api/collectors/handlarborsen/%`;
   `select count(*) from public.handlarborsen_marketplace_snapshots` and note the 2026-10-10 row.
2. **Apply the migration** (committed bytes via `git show <sha>:<path>`, sha256 proven first, outside the
   06:00–09:10Z and 17:10–18:10Z windows). Effect: the old P1B code can no longer write (direct upsert is
   denied) — which is why step 3 follows immediately. No cron is active, so nothing runs in between.
3. **Merge the PR** → Vercel deploys; the guard is now green.
4. Verify the deployment: route returns 401 without the secret; a `?dry_run=1` call (operator, with the
   secret) returns the 11 metrics and writes nothing.
5. *(Optional, separately approved)* one manual live run: the 2026-10-10 row is not touched (a different
   date); today's run creates today's row. Check the audit row and signal.
6. **Activate the cron**: run `activate-cron.sql` once. Expected `cron.job` count +1.
7. Next day after 06:55 UTC: `collector_runs` has an `ok`/`inserted` row for the new date, the snapshot
   table has two dates, `cron_heartbeat` row `handlarborsen_marketplace` is `ok`, the project page shows
   "Rapport sparad".

## Rollback

* Cron: `rollback-cron.sql` (unschedules only that job; data stays; heartbeat returns to `pending_first_run`).
* Guarded store: the commented rollback block at the top of the migration (restores `INSERT, UPDATE` grants —
  only needed if the P1B collector code were deployed again).
* Code: revert the PR. Reverting code while the migration stays applied is the unsafe direction (old code
  cannot write); revert the migration first, or both together.
