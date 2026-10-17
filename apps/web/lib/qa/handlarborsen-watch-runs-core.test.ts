import {describe,it,expect} from 'vitest'
import {weeklyWatchPeriod,parseWatchRunReply,validWatchFinish} from '@/lib/atlas/project-analytics/handlarborsen-watch-runs-core'
const project='8f673c09-1c8f-4d78-876e-4c14bf1c89b3',id='11111111-1111-4111-8111-111111111111'
const run=()=>({id,project_id:project,kind:'known_sources_weekly',period_start:'2026-10-12',status:'queued',revision:0,http_request_count:null})
describe('weekly watch journal contracts',()=>{
  it.each([
    ['2026-10-17T19:00:00Z','2026-10-12'],
    ['2026-10-18T21:59:59Z','2026-10-12'],['2026-10-18T22:00:00Z','2026-10-19'],
    ['2026-03-29T21:59:59Z','2026-03-23'],['2026-03-29T22:00:00Z','2026-03-30'],
    ['2026-10-25T22:59:59Z','2026-10-19'],['2026-10-25T23:00:00Z','2026-10-26'],
    ['2027-01-01T12:00:00Z','2026-12-28'],
  ])('uses the Stockholm business week for %s',(instant,period)=>expect(weeklyWatchPeriod(new Date(instant))).toBe(period))
  it('rejects an invalid clock',()=>expect(weeklyWatchPeriod(new Date(NaN))).toBeNull())
  it('whitelists safe receipt fields and cannot grant execution',()=>{
    const result=parseWatchRunReply({outcome:'queued',run:{...run(),claim_token:'private',executionAllowed:true}}, {period:'2026-10-12'})
    expect(result).toEqual({status:'ok',outcome:'queued',run:{id,periodStart:'2026-10-12',state:'queued',revision:0,httpRequestCount:null},executionAllowed:false})
    expect(JSON.stringify(result)).not.toMatch(/claim_token|private|project_id/)
  })
  it.each([
    {outcome:'queued',run:{...run(),project_id:'foreign'}},
    {outcome:'queued',run:{...run(),period_start:'2026-10-13'}},
    {outcome:'queued',run:{...run(),kind:'external_search'}},
    {outcome:'claimed',run:{...run(),status:'surprise'}},
    {outcome:'queued',run:{...run(),revision:99}},
    {outcome:'queued',run:{...run(),revision:1}},
    {outcome:'queued',run:{...run(),http_request_count:0}},
    {outcome:'queued',run:{...run(),http_request_count:11}},
    {outcome:'run_provider_now',run:run()},
  ])('keeps malformed or foreign receipts unknown',raw=>expect(parseWatchRunReply(raw,{period:'2026-10-12'})).toEqual({status:'unknown',executionAllowed:false}))
  it('binds returned run and period to the requested identity',()=>{
    expect(parseWatchRunReply({outcome:'queued',run:run()},{id:'22222222-2222-4222-8222-222222222222'}).status).toBe('unknown')
    expect(parseWatchRunReply({outcome:'queued',run:run()},{period:'2026-10-19'}).status).toBe('unknown')
    expect(parseWatchRunReply({outcome:'not_found',run:null},{id}).status).toBe('ok')
  })
  it('accepts bounded completion metadata and requires evidence for success',()=>{
    const base={id,claimToken:id,expectedRevision:1,state:'succeeded',outcome:'verified',httpRequestCount:10,evidenceDigest:'a'.repeat(64)}
    expect(validWatchFinish(base)).toBe(true)
    for(const mutation of [{httpRequestCount:11},{httpRequestCount:-1},{expectedRevision:2},{evidenceDigest:null},{state:'running'},{claimToken:'bad'}])
      expect(validWatchFinish({...base,...mutation})).toBe(false)
    expect(validWatchFinish({...base,state:'failed',outcome:'gate_refused',httpRequestCount:1,evidenceDigest:null})).toBe(false)
    expect(validWatchFinish({...base,state:'failed',outcome:'gate_refused',httpRequestCount:0,evidenceDigest:null})).toBe(true)
  })
})
