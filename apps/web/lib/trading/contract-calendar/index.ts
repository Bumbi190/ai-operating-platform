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
 * RESOLUTION ONLY — MATERIALIZATION LIVES ELSEWHERE
 * ─────────────────────────────────────────────────
 * This package answers WHICH contract. It does not build the record of that
 * answer: `ContractSelectionDecision` is materialized in
 * `@/lib/trading/contract-selection`, which consumes a resolution produced here
 * and adds the identity, instant and canonical reason that a historical record
 * needs. Keeping the two apart is what lets the resolver above stay a pure
 * function of (calendar, root, at) with no clock and no reason registry.
 *
 * NOT YET HERE — GATE-08C-3 AND LATER
 * ───────────────────────────────────
 * SessionCalendar, the canonical 1m grid, aggregation, BarCompleteness and
 * ContractCandleSegment all EXIST now, in their own packages — they are simply
 * not this package's concern. What genuinely remains is the contract-scoped
 * data SOURCE contract (GATE-08C-3A SOURCE-RESULT-SHAPE GAP is open) and the
 * recording and orchestration of decisions (C3B.2, C3B.3). GATE-08 stays
 * DELVIS STÄNGD.
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
