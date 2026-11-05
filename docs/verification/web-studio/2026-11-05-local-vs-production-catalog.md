# Web Studio: local replay vs Omnira production catalog (2026-11-05)

## Scope and safety
Read-only comparison of 14 allowlisted public-table metadata records from the production Supabase project against a disposable local PostgreSQL replay. No customer rows, token values, or secret keys were inspected. The production catalog metadata is kept outside the repository: C:/Users/Andre/Projects/Omnira/Temp/webbuilder-production-catalog-security-20261105.json.

Local command: `node apps/web/scripts/migration-bootstrap-replay-local.mjs --catalog-compare C:/Users/Andre/Projects/Omnira/Temp/webbuilder-production-catalog-security-20261105.json --receipt docs/validation/migration-bootstrap-replay-catalog-20261105.json`.

The receipt records **184/184 applied**, `completed: true`, `replayReady: false`, `cronJobRuns: 0`, `cleanup: removed`. The container had no network, mounts or exposed ports. No hosted schema changes or paid branches were performed.

## Observed results
- 14/14 requested tables present locally; 0 missing.
- **19 field mismatches** across the 14 tables.
- **14 owner differences**: production owner `postgres` vs local replay owner `supabase_admin`. This is an environment difference requiring owner/privilege review, not justification to change production ownership.
- `public.cron_heartbeat`: RLS is enabled in production, disabled locally.
- `public.platform_config`: RLS enabled and 1 policy in production, RLS disabled and 0 policies locally. The local fixture explicitly omits RLS and policies.
- `public.media_insights`: 21 columns in production, 18 locally.
- `public.runs`: 43 columns in production, 42 locally.

The other recorded metadata fields showed no differences; this is **not** full catalog or behavior parity. RLS policy definitions, roles, function bodies, trigger behavior, column names and types, constraints, default grants, storage configuration, actual authentication and worker behavior remain unverified. 184/184 is a successful **fixture-assisted** replay, not an automatic Supabase branch bootstrap.

## Required follow-up before a hosted test
1. Recover exact column-level differences for `media_insights` and `runs` from production and a new isolated replay; compare types, defaults, nullability and SQL provenance. Never manufacture a migration based on counts alone.
2. Establish RLS/policy and ACL provenance for `cron_heartbeat` and `platform_config`; prove API roles cannot access unintended data, rather than simply enabling RLS locally and declaring parity.
3. Distinguish ownership differences caused by local `supabase_admin` from real permission discrepancies. Review default privileges and owner-dependent SECURITY DEFINER behavior.
4. Reconcile 197 production ledger entries and original SQL with 174 canonical files and 10 additional local replay inputs; 13 unmatched names and 171 name-only candidates still lack SQL identity evidence.
5. Only after review, create an isolated data-less test branch with separate cost authorization and verify Auth, RLS, worker, spend protection and teardown. No production migration history edits or merge without separate approval.

## Status
- Local comparison: **completed with differences**.
- Local migration replay: **completed with fixtures**.
- Production SQL identity: **unverified**.
- Full security/catalog parity: **unverified**.
- Automatic hosted Supabase branch replay: **blocked**.
