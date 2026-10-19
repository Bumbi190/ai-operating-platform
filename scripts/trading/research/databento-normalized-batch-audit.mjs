/**
 * GATE-08 -- purely OFFLINE normalized OHLCV interval auditor.
 *
 * This is an audit of caller-supplied normalized integers, NOT a DBN decoder,
 * provider transport, license attestation, C3C source, calendar authority, or
 * a path to strategy signals. It never infers a SETTLED source state.
 *
 * Databento ohlcv-1m can OMIT minutes with no trades; missing observations are
 * just candidates for SessionCalendar review, not known market-data failures.
 */
import { createHash } from 'node:crypto'
import { inspectNormalizedOhlcv1m, prepareHistoricalQuote } from './databento-historical-preflight.mjs'

const MAX_ROWS = 44640 // 31d * 24h * 60m (same offline quote horizon)
const MS_PER_MINUTE = 60000
const block = (reason, recordIndex = null) => Object.freeze({
  status: 'BLOCKED', reason, recordIndex,
  sourceState: 'UNKNOWN', canBecomeStrategyEvidence: false,
  downloadAllowed: false, purchaseAllowed: false,
})

function relevantFields(r) {
  return [
    r.dataset, r.schema, r.rtype, r.ts_event_ns, r.publisher_id, r.instrument_id,
    r.open_nano, r.high_nano, r.low_nano, r.close_nano, r.volume,
  ]
}

/** Scan up to five unobserved minute opens, explicitly NOT exchange-missing bars. */
function sampleUnobservedMinuteOpens(from, to, instants) {
  const result = []
  let next = from
  for (const instant of [...instants, to]) {
    while (next < instant && result.length < 5) {
      result.push(new Date(next).toISOString())
      next += MS_PER_MINUTE
    }
    // Jump over any large gap once sampling is full (avoid scanning all minutes).
    next = instant + MS_PER_MINUTE
    if (result.length >= 5) break
  }
  return Object.freeze(result)
}

/**
 * INPUT IS AN IN-MEMORY LIST OF ALREADY NORMALIZED TEST RECORDS.
 * No IO occurs here. A real downloaded DBN/CSV/JSON representation needs an
 * independently vetted, versioned decoder with reliable raw-file provenance.
 */
export function auditNormalizedHistoricalInterval({ contract, from, to, mapping, rows } = {}) {
  const plan = prepareHistoricalQuote({ contract, from, to, mapping })
  if (plan.status !== 'READY_FOR_METADATA_QUOTE') return block(plan.reason)

  if (!Array.isArray(rows) || rows.length > MAX_ROWS) return block('ROWS_MISSING_OR_OVER_RESEARCH_LIMIT')
  const fromMs = Date.parse(from)
  const toMs = Date.parse(to)
  const expectedMinutes = (toMs - fromMs) / MS_PER_MINUTE
  if (!Number.isSafeInteger(expectedMinutes) || expectedMinutes > MAX_ROWS) {
    return block('INVALID_INTERVAL')
  }

  // Hashing canonical field tuples avoids object property-insertion-order drift.
  // This is NOT a checksum of original provider bytes, or a source authenticity proof.
  const digest = createHash('sha256')
  digest.update(JSON.stringify([
    plan.quoteParameters.dataset, plan.quoteParameters.schema,
    plan.quoteParameters.symbols, from, to, plan.mappingEvidenceId,
  ]))
  let lastAt = null
  const seenTimes = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const inspected = inspectNormalizedOhlcv1m(r, mapping)
    if (inspected.status !== 'UNTRUSTED_CANDLE_FOR_REVIEW') return block(inspected.reason, i)
    const at = Date.parse(inspected.candle.openTime)
    if (at < fromMs || at >= toMs) return block('ROW_OUTSIDE_REQUEST_WINDOW', i)
    if (lastAt !== null && at === lastAt) return block('DUPLICATE_MINUTE_OPEN', i)
    if (lastAt !== null && at < lastAt) return block('UNORDERED_MINUTE_OPEN', i)
    digest.update('\n')
    digest.update(JSON.stringify(relevantFields(r)))
    seenTimes.push(at)
    lastAt = at
  }

  const unobservedCandidateMinutes = expectedMinutes - seenTimes.length
  if (unobservedCandidateMinutes < 0) return block('MORE_OBSERVATIONS_THAN_WINDOW_MINUTES')
  const firstUnobservedSample = sampleUnobservedMinuteOpens(fromMs, toMs, seenTimes)
  return Object.freeze({
    status:'REVIEW_ONLY',
    dataset: 'GLBX.MDP3', schema: 'ohlcv-1m',
    requestedFrom: from, requestedTo: to,
    contract: Object.freeze({ root: contract.root, cycle: Object.freeze({...contract.cycle}) }),
    mappingEvidenceId: plan.mappingEvidenceId,
    rowsExamined: seenTimes.length,
    intervalMinuteCount: expectedMinutes,
    unobservedCandidateMinutes,
    firstUnobservedSample,
    normalizedFieldSequenceSha256: digest.digest('hex'),
    digestKind: 'NORMALIZED_FIELDS_NOT_RAW_PROVIDER_BYTES',
    dataSourceVerified: false,
    exchangeCalendarVerified: false,
    sourceState: 'UNKNOWN',
    canBecomeStrategyEvidence: false,
    downloadAllowed: false, purchaseAllowed: false,
  })
}
