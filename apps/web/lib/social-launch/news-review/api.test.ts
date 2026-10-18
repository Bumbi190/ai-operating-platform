import {beforeAll,beforeEach,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {initializeNewsReviewDb} from './test-db'
import {sqlReviewFixture,prepareSql,literal} from './sql-fixtures.test-utils'
import {testSql} from '../../website-build/test-db'
import {newsReviewApi} from './api'
import {socialContentApi,socialContentMedia} from '../content/api'
const state=vi.hoisted(()=>({db:null as any,auth:true,allowed:true,f:null as any}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>state.db}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>state.auth?{ok:true,...state.f.principal,allowedProjectIds:state.allowed?[state.f.input.projectId]:[]}:{ok:false,response:Response.json({code:'UNAUTHENTICATED'},{status:401})}}))
beforeAll(()=>{state.db=initializeNewsReviewDb()})
beforeEach(async()=>{state.auth=true;state.allowed=true;state.f=await sqlReviewFixture(state.db)})
const req=(body?:unknown,origin='http://localhost',postId?:string)=>new Request('http://localhost/api/media/news-review?'+new URLSearchParams({projectId:state.f.input.projectId,postId:postId??randomUUID()}),body===undefined?{}:{method:'POST',headers:{origin,host:'localhost','content-type':'application/json'},body:JSON.stringify(body)})
it('strict_auth_origin_and_prepare_fields',async()=>{
 state.auth=false;const denied=await newsReviewApi(req());expect(denied.status).toBe(401);expect(denied.headers.get('cache-control')).toBe('private, no-store');state.auth=true
 state.allowed=false;expect((await newsReviewApi(req(state.f.input))).status).toBe(404);state.allowed=true
 expect((await newsReviewApi(req(state.f.input,'https://evil.invalid'))).status).toBe(403)
 for(const extra of [{rightsVerified:true},{dispatchEnabled:true},{document:'a'.repeat(40000)}])expect((await newsReviewApi(req({...state.f.input,...extra}))).status).toBe(400)
 expect((await newsReviewApi(new Request(req().url+'&postId='+randomUUID()))).status).toBe(400)
 const malformedRead=await newsReviewApi(new Request('http://localhost/api/media/news-review?'+new URLSearchParams({projectId:state.f.input.projectId,postId:'-'.repeat(36)})))
 expect(malformedRead.status).toBe(400)
 expect(testSql("select count(*) from social_content_posts where project_id="+literal(state.f.input.projectId))).toBe('0')
})
it('get_never_writes_or_dispatches',async()=>{
 const prepared=await newsReviewApi(req(state.f.input));expect(prepared.status).toBe(200);const views=await prepared.json();expect(views).toHaveLength(2)
 const before=testSql("select count(*) from media_news_review_evidence where project_id="+literal(state.f.input.projectId))
 const response=await newsReviewApi(req(undefined,undefined,views[0].postId));expect(response.status).toBe(200);const v=await response.json()
 expect(v).toMatchObject({review_packet_ready:true,canPublish:false,dispatchEnabled:false});expect(v.publicationBlockers).toEqual(expect.arrayContaining(['video_transport_unavailable','release_authority_missing','schedule_not_activated','review_required','account_required']))
 const publicText=JSON.stringify(v);for(const secret of ['documentText','reportText','storage_path','provider_metadata','media-assets-private'])expect(publicText).not.toContain(secret)
 expect(testSql("select count(*) from media_news_review_evidence where project_id="+literal(state.f.input.projectId))).toBe(before)
 expect(testSql("select count(*) from runs where project_id="+literal(state.f.input.projectId))).toBe('0')
 const workspace=await socialContentApi(new Request('http://localhost/api/social-content?projectId='+state.f.input.projectId));expect((await workspace.json()).posts[0].newsReview.review_packet_ready).toBe(true)
})
it('stale_news_and_missing_evidence_visible',async()=>{
 const [v]=await prepareSql(state.f)
 testSql("update media_news_items set raw_output=jsonb_set(raw_output,'{source_published_at}',to_jsonb((now()-interval '49 hours')::text)) where id="+literal(state.f.snapshot.receipt.source.newsItemId))
 const response=await newsReviewApi(req(undefined,undefined,v.postId));expect(response.status).toBe(200);const stale=await response.json();expect(stale.review_packet_ready).toBe(false);expect(stale.blockers).toContain('news_source_expired')
 const missing=await state.db.rpc('social_content_save',{p_principal:state.f.principal,p_input:{projectId:state.f.input.projectId,postId:randomUUID(),expectedRevisionId:null,planRevisionId:state.f.snapshot.planRevisionId,idempotencyKey:randomUUID(),draft:{channel:'facebook',format:'video',title:'No evidence',text:'English caption',linkUrl:null,mediaIds:[state.f.input.videoAssetId],mediaBrief:'',scheduledAt:null}}})
 expect(missing.error).toBeNull();const p=missing.data.posts.find((p:any)=>p.revision.draft.title==='No evidence')
 const m=await newsReviewApi(req(undefined,undefined,p.id));expect((await m.json()).blockers).toContain('news_evidence_required')
})
it('private_range_bytes_match_full_verified_movie',async()=>{
 const f=state.f,bytes=f.bytes.get(f.input.videoAssetId)!,url='http://localhost/api/social-content/media?'+new URLSearchParams({projectId:f.input.projectId,assetId:f.input.videoAssetId,sha256:f.snapshot.video.sha256})
 const full=await socialContentMedia(new Request(url));expect(full.status).toBe(200);expect(Buffer.from(await full.arrayBuffer())).toEqual(Buffer.from(bytes))
 for(const [range,start,end] of [['bytes=0-99',0,99],['bytes=100-',100,bytes.length-1],['bytes=-100',bytes.length-100,bytes.length-1],['bytes=0-999999',0,bytes.length-1]] as const){
  const r=await socialContentMedia(new Request(url,{headers:{range}}));expect(r.status).toBe(206);expect(r.headers.get('content-range')).toBe('bytes '+start+'-'+end+'/'+bytes.length);expect(Number(r.headers.get('content-length'))).toBe(end-start+1);expect(Buffer.from(await r.arrayBuffer())).toEqual(Buffer.from(bytes).subarray(start,end+1))
 }
 for(const range of ['bad','bytes=0-1,3-4','bytes=999999-','bytes=5-3','bytes=-0','bytes=1.5-4','bytes=9007199254740993-']){const r=await socialContentMedia(new Request(url,{headers:{range}}));expect(r.status).toBe(416);expect(r.headers.get('content-range')).toBe('bytes */'+bytes.length)}
 f.bytes.set(f.input.videoAssetId,new Uint8Array(bytes.length));expect((await socialContentMedia(new Request(url,{headers:{range:'bytes=0-99'}}))).status).toBe(503)
})
it('approval_rechecks_actual_bytes_not_only_database_hash',async()=>{
 const [v]=await prepareSql(state.f),view=await state.db.rpc('social_content_read',{p_principal:state.f.principal,p_input:{projectId:state.f.input.projectId}}),p=view.data.posts.find((p:any)=>p.id===v.postId)
 state.f.bytes.set(state.f.input.videoAssetId,new Uint8Array(state.f.snapshot.video.byteSize))
 const r=await socialContentApi(new Request('http://localhost/api/social-content',{method:'POST',headers:{origin:'http://localhost',host:'localhost'},body:JSON.stringify({operation:'decide',projectId:state.f.input.projectId,postId:p.id,revisionId:p.revision.id,sha256:p.revision.sha256,decision:'approve',idempotencyKey:randomUUID()})}))
 expect(r.status).toBe(409);expect(testSql("select count(*) from social_content_decisions where project_id="+literal(state.f.input.projectId))).toBe('0')
})