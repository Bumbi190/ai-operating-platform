# Omnira – reconciliation of applied SCB candidate migration (2026-10-28)

## Why this change is necessary
Omnira production already has one applied migration named
`handlarborsen_scb_review_only_candidates` (version `20261028072659`).
The canonical `main` repository lacks the matching SQL file and tripwire update.
Consequently the **fail-closed Migration Guard v2** rejects new Vercel preview builds,
including Handlarbörsen's independently reviewed UI PR #567.

This PR **does not apply a migration to production**. It restores the code/ledger
parity for the migration that was already applied, preserving the guard intact.

## Exact change set, no Lead Finder rollout
Only four source files are carried from the local, isolated and verified SCB
Lead Finder branch at commit `7a6cc5f04a4d317e8eab291745f4017e5f140c24`:

1. `apps/web/supabase/migrations/20261028072659_handlarborsen_scb_review_only_candidates.sql`
2. `apps/web/scripts/migration-guard-policy.mjs` – 163 canonical / 149 enforced
3. `apps/web/lib/qa/migration-guard-v2.test.ts` – exact, missing and duplicate proof
4. `apps/web/tests/isolation/schema-security.json` – owner-scoped TENANT_RLS

The SQL creates a review-only `public.hb_lead_candidates` table with RLS,
project-owner SELECT policy, no anonymous access, no authenticated writes,
restricted allowed values, and `outreach_ready=false`. It does not import
companies or run communication, scheduled jobs, or approval flows.

**Explicitly excluded:** Lead Finder app/server code, the local
`known-outreach-snapshot-20261027.json`, company/contact lists, SCB source
files, local imports, outreach automation, environment changes and secrets.
The GitHub repository is public, so the excluded local business data must
not be swept into an unrelated PR.

## Evidence and limitations
- Production migration-ledger read-only check: 186 entries; matching SCB name
  occurs exactly once.
- Local offline dry-run against the actual 186 recorded production names:
  163/163 canonical files, 149/149 enforced; zero unknown, zero duplicate.
- Negative offline tests fail closed for duplicate ledger names, unexpected
  names and missing the required SCB migration.
- Source branch has recorded 175/175 migration/schema tests and 243/243
  targeted security and Lead Finder tests; those source-branch results
  **do not replace CI for this specific PR HEAD**.
- Production's SQL is already applied. The ordinary GitHub/Vercel review and
  test gates must still pass before this PR is eligible for merge.

## Separate release hold
1. Keep this PR as **Draft** until exact-HEAD CI, Vercel and review are green.
2. Do not replay the migration into production, disable the guard, override
   the build, or change cron/publication schedules.
3. A merge to `main` is a separate release decision; do not auto-merge.
4. After approved merge, rebase/merge current `main` into #567 and rebuild
   that exact final candidate; then finish its authenticated visual review.
5. The broader SCB Lead Finder branch remains unmodified and unpushed.
   Its separate feature code, private company lists and import approvals
   require their own review before any public GitHub publication.

Tracking: https://github.com/Bumbi190/ai-operating-platform/issues/565
