/**
 * Omnira Trading — recorded-first contract selection orchestration, public surface.
 *
 * Import from `@/lib/trading/contract-selection-orchestration`, not from the
 * modules beneath it, and not through `@/lib/trading` — like the store, this
 * package is deliberately NOT re-exported from the root barrel.
 *
 * Canonical authority:
 *   docs/trading-system/specifications/market-data/
 *   Omnira Trading System – Recorded-First Contract Selection Orchestration – Canonical v1.0.md
 *
 * WHAT THIS PACKAGE IS
 * ────────────────────
 * Historical and replay orchestration, composing three packages in one fixed
 * order:
 *
 *     find  →  (only on NOT_FOUND)  resolve  →  materialize  →  record  →  find
 *
 * WHAT IT IS NOT
 * ──────────────
 * It is not live contract selection. Canonical v1.0 §24 keeps historical and
 * live as SEPARATE contracts and forbids a symmetric shared interface, so
 * LIVE CONTRACT SELECTION ORCHESTRATION stays a separate future boundary
 * (Beslut M §2).
 *
 * It owns no decision content. `ContractSelectionDecision`, its identity,
 * `ContractCalendar`, `ContractResolution`, the store port, `MarketInstrument`
 * and `Timestamp` all belong to the packages that already define them, and are
 * deliberately NOT re-exported here — a second export site would make this
 * package look like their owner.
 *
 * It reads no clock, mints no identity, touches no provider, writes no journal
 * event and speaks to no database. The only storage dependency is the
 * `ContractSelectionDecisionStore` port (Beslut M §13, §8, §33).
 */

export { orchestrateRecordedFirstContractSelection } from './orchestration'
export type {
  HistoricalContractSelectionFallback,
  RecordedFirstContractSelectionInput,
  RecordedFirstContractSelectionResult,
} from './orchestration'
