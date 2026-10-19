/**
 * Offline smoke/regression suite for the ACTUAL C3C TypeScript source.
 * Node >=22.22 only (built-in TS stripping and synchronous resolution hooks).
 * No npm install, API, broker, account, calendar provider, or test environment.
 *
 * node --experimental-strip-types --test \
 *   apps/web/lib/trading/market-data/historical-contract-source.node-check.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('.') || /\.[cm]?[jt]s$/.test(specifier)) {
      return nextResolve(specifier, context)
    }
    const root = new URL(specifier, context.parentURL)
    const tsFile = new URL(root.href + '.ts')
    if (existsSync(fileURLToPath(tsFile))) return nextResolve(specifier + '.ts', context)
    const tsIndex = new URL(root.href.replace(/\/?$/, '/') + 'index.ts')
    if (existsSync(fileURLToPath(tsIndex))) return nextResolve(specifier.replace(/\/?$/, '/') + 'index.ts', context)
    return nextResolve(specifier, context)
  },
})

const { inspectHistoricalContractResult, readHistoricalContractChunk } =
  await import('./historical-contract-source.ts')

const contract = { root: 'NQ', cycle: { year: 2026, quarterMonth: 3 } }
const from = '2026-01-15T07:00:00Z'
const to = '2026-01-15T07:05:00Z'
const req = Object.freeze({ contract, timeframe:'1m', from, to })
const candle = (openTime = from, overrides = {}) => ({
  openTime, open:'100.0', high:'101', low:'99', close:'100.25', volume:null, ...overrides
})
const chunk = (overrides = {}) => ({
  kind:'OBSERVATIONS', contract, coverage:{ from, to }, sourceState:'SETTLED',
  candles:[candle(from)], ...overrides
})
const absent = (overrides = {}) => ({
  kind:'NO_DATA', contract, coverage:{from,to}, sourceState:'SETTLED',
  ...overrides
})
const inspect = (value, request = req) => inspectHistoricalContractResult(request,value)
const assertRejected = (value, problem) => {
  const result = inspect(value)
  assert.equal(result.kind,'INVARIANT_VIOLATION')
  assert.equal(result.problem,problem)
}

test('C3C-01: settled observations accepted as actual one-contract segment, not authority', () => {
  const v=inspect(chunk())
  assert.equal(v.kind,'ACCEPTED')
  assert.equal(v.sourceKind,'OBSERVATIONS')
  assert.equal(v.segment.contract.root,'NQ')
  assert.equal(v.segment.candles[0].openTime,from)
  assert.deepEqual(v.observed.minuteOpenTimes,[from])
  assert.equal(v.observed.sourceState,'SETTLED')
  assert.equal(v.nextRequest,null)
  assert.equal(Object.hasOwn(v,'approval'),false)
  assert.equal(Object.hasOwn(v,'canExecute'),false)
  assert.equal(Object.hasOwn(v,'completeness'),false)
})
test('C3C-02: coverage may be a settled PREFIX with continuation from returned to',()=>{
  const firstTo='2026-01-15T07:02:00Z'
  const v=inspect(chunk({coverage:{from,to:firstTo}}))
  assert.equal(v.kind,'ACCEPTED')
  assert.deepEqual(v.nextRequest,{contract,timeframe:'1m',from:firstTo,to})
  assert.equal(v.observed.sourceState,'SETTLED')
})
test('C3C-03: coverage reached but UNKNOWN never converts to SETTLED',()=>{
  const v=inspect(chunk({sourceState:'UNKNOWN'}))
  assert.equal(v.kind,'ACCEPTED')
  assert.equal(v.sourceState,'UNKNOWN')
  assert.equal(v.nextRequest,null)
})
test('C3C-04: NO_DATA + SETTLED is a real empty observation report, not market closure',()=>{
  const v=inspect(absent())
  assert.equal(v.kind,'ACCEPTED')
  assert.equal(v.sourceKind,'NO_DATA')
  assert.equal(v.segment.candles.length,0)
  assert.deepEqual(v.observed.minuteOpenTimes,[])
  assert.equal(v.observed.sourceState,'SETTLED')
  assert.equal(Object.hasOwn(v,'sessionTruncated'),false)
})
test('C3C-05: NO_DATA + UNKNOWN remains UNKNOWN',()=>{
  const v=inspect(absent({sourceState:'UNKNOWN'}))
  assert.equal(v.kind,'ACCEPTED')
  assert.equal(v.observed.sourceState,'UNKNOWN')
  assert.equal(v.nextRequest,null)
})
test('C3C-06: ordinary source refusal is not technical error or empty data',()=>{
  const v=inspect({kind:'REFUSED',reason:'SOURCE_REQUEST_UNAVAILABLE'})
  assert.equal(v.kind,'REFUSED')
  assert.equal(v.reason,'SOURCE_REQUEST_UNAVAILABLE')
  assert.equal(Object.hasOwn(v,'segment'),false)
})
test('C3C-07: local invariant families pass through explicitly',()=>{
  assertRejected({kind:'INVARIANT_VIOLATION',problem:'CONTRACT_MISMATCH'},'CONTRACT_MISMATCH')
  assertRejected({kind:'INVARIANT_VIOLATION',problem:'INVALID_COVERAGE'},'INVALID_COVERAGE')
})
test('C3C-08: mismatched root or cycle rejects BEFORE segment',()=>{
  assertRejected(chunk({contract:{root:'MNQ',cycle:contract.cycle}}),'CONTRACT_MISMATCH')
  assertRejected(chunk({contract:{root:'NQ',cycle:{year:2026,quarterMonth:6}}}),'CONTRACT_MISMATCH')
})
test('C3C-09: structurally equal contract is accepted without object identity',()=>{
  const v=inspect(chunk({contract:{root:'NQ',cycle:{quarterMonth:3,year:2026}}}))
  assert.equal(v.kind,'ACCEPTED')
})
test('C3C-10: coverage from must equal request from as an instant',()=>{
  assertRejected(chunk({coverage:{from:'2026-01-15T07:01:00Z',to}}),'INVALID_COVERAGE')
  assert.equal(inspect(chunk({coverage:{from:'2026-01-15T07:00:00.000Z',to}})).kind,'ACCEPTED')
})
test('C3C-11: coverage must be positive nonzero and within original to',()=>{
  assertRejected(chunk({coverage:{from,to:from}}),'INVALID_COVERAGE')
  assertRejected(chunk({coverage:{from,to:'2026-01-15T07:06:00Z'}}),'INVALID_COVERAGE')
  assertRejected(chunk({coverage:{from,to:'2026-01-15T06:59:00Z'}}),'INVALID_COVERAGE')
  assertRejected(chunk({coverage:{from,to:'2026-02-30T07:05:00Z'}}),'INVALID_COVERAGE')
})
test('C3C-12: later fraction is later as an instant, not a lexically smaller string',()=>{
  const adjusted={...req,from:'2026-01-15T07:00:00Z',to:'2026-01-15T07:00:00.500Z'}
  const r=inspect(chunk({coverage:{from:adjusted.from,to:adjusted.to},candles:[candle(from)]}), adjusted)
  assert.equal(r.kind,'ACCEPTED')
  assert.equal(r.nextRequest,null)
})
test('C3C-13: an untyped result cannot smuggle empty OBSERVATIONS',()=>{
  assertRejected(chunk({candles:[]}), 'MALFORMED_SOURCE_RESULT')
})
test('C3C-14: NO_DATA must not include an ambiguous candles field',()=>{
  assertRejected({...absent(),candles:[]},'MALFORMED_SOURCE_RESULT')
})
test('C3C-15: missing or fake source state never authorizes settled completeness',()=>{
  assertRejected(chunk({sourceState:'COMPLETE'}),'MALFORMED_SOURCE_RESULT')
  assertRejected(chunk({sourceState:undefined}),'MALFORMED_SOURCE_RESULT')
})
test('C3C-16: malformed exact price, float, volume or extra field fail closed',()=>{
  assertRejected(chunk({candles:[candle(from,{close:1.5})]}),'MALFORMED_SOURCE_RESULT')
  assertRejected(chunk({candles:[candle(from,{close:'1e3'})]}),'MALFORMED_SOURCE_RESULT')
  assertRejected(chunk({candles:[candle(from,{volume:'x'})]}),'MALFORMED_SOURCE_RESULT')
  assertRejected(chunk({candles:[{...candle(from),providerId:'secret'}]}),'MALFORMED_SOURCE_RESULT')
  assertRejected(chunk({candles:[null]}),'MALFORMED_SOURCE_RESULT')
})
test('C3C-17: candle before from or exactly at to uses existing segment refusal',()=>{
  const a=inspect(chunk({candles:[candle('2026-01-15T06:59:00Z')]}))
  assert.equal(a.kind,'SEGMENT_REFUSED')
  assert.equal(a.problem,'CANDLE_BEFORE_WINDOW')
  const b=inspect(chunk({candles:[candle(to)]}))
  assert.equal(b.kind,'SEGMENT_REFUSED')
  assert.equal(b.problem,'CANDLE_AT_OR_AFTER_WINDOW')
})
test('C3C-18: duplicates are not silently deduplicated',()=>{
  const v=inspect(chunk({candles:[candle(from),candle('2026-01-15T07:00:00.000Z')]}))
  assert.equal(v.kind,'SEGMENT_REFUSED')
  assert.equal(v.problem,'DUPLICATE_CANDLE_INSTANT')
})
test('C3C-19: no sorting of unordered candles',()=>{
  const v=inspect(chunk({candles:[candle('2026-01-15T07:02:00Z'),candle('2026-01-15T07:01:00Z')]}))
  assert.equal(v.kind,'SEGMENT_REFUSED')
  assert.equal(v.problem,'UNORDERED_CANDLES')
})
test('C3C-20: malformed caller request cannot leak evidence',()=>{
  const bad={...req,timeframe:'15m'}
  const v=inspect(chunk(),bad)
  assert.equal(v.kind,'INVARIANT_VIOLATION')
  assert.equal(v.problem,'INVALID_REQUEST')
})
test('C3C-21: technical error rejects Promise, does not become NO_DATA/UNKNOWN',async()=>{
  const source={read:async()=>{throw new Error('transport failure')}}
  await assert.rejects(readHistoricalContractChunk(source,req),/transport failure/)
})
test('C3C-22: source can return semantics normally via async method',async()=>{
  const source={read:async()=>absent({sourceState:'UNKNOWN'})}
  const v=await readHistoricalContractChunk(source,req)
  assert.equal(v.kind,'ACCEPTED')
  assert.equal(v.observed.sourceState,'UNKNOWN')
  assert.deepEqual(v.observed.minuteOpenTimes,[])
})
test('C3C-23: unsupported result families remain an invariant, not an error/empty page',()=>{
  assertRejected({kind:'ERROR',message:'network'},'MALFORMED_SOURCE_RESULT')
  assertRejected({kind:'UNAVAILABLE'},'MALFORMED_SOURCE_RESULT')
  assertRejected({kind:'REFUSED',reason:'HTTP_500'},'MALFORMED_SOURCE_RESULT')
  assertRejected({kind:'INVARIANT_VIOLATION',problem:'UNAUTHENTICATED'},'MALFORMED_SOURCE_RESULT')
})
test('C3C-24: exact timestamp text and price text survive boundary unchanged',()=>{
  const raw=chunk({coverage:{from:'2026-01-15T07:00:00.000Z',to},
    candles:[candle('2026-01-15T07:00:00.000Z',{open:'100.000',volume:'0'})]})
  const v=inspect(raw)
  assert.equal(v.kind,'ACCEPTED')
  assert.equal(v.segment.candles[0].open,'100.000')
  assert.equal(v.segment.candles[0].volume,'0')
  assert.equal(v.segment.candles[0].openTime,'2026-01-15T07:00:00.000Z')
  assert.equal(v.coverage.from,'2026-01-15T07:00:00.000Z')
})
