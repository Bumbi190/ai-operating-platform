# Familje-Stunden: temporary Supabase branch migration replay — 2026-10-29

Status: **BLOCKED before authenticated Vercel UI acceptance**. PR #581 stays Draft.
No production database writes, credentials, flags, cron, AI provider, email,
publication or PR merge occurred.

## What was actually tested

Owner approved a temporary Supabase preview branch at the quoted
**USD 0.01344 per compute hour**, plus any other metered usage. A data-less,
non-persistent branch `family-weekly-auth-e2e-20261029-temp` was created under
Omnira's existing parent project `iboepohjwrhtgshrqaol`:

- Branch ID: `c5d5d7b3-5dd1-4302-88df-7a69528ec95b`
- Ephemeral project ref: `qyhtteyycyieptjfjouy`
- Reported status: `MIGRATIONS_FAILED`; services: `ACTIVE_HEALTHY`
- Read-only verification on the **branch**: 0 public relations, 0 applied
  migrations; `public.projects` and `public.social_weekly_preparations` absent.
- Branch Postgres logs identify the first concrete replay blocker:
  `alter table public.media_scripts add column if not exists updated_at ...`
  failed because `public.media_scripts` does not exist.
- The Git repository has a `media_scripts` CREATE TABLE definition in
  `apps/web/supabase/migrations/20260520_media_tables.sql`, but it was not
  available in the branch at the time the failing statement ran. This
  suggests dependency/order or history drift; **not yet a proved full root cause**.

**Cleanup completed:** the Supabase delete API returned `success: true`.
An immediately subsequent `list_branches` no longer included this branch.
The pre-existing, unrelated `h1p5-staging` was left untouched.

Do not fabricate `media_scripts` or patch production migration history in
the family weekly feature branch. Any baseline/replay repair belongs to an
independently reviewed migration-reconciliation workstream. Do not create
another paid branch until that is resolved.

## New fail-closed branch gate

`docs/verification/fixtures/family-weekly-branch-preflight.cjs` checks only
read-only metadata snapshots; **it makes no network or write operations**.
It demands an exact non-production branch identity, correct parent, nondefault
and nonpersistent branch, `with_data=false`, completed migrations and healthy
services. It requires three canonical relations and their RLS flags:

- `public.projects`
- `public.runs`
- `public.social_weekly_preparations`

For future tests, inspect `list_branches` using the exact **parent** project
ID, and run this **read-only SQL on the new branch project ref ONLY**:

```sql
with required(rel) as (
 values ('public.projects'), ('public.runs'),
        ('public.social_weekly_preparations')
)
select
  (select count(*) from information_schema.tables
    where table_schema = 'public')::integer as public_tables,
  jsonb_object_agg(rel, to_regclass(rel) is not null) as relations,
  jsonb_object_agg(rel,
    coalesce((select c.relrowsecurity from pg_class c
      where c.oid = to_regclass(rel)), false)) as rls
from required;
```

Construct a local, non-secret JSON input with `branchId`,
`expectedBranchRef`, `parentProjectRef`, `branches` (the `branches`
array returned by `list_branches`), and `schema` (the SQL result object).
Only continue if the guard exits 0:

```powershell
node docs/verification/fixtures/family-weekly-branch-preflight.cjs ./temp-branch-snapshot.json
node --test docs/verification/fixtures/family-weekly-branch-preflight.test.cjs
```

Do not commit the temporary snapshot. If the gate rejects, **stop**:
do not install the four proposals, issue auth sessions, connect Vercel Preview
or create workers. Delete the temporary branch, then verify it is absent
from a new parent `list_branches` read. This cleanup is mandatory for
both test success and failure.

## What still blocks genuine browser acceptance

Only after branch migrations and this gate pass: apply four unchanged proposed
SQL files **solely to the branch**, using the established native RLS contracts;
seed synthetic owners/projects with branch-only credentials; check the exact
branch-scoped Vercel Preview env variables cannot change any production
environment or other previews. Exercise read/enable/revoke, foreign-user
denial, unknown status and disabled-flag behavior. Test four review-only
drafts without paid AI calls or social publication. Revoke and delete the
test environment at completion and verify deletion.

Existing local GoTrue / signed JWT / PostgreSQL CI success is valid backend
evidence but **not** a substitute for an authenticated Vercel browser test.
