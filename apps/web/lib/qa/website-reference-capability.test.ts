import {beforeEach,expect,it,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
const state=vi.hoisted(()=>({authenticated:true,allowed:true,checks:0}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>state.authenticated?
 {ok:true,userId:'10000000-0000-4000-8000-000000000003',allowedProjectIds:[]}:{ok:false,response:Response.json({}, {status:401})}}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({})}))
vi.mock('@/lib/website-build/assets/tickets',async original=>{
 const real=await original<typeof import('@/lib/website-build/assets/tickets')>()
 const {WebsiteBuildError}=await import('@/lib/website-build/store')
 return {...real,assertReferenceWorkspace:async()=>{state.checks++;if(!state.allowed)throw new WebsiteBuildError('NOT_FOUND',404)}}
})
import {GET} from '@/app/api/website-build/references/tickets/route'
const url='http://localhost/api/website-build/references/tickets?'+new URLSearchParams({projectId:randomUUID(),conversationId:randomUUID()})
beforeEach(()=>{state.authenticated=true;state.allowed=true;state.checks=0;vi.stubEnv('ATLAS_REFERENCE_UPLOAD_ENABLED','true');vi.stubEnv('ATLAS_REFERENCE_CHAT_SAVE_ENABLED','')})
for(const enabled of [false,true])it('reports explicit save capability only for authorized upload workspace: '+enabled,async()=>{
 vi.stubEnv('ATLAS_REFERENCE_CHAT_SAVE_ENABLED',String(enabled))
 const r=await GET(new Request(url))
 expect(r.status).toBe(200);expect(await r.json()).toEqual({available:true,canSaveToChat:enabled,...(enabled?{userId:'10000000-0000-4000-8000-000000000003'}:{})})
 expect(state.checks).toBe(1);expect(r.headers.get('cache-control')).toBe('private, no-store')
})
it('does not advertise save when uploads are off or access is denied',async()=>{
 vi.stubEnv('ATLAS_REFERENCE_CHAT_SAVE_ENABLED','true');vi.stubEnv('ATLAS_REFERENCE_UPLOAD_ENABLED','false')
 expect(await(await GET(new Request(url))).json()).toEqual({available:false,reason:'not_activated'})
 expect(state.checks).toBe(0)
 vi.stubEnv('ATLAS_REFERENCE_UPLOAD_ENABLED','true');state.allowed=false
 expect((await GET(new Request(url))).status).toBe(404)
 state.authenticated=false;expect((await GET(new Request(url))).status).toBe(401)
})
it('does not accept a client capability override',async()=>{
 expect((await GET(new Request(url+'&canSaveToChat=true'))).status).toBe(400)
 expect(state.checks).toBe(0)
})
