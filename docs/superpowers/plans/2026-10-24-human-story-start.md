# Human Story Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** Review, individually approve and queue exactly one canonically bound story job from the calendar.

**Architecture:** Immutable prepared request, authenticated-only atomic human grant/bind, existing worker with scope revalidation and explicit spend cap.

**Tech Stack:** Next.js/TypeScript/React, PostgreSQL RPC, Vitest/Playwright, isolated Docker PostgreSQL.

**Spec:** ../specs/2026-10-24-human-story-start-design.md

## Global Constraints

- No hosted writes or paid dispatch during development.
- Keep unsupported unattended story policy and licensed V1 set unchanged.
- Owner scope, CSRF, no-store, strict inputs; immutable provider/model/amount/attempt identity.
- Approval queues through existing worker; duplicate clicks never create another run.

## Review Focus

- Service-role or wrong owner cannot manufacture human approval.
- Price, target, ownership, state or authority drift refuses before dispatch.
- Concurrent approval, terminal replay and unknown outcomes never duplicate spend.
- Late UI responses/account changes never retain another job's consent.
- Missing migrations/configuration fail visibly; never claim success for a queued job.

### Task 1: Canonical human scope and runtime enforcement

Files: workflows/story/dispatch-contract.ts, workflows/story/human-scope.ts and tests; action-run.ts, action-executor.ts, effect and Anthropic adapter propagation.

- [x] Add failing identity/cost-cap tests; implement canonical scope and fixed provider/model contract.
- [x] Read distinctly proven human scope at readiness; recompute combined target; pass cap only from verified readiness to adapter.
- [x] Preserve normal schema1 grants and unsupported autonomous binds; run regression suites.

### Task 2: Atomic request, approval and start

Files: additive migration *_human_story_start.sql; calendar/production-start*.ts and tests; isolated SQL probe.

- [x] Implement immutable request and approval provenance, owner/session RPC, one-shot run binding and commit fence.
- [x] Derive prepared snapshot server-side; POST prepare and approve operations accept only selectors/idempotency/review hash.
- [x] Validate SQL migration, role isolation, cap/hash parity, target/state/expiry, replay/concurrency, rollback and old provenance guard on real local schema.

### Task 3: Calendar consent UI and whole-flow verification

Files: CalendarProductionPreview.tsx and browser tests; verification report and exports.

- [x] Display exact reviewed model/provider/cap and explicit approval; show queued receipt, not generated success; retry reuses request key.
- [x] Offline worker/adapter integration, mobile/error/duplicate/late-response browser coverage, relevant unit suites and typecheck.
- [x] Independent review, resolve findings, commit local work and export reviewable result.

## Execution rulings and evidence

- Human one-shot authority is distinct from unattended licensing; the existing unsupported story autonomy policy remains unchanged. Independent architectural review confirmed this distinction from the licence domain.
- Final runtime inspection found the existing generic execution-authorization reader requires a browser session. The new human branch instead proves immutable run scope/current owner then folds the same canonical authorization history directly using the worker DB handle. Revoked/expired/missing/conditional/wrong-target tests and the executor integration now use this real fold, not a mocked grant verdict. Existing generic authority readers are unchanged.
- A real executor test exposed pre-existing intent-phase ambiguity for positively proven non-dispatch. Only an explicit trusted `provablyNotApplied` plus `not_dispatched` result now yields FAILED; all unknown/lost results remain conservative. Regression verified through the real executor/handler/provider wrapper offline.
- Reviewer requested receipt recovery after reload and a new explicit review for safely failed/cancelled jobs. Added both; uncertain and evidence-pending outcomes never expose a new-run action.
- Supabase CLI scaffold: 20261024172905_human_story_start.sql. It has no dependency on the later pending calendar responsibility/link migrations. The earlier working draft filename was replaced with the CLI scaffold; identical final SQL was verified on the real local replay.
- Initial local full replay hit a Docker CLI memory failure; GOMAXPROCS=2 resolved it. Extra state-drift probes initially attempted an invalid projection update, then accidentally used a terminal synthetic state. Both fixtures were corrected to use real transitions between nonterminal synthetic states. Final full177 replay plus29 human-story cases passed and the owned container was removed.
- Detailed results: ../../calendar-human-story-start-verification-20261024.md.
