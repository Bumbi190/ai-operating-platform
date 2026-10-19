/**
 * OFFLINE RESEARCH ONLY — not part of Omnira's canonical trading runtime.
 *
 * Investigates two candidate interpretations of iFVG and CISD.
 * NO imports from apps/web, NO broker/network calls, NO strategy signals,
 * NO approval or trade paths. Synthetic one-minute OHLC only.
 *
 * Every choice here is explicitly NON-CANONICAL. Do not import this module
 * into Strategy Engine, Risk Engine, replay runtime or an execution gateway.
 */
const RESEARCH_ONLY = 'NON_CANONICAL_RESEARCH'
const DECIMAL = /^(?:0|[1-9]\d{0,17})(?:\.\d{1,12})?$/

function asScaledPrice(text) {
  if (typeof text !== 'string' || !DECIMAL.test(text)) return null
  const parts = text.split('.')
  const frac = (parts[1] || '').padEnd(12, '0')
  return BigInt(parts[0]) * BigInt('1000000000000') + BigInt(frac)
}

function strictMinute(openTime) {
  if (typeof openTime !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:00\.000Z$/.test(openTime)) return null
  const n = Date.parse(openTime)
  return Number.isFinite(n) && new Date(n).toISOString() === openTime && n % 60000 === 0 ? n : null
}

function fail(reason) {
  return Object.freeze({ status: 'INDETERMINATE', policy: RESEARCH_ONLY, reason, observations: [], ambiguities: [] })
}

/**
 * The strict synthetic adapter prevents this research harness from silently
 * accepting real market data and presenting guesses as actionable signals.
 * Continuity is REQUIRED here only because fixtures are synthetic; real
 * exchange calendars can legitimately contain gaps and need a separate source.
 */
function normalizeDataset(data) {
  if (!data || data.source !== 'SYNTHETIC' || data.calendar !== 'SYNTHETIC_CONTIGUOUS' || data.settled !== true) {
    return { reason: 'SYNTHETIC_SETTLED_SOURCE_REQUIRED' }
  }
  if (!Array.isArray(data.candles) || !data.candles.length) return { reason: 'MISSING_CANDLES' }
  const bars = []
  for (let i = 0; i < data.candles.length; i++) {
    const c = data.candles[i]
    if (!c || c.complete !== true) return { reason: 'INCOMPLETE_CANDLE' }
    const t = strictMinute(c.openTime)
    if (t === null || (i > 0 && t - bars[i - 1].t !== 60000)) return { reason: 'INVALID_OR_NONCONTIGUOUS_TIME' }
    const o = asScaledPrice(c.open)
    const h = asScaledPrice(c.high)
    const l = asScaledPrice(c.low)
    const cl = asScaledPrice(c.close)
    if ([o, h, l, cl].some((v) => v === null) || h < l || o < l || o > h || cl < l || cl > h) {
      return { reason: 'INVALID_EXACT_OHLC' }
    }
    bars.push({ t, o, h, l, c: cl })
  }
  return { bars }
}

function validateCutoff(time) {
  if (typeof time !== 'string') return null
  const n = Date.parse(time)
  return Number.isFinite(n) && new Date(n).toISOString() === time ? n : null
}

function appendEvent(observations, ambiguities, events, i, bars) {
  if (events.length > 1) {
    ambiguities.push({ candleIndex: i, at: new Date(bars[i].t + 60000).toISOString(), reason: 'MULTIPLE_CANDIDATES', candidateIds: events.map((e) => e.id) })
    return
  }
  if (events.length === 1) observations.push(events[0])
}

/**
 * Base FVG research variants:
 * bearish base gap: c1.low > c3.high; inverted bullish if a LATER candle
 * closes above upper edge (or merely wicks above it in the alternate variant).
 * bullish base gap: c1.high < c3.low; inverted bearish by the mirror image.
 * No retrace, volume, displacement or size filter is silently added.
 */
