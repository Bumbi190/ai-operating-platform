import {it,expect,vi,beforeEach,afterEach} from 'vitest'
// Existing behavioral tests opt into a simulated post-incident-clearance gate;
// production hard-stop behavior is tested independently in activation-fence.test.ts.
vi.mock('../activation-fence',()=>({localTextDispatchEnabled:()=>process.env.ATLAS_LOCAL_TEXT_ENABLED==='true'}))
import {generateKeyPairSync} from 'node:crypto'
import {canonicalJson,sha256} from '@omnira/local-text-contract'
const fixture=vi.hoisted(()=>({operator:{ok:true,userId:'11111111-1111-4111-8111-111111111111',email:'owner@example.test',actor:'user:test'} as Record<string,unknown>,sent:[] as {name:string,args:Record<string,unknown>}[],reply:{kind:'applied',value:{deviceId:'11111111-1111-4111-8111-111111111111',projectId:'11111111-1111-4111-8111-111111111111',status:'pending',version:1,fingerprint:'a'.repeat(64)}} as unknown}))
vi.mock('@/lib/auth/platform-operator',()=>({resolvePlatformOperator:async()=>fixture.operator}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:async(name:string,args:Record<string,unknown>)=>{fixture.sent.push({name,args});return {data:fixture.reply,error:null}}})}))
const api=await import('../owner-api').catch(e=>{if(String(e).includes('Failed to load')||String(e).includes('Cannot find module'))return {} as typeof import('../owner-api');throw e})
const id='11111111-1111-4111-8111-111111111111',key=generateKeyPairSync('ec',{namedCurve:'P-256'}).publicKey.export({format:'jwk'})
const register={projectId:id,deviceId:id,keyId:id,publicJwk:key,buildHash:'a'.repeat(64)}
function request(body:unknown,origin='https://omnira.example',method='POST'){return new Request('https://omnira.example/api/local-text/devices'+(method==='PATCH'?'/'+id:''),{method,headers:{'content-type':'application/json',origin},body:JSON.stringify(body)})}
beforeEach(()=>{vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED','true');fixture.sent.length=0;fixture.reply={kind:'applied',value:{deviceId:id,projectId:id,status:'pending',version:1,fingerprint:'a'.repeat(64)}};fixture.operator={ok:true,userId:id,email:'owner@example.test',actor:'user:test'}})
afterEach(()=>vi.unstubAllEnvs())
it('requires configured feature, verified operator and same-origin JSON before mutation',async()=>{
 expect(typeof api.handleOwnerDeviceRequest).toBe('function')
 vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED','false');expect((await api.handleOwnerDeviceRequest(request(register))).status).toBe(503);vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED','true')
 fixture.operator={ok:false,reason:'not_platform_operator'};expect((await api.handleOwnerDeviceRequest(request(register))).status).toBe(403)
 fixture.operator={ok:true,userId:id,email:'owner@example.test',actor:'user:test'};expect((await api.handleOwnerDeviceRequest(request(register,'https://evil.example'))).status).toBe(403);expect(fixture.sent).toHaveLength(0)
})
it('registers only a pending device for the server-authenticated owner',async()=>{
 const response=await api.handleOwnerDeviceRequest(request(register));expect(response.status).toBe(200)
 expect(fixture.sent[0]).toMatchObject({name:'local_text_owner_device',args:{p_owner_id:id,p_project_id:id,p_device_id:id,p_action:'register',p_expected_version:null,p_registration:{keyId:id,publicJwk:key,buildHash:register.buildHash,fingerprint:sha256(canonicalJson(key))}}})
})
it('rejects self-assigned status, owner and invalid/private JWK fields',async()=>{
 for(const body of [{...register,status:'active'},{...register,ownerId:id},{...register,publicJwk:{...key,d:'secret'}}])expect((await api.handleOwnerDeviceRequest(request(body))).status).toBe(400)
 expect(fixture.sent).toHaveLength(0)
})
it('approval binds device, expected version and exact fingerprint without overriding scope refusal',async()=>{
 const body={projectId:id,action:'approve',expectedVersion:2,confirmFingerprint:'a'.repeat(64)}
 fixture.reply={kind:'refused',reason:'SCOPE_REFUSED'};const response=await api.handleOwnerDeviceRequest(request(body,undefined,'PATCH'),id);expect(response.status).toBe(403)
 expect(fixture.sent[0]).toMatchObject({args:{p_owner_id:id,p_project_id:id,p_device_id:id,p_action:'approve',p_expected_version:2,p_registration:{confirmFingerprint:body.confirmFingerprint}}})
})
