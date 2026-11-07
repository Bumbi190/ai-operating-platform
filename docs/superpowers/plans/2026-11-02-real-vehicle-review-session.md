# Authenticated vehicle review session implementation plan

> **For agentic workers:** Use superpowers:executing-plans. Continue existing approved work without a new branch or PR.

**Goal:** Bind pending inspection events to independently verified server-session identity and a parameterized private SQL writer.
**Architecture:** Reuse recordVehicleInspectionDraft and its atomic append_pending SQL. A server-only adapter resolves owner access, independently calls auth.getUser, snapshots scope and rechecks session/ownership before append and before returning a receipt. Privileged backend capabilities are explicitly supplied by trusted composition; there is no default live connection.
**Tech Stack:** Existing TypeScript, Vitest, Supabase Auth, PostgreSQL.
**Spec:** docs/superpowers/plans/2026-11-02-real-vehicle-showroom-pipeline-v1.md, Gate D and P2a; current Notion Web Studio handoff.

## Global constraints
- Same clean linked worktree and Draft PR #368, base 7bb502d9840b787898086dfab1f8ebc3972363b5.
- No route, activation, new dependency, credentials, hosted SQL, customer images, paid inference or merge.
- A stored event remains review_recorded_not_approved.
- Private SQL schema is not a Supabase public RPC. Only a future reviewed backend DB transport may call it.
- Owner-only access is deliberate reuse of existing project access; delegated non-owner reviewers remain unsupported.

## Preflight
Read AGENTS.md and enabled Notion instructions. Actual PR/branch/head and clean state match this workstream. Executable preflight returned review_required/matching_local_branch with 123 PRs and 231 worktrees. Manually inspected existing PR #368 and its file scope: reuse_existing; no branch creation.
Prior head has 14/14 successful GitHub workflows. Full repository test suite previously has documented failures and is not claimed green.

## Task 1: Session-bound private writer and server entrypoint
**Files:** create session-bound-audit-writer.ts, server-review-audit.ts and server-review-audit.test.ts under apps/web/lib/website-build/vehicle-verification.
**Consumes:** ReviewAuditPorts, ReviewerAccess, ReviewAuditEvent and recordVehicleInspectionDraft.
**Produces:** makeSessionBoundReviewAuditPorts(access, backend), recordAuthenticatedVehicleInspectionDraft(submission, backend?).
- [ ] Write tests using the real audit contract, synthetic evidence, mocked external Auth/project-access and a strict parameterized DB boundary.
- [ ] RED: run the new test file; missing implementation must fail.
- [ ] Implement server-only adapters with copied session scope and exact 15-parameter SQL call. No string interpolation from event data.
- [ ] GREEN: new tests and full vehicle-verification suite pass.
- [ ] Typecheck the web workspace; inspect failures without weakening unrelated guards.
- [ ] Write verification report, review diff and commit only these files and plan.

## Review focus
- Session mismatch/error/missing user before backend access.
- Caller attempts to provide reviewer authority and absent server configuration.
- Revoked owner scope or changed session during async evidence loading blocks writes.
- Revocation after an append withholds receipt; write may already have committed and must never retry automatically.
- Malformed/ambiguous DB receipts fail closed; only a valid pending acknowledgement can be returned.

## Execution ledger
Plan reviewed against existing Gate D; this implements session binding and SQL transport only. Source-photo/render loading remains supplied trusted capability, and no real authenticated HTTP/DB integration is claimed.
Ruling: Do not repeat the enormous known-red repository suite on the RAM-constrained desktop. Run the complete affected vehicle suite, web TypeScript and configured CI after any authorized push; report scope honestly. Cost if wrong: unrelated regressions may remain unobserved.

Task 1 implementation and tests complete: 97/97 whole vehicle-verification cases PASS; 23 new session/writer cases. First inert implementation failed 20/21, and independent-review alias regressions failed 2/23 before correction. Final review fixed Important input alias issue using pre-await owned snapshot and generated-event receipt project; both tests GREEN.
Final: minor (deferred): independently exercise project-list copying and assert assignment/evidence callback non-invocation on auth denial.
Local package restoration: exact existing @types/three 0.187.0 archive integrity matched package-lock SHA512; restored only absent ignored node_modules directory, no manifest/lock changes.
Full web TypeScript PASS (tsc --noEmit --project apps/web/tsconfig.json, exit 0) after restoring exact locked types. Task 1: complete; independent review Important fixed, minors recorded.
