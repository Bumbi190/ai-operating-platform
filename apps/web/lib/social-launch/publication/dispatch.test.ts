import {beforeAll,it,expect,vi} from 'vitest'
import {initializePublicationDb} from './test-db'
import {publicationFixture,JPEG} from './fixtures.test-utils'
import {testSql} from '../../website-build/test-db'
import {dispatchPublication,checkPublication,publicationPreview} from './dispatch'
import {MetaManualProvider} from './provider'
const adminState=vi.hoisted(()=>({db:null as any}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>adminState.db}))
let db:ReturnType<typeof initializePublicationDb>
beforeAll(()=>{db=initializePublicationDb();adminState.db=db})
type Fixture=Awaited<ReturnType<typeof publicationFixture>>
function deps(f:Fixture,fetcher:(url:string,init:RequestInit)=>Promise<Response>){return {provider:new MetaManualProvider(fetcher),resolveCredential:async()=>({projectId:f.projectId,bindingId:f.bindingId,channel:f.post.revision.draft.channel as 'facebook'|'instagram',accountId:f.accountId,token:'fixture-token',apiBase:'https://graph.facebook.com/v21.0'}),verifyImage:async()=>({bytes:new Uint8Array(JPEG),width:320,height:400})}}
const check=(f:Fixture,id:string)=>({projectId:f.projectId,postId:f.postId,publicationId:id})
it('GET readiness makes no provider request and dispatches one exact approved Facebook post',async()=>{
 const f=await publicationFixture(db),calls:any[]=[];const d=deps(f,async(url,init)=>{calls.push({url,init});return Response.json({id:'123_456'})})
 const preview=await publicationPreview(db,f.p,{projectId:f.projectId,postId:f.postId});expect(preview.canRequest).toBe(true);expect(calls).toHaveLength(0)
 const result=await dispatchPublication(db,f.p,f.input,d);expect(result.publication!.state).toBe('published');expect(calls).toHaveLength(1);expect(new URLSearchParams(calls[0].init.body).get('message')).toBe(f.post.revision.draft.text)
 expect((await dispatchPublication(db,f.p,f.input,d)).publication!.id).toBe(result.publication!.id);expect(calls).toHaveLength(1)
})
it('guards project stops and a mismatched resolved account before any provider write',async()=>{
 const f=await publicationFixture(db);let calls=0;const d=deps(f,async()=>{calls++;return Response.json({id:'1'})})
 d.resolveCredential=async()=>({...await deps(f,async()=>Response.json({})).resolveCredential(),accountId:'999'})
 await expect(dispatchPublication(db,f.p,f.input,d)).rejects.toMatchObject({code:'REVIEW_REQUIRED'});expect(calls).toBe(0)
 testSql("update projects set execution_paused=true where id='"+f.projectId+"';")
 expect((await publicationPreview(db,f.p,{projectId:f.projectId,postId:f.postId})).canRequest).toBe(false)
 await expect(dispatchPublication(db,f.p,f.input,d)).rejects.toMatchObject({code:'STOPPED'});expect(calls).toBe(0)
})
it('a lost Facebook response becomes uncertain and the same intent never POSTs again',async()=>{
 const f=await publicationFixture(db);let calls=0;const d=deps(f,async()=>{calls++;throw Error('lost response secret-token')})
 const v=await dispatchPublication(db,f.p,f.input,d);expect(v.publication!.state).toBe('uncertain');expect(JSON.stringify(v)).not.toContain('secret-token')
 await dispatchPublication(db,f.p,f.input,d);const saved=await checkPublication(db,f.p,check(f,v.publication!.id),d);expect(saved.publication!.id).toBe(v.publication!.id);expect(saved.publication!.state).toBe('uncertain');expect(saved.canRequest).toBe(false);expect(calls).toBe(1)
})
it('explicit Meta rejection is recorded as failed without automatic retry',async()=>{
 const f=await publicationFixture(db);let calls=0;const d=deps(f,async()=>{calls++;return Response.json({error:{code:190,message:'private'}},{status:401})})
 const v=await dispatchPublication(db,f.p,f.input,d);expect(v.publication!.state).toBe('failed');await dispatchPublication(db,f.p,f.input,d);expect(calls).toBe(1)
})
it('two simultaneous requests admit only one Facebook write',async()=>{
 const f=await publicationFixture(db);let started!:()=>void,release!:()=>void;const start=new Promise<void>(r=>started=r),hold=new Promise<void>(r=>release=r);let calls=0
 const d=deps(f,async()=>{calls++;started();await hold;return Response.json({id:'123_456'})})
 const first=dispatchPublication(db,f.p,f.input,d);await start
 const duplicate=await dispatchPublication(db,f.p,f.input,d);expect(duplicate.publication!.state).toBe('publishing');release();const finished=await first;expect(finished.publication!.state).toBe('published');expect(finished.publication!.id).toBe(duplicate.publication!.id);expect(calls).toBe(1)
},15000)
it('persists Instagram processing then explicitly completes the same container once ready',async()=>{
 const f=await publicationFixture(db,'instagram',true);let status='IN_PROGRESS',posts=0
 const d=deps(f,async(url,init)=>{if(init.method==='POST'){posts++;return Response.json({id:url.endsWith('/media')?'111':'222'})}return Response.json(url.includes('status_code')?{status_code:status}:{permalink:'https://www.instagram.com/p/fixture/'})})
 const waiting=await dispatchPublication(db,f.p,f.input,d);expect(waiting.publication!.state).toBe('processing');expect(posts).toBe(1)
 status='FINISHED';const done=await checkPublication(db,f.p,check(f,waiting.publication!.id),d);expect(done.publication!.state).toBe('published');expect(done.publication!.permalink).toBe('https://www.instagram.com/p/fixture/');expect(posts).toBe(2)
 await checkPublication(db,f.p,check(f,done.publication!.id),d);expect(posts).toBe(2)
},15000)
it('reconciles an unknown Instagram publish with PUBLISHED status without another POST',async()=>{
 const f=await publicationFixture(db,'instagram',true);let lost=true,posts=0
 const d=deps(f,async(url,init)=>{if(init.method==='POST'){posts++;if(url.endsWith('/media_publish'))throw Error('response lost');return Response.json({id:'111'})}return Response.json({status_code:lost?'FINISHED':'PUBLISHED'})})
 const unknown=await dispatchPublication(db,f.p,f.input,d);expect(unknown.publication!.state).toBe('uncertain');expect(posts).toBe(2)
 lost=false;const done=await checkPublication(db,f.p,check(f,unknown.publication!.id),d);expect(done.publication!.state).toBe('published');expect(done.publication!.confirmation).toBe('container_status');expect(done.publication!.providerId).toBeNull();expect(done.publication!.permalink).toBeNull();expect(posts).toBe(2)
},15000)
it('a stop while Instagram is processing blocks every later provider request',async()=>{
 const f=await publicationFixture(db,'instagram',true);let calls=0;const d=deps(f,async(_url,init)=>{calls++;return Response.json(init.method==='POST'?{id:'111'}:{status_code:'IN_PROGRESS'})})
 const v=await dispatchPublication(db,f.p,f.input,d);const before=calls;testSql("update projects set execution_paused=true where id='"+f.projectId+"';")
 await expect(checkPublication(db,f.p,check(f,v.publication!.id),d)).rejects.toMatchObject({code:'STOPPED'});expect(calls).toBe(before)
},15000)
it('a receipt-store failure never turns a successful provider write into a retry',async()=>{
 for(const committed of [false,true]){
  const f=await publicationFixture(db);let calls=0,once=true;const d=deps(f,async()=>{calls++;return Response.json({id:'123_456'})})
  const faultDb={...db,rpc:async(name:string,args:any)=>{if(name==='social_publication_step'&&args.p_input.action==='complete'&&once){once=false;if(committed)await (db as any).rpc(name,args);return {data:null,error:{message:'lost storage response',code:'XX000'}}}return (db as any).rpc(name,args)}} as any
  const v=await dispatchPublication(faultDb,f.p,f.input,d);expect(v.publication!.state).toBe(committed?'published':'uncertain');await dispatchPublication(faultDb,f.p,f.input,d);expect(calls).toBe(1)
 }
},15000)

it('records an explicitly expired Instagram container without attempting to publish it',async()=>{
 const f=await publicationFixture(db,'instagram',true);let posts=0;const d=deps(f,async(_url,init)=>{if(init.method==='POST'){posts++;return Response.json({id:'111'})}return Response.json({status_code:'EXPIRED'})})
 const v=await dispatchPublication(db,f.p,f.input,d);expect(v.publication!.state).toBe('failed');expect(posts).toBe(1)
},15000)
