import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
const state=vi.hoisted(()=>({calls:[] as Array<[string,string,unknown]>,projects:[] as unknown[],tables:[] as string[],archive:vi.fn(),saved:vi.fn(),timing:vi.fn(),client:vi.fn(),access:vi.fn()}))
vi.mock('../supabase/server',()=>({createClient:state.client}))
vi.mock('../supabase/admin',()=>({createAdminClient:()=>({})}))
vi.mock('../auth/project-access',()=>({resolveProjectAccess:state.access}))
vi.mock('../handlarborsen/lead-finder/research-archive-server',()=>({loadArchivedLeadResearchForOwner:state.archive}))
vi.mock('../handlarborsen/lead-finder/saved-candidates-server',()=>({loadSavedCandidatesForOwner:state.saved}))
vi.mock('../sales/timing/store',()=>({readContactTiming:state.timing}))
import {readCompanyInput,companyDirectoryEnabled,companyDirectoryForOwner} from '../sales/companies/server'
const hb='8f673c09-1c8f-4d78-876e-4c14bf1c89b3',other='10000000-0000-4000-8000-000000000001',userId='10000000-0000-4000-8000-000000000002',principal={userId,allowedProjectIds:[hb,other]}
beforeEach(()=>{
 vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('HB_LEADFINDER_SCB_PREVIEW_ENABLED','true');vi.stubEnv('SCB_API_KEY','synthetic');vi.stubEnv('HB_LEADFINDER_CONTACT_READ_ENABLED','true');vi.stubEnv('ATLAS_SALES_ENABLED','false')
 state.calls=[];state.tables=[];state.projects=[{id:hb,name:'HB',slug:'handlarborsen',owner_id:userId},{id:other,name:'Service',slug:'service',owner_id:userId}]
 state.archive.mockReset().mockResolvedValue({status:'disabled'});state.saved.mockReset().mockResolvedValue({status:'disabled',candidates:[],outreachReady:false});state.timing.mockReset();state.client.mockReset();state.access.mockReset().mockResolvedValue({ok:true,...principal})
 state.client.mockResolvedValue({from:(table:string)=>{state.tables.push(table);const query={select:(_fields:string)=>query,eq:(key:string,value:unknown)=>{state.calls.push([table,key,value]);return query},order:()=>query,gt:()=>query,limit:()=>query,then:(resolve:(x:unknown)=>unknown)=>Promise.resolve({data:table==='projects'?state.projects:[],error:null}).then(resolve)};return query}})
})
afterEach(()=>vi.unstubAllEnvs())
describe('real directory server wiring remains scoped and read-only',()=>{
 it('reads only the selected owned project and does not invoke HB archives or any job RPC',async()=>{
  const result=await readCompanyInput(other,principal);expect(result.project).toMatchObject({id:other,slug:'service'});expect(result.contacts).toEqual({status:'ready',contacts:[]});expect(state.calls).toContainEqual(['projects','owner_id',userId]);expect(state.calls).toContainEqual(['sales_contacts','project_id',other]);expect(state.tables).toEqual(['projects','sales_contacts']);expect(state.archive).not.toHaveBeenCalled();expect(state.saved).not.toHaveBeenCalled();expect(state.timing).not.toHaveBeenCalled()
 })
 it('retains HB-only archive readers in the HB scope',async()=>{await readCompanyInput(hb,principal);expect(state.archive).toHaveBeenCalledWith(hb,expect.anything());expect(state.saved).toHaveBeenCalledWith(hb)})
 it('denies an unowned project before client creation and foreign owner metadata before contact access',async()=>{
  await expect(readCompanyInput(other,{userId,allowedProjectIds:[hb]})).rejects.toBeDefined();expect(state.client).not.toHaveBeenCalled();state.projects=[{id:other,name:'Foreign',slug:'foreign',owner_id:'another-owner'}];await expect(readCompanyInput(other,principal)).rejects.toMatchObject({status:503});expect(state.tables).toEqual(['projects'])
 })
 it('does not enable the generic directory in production through the preview flag',()=>{expect(companyDirectoryEnabled(other)).toBe(true);vi.stubEnv('VERCEL_ENV','production');expect(companyDirectoryEnabled(other)).toBe(false)})
 it('does not read data for an anonymous directory request',async()=>{state.access.mockResolvedValue({ok:false,response:new Response(null,{status:401})});expect(await companyDirectoryForOwner(other)).toBeNull();expect(state.client).not.toHaveBeenCalled()})
})
