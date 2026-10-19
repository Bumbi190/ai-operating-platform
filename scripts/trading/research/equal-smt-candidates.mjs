/**
 * NON-CANONICAL offline RESEARCH only for GATE-03 and GATE-04.
 * Do not import this into Trading Core, Strategy, Replay runtime or Execution.
 * No market/broker provider, API, account, risk permission or order methods.
 *
 * Both functions accept SYNTHETIC-only complete candle observations and return
 * research comparisons, NEVER tradeable signals. Parameters are deliberately
 * caller-explicit so none of the unresolved rules becomes a hidden default.
 */
const POLICY = 'NON_CANONICAL_RESEARCH'
const DECIMAL = /^(?:0|[1-9]\d{0,17})(?:\.\d{1,12})?$/
const SCALE = BigInt('1000000000000')
const VALID_TIMEFRAMES = Object.freeze({ '1m': 1, '5m': 5, '15m': 15 })
const ABS = x => x < 0n ? -x : x
const result = (status, reason, details = {}) =>
  Object.freeze({ policy: POLICY, status, reason, tradePermitted: false, ...details })

function decimal(raw) {
  if (typeof raw !== 'string' || !DECIMAL.test(raw)) return null
  const [whole, fraction = ''] = raw.split('.')
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(12, '0') || '0')
}
function time(raw) {
  if (typeof raw !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(raw)) return null
  const ms = Date.parse(raw)
  return Number.isFinite(ms) && new Date(ms).toISOString() === raw ? ms : null
}
function barsOf(series, requiredTf = null) {
  if (!series || series.source !== 'SYNTHETIC' ||
      series.calendar !== 'SYNTHETIC_CONTIGUOUS' || series.settled !== true)
    return { error: 'UNSETTLED_OR_REAL_SOURCE' }
  const period = VALID_TIMEFRAMES[series.timeframe]
  if (!period || (requiredTf && !requiredTf.includes(series.timeframe)))
    return { error: 'UNSUPPORTED_TIMEFRAME' }
  if (typeof series.contractId !== 'string' || !/^SYN-[A-Z0-9-]+$/.test(series.contractId))
    return { error: 'UNVERIFIED_CONTRACT_ID' }
  if (!Array.isArray(series.candles) || !series.candles.length) return { error: 'MISSING_BARS' }
  const candles = []
  for (const [i, c] of series.candles.entries()) {
    if (!c || c.complete !== true) return { error: 'INCOMPLETE_BAR' }
    const at = time(c.openTime)
    const o = decimal(c.open), h = decimal(c.high), l = decimal(c.low), cl = decimal(c.close)
    if (at === null || at % (period * 60000) !== 0 ||
        [o,h,l,cl].some(x => x === null) || l > h || o < l || o > h || cl < l || cl > h)
      return { error: 'INVALID_EXACT_BAR' }
    if (i && at - candles[i-1].at !== period * 60000)
      return { error: 'SYNTHETIC_GAP_OR_REORDER' }
    candles.push({ at, closesAt: at + period * 60000, o, h, l, c: cl })
  }
  return { bars: candles, periodMs: period * 60000 }
}

function validTickAlignment(bars, tick) {
  if (tick === null || tick <= 0n) return false
  return bars.every(c => [c.o,c.h,c.l,c.c].every(p => p % tick === 0n))
}

/**
 * GATE-03: compare TWO STRICT, CONFIRMED swing pivots in one synthetic series.
 * toleranceTicks and inclusive are explicit competing research parameters.
 * No peak/tie pairing, max lookback or cluster rule is approved here.
 */
export function compareEqualPivots(input) {
  const { series, kind, firstIndex, secondIndex, toleranceTicks, inclusive, observedThrough, tickSize } = input || {}
  if (!['HIGH','LOW'].includes(kind) || !Number.isInteger(toleranceTicks) ||
      toleranceTicks < 0 || toleranceTicks > 100 || typeof inclusive !== 'boolean')
    return result('UNKNOWN','UNAPPROVED_OR_INVALID_PARAMETERS')
  if (!series || !['NQ','MNQ','ES'].includes(series.root))
    return result('UNKNOWN','UNVERIFIED_ROOT')
  const decoded = barsOf(series,['5m','15m'])
  if (decoded.error) return result('UNKNOWN',decoded.error)
  const tick = decimal(tickSize)
  if (!validTickAlignment(decoded.bars,tick))
    return result('UNKNOWN','MISSING_OR_INVALID_SYNTHETIC_TICK_METADATA')
  const {bars,periodMs} = decoded
  if (!Number.isInteger(firstIndex) || !Number.isInteger(secondIndex) ||
      firstIndex < 1 || secondIndex <= firstIndex || secondIndex >= bars.length - 1)
    return result('UNKNOWN','UNCONFIRMED_OR_INVALID_PIVOT_INDEX')
  const through = time(observedThrough)
  if (through === null || bars[secondIndex+1].closesAt > through)
    return result('UNKNOWN','FUTURE_PIVOT_CONFIRMATION_UNAVAILABLE')
  function isSwing(i) {
    const key = kind === 'HIGH' ? 'h' : 'l'
    return kind === 'HIGH'
      ? bars[i][key] > bars[i-1][key] && bars[i][key] > bars[i+1][key]
      : bars[i][key] < bars[i-1][key] && bars[i][key] < bars[i+1][key]
  }
  if (!isSwing(firstIndex) || !isSwing(secondIndex))
    return result('UNKNOWN','UNCONFIRMED_STRICT_SWING')
  const a = kind === 'HIGH' ? bars[firstIndex].h : bars[firstIndex].l
  const b = kind === 'HIGH' ? bars[secondIndex].h : bars[secondIndex].l
  const dist = ABS(a - b), threshold = tick * BigInt(toleranceTicks)
  const matched = inclusive ? dist <= threshold : dist < threshold
  return result(matched ? 'EQUAL_RESEARCH' : 'DIFFERENT_RESEARCH','COMPARISON_ONLY',{
    kind, timeframe: series.timeframe, firstIndex, secondIndex,
    toleranceTicks, inclusive, distanceTicks: Number(dist / tick),
    exactTickDistance: dist % tick === 0n,
    confirmedAt: new Date(bars[secondIndex+1].closesAt).toISOString(),
    candidateOnly: true
  })
}

