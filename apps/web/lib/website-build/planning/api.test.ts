import {beforeAll,beforeEach,describe,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {websitePlanApi,websiteBuilderSettingsApi,websiteProjectRootApi} from './api'
import {websiteBuildApi} from '../api'
import {initializeWorkerDb,testSql,TEST_AGENT,TEST_PRINCIPAL,TEST_PROJECT} from '../test-db'
import {saveWebsitePlanRevision,setProjectWebsiteBuilder} from './store'
import type {PlanView} from './types'
const state=vi.hoisted(()=>({db:null as unknown,authenticated:true,allowed:true}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>state.db}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>state.authenticated?{ok:true,...TEST_PRINCIPAL,allowedProjectIds:state.allowed?TEST_PRINCIPAL.allowedProjectIds:[]}:{ok:false,response:Response.json({error:'Unauthorized'},{status:401})}}))
let db:ReturnType<typeof initializeWorkerDb>
const req=(body?:unknown,query='',origin='http://localhost')=>new Request('http://localhost/api/website-build-plans'+query,body===undefined?{headers:{host:'localhost'}}:{method:'POST',headers:{origin,host:'localhost','content-type':'application/json'},body:JSON.stringify(body)})
const content=()=>({title:'Plan',purpose:'Visa',audience:'Alla',pages:[{key:'index',title:'Hem',purpose:'Visa'}],design:{style:'Blå',reference:null},features:[],architecture:'Statisk',steps:['Bygg'],domain:{registrar:'strato' as const,requestedName:null}})
function conv(){const id=randomUUID();testSql("insert into conversations(id,user_id,project_id) values('"+id+"','"+TEST_PRINCIPAL.userId+"','"+TEST_PROJECT+"');");return id}
async function plan(){await setProjectWebsiteBuilder(db,TEST_PRINCIPAL,{projectId:TEST_PROJECT,agentId:TEST_AGENT});return saveWebsitePlanRevision(db,TEST_PRINCIPAL,{projectId:TEST_PROJECT,conversationId:conv(),expectedRevisionId:null,content:content(),idempotencyKey:randomUUID()})}
const approval=(p:PlanView)=>({projectId:TEST_PROJECT,revisionId:p.currentRevision.revisionId,sha256:p.currentRevision.sha256,idempotencyKey:randomUUID()})
beforeAll(()=>{db=initializeWorkerDb();state.db=db})
beforeEach(()=>{state.authenticated=true;state.allowed=true})
describe('operator website plan HTTP boundary',()=>{
 it('denies unauthenticated requests before parsing the body',async()=>{state.authenticated=false;const r=await websitePlanApi('save',req({}),{});expect(r.status).toBe(401);expect(r.headers.get('cache-control')).toBe('private, no-store')})
 it('stores a real draft and returns private plan state',async()=>{const r=await websitePlanApi('save',req({projectId:TEST_PROJECT,conversationId:conv(),expectedRevisionId:null,content:content(),idempotencyKey:randomUUID()}),{});expect(r.status).toBe(201);expect((await r.json()).currentRevision.content.title).toBe('Plan');expect(r.headers.get('cache-control')).toBe('private, no-store')})
 it('gets only an owned plan',async()=>{const p=await plan();state.allowed=false;expect((await websitePlanApi('get',req(undefined,'?projectId='+TEST_PROJECT),{planId:p.ref.planId})).status).toBe(404)})
 it('refuses a cross-origin approval',async()=>{const p=await plan();expect((await websitePlanApi('approve',req(approval(p),'','https://evil.example'),{planId:p.ref.planId})).status).toBe(403)})
 it('rejects a body exceeding 65536 bytes',async()=>expect((await websitePlanApi('save',req({x:'a'.repeat(65537)}),{})).status).toBe(413))
 it('rejects malformed identifiers and extra authority fields',async()=>{expect((await websitePlanApi('get',req(undefined,'?projectId=../x'),{planId:randomUUID()})).status).toBe(400);const p=await plan();expect((await websitePlanApi('approve',req({...approval(p),approvedBy:TEST_PRINCIPAL.userId}),{planId:p.ref.planId})).status).toBe(400)})
 it('does not accept a secret as an authority override',async()=>{const p=await plan(),r=await websitePlanApi('approve',req({...approval(p),credential:'example-value'}),{planId:p.ref.planId});expect(r.status).toBe(400);expect(await r.text()).not.toContain('example-value')})
 it('returns stale plan as a concrete 409',async()=>{const p=await plan();const r=await websitePlanApi('approve',req({...approval(p),sha256:'0'.repeat(64)}),{planId:p.ref.planId});expect(r.status).toBe(409);expect((await r.json()).code).toBe('PLAN_STALE')})
 it('starts through an operator decision and retries the same committed session',async()=>{const p=await plan(),a=await websitePlanApi('approve',req(approval(p)),{planId:p.ref.planId});expect(a.status).toBe(200);const d=await a.json(),body={projectId:TEST_PROJECT,revisionId:p.currentRevision.revisionId,sha256:p.currentRevision.sha256,decisionId:d.id},one=await websitePlanApi('start',req(body),{planId:p.ref.planId}),two=await websitePlanApi('start',req(body),{planId:p.ref.planId});expect(one.status).toBe(201);expect((await one.json()).sessionId).toBe((await two.json()).sessionId)})
 it('legacy unplanned create returns plan review guidance for an owned conversation',async()=>{const id=conv(),r=await websiteBuildApi('create',req({projectId:TEST_PROJECT,agentId:TEST_AGENT,conversationId:id,brief:'Bygg',idempotencyKey:randomUUID()}),{});expect(r.status).toBe(409);const b=await r.json();expect(b.code).toBe('PLAN_REVIEW_REQUIRED');expect(b.conversationUrl).toBe('/chat/'+id)})
 it('persists one explicit project builder and refuses a foreign agent',async()=>{const a=await websiteBuilderSettingsApi(req({projectId:TEST_PROJECT,agentId:TEST_AGENT}));expect(a.status).toBe(200);expect((await a.json()).builderAgentId).toBe(TEST_AGENT);expect((await websiteBuilderSettingsApi(req({projectId:TEST_PROJECT,agentId:'40000000-0000-4000-8000-000000000002'}))).status).toBe(404)})
 it('does not require service access to auth.users for directory preferences',async()=>{expect(testSql("select has_table_privilege('service_role','auth.users','select');")).toBe('f');const response=await websiteProjectRootApi(req());expect(response.status).toBe(200)})
 it('saves a personal project base directory without pretending the runner created it',async()=>{const root={os:'windows',root:'D:\\My projects',targetId:null},r=await websiteProjectRootApi(req({root}));expect(r.status).toBe(200);expect(await r.json()).toEqual(root);const bad=await websiteProjectRootApi(req({root:{...root,root:'D:\\My projects\\..\\Windows'}}));expect(bad.status).toBe(400)})
})