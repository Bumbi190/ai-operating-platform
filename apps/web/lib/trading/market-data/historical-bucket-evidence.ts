/**
 * C3C — read-only historical bucket evidence bridge.
 *
 * Composes only existing canonical authority owners:
 *   HistoricalContractCandleSource (one concrete contract, 1m chunks)
 *   -> inspectHistoricalContractResult (echo + prefix + segment validation)
 *   -> SessionCalendar / sessionExpectation
 *   -> evaluateBucketEvidence (the ONLY bucket-completeness decision)
 *
 * It does NOT invent a schedule, approve a trade, infer an exchange closure
 * from NO_DATA, resolve rollover, change canonical strategy definitions, or
 * convert provider errors to success/UNKNOWN. It cannot mint permissions.
 * This is not a historical data-provider integration and fetches no market
 * data by itself; callers inject the read-only source.
 */

import { parseResolvedContract, type ResolvedContract } from '../contract-identity'
import { isTimestamp, toEpochMs } from '../time'
import {
  bucketAt,
  evaluateBucketEvidence,
  sessionExpectation,
  type BucketEvidence,
  type NominalBucket,
  type SessionCalendar,
} from '../session-calendar'
import {
  buildHistoricalContractRequest,
  type HistoricalContractRequest,
} from './contract-window'
import {
  readHistoricalContractChunk,
  type HistoricalContractCandleSource,
  type HistoricalSourceInspection,
} from './historical-contract-source'

/**
 * Bounded operational protection against a source that makes tiny progress
 * indefinitely. This is NOT a trading rule, data-size or provider page limit:
 * it only stops the read-only composition from running unbounded.
 */
export const MAX_HISTORICAL_CHUNKS_PER_BUCKET = 256

export type HistoricalBucketRead = 
  | {
      readonly kind: 'EVIDENCE'
      readonly contract: ResolvedContract
      readonly bucket: NominalBucket
      readonly calendarVersion: string
      readonly evidence: BucketEvidence
      readonly acceptedChunks: number
      /** Number of fully validated canonical 1m observations. */
      readonly observedMinuteCount: number
    }
  | {
      readonly kind: 'BLOCKED'
      readonly problem:
        | 'INVALID_BUCKET'
        | 'INVALID_REQUEST'
        | 'CALENDAR_UNKNOWN'
        | 'SOURCE_UNSETTLED'
        | 'SOURCE_REFUSED'
        | 'SOURCE_INVARIANT'
        | 'SOURCE_SEGMENT_REFUSED'
        | 'CHUNK_LIMIT_REACHED'
      readonly acceptedChunks: number
      /** For diagnostic display only, never decision authority. */
      readonly sourceProblem?: string
    }

function blocked(
  problem: Extract<HistoricalBucketRead, {kind:'BLOCKED'}>['problem'],
  acceptedChunks: number,
  sourceProblem?: string,
): HistoricalBucketRead {
  return sourceProblem === undefined
    ? Object.freeze({ kind:'BLOCKED' as const, problem, acceptedChunks })
    : Object.freeze({ kind:'BLOCKED' as const, problem, acceptedChunks, sourceProblem })
}

function inspectionFailure(
  inspected: Exclude<HistoricalSourceInspection, {kind:'ACCEPTED'}>,
  acceptedChunks: number,
): HistoricalBucketRead {
  switch (inspected.kind) {
    case 'REFUSED': return blocked('SOURCE_REFUSED', acceptedChunks, inspected.reason)
    case 'INVARIANT_VIOLATION': return blocked('SOURCE_INVARIANT', acceptedChunks, inspected.problem)
    case 'SEGMENT_REFUSED': return blocked('SOURCE_SEGMENT_REFUSED', acceptedChunks, inspected.problem)
  }
}

/**
 * Evaluate ONE already selected concrete contract and ONE canonical bucket.
 * No arbitrary root-to-contract choice, no automatic calendar population.
 *
 * Do not call completeness on a settled prefix until the ENTIRE bucket has
 * been covered: that would treat a still-in-flight source as missing data
 * and falsely label it PARTIAL. A sourceState=UNKNOWN blocks any promotion
 * to canonical bucket evidence, even if coverage reached the endpoint.
 *
 * Technical errors are intentionally not caught: the rejected Promise must
 * remain an infrastructure failure (Beslut N).
 */
export async function readHistoricalBucketEvidence(input: {
  readonly source: HistoricalContractCandleSource
  readonly calendar: SessionCalendar
  readonly contract: ResolvedContract
  readonly bucket: NominalBucket
}): Promise<HistoricalBucketRead> {
  const { source, calendar, contract, bucket } = input
  const parsedContract = parseResolvedContract(contract)
  if (!parsedContract || !bucket || !isTimestamp(bucket.open) || !isTimestamp(bucket.nominalTo)) {
    return blocked('INVALID_BUCKET', 0)
  }
  const canonicalBucket = bucketAt(bucket.timeframe, bucket.open)
  if (!canonicalBucket.ok ||
      toEpochMs(canonicalBucket.bucket.open) !== toEpochMs(bucket.open) ||
      toEpochMs(canonicalBucket.bucket.nominalTo) !== toEpochMs(bucket.nominalTo)) {
    return blocked('INVALID_BUCKET', 0)
  }

  const expectation = sessionExpectation(calendar, canonicalBucket.bucket)
  if (expectation.status === 'UNKNOWN') {
    return blocked('CALENDAR_UNKNOWN', 0)
  }

  const built = buildHistoricalContractRequest({
    contract: parsedContract,
    timeframe: '1m', from: bucket.open, to: bucket.nominalTo,
  })
  if (!built.ok) return blocked('INVALID_REQUEST', 0)

  let request: HistoricalContractRequest = built.request
  let chunks = 0
  const opens: HistoricalSourceInspection[] = []

  while (chunks < MAX_HISTORICAL_CHUNKS_PER_BUCKET) {
    const inspected = await readHistoricalContractChunk(source, request)
    if (inspected.kind !== 'ACCEPTED') return inspectionFailure(inspected, chunks)
    chunks++
    // A source may have returned usable observations but cannot certify that
    // it finished this interval. It never produces a COMPLETE verdict.
    if (inspected.sourceState !== 'SETTLED') return blocked('SOURCE_UNSETTLED', chunks)
    opens.push(inspected)

    if (inspected.nextRequest === null) {
      const observations = opens.flatMap((chunk) =>
        chunk.kind === 'ACCEPTED' ? chunk.observed.minuteOpenTimes : [],
      )
      const evidence = evaluateBucketEvidence(
        canonicalBucket.bucket, expectation,
        { sourceState:'SETTLED', minuteOpenTimes: observations },
      )
      return Object.freeze({
        kind:'EVIDENCE' as const,
        contract: parsedContract,
        bucket: canonicalBucket.bucket,
        calendarVersion: calendar.calendarVersion,
        evidence,
        acceptedChunks: chunks,
        observedMinuteCount: observations.length,
      })
    }
    request = inspected.nextRequest
  }
  return blocked('CHUNK_LIMIT_REACHED', chunks)
}
