/**
 * Omnira Trading — contract selection decisions, public surface.
 *
 * Import from `@/lib/trading/contract-selection`, not from the modules beneath it.
 *
 * Canonical authority:
 *   docs/trading-system/specifications/market-data/
 *   Omnira Trading System – Contract Selection Decision Materialisation – Canonical v1.0.md
 *
 * WHAT THIS PACKAGE IS
 * ────────────────────
 * The layer between resolution and journal. It takes a resolution that already
 * succeeded and produces the immutable historical record of it:
 *
 *     ResolvedContractResolution  +  decisionId  +  decidedAt
 *         ↓  materializeContractSelectionDecision
 *     ContractSelectionDecision                (frozen, replayable, ungranting)
 *
 * WHAT IT IS NOT
 * ──────────────
 * It does not select. `resolveContractAt` is imported nowhere here, no
 * `ContractCalendar` is consulted, and a REFUSED resolution is not merely
 * rejected — it is unrepresentable as input.
 *
 * It reads no clock and mints no identity. `decidedAt` and `decisionId` are
 * supplied, so the same inputs give the same decision forever (§26).
 *
 * It records nothing. There is no journal, no store, no repository and no
 * replay persistence in this package — recording and replay belong to
 * `@/lib/trading/contract-selection-store`, which nothing here imports or calls.
 *
 * It mints no authority. A decision answers which contract and why, never
 * whether an order may be sent.
 *
 * WHERE THE REST OF THE CHAIN LIVES
 * ─────────────────────────────────
 * Recording and reading decisions, and the orchestration that reads a recorded
 * decision first and only otherwise resolves against a pinned calendar, are
 * both implemented now:
 *
 *     recording/replay  `@/lib/trading/contract-selection-store`
 *     recorded-first    `@/lib/trading/contract-selection-orchestration`
 *
 * The recorded selection chain (GATE-08C-3B) is complete. The dependency runs
 * one way only: the orchestrator composes this materializer, and this package
 * imports and calls neither of them. GATE-08 stays DELVIS STÄNGD.
 */

export { CONTRACT_SELECTION_POLICY_VERSION, materializeContractSelectionDecision } from './decision'
export type {
  ContractEvidence,
  ContractSelectionDecision,
  MaterializeContractSelectionDecisionInput,
  ResolvedContractResolution,
} from './decision'
