import {it,expect,vi,beforeEach,afterEach} from 'vitest'
// Existing behavioral tests opt into a simulated post-incident-clearance gate;
// production hard-stop behavior is tested independently in activation-fence.test.ts.
vi.mock('../activation-fence',()=>({localTextDispatchEnabled:()=>process.env.ATLAS_LOCAL_TEXT_ENABLED==='true'}))
const f=vi.hoisted(()=>({operator:{ok:true,userId:'11111111-1111-4111-8111-111111111111'} as Record<string,unknown>,sent:[] as unknown[][],reply:{kind:'refused',reason:'SCOPE_REFUSED'} as unknown}))
vi.mock('@/lib/auth/platform-operator',()=>({resolvePlatformOperator:async()=>f.operator}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:async()=>{throw Error('not expected')}})}))
vi.mock('../store',()=>({writeOwnerAdmission:async(...args:unknown[])=>{f.sent.push(args);return f.reply}}))
const api=await import('../admission-api').catch(()=>({}) as typeof import('../admission-api'))
const id='11111111-1111-4111-8111-111111111111'
const body={projectId:id,action:'admit',evidenceHash:'a'.repeat(64),approvedInputHashes:['b'.repeat(64)],dataClass:'synthetic',expiresAt:'2026-11-01T00:00:00.000Z',jobCostCapUsd:0.25,dailyCostCapUsd:5}
const request=(v:unknown,origin='https://omnira.example')=>new Request('https://omnira.example/api/local-text/devices/'+id+'/admissions',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(v)})
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-17'));vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED','true');f.sent.length=0;f.operator={ok:true,userId:id}})
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers()})
it('empty independently qualified catalog denies installed/offline-only evidence',async()=>{expect(typeof api.handleOwnerAdmissionRequest).toBe('function');expect((await api.handleOwnerAdmissionRequest(request(body),id)).status).toBe(409);expect(f.sent).toHaveLength(0)})
it('model-supplied qualification/status/owner cannot create admission',async()=>{for(const extra of [{qualification:{}},{status:'active'},{ownerId:id}])expect((await api.handleOwnerAdmissionRequest(request({...body,...extra}),id)).status).toBe(400);expect(f.sent).toHaveLength(0)})
it('session, feature and CSRF boundaries precede admission',async()=>{f.operator={ok:false,reason:'unauthenticated'};expect((await api.handleOwnerAdmissionRequest(request(body),id)).status).toBe(401);f.operator={ok:true,userId:id};expect((await api.handleOwnerAdmissionRequest(request(body,'https://evil.example'),id)).status).toBe(403);vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED','false');expect((await api.handleOwnerAdmissionRequest(request(body),id)).status).toBe(503);expect(f.sent).toHaveLength(0)})
it('revocation stays available with flag off and carries only authenticated owner scope',async()=>{vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED','false');const response=await api.handleOwnerAdmissionRequest(request({projectId:id,action:'revoke',admissionId:id,expectedVersion:2}),id);expect(response.status).toBe(403);expect(f.sent[0]?.slice(1)).toEqual([id,id,id,'revoke',{id,expectedVersion:2}])})
