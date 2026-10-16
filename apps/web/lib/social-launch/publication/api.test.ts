import {beforeAll,beforeEach,it,expect,vi} from 'vitest'
import {createHash,randomBytes} from 'node:crypto'
import {initializePublicationDb} from './test-db'
import {publicationFixture,JPEG} from './fixtures.test-utils'
import {publicationPrepare,publicationStep} from './store'
import {testSql} from '../../website-build/test-db'
import {socialPublicationsApi,socialPublicationMedia} from './api'
const state=vi.hoisted(()=>({db:null as any,auth:true,operator:true,allowed:true,projectId:'',userId:'',calls:[] as any[]}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>state.db}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>state.auth?{ok:true,userId:state.userId,allowedProjectIds:state.allowed?[state.projectId]:[]}:{ok:false,response:Response.json({},{status:401})}}))
vi.mock('@/lib/auth/platform-operator',()=>({resolvePlatformOperator:async()=>({ok:state.operator,userId:state.userId})}))
vi.mock('@/lib/media/social-credentials',()=>({resolveFacebookCredential:vi.fn(),resolveInstagramCredential:vi.fn()}))
import {resolveFacebookCredential} from '@/lib/media/social-credentials'
let base:ReturnType<typeof initializePublicationDb>,f:Awaited<ReturnType<typeof publicationFixture>>
beforeAll(()=>{base=initializePublicationDb()})
beforeEach(async()=>{f=await publicationFixture(base);state.auth=true;state.operator=true;state.allowed=true;state.projectId=f.projectId;state.userId=f.p.userId;state.db=base;state.calls=[]
 // Keep production authorization real at its boundary: only session resolvers are replaced.
 vi.mocked(resolveFacebookCredential).mockResolvedValue({ok:true,credential:{projectId:f.projectId,bindingId:f.bindingId,pageId:f.accountId,pageToken:'fixture-token'}} as any)
 vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{state.calls.push({url,init});return Response.json({id:'123_456'})})
})
const req=(body?:unknown,origin='http://localhost')=>new Request('http://localhost/api/social-publications?projectId='+f.projectId+'&postId='+f.postId,body===undefined?{}:{method:'POST',headers:{origin,host:'localhost','content-type':'application/json'},body:JSON.stringify(body)})
it('requires session, ownership, same origin and operator authority before any provider write',async()=>{
 state.auth=false;expect((await socialPublicationsApi(req())).status).toBe(401);state.auth=true
 state.allowed=false;expect((await socialPublicationsApi(req())).status).toBe(404);state.allowed=true
 expect((await socialPublicationsApi(req({operation:'publish',...f.input},'https://evil.invalid'))).status).toBe(403)
 state.operator=false;const preview=await socialPublicationsApi(req());expect(preview.status).toBe(200);expect(await preview.json()).toMatchObject({canRequest:false,blockers:expect.arrayContaining(['operator_required'])})
 expect((await socialPublicationsApi(req({operation:'publish',...f.input}))).status).toBe(403);expect(state.calls).toHaveLength(0)
})
it('GET is read only; explicit exact publish persists a receipt and never repeats the provider POST',async()=>{
 const preview=await socialPublicationsApi(req());expect(preview.status).toBe(200);expect(preview.headers.get('cache-control')).toBe('private, no-store');expect(state.calls).toHaveLength(0)
 const v=await socialPublicationsApi(req({operation:'publish',...f.input}));expect(v.status).toBe(200);expect(await v.json()).toMatchObject({publication:{state:'published',providerId:'123_456'}})
 expect((await socialPublicationsApi(req({operation:'publish',...f.input}))).status).toBe(200);expect(state.calls).toHaveLength(1)
})
it('rejects duplicate query, unknown fields, missing confirmation, unbounded streams and invalid check IDs',async()=>{
 expect((await socialPublicationsApi(new Request(req().url+'&postId='+f.postId))).status).toBe(400)
 for(const patch of [{token:'secret'},{accountId:'999'},{confirmed:false},{text:'override'},{extra:'x'.repeat(40000)}])expect((await socialPublicationsApi(req({operation:'publish',...f.input,...patch}))).status).toBe(400)
 expect((await socialPublicationsApi(req({operation:'check',projectId:f.projectId,postId:f.postId,publicationId:'bad'}))).status).toBe(400)
 const streamed=new Request(req().url,{method:'POST',headers:{origin:'http://localhost',host:'localhost'},body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('x'.repeat(40000)));c.close()}}),duplex:'half'} as RequestInit)
 expect((await socialPublicationsApi(streamed)).status).toBe(400);expect(state.calls).toHaveLength(0)
})
it('a foreign post is a closed 404 and leaks no publication or provider details',async()=>{
 const other=await publicationFixture(base);const r=await socialPublicationsApi(new Request('http://localhost/api/social-publications?projectId='+f.projectId+'&postId='+other.postId));expect(r.status).toBe(404);expect(await r.json()).toEqual({code:'NOT_FOUND'});expect(state.calls).toHaveLength(0)
})
it('public image capability streams only the exact verified asset and stops on expiry, pause or terminal state',async()=>{
 const image=await publicationFixture(base,'instagram',true),key=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(key).digest('hex')
 const r=await publicationPrepare(base,image.p,image.input),a=await publicationStep(base,image.p,{projectId:image.projectId,postId:image.postId,publicationId:r.id,expectedVersion:r.version,action:'claim_create',capabilityHash:hash})
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co'
 state.db={...base,storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://fixture.supabase.co/storage/v1/object/sign/private/a?token=fixture'}})})}}
 vi.stubGlobal('fetch',async()=>new Response(JPEG))
 const media=(k=key)=>new Request('https://app.omniraos.se/api/social-publication-media?publicationId='+r.id+'&key='+k)
 expect((await socialPublicationMedia(media('a'.repeat(43)))).status).toBe(404)
 const response=await socialPublicationMedia(media());expect(response.status).toBe(200);expect(response.headers.get('content-type')).toBe('image/jpeg');expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('content-length')).toBeNull();expect(Buffer.from(await response.arrayBuffer())).toEqual(JPEG)
 testSql("update projects set execution_paused=true where id='"+image.projectId+"';");expect((await socialPublicationMedia(media())).status).toBe(404)
 testSql("update projects set execution_paused=false where id='"+image.projectId+"';update social_publications set capability_expires_at=now()-interval '1 second' where id='"+r.id+"';");expect((await socialPublicationMedia(media())).status).toBe(404)
 testSql("update social_publications set capability_expires_at=now()+interval '1 minute' where id='"+r.id+"';")
 await publicationStep(base,image.p,{projectId:image.projectId,postId:image.postId,publicationId:r.id,expectedVersion:a.record.version,action:'fail',failureCode:'provider_denied'});expect((await socialPublicationMedia(media())).status).toBe(404)
},15000)

