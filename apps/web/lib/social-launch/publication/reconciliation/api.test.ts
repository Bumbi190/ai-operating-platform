
import {it,expect,vi,beforeEach} from 'vitest'
const s=vi.hoisted(()=>({auth:true,operator:true,allowed:true,calls:0}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>s.auth?{ok:true,userId:'owner',allowedProjectIds:s.allowed?['project']:[]}:{ok:false,response:Response.json({},{status:401})}}))
vi.mock('@/lib/auth/platform-operator',()=>({resolvePlatformOperator:async()=>({ok:s.operator,userId:'owner'})}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({})}))
vi.mock('./service',()=>({inspectReconciliation:async(_db:unknown,p:any)=>{s.calls++;if(!p.allowedProjectIds.length)throw new PublicationError('NOT_FOUND');return {candidates:[]}},completeReconciliation:async()=>{s.calls++;return {state:'published'}}}))
import {PublicationError} from '../types'
import {socialReconciliationApi} from './api'
beforeEach(()=>{s.auth=true;s.operator=true;s.allowed=true;s.calls=0})
const req=(patch={},origin='http://localhost')=>new Request('http://localhost/api/social-publication-reconciliation',{method:'POST',headers:{origin,host:'localhost'},body:JSON.stringify({operation:'inspect',projectId:'project',postId:'post',publicationId:'attempt',...patch})})
it('requires signed-in operator same origin and scoped access',async()=>{
 s.auth=false;expect((await socialReconciliationApi(req())).status).toBe(401);s.auth=true
 s.operator=false;expect((await socialReconciliationApi(req())).status).toBe(403);s.operator=true
 expect((await socialReconciliationApi(req({},'https://evil.test'))).status).toBe(403);expect(s.calls).toBe(0)
 s.allowed=false;expect((await socialReconciliationApi(req())).status).toBe(404)
})
it('rejects override fields and oversized body before inspect',async()=>{
 expect((await socialReconciliationApi(req({token:'override'}))).status).toBe(400)
 expect((await socialReconciliationApi(req({extra:'x'.repeat(40000)}))).status).toBe(400)
 expect((await socialReconciliationApi(req({operation:'publish'}))).status).toBe(400)
 expect(s.calls).toBe(0)
})
