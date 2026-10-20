# Atlas Creative P8 — real local PostgreSQL migration validation

Date: 2026-10-20
Branch: feat/atlas-creative-p8-dbtests
Parent: feat/atlas-creative-p7-db / Draft PR #460

## Reproducible local test

We use `@electric-sql/pglite@0.5.10` under
`scripts/creative-tools/pglite-fixture/`, in its own private npm package,
without adding a dependency to the deployed Omnira web application.

Commands from that fixture folder:

```powershell
npm ci --no-audit --no-fund
npm test
```

This creates an ephemeral, in-memory PostgreSQL **18.6** database in WASM,
defines only fixture `projects` and `assets` tables + roles, then executes
the *actual* P7 SQL migration file and calls its security-definer claim function.
No production database or cloud service is needed.

## Results

- The P7 migration executes in the local PostgreSQL runtime.
- Successful scoped claim transitions to `claimed_preview_only`, fence=1.
- Second claim for the same work ID is rejected.
- The `authenticated` and `anon` roles cannot call the function, even if a
  spoofed service-role JWT setting is supplied.
- The service-role function itself also checks the JWT claim.
- Incorrect worker, signed ticket, missing approval, expired/future-issued job,
  wrong project, wrong source SHA, archived source or mismatched media type
  prevent a claim.
- A second signed ticket hash or claim nonce hash violates a UNIQUE constraint.
- Actual table privilege introspection confirms service role can SELECT/INSERT
  but not UPDATE; browser roles have no direct grants.
- Source is not modified or published by any test.

## Read-only production schema check

Only read-only catalog queries were made against Omnira Supabase project
`AI Operating Platform`. Production has `projects.id uuid`, and `assets.id
uuid`, `assets.project_id uuid`, `kind text`, `status text`,
`checksum_sha256 text`. The new table `atlas_creative_queue_staging` was
not present. The real `service_role` has `rolbypassrls=true`, while `anon`
and `authenticated` do not.

No Supabase migrations, SQL writes, new paid projects, branches or deploys
were performed.

## What this does NOT establish

- The local runtime is PostgreSQL 18.6, whereas Omnira Supabase currently
  reports PostgreSQL 17.6. A PostgreSQL 17 test against a disposable clone
  still needs to be completed before deploy.
- PGlite uses a single in-memory backend; these tests verify sequential
  one-use claims, **not genuine multiple-connection concurrency**.
- The fixture stubs minimal tables and does not reproduce every production
  trigger, policy, extension or foreign-key side effect.
- A real server operator authorization, device identity, queue signer and
  transactionally verified approval **are not implemented**. SQL hashes alone
  are not proof of human approval.
- The Windows media worker is still disabled. Network/process isolation,
  media output validation in Atlas and public publishing gates remain pending.

## Go / no-go

Good to request SQL review and continue local integration development.
**NOT cleared** to apply the migration to production or enable unattended
editor execution. Keep P7 and P8 pull requests Draft until independent
review, PostgreSQL 17 integration and concurrent claim tests succeed.
