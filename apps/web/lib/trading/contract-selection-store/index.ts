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
 * package deliberately stops. The recorded-first fallback is implemented in
 * `@/lib/trading/contract-selection-orchestration`, and keeping it outside the
 * store is the point: a store that fell back would have to resolve, and §10's
 * "read the recorded decision, never recompute it" would then mean nothing.
 *
 * It records nothing to a journal. No `EVENT_TYPES` member exists for a
 * selection and none is added; `TradingEvent` is not the storage envelope.
 *
 * It persists nothing beyond memory. No database, no schema, no migration — a
 * persistent adapter is still later work behind this same interface.
 *
 * The recorded selection chain (GATE-08C-3B) is complete: materialisation, this
 * store, and recorded-first orchestration above it all exist.
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
