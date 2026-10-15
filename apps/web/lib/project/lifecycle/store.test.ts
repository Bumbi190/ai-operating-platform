import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {createStudioFixture,sqlJson} from '@/lib/website-build/studio/test-fixture'
import {ensureStudioWorkspace,requestStudioWorkspace} from '@/lib/website-build/studio/store'
import {approvedTestBuild} from '@/lib/website-build/planning/test-fixture'
import {testSql,resetWorkerDb} from '@/lib/website-build/test-db'
import {compileWebsiteArtifact} from '@/lib/website-build/artifact'
import {commitBuildRevision,loadBuildSnapshot,readBuildSession,appendBuildFeedback} from '@/lib/website-build/store'
import type {WriterRef} from '@/lib/website-build/types'
import {readProjectLifecycle,changeProjectLifecycle} from './store'

async function fixture(){
 const f=createStudioFixture();resetWorkerDb();const ref=await ensureStudioWorkspace(f.db,f.owner,{kind:'new',name:'Lifecycle',idempotencyKey:randomUUID()}),p={...f.owner,allowedProjectIds:[...f.owner.allowedProjectIds,ref.projectId]},agent=await f.builder(ref.projectId)
 testSql(`insert into project_budgets(project_id,monthly_sek) values('${ref.projectId}',100);`)
 const session=await approvedTestBuild(f.db,p,{...ref,agentId:agent.id,brief:'En svensk hemsida',idempotencyKey:randomUUID()})
 const claim=()=>{testSql(`update runs set status='running',claim_id=gen_random_uuid(),claimed_at=now(),lease_until=now()+interval '5 minutes',attempts=attempts+1 where id='${session.currentRunId}';`);return JSON.parse(testSql(`select jsonb_build_object('projectId',project_id,'sessionId','${session.sessionId}','runId',id,'claimId',claim_id,'generation',input->'generation') from runs where id='${session.currentRunId}';`)) as WriterRef}
 const change=(action:'archive'|'trash'|'restore',expectedVersion:number,idempotencyKey=randomUUID())=>({projectId:ref.projectId,action,expectedVersion,idempotencyKey})
 return {...f,p,ref,session,claim,change}
}
const artifact=()=>compileWebsiteArtifact({format:'static-website.v1',title:'Sparad',pages:[{key:'index',title:'Hem',bodyHtml:'<h1>Bevara mig</h1>',css:'',behaviors:[]}]})
/** Independent psql transactions, held by input rather than sleeps. */
function connection(){
 const database=process.env.WEBSITE_BUILD_TEST_DATABASE_NAME;if(!/^website_test_[0-9]+$/.test(database??''))throw Error('Owned DB required')
 const name='atlas-lifecycle-'+randomUUID()
 const child=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',database!]);let out='',err='',readyResolve!:()=>void
 const ready=new Promise<void>(r=>readyResolve=r),done=new Promise<{code:number|null;out:string;err:string}>((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve({code,out,err}))})
 child.stdin.write("set application_name='"+name+"';\n")
 child.stdout.on('data',b=>{out+=b;if(out.includes('HELD'))readyResolve()});child.stderr.on('data',b=>err+=b)
 return {name,async hold(sql:string){child.stdin.write('begin;\n'+sql+'\n\\echo HELD\n');await Promise.race([ready,done.then(x=>{throw Error(x.err||'SQL connection ended before hold')})])},finish(sql='commit;'){child.stdin.end(sql+'\n');return done},done}
}
async function waitBlocked(blocked:ReturnType<typeof connection>,holder:ReturnType<typeof connection>){
 for(let n=0;n<30;n++){
  if(testSql(`select exists(select 1 from pg_stat_activity where application_name='${blocked.name}' and wait_event_type='Lock');`)==='t')return
  await new Promise(r=>setTimeout(r,20))
 }
 await holder.finish('rollback;');await blocked.done
 throw Error('The second SQL transaction never waited on the held lock')
}
describe('owner lifecycle and real static worker fences',()=>{
 it('atomically pauses, versions and replays transitions while restore preserves an unrelated pause',async()=>{
  const f=await fixture();expect(await readProjectLifecycle(f.db,f.p,f.ref.projectId)).toMatchObject({state:'active',version:0,executionPaused:false})
  testSql(`select stop_set_project_execution('${f.ref.projectId}',true,'fixture','another pause');`)
  const input=f.change('archive',0),a=await changeProjectLifecycle(f.db,f.p,input)
  expect(a).toMatchObject({state:'archived',version:1,executionPaused:true,stopping:false})
  expect(await changeProjectLifecycle(f.db,f.p,input)).toEqual(a)
  await expect(changeProjectLifecycle(f.db,f.p,f.change('trash',0))).rejects.toMatchObject({code:'CONFLICT'})
  await expect(changeProjectLifecycle(f.db,f.p,{...input,action:'trash'})).rejects.toMatchObject({code:'CONFLICT'})
  expect(await changeProjectLifecycle(f.db,f.p,f.change('restore',1))).toMatchObject({state:'active',version:2,executionPaused:true})
  expect(testSql(`select count(*) from runs where project_id='${f.ref.projectId}';`)).toBe('1')
  expect(testSql(`select count(*) from stop_events where scope_id='${f.ref.projectId}';`)).toBe('1')
 },30000)
 it('refuses foreign, observer, stale and malformed commands and keeps history and folder requests',async()=>{
  const f=await fixture(),w=f.claim();await commitBuildRevision(f.db,w,artifact())
  await requestStudioWorkspace(f.db,f.p,{projectId:f.ref.projectId,targetId:null,mode:'existing_folder',root:{os:'windows',root:'C:\\Projects\\KeepMe',targetId:null},idempotencyKey:randomUUID()})
  const before=testSql(`select jsonb_build_object('agent',s.builder_agent_id,'location',s.location,'requests',(select jsonb_agg(root) from website_build_workspace_requests where project_id=s.project_id)) from website_build_project_settings s where project_id='${f.ref.projectId}';`)
  for(const p of [{...f.foreign,allowedProjectIds:[f.ref.projectId]},{...f.p,allowedProjectIds:[]}]){
   await expect(changeProjectLifecycle(f.db,p,f.change('trash',0))).rejects.toMatchObject({code:'NOT_FOUND'})
   await expect(readProjectLifecycle(f.db,p,f.ref.projectId)).rejects.toMatchObject({code:'NOT_FOUND'})
  }
  for(const expectedVersion of [-1,0.1,NaN])await expect(changeProjectLifecycle(f.db,f.p,{...f.change('trash',0),expectedVersion})).rejects.toMatchObject({status:400})
  await changeProjectLifecycle(f.db,f.p,f.change('trash',0))
  expect((await readBuildSession(f.db,f.p,f.session)).revisions).toHaveLength(1)
  await expect(appendBuildFeedback(f.db,f.p,f.session,{text:'Ändra',inputSource:'text',viewedRevisionId:null,idempotencyKey:randomUUID()})).rejects.toMatchObject({status:409})
  await expect(ensureStudioWorkspace(f.db,f.p,{kind:'existing',projectId:f.ref.projectId,idempotencyKey:randomUUID()})).rejects.toMatchObject({code:'PROJECT_INACTIVE'})
  expect(()=>testSql(`select stop_set_project_execution('${f.ref.projectId}',false,'fixture','bypass');`,true)).toThrow('PROJECT_INACTIVE')
  await changeProjectLifecycle(f.db,f.p,f.change('restore',1))
  expect(testSql(`select jsonb_build_object('agent',s.builder_agent_id,'location',s.location,'requests',(select jsonb_agg(root) from website_build_workspace_requests where project_id=s.project_id)) from website_build_project_settings s where project_id='${f.ref.projectId}';`)).toBe(before)
  expect(testSql(`select count(*) from conversations where id='${f.ref.conversationId}';`)).toBe('1')
  expect(testSql("select has_function_privilege('authenticated','project_lifecycle_change(jsonb,jsonb)','execute') or has_table_privilege('service_role','project_lifecycle','update');")).toBe('f')
 },30000)
 it('archive winning the project lock fences snapshot and commit even with allow_pause',async()=>{
  const f=await fixture(),writer=f.claim(),a=connection(),b=connection()
  await a.hold(`select project_lifecycle_change(${sqlJson(f.p)},${sqlJson(f.change('archive',0))});`)
  const result=b.finish(`select website_build_commit_revision(${sqlJson(writer)},${sqlJson(artifact())});`)
  await waitBlocked(b,a);expect((await a.finish()).code).toBe(0);const commit=await result
  expect(commit.code).not.toBe(0);expect(commit.err).toContain('WEBSITE_WRITER_FENCED')
  await expect(loadBuildSnapshot(f.db,writer)).rejects.toMatchObject({code:'FENCED'})
  expect(testSql(`select count(*) from website_preview_revisions where project_id='${f.ref.projectId}';`)).toBe('0')
 },30000)
 it('commit winning the project lock finishes before archive and its verified artifact stays readable',async()=>{
  const f=await fixture(),writer=f.claim(),a=connection(),b=connection()
  await a.hold(`select website_build_commit_revision(${sqlJson(writer)},${sqlJson(artifact())});`)
  const result=b.finish(`select project_lifecycle_change(${sqlJson(f.p)},${sqlJson(f.change('archive',0))});`)
  await waitBlocked(b,a);expect((await a.finish()).code).toBe(0);expect((await result).code).toBe(0)
  expect((await readBuildSession(f.db,f.p,f.session)).revisions).toHaveLength(1)
 },30000)
 it('serializes actual claim and archive in both orders without claiming paused work',async()=>{
  const f=await fixture(),a=connection(),b=connection()
  await a.hold(`select id from claim_runs(100,320) where project_id='${f.ref.projectId}';`)
  const archived=b.finish(`select project_lifecycle_change(${sqlJson(f.p)},${sqlJson(f.change('archive',0))});`)
  await waitBlocked(b,a);expect((await a.finish()).code).toBe(0);expect((await archived).code).toBe(0)
  expect((await readProjectLifecycle(f.db,f.p,f.ref.projectId))).toMatchObject({state:'archived',executionPaused:true,stopping:true})
  const g=await fixture(),c=connection(),d=connection()
  await c.hold(`select project_lifecycle_change(${sqlJson(g.p)},${sqlJson(g.change('archive',0))});`)
  const claim=d.finish(`select count(*) from claim_runs(100,320) where project_id='${g.ref.projectId}';`)
  expect((await c.finish()).code).toBe(0);const r=await claim;expect(r.code).toBe(0);expect(r.out.trim()).toBe('0')
 },30000)
 it('never revives a skipped locked writer after restore and explicit project resume',async()=>{
  const f=await fixture(),writer=f.claim(),holder=connection()
  await holder.hold(`select id from runs where id='${writer.runId}' for update;`)
  try{
   await changeProjectLifecycle(f.db,f.p,f.change('archive',0))
   await changeProjectLifecycle(f.db,f.p,f.change('restore',1))
   testSql(`select stop_set_project_execution('${f.ref.projectId}',false,'fixture','explicit resume');`,true)
  }finally{expect((await holder.finish()).code).toBe(0)}
  await expect(loadBuildSnapshot(f.db,writer)).rejects.toMatchObject({code:'FENCED'})
  testSql(`update runs set status='pending',claim_id=null,lease_until=null where id='${writer.runId}';`)
  expect(testSql(`select count(*) from claim_runs(100,320) where id='${writer.runId}';`,true)).toBe('0')
 },30000)
 it.each(['writer','control'] as const)('a project-first %s refuses a busy run without deadlocking canonical claim',async kind=>{
  const f=await fixture(),writer=f.claim();testSql(`update runs set status='pending',claim_id=null,lease_until=null where id='${writer.runId}';`)
  const holder=connection();await holder.hold(`select id from projects where id='${writer.projectId}' for update;`)
  const operation=connection(),op=operation.finish(kind==='writer'?`select website_build_snapshot(${sqlJson(writer)});`:`select website_build_control(${sqlJson(f.p)},${sqlJson(f.session)},${sqlJson({action:'pause',idempotencyKey:randomUUID()})});`)
  await waitBlocked(operation,holder)
  const claim=connection(),claimed=claim.finish(`select count(*) from claim_runs(100,320) where id='${writer.runId}';`)
  await waitBlocked(claim,holder)
  expect((await holder.finish()).code).toBe(0)
  const [result,admitted]=await Promise.all([op,claimed])
  expect(admitted.err).not.toContain('deadlock detected');expect(result.err).not.toContain('deadlock detected');expect(result.code).not.toBe(0)
  expect(result.err).toContain(kind==='writer'?'WEBSITE_WRITER_BUSY':'SESSION_CHANGED_RETRY')
  expect(admitted.code).toBe(0);expect(admitted.out.trim()).toBe('1')
 },30000)

 it('retries a transient writer lock on the same artifact, but never retries an actual fence',async()=>{
  const f=await fixture(),writer=f.claim(),holder=connection();let released=false,calls=0
  await holder.hold(`select id from runs where id='${writer.runId}' for update;`)
  const invoke=(f.db as any).rpc.bind(f.db),db={...f.db,rpc:async(name:string,args:Record<string,unknown>)=>{
   calls++;const result=await invoke(name,args)
   if(!released&&result.error?.message.includes('WEBSITE_WRITER_BUSY')){released=true;expect((await holder.finish()).code).toBe(0)}
   return result
  }} as unknown as typeof f.db
  try{
   await expect(commitBuildRevision(db,writer,artifact())).resolves.toMatchObject({number:1})
   expect(calls).toBe(2);expect(testSql(`select count(*) from website_preview_revisions where project_id='${writer.projectId}';`)).toBe('1')
   await expect(commitBuildRevision(db,writer,artifact())).rejects.toMatchObject({code:'FENCED'});expect(calls).toBe(3)
  }finally{if(!released)await holder.finish()}
 },30000)

})
