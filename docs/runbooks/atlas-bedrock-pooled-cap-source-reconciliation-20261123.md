# Atlas Bedrock pooled-cap migration — exact source reconciliation

**Date:** 2026-11-23
**Branch:** `fix/atlas-bedrock-migration-ledger-reconcile-20261123`
**Base:** `origin/main` at `58023816fb853c6d4ece5617800cf7ce4c63303a`
**Scope:** shared Omnira repository migration history only, no schema apply, no runtime feature enablement.

## Root cause
Vercel Preview/Production builds using `apps/web/scripts/check-migrations.mjs`
were refused because production Supabase migration ledger contained the
enforced name `atlas_bedrock_pooled_gross_cap_20261121`, but the
main-branch canonical migration folder had no matching file. Migration
Guard v2 correctly failed closed and blocked independent The Prompt QA
changes from being built in preview.

## Exact immutable evidence
- The production migration is already applied exactly once:
  version `20261121090418`, name `atlas_bedrock_pooled_gross_cap_20261121`.
- Production `supabase_migrations.schema_migrations.statements[1]` matches the
  previously owner-reviewed canonical source (historical Atlas commit
  `946278828840c97584a852c490e72c67921088ef`) byte-for-byte.
- Source file:
  `apps/web/supabase/migrations/20261121090418_atlas_bedrock_pooled_gross_cap_20261121.sql`
- Verified SHA-256:
  `6b2c7486824c757ee60629a55b658385478e5b066d3084ac4f30c4738a813204`
- Verified file: **12,617 original UTF-8 bytes**. New single-file
  `.gitattributes -text` rule prevents Windows CRLF conversion
  from changing this already-applied source byte sequence.
- SQL is not executed again: this PR only **restores code history**.

## Guard restored with no bypass
- `migration-guard-policy.mjs` canonical/enforced counts:
  **179/165 -> 180/166**.
- **14 grandfathered names** and **30 legacy-only names** unchanged.
- Tests updated to preserve frozen baselines, historical ledger
  fixtures and rejection of unknown, duplicate or missing enforced names.
- **49/49** Migration Guard Vitest tests pass locally.
- A separate *read-only* verification against the live, current **203-name**
  production ledger passed with **unknown=0** and **duplicates=0**.
  Removing the Bedrock name, adding a duplicate or adding an unknown
  name each still causes the guard to fail.
- The read-only names and verification script are stored outside the
  repository under `D:\Projekt\The-Prompt\Produktion\2026-11-23-adversarial-distillation-review\`
  for private comparison; no production DB changes.

## Operational observations, not authorizations
- The production schema has the expected version marker, and
  `public.platform_config.atlas_bedrock_monthly_sek` is currently
  **75.0000** in the original database (not changed here).
- That Bedrock ceiling does **not** secure Remotion Lambda costs,
  which require a dedicated validated identity, billing ceiling
  and a separate approved test.
- This migration-source restoration should clear the *known*
  Vercel Migration Guard v2 mismatch. Other build errors remain
  possible and must be checked by a reviewed build before any release.
- No Vercel credentials, secret keys, AWS STS, Bedrock inference,
  Lambda render, SQL DDL, database writes, production deployment,
  social publishing or source allowlist/override modifications were made.
- This must **not** be blindly merged alongside unrelated dirty branches
  or be treated as permission to deploy/charge AWS.

## Review before release
1. Compare exactly the four intended files: original SQL, root
   `.gitattributes`, guard counts and guard tests, plus this runbook.
2. Require CI/preview checks and confirm the same live ledger result,
   not just a synthetic fixture.
3. Merge/deploy only with explicit release approval for the shared
   Omnira application; **do not run any Supabase migration apply**
   for an already-applied migration.
4. Release the independent The Prompt QA hotfix PR #652 separately,
   then solve Remotion IAM/cost/rights gates and verify a NEW
   video and provider receipts without bypassing fact-checking.

## PR-preview deployment observation (2026-11-23)

- The branch was pushed to GitHub as SHA `602d40b` **before**
  the corresponding draft PR #654 existed. Vercel generated
  `dpl_5sEQ46DZArfpFbTau9xrcUjcPHdJ` and marked it CANCELED,
  because the project's existing Ignored Build Step returned 0
  when `VERCEL_GIT_PULL_REQUEST_ID` was empty.
- This is expected for an initial branch deployment created before
  opening its GitHub PR. The existing gate intentionally allows PR
  previews and prevents unreviewed branch builds.
- The owner expressly approved the single-scope GitHub/Vercel review
  build including potential CI usage. After creating PR #654, one
  documentation-only follow-up push is used to trigger the normal
  **PR-aware preview**, with the current gate intact. No project
  ignored-build setting or Vercel production alias may be changed.
- A preview must still pass the Migration Guard, complete build and
  review checks. A GitHub status of "Vercel success" associated with
  a CANCELED ignored build is not proof of a successful preview.
