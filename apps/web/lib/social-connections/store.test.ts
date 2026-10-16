import {beforeAll,it,expect} from 'vitest'
import {randomUUID,createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import {initializeConnectionDb} from './test-db'
import {testSql,TEST_PRINCIPAL} from '../website-build/test-db'
import {proposeSocialLaunchPlan,decideSocialLaunchPlan} from '../social-launch/store'
import {beginConnection,consumeConnection,stageConnection,readConnection,commitConnection,probeConnectionGrant,abortConnection,writeConnectionHealth} from './store'
import type {Grant} from './types'
let db:ReturnType<typeof initializeConnectionDb>
beforeAll(()=>{db=initializeConnectionDb()},15000)
async function fixture(approved=true){
 const projectId=randomUUID(),p={...TEST_PRINCIPAL,allowedProjectIds:[projectId]}
 testSql("insert into projects(id,owner_id,name,slug) values('"+projectId+"','"+p.userId+"','Handlarbörsen','connect-"+projectId+"');")
 const plan=await proposeSocialLaunchPlan(db,p,{projectId,expectedRevisionId:null,idempotencyKey:randomUUID(),choices:[{channel:'linkedin',purpose:'B2B',format:'link',cadence:'weekly'}]})
 if(approved)await decideSocialLaunchPlan(db,p,{projectId,revisionId:plan.currentRevision!.id,sha256:plan.currentRevision!.sha256,decision:'approve',idempotencyKey:randomUUID()})
 const stateHash=createHash('sha256').update(randomUUID()).digest('hex')
 const input={projectId,provider:'linkedin' as const,planRevisionId:plan.currentRevision!.id,expectedBindingId:null,stateHash,verifier:'v'.repeat(43)}
 const id=String(Date.now())+String(Math.floor(Math.random()*10000000))
 const grant:Grant={accessToken:'private-access',refreshToken:'private-refresh',scopes:['r_organization_admin','w_organization_social'],expiresAt:new Date(Date.now()+3600000).toISOString(),refreshExpiresAt:null,candidates:[{key:id,accountId:id,accountLabel:'Handlarbörsen',destinationId:null,destinationLabel:null}]}
 return {p,input,grant}
}
async function staged(f:Awaited<ReturnType<typeof fixture>>){
 const start=await beginConnection(db,f.p,f.input);await consumeConnection(db,f.p,{provider:'linkedin',stateHash:f.input.stateHash})
 return stageConnection(db,f.p,{intentId:start.intentId,grant:f.grant})
}
it('requires an exact current approved channel plan and actual project owner',async()=>{
 const f=await fixture(false)
 await expect(beginConnection(db,f.p,f.input)).rejects.toMatchObject({code:'PLAN_REVIEW_REQUIRED'})
 const a=await fixture()
 await expect(beginConnection(db,{...a.p,allowedProjectIds:[]},a.input)).rejects.toMatchObject({code:'NOT_FOUND'})
 await expect(beginConnection(db,{...a.p,userId:'20000000-0000-4000-8000-000000000002'},a.input)).rejects.toMatchObject({code:'NOT_FOUND'})
})
it('consumes a state once for the exact operator/provider and clears its verifier',async()=>{
 const f=await fixture(),start=await beginConnection(db,f.p,f.input)
 await expect(consumeConnection(db,{...f.p,userId:'20000000-0000-4000-8000-000000000002'},{provider:'linkedin',stateHash:f.input.stateHash})).rejects.toMatchObject({code:'NOT_FOUND'})
 await expect(consumeConnection(db,f.p,{provider:'pinterest',stateHash:f.input.stateHash})).rejects.toMatchObject({code:'NOT_FOUND'})
 expect((await consumeConnection(db,f.p,{provider:'linkedin',stateHash:f.input.stateHash})).verifier).toBe(f.input.verifier)
 await expect(consumeConnection(db,f.p,{provider:'linkedin',stateHash:f.input.stateHash})).rejects.toMatchObject({code:'EXPIRED'})
 expect(testSql("select code_verifier is null from social_connection_intents where id='"+start.intentId+"';")).toBe('t')
})
it('stages proven choices privately and does not bind until the operator chooses',async()=>{
 const f=await fixture(),view=await staged(f)
 expect(view.status).toBe('awaiting_selection');expect(view.candidates).toEqual(f.grant.candidates)
 expect(JSON.stringify(view)).not.toContain('private-access');expect(JSON.stringify(await readConnection(db,f.p,{projectId:f.input.projectId,intentId:view.intentId}))).not.toContain('private-refresh')
 expect(testSql("select count(*) from social_account_bindings where project_id='"+f.input.projectId+"';")).toBe('0')
})
it('atomically commits binding, credential, audit and health and clears staged secrets',async()=>{
 const f=await fixture(),view=await staged(f),input={projectId:f.input.projectId,intentId:view.intentId,candidateKey:f.grant.candidates[0].key}
 const done=await commitConnection(db,f.p,input)
 expect(done.status).toBe('connected');expect(done.bindingId).toMatch(/^[a-f0-9-]{36}$/);expect(JSON.stringify(done)).not.toContain('private-')
 expect((await commitConnection(db,f.p,input)).bindingId).toBe(done.bindingId)
 expect(testSql("select access_token is null and refresh_token is null and code_verifier is null from social_connection_intents where id='"+view.intentId+"';")).toBe('t')
 expect(testSql("select count(*) from platform_tokens where project_id='"+f.input.projectId+"' and binding_id='"+done.bindingId+"' and token_type='oauth_user';")).toBe('1')
 expect(testSql("select count(*) from platform_credential_events where operation_id='"+view.intentId+"' and outcome='replaced';")).toBe('1')
})
it('refuses a stale plan while consent is in flight and retains no partial binding',async()=>{
 const f=await fixture(),view=await staged(f)
 await proposeSocialLaunchPlan(db,f.p,{projectId:f.input.projectId,expectedRevisionId:f.input.planRevisionId,idempotencyKey:randomUUID(),choices:[]})
 await expect(commitConnection(db,f.p,{projectId:f.input.projectId,intentId:view.intentId,candidateKey:f.grant.candidates[0].key})).rejects.toMatchObject({code:'PLAN_REVIEW_REQUIRED'})
 expect(testSql("select count(*) from platform_tokens where project_id='"+f.input.projectId+"';")).toBe('0')
})
it('refuses a changed binding and an arbitrary unproven choice',async()=>{
 const f=await fixture(),view=await staged(f),input={projectId:f.input.projectId,intentId:view.intentId,candidateKey:'not-proven'}
 await expect(commitConnection(db,f.p,input)).rejects.toMatchObject({code:'INVALID_BODY'})
 testSql("insert into social_account_bindings(project_id,platform,external_account_id,account_label,credential_source,verification,verified_at,bound_by) values('"+f.input.projectId+"','linkedin','different-"+f.input.projectId+"','Other','project_store','provider_attested',now(),'user:"+f.p.userId+"');")
 await expect(commitConnection(db,f.p,{...input,candidateKey:f.grant.candidates[0].key})).rejects.toMatchObject({code:'BINDING_CHANGED'})
})
it('enforces one project per account and rolls back a conflicting credential write',async()=>{
 const f=await fixture(),a=await staged(f);await commitConnection(db,f.p,{projectId:f.input.projectId,intentId:a.intentId,candidateKey:f.grant.candidates[0].key})
 const other=await fixture();other.grant=f.grant;const b=await staged(other)
 await expect(commitConnection(db,other.p,{projectId:other.input.projectId,intentId:b.intentId,candidateKey:other.grant.candidates[0].key})).rejects.toMatchObject({code:'ACCOUNT_IN_USE'})
 expect(testSql("select count(*) from platform_tokens where project_id='"+other.input.projectId+"';")).toBe('0')
 expect(testSql("select count(*) from social_account_bindings where project_id='"+other.input.projectId+"';")).toBe('0')
})
it('refuses expired state, foreign intent and model/client secret overrides',async()=>{
 const f=await fixture(),start=await beginConnection(db,f.p,f.input)
 testSql("update social_connection_intents set expires_at=created_at+interval '1 microsecond' where id='"+start.intentId+"';")
 await expect(consumeConnection(db,f.p,{provider:'linkedin',stateHash:f.input.stateHash})).rejects.toMatchObject({code:'EXPIRED'})
 const a=await fixture(),view=await staged(a)
 await expect(readConnection(db,f.p,{projectId:f.input.projectId,intentId:view.intentId})).rejects.toMatchObject({code:'NOT_FOUND'})
 await expect(commitConnection(db,a.p,{projectId:a.input.projectId,intentId:view.intentId,candidateKey:a.grant.candidates[0].key,accessToken:'override'} as any)).rejects.toMatchObject({code:'INVALID_BODY'})
})
it('keeps intent storage/RPC server-only and legacy token types intact',()=>{
 expect(testSql("select relrowsecurity from pg_class where oid='public.social_connection_intents'::regclass;")).toBe('t')
 expect(testSql("select has_table_privilege('anon','social_connection_intents','select') or has_table_privilege('authenticated','platform_tokens','select') or has_function_privilege('authenticated','social_connection_commit(jsonb,jsonb)','execute');")).toBe('f')
 expect(()=>testSql("insert into platform_tokens(project_id,platform,token_type,access_token) values('10000000-0000-4000-8000-000000000001','linkedin','page','private');")).toThrow()
})

it('reconnects against the exact existing binding and supersedes it atomically',async()=>{
 const f=await fixture(),view=await staged(f),first=await commitConnection(db,f.p,{projectId:f.input.projectId,intentId:view.intentId,candidateKey:f.grant.candidates[0].key})
 const input={...f.input,expectedBindingId:first.bindingId,stateHash:createHash('sha256').update(randomUUID()).digest('hex')},start=await beginConnection(db,f.p,input)
 await consumeConnection(db,f.p,{provider:'linkedin',stateHash:input.stateHash});await stageConnection(db,f.p,{intentId:start.intentId,grant:f.grant})
 const second=await commitConnection(db,f.p,{projectId:f.input.projectId,intentId:start.intentId,candidateKey:f.grant.candidates[0].key})
 expect(second.bindingId).not.toBe(first.bindingId)
 expect(testSql("select superseded_at is not null from social_account_bindings where binding_id='"+first.bindingId+"';")).toBe('t')
 expect(testSql("select count(*) from social_account_bindings where project_id='"+f.input.projectId+"' and superseded_at is null;")).toBe('1')
})
it('rolls back the new binding when canonical credential persistence fails',async()=>{
 const f=await fixture(),view=await staged(f),id=f.grant.candidates[0].accountId
 testSql("create function public.social_connection_fixture_fail_token() returns trigger language plpgsql as $f$begin if new.account_id='"+id+"' then raise exception 'fixture token persistence failure';end if;return new;end$f$;create trigger social_connection_fixture_fail_token before insert on public.platform_tokens for each row execute function public.social_connection_fixture_fail_token();")
 try{
  await expect(commitConnection(db,f.p,{projectId:f.input.projectId,intentId:view.intentId,candidateKey:id})).rejects.toMatchObject({code:'UNAVAILABLE'})
  expect(testSql("select count(*) from social_account_bindings where project_id='"+f.input.projectId+"';")).toBe('0')
  expect(testSql("select count(*) from platform_credential_events where operation_id='"+view.intentId+"' and outcome='replaced';")).toBe('0')
 }finally{testSql("drop trigger social_connection_fixture_fail_token on public.platform_tokens;drop function public.social_connection_fixture_fail_token();")}
})
it('serializes independent simultaneous commits and never replaces the winning binding',async()=>{
 const f=await fixture(),a=await staged(f),secondInput={...f.input,stateHash:createHash('sha256').update(randomUUID()).digest('hex')},b=await beginConnection(db,f.p,secondInput)
 await consumeConnection(db,f.p,{provider:'linkedin',stateHash:secondInput.stateHash});await stageConnection(db,f.p,{intentId:b.intentId,grant:f.grant})
 const sql=(intentId:string)=>"set role service_role;select public.social_connection_commit('"+JSON.stringify(f.p)+"'::jsonb,'"+JSON.stringify({projectId:f.input.projectId,intentId,candidateKey:f.grant.candidates[0].key})+"'::jsonb);"
 const run=(body:string)=>new Promise<{code:number|null;error:string}>(resolve=>{
  const child=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',process.env.WEBSITE_BUILD_TEST_DATABASE_NAME!]);let error=''
  child.stderr.on('data',b=>error+=b);child.on('close',code=>resolve({code,error}));child.stdin.end(body)
 })
 const results=await Promise.all([run(sql(a.intentId)),run(sql(b.intentId))])
 expect(results.filter(r=>r.code===0)).toHaveLength(1);expect(results.find(r=>r.code!==0)?.error).toContain('SOCIAL_CONNECTION_BINDING_CHANGED')
 expect(testSql("select count(*) from social_account_bindings where project_id='"+f.input.projectId+"' and superseded_at is null;")).toBe('1')
})

it('exposes a grant only to the server probe and closes failed attempts without a binding',async()=>{
 const f=await fixture(),v=await staged(f),input={projectId:f.input.projectId,intentId:v.intentId,candidateKey:f.grant.candidates[0].key}
 expect((await probeConnectionGrant(db,f.p,input)).accessToken).toBe('private-access')
 await abortConnection(db,f.p,{projectId:input.projectId,intentId:input.intentId,failureStage:'provider_verification'})
 expect(testSql("select access_token is null and refresh_token is null from social_connection_intents where id='"+v.intentId+"';")).toBe('t')
 expect(testSql("select count(*) from platform_credential_events where operation_id='"+v.intentId+"' and outcome='failed';")).toBe('1')
 await expect(commitConnection(db,f.p,input)).rejects.toMatchObject({code:'EXPIRED'})
})
it('fences health persistence to the current binding and canonical credential',async()=>{
 const f=await fixture(),v=await staged(f),done=await commitConnection(db,f.p,{projectId:f.input.projectId,intentId:v.intentId,candidateKey:f.grant.candidates[0].key})
 const input={bindingId:done.bindingId,status:'ok',identityVerified:true,verifiedAccountId:f.grant.candidates[0].accountId,accountLabel:'Handlarbörsen',checkedAt:new Date().toISOString()}
 expect(await writeConnectionHealth(db,input)).toBe(true)
 const next={...f.input,expectedBindingId:done.bindingId,stateHash:createHash('sha256').update(randomUUID()).digest('hex')},intent=await beginConnection(db,f.p,next)
 await consumeConnection(db,f.p,{provider:'linkedin',stateHash:next.stateHash});await stageConnection(db,f.p,{intentId:intent.intentId,grant:f.grant})
 const changed=await commitConnection(db,f.p,{projectId:f.input.projectId,intentId:intent.intentId,candidateKey:f.grant.candidates[0].key})
 expect(await writeConnectionHealth(db,input)).toBe(false)
 expect(testSql("select binding_id='"+changed.bindingId+"'::uuid from social_credential_health where project_id='"+f.input.projectId+"';")).toBe('t')
})

it('does not present a superseded successful intent as a current connection',async()=>{
 const f=await fixture(),v=await staged(f),first={projectId:f.input.projectId,intentId:v.intentId,candidateKey:f.grant.candidates[0].key}
 const done=await commitConnection(db,f.p,first),input={...f.input,expectedBindingId:done.bindingId,stateHash:createHash('sha256').update(randomUUID()).digest('hex')}
 const next=await beginConnection(db,f.p,input);await consumeConnection(db,f.p,{provider:'linkedin',stateHash:input.stateHash});await stageConnection(db,f.p,{intentId:next.intentId,grant:f.grant});await commitConnection(db,f.p,{...first,intentId:next.intentId})
 await expect(readConnection(db,f.p,{projectId:first.projectId,intentId:first.intentId})).rejects.toMatchObject({code:'BINDING_CHANGED'})
 await expect(commitConnection(db,f.p,first)).rejects.toMatchObject({code:'BINDING_CHANGED'})
})
