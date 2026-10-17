# Handlarbörsen Watch Journal Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; implement sequentially in the isolated worktree, then request independent review.

**Goal:** Durable, disabled weekly watch journal with duplicate/concurrency/fencing protections.
**Architecture:** Dedicated project-locked head/event tables and three atomic mutation RPCs; server-only safe adapter, no execution entry point.
**Tech Stack:** Existing Next.js/TypeScript/Vitest; PostgreSQL17.6 isolated Docker fixture.
**Spec:** docs/superpowers/specs/2026-10-17-handlarborsen-watch-runs-design.md

## Global Constraints
- Project8f673c09-1c8f-4d78-876e-4c14bf1c89b3, kind known_sources_weekly; Stockholm Monday period.
- Max180second lease, max10HTTP metadata; no auto retry/takeover or external request.
- RLS+FORCE, zero client privileges/policies, service SELECT only; mutation RPCs narrowly DEFINER.
- Proposed SQL only; no production schema, flag, scheduler, account or parallel-project changes.
- Every adapter result executionAllowed:false; disabled adapter performs no DB construction/RPC.

## Review Focus
- Period mismatch at Stockholm midnight/DST/year change must never create duplicate identities.
- Unknown transport after mutation must not trigger retry or execution.
- Expired worker cannot finish, including after waiting in a transaction started before expiry.
- Different periods cannot bypass an unresolved uncertain run.
- Safe receipt parsing must reject foreign project/run/period, never expose claim tokens or raw errors.

### Task1: Core and server adapter
Files: apps/web/lib/atlas/project-analytics/handlarborsen-watch-runs-core.ts and handlarborsen-watch-runs-store.ts; matching lib/qa tests.
Interfaces: weeklyWatchPeriod(now:Date):string|null; createWatchRunJournal(deps).enqueue(now),claim(id,token),finish(input). Results distinguish disabled/invalid/unknown/ok and never authorize execution.
- [x] Write tests for period edges, strict DTO/input guards, disabled/no-RPC and unknown/no-retry.
- [x] Observe RED missing implementation.
- [x] Implement pure core and injected server adapter; exact flag reader and no route import.
- [x] Verify tests and TypeScript.

### Task2: Proposed journal schema
Files: docs/sql/handlarborsen_watch_runs_p1_proposed.sql, matching fixture; apps/web/scripts/test-handlarborsen-watch-runs-db.mjs.
Interfaces: handlarborsen_watch_enqueue_v1(project,period), handlarborsen_watch_claim_v1(project,id,token,lease_seconds), handlarborsen_watch_finish_v1(project,id,token,expected_revision,state,outcome,http_count,digest).
- [x] Write real database fixtures/concurrency harness and observe missing-schema RED.
- [x] Implement tables/constraints/audit triggers and the three atomic RPCs, safe receipts.
- [x] Prove duplicates, fencing/expiry, mismatched replay, cross-period lockout and denied actual roles in isolated PostgreSQL.
- [x] Save sanitized receipt and confirm fixture removal.

### Task3: Review and disabled release
- [x] Reconcile latest main/live ledger read-only; run targeted regressions and TypeScript.
- [x] Independent code/security review; fix Important/Critical findings.
- [ ] Push one coherent PR, verify all required CI and exact-head READY Preview.
- [ ] Merge authorized disabled code when protection allows; verify production exact merge.
- [ ] Update Notion with actual results and concrete schema approval request. Do not install schema/enable journal/schedule/external calls in this task.

## Verification ledger
- Core/adapter RED missing implementation, then 37 tests GREEN. SQL fixture RED missing enqueue RPC, then 21 real PostgreSQL checks GREEN.
- Lock-wait regressions reproduced stale finish clock and consumed claim lease before fixes; clock sampled after all necessary locks.
- Operation-specific receipt tests RED then GREEN. Independent reviewer: no remaining Critical/Important findings.
- Ruling: use dedicated journal instead of existing automatically claimed/retried runs queue; avoids unauthorized dispatch. HTTP count unknown stays NULL until completion; cap is metadata only.
- Source hash and actual database receipt are linked in docs/verification/2026-10-17-hb-watch-runs-release.md. Production schema/flag remain unchanged.
