# Trading Core — Fas 1

The deterministic domain foundation for Omnira Trading System.

> **Canonical documentation lives in [`docs/trading-system/README.md`](../../../../docs/trading-system/README.md).**
> That tree is the source of truth for every trading rule, risk limit and
> authority boundary. This file describes the *code*, never the rules.
> If this file and the canonical docs ever disagree, **the docs win** — see
> [`SOURCE_OF_TRUTH.md`](../../../../docs/trading-system/SOURCE_OF_TRUTH.md).

## What Trading Core is

The canonical concepts and authority boundaries every future trading component
builds on. It is deterministic, testable, auditable, serializable, and
version-, environment- and account-aware.

It is independent of MT5, of any AI provider, of any market-data provider, of the
UI, and of any database vendor.

**It does not trade.** It holds no market connection, detects no setups and sends
no orders.

## What Fas 1 contains

| Module | Purpose |
|---|---|
| `ids.ts` | Branded identities for every domain object |
| `time.ts` | ISO-8601 UTC instants, canonical timezone constant, expiry semantics |
| `decimal.ts` | Exact decimals for price/money/quantity — no floats |
| `environment.ts` | `development` / `backtest` / `demo` / `live`, never defaulted |
| `authority.ts` | `ALLOW` / `DENY` / `UNKNOWN`, the six authority modes |
| `reason-codes.ts` | Structured, stable reason codes |
| `versions.ts` | Explicit version references; moving aliases rejected |
| `contracts.ts` | StrategySignal, AiAnalysis, RiskDecision, PropDecision |
| `proposal.ts` | TradeProposal, Approval, lifecycle statuses |
| `safety.ts` | Kill switches (5 scopes), execution health |
| `execution-intent.ts` | ExecutionIntent *shape* only — it cannot produce one |
| `events.ts` | Append-only journal envelope, deterministic serialization |
| `index.ts` | **The public contract.** Import from `@/lib/trading` only |
| `internal/authority.ts` | **Trusted.** Issues authority capabilities |
| `internal/execution-gate.ts` | **Trusted.** The execution gate |
| `internal/index.ts` | **Trusted barrel.** Not re-exported publicly |

## What Fas 1 explicitly does NOT contain

Not oversights — later phases, several behind open gates.

- **No Strategy Engine.** No iFVG, CISD, FVG, liquidity, SMT, equal-high/low or
  4H thesis machine. Fas 3, and GATE-01 – GATE-04 are still open.
- **No AI.** No model provider, no prompt, no autonomous decision. Fas 4.
- **No Risk Engine.** No $150 sizing, no $450 daily state, no reserved-risk
  lifecycle. Fas 5.
- **No Prop Engine.** No provider, no firm-specific rules. Fas 9, GATE-09 open.
- **No MT5.** No bridge, no runner, no `order_send`. Fas 2 starts read-only.
- **No market data.** No provider chosen or connected. GATE-08 open.
- **No persistence.** No migration, no schema. Data Model is still v0.1 and not
  promoted; locking physical schema now would be premature.
- **No UI.** No Atlas Market View, no chart.
- **No slippage enforcement.** `maximumAllowedDeviation` is carried but not
  enforced — that threshold is GATE-12.

## Authority chain

```
Market Data → Strategy Engine → AI Analysis → Risk Engine → Prop Firm Rules Engine
→ Trade Proposal → Approval / Automation Policy → Execution Gateway
→ Execution Runner → MetaTrader 5 → Broker / Prop Firm → Journal & Analytics
```

A Strategy Signal is not an order. An AI recommendation is not a risk state. A
Risk PASS is not execution approval. A Trade Proposal is not a broker order.

### How the code enforces it

**Authority is issued, not derived from data.**

A `RiskDecision` is a record, and records are constructible by anyone. So a
record is never itself permission. The execution gate accepts only *capabilities*
— `RiskClearance`, `PropClearance`, `ApprovalGrant` — which are minted solely by
`internal/authority.ts` after it inspects a decision and finds an explicit
`ALLOW`.

Two layers protect that:

1. **Module boundary (primary).** Issuance and the gate live in
   `lib/trading/internal/` and are not re-exported from `@/lib/trading`. Code
   importing the public barrel cannot reach either one.
2. **Runtime witness (defence in depth).** Every issued capability carries a
   module-private symbol that nothing outside `internal/authority.ts` can name.
   A structurally identical object produced by a type assertion fails
   `isGenuineAuthority`, and the gate refuses it with `AUTHORITY_NOT_GENUINE`.
   This catches casts, which the type system alone cannot.

`ExecutionIntent` has no exported constructor anywhere — not even internally
outside the gate. `AiAnalysis` carries no verdict at all, and nothing derives a
capability from it.

### What this is not

This is a **TypeScript and module authority boundary inside one trusted
codebase**. It is not cryptography and not a sandbox. It stops accidental
bypass, honest mistakes and casual misuse. It does not stop someone editing this
repository, and it is not intended to — a deep import of
`@/lib/trading/internal` reaches the issuer by design, because that is exactly
how the Risk Engine (Fas 5), Prop Engine (Fas 9) and Approval layer (Fas 6) will
integrate.

The property actually guaranteed, and covered by `public-boundary.test.ts`:

> Code importing only from `@/lib/trading` cannot mint execution authority from
> records it invented.

### Bounded authority lifetime

An `ExecutionIntent` never outlives the permissions that authorized it:

- it may not be created already expired (`expiresAt > now`)
- `expiresAt <= proposal.expiresAt`
- `expiresAt <= approval.expiresAt`

### Decision reference integrity

The gate checks that the capabilities offered are for *exactly* the decisions the
proposal names — `proposal.riskDecisionId` must equal the clearance's
`riskDecisionId`, and likewise for prop. A proposal cleared by decision A cannot
execute on an ALLOW from decision B merely because signal and account match. A
proposal naming no decision fails closed.

## Open gates

Eleven remain. None block Fas 1 or Fas 2. Authoritative list and phase
classification: [`Open Implementation Gates v1.0`](../../../../docs/trading-system/reviews/Open%20Implementation%20Gates%20v1.0.md).

Never implement a rule that sits behind an open gate. Ask instead.

## Next phase

**Fas 2 — MT5 Read Only.** Ungated.

## Testing

```bash
npm test --workspace=apps/web
```

Tests are co-located as `*.test.ts` and registered in `apps/web/vitest.config.ts`.
They are deterministic and make no network calls.
