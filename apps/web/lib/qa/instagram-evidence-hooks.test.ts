import {afterEach,describe,expect,it,vi} from 'vitest'
import {publishContainer} from '../media/instagram'
import {fetchMediaInsights} from '../media/insights'
import {createLocalInstagramEvidenceSession,openInstagramEvidenceSession} from '../content-growth/instagram-evidence-hooks'
const H=3_600_000,start=1000*H
const scope={projectId:'00000000-0000-4000-8000-000000000001',bindingId:'00000000-0000-4000-8000-000000000002',accountId:'synthetic-account',platform:'instagram' as const}
const scriptId='00000000-0000-4000-8000-000000000003'
const gate={enabled:true,projectSlug:'ai-media-automation' as const,scope,enrollment:{startMs:start,endMs:start+14*24*H}}
const credential={...scope,apiBase:'https://graph.example.test/v1',token:'synthetic-token'}
const reply=(json:unknown,ok=true)=>({ok,status:ok?200:400,json:async()=>json})
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()})
describe('actual provider response seams with mock network only',()=>{
 it('runtime factory stays off; legacy POST response and calls unchanged',async()=>{
  expect(openInstagramEvidenceSession()).toBeUndefined()
  const fetch=vi.fn().mockResolvedValueOnce(reply({id:'media'})).mockResolvedValueOnce(reply({permalink:'https://example.test/p/1'}))
  vi.stubGlobal('fetch',fetch)
  expect(await publishContainer(credential,'creation')).toEqual({mediaId:'media',permalink:'https://example.test/p/1'})
  expect(fetch).toHaveBeenCalledTimes(2)
 })
 it('POST interval ends before permalink request; no extra requests',async()=>{
  let clock=start+H
  vi.spyOn(Date,'now').mockImplementation(()=>clock)
  const fetch=vi.fn(async (url:string)=>{
    if(url.includes('/media_publish')){clock+=1000;return reply({id:'media'})}
    clock+=10_000;return reply({permalink:'https://example.test/p/1'})
  })
  vi.stubGlobal('fetch',fetch)
  const result=await publishContainer(credential,'creation',true)
  expect(result.localEvidenceWindow).toEqual({startMs:start+H,endMs:start+H+1000})
  expect(fetch).toHaveBeenCalledTimes(2)
  const session=createLocalInstagramEvidenceSession(gate)
  session.publication(scriptId,null,result.mediaId,{scope,mediaId:result.mediaId,request:result.localEvidenceWindow!,dispatchAttempts:1})
  expect(session.snapshot().publications).toHaveLength(1)
  expect(session.snapshot().publications[0].evidence).toBe('unverified_local_interval')
  expect(JSON.stringify(session.snapshot())).not.toContain('synthetic-token')
 })
 it('failed publish has no receipt; permalink failure stays noncritical',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(reply({error:{message:'test'}},false))
  vi.stubGlobal('fetch',fetch)
  await expect(publishContainer(credential,'creation',true)).rejects.toThrow()
  expect(fetch).toHaveBeenCalledTimes(1)
  fetch.mockReset().mockResolvedValueOnce(reply({id:'media'})).mockRejectedValueOnce(Error('permalink failed'))
  expect(await publishContainer(credential,'creation',true)).toMatchObject({mediaId:'media',localEvidenceWindow:{}})
  expect(fetch).toHaveBeenCalledTimes(2)
 })
 it('successful Insights capture preserves zero and missing, no added requests',async()=>{
  const payload={data:[{name:'views',total_value:{value:0}},{name:'reach',values:[{value:10}]}]}
  const fetch=vi.fn().mockResolvedValue(reply(payload));vi.stubGlobal('fetch',fetch)
  expect(await fetchMediaInsights('media','IGAA-synthetic')).toEqual({ok:true,metrics:{views:0,reach:10}})
  let clock=start+50*H
  vi.spyOn(Date,'now').mockImplementation(()=>clock)
  fetch.mockImplementation(async()=>{clock+=1000;return reply(payload)})
  expect(await fetchMediaInsights('media','IGAA-synthetic',true)).toEqual({ok:true,metrics:{views:0,reach:10},localEvidenceWindow:{startMs:start+50*H,endMs:start+50*H+1000}})
  expect(fetch).toHaveBeenCalledTimes(2)
 })
 it('existing host fallback succeeds but withholds ambiguous interval',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(reply({error:{message:'test'}},false)).mockResolvedValueOnce(reply({data:[{name:'reach',total_value:{value:10}}]}))
  vi.stubGlobal('fetch',fetch)
  expect(await fetchMediaInsights('media','IGAA-synthetic',true)).toEqual({ok:true,metrics:{reach:10}})
  expect(fetch).toHaveBeenCalledTimes(2)
 })
 it('explicit local session links matching candidates without verified attestation',()=>{
  const session=createLocalInstagramEvidenceSession(gate)
  const request={startMs:start+H,endMs:start+H+1000}
  vi.spyOn(Date,'now').mockReturnValue(request.endMs)
  session.publication(scriptId,null,'media',{scope,mediaId:'media',request,dispatchAttempts:1})
  const publication=session.snapshot().publications[0]
  const m=createLocalInstagramEvidenceSession(gate,[publication])
  const window={startMs:start+50*H,endMs:start+50*H+1000}
  vi.spyOn(Date,'now').mockReturnValue(window.endMs)
  m.measurement({...scope,accountId:'other'},scriptId,'media',window,{ok:true,metrics:{views:1}})
  m.measurement(scope,scriptId,'other',window,{ok:true,metrics:{views:1}})
  m.measurement(scope,scriptId,'media',window,{ok:true,metrics:{views:0,reach:10,saved:0}})
  const v=m.snapshot()
  expect(v.measurements).toHaveLength(1)
  expect(v.measurements[0]).toMatchObject({publicationAcquisitionId:publication.acquisitionId,views:0,reach:10,saves:0,shares:null,evidence:'unverified_local_interval',providerFreshness:'unknown'})
  expect(v.authorizesPilot).toBe(false)
 })
 it('retry, wrong scope and previous ID never enter the session',()=>{
  const session=createLocalInstagramEvidenceSession(gate)
  const request={startMs:start+H,endMs:start+H+1000}
  vi.spyOn(Date,'now').mockReturnValue(request.endMs)
  session.publication(scriptId,null,'media',{scope,mediaId:'media',request,dispatchAttempts:2})
  session.publication(scriptId,'old','media',{scope,mediaId:'media',request,dispatchAttempts:1})
  session.publication(scriptId,null,'media',{scope:{...scope,bindingId:scriptId},mediaId:'media',request,dispatchAttempts:1})
  expect(session.snapshot().publications).toHaveLength(0)
 })
})