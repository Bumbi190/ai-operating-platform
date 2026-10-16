import {beforeAll,beforeEach,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {testSql,TEST_PRINCIPAL} from '../website-build/test-db'
import {initializeSocialLaunchDb as initializeWorkerDb} from './test-db'
import {socialLaunchApi} from './api'
const state=vi.hoisted(()=>({db:null as unknown,auth:true,allowed:true,projectId:''}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>state.db}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>state.auth?{ok:true,...TEST_PRINCIPAL,allowedProjectIds:state.allowed?[state.projectId]:[]}:{ok:false,response:Response.json({error:'Unauthorized'},{status:401})}}))
vi.mock('@/lib/os/settings',()=>({loadSettings:async()=>null}))
const req=(body?:unknown,origin='http://localhost')=>new Request('http://localhost/api/social-launch?projectId='+state.projectId,body===undefined?{}:{method:'POST',headers:{origin,host:'localhost','content-type':'application/json'},body:JSON.stringify(body)})
beforeAll(()=>{state.db=initializeWorkerDb()})
beforeEach(()=>{state.auth=true;state.allowed=true;state.projectId=randomUUID();testSql("insert into projects(id,owner_id,name,slug) values('"+state.projectId+"','"+TEST_PRINCIPAL.userId+"','Family','social-"+state.projectId+"');")})
const proposal=()=>({operation:'propose',projectId:state.projectId,expectedRevisionId:null,idempotencyKey:randomUUID(),choices:[{channel:'pinterest',purpose:'Familjen',format:'image',cadence:'weekly'}]})
it('denies unauthenticated and unowned requests with private cache control',async()=>{
 state.auth=false;let r=await socialLaunchApi(req());expect(r.status).toBe(401);expect(r.headers.get('cache-control')).toBe('private, no-store')
 state.auth=true;state.allowed=false;expect((await socialLaunchApi(req())).status).toBe(404)
})
it('saves and approves an exact proposal without publishing, then rejects a stale decision',async()=>{
 const r=await socialLaunchApi(req(proposal()));expect(r.status).toBe(200);const model=await r.json(),rev=model.plan.currentRevision
 expect(model.plan.decision).toBeNull();expect(model.channels.find((c:any)=>c.channel==='pinterest').connection).toBe('adapter_unavailable')
 const body={operation:'decide',projectId:state.projectId,revisionId:rev.id,sha256:rev.sha256,decision:'approve',idempotencyKey:randomUUID()}
 expect((await socialLaunchApi(req({...body,sha256:'0'.repeat(64)}))).status).toBe(409)
 const approved=await socialLaunchApi(req(body));expect((await approved.json()).plan.decision.decision).toBe('approve')
 expect(testSql("select count(*) from runs where project_id='"+state.projectId+"';")).toBe('0')
})
it('rejects cross-origin, unexpected authority and oversized bodies without leaking input',async()=>{
 expect((await socialLaunchApi(req(proposal(),'https://evil.example'))).status).toBe(403)
 const r=await socialLaunchApi(req({...proposal(),publish:true,token:'secret-example'}));expect(r.status).toBe(400);expect(await r.text()).not.toContain('secret-example')
 expect((await socialLaunchApi(req({x:'a'.repeat(20000)}))).status).toBe(400)
})
it('keeps failed metadata distinct from a missing connection',async()=>{
 const r=await socialLaunchApi(req()),m=await r.json();expect(r.status).toBe(200)
 expect(m.channels.find((c:any)=>c.channel==='instagram').connection).toBe('unreadable')
 expect(m.channels.every((c:any)=>c.publicationReady===false)).toBe(true)
})