import {handleSocialPublicationTool,SOCIAL_PUBLICATION_TOOL_NAMES} from './atlas-tools'
it('Atlas can read only the owned conversation receipt and cannot publish or inject authority',async()=>{
 const conversationId=testSql("select id from conversations where project_id='"+f.projectId+"';")
 expect(SOCIAL_PUBLICATION_TOOL_NAMES).toEqual(['get_social_publication'])
 expect(await handleSocialPublicationTool('get_social_publication',{projectId:f.projectId,postId:f.postId},f.p,conversationId,base)).toMatchObject({publication:null,projectId:f.projectId})
 for(const input of [{projectId:f.projectId,postId:f.postId,publish:true},{projectId:f.projectId,postId:f.postId,conversationId}])expect(await handleSocialPublicationTool('get_social_publication',input,f.p,conversationId,base)).toMatchObject({code:'INVALID_BODY'})
 expect(await handleSocialPublicationTool('publish_social_content',{projectId:f.projectId,postId:f.postId},f.p,conversationId,base)).toMatchObject({code:'INVALID_BODY'})
 expect(await handleSocialPublicationTool('get_social_publication',{projectId:f.projectId,postId:f.postId},f.p,null,base)).toMatchObject({code:'NOT_FOUND'})
 expect(await handleSocialPublicationTool('get_social_publication',{projectId:f.projectId,postId:f.postId},f.p,f.postId,base)).toMatchObject({code:'NOT_FOUND'})
 expect(state.calls).toHaveLength(0)
})
