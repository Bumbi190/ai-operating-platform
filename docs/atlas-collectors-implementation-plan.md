# Atlas Collectors v1 — Implementation Plan

**Date:** 2026-06-23  
**Branch:** `feat/atlas-collectors-v1`  
**Scope:** Phase 1 + Phase 2 (Phase 3 follows separately)

---

## Design Decisions

### `atlas_mode`: Include "archived"?

**Yes.** The complete lifecycle is:

| Mode | Meaning | Projects today |
|---|---|---|
| `active` | Full Atlas pipeline — signals, analysis, opportunities, execution | The Prompt |
| `observer` | Collect + analyse only. No execution surface | Familje-Stunden |
| `hibernate` | No collection. Architecture-ready only | GainPilot |
| `archived` | Permanently retired. Data preserved, no new collection | — |

`archived` is distinct from `hibernate`. Hibernate = paused, will return. Archived = permanently done. It prevents accidental reactivation, enables clean filtering ("non-archived projects"), and completes the lifecycle for future external tenants.

State machine: any state → archived. No transitions out of archived without explicit admin SQL.

### Implementation: `text` field with `CHECK` constraint

**Chosen over enum and lookup table.**

- **Enum** (`CREATE TYPE atlas_mode AS ENUM`): adding a value requires `ALTER TYPE ADD VALUE` — a DDL operation that can't be done inside a transaction in older Postgres versions and generates noise in Supabase migrations. Renaming or removing states requires type recreation.
- **Lookup table**: over-engineered for 4–6 fixed states. Requires a FK join on every projects read. INSERT to add a state works, but the FK check means the TypeScript enum and DB must stay in sync manually anyway.
- **Text + CHECK**: matches the existing project convention (`check (status in ('open','dismissed','actioned'))`, etc.). Adding a state = one `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT`, always transactional. TypeScript union type is defined manually regardless — Supabase doesn't auto-generate unions from either approach.

---

## Migration Sequence

Run in order. All migrations are in `apps/web/supabase/migrations/`.

| Order | File | What it does |
|---|---|---|
| 1 | `20260623_150000_atlas_project_lifecycle.sql` | Add `atlas_mode text CHECK(...)` to `projects`; seed known projects |
| 2 | `20260623_150100_atlas_signals_evolution.sql` | Add `project_id` + `source` columns to `atlas_signals`; add 2 indexes |
| 3 | `20260623_150200_collector_runs.sql` | Create `collector_runs` audit table with RLS |
| 4 | `20260623_150300_atlas_collector_cron.sql` | Register pg_cron jobs; update guardian; seed `cron_heartbeat` |

Migration 4 depends on the Vercel routes from Phase 2 being deployed first (cron calls `/api/collectors/...`). Apply migrations 1–3 before deploying; apply 4 after deploy.

---

## Affected Files

### Create

| File | Purpose |
|---|---|
| `apps/web/supabase/migrations/20260623_150000_atlas_project_lifecycle.sql` | DB: atlas_mode column |
| `apps/web/supabase/migrations/20260623_150100_atlas_signals_evolution.sql` | DB: signals evolution |
| `apps/web/supabase/migrations/20260623_150200_collector_runs.sql` | DB: collector_runs table |
| `apps/web/supabase/migrations/20260623_150300_atlas_collector_cron.sql` | DB: cron + guardian |
| `apps/web/lib/atlas/lifecycle.ts` | AtlasMode type + helpers (isActive, isObserver, isCollectable, isExecutable) |
| `apps/web/lib/atlas/collectors/types.ts` | CollectorContext, CollectorResult, BaseCollector abstract class, writeCollectorRun |
| `apps/web/lib/atlas/collectors/registry.ts` | COLLECTOR_REGISTRY map |
| `apps/web/lib/atlas/collectors/stripe-revenue.ts` | StripeRevenueCollector |
| `apps/web/lib/atlas/collectors/social-account.ts` | SocialAccountCollector |
| `apps/web/app/api/collectors/stripe/revenue/route.ts` | GET endpoint for Stripe collector cron |
| `apps/web/app/api/collectors/social/account/route.ts` | GET endpoint for social account cron |

### Modify

