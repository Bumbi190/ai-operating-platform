import {beforeEach,it,expect,vi} from 'vitest'
import {websiteMockupApi} from './mockup-api'
const projectId='10000000-0000-4000-8000-000000000001',userId='20000000-0000-4000-8000-000000000001',planId='30000000-0000-4000-8000-000000000001',revisionId='40000000-0000-4000-8000-000000000001',mockupId='50000000-0000-4000-8000-000000000001'
const state=vi.hoisted(()=>({authenticated:true,allowed:true}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>null}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>state.authenticated?{ok:true,userId:'20000000-0000-4000-8000-000000000001',allowedProjectIds:state.allowed?['10000000-0000-4000-8000-000000000001']:[]}:{ok:false,response:Response.json({error:'Unauthorized'},{status:401})}}))
const body=()=>({projectId,revisionId,sha256:'a'.repeat(64),mockupId,mockupSha256:'b'.repeat(64),idempotencyKey:'approve-design'})
const req=(value:unknown=body(),origin='http://localhost')=>new Request('http://localhost/api/website-build-plans/'+planId+'/mockups/approve',{method:'POST',headers:{origin,host:'localhost','content-type':'application/json'},body:JSON.stringify(value)})
beforeEach(()=>{state.authenticated=true;state.allowed=true})
it('denies signed-out mockup approval before parsing a malformed body',async()=>{state.authenticated=false;const response=await websiteMockupApi('approve',new Request(req().url,{method:'POST',body:'{invalid'}),{planId});expect(response.status).toBe(401);expect(response.headers.get('cache-control')).toBe('private, no-store')})
it('refuses cross-origin approval of an otherwise valid selection',async()=>expect((await websiteMockupApi('approve',req(body(),'https://evil.example'),{planId})).status).toBe(403))
it('does not accept approval identity or arbitrary artifact bytes from the client',async()=>{expect((await websiteMockupApi('approve',req({...body(),approvedBy:userId}),{planId})).status).toBe(400);expect((await websiteMockupApi('approve',req({...body(),canonicalDraft:'<script>evil</script>'}),{planId})).status).toBe(400)})
it('denies a project outside the callers scope before any database access',async()=>{state.allowed=false;expect((await websiteMockupApi('approve',req(),{planId})).status).toBe(404)})
