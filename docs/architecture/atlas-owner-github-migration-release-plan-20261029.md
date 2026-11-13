# Omnira / Atlas owner-GitHub binding – migration and rollback release plan

**Status:** DRAFT PLAN / NOT AUTHORIZED FOR PRODUCTION / NOT A CANONICAL MIGRATION.

**Owner mandate correction:** GitHub repository deletion is reserved exclusively for the owner, performed **manually in GitHub**. Nova may create via a separate scoped tool, recommend deletion and stop/revoke integrations but may never execute or delegate repository deletion. Project/account data erasure SQL in the *disposable synthetic fixture* illustrates a separate human-authorized administrative process, not an agent permission. Project/workflow agents are technical identities; "Pling" is just their 3D visual avatar. Familje-Stunden Pling is a separate story character.
**Date:** 2026-10-29 (Europe/Stockholm).
**Work:** [Issue #604](https://github.com/Bumbi190/ai-operating-platform/issues/604), existing [Draft PR #605](https://github.com/Bumbi190/ai-operating-platform/pull/605).
**Scope:** `docs/architecture/proposed-sql/atlas_owner_github_bindings_stage1_PROPOSAL.sql` and synthetic PG17 tests only.
**Owner/Agent separation:** Atlas/Nova is one cross-project intelligence with project-specific tool authorization; workflow agent receives separate project+workflow-only delegation; Prime Agent owns code-execution runtime independently.

## 1. Production evidence, read-only observation on 29 October 2026

Omnira Supabase's `public.projects`: **6 rows, one owner**, table heap **8 KiB**, total table+indexes **80 KiB**. `projects_pkey` is UNIQUE on `id`; no independently suitable UNIQUE key on `(id, owner_id)`. Existing indexes: `idx_projects_owner`, `idx_projects_slug`, `projects_pkey`, `projects_slug_key`. Existing owner FK is `projects.owner_id REFERENCES auth.users(id) ON DELETE CASCADE`; existing `survival_input_epoch_bump` triggers are present. **Neither proposed `atlas_owner_github_bindings` table nor `atlas_github_projects_id_owner_key` index exists in production.**

Read-only `pg_default_acl` inspection found `postgres`/`supabase_admin` defaults granting ALL table rights in public to `anon`, `authenticated`, `service_role`. This is why the proposal must REVOKE ALL from these roles before adding explicit SELECT; RLS does not stop service_role's BYPASSRLS SELECT. Original projects policies, grants, triggers, constraints and other tables must remain untouched.

The numbers are a single snapshot, NOT a guarantee of future size, traffic, lock contention or user impact. Repeat a fresh read-only preflight **immediately before any approved release**.

## 2. Architectural and release blockers

1. **No actual signed owner approval/withdrawal mechanism yet.** `approved_by` and `approved_at` are storage fields, not authentication or independent proof of a human action. No new mapping may be inserted merely because these columns exist.
2. **No live provider transport:** the new data-driven adapter is not wired to Nova chat or GitHub App. A parent `All repositories` installation can be trusted only after independently authenticated App/owner/permission proof; every actual token must be restricted to ONE verified repository with `contents:read`. The currently shipping old Handlarbörsen-specific reader remains OFF.
3. **No independent security review.** The existing source review and threat findings were authored by the same assistant performing the changes; 46/46 tests and PostgreSQL fixture passes are not external sign-off.
4. **Data deletion and owner transfer conflict:** proposed `FOREIGN KEY(project_id, owner_user_id) ... ON DELETE RESTRICT` plus `owner_user_id REFERENCES auth.users(id)` can block project deletion, owner reassignment and deletion cascades from `auth.users` (existing `projects.owner_id ON DELETE CASCADE`). A compliant lifecycle must be designed before live: authenticated explicit unlink/revoke, immutable but privacy-safe audit/tombstone location, retention/deletion policy and a tested account-erasure path. **Do not silently change existing `projects` FK/triggers to make this pass.**
5. **No production migration approved.** Proposed SQL stays OUTSIDE the canonical `apps/web/supabase/migrations` directory and must not be added to the live ledger without review. There must be an owner-approved deployment and rollback window.

## 3. Choice: bounded transactional index, not CONCURRENTLY for this pilot

**Recommended for current six-row projects table, subject to independent review and a fresh preflight:** use an **ordinary** unique index on `public.projects(id, owner_id)` inside ONE bounded transaction with the new table + RLS + grants. An ordinary index can briefly block writes; keep `lock_timeout = 2s` and `statement_timeout = 15s` for the SQL session, with a short deployment window, no concurrent DDL, and a clean exit if the lock cannot be acquired. This is a proposed ceiling, not measured production latency.

PostgreSQL `CREATE INDEX CONCURRENTLY` reduces write locking but **cannot** run inside a transaction. Supabase CLI can detect/split such statements, while the **GitHub Branching integration runs each migration in a transaction and does not honor the no-transaction directive**. Therefore do not switch to `CONCURRENTLY` without separately changing and verifying the exact migration executor, handling potentially invalid indexes and creating a staged recovery plan:
- [PostgreSQL 17 index construction](https://www.postgresql.org/docs/17/sql-createindex.html)
- [Supabase CLI migration transaction directives](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Supabase GitHub integration limitation](https://supabase.com/docs/guides/deployment/branching/github-integration)

**Do not use `IF NOT EXISTS` as proof of a correctly shaped index.** Verify `pg_index.indisvalid`, uniqueness, columns, ownership and exact definition. If an unexpected index exists, stop and review drift.

## 4. Before ANY approved database change

- Verify the authorized owner, correct project/environment and that the separate preview branch is not production. Read exact `main` SHA, migration ledger, open PRs and relevant ongoing agent work. Confirm Prime Agent's Windows/TPM/code-broker worktree is untouched.
- Read-only inspect `projects` size, ownership, duplicates of `(id, owner_id)`, index state, trigger/FK dependencies, active long transactions, migration guard status and whether either proposed object already exists. Confirm a verified recoverable database snapshot/backup appropriate to the operation and its actual restore procedure, not just a stated backup flag.
- Keep all Nova source-inspection and project-connection feature flags OFF; no user, workflow agent, model or other provider writes. No PEM, API keys, service-role keys, database URLs or private customer records in PRs, Notion, CLI logs, temporary fixtures or model context.
- Have a separate security reviewer inspect project/owner relationships, revocation, RLS, default ACL and `service_role` behavior. Explicitly decide the project/user deletion and owner-transfer contract. Obtain **specific owner approval** for an actual schema change, possible write lock and rollback.
- Stage the exact proposed migration using Supabase CLI `migration new` and reconcile the migration guard **only after approval**; validate the real deployment path in a safe nonproduction environment. Do not create a new canonical migration merely because the SQL proposal exists.

## 5. Bounded installation method — approved stage only

**Illustrative session shape, NOT a command to run against production now:**

```sql
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
-- exact reviewed SQL, starting with
-- CREATE UNIQUE INDEX atlas_github_projects_id_owner_key
--   ON public.projects(id,owner_id);
-- CREATE TABLE public.atlas_owner_github_bindings (...);
-- strict REVOKE ALL followed by reviewed SELECT-only GRANT and RLS
COMMIT;
```

The isolated runner currently verifies the complete proposed SQL with `psql --single-transaction` and bounded `PGOPTIONS`, so the whole create/index/grant/policy operation is atomic in the disposable fixture. The same lock behavior and exact statements must be verified with the actual approved Supabase migration runner, not assumed from local psql.

If a lock timeout, statement timeout or constraint failure occurs, the transaction must abort and leave *neither* a new table nor its index. Treat a partial migration ledger or unexpected object as a BLOCKER, not a reason to disable the migration guard. **Never use `MIGRATION_GUARD_OVERRIDE` as an ordinary workaround.**

## 6. Post-deploy verification (separate owner-approved release)

After a successfully committed approved migration and **BEFORE** enabling any Nova tool, verify:
- Composite unique index is valid and points to `projects(id, owner_id)`; composite FK rejects wrong-owner connections; existing `projects` triggers, policies, data and other indexes are unchanged.
- RLS enabled; authenticated owner A sees only own mappings; B sees only own; guest/anon sees none; workflow agent sees none; authenticated UPDATE/DELETE/INSERT denied; `service_role` has only direct SELECT and still bypasses RLS, requiring separate app authorization.
- No mappings were silently preapproved; the new table is empty initially; no secret data or scheduled agent jobs exist.
- Backend owner session and project scope tested end-to-end without service-role access leaking across projects. Explicit owner grant/revoke flow and immutable audit must be verified prior to use; a server-only private-schema approach can be assessed if public Data API exposure isn't necessary.
- Run CI, Migration Guard, independent review and actual authenticated Preview evidence. Production activation is a separate final owner decision.

## 7. Rollback decision tree

**Case A – transaction fails before commit:** Postgres automatically rolls back index/table/grants; verify catalog state and migration ledger, with feature OFF. No retry loop or guard bypass.

**Case B – successful migration but table still EMPTY and feature never enabled:** after separate operator approval and a new short lock window, an illustrative reverse transaction is:
```sql
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
DROP TABLE public.atlas_owner_github_bindings RESTRICT;
DROP INDEX public.atlas_github_projects_id_owner_key RESTRICT;
COMMIT;
```
This exact synthetic rollback **was tested successfully** in disposable PG17, preserving all original three fixture projects, their RLS policy and two mock users. Production rollback must independently verify empty table, no external references, no approval records, and current migration ledger. Neither `DROP` is authorized now.

**Case C – mappings, approvals, revocations or customer data exist:** **NEVER** run the destructive rollback above. Disable the feature and token mint, prevent new registration, preserve an encrypted/restorable/owner-accessible evidence copy in a reviewed location, revoke active tokens and prepare a data-retention/erasure plan. Only then create a separately approved reversible schema/data migration. A database schema reversal and a security incident response are different workflows.

**Case D – failed CONCURRENTLY index build in an alternate deployment:** STOP, inspect `pg_index.indisvalid` and index state. A failed build can leave an invalid index and may still enforce uniqueness; dropping/rebuilding requires separate qualified and approved steps. Do not force-push, reset or remove unrelated worktrees.

## 8. Evidence and test limits

Current PR branch: `codex/atlas-global-repo-catalog-issue604`; previous commit `db30b17` had **8/8 GitHub Actions SUCCESS, 46/46 offline tests, Vercel Preview READY**. New tests and this plan will need exact-head reruns after a new commit.

Disposable real PG17 runner: `scripts/atlas/verify-owner-github-pg17-rls.ps1`, cached `postgres:17-alpine`, no network, no host ports/volumes, 256 MiB memory, 0.6 CPU, ephemeral data/roles only, auto-removal. It now tests **transactional, timeout-bounded SQL install and synthetic rollback**, along with the prior 12 real PG17 role/RLS/FK assertions. This is not proof of an end-to-end Supabase migration, true JWT/RLS auth or production traffic lock behavior.

**Final state: HOLD / DRAFT.** No automated migration, merge, GitHub key provision, token creation, privileged Nova/workflow agent tool, Vercel promotion, paid API or production write is authorized by this document.

## 9. Later Stage 1d: tested alternative to FK deletion blocker

The restrictive baseline proposal is deliberately unchanged. An **additional, unapproved** SQL alternative now exists at `docs/architecture/proposed-sql/atlas_owner_github_lifecycle_OPTION_NOT_MIGRATION.sql`, with complete comparison/retention considerations in `docs/architecture/atlas-owner-github-lifecycle-decision-20261029.md`.

A separate real, networkless disposable PostgreSQL 17 fixture successfully verified:
- composite project/owner foreign key still prevents cross-project spoofing;
- revoke makes a binding ineligible for new scoped read; duplicate revoke is denied;
- unlink physically removes the mapping but keeps owner-readable approval/revoke/unlink events while project exists;
- removing a project deletes only its related audit and link metadata, without blocking project deletion;
- deleting the owner cascades their remaining project-owned mappings/audit, while a foreign owner survives;
- workflow agent/anon cannot read audit, authenticated actors cannot insert/delete audit, and `service_role` cannot directly mutate event rows despite replayed Supabase default ACLs;
- project transfer continues to be **intentionally blocked** until the consented audit-handoff/erasure flow exists.

Run the two isolated variants separately (one uses the original restrictive proposal; one adds the unapproved CASCADE/audit option):
```powershell
powershell -NoProfile -File scripts/atlas/verify-owner-github-pg17-rls.ps1
powershell -NoProfile -File scripts/atlas/verify-owner-github-pg17-rls.ps1 -LifecycleVariant
```
Both require the cached local PG17 Docker image, create no host ports or provider connections and auto-clean their synthetic containers. No actual Supabase Auth, GitHub provider token invalidation, signed owner review or production migration is implemented. **Option B is recommended for further discussion/testing, not approved.** Account erasure may still involve other Omnira database dependencies; the synthetic fixture does not establish whole-platform deletion success.
