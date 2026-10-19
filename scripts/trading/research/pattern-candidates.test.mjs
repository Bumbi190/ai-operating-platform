import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectIfvg, inspectCisd } from './pattern-candidates.mjs'

const baseTime = Date.parse('2026-10-15T14:00:00.000Z')
const t = (i) => new Date(baseTime + i * 60000).toISOString()
const cutoff = t(0)

function series(rows) {
  return {
    source: 'SYNTHETIC', calendar: 'SYNTHETIC_CONTIGUOUS', settled: true,
    candles: rows.map(([open, high, low, close], i) => ({
      openTime: t(i), open: String(open), high: String(high), low: String(low),
      close: String(close), complete: true
    }))
  }
}
const inverseBearGap = [
  ['105', '106', '104', '104.5'],
  ['102', '103', '100', '101'],
  ['99', '100', '98', '99'],
  ['99', '106', '99', '105']
]
const cisdBars = [
  ['104', '105', '101', '102'],
  ['102', '103', '99', '100'],
  ['100', '104', '100', '103'],
  ['103', '106', '102', '105']
]

test('IFVG-01: research candidate only after three finished gap candles and later close', () => {
  const r = inspectIfvg(series(inverseBearGap), { manipulationCompleteAt: cutoff })
  assert.equal(r.status, 'RESEARCH_OBSERVATIONS_ONLY')
  assert.equal(r.observations.length, 1)
  assert.equal(r.observations[0].side, 'LONG')
  assert.equal(r.observations[0].formationIndex, 2)
  assert.equal(r.observations[0].candleIndex, 3)
  assert.equal(r.observations[0].at, t(4))
  assert.equal(r.observations[0].entryPermitted, false)
})

test('IFVG-02: wick variant and close variant DIFFER on the same source', () => {
  const rows = [...inverseBearGap.slice(0, 3),
    ['99', '105', '99', '103'],
    ['103', '106', '102', '105']]
  const data = series(rows)
  const close = inspectIfvg(data, { manipulationCompleteAt: cutoff, crossing: 'CLOSE_BEYOND_FAR_EDGE' })
  const wick = inspectIfvg(data, { manipulationCompleteAt: cutoff, crossing: 'WICK_BEYOND_FAR_EDGE' })
  assert.equal(close.observations.find(e => e.id === 'BEAR_GAP_2')?.candleIndex, 4)
  assert.equal(wick.observations.find(e => e.id === 'BEAR_GAP_2')?.candleIndex, 3)
})

test('IFVG boundary: close equal to far edge is not a strict inversion', () => {
  const rows = [...inverseBearGap.slice(0,3), ['99', '105', '99', '104']]
  assert.equal(inspectIfvg(series(rows), { manipulationCompleteAt: cutoff }).observations.length, 0)
})

test('IFVG-03: incomplete candle, hole in chronology and non-synthetic data fail closed', () => {
  const data = series(inverseBearGap)
  assert.equal(inspectIfvg({...data,candles:data.candles.map((c,i)=>i===3?{...c,complete:false}:c)},{manipulationCompleteAt:cutoff}).status, 'INDETERMINATE')
  assert.equal(inspectIfvg({...data,candles:[data.candles[0],data.candles[1],data.candles[3]]},{manipulationCompleteAt:cutoff}).reason, 'INVALID_OR_NONCONTIGUOUS_TIME')
  assert.equal(inspectIfvg({...data,source:'REAL_CME'},{manipulationCompleteAt:cutoff}).reason, 'SYNTHETIC_SETTLED_SOURCE_REQUIRED')
  assert.equal(inspectIfvg({...data,settled:false},{manipulationCompleteAt:cutoff}).observations.length, 0)
})

test('IFVG-04: more than one inverted gap on a candle is ambiguous, not auto-selected', () => {
  const data = series([
    ['110','111','108','109'],
    ['107','108','106','107'],
    ['100','101','99','100'],
    ['98','99','97','98'],
    ['98','112','97','110']
  ])
  const r = inspectIfvg(data, { manipulationCompleteAt: cutoff })
  assert.equal(r.observations.length, 0)
  assert.equal(r.ambiguities.length, 1)
  assert.deepEqual(r.ambiguities[0].candidateIds.sort(), ['BEAR_GAP_2','BEAR_GAP_3'])
})

