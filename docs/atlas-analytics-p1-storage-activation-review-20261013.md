# Atlas P1 storage activation review — 13 October 2026

## Decision for André

Authorize only installing and verifying the already-reviewed P1 storage migration in Omnira's database. Keep Save disabled. No application merge/deploy, feature/environment/secret change, cron, workflow execution or old-history repair is included in this decision.

This creates `atlas_analysis_drafts` and `atlas_analysis_draft_events`, eleven narrow helper/save functions, immutable triggers and indexes. No existing business rows are rewritten or deleted. An authenticated owner can use the app's save route only after separately authorized application deployment and Save enablement. Direct client access remains denied; the save RPC is service-only.

## Exact reviewed artifact

- Target: Supabase project `AI Operating Platform`, ref `iboepohjwrhtgshrqaol`; not Handlarbörsen's source database.
- Reviewed P1 head: `2dd5c0fd50fc18a203f1866a4b1cc5f21816b740`, PR #323.
- SQL: `apps/web/supabase/migrations/20261012183305_atlas_analysis_drafts.sql`.
- SHA-256 of committed SQL bytes: `0582d94689b34e6704c26a830b879741d233ff81a7139bf28ce3642e83000738`.
- Intended migration ledger name: `atlas_analysis_drafts`, exactly once. Do not rename the historical migration file or insert a ledger entry without its DDL.
- Local real SQL gate, 355 targeted tests, TypeScript and fresh independent P1 review passed as documented. Replay repair has its own six regression and 157 guard/security tests.
- Full historical replay is still unproven. Task 7 expressly permits an explicit replay blocker; this does not turn the isolated P1 gate red. Root legacy history must not be injected into the canonical replay or production.

## Read-only target inventory

Catalog reads on 2026-10-13 at 04:54 UTC, with no DDL, business writes or configuration changes, confirmed:

- PostgreSQL 17.6, same major as the local test image; exact minor-image equivalence is not claimed.
- Projects, collector_runs and marketplace snapshot tables are present; required project/audit/source column names and types match the P1 accesses.
- Qualified `extensions.digest(bytea,text)` and guarded snapshot RPC are present.
- P1B ledger entry `handlarborsen_marketplace_snapshots` version `20261010080307`; P1E `handlarborsen_guarded_snapshot_store` version `20261011110737`.
- 135 ledger rows and no duplicate names; P1 entry absent.
- New P1 tables/functions are absent, with no partial install found.
- Handlarbörsen's fixed project ID/slug matches, has an owner and is observer/active.
- Snapshot RLS enabled, zero client policies, anon/authenticated SELECT denied, service SELECT allowed.
- Existing guarded-store RPC is SECURITY DEFINER with empty search_path and owner/service-only execution.

These are prerequisite checks, not a claim that P1 has been installed or exercised live.

## Operator steps after approval

1. Recheck exact GitHub head, committed SQL hash, current target identity, absence of partial P1 objects and P1B/P1E prerequisites immediately before applying. Determine operational window and recovery posture; current backup status has not been independently retrieved.
2. Apply only the unchanged reviewed P1 SQL through the migration operator path with atomic transaction and ledger registration. Refuse drift or partial failure; never bypass the migration guard.
3. Read-only verification: tables/columns/constraints, four immutable triggers, RLS/no client policies, client/direct mutation revocations, service-only save RPC, empty search_path, helper/sequence revocations and exactly one ledger entry. Compare installed definitions against the reviewed SQL.
4. Record actual installed definitions and migration/hash evidence. Application rebuild/deployment and Save enablement remain separate approvals.
5. Before user-facing enablement, verify an authenticated save/retry/history flow in an approved environment. No protected preview should write production merely for testing.

Rollback of the feature is disabling Save and retaining immutable history. Do not delete analysis tables/history or restore the whole database as an automatic rollback. No backup/restore operation has been performed.

**Updated state: André authorized storage-only installation on 2026-10-13 at 07:15 Europe/Stockholm. It was applied and verified; actual ledger version 20261013051724. Save enablement and application deployment remain separate, unperformed stages. See [production storage record](atlas-analytics-p1-production-storage-20261013.md).**