| File | Change |
|---|---|
| `apps/web/lib/atlas/signals.ts` | Add `projectId?`, `source?` to `RecordSignalArgs` + `SignalRecord`; add `querySignals`, `getLatestProjectSignals`, `getSignalTimeSeries` |
| `apps/web/app/api/media/cron/heartbeat/route.ts` | Add `stripe_revenue` + `social_account` entries to `CHECKS` array |

### No change needed

- `apps/web/app/api/business/cron/stripe-snapshot/route.ts` — superseded by new collector route; left alive as dead code, will be removed in cleanup sprint
- `apps/web/app/api/media/cron/account-snapshot/route.ts` — same

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `atlas_mode DEFAULT 'observer'` applied to unexpected projects | Low | Low | Migration explicitly sets all 3 known projects; others get observer (safe — collects but no execution) |
| `project_id` FK on `atlas_signals` rejects existing rows | None | — | Existing rows have no project_id (NULL); FK allows NULL; additive column only |
| Stripe collector fires before `STRIPE_RESTRICTED_KEY` is set | Possible | None | Collector returns `skipped` via `stripeConfigured()` guard; no error, no signal, run logged |
| Social collector fires with no tokens | Expected for new projects | None | `validate()` returns null → status `skipped`; no signal emitted; run logged |
| pg_cron migration 4 runs before routes are deployed | Possible if applied out of order | Cron fires 404 | Apply migrations 1–3 before deploy; apply migration 4 after deploy and verify routes return 200 |
| `collector_runs` grows unboundedly | Long-term | Storage | Add retention policy (90-day purge) in Phase 3 |
| `ensure_core_schedules()` CR/OR replaces existing guardian | None | — | New version is a strict superset of the original — adds 2 new `IF NOT EXISTS` blocks, changes nothing else |

---

## Git Workflow

```bash
# Branch
git checkout main && git pull
git checkout -b feat/atlas-collectors-v1

# Phase 1 commit — schema + framework (migrations 1-3 + TS files)
git add \
  apps/web/supabase/migrations/20260623_150000_atlas_project_lifecycle.sql \
  apps/web/supabase/migrations/20260623_150100_atlas_signals_evolution.sql \
  apps/web/supabase/migrations/20260623_150200_collector_runs.sql \
  apps/web/lib/atlas/lifecycle.ts \
  apps/web/lib/atlas/collectors/types.ts \
  apps/web/lib/atlas/collectors/registry.ts \
  apps/web/lib/atlas/signals.ts
git commit -m "feat(atlas): Phase 1 — atlas_mode, signals evolution, collector_runs, BaseCollector framework"

# Phase 2 commit — collectors + routes
git add \
  apps/web/lib/atlas/collectors/stripe-revenue.ts \
  apps/web/lib/atlas/collectors/social-account.ts \
  apps/web/app/api/collectors/stripe/revenue/route.ts \
  apps/web/app/api/collectors/social/account/route.ts \
  apps/web/app/api/media/cron/heartbeat/route.ts
git commit -m "feat(atlas): Phase 2 — StripeRevenueCollector, SocialAccountCollector, collector API routes, heartbeat integration"

# Phase 2 cron commit — apply AFTER deploy
git add apps/web/supabase/migrations/20260623_150300_atlas_collector_cron.sql
git commit -m "feat(atlas): Phase 2 — register collector pg_cron jobs + guardian update"

# Push + open PR
git push -u origin feat/atlas-collectors-v1
# → Trigger Codex review before merge
```

---

## Testing Checklist

### Phase 1 — Schema

- [ ] Migration 1: `SELECT atlas_mode FROM projects` — all 3 projects have correct mode
- [ ] Migration 1: `INSERT INTO projects (..., atlas_mode) VALUES (..., 'invalid')` → rejects with CHECK violation
- [ ] Migration 2: `SELECT project_id, source FROM atlas_signals LIMIT 1` — columns exist, existing rows have NULL values
- [ ] Migration 2: `EXPLAIN SELECT * FROM atlas_signals WHERE project_id = '...' AND kind = 'stripe.mrr_snapshot' ORDER BY produced_at DESC` — uses `atlas_signals_project_kind_idx`
- [ ] Migration 3: `SELECT * FROM collector_runs` — table exists, empty
- [ ] Migration 3: authenticated client INSERT into collector_runs → blocked by RLS
- [ ] Migration 3: service-role client INSERT into collector_runs → succeeds

