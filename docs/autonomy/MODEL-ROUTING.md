# Model / Worker Routing

**Status:** Canonical v0.1 (Phase 0 — routing design, not implemented; no new provider wiring in this slice)

## 1. Current reality (verified, not aspirational)

Omnira does not have a general worker/provider abstraction today:

- `apps/web/lib/ai/anthropic.ts` (`getAnthropic(ctx)`) is the **only**
  governed model chokepoint in the codebase, and it is Anthropic-specific:
  cost reservation, `ExecutionContract`/`RunBoundAuthority` propagation,
  abort-signal composition, and idempotency keys are all implemented against
  the Anthropic SDK's client shape directly.
- `apps/web/lib/atlas/code-work/types.ts` pins exactly one worker
  configuration today: `{ provider: 'anthropic', modelId: 'claude-sonnet-4-6',
  adapterId: 'claude_patch_v1', outputProtocol: 'sdf1.structured_file_ops.v1' }`.
  `worker-registry.ts` exists as an identity registry but currently has one
  entry's worth of real use.
- There is no `getCodex` or equivalent, and no dispatcher that could call one
  even if it existed (see MISSION-CONTRACT.md §2).

**Phase 0 does not build a second provider seam.** It documents the interface
a future Model Router should present, so that adding a second provider later
is additive to this interface rather than a rewrite of it.

## 2. Task classes

| Class | Description | Example |
|---|---|---|
| A — tiny/mechanical | Formatting, typos, trivial renames | Fix a lint violation |
| B — normal implementation | Ordinary feature/bugfix work, well-scoped | Add a UI filter, fix a null-check bug |
| C — complex implementation/debugging | Multi-file, ambiguous root cause, needs iteration | Chase a flaky test across the SQL concurrency suites |
| D — architecture/security/high-risk reasoning | Governance, auth, migrations, cross-cutting design | Anything at Mission Risk Level 2–3 (RISK-AND-AUTHORITY.md) |

Task class is a routing input, not a security boundary — `riskLevel` (a
mission field) still governs review/approval regardless of which class or
worker handled the work.

## 3. Routing inputs (target interface, not implemented)

```ts
interface ModelRoutingInputs {
  taskClass: 'A' | 'B' | 'C' | 'D'
  missionRiskLevel: 0 | 1 | 2 | 3   // from RISK-AND-AUTHORITY.md
  estimatedContextTokens: number     // from CONTEXT-ROUTING.md's loaded set
  requiresToolUse: boolean
  requiresExtendedReasoning: boolean
  previousAttemptFailures: number    // bounded by SDF1_LIMITS.maxWorkerIterations today
  costBudgetRemaining?: number       // reads from the existing cost/spend ledger, never a new one
  workerAvailability: WorkerId[]     // from worker-registry.ts
}

interface ModelRoutingDecision {
  workerId: WorkerId
  provider: string       // e.g. 'anthropic' — never hardcoded at the call site
  modelId: string
  adapterId: string      // must match an adapter the worker actually implements
  rationale: string       // for audit, not for the worker to see
}
```

## 4. Escalation behavior (target policy, not implemented)

```
cheap/fast worker
  → retry if reasonable (bounded by SDF1_LIMITS.maxWorkerIterations, currently 2)
  → stronger worker/model
  → specialist/reasoning worker (task class D)
```

The system should **prefer the least expensive capable worker**, not always
the strongest model. Escalation is bounded by the same numeric limits SDF-1A
already enforces (`maxWorkerIterations`, `maxTotalRuntimeSeconds`); a router
must not exceed those limits by escalating more times than the mission's
admission allows. Raising those limits is a change to SDF-1A's contract, not
to the router.

No real provider billing integration is required or added in this phase. Any
future cost input reads the existing `cost_events`/spend-reservation system
(`lib/cost/track.ts`, `lib/cost/rates.ts`, the `getAnthropic` reservation
flow) — it does not create a second cost ledger.

## 5. Non-goals for this document

- Does not add Codex, or any second provider, to the codebase.
- Does not change `getAnthropic` or `CodeWorkAdmissionV1`'s current
  single-worker pin.
- Does not implement `ModelRoutingInputs`/`ModelRoutingDecision` — these are
  recommended interfaces for the next implementable slice
  (see PHASE-0.md §4).
