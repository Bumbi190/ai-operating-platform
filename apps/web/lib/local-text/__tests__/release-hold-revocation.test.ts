import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'

const f=vi.hoisted(()=>{
 const rpc=vi.fn(),from=vi.fn(()=>{throw new Error('unexpected table access')})
 return {rpc,from,admin:vi.fn(()=>({rpc,from})),admission:vi.fn(),
  operator:vi.fn(),profile:vi.fn(()=>{throw new Error('unexpected qualification lookup')})}
})
vi.mock('@/lib/auth/platform-operator',()=>({resolvePlatformOperator:f.operator}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:f.admin}))
vi.mock('../store',()=>({writeOwnerAdmission:f.admission}))
vi.mock('../cloud-profile',()=>({readCloudTextProfile:f.profile}))
import { handleOwnerDeviceRequest } from '../owner-api'
import { handleOwnerAdmissionRequest } from '../admission-api'
import { handleCloudBudgetRequest } from '../budget-api'
import { LOCAL_TEXT_UNRESOLVED_INCIDENT_RELEASE_HOLD,localTextDispatchEnabled } from '../activation-fence'

const owner='11111111-1111-4111-8111-111111111111'
const project='22222222-2222-4222-8222-222222222222'
const device='33333333-3333-4333-8333-333333333333'
const admission='44444444-4444-4444-8444-444444444444'
const authorization='55555555-5555-4555-8555-555555555555'
const revokedDevice={deviceId:device,projectId:project,status:'revoked',version:2,fingerprint:'a'.repeat(64)}
const kinds=['device','admission','budget'] as const
type Kind=typeof kinds[number]
function revoke(kind:Kind) {
 const body=kind==='device'?{projectId:project,action:'revoke',expectedVersion:1}
  :kind==='admission'?{projectId:project,action:'revoke',admissionId:admission,expectedVersion:1}
  :{projectId:project,action:'revoke',authorizationId:authorization,expectedVersion:1}
 const request=new Request('https://omnira.test/api/local-text/test',{
  method:kind==='device'?'PATCH':'POST',headers:{origin:'https://omnira.test','content-type':'application/json'},body:JSON.stringify(body),
 })
 return kind==='device'?handleOwnerDeviceRequest(request,device)
  :kind==='admission'?handleOwnerAdmissionRequest(request,device):handleCloudBudgetRequest(request,admission)
}
beforeEach(()=>{
 vi.clearAllMocks()
 vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED','true')
 expect(LOCAL_TEXT_UNRESOLVED_INCIDENT_RELEASE_HOLD).toBe(true)
 f.operator.mockResolvedValue({ok:true,userId:owner})
 f.rpc.mockImplementation(async(name:string)=>({data:{kind:'applied',value:name==='local_text_owner_device'?revokedDevice:{id:authorization,status:'revoked'}},error:null}))
 f.admission.mockResolvedValue({kind:'applied',value:{id:admission,status:'revoked'}})
})
afterEach(()=>{
 expect(f.profile).not.toHaveBeenCalled();expect(f.from).not.toHaveBeenCalled()
 expect(localTextDispatchEnabled()).toBe(false)
 vi.unstubAllEnvs()
})
describe('authorized safety actions remain available under the real release hold',()=>{
 it.each(kinds)('preserves owner-scoped %s revocation without granting dispatch',async kind=>{
  const response=await revoke(kind)
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(f.admin).toHaveBeenCalledTimes(1)
  if(kind==='device') {
   expect(await response.json()).toEqual({device:revokedDevice})
   expect(f.rpc).toHaveBeenCalledWith('local_text_owner_device',{
    p_owner_id:owner,p_project_id:project,p_device_id:device,p_action:'revoke',p_expected_version:1,p_registration:{},
   })
  } else if(kind==='admission') {
   expect(await response.json()).toEqual({admission:{id:admission,status:'revoked'}})
   expect(f.admission).toHaveBeenCalledWith(expect.any(Object),owner,project,device,'revoke',{id:admission,expectedVersion:1})
  } else {
   expect(await response.json()).toEqual({authorization:{id:authorization,status:'revoked'}})
   expect(f.rpc).toHaveBeenCalledWith('local_text_owner_cloud_budget',{
    p_owner_id:owner,p_project_id:project,p_admission_id:admission,p_action:'revoke',p_specification:{id:authorization,expectedVersion:1},
   })
  }
  expect(f.rpc).toHaveBeenCalledTimes(kind==='admission'?0:1)
  expect(f.admission).toHaveBeenCalledTimes(kind==='admission'?1:0)
 })
 it.each(kinds)('refuses unauthenticated %s revocation before database access',async kind=>{
  f.operator.mockResolvedValue({ok:false,reason:'unauthenticated'})
  const response=await revoke(kind)
  expect(response.status).toBe(401)
  expect(await response.json()).toHaveProperty('error')
  expect(f.admin).not.toHaveBeenCalled();expect(f.rpc).not.toHaveBeenCalled();expect(f.admission).not.toHaveBeenCalled()
 })
 it.each(kinds)('preserves backend scope refusal for %s revocation',async kind=>{
  f.rpc.mockResolvedValue({data:{kind:'refused',reason:'SCOPE_REFUSED'},error:null})
  f.admission.mockResolvedValue({kind:'refused',reason:'SCOPE_REFUSED'})
  const response=await revoke(kind)
  expect(response.status).toBe(403)
  const body=await response.json()
  expect(Object.keys(body)).toEqual(['error'])
  expect(f.rpc).toHaveBeenCalledTimes(kind==='admission'?0:1)
  expect(f.admission).toHaveBeenCalledTimes(kind==='admission'?1:0)
 })
 it.each([
  {label:'revoke array',action:['revoke']},
  {label:'nested revoke array',action:[['revoke']]},
  {label:'approve array',action:['approve']},
 ])('rejects $label as invalid input before any device decision',async({action})=>{
  const request=new Request('https://omnira.test/api/local-text/devices/'+device,{
   method:'PATCH',headers:{origin:'https://omnira.test','content-type':'application/json'},
   body:JSON.stringify({projectId:project,action,expectedVersion:1}),
  })
  const response=await handleOwnerDeviceRequest(request,device)
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({error:'INVALID_REQUEST'})
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(f.rpc).not.toHaveBeenCalled();expect(f.admission).not.toHaveBeenCalled()
 })
 it.each(['array','boxed','coercing'])('refuses an entire inventory containing a %s device status without coercion',async kind=>{
  const convert=vi.fn(()=>'active')
  const status=kind==='array'?['active']:kind==='boxed'?new String('active'):{toString:convert}
  f.rpc.mockResolvedValue({data:{kind:'applied',value:[revokedDevice,{...revokedDevice,deviceId:authorization,status}]},error:null})
  const response=await handleOwnerDeviceRequest(new Request('https://omnira.test/api/local-text/devices?projectId='+project))
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({error:'LOCAL_TEXT_UNAVAILABLE'})
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(convert).not.toHaveBeenCalled()
  expect(f.rpc).toHaveBeenCalledTimes(1)
 })
 it.each(['pending','active','paused','revoked','lost','retired'])('preserves valid primitive device status %s without enabling dispatch',async status=>{
  const receipt={...revokedDevice,status}
  f.rpc.mockResolvedValue({data:{kind:'applied',value:[receipt]},error:null})
  const response=await handleOwnerDeviceRequest(new Request('https://omnira.test/api/local-text/devices?projectId='+project))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({enabled:false,devices:[receipt]})
  expect(f.admission).not.toHaveBeenCalled()
 })
 it('keeps owner device inventory readable while reporting enabled false',async()=>{
  f.rpc.mockResolvedValue({data:{kind:'applied',value:[revokedDevice]},error:null})
  const response=await handleOwnerDeviceRequest(new Request('https://omnira.test/api/local-text/devices?projectId='+project))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({enabled:false,devices:[revokedDevice]})
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(f.rpc).toHaveBeenCalledTimes(1)
  expect(f.rpc).toHaveBeenCalledWith('local_text_owner_devices',{p_owner_id:owner,p_project_id:project})
  expect(f.admission).not.toHaveBeenCalled()
 })
})
