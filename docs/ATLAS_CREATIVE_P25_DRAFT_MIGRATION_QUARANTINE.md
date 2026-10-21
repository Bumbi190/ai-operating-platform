# Atlas Creative P25 — quarantine unapplied SQL away from production migration corpus

Date: 2026-10-21
Branch: `feat/atlas-creative-p25-migration-quarantine`
Base: P24 integration Draft PR #494, commit `26dbdf1`

## Verified CI failure affecting P24

P24 was **mergeable on GitHub but not CI-clean**:

- `Migration Guard Integrity` failed: the canonical
  `apps/web/supabase/migrations` directory contained 106 SQL files,
  while the independently pinned Guard v2 policy expects exactly 101.
- `Atlas Project Isolation` failed: five creative-only, **unapplied**
  migration candidates CREATE public tables absent from the live
  schema-security classification registry.
- Vercel preview deployment `dpl_8kV6YKZWRJpHi5t2Qabcb9BrH1hj`
  failed at `check-migrations.mjs`: 106 versus 101. No app code was
  compiled; it did not reach `next build`.

These three findings have the same root cause: unreviewed creative SQL
prototypes were written into the **production migration directory**.
Neither increasing the expected enforced count to 92 nor marking the
prototype tables as live would be a truthful correction. That would
make production-ledger checks demand migrations that have not been
reviewed or applied, or make draft tables appear deployed in a live
schema-security registry.

## Safe change

Move these five files, without altering their SQL bytes:

```text
apps/web/supabase/creative-drafts/
  20261020230500_atlas_creative_queue_staging_p7.sql
  20261020235500_atlas_creative_worker_identity_p10.sql
  20261021080000_atlas_creative_worker_enrollment_staging_p13.sql
  20261021100000_atlas_creative_enrollment_review_p15.sql
  20261021120000_atlas_creative_review_owner_guard_p18.sql
```

Supabase's migration runner does **not** scan this sibling directory
as `supabase/migrations`. These are creative SQL designs for isolated
fixtures, not deployment instructions.

All P7–P18 PGlite, Docker PG17 and static SQL guard fixtures have been
redirected to read from `creative-drafts` by pathname. The files' SHA-256
hashes are pinned in `draft-migration-isolation.test.mjs`, as a regression
check against silent SQL modifications during relocation.

The canonical production SQL corpus now has **101/101** expected files,
including **87** guarded/enforced migrations under the existing frozen
policy. No Guard v2 threshold, grandfathered list, live schema
classification, production ledger, privileged SQL grants or current
application routes were changed.

## Validation

- 3/3 new P25 guard tests passed:
  - canonical Guard v2 integrity is satisfied at unchanged 101/87;
  - exactly five SQL draft files exist and all have original SHA-256;
  - creative fixture code no longer resolves its SQL from canonical root.
- 288/288 full serial creative Node regression tests passed in the
  P25 integration branch.
- **PGlite and full Next.js build were NOT run locally in P25** because
  Hultgren had less than ~500 MB free physical RAM. The SQL bytes are
  unchanged but fixture path relocation still needs CI/isolated runtime
  verification; prior tests must not be called P25 merge evidence.
- No PostgreSQL 17 Docker fixture was started in this task.
- At the time of writing, the fix is not proof of CI success until the
  new P25 PR actually runs checks. Previous P24 checks were red.

## Next production-readiness decision

Do NOT merge P25 or the earlier creative PRs to main or promote these
migrations automatically. A future reviewed migration promotion needs:

1. Independently reviewed SQL, all required RLS/service_role and
   operator/project permission constraints and tests on a production-like
   disposable Supabase PostgreSQL 17 schema.
2. A coordinated intentional move to the canonical migration directory,
   one schema table classification for each new table, and a reviewed
   Migration Guard v2 ledger/change plan. The guard must fail while
   unapplied, as designed.
3. Safeguarded human approval, signed key enrollment and revocation,
   verified worker OS/network isolation and actual editor output QC.
4. Explicit separate authorization before production deployment, media
   execution or publishing.

No production writes, media processing, account enablement or paid
service creation occurred in P25.
