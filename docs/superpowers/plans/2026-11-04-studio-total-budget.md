# Studio one-off budget integration

Work WEB-STUDIO-ALLOWANCE-20261104. Baseline 0e48fddf. Continue owned PR368; reviewed preflight reuse_existing/explicit_existing_pr. No production SQL, resume, paid dispatch, merge or new media in this implementation.

## Gap and decision
The USD10 local journal cannot enforce hosted chat/worker requests. Keep it intact as prior approval/evidence; do not connect a disk file to a multi-host web route. Extend the existing project_budgets and spend_reservations instead of creating a second billing ledger. All canonical provider adapters already require budget_mark_dispatch_intent. Make lifetime admission atomic with that existing intent, before the final stop check. This covers chat, build and failed retries, including advisory monthly mode. Existing three-argument callers must refuse capped projects without a pinned FX rate, so older deployments cannot silently bypass an activated total.

## Contract
- Optional immutable integer USD-micro total and monotonically consumed worst-case ceilings; no renewal, refund, automatic top-up or month reset. This is an allowance, not actual invoiced spend.
- Configure once, service-only, correct owner, paused project, no earlier native costs/reservations, explicit imported prior consumption and approval SHA. Never auto-create a budget.
- Use the canonical stored SEK ceiling and the exact rate snapshot already used by the provider adapter. Admission and dispatch intent commit together under locks. Same-token RPC retry is idempotent; other token/changed FX refuses.
- Leave native monthly/global policies and stop/claim/settlement in place. Do not change H1 flags. Unconfigured projects keep old intent behavior.
- UI distinguishes non-renewing USD allowance/consumed ceilings from actual monthly SEK spend; owner-scoped read only.

## Verification and rollout
RED/GREEN tests for rate propagation and SQL absence, then real PostgreSQL migration-chain tests: exact cap, one unit over, simultaneous requests, failures/releases not refunding, retries, legacy client refusal, role isolation, immutable settings, ordinary monthly editing, uncapped compatibility. Focused governed-spend/Studio regressions. No heavy existing stacks stopped; Hultgren has less than 1 GiB free RAM, so one bounded 128 MiB disposable PostgreSQL only and serial small tests.

Second-pass review: avoid a separate precheck with a race; enforce at durable intent. Legacy RPC compatibility is required to close the old-host gap. Activation requires owner-reviewed production migration and a separately verified seed of the existing approval/zero-admission journal. No live test may start merely because unit tests pass.
