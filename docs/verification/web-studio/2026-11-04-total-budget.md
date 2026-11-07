# Shared one-off Studio allowance — implementation review

Work WEB-STUDIO-ALLOWANCE-20261104. Existing owned PR #368, baseline 0e48fddf. Read-only preflight initially matched unrelated recall PR343; its file scope was reviewed and the explicit PR368 preflight returned reuse_existing. No new branch/worktree. No production migration, cap activation, project resume or provider request.

## Result

The previous local USD10 journal remains intact. It cannot protect hosted processes. This implementation extends the EXISTING project_budgets and spend_reservations; it introduces no second invoice ledger or new table. A configured project's total is admitted atomically with its canonical dispatch intent, with the exact pinned FX from the adapter. It counts the full conservative ceiling permanently, including failures, uncertain outcomes, proven-undispatched releases, retries and later months. Actual invoiced/recorded SEK remains separate.

The three-argument legacy intent RPC delegates with no FX: uncapped projects keep existing behavior; capped projects refuse. This closes the old-deployment bypass. New callers use the four-argument overload. No changes to monthly/global budget policies, H1 flags, provider selection, final stop adjacency, claim fencing, settlement or Roadster media.

A service-only activation RPC requires the real owner, a paused project, existing budget row, no native cost/reservation history, explicit prior committed micros and a recorded approval SHA. A second initialization, top-up, decrease, reset, project reassignment or deletion of an active capped budget is refused. Ordinary monthly-budget edits still work. The restrictive deletion behavior also prevents hard deletion of a capped project by cascade; soft archive is unaffected. An exceptional audited retention/reconciliation migration would be required for later physical deletion or a new limit. There is deliberately no UI top-up or auto-reset.

Studio's authenticated owner-scoped cost read exposes the non-renewing USD limit, permanently committed ceilings and remaining allowance. UI labels these separately from monthly SEK actual cost/holds. Broken reads fail instead of pretending that the allowance is absent or zero. UI browser fixtures do not authorize a real build.

## Verification ledger

- RED: two rate-propagation assertions failed before implementation (6 existing malformed-response/error checks passed).
- SQL harness initially hit PostgreSQL's temporary bootstrap server; readiness was corrected to require completed initialization. Meaningful RED then failed on the missing migration.
- First real PostgreSQL run: 13 cases plus parent passed, including six concurrent processes competing for one cap, both RPC overloads, caller privileges, exact cap, FX rounding, replay, failed/ambiguous settlement and immutable configuration.
- Read-model RED: three new assertions failed while nine prior tests passed; an earlier fixture syntax error was corrected first.
- First affected regression after code: 69/70; the existing intent-call expectation needed the new pinned-rate fourth argument. Corrected expectation preserves its original assertions.
- Next focused regression: 82/82 passed. Additional broader exploration identified a pre-existing stale source-text assertion in spend-advisory-override and two Windows-incompatible shell-grep assertions in spend-financial-decoupling. They were not weakened or represented as passing. Two new display failures (classic JSX React import) were corrected.
- Final focused regression: 120/120 tests across eight files passed (pinned FX, display, owner-scoped read, durable spend, budget gate, replay/advisory, run-bound provider and TTS ceiling).
- Final real PostgreSQL integration: 16 cases plus parent = 17/17 passed, zero skips; owned disposable container removed.
- Migration Guard Integrity: 81/81 passed. Updated corpus counts and explicitly hypothetical post-apply fixtures; real captured195-name evidence remains immutable and correctly fails on the pending project_total_allowance. Missing, duplicate and unknown rejection remain tested.
- First hosted CI found the new budget columns missing from the checked-in TypeScript database contract. Added the exact additive column types for budgets and reservation receipts; no type assertion bypass. Browser/typecheck rerun pending.
- Vercel deployment dpl_DmumppVoqWQkuycju5jWvRyAMuLL on 9a5a269 stopped exactly at the unapplied project_total_allowance migration guard. No live build has been attempted.

## Rollout gate and rollback

1. Owner review of the additive production migration 20261104110000_project_total_allowance.sql. Migration alone seeds no budget, starts no work and changes no existing project limit. Existing uncapped clients remain compatible.
2. Deploy the reviewed code; the migration guard requires the new migration (173 canonical / 159 enforced), with no grandfathering or bypass.
3. Re-read the private USD10 approval, design binding and durable local journal. Reconcile all attributable media/model costs and unknown outcomes, not only the journal's count. Record a new activation receipt referring to the original approval and the exact plan/code scope. No resetting the old allowance. The activation SQL requires explicit imported prior consumption.
4. Seed ONLY the dedicated paused Demo Motors project using the owner-verified ID, explicit prior amount and approval SHA. Confirm the UI and DB total agree and old-client calls refuse. This does not resume the project.
5. Review the actual plan/mockup: current saved v1 is the older eight-car starter, not the accepted authored Roadster package. Then perform only the authorized attended build/edit/history test after current pricing/dispatch readiness is verified.

Rollback before activation: retain the previous app deployment; additive nullable columns do not enable spending. After activation: pause the dedicated project first, retain the counter/receipts and the legacy refusal wrapper. Do not roll back the database intent gate or erase the allowance. Old application code will fail closed for that project until fixed. No claim of live provider success or production readiness from fixture tests.

Manual second-pass review, not an independent security review: checked atomicity, lock order, unknown results, data access, and old-host behavior. A nullable SQL CHECK loophole discovered during review was closed with an explicit IS NOT NULL predicate and regression. Added fault-injection rollback, cross-project independence and monthly-edit preservation tests.

## Authorized production schema installation

The user's continuation on 4 November authorized the concrete pending installation. Applied the unchanged reviewed SQL with the Supabase migration tool to AI Operating Platform. Production recorded project_total_allowance at version 20261104104329; statement SHA256 equals the canonical LF source: 3522149a5519af153655c1f7fbb5348063306af13311edfb344ac8db8ed979e2. This supersedes the pending-install status above.

Separate observed receipt: 2026-11-04-total-budget-applied.json. The real ledger now has 196 names. Historical 190/195-name observations remain unchanged. Both constraints validated; all three budget RPC signatures are postgres-owned, security-definer and executable by service_role only (not anon/authenticated). The trigger function is not directly executable by those roles. Both intent overloads return false for a nonexistent reservation; an initial invalid ceiling-basis probe was rejected with 22023 as designed. This SQL check does not claim a hosted HTTP/provider transaction.

No total allowance is activated (0 rows with limits). The dedicated Demo Motors project remains paused. No reservation, provider dispatch, invoice, resume or changed monthly limit was created by installation. Existing security advisory categories remain; this change is not a blanket clean-security claim.

Next: deploy/review the preview, reconcile attributable prior costs against the existing nonrenewing USD10 approval, bind the actual approved plan, then activate only the dedicated project before an attended provider test. No allowance reset or assumed-zero history.
