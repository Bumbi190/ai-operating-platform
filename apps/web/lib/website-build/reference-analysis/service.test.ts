import {describe,it,expect,vi,beforeEach} from 'vitest'
import {createHash} from 'node:crypto'
const f=vi.hoisted(()=>({source:vi.fn(),prepare:vi.fn(),quote:vi.fn(),run:vi.fn(),enabled:vi.fn(),table:vi.fn()}))
vi.mock('./source',()=>({readAnalysisSource:f.source,analysisTable:f.table}))
vi.mock('./provider',()=>({prepareAnalysisRequest:f.prepare,quoteAnalysisRequest:f.quote,runAnalysisProvider:f.run,referenceAnalysisEnabled:f.enabled,ANALYSIS_MODEL:'claude-haiku-4-5-20251001',ANALYSIS_MAX_TOKENS:3072}))
import {executeAnalysisAction} from './service'
const id='11111111-1111-4111-8111-111111111111',hash='a'.repeat(64)
const source={projectId:id,conversationId:id,messageId:id}
const owner={ok:true as const,userId:id,allowedProjectIds:[id]}
const result={version:'reference-analysis.v1',observations:[{imageIndex:1,layout:'Luftigt',typography:'Stort',colors:'Blått'}],
 directions:['editorial','visual','structured'].map(key=>({key,title:'Riktning',rationale:'Egen struktur',palette:{background:'#ffffff',foreground:'#162032',accent:'#1e40af'},font:'sans',mobile:'En kolumn'})),uncertainties:['Stillbild.']}
const row=(status='quoted')=>({id,owner_id:id,project_id:id,conversation_id:id,message_id:id,binding_sha256:hash,payload_sha256:hash,
 model:'claude-haiku-4-5-20251001',max_tokens:3072,maximum_sek:2.2613,quote_token:id,quote_expires_at:new Date(Date.now()+600000).toISOString(),status,
 canonical_result:status==='succeeded'?JSON.stringify(result):null,result_sha256:status==='succeeded'?createHash('sha256').update(JSON.stringify(result)).digest('hex'):null})
beforeEach(()=>{vi.clearAllMocks();f.enabled.mockReturnValue(true);f.source.mockResolvedValue({bindingSha256:hash,images:[{}]});f.prepare.mockResolvedValue({payloadSha256:hash,bindingSha256:hash,imageCount:1});f.quote.mockResolvedValue(2.2613);f.run.mockResolvedValue(result)})
describe('reference job orchestration (database RPC/provider boundaries mocked)',()=>{
 it('never dispatches for quote or a concurrent/replayed processing claim',async()=>{
  const rpc=vi.fn().mockResolvedValueOnce({data:row(),error:null}).mockResolvedValueOnce({data:{job:row('processing'),claimed:false},error:null}),db={rpc} as any
  const quote=await executeAnalysisAction(db,owner,{...source,action:'quote'},new AbortController().signal)
  expect(quote.status).toBe('quoted');expect(f.run).not.toHaveBeenCalled()
  const run=await executeAnalysisAction(db,owner,{...source,action:'run',analysisId:id,quoteToken:id,approvedMaximumSek:2.2613},new AbortController().signal)
  expect(run.status).toBe('processing');expect(f.run).not.toHaveBeenCalled()
 })
 it('claims once, persists before disclosure and revalidates source after inference',async()=>{
  const rpc=vi.fn().mockResolvedValueOnce({data:{job:row('processing'),claimed:true,claimToken:id},error:null})
   .mockResolvedValueOnce({data:row('succeeded'),error:null}),db={rpc} as any
  const view=await executeAnalysisAction(db,owner,{...source,action:'run',analysisId:id,quoteToken:id,approvedMaximumSek:2.2613},new AbortController().signal)
  expect(f.run).toHaveBeenCalledTimes(1);expect(rpc.mock.calls.map(c=>c[0])).toEqual(['website_build_reference_analysis_claim','website_build_reference_analysis_finish'])
  expect(f.source).toHaveBeenCalledTimes(2);expect(view.concepts).toHaveLength(3)
 })
 it('records ambiguous provider failure as unknown and never retries',async()=>{
  f.run.mockRejectedValue(Error('network failed after possible dispatch'))
  const rpc=vi.fn().mockResolvedValueOnce({data:{job:row('processing'),claimed:true,claimToken:id},error:null})
   .mockResolvedValueOnce({data:row('unknown'),error:null}),db={rpc} as any
  const view=await executeAnalysisAction(db,owner,{...source,action:'run',analysisId:id,quoteToken:id,approvedMaximumSek:2.2613},new AbortController().signal)
  expect(view.status).toBe('unknown');expect(f.run).toHaveBeenCalledTimes(1)
  expect(rpc.mock.calls[1][1].p_status).toBe('unknown')
 })
 it('denies changed sources and malformed claimed maximum before provider',async()=>{
  f.source.mockRejectedValueOnce(Error('revoked'))
  const rpc=vi.fn()
  await expect(executeAnalysisAction({rpc} as any,owner,{...source,action:'quote'},new AbortController().signal)).rejects.toThrow()
  rpc.mockResolvedValue({data:{job:{...row('processing'),maximum_sek:.01},claimed:true,claimToken:id},error:null})
  await expect(executeAnalysisAction({rpc} as any,owner,{...source,action:'run',analysisId:id,quoteToken:id,approvedMaximumSek:2.2613},new AbortController().signal)).rejects.toThrow()
  expect(f.run).not.toHaveBeenCalled()
 })
})
