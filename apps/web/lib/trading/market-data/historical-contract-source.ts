/**
 * GATE-08 C3C — provider-neutral historical, concrete-contract 1m source.
 *
 * Canonical: Contract-Scoped Historical Candle Source Result v1.0 (Beslut N).
 * This file does not select contracts, contact a provider, invent calendar
 * expectations, or mint Strategy/Execution authority. It is a deterministic
 * boundary between a future provider's observation report and existing
 * ContractCandleSegment / HistoricalObservedMinutes validators.
 *
 * Contrasts with the older root-scoped HistoricalCandleSource, which is for
 * chart navigation only and whose hasMoreBefore is NOT a data-coverage proof.
 *
 * Technical/infrastructure errors REJECT the source's Promise. Do not
 * catch-and-convert them into source states or source refusals.
 */

import { parseResolvedContract, sameContract, type ResolvedContract } from '../contract-identity'
import { isTimestamp, toEpochMs, type Timestamp } from '../time'
import type { MarketCandle } from '../market-candle'
import { parsePriceText } from '../market-price'
import { buildHistoricalContractRequest, type HistoricalContractRequest } from './contract-window'
import { buildContractCandleSegment, type ContractCandleSegment, type SegmentProblem } from './contract-segment'

/*
 * Canonical ObservedMinutes is structurally { sourceState, minuteOpenTimes }.
 * C3C echoes this SHAPE but must not import SessionCalendar: the market-data
 * package is intentionally allowed only the grid predicate as a VALUE import.
 * This local type introduces NO new states or semantics; it is contract-tested
 * against the existing SessionCalendar interface. Calendar and completeness
 * remain owned by their original modules.
 */
type HistoricalSourceState = 'SETTLED' | 'UNKNOWN'
interface HistoricalObservedMinutes {
  readonly sourceState: HistoricalSourceState
  readonly minuteOpenTimes: readonly Timestamp[]
}

export interface HistoricalCoverage {
  /** Inclusive instant, and must equal request.from as an instant. */
  readonly from: Timestamp
  /** Exclusive instant, and cannot exceed request.to. */
  readonly to: Timestamp
}

export type HistoricalContractSourceResult =
  | {
      readonly kind: 'OBSERVATIONS'
      readonly contract: ResolvedContract
      readonly coverage: HistoricalCoverage
      readonly sourceState: HistoricalSourceState
      readonly candles: readonly MarketCandle[]
    }
  | {
      readonly kind: 'NO_DATA'
      readonly contract: ResolvedContract
      readonly coverage: HistoricalCoverage
      readonly sourceState: HistoricalSourceState
    }
  | { readonly kind: 'REFUSED'; readonly reason: 'SOURCE_REQUEST_UNAVAILABLE' }
  | {
      readonly kind: 'INVARIANT_VIOLATION'
      readonly problem: 'CONTRACT_MISMATCH' | 'INVALID_COVERAGE'
    }

/** Deliberately separate from execution-provider and UI-historical interfaces. */
export interface HistoricalContractCandleSource {
  /** Expected semantic results resolve. Technical errors reject. */
  read(request: HistoricalContractRequest): Promise<HistoricalContractSourceResult>
}

/**
 * These are boundary-only problems, never domain ReasonCode or execution DENY.
 * MALFORMED_SOURCE_RESULT and INVALID_REQUEST cover untyped runtime input, not
 * a new source outcome or provider-specific reason vocabulary.
 */
export type HistoricalBoundaryProblem =
  | 'INVALID_REQUEST'
  | 'MALFORMED_SOURCE_RESULT'
  | 'CONTRACT_MISMATCH'
  | 'INVALID_COVERAGE'

export type HistoricalSourceInspection =
  | {
      readonly kind: 'ACCEPTED'
      readonly sourceKind: 'OBSERVATIONS' | 'NO_DATA'
      readonly coverage: HistoricalCoverage
      readonly sourceState: HistoricalSourceState
      /** Still NOT sufficient to prove BarCompleteness. */
      readonly segment: ContractCandleSegment
      readonly observed: HistoricalObservedMinutes
      /** Null means the interval endpoint was reached, NOT that sourceState is SETTLED. */
      readonly nextRequest: HistoricalContractRequest | null
    }
  | { readonly kind: 'REFUSED'; readonly reason: 'SOURCE_REQUEST_UNAVAILABLE' }
  | { readonly kind: 'INVARIANT_VIOLATION'; readonly problem: HistoricalBoundaryProblem }
  | { readonly kind: 'SEGMENT_REFUSED'; readonly problem: SegmentProblem; readonly detail: string }

const violation = (problem: HistoricalBoundaryProblem): HistoricalSourceInspection =>
  Object.freeze({ kind: 'INVARIANT_VIOLATION' as const, problem })

function own(value: Record<string, unknown>, property: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, property)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sourceStateOf(value: unknown): HistoricalSourceState | null {
  return value === 'SETTLED' || value === 'UNKNOWN' ? value : null
}

/**
 * Verify untrusted provider output BEFORE passing any candle to canonical
 * segment, completeness, aggregation or strategy code.
 *
 * No sorting, no repair, no symbol inference, no snapshot/replay claim.
 * Only canonical instant comparisons are used, not lexicographic Timestamp text.
 */