export function inspectIfvg(data, { manipulationCompleteAt, crossing = 'CLOSE_BEYOND_FAR_EDGE', formation = 'ANY' } = {}) {
  if (!['CLOSE_BEYOND_FAR_EDGE', 'WICK_BEYOND_FAR_EDGE'].includes(crossing) || !['ANY', 'AFTER_MANIPULATION'].includes(formation)) return fail('UNAPPROVED_RESEARCH_VARIANT')
  const normalized = normalizeDataset(data)
  if (normalized.reason) return fail(normalized.reason)
  const cutoff = validateCutoff(manipulationCompleteAt)
  if (cutoff === null) return fail('INVALID_MANIPULATION_TIMESTAMP')
  const { bars } = normalized
  const zones = []
  const observations = []
  const ambiguities = []
  for (let i = 0; i < bars.length; i++) {
    if (i >= 2) {
      const a = bars[i - 2]
      const c = bars[i]
      const formedAt = c.t + 60000
      if (formation === 'ANY' || formedAt > cutoff) {
        if (a.l > c.h) zones.push({ id: 'BEAR_GAP_' + i, side: 'LONG', low: c.h, high: a.l, from: i, consumed: false })
        if (a.h < c.l) zones.push({ id: 'BULL_GAP_' + i, side: 'SHORT', low: a.h, high: c.l, from: i, consumed: false })
      }
    }
    const closeAt = bars[i].t + 60000
    if (closeAt <= cutoff) continue
    const current = bars[i]
    const events = []
    for (const zone of zones) {
      if (zone.consumed || i <= zone.from) continue
      const previous = bars[i - 1]
      const crossed = zone.side === 'LONG'
        ? (crossing === 'CLOSE_BEYOND_FAR_EDGE' ? current.c > zone.high : current.h > zone.high)
        : (crossing === 'CLOSE_BEYOND_FAR_EDGE' ? current.c < zone.low : current.l < zone.low)
      const notBeyondPreviously = zone.side === 'LONG' ? previous.c <= zone.high : previous.c >= zone.low
      if (!crossed || !notBeyondPreviously) continue
      zone.consumed = true
      events.push({
        id: zone.id, interpretation: crossing, side: zone.side,
        candleIndex: i, at: new Date(closeAt).toISOString(),
        formationIndex: zone.from, entryPermitted: false
      })
    }
    appendEvent(observations, ambiguities, events, i, bars)
  }
  return { status: 'RESEARCH_OBSERVATIONS_ONLY', policy: RESEARCH_ONLY, variant: crossing, observations, ambiguities }
}

function color(bar) {
  if (bar.c > bar.o) return 'BULL'
  if (bar.c < bar.o) return 'BEAR'
  return 'DOJI'
}

/**
 * CISD contrast only. FIRST_RUN_OPEN and LAST_RUN_OPEN intentionally
 * disagree on some test cases; neither is adopted as the trading rule.
 * A run consists of contiguous down-close bars for a long candidate, or
 * up-close bars for a short candidate. Dojis explicitly block research.
 */
export function inspectCisd(data, { manipulationCompleteAt, anchor = 'FIRST_RUN_OPEN' } = {}) {
  if (!['FIRST_RUN_OPEN', 'LAST_RUN_OPEN'].includes(anchor)) return fail('UNAPPROVED_RESEARCH_VARIANT')
  const normalized = normalizeDataset(data)
  if (normalized.reason) return fail(normalized.reason)
  const cutoff = validateCutoff(manipulationCompleteAt)
  if (cutoff === null) return fail('INVALID_MANIPULATION_TIMESTAMP')
  const { bars } = normalized
  if (bars.some((bar) => color(bar) === 'DOJI')) return fail('DOJI_SEMANTICS_UNRESOLVED')
  const observations = []
  const ambiguities = []
  const consumed = new Set()
  for (let i = 1; i < bars.length; i++) {
    const closeAt = bars[i].t + 60000
    if (closeAt <= cutoff) continue
    const events = []
    for (const side of ['LONG', 'SHORT']) {
      const opposing = side === 'LONG' ? 'BEAR' : 'BULL'
      let runEnd = i - 1
      while (runEnd >= 0 && color(bars[runEnd]) !== opposing) runEnd--
      if (runEnd < 0) continue
      let runStart = runEnd
      while (runStart > 0 && color(bars[runStart - 1]) === opposing) runStart--
      const reference = bars[anchor === 'FIRST_RUN_OPEN' ? runStart : runEnd].o
      const previous = bars[i - 1].c
      const crossed = side === 'LONG'
        ? (previous <= reference && bars[i].c > reference)
        : (previous >= reference && bars[i].c < reference)
      const id = side + '_RUN_' + runStart + '_' + runEnd
      if (crossed && !consumed.has(id)) {
        consumed.add(id)
        events.push({ id, interpretation: anchor, side, candleIndex: i,
          at: new Date(closeAt).toISOString(), runStart, runEnd, entryPermitted: false })
      }
    }
    appendEvent(observations, ambiguities, events, i, bars)
  }
  return { status: 'RESEARCH_OBSERVATIONS_ONLY', policy: RESEARCH_ONLY, variant: anchor, observations, ambiguities }
}