### Phase 1 — TypeScript

- [ ] `isCollectable('active')` → true; `isCollectable('hibernate')` → false
- [ ] `isExecutable('observer')` → false; `isExecutable('active')` → true
- [ ] `recordSignal({ contentId: null, kind: 'test', payload: {}, version: 'v1' })` — backward compat (no projectId/source required)
- [ ] `recordSignal({ contentId: null, projectId: 'uuid', source: 'stripe', kind: 'stripe.mrr_snapshot', payload: {}, version: 'v1' })` — new fields persisted
- [ ] `getLatestProjectSignals({ projectId: 'uuid', kinds: ['stripe.mrr_snapshot'] })` — returns latest per kind

### Phase 2 — Collectors (dry-run)

- [ ] `GET /api/collectors/stripe/revenue?dry_run=1` — returns `{ ok: true, runs: [{ status: 'skipped', ... }] }` when Stripe not configured
- [ ] `GET /api/collectors/social/account?dry_run=1` — returns `{ ok: true, runs: [...] }` for each collectable project
- [ ] After live run: `SELECT * FROM collector_runs ORDER BY ran_at DESC LIMIT 5` — rows present
- [ ] After live Stripe run: `SELECT * FROM atlas_signals WHERE kind = 'stripe.mrr_snapshot' ORDER BY produced_at DESC LIMIT 1` — signal present with project_id + source
- [ ] After live social run: `SELECT * FROM atlas_signals WHERE kind = 'social.account_snapshot' ORDER BY produced_at DESC LIMIT 5` — one signal per collectable project

### Phase 2 — Cron + Heartbeat

- [ ] Migration 4: `SELECT jobname FROM cron.job WHERE jobname IN ('omnira_stripe_revenue', 'omnira_social_account')` — both rows present
- [ ] Migration 4: `SELECT * FROM cron_heartbeat WHERE jobname IN ('stripe_revenue', 'social_account')` — rows present with `pending_first_run`
- [ ] After first cron fire: heartbeat route updates status to `ok`
- [ ] Kill a cron job manually: `SELECT cron.unschedule('omnira_stripe_revenue')` → guardian restores it within 5 minutes

---

## Rollback Plan

### Migrations 1–3 (additive only — zero destructive risk)

```sql
-- Rollback migration 3
DROP TABLE IF EXISTS public.collector_runs;

-- Rollback migration 2
ALTER TABLE public.atlas_signals
  DROP COLUMN IF EXISTS project_id,
  DROP COLUMN IF EXISTS source;
DROP INDEX IF EXISTS atlas_signals_project_kind_idx;
DROP INDEX IF EXISTS atlas_signals_source_kind_idx;

-- Rollback migration 1
ALTER TABLE public.projects
  DROP COLUMN IF EXISTS atlas_mode;
```

### Migration 4 (cron jobs)

```sql
SELECT cron.unschedule('omnira_stripe_revenue');
SELECT cron.unschedule('omnira_social_account');
DELETE FROM public.cron_heartbeat WHERE jobname IN ('stripe_revenue', 'social_account');
-- Restore original ensure_core_schedules (2-job version) from 20260614_cron_guardian.sql
```

### TypeScript (feature-flag rollback)

The old routes (`/api/business/cron/stripe-snapshot`, `/api/media/cron/account-snapshot`) are untouched. If the new collector routes fail, disable the pg_cron jobs and route traffic back to the originals by scheduling them manually.

### Git

```bash
git revert feat/atlas-collectors-v1  # or revert individual commits
git push origin main
```

---

## Codex Review Trigger

After `git push -u origin feat/atlas-collectors-v1`, open a PR and request Codex review. Key areas to flag:

1. RLS policy on `collector_runs` — confirm service-role bypass is intentional
2. `BaseCollector.run()` error handling — confirm all throw paths result in an `error` run log entry
3. `recordSignal` backward compat — confirm existing callers (backfill script) are unaffected
4. Guardian `CREATE OR REPLACE` — confirm it is a strict superset of the original function
