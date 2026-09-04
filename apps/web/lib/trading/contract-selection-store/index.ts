/**
 * Omnira Trading — contract selection decision recording, public surface.
 *
 * Import from `@/lib/trading/contract-selection-store`, not from the modules
 * beneath it, and not through `@/lib/trading` — this package is deliberately
 * NOT re-exported from the root barrel.
 *
 * Canonical authority:
 *   docs/trading-system/specifications/market-data/
 *   Omnira Trading System – Contract Selection Decision Recording & Replay – Canonical v1.0.md
 *
 * WHAT THIS PACKAGE IS
 * ────────────────────
 * One recording/replay context, with exactly two operations:
 *
 *     record(decision)   →  RECORDED | REFUSED
 *     find(root, at)     →  FOUND | NOT_FOUND | INVARIANT_VIOLATION
 *
 * WHAT IT IS NOT
 * ──────────────
 * It does not resolve, materialize or orchestrate. `resolveContractAt` and the
 * materializer are imported nowhere here, and a `NOT_FOUND` is where this
 * package stops — the recorded-first fallback belongs to C3B.3.
 *
 * It records nothing to a journal. No `EVENT_TYPES` member exists for a
 * selection and none is added; `TradingEvent` is not the storage envelope.
 *
 * It persists nothing beyond memory. No database, no schema, no migration — a
 * persistent adapter is later work behind this same interface.
 *
 * It mints no authority. Recording a selection grants exactly no permission to
 * trade.
 */

export { CONTRACT_SELECTION_STORE_REFUSALS, createInMemoryContractSelectionDecisionStore } from './store'
export type {
  ContractSelectionDecisionStore,
  ContractSelectionStoreRefusal,
  FindContractSelectionDecisionResult,
  RecordContractSelectionDecisionResult,
} from './store'
