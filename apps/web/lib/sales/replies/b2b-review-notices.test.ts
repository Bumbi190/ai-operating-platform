import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({access:{ok:true,userId:'20000000-0000-4000-8000-000000000001',allowedProjectIds:[] as string[]},read:vi.fn(),admin:vi.fn(()=>({}))}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>state.access}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:state.admin}))
vi.mock('@/lib/sales/replies/store',()=>({readReplyDrafts:state.read}))
import {GET} from '@/app/api/sales/replies/review-notices/route'
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`
beforeEach(()=>{state.access={ok:true,userId:'20000000-0000-4000-8000-000000000001',allowedProjectIds:[id(1),id(2),id(3)]};state.read.mockReset();state.admin.mockClear();vi.stubEnv('ATLAS_SALES_ENABLED','true');vi.stubEnv('ATLAS_SALES_PROJECT_IDS',`${id(1)},${id(2)}`)})
afterEach(()=>vi.unstubAllEnvs())
describe('private pending reviews across admitted projects',()=>{
 it('reads only owner-admitted projects and returns editorial IDs without private content',async()=>{
  state.read.mockImplementation(async(_db,_p,input)=>({jobs:[{id:input.projectId,status:'awaiting_review',sourceCurrent:true,newerIncoming:false}],drafts:[{jobId:input.projectId,current:true,status:'pending',approvalId:'approval-'+input.projectId,questions:[],body:'PRIVATE_CANARY',toEmail:'private@example.invalid'}]}))
  const response=await GET();expect(response.status).toBe(200)
  expect(state.read.mock.calls.map(call=>call[2].projectId)).toEqual([id(1),id(2)])
  const value=await response.json();expect(value.pendingCount).toBe(2);expect(value.approvalIds).toHaveLength(2)
  expect(JSON.stringify(value)).not.toContain('PRIVATE_CANARY');expect(JSON.stringify(value)).not.toContain('private@example.invalid')
  expect(response.headers.get('cache-control')).toBe('private, no-store')
 })
 it('refuses malformed configuration before privileged reads despite a valid legacy singleton',async()=>{
  vi.stubEnv('ATLAS_SALES_PROJECT_IDS',`${id(1)},*`);vi.stubEnv('ATLAS_SALES_PROJECT_ID',id(1))
  expect((await GET()).status).toBe(404);expect(state.read).not.toHaveBeenCalled();expect(state.admin).not.toHaveBeenCalled()
 })
 it('never reads an admitted project outside session access',async()=>{
  state.access.allowedProjectIds=[id(3)];expect((await GET()).status).toBe(404)
  expect(state.read).not.toHaveBeenCalled();expect(state.admin).not.toHaveBeenCalled()
 })
})
