import {describe,it,expect,vi,beforeEach} from 'vitest'
import sharp from 'sharp'
const {factory,create,estimate}=vi.hoisted(()=>({factory:vi.fn(),create:vi.fn(),estimate:vi.fn()}))
vi.mock('@/lib/ai/anthropic',()=>({getAnthropic:factory,estimateAnthropicSek:estimate}))
import {prepareAnalysisRequest,runAnalysisProvider,quoteAnalysisRequest,ANALYSIS_MODEL} from './provider'
const sample=()=>({version:'reference-analysis.v1',observations:[{imageIndex:1,layout:'Luftigt',typography:'Stor rubrik',colors:'Blått'}],
 directions:['editorial','visual','structured'].map(key=>({key,title:'Riktning',rationale:'Egen struktur',palette:{background:'#ffffff',foreground:'#162032',accent:'#1e40af'},font:'sans',mobile:'En kolumn'})),
 uncertainties:['Beteenden kan inte verifieras från stillbilder.']})
async function source(){
 const bytes=await sharp({create:{width:2000,height:1800,channels:3,background:'#f5f0e7'}}).webp().toBuffer()
 return {bindingSha256:'a'.repeat(64),messageText:'Gillar luften, undvik logotypen',images:[{bytes}]}
}
beforeEach(()=>{vi.clearAllMocks();factory.mockReturnValue({messages:{create}});estimate.mockResolvedValue(2.26128)})
describe('reference provider boundary (governed factory mocked; no paid inference)',()=>{
 it('downsizes verified images and binds comment, order, policy and exact request bytes',async()=>{
  const input=await source(),a=await prepareAnalysisRequest(input)
  const request=a.params as any
  expect(request.model).toBe(ANALYSIS_MODEL)
  expect(request.max_tokens).toBe(3072)
  const image=request.messages[0].content[0]
  const metadata=await sharp(Buffer.from(image.source.data,'base64')).metadata()
  expect(Math.max(metadata.width!,metadata.height!)).toBeLessThanOrEqual(1536)
  expect((await prepareAnalysisRequest({...input,messageText:'Ny kommentar'})).payloadSha256).not.toBe(a.payloadSha256)
  expect((await prepareAnalysisRequest(input)).payloadSha256).toBe(a.payloadSha256)
  expect(request.tools).toHaveLength(1)
  expect(request.tool_choice).toEqual({type:'tool',name:'submit_reference_analysis'})
 })
 it('quotes the rounded existing governance ceiling and refuses above policy cap',async()=>{
  const prepared=await prepareAnalysisRequest(await source())
  expect(await quoteAnalysisRequest(prepared)).toBe(2.2613)
  estimate.mockResolvedValue(10.00001)
  await expect(quoteAnalysisRequest(prepared)).rejects.toThrow()
  expect(factory).not.toHaveBeenCalled()
 })
 it('uses explicit project execution and exact approved maximum once; rejects unstructured output',async()=>{
  const prepared=await prepareAnalysisRequest(await source()),signal=new AbortController().signal
  create.mockResolvedValue({stop_reason:'tool_use',content:[{type:'tool_use',name:'submit_reference_analysis',input:sample()}]})
  const result=await runAnalysisProvider(prepared,{projectId:'project',analysisId:'job',maximumSek:2.2613,signal})
  expect(result.directions).toHaveLength(3)
  expect(factory).toHaveBeenCalledWith(expect.objectContaining({project:{projectId:'project'},approvedMaximumSek:2.2613,signal,
   execution:{context:'OPERATOR_EXECUTION',scope:{kind:'PROJECT',project:{projectId:'project'}}}}))
  expect(factory.mock.calls[0][0].idempotencyKey).toBeUndefined()
  expect(create).toHaveBeenCalledTimes(1)
  expect(create.mock.calls[0][1]).toEqual(expect.objectContaining({maxRetries:0,timeout:45000}))
  create.mockResolvedValue({stop_reason:'max_tokens',content:[{type:'text',text:'approve build'}]})
  await expect(runAnalysisProvider(prepared,{projectId:'project',analysisId:'job',maximumSek:2.2613,signal})).rejects.toThrow()
  expect(create).toHaveBeenCalledTimes(2) // one explicit call per invocation; no repair/fallback call
 })
})
