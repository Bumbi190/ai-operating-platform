# Model / Worker Routing

**Status:** Canonical v0.2 (Phase 0 — routing design, not implemented; no new provider wiring in this slice) · revised 2026-09-23

**v0.2 addition:** §1a documents exactly what `claude_patch_v1` is and is not
capable of today. A future dispatcher for this worker is a much smaller,
narrower thing than "running Claude Code or Codex autonomously" — read §1a
before assuming otherwise.

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

## 1a. `claude_patch_v1` today is deliberately not "Claude Code" or "Codex" — read this before designing a dispatcher

`worker-registry.ts`'s only registered worker, verified against source:

```ts
export const CLAUDE_PATCH_V1 = Object.freeze({
  // ...
  capability: 'structured_file_operations_only',
  toolAccess: 'none',
  shellAccess: 'none',
  gitAccess: 'none',
  directFilesystemAccess: 'none',
  workerNetworkAccess: 'none',
})
```

and `capability.ts`'s static declaration, in the same file:

```ts
workerRequirements: {
  structuredOutputOnly: true,
  directFilesystemAccess: false,
  shellAccess: false,
  gitAccess: false,
  toolAccess: false,
},
isolationRequirements: {
  vmBackedLinux: true,
  executionNetwork: 'denied',
  executionSecrets: 'none',
  worktreeRetention: 'explicit_cleanup_only',
},
```

**This worker cannot touch a filesystem, shell, git, network, or tool by
itself, even in principle.** Its entire contract is: receive bounded input,
emit `sdf1.structured_file_ops.v1` (typed create/replace/delete/rename
operations with expected-sha256 preconditions), and nothing else — the
*caller* (a not-yet-built dispatcher) would be the one that validates those
operations and applies them inside an isolated, `vmBackedLinux`-required
worktree with `executionNetwork: 'denied'`.

**Therefore: a dispatcher for `claude_patch_v1` is NOT equivalent to running
Claude Code or Codex autonomously.** Claude Code and Codex, as products, run
with real shell/tool/filesystem/network access inside a session. Wiring a
dispatcher for the current `claude_patch_v1` worker would only ever produce
structured file-operation proposals for a human-reviewed patch pipeline — it
would not grant, and must not be made to grant, interactive tool use, shell
access, git operations, or network access.

**Full Claude Code / Codex worker support — a worker that itself uses tools,
runs shell commands, or reaches the network during a mission — requires a
separately reviewed worker adapter and capability declaration (a new,
distinct entry in `capability.ts`'s allow/forbid lists, not a loosening of
`CLAUDE_PATCH_V1`'s existing `'none'` flags), plus a sandbox/broker
architecture capable of actually enforcing `vmBackedLinux`-grade isolation
around it.** `feat/omnira-sdf1c1-broker-identity` (unmerged, paused) is
adjacent groundwork for device/broker identity, not this capability itself,
and this Phase 0 does not restart it or assume it will land as designed.
**Do not weaken `CLAUDE_PATCH_V1`'s or `CODE_WORK_CAPABILITY`'s existing
`'none'`/`false` flags to make a dispatcher easier to build — that is a
capability change to SDF-1A, requiring its own explicit, separately reviewed
decision, never a side effect of shipping routing or evaluation-gate
documentation.**

The `vmBackedLinux: true` isolation requirement is itself an unresolved
runtime constraint for whichever phase eventually builds a dispatcher: today
nothing enforces it because nothing executes anything. Design that
enforcement (a real VM-backed Linux execution boundary, not a
best-effort local sandbox) as part of the dispatcher/broker phase, not as
an afterthought once a dispatcher already runs code somewhere.

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
- Does not weaken `CLAUDE_PATCH_V1`'s or `CODE_WORK_CAPABILITY`'s access
  flags (§1a) in any way, for any reason.
- Does not implement `ModelRoutingInputs`/`ModelRoutingDecision` — these are
  recommended interfaces for the next implementable slice
  (see PHASE-0.md §4).
