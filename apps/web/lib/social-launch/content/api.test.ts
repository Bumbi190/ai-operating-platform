import {beforeAll,beforeEach,it,expect,vi} from 'vitest'
import {randomUUID,createHash} from 'node:crypto'
import {initializeContentDb} from './test-db'
import {testSql,TEST_PRINCIPAL} from '../../website-build/test-db'
import {proposeSocialLaunchPlan,decideSocialLaunchPlan} from '../store'
import {socialContentApi,socialContentMedia} from './api'
import {handleSocialContentTool,SOCIAL_CONTENT_TOOL_NAMES} from './atlas-tools'
const state=vi.hoisted(()=>({db:null as any,auth:true,allowed:true,projectId:'',conversationId:''}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>state.db}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>state.auth?{ok:true,...TEST_PRINCIPAL,allowedProjectIds:state.allowed?[state.projectId]:[]}:{ok:false,response:Response.json({error:'Unauthorized'},{status:401})}}))
const request=(body?:unknown,origin='http://localhost')=>new Request('http://localhost/api/social-content?projectId='+state.projectId,body===undefined?{}:{method:'POST',headers:{origin,host:'localhost','content-type':'application/json'},body:JSON.stringify(body)})
let planId=''
beforeAll(()=>{state.db=initializeContentDb()})
beforeEach(async()=>{state.auth=true;state.allowed=true;state.projectId=randomUUID();state.conversationId=randomUUID();testSql("insert into projects(id,owner_id,name,slug) values('"+state.projectId+"','"+TEST_PRINCIPAL.userId+"','Familjen','c-"+state.projectId+"');insert into conversations(id,user_id,project_id) values('"+state.conversationId+"','"+TEST_PRINCIPAL.userId+"','"+state.projectId+"');");const plan=await proposeSocialLaunchPlan(state.db,TEST_PRINCIPALWithScope(),{projectId:state.projectId,expectedRevisionId:null,idempotencyKey:randomUUID(),choices:[{channel:'facebook',purpose:'Familjer',format:'text',cadence:'weekly'}]});planId=plan.currentRevision!.id;await decideSocialLaunchPlan(state.db,TEST_PRINCIPALWithScope(),{projectId:state.projectId,revisionId:planId,sha256:plan.currentRevision!.sha256,decision:'approve',idempotencyKey:randomUUID()})})
function TEST_PRINCIPALWithScope(){return {...TEST_PRINCIPAL,allowedProjectIds:[state.projectId]}}
const proposal=()=>({operation:'propose',projectId:state.projectId,postId:randomUUID(),planRevisionId:planId,expectedRevisionId:null,idempotencyKey:randomUUID(),draft:{channel:'facebook',format:'text',title:'Helgen',text:'Familjeaktiviteter',mediaBrief:'',mediaIds:[],scheduledAt:null,linkUrl:null}})
it('denies unauthenticated, foreign, cross-origin and oversized writes without leaking data',async()=>{
 state.auth=false;const response=await socialContentApi(request());expect(response.status).toBe(401);expect(response.headers.get('cache-control')).toBe('private, no-store');state.auth=true;state.allowed=false;expect((await socialContentApi(request())).status).toBe(404);state.allowed=true;expect((await socialContentApi(request(proposal(),'https://evil.invalid'))).status).toBe(403);expect((await socialContentApi(request({...proposal(),text:'a'.repeat(40000)}))).status).toBe(400)
})
it('persists exact editorial review and returns explicitly disabled dispatch',async()=>{const p=proposal(),r=await socialContentApi(request(p));expect(r.status).toBe(200);const v=await r.json(),revision=v.posts[0].revision;expect(v.publicationReady).toBe(false);const approved=await socialContentApi(request({operation:'decide',projectId:state.projectId,postId:p.postId,revisionId:revision.id,sha256:revision.sha256,decision:'approve',idempotencyKey:randomUUID()}));expect(approved.status).toBe(200);expect((await approved.json()).posts[0].status).toBe('approved');expect(testSql("select count(*) from runs where project_id='"+state.projectId+"';")).toBe('0')})
it('Atlas reads/proposes inside its owned conversation but cannot approve or dispatch',async()=>{
 expect(SOCIAL_CONTENT_TOOL_NAMES).toEqual(['get_social_content','propose_social_content']);const p=proposal();const {operation,...input}=p;const v=await handleSocialContentTool('propose_social_content',input,TEST_PRINCIPALWithScope(),state.conversationId,state.db) as any;expect(v.posts[0].decision).toBeNull();expect(v.workspaceUrl).toBe('/projects/c-'+state.projectId+'/social#content');expect(v.dispatchEnabled).toBe(false)
 for(const extra of [{decision:'approve'},{publish:true},{token:'secret'},{conversationId:state.conversationId}])expect(await handleSocialContentTool('propose_social_content',{...input,...extra},TEST_PRINCIPALWithScope(),state.conversationId,state.db)).toMatchObject({code:'INVALID_BODY'})
 expect(await handleSocialContentTool('get_social_content',{projectId:state.projectId},TEST_PRINCIPALWithScope(),null,state.db)).toMatchObject({code:'NOT_FOUND'})
 expect(await handleSocialContentTool('get_social_content',{projectId:state.projectId},TEST_PRINCIPALWithScope(),randomUUID(),state.db)).toMatchObject({code:'NOT_FOUND'})
})
it('private media preview proves owned active asset and exact downloaded checksum',async()=>{
 const bytes=Buffer.from('fixture-image'),sha=createHash('sha256').update(bytes).digest('hex'),id=randomUUID()
 testSql("insert into assets(id,project_id,kind,mime_type,byte_size,checksum_sha256,storage_bucket,storage_path) values('"+id+"','"+state.projectId+"','image','image/png',"+bytes.length+",'"+sha+"','media-assets-private','"+id+"');")
 state.db.storage={from:(bucket:string)=>({download:async(p:string)=>{expect(bucket).toBe('media-assets-private');expect(p).toBe(id);return {data:new Blob([bytes]),error:null}}})}
 const req=(hash=sha)=>new Request('http://localhost/api/social-content/media?projectId='+state.projectId+'&assetId='+id+'&sha256='+hash)
 const r=await socialContentMedia(req());expect(r.status).toBe(200);expect(Buffer.from(await r.arrayBuffer())).toEqual(bytes);expect(r.headers.get('x-content-type-options')).toBe('nosniff')
 expect((await socialContentMedia(req('0'.repeat(64)))).status).toBe(404);state.allowed=false;expect((await socialContentMedia(req())).status).toBe(404);state.allowed=true
 state.db.storage={from:()=>({download:async()=>({data:new Blob(['tampered']),error:null})})};expect((await socialContentMedia(req())).status).toBe(503)
})
it('rejects query duplication, unknown fields and publication operations',async()=>{expect((await socialContentApi(new Request('http://localhost/api/social-content?projectId='+state.projectId+'&projectId='+state.projectId))).status).toBe(400);for(const body of [{...proposal(),approved:true},{...proposal(),operation:'publish'}])expect((await socialContentApi(request(body))).status).toBe(400)})
