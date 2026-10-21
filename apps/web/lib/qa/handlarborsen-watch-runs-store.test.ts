import {afterEach,describe,it,expect,vi} from 'vitest'
import {createWatchRunJournal,isWatchRunJournalEnabled} from '@/lib/atlas/project-analytics/handlarborsen-watch-runs-store'
const project='8f673c09-1c8f-4d78-876e-4c14bf1c89b3',id='11111111-1111-4111-8111-111111111111',token='22222222-2222-4222-8222-222222222222'
const row={id,project_id:project,kind:'known_sources_weekly',period_start:'2026-10-12',status:'queued',revision:0,http_request_count:null}
function fixture(){
 const rpc=vi.fn(async(_name:string,_args:Record<string,unknown>):Promise<{data:unknown;error:unknown}>=>({data:{outcome:'queued',run:row},error:null as unknown}))
 const db=vi.fn(()=>({rpc})),enabled=vi.fn(()=>true)
 return {rpc,db,enabled,journal:createWatchRunJournal({db,enabled})}
}
afterEach(()=>vi.unstubAllEnvs())
describe('disabled server-only watch journal adapter',()=>{
 it.each(['enqueue','claim','finish'] as const)('rejects a valid receipt from a different operation: %s',async operation=>{
  const f=fixture()
  f.rpc.mockResolvedValue({data:{outcome:operation==='claim'?'finished':'claimed',run:{...row,status:operation==='claim'?'succeeded':'running',revision:operation==='claim'?2:1,http_request_count:operation==='claim'?1:null}},error:null})
  const result=operation==='enqueue'?await f.journal.enqueue(new Date('2026-10-17T19:00:00Z'))
   :operation==='claim'?await f.journal.claim(id,token)
   :await f.journal.finish({id,claimToken:token,expectedRevision:1,state:'succeeded',outcome:'verified',httpRequestCount:1,evidenceDigest:'a'.repeat(64)})
  expect(result).toEqual({status:'unknown',executionAllowed:false})
  expect(f.rpc).toHaveBeenCalledTimes(1)
 })

 it.each([undefined,'false','1','TRUE',' true '])('requires the exact approved flag value %s',value=>{
  vi.stubEnv('HANDLARBORSEN_WATCH_RUN_JOURNAL_ENABLED',value)
  expect(isWatchRunJournalEnabled()).toBe(false)
 })
 it('recognizes exact true without configuring any scheduler',()=>{
  vi.stubEnv('HANDLARBORSEN_WATCH_RUN_JOURNAL_ENABLED','true')
  expect(isWatchRunJournalEnabled()).toBe(true)
 })
 it('performs no DB construction or RPC while disabled',async()=>{
  const f=fixture();f.enabled.mockReturnValue(false)
  for(const result of [await f.journal.enqueue(new Date()),await f.journal.claim(id,token),await f.journal.finish({} as any)])
   expect(result).toEqual({status:'disabled',executionAllowed:false})
  expect(f.db).not.toHaveBeenCalled();expect(f.rpc).not.toHaveBeenCalled()
 })
 it('binds project and derives the canonical weekly identity',async()=>{
  const f=fixture()
  expect(await f.journal.enqueue(new Date('2026-10-17T19:00:00Z'))).toMatchObject({status:'ok',outcome:'queued',executionAllowed:false})
  expect(f.rpc).toHaveBeenCalledWith('handlarborsen_watch_enqueue_v1',{p_project_id:project,p_period_start:'2026-10-12'})
 })
 it('claims once with a bounded lease and strips any extra authority/token',async()=>{
  const f=fixture();f.rpc.mockResolvedValue({data:{outcome:'claimed',run:{...row,status:'running',revision:1,claim_token:token},executionAllowed:true},error:null} as any)
  const result=await f.journal.claim(id,token)
  expect(result).toMatchObject({status:'ok',outcome:'claimed',executionAllowed:false})
  expect(JSON.stringify(result)).not.toContain(token)
  expect(f.rpc).toHaveBeenCalledWith('handlarborsen_watch_claim_v1',{p_project_id:project,p_run_id:id,p_claim_token:token,p_lease_seconds:180})
 })
 it('validates input before constructing a database connection',async()=>{
  const f=fixture()
  expect((await f.journal.enqueue(new Date(NaN))).status).toBe('invalid')
  expect((await f.journal.claim('bad',token)).status).toBe('invalid')
  expect((await f.journal.finish({id,claimToken:token,httpRequestCount:11} as any)).status).toBe('invalid')
  expect(f.db).not.toHaveBeenCalled()
 })
 it('sends bounded finish metadata and never interprets it as dispatch authority',async()=>{
  const f=fixture();f.rpc.mockResolvedValue({data:{outcome:'finished',run:{...row,status:'succeeded',revision:2,http_request_count:2}},error:null})
  expect(await f.journal.finish({id,claimToken:token,expectedRevision:1,state:'succeeded',outcome:'verified',httpRequestCount:2,evidenceDigest:'a'.repeat(64)})).toMatchObject({status:'ok',outcome:'finished',executionAllowed:false})
  expect(f.rpc.mock.calls[0]).toEqual(['handlarborsen_watch_finish_v1',{p_project_id:project,p_run_id:id,p_claim_token:token,p_expected_revision:1,p_state:'succeeded',p_outcome:'verified',p_http_count:2,p_evidence_digest:'a'.repeat(64)}])
 })
 it('does not retry an unknown transport acknowledgement or leak database errors',async()=>{
  const f=fixture();f.rpc.mockRejectedValue(Error('private database diagnostic'))
  expect(await f.journal.claim(id,token)).toEqual({status:'unknown',executionAllowed:false})
  expect(f.rpc).toHaveBeenCalledTimes(1)
 })
 it('rejects malformed, mismatched and error receipts without retry',async()=>{
  const f=fixture();f.rpc.mockResolvedValue({data:{outcome:'queued',run:{...row,period_start:'2026-10-19'}},error:null})
  expect((await f.journal.enqueue(new Date('2026-10-17T19:00:00Z'))).status).toBe('unknown')
  f.rpc.mockResolvedValue({data:null as any,error:{message:'private'}})
  expect(await f.journal.claim(id,token)).toEqual({status:'unknown',executionAllowed:false})
  expect(f.rpc).toHaveBeenCalledTimes(2)
 })
})