/**
 * GATE-04: an EXPLICIT research pair of NQ and ES reference levels.
 * This is NOT an algorithm for selecting corresponding real-market swings.
 * The pair must carry a matching research ID and compatible timeframe,
 * contract identity, high/low kind and timestamp policy. Observations must
 * be aligned and COMPLETE across both sources, or result is UNKNOWN.
 */
export function inspectSmtPair(input) {
  const { nq, es, nqRef, esRef, kind, evaluationAt, maxReferenceDeltaMinutes, crossing } = input || {}
  if (!['HIGH','LOW'].includes(kind) ||
      !['WICK','CLOSE'].includes(crossing) ||
      !Number.isInteger(maxReferenceDeltaMinutes) ||
      maxReferenceDeltaMinutes < 0 || maxReferenceDeltaMinutes > 30)
    return result('UNKNOWN','UNAPPROVED_OR_INVALID_PARAMETERS')
  if (!nq || !es || nq.root !== 'NQ' || es.root !== 'ES')
    return result('UNKNOWN','UNVERIFIED_INSTRUMENT_PAIR')
  const l=barsOf(nq), r=barsOf(es)
  if (l.error || r.error) return result('UNKNOWN',l.error || r.error)
  if (nq.timeframe !== es.timeframe) return result('UNKNOWN','TIMEFRAME_MISMATCH')
  if (!nqRef || !esRef || typeof nqRef.pairId !== 'string' ||
      !/^SYNPAIR-[A-Z0-9-]+$/.test(nqRef.pairId) || nqRef.pairId !== esRef.pairId ||
      nqRef.kind !== kind || esRef.kind !== kind ||
      nqRef.contractId !== nq.contractId || esRef.contractId !== es.contractId ||
      nqRef.timeframe !== nq.timeframe || esRef.timeframe !== es.timeframe)
    return result('UNKNOWN','UNVERIFIED_EXPLICIT_REFERENCE_PAIR')
  const leftLevel=decimal(nqRef.price), rightLevel=decimal(esRef.price)
  const leftConfirmed=time(nqRef.confirmedAt), rightConfirmed=time(esRef.confirmedAt)
  const observed=time(evaluationAt)
  if (leftLevel === null || rightLevel === null || leftConfirmed === null ||
      rightConfirmed === null || observed === null)
    return result('UNKNOWN','INVALID_REFERENCE_OR_EVALUATION_TIME')
  if (ABS(BigInt(leftConfirmed - rightConfirmed)) > BigInt(maxReferenceDeltaMinutes * 60000))
    return result('UNKNOWN','REFERENCE_TIMING_POLICY_NOT_MET')
  if (observed <= Math.max(leftConfirmed,rightConfirmed))
    return result('UNKNOWN','REFERENCE_NOT_YET_KNOWN')
  if (l.bars.length !== r.bars.length || l.bars.some((c,i) => c.at !== r.bars[i].at))
    return result('UNKNOWN','UNPAIRED_OR_MISSING_MARKET_BARS')
  if (l.bars[0].at < Math.max(leftConfirmed,rightConfirmed))
    return result('UNKNOWN','OBSERVATION_PRECEDES_REFERENCE_CONFIRMATION')
  const finalClose=l.bars[l.bars.length-1].closesAt
  if (finalClose !== observed)
    return result('UNKNOWN','INCOMPLETE_OR_STALE_COMPARISON_WINDOW')
  const swept = (bar, level) => kind === 'HIGH'
    ? (crossing === 'WICK' ? bar.h > level : bar.c > level)
    : (crossing === 'WICK' ? bar.l < level : bar.c < level)
  const nqSweep = l.bars.some(bar => swept(bar,leftLevel))
  const esSweep = r.bars.some(bar => swept(bar,rightLevel))
  return result(nqSweep !== esSweep ? 'DIVERGENCE_RESEARCH' : 'NO_DIVERGENCE_OBSERVED_RESEARCH',
    'EXPLICIT_SYNTHETIC_PAIR_ONLY', {
      pairId:nqRef.pairId, timeframe:nq.timeframe, kind, crossing,
      nqSwept:nqSweep, esSwept:esSweep,
      side:nqSweep !== esSweep ? (nqSweep ? 'NQ_ONLY' : 'ES_ONLY') : null,
      evaluatedAt:new Date(observed).toISOString(), candidateOnly:true
    })
}