test('IFVG-PARITY: replay prefixes never borrow a future confirmation', () => {
  const full = series(inverseBearGap)
  for (const n of [1,2,3]) {
    assert.equal(inspectIfvg({...full,candles:full.candles.slice(0,n)}, {manipulationCompleteAt:cutoff}).observations.length, 0)
  }
  assert.equal(inspectIfvg(full, {manipulationCompleteAt:cutoff}).observations[0].candleIndex, 3)
})

test('CISD-01: first-run-open candidate and last-run-open candidate have different timing', () => {
  const data = series(cisdBars)
  const first = inspectCisd(data,{manipulationCompleteAt:cutoff,anchor:'FIRST_RUN_OPEN'})
  const last = inspectCisd(data,{manipulationCompleteAt:cutoff,anchor:'LAST_RUN_OPEN'})
  assert.equal(first.observations.find(e=>e.side==='LONG')?.candleIndex,3)
  assert.equal(last.observations.find(e=>e.side==='LONG')?.candleIndex,2)
  assert.equal(first.observations.find(e=>e.side==='LONG')?.at,t(4))
  assert.equal(first.observations.every(e=>e.entryPermitted===false),true)
})

test('CISD-02: a doji is not assigned a candle-run rule implicitly', () => {
  const data=series([...cisdBars.slice(0,2),['100','104','99','100'],...cisdBars.slice(3)])
  const result=inspectCisd(data,{manipulationCompleteAt:cutoff})
  assert.equal(result.status,'INDETERMINATE')
  assert.equal(result.reason,'DOJI_SEMANTICS_UNRESOLVED')
  assert.equal(result.observations.length,0)
})

test('CISD equal-price close does not cross; a later full close can cross', () => {
  const rows=[...cisdBars.slice(0,2),['100','105','100','104'],['104','106','103','105']]
  const r=inspectCisd(series(rows),{manipulationCompleteAt:cutoff,anchor:'FIRST_RUN_OPEN'})
  assert.equal(r.observations.find(e=>e.side==='LONG')?.candleIndex,3)
})

test('CISD-PARITY: no candidate before the confirming bar is actually closed', () => {
  const full=series(cisdBars)
  const partial={...full,candles:full.candles.slice(0,3)}
  assert.equal(inspectCisd(partial,{manipulationCompleteAt:cutoff,anchor:'FIRST_RUN_OPEN'}).observations.filter(e=>e.side==='LONG').length,0)
  const incomplete={...full,candles:full.candles.map((e,i)=>i===3?{...e,complete:false}:e)}
  assert.equal(inspectCisd(incomplete,{manipulationCompleteAt:cutoff}).status,'INDETERMINATE')
})

test('both research functions refuse invalid time, binary floating point and unknown variant', () => {
  const data=series(inverseBearGap)
  assert.equal(inspectIfvg(data,{manipulationCompleteAt:'2026-13-01T00:00:00.000Z'}).status,'INDETERMINATE')
  assert.equal(inspectCisd(data,{manipulationCompleteAt:cutoff,anchor:'GUESS'}).status,'INDETERMINATE')
  assert.equal(inspectIfvg(series([['100','101','99',100.25]]),{manipulationCompleteAt:cutoff}).status,'INDETERMINATE')
  assert.equal(inspectIfvg({...data,candles:data.candles.map((e,i)=>i===3?{...e,close:'1.00e3'}:e)},{manipulationCompleteAt:cutoff}).reason,'INVALID_EXACT_OHLC')
})

test('research outputs contain no grant, order id or execute callback', () => {
  for (const res of [
    inspectIfvg(series(inverseBearGap),{manipulationCompleteAt:cutoff}),
    inspectCisd(series(cisdBars),{manipulationCompleteAt:cutoff})
  ]) {
    const text=JSON.stringify(res)
    assert.equal(text.includes('ExecutionIntent'),false)
    assert.equal(text.includes('RiskClearance'),false)
    assert.equal(res.policy,'NON_CANONICAL_RESEARCH')
  }
})
