/**
 * Omnira Trading — contract calendar and resolution, public surface.
 *
 * Import from `@/lib/trading/contract-calendar`, not from the modules beneath it.
 *
 * Canonical authority:
 *   docs/trading-system/specifications/market-data/
 *   Omnira Trading System – Market Data & Contract Lifecycle – Canonical v1.0.md
 *
 * WHAT THIS PACKAGE IS
 * ────────────────────
 * The provider-neutral machinery that turns a canonical root plus an instant
 * into the concrete futures contract an authored calendar says was selected:
 *
 *     root  +  instant
 *         ↓  ContractCalendar          (authored, versioned, validated)
 *     ResolvedContract  +  ContractLifecycle  +  authoritative interval
 *
 * WHAT IT IS NOT
 * ──────────────
 * It resolves nothing from a provider. There is no front-month algorithm, no
 * month-code parsing, no symbol prefix heuristic, no continuous-contract
 * mapping and no rollover formula — Canonical v1.0 §7.2 forbids each by name,
 * and the import-discipline suite fails the build if one appears.
 *
 * It reads no clock. `at` is always supplied, so the same inputs give the same
 * answer forever (§26).
 *
 * It mints no authority. A resolved contract is data identity and grants
 * exactly no permission to trade.
 *
 * NOT YET HERE — GATE-08C-2 AND C3
 * ────────────────────────────────
 * SessionCalendar, the canonical 1m grid, aggregation, BarCompleteness,
 * contract-scoped data sources, ContractCandleSegment and the materialization
 * of ContractSelectionDecision are later slices. GATE-08 stays DELVIS STÄNGD.
 */

// ─── Lifecycle facts ──────────────────────────────────────────────────────────
export type { ContractLifecycle } from './lifecycle'

// ─── The calendar ─────────────────────────────────────────────────────────────
export { CALENDAR_PROBLEMS, buildContractCalendar } from './calendar'
export type {
  CalendarBuild,
  CalendarProblem,
  CalendarProblemCode,
  ContractCalendar,
  ContractCalendarEntry,
  ContractCalendarInput,
  ContractCoverage,
} from './calendar'

// ─── Resolution ───────────────────────────────────────────────────────────────
export { CONTRACT_REFUSALS, resolveContractAt } from './resolver'
export type { ContractRefusal, ContractResolution } from './resolver'
