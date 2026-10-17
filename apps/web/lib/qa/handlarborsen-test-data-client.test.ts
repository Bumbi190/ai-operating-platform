import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import fixture from './fixtures/handlarborsen-test-data/signed-inventory.json'
const m=vi.hoisted(()=>({operator:vi.fn(),access:vi.fn(),rpc:vi.fn(),fetch:vi.fn()}))
vi.mock('@/lib/auth/platform-operator',()=>({resolvePlatformOperator:m.operator}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:m.access,assertProjectAllowed:(id:string,ids:string[])=>ids.includes(id)}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:m.rpc})}))
import {resolveCleanupOperator} from '@/lib/atlas/handlarborsen-test-data/authority'
import {callHandlarborsenTestData,signCleanupEnvelope} from '@/lib/atlas/handlarborsen-test-data/client'
const now=Number(fixture.signedAt),userId=fixture.body.omniraUserId,projectId=fixture.body.projectId,conversationId=fixture.body.conversationId,operatorBindingId=fixture.body.operatorBindingId
const writeKey='local-fixture-execute-key-not-a-real-credential-000000000000'
const inventory={schemaVersion:1,observedAt:'2026-10-17T12:00:00.000Z',organisations:[],nextCursor:null}
const executionId='f1000000-0000-4000-8000-000000000001',packageId='e1000000-0000-4000-8000-000000000001'
const approvedPackage={packageId,projectId,conversationId,operatorBindingId,operation:'quarantine',organisationIds:['61000000-0000-4000-8000-000000000001'],classificationRevision:'a'.repeat(64),graphSha256:'b'.repeat(64),expiresAt:'2026-10-17T12:09:00.000Z',counts:{organizations:1},blockers:[],status:'prepared'}
const command={action:'execute',payload:{packageId,executionId,idempotencyKey:executionId,approvalRef:'a2000000-0000-4000-8000-000000000001',approvedPackage}}
const receipt={packageId,executionId,operation:'quarantine',outcome:'applied',beforeSha256:'a'.repeat(64),afterSha256:'b'.repeat(64),counts:{organizations:1},committedAt:'2026-10-17T12:00:01.000Z'}
async function principal(){const r=await resolveCleanupOperator({projectId,conversationId});if(!r.ok)throw Error('test authority unavailable');return r.principal}
function okResponse(body:string,data:unknown){const sent=JSON.parse(body);return new Response(JSON.stringify({schemaVersion:1,status:'ok',action:sent.action,requestId:sent.requestId,data}),{status:200})}
beforeEach(()=>{
 vi.clearAllMocks();vi.spyOn(Date,'now').mockReturnValue(now);vi.stubGlobal('fetch',m.fetch);
 vi.stubEnv('HANDLARBORSEN_TEST_DATA_READ_KEY',fixture.key);vi.stubEnv('HANDLARBORSEN_TEST_DATA_EXECUTE_KEY',writeKey);vi.stubEnv('HANDLARBORSEN_METRICS_TOKEN','m'.repeat(64));vi.stubEnv('CRON_SECRET','c'.repeat(64));vi.stubEnv('ATLAS_TEST_DATA_MUTATIONS_ENABLED','false');
 m.operator.mockResolvedValue({ok:true,userId,email:'operator@example.test',actor:'user:'+userId});m.access.mockResolvedValue({ok:true,userId,allowedProjectIds:[projectId]});
 m.rpc.mockResolvedValue({data:{userId,projectId,conversationId,operatorBindingId,allowedOperations:['quarantine','restore'],atlasMode:'observer'},error:null});
 m.fetch.mockImplementation((_url:string,options:RequestInit)=>Promise.resolve(okResponse(String(options.body),inventory)));
})
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals()})
it('matches the independent public HMAC signing vector exactly',()=>{
 const signed=signCleanupEnvelope(fixture.body,'read-v1',fixture.key,fixture.signedAt);
 expect(signed.body).toBe(fixture.canonicalBody);expect(signed.headers['x-atlas-signature']).toBe(fixture.signature)
})
it('only posts to the fixed endpoint and derives scope from verified authority',async()=>{
 const result=await callHandlarborsenTestData({action:'inventory',payload:{}},await principal());expect(result).toMatchObject({status:'ok',action:'inventory',data:inventory});
 expect(m.fetch).toHaveBeenCalledTimes(1);const [url,options]=m.fetch.mock.calls[0];
 expect(url).toBe('https://www.handlarborsen.se/api/internal/atlas-test-data');expect(options).toMatchObject({method:'POST',redirect:'error',cache:'no-store'});
 const body=JSON.parse(options.body);expect(body).toMatchObject({schemaVersion:1,projectId,conversationId,omniraUserId:userId,operatorBindingId,action:'inventory'});
 expect(options.body).not.toContain(fixture.key);expect(options.headers['x-atlas-key-id']).toBe('read-v1')
})
it('forged_operator_body_denied without an upstream call',async()=>{
 expect(await callHandlarborsenTestData({action:'inventory',payload:{}},{userId,projectId,conversationId,operatorBindingId,allowedOperations:['quarantine']} as never)).toEqual({status:'denied'});expect(m.fetch).toHaveBeenCalledTimes(0)
})
it('a caller cannot add a URL or principal override to the command',async()=>{
 expect(await callHandlarborsenTestData({action:'inventory',payload:{},url:'https://attacker.example'} as never,await principal())).toEqual({status:'denied'});expect(m.fetch).toHaveBeenCalledTimes(0)
})
it('read or metrics credentials are never substituted for the execute key',async()=>{
 vi.stubEnv('ATLAS_TEST_DATA_MUTATIONS_ENABLED','true');vi.stubEnv('HANDLARBORSEN_TEST_DATA_EXECUTE_KEY','');
 expect(await callHandlarborsenTestData(command as never,await principal())).toEqual({status:'unavailable'});expect(m.fetch).toHaveBeenCalledTimes(0)
})
it('mutation flag defaults closed',async()=>{expect(await callHandlarborsenTestData(command as never,await principal())).toEqual({status:'disabled'});expect(m.fetch).toHaveBeenCalledTimes(0)})
it('read authority does not become a mutation grant',async()=>{
 vi.stubEnv('ATLAS_TEST_DATA_MUTATIONS_ENABLED','true');m.rpc.mockResolvedValue({data:{userId,projectId,conversationId,operatorBindingId,allowedOperations:[],atlasMode:'observer'},error:null});
 expect(await callHandlarborsenTestData(command as never,await principal())).toEqual({status:'denied'});expect(m.fetch).toHaveBeenCalledTimes(0)
})
it('requires a fresh review for an expired exact package before sending',async()=>{
 vi.stubEnv('ATLAS_TEST_DATA_MUTATIONS_ENABLED','true');const input={...command,payload:{...command.payload,approvedPackage:{...approvedPackage,expiresAt:'2026-10-17T11:59:00.000Z'}}};
 expect(await callHandlarborsenTestData(input as never,await principal())).toEqual({status:'needs_new_review'});expect(m.fetch).toHaveBeenCalledTimes(0)
})
it('uses the execute capability and validates the exact receipt binding',async()=>{
 vi.stubEnv('ATLAS_TEST_DATA_MUTATIONS_ENABLED','true');m.fetch.mockImplementation((_url:string,o:RequestInit)=>Promise.resolve(okResponse(String(o.body),receipt)));
 expect(await callHandlarborsenTestData(command as never,await principal())).toMatchObject({status:'ok',action:'execute',data:receipt});expect(m.fetch.mock.calls[0][1].headers['x-atlas-key-id']).toBe('execute-v1')
})
it('redirect_denied_without_forwarding_secret',async()=>{
 m.fetch.mockResolvedValue(new Response('',{status:302,headers:{location:'https://attacker.example'}}));expect(await callHandlarborsenTestData({action:'inventory',payload:{}},await principal())).toEqual({status:'unavailable'});expect(m.fetch).toHaveBeenCalledTimes(1);expect(m.fetch.mock.calls[0][1].redirect).toBe('error')
})
it('rejects oversized or malformed responses without forwarding them',async()=>{
 m.fetch.mockResolvedValue(new Response(' '.repeat(65537),{status:200}));expect(await callHandlarborsenTestData({action:'inventory',payload:{}},await principal())).toEqual({status:'unavailable'});
 m.fetch.mockImplementation((_url:string,o:RequestInit)=>Promise.resolve(okResponse(String(o.body),{...inventory,privateEmail:'hidden@example.test'})));
 expect(await callHandlarborsenTestData({action:'inventory',payload:{}},await principal())).toEqual({status:'unavailable'})
})
it('does not accept a receipt for another execution or expose an exception credential',async()=>{
 vi.stubEnv('ATLAS_TEST_DATA_MUTATIONS_ENABLED','true');m.fetch.mockImplementation((_url:string,o:RequestInit)=>Promise.resolve(okResponse(String(o.body),{...receipt,executionId:'01000000-0000-4000-8000-000000000001'})));
 expect(await callHandlarborsenTestData(command as never,await principal())).toEqual({status:'unknown',executionId});
 m.fetch.mockRejectedValue(new Error(writeKey));const result=await callHandlarborsenTestData(command as never,await principal());expect(result).toEqual({status:'unknown',executionId});expect(JSON.stringify(result)).not.toContain(writeKey)
})
it('a ten-second deadline returns unknown once and never retries a mutation',async()=>{
 vi.useFakeTimers();vi.setSystemTime(now);vi.stubEnv('ATLAS_TEST_DATA_MUTATIONS_ENABLED','true');
 m.fetch.mockImplementation((_url:string,o:RequestInit)=>new Promise((_resolve,reject)=>o.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})));
 const p=await principal(),result=callHandlarborsenTestData(command as never,p);await vi.advanceTimersByTimeAsync(10001);
 expect(await result).toEqual({status:'unknown',executionId});expect(m.fetch).toHaveBeenCalledTimes(1)
})