export function inspectHistoricalContractResult(
  request: HistoricalContractRequest,
  raw: unknown,
): HistoricalSourceInspection {
  // A typed callsite can still send a malformed runtime value. Fail closed.
  const verified = buildHistoricalContractRequest({
    contract: request?.contract, timeframe: request?.timeframe,
    from: request?.from, to: request?.to,
  })
  if (!verified.ok) return violation('INVALID_REQUEST')
  const req = verified.request

  if (!isRecord(raw) || typeof raw.kind !== 'string') return violation('MALFORMED_SOURCE_RESULT')

  if (raw.kind === 'REFUSED') {
    return raw.reason === 'SOURCE_REQUEST_UNAVAILABLE'
      ? Object.freeze({ kind: 'REFUSED' as const, reason: 'SOURCE_REQUEST_UNAVAILABLE' as const })
      : violation('MALFORMED_SOURCE_RESULT')
  }
  if (raw.kind === 'INVARIANT_VIOLATION') {
    if (raw.problem === 'CONTRACT_MISMATCH' || raw.problem === 'INVALID_COVERAGE') {
      return violation(raw.problem)
    }
    return violation('MALFORMED_SOURCE_RESULT')
  }
  if (raw.kind !== 'OBSERVATIONS' && raw.kind !== 'NO_DATA') {
    return violation('MALFORMED_SOURCE_RESULT')
  }

  const returnedContract = parseResolvedContract(raw.contract)
  if (returnedContract === null) return violation('MALFORMED_SOURCE_RESULT')
  if (!sameContract(req.contract, returnedContract)) return violation('CONTRACT_MISMATCH')

  if (!isRecord(raw.coverage) || !isTimestamp(raw.coverage.from) || !isTimestamp(raw.coverage.to)) {
    return violation('INVALID_COVERAGE')
  }
  const fromMs = toEpochMs(raw.coverage.from)
  const toMs = toEpochMs(raw.coverage.to)
  if (fromMs !== toEpochMs(req.from) || fromMs >= toMs || toMs > toEpochMs(req.to)) {
    return violation('INVALID_COVERAGE')
  }

  const sourceState = sourceStateOf(raw.sourceState)
  if (sourceState === null) return violation('MALFORMED_SOURCE_RESULT')
  if (raw.kind === 'NO_DATA' && own(raw, 'candles')) {
    return violation('MALFORMED_SOURCE_RESULT')
  }
  if (raw.kind === 'OBSERVATIONS' && (!Array.isArray(raw.candles) || raw.candles.length === 0)) {
    return violation('MALFORMED_SOURCE_RESULT')
  }

  if (raw.kind === 'OBSERVATIONS' && (raw.candles as unknown[]).some((candle) =>
    !isRecord(candle) ||
    Object.keys(candle).length !== 6 ||
    !['openTime', 'open', 'high', 'low', 'close', 'volume'].every((field) => own(candle, field)) ||
    !isTimestamp(candle.openTime) ||
    parsePriceText(candle.open) === null ||
    parsePriceText(candle.high) === null ||
    parsePriceText(candle.low) === null ||
    parsePriceText(candle.close) === null ||
    (candle.volume !== null && parsePriceText(candle.volume) === null)
  )) return violation('MALFORMED_SOURCE_RESULT')

  // The segment constructor already owns authoritative instant/ordering/grid
  // checks. We do not duplicate or weaken any of those rules.
  const candles: readonly MarketCandle[] =
    raw.kind === 'NO_DATA' ? [] : raw.candles as readonly MarketCandle[]
  const built = buildContractCandleSegment({
    contract: returnedContract,
    timeframe: req.timeframe,
    from: raw.coverage.from,
    to: raw.coverage.to,
    candles,
  })
  if (!built.ok) {
    return Object.freeze({ kind: 'SEGMENT_REFUSED' as const, problem: built.problem, detail: built.detail })
  }

  const observed: HistoricalObservedMinutes = Object.freeze({
    sourceState,
    minuteOpenTimes: Object.freeze(built.segment.candles.map((candle) => candle.openTime)),
  })
  const nextRequest: HistoricalContractRequest | null =
    toMs === toEpochMs(req.to)
      ? null
      : Object.freeze({ contract: req.contract, timeframe: req.timeframe, from: raw.coverage.to, to: req.to })

  return Object.freeze({
    kind: 'ACCEPTED' as const,
    sourceKind: raw.kind,
    coverage: Object.freeze({ from: raw.coverage.from, to: raw.coverage.to }),
    sourceState,
    segment: built.segment,
    observed,
    nextRequest,
  })
}

/**
 * No catch block: a rejected Promise is TECHNICAL FAILURE, not an empty candle
 * list, a settled absence, or SOURCE_REQUEST_UNAVAILABLE (Beslut N §28-30).
 */
export async function readHistoricalContractChunk(
  source: HistoricalContractCandleSource,
  request: HistoricalContractRequest,
): Promise<HistoricalSourceInspection> {
  const raw = await source.read(request)
  return inspectHistoricalContractResult(request, raw)
}
