# Handlarbörsen watch readiness P0

This release adds a server-rendered read-only readiness panel to the existing owner and organization competitor pages. It is preparation for recurring monitoring, not an executor or completed autonomous cost-governance implementation.

## Scope and authority

The existing page authorization runs first. The loader then rechecks the live owner and exact Handlarbörsen identity, or uses the existing organization `view_competitors` authorization. It reads only canonical `stop_state` through `resolveExecutionStop` and project-filtered `budget_headroom(30)`. No reservation, mutation, event, provider call, scheduler, new feature flag or notification is introduced.

The DTO contains only stop/budget/enforcement classifications and a timestamp. It never exposes budget amounts, global spending, owner identifiers, operator stop reasons or database errors. Read failures remain unknown. The pure DTO whitelist always returns `executionAllowed:false` and `automaticActive:false`, even if its input attempts to override them. Budget headroom is a snapshot, never authorization or a reservation. Required configuration matches canonical budget_reserve: project_monthly plus all three global ceilings; optional project_daily/weekly also bind when present.

Live read-only evidence on 2026-10-17 showed no configured Handlarbörsen project budget. The canonical global spend flag is observed, never changed. Advisory mode is explicitly insufficient for future automation.

## Still required before execution

- Reviewed official source allowlist and automatic-read terms; new competitor discovery additionally needs an approved search interface.
- Durable project-scoped run ledger, unique run identity, concurrency/idempotency, audit and recovery semantics.
- Strict dispatch adapter with canonical spend reservation, intent, settlement and stop rechecks. Unknown or advisory authority must refuse.
- Explicit schedule, budget amount and production activation approval. Paid provider calls and external notifications need separate approval.

The displayed weekly/10-HTTP/zero-auto-retry/zero-paid-call proposal is not runtime configuration and activates nothing. Oscar's real login acceptance remains pending; no account or permission changes are included.

## Already-applied parallel migration reconciliation

The same release records `atlas_local_text_lifecycle` already applied independently by PR387. It copies only the exact frozen migration from commit `cff355230fe4250fa5ecd6ab4733cd99cab9a43b` to its original canonical filename `apps/web/supabase/migrations/20261017115403_atlas_local_text_lifecycle.sql`.

Live ledger version: `20261017180713`. One 59,067-character statement, SHA256 `d5c1ca9aba0c993a6be27625cfa9852d0eb719be5ccc5eb826bfa95acfd0aba3`. Guard becomes 135 canonical / 121 enforced / 158 known ledger names. Frozen 14 grandfathered and 30 legacy-only names remain unchanged; missing and duplicate lifecycle names are rejected.

Independent read-only catalog review: 150 public tables. Three added lifecycle tables are SERVER_ONLY with RLS enabled, FORCE disabled, zero policies/client table or column grants; service ALL includes DELETE/TRUNCATE. Of 44 local_text routines, 43 are INVOKER and one is the scoped conversation-delete DEFINER trigger, all with empty search_path and no client EXECUTE. The trigger also denies service EXECUTE. Jobs metadata_expires_at is not client-selectable. Inventory records these observed privileges rather than inferring narrower ones.

No SQL application, rollback, migration-guard bypass, local-model application code, worker or activation is included.

## Verification

Readiness/core/service/UI, owner and organization page suites cover exact project authorization, membership revocation, live-owner changes, malformed budget data, failed stop reads, private DTOs and permanently disabled execution. Migration tests pin exact source hash and enforce missing/duplicate rejection. Existing inbox, competitor, organization, canonical stop/budget and migration/security suites are included in the targeted run.

The isolated Chromium fixture renders the real panel at 1440, 1024, 390, 360 and 320 pixels, checks details, unknown state, no action controls and no horizontal overflow. It uses synthetic state and is not an authenticated production or Oscar test.

Two pre-existing budget comment assertions reproduced on the unchanged main baseline under Windows CRLF. Restoring the exact HEAD LF bytes in this isolated checkout fixes the assertions without any Git content change. Environment-gated PostgreSQL suites must be reported as skipped when their database fixture is unavailable; no database runtime behavior was changed by this P0.
