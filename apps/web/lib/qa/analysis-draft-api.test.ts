import {it,expect,vi,afterEach} from 'vitest'
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>{throw Error('real session denied')}}))
vi.mock('@/lib/project/get-project',()=>({getProjectBySlug:async()=>{throw Error('real DB denied')}}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>{throw Error('real admin denied')}}))
import {createAnalysisDraftService} from '@/lib/atlas/project-analytics/analysis-draft-service'
import {analysisDraftsEnabled} from '@/lib/atlas/project-analytics/analysis-draft-feature'
import {readAnalysisSelectorBody,analysisResponse} from '@/lib/atlas/project-analytics/analysis-draft-http'
import {fixture,NOW} from './fixtures/analysis-test-source'
import {hashAnalysisSource} from '@/lib/atlas/project-analytics/analysis-source-binding'
import {buildAnalysisReviewDraft} from '@/lib/atlas/project-analytics/analysis-review-contract'
const project={id:'8f673c09-1c8f-4d78-876e-4c14bf1c89b3',slug:'handlarborsen'}
const actor='00000000-0000-4000-8000-000000000010',id='00000000-0000-4000-8000-000000000020'
const f=fixture(),selector={ruleId:'company-status' as const,ruleVersion:'handlarborsen-insights-1.0.0',expectedEvidenceHash:hashAnalysisSource(f.source!)}
const b=buildAnalysisReviewDraft(f.source!,f.report,selector,NOW);if(b.status!=='ok')throw Error()
const saved={...b.draft,id,createdBy:actor,createdAt:'2026-10-12T11:00:00.000000Z'}
function setup(changes:any={}) {
 const calls:string[]=[],mode=changes.mode??'observer'
 const chain:any={select:()=>chain,eq:()=>chain,maybeSingle:async()=>{calls.push('live-owner');return {data:{...project,owner_id:changes.revoked?'foreign':actor,atlas_mode:mode}}}}
 const deps={env:{ATLAS_ANALYSIS_DRAFTS_ENABLED:'true'},access:async()=>{calls.push('auth');return changes.noSession?{ok:false}:{ok:true,userId:actor,allowedProjectIds:changes.foreign?[]:[project.id]}},project:async(slug:string)=>{calls.push('rls-project');return slug===project.slug?project:null},db:()=>({from:()=>chain}),source:async()=>{calls.push('source');if(changes.sourceError)throw Error();return {status:'ok',...f,...changes.source}},store:()=>({save:async()=>{calls.push('rpc');return changes.rpc??{status:'ok',id,created:true}},list:async()=>{calls.push('history');return {items:[saved],nextCursor:null}},get:async()=>{calls.push('history');return changes.missing?null:saved},events:async()=>changes.events??[]}),now:()=>changes.now??NOW,...changes.deps}
 return {service:createAnalysisDraftService(deps as any),calls}
}
afterEach(()=>vi.unstubAllGlobals())
it('auth_before_privileged_evidence_or_history',async()=>{const x=setup({noSession:true});expect(await x.service.save(project.slug,selector)).toEqual({status:'no_session'});expect(await x.service.list(project.slug,null)).toEqual({status:'no_session'});expect(x.calls).toEqual(['auth','auth'])})
it('no_first_project_fallback',async()=>{const x=setup();expect(await x.service.list('unknown',null)).toEqual({status:'not_found'});expect(x.calls).not.toContain('history')})
it.each([{foreign:true},{revoked:true}])('live_owner_revoked_after_render_%j',async changes=>{const x=setup(changes);expect(await x.service.save(project.slug,selector)).toEqual({status:'not_found'});expect(x.calls).not.toContain('source');expect(x.calls).not.toContain('rpc')})
it('mode_change_rpc_refusal',async()=>{const x=setup({rpc:{status:'conflict'}});expect(await x.service.save(project.slug,selector)).toEqual({status:'conflict'})})
it('default_off_and_disabled_post_no_reads_or_rpc',async()=>{for(const env of [{},{ATLAS_ANALYSIS_DRAFTS_ENABLED:'TRUE'},{NEXT_PUBLIC_ATLAS_ANALYSIS_DRAFTS_ENABLED:'true'}])expect(analysisDraftsEnabled(env)).toBe(false);const x=setup({deps:{env:{}}});expect(await x.service.save(project.slug,selector)).toEqual({status:'conflict'});expect(x.calls).toEqual([])})
it('streamed_4096_bytes_limit',async()=>{const body=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(' '.repeat(4090)));c.enqueue(new TextEncoder().encode(' '.repeat(20)));c.close()}});await expect(readAnalysisSelectorBody(new Request('http://localhost',{method:'POST',body,duplex:'half'} as any))).rejects.toThrow()})
it('all_unknown_fields_rejected',async()=>{for(const field of ['actorId','clock','quality','sourceEnvelope','manualSteps','mode','action'])await expect(readAnalysisSelectorBody(new Request('http://localhost',{method:'POST',body:JSON.stringify({...selector,[field]:'forged'})}))).rejects.toThrow()})
it('201_200_409_503_no_false_success',()=>{for(const [r,status] of [[{status:'ok',id,created:true},201],[{status:'ok',id,created:false},200],[{status:'conflict'},409],[{status:'unavailable'},503]] as const)expect(analysisResponse(r as any,project.slug,true).status).toBe(status)})
it('lost_response_retry_same_id',async()=>{const x=setup({rpc:{status:'ok',id,created:false}});expect(await x.service.save(project.slug,selector)).toEqual({status:'ok',id,created:false})})
it('retired_mode_history_no_source',async()=>{const x=setup({mode:'archived'}),r=await x.service.list(project.slug,null);expect('items' in r&&r.items[0].applicability).toBe('needs_assessment');expect(x.calls).not.toContain('source')})
it('cursor_invalid_foreign_missing_same_404',async()=>{expect(await setup().service.list(project.slug,'bad')).toEqual({status:'not_found'});expect(await setup({missing:true}).service.get(project.slug,id)).toEqual({status:'not_found'});expect(await setup({foreign:true}).service.get(project.slug,id)).toEqual({status:'not_found'})})
it('history_survives_unreadable_source',async()=>{const r=await setup({sourceError:true}).service.list(project.slug,null);expect('items' in r&&r.items[0].applicability).toBe('unknown')})
it('stale_superseded_new_evidence_are_separate',async()=>{const source=fixture({captured_at:'2026-10-12T10:02:00Z'});const r=await setup({now:new Date('2026-10-14T10:00:00Z'),source,events:[{draftId:id,kind:'superseded',supersededBy:actor}]}).service.list(project.slug,null);if(!('items' in r))throw Error();expect(r.items[0]).toMatchObject({stale:true,supersededBy:actor,applicability:'new_evidence'});expect(r.items[0].draft.insight).toEqual(saved.insight)})
it('captured_calls_only_P1_RPC_no_external_egress',async()=>{vi.stubGlobal('fetch',()=>{throw Error('no egress')});const x=setup();await x.service.save(project.slug,selector);expect(x.calls).toEqual(['auth','rls-project','live-owner','source','rpc'])})
it('origin_required_and_route_statuses',async()=>{
 const {POST,GET}=await import('@/app/api/projects/[slug]/atlas/analysis-drafts/route')
 const service=await import('@/lib/atlas/project-analytics/analysis-draft-service')
 const params={params:{slug:project.slug}}
 const previous=process.env.ATLAS_ANALYSIS_DRAFTS_ENABLED;process.env.ATLAS_ANALYSIS_DRAFTS_ENABLED='true'
 try {
 const spy=vi.spyOn(service,'saveAnalysisDraft').mockResolvedValue({status:'ok',id,created:true})
 const request=(origin?:string,body:any=selector)=>new Request('http://localhost/api',{method:'POST',headers:{host:'localhost',...(origin?{origin}:{})},body:JSON.stringify(body)})
 expect((await POST(request(),params)).status).toBe(403);expect(spy).not.toHaveBeenCalled()
 expect((await POST(request('http://localhost'),params)).status).toBe(201)
 expect((await POST(request('http://localhost',{...selector,actorId:actor}),params)).status).toBe(400)
 const list=vi.spyOn(service,'listAnalysisDrafts').mockResolvedValue({items:[],nextCursor:null})
 expect((await GET(new Request('http://localhost/api'),params)).headers.get('cache-control')).toBe('private, no-store');expect(list).toHaveBeenCalledWith(project.slug,null)
 }finally{if(previous===undefined)delete process.env.ATLAS_ANALYSIS_DRAFTS_ENABLED;else process.env.ATLAS_ANALYSIS_DRAFTS_ENABLED=previous;vi.restoreAllMocks()}
})
