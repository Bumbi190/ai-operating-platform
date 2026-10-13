# Atlas P1 production storage — 13 October 2026

## Authorized installation

André authorized the reviewed storage-only installation with “Okej kör :)” on 2026-10-13 at 07:15 Europe/Stockholm, after the Swedish scope summary. No app merge/deploy, Save enablement, provider/collector/cron/workflow activation or unrelated history repair was authorized.

Target: AI Operating Platform, Supabase ref `iboepohjwrhtgshrqaol`.
Reviewed source: PR #323 head `2dd5c0fd50fc18a203f1866a4b1cc5f21816b740`.
Migration: `apps/web/supabase/migrations/20261012183305_atlas_analysis_drafts.sql`.
Exact committed input: 28,925 bytes; SHA-256 `0582d94689b34e6704c26a830b879741d233ff81a7139bf28ce3642e83000738`.

Fresh preapply inventory confirmed P1 objects/functions/ledger entry absent, P1B/P1E present, qualified pgcrypto digest and guarded-store prerequisites present, and fixed Handlarbörsen project identity/mode valid. The unchanged reviewed SQL was applied ONCE through Supabase apply_migration, with name `atlas_analysis_drafts`; tool returned success.

Actual registered ledger version: `20261013051724`. This is the operator-generated production version, not a rename of the repository SQL filename. The ledger name exists exactly once. Before/after ledger counts: 135 → 136.

## Post-install read-only verification

- Both P1 tables exist and contain zero rows. No live save/RPC write test was performed.
- All eleven installed function bodies match exact SHA-256 hashes of their reviewed source bodies. Every function has empty search_path.
- Only atlas_save_analysis_draft is SECURITY DEFINER; only service_role can execute it. Anon/authenticated execution is denied on all P1 functions. Service execution is denied on private helpers.
- Both tables have RLS enabled and no client policies. Anon/authenticated have no SELECT/INSERT/UPDATE/DELETE/TRUNCATE privileges. Service role has SELECT but no direct mutation privileges.
- All four immutable UPDATE/DELETE/TRUNCATE protection triggers exist and are enabled. Project/actor and composite project+draft/successor foreign keys use ON DELETE RESTRICT.
- Eight expected indexes are present, including unique identity, created-once, superseded-once and stable history pagination.
- Sequence access is denied to anon/authenticated/service_role.
- Actual 136 ledger names passed the unchanged local Migration Guard v2 policy: 113 canonical SQL files; 99/99 enforced present; no unknown or duplicate ledger names. This check proves set integrity, not SQL content hashes, history order or full replay.
- Security advisor reports INFO “RLS enabled no policy” for the two new tables, intentional for service-only storage. No WARN on new P1 objects was reported. See [advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Other existing warnings were outside this installation's scope and were not changed.

A large initial read-only verifier hit an expired tool requestState; smaller read-only queries completed. No migration retry, repair, ledger rewrite or extra DDL was performed.

## Remaining boundaries

Save was not enabled and no environment/secret configuration was changed. No application/preview rebuild, merge, protected-preview write test, collector/cron or autonomous execution was initiated. The legacy historical replay blocker remains unproven as recorded in the replay recovery document.

Next separately authorized stage: build/review the application with Save off, then approve and verify authenticated save/retry/history behavior before enablement. Feature rollback is disabling Save and retaining history; no table deletion or whole-database restore was attempted.

This installation record is committed locally only so documentation publication does not automatically trigger an unapproved application preview deploy.
