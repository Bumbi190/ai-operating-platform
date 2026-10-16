import {beforeAll,beforeEach,afterEach,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {initializeConnectionDb} from './test-db'
import {testSql,TEST_PRINCIPAL} from '../website-build/test-db'
import {proposeSocialLaunchPlan,decideSocialLaunchPlan} from '../social-launch/store'
import {socialConnectionStart,socialConnectionCallback,socialConnectionApi} from './api'
import {REQUIRED_SCOPES} from './providers'
const state=vi.hoisted(()=>({db:null as unknown,auth:true,operator:true,scope:true,projectId:'',planRevisionId:''}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>state.db}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>state.auth?{ok:true,...TEST_PRINCIPAL,allowedProjectIds:state.scope?[state.projectId]:[]}:{ok:false,response:Response.json({code:'UNAUTHENTICATED'},{status:401})}}))
vi.mock('@/lib/auth/platform-operator',()=>({resolvePlatformOperator:async()=>state.auth&&state.operator?{ok:true,userId:TEST_PRINCIPAL.userId,actor:'user:'+TEST_PRINCIPAL.userId}:{ok:false,reason:state.auth?'not_platform_operator':'unauthenticated'}}))
const req=(path:string,body?:unknown,origin='http://localhost')=>new Request('http://localhost'+path,body===undefined?{}:{method:'POST',headers:{origin,host:'localhost','content-type':'application/json'},body:JSON.stringify(body)})
const startBody=()=>({projectId:state.projectId,planRevisionId:state.planRevisionId,expectedBindingId:null})
beforeAll(()=>{state.db=initializeConnectionDb()},15000)
beforeEach(async()=>{
 state.auth=true;state.operator=true;state.scope=true;state.projectId=randomUUID()
 testSql("insert into projects(id,owner_id,name,slug) values('"+state.projectId+"','"+TEST_PRINCIPAL.userId+"','Handlarbörsen','api-connect-"+state.projectId+"');")
 const p={...TEST_PRINCIPAL,allowedProjectIds:[state.projectId]},db=state.db as ReturnType<typeof initializeConnectionDb>,plan=await proposeSocialLaunchPlan(db,p,{projectId:state.projectId,expectedRevisionId:null,idempotencyKey:randomUUID(),choices:[{channel:'linkedin',purpose:'B2B',format:'link',cadence:'weekly'}]})
 state.planRevisionId=plan.currentRevision!.id;await decideSocialLaunchPlan(db,p,{projectId:state.projectId,revisionId:plan.currentRevision!.id,sha256:plan.currentRevision!.sha256,decision:'approve',idempotencyKey:randomUUID()})
 vi.stubEnv('LINKEDIN_CLIENT_ID','fixture-app');vi.stubEnv('LINKEDIN_CLIENT_SECRET','fixture-secret')
})
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})
const endpoint='/api/social-connections/linkedin/start'
async function begin(){
 const r=await socialConnectionStart(req(endpoint,startBody()),{provider:'linkedin'});expect(r.status).toBe(200);return new URL((await r.json()).authorizationUrl)
}
function network(){
 const id=String(Date.now())+String(Math.floor(Math.random()*100000)),calls:string[]=[]
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{
  const url=new URL(String(input));calls.push(url.pathname)
  const bodies:Record<string,unknown>={'/oauth/v2/accessToken':{access_token:'private-provider-access',expires_in:3600},'/oauth/v2/introspectToken':{active:true,scope:REQUIRED_SCOPES.linkedin.join(',')},'/rest/organizationAcls':{elements:[{organization:'urn:li:organization:'+id,role:'ADMINISTRATOR',state:'APPROVED'}]},'/rest/organizations':{results:{[id]:{id,localizedName:'Handlarbörsen'}}}}
  return Response.json(bodies[url.pathname]??{})
 }))
 return {id,calls}
}
it('denies no session, nonoperator, foreign scope, cross origin and authority overrides',async()=>{
 state.auth=false;expect((await socialConnectionStart(req(endpoint,startBody()),{provider:'linkedin'})).status).toBe(401)
 state.auth=true;state.operator=false;expect((await socialConnectionStart(req(endpoint,startBody()),{provider:'linkedin'})).status).toBe(403)
 state.operator=true;state.scope=false;expect((await socialConnectionStart(req(endpoint,startBody()),{provider:'linkedin'})).status).toBe(404)
 state.scope=true;expect((await socialConnectionStart(req(endpoint,startBody(),'https://evil.example'),{provider:'linkedin'})).status).toBe(403)
 const r=await socialConnectionStart(req(endpoint,{...startBody(),token:'override-private'}),{provider:'linkedin'});expect(r.status).toBe(400);expect(await r.text()).not.toContain('override-private')
})
it('exposes fixed consent URL only, stages safe choices, then rechecks the chosen Page and commits',async()=>{
 const n=network(),url=await begin();expect(url.origin).toBe('https://www.linkedin.com');expect(url.searchParams.get('redirect_uri')).toBe('https://app.omniraos.se/api/social-connections/linkedin/callback')
 expect(url.toString()).not.toContain('fixture-secret')
 const callback='/api/social-connections/linkedin/callback?code=private-code&state='+url.searchParams.get('state')
 const r=await socialConnectionCallback(req(callback),{provider:'linkedin'});expect(r.status).toBe(303);expect(r.headers.get('referrer-policy')).toBe('no-referrer')
 const location=new URL(r.headers.get('location')!),intentId=location.searchParams.get('connection')!
 expect(location.pathname).toBe('/projects/api-connect-'+state.projectId+'/social');expect(location.toString()).not.toContain('private-')
 const view=await socialConnectionApi(req('/api/social-connections?projectId='+state.projectId+'&intentId='+intentId));expect(view.status).toBe(200)
 const safe=await view.json();expect(safe.candidates[0].key).toBe(n.id);expect(JSON.stringify(safe)).not.toContain('private-provider-access')
 const done=await socialConnectionApi(req('/api/social-connections',{projectId:state.projectId,intentId,candidateKey:n.id}))
 expect(done.status).toBe(200);expect((await done.json()).status).toBe('connected')
 expect(n.calls.filter(p=>p==='/rest/organizationAcls')).toHaveLength(2)
 expect((await socialConnectionCallback(req(callback),{provider:'linkedin'})).headers.get('location')).not.toContain('connection='+intentId)
})
it('fails closed for missing configuration and X without any provider call or intent',async()=>{
 vi.stubEnv('LINKEDIN_CLIENT_SECRET','');expect((await socialConnectionStart(req(endpoint,startBody()),{provider:'linkedin'})).status).toBe(503)
 const n=network();const r=await socialConnectionStart(req('/api/social-connections/x/start',startBody()),{provider:'x'});expect(r.status).toBe(403);expect((await r.json()).code).toBe('COST_POLICY_REQUIRED');expect(n.calls).toHaveLength(0)
 expect(testSql("select count(*) from social_connection_intents where project_id='"+state.projectId+"';")).toBe('0')
})
it('clears failed consent and never reflects raw callback errors',async()=>{
 const n=network(),url=await begin(),r=await socialConnectionCallback(req('/api/social-connections/linkedin/callback?error=provider-private-message&error_description=private-secret&state='+url.searchParams.get('state')),{provider:'linkedin'})
 expect(r.status).toBe(303);expect(r.headers.get('location')).not.toContain('private');expect(await r.text()).not.toContain('private');expect(n.calls).toHaveLength(0)
 expect(testSql("select count(*) from platform_credential_events where project_id='"+state.projectId+"' and outcome='failed';")).toBe('1')
})
