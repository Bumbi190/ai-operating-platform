import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const canonical=x=>x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
const hash=x=>createHash('sha256').update(canonical(x)).digest('hex');
export async function probeHumanStoryStart({sql,dockerBin,container}){
 const owner='21000000-0000-4000-8000-000000000001',other='21000000-0000-4000-8000-000000000002',project='11000000-0000-4000-8000-000000000001';
 const h='a'.repeat(64),b='b'.repeat(64),p='c'.repeat(64);let cases=0;
 const failure=(body,pattern)=>{assert.throws(()=>sql(body),pattern);cases++;};
 const human=(body,user=owner)=>`set local role authenticated;set local "request.jwt.claim.role"='authenticated';set local "request.jwt.claim.sub"='${user}';${body}`;
 sql(`insert into auth.users(id) values('${owner}'),('${other}');
  insert into public.projects(id,owner_id,name,slug) values('${project}','${owner}','Human story test','human-story-local');
  insert into public.project_budgets(project_id,monthly_sek,daily_sek,weekly_sek) values('${project}',100000,10000,50000);
  insert into public.workflow_defs(def_key,version,def_hash,spec) values('familje-stunden.monthly-release',2,'${h}',
   '{"states":[{"id":"content_generation","next_state":"approval_content"},{"id":"approval_content","next_state":"content_generation"}],"initial_state":"content_generation"}') on conflict(def_key,version) do nothing;`);
 const inst=sql(`select (public.workflow_instantiate((select id from public.workflow_defs where def_key='familje-stunden.monthly-release' and version=2),'${project}','2026-11','content_generation','local-test','synthetic story')).id`);
 const prepare=(key)=>sql(`set local role service_role;select row_to_json(r) from public.prepare_human_story_request('${inst}','${owner}','${key}','${h}','${b}','${p}',7.1234) r`);
 const job=JSON.parse(prepare('41000000-0000-4000-8000-000000000001'));
 assert.equal(job.target_version_hash,hash({kind:'workflow.human_story_scope',action_target_hash:h,brief_hash:b,prompt_hash:p,provider:'anthropic',model:'claude-sonnet-4-6',max_tokens:4096,maximum_sek:'7.1234'}));cases++;
 assert.equal(JSON.parse(prepare('41000000-0000-4000-8000-000000000001')).id,job.id);cases++;
 const approve=(j=job,target=j.target_version_hash,action=h)=>`select row_to_json(r) from public.approve_and_start_human_story('${j.id}','${target}','${action}') r`;
 failure(`set local role service_role;${approve()}`,/permission denied/);
 failure(human(approve(),other),/story request not found/);
 failure(human(approve(job,'f'.repeat(64))),/review changed/);
 failure(human(approve(job,job.target_version_hash,'f'.repeat(64))),/story inputs changed/);
 failure(`set local role authenticated;select * from public.prepare_human_story_request('${inst}','${owner}',gen_random_uuid(),'${h}','${b}','${p}',7)`,/permission denied/);
 failure(`set local role service_role;insert into public.workflow_human_story_approvals(request_id) values('${job.id}')`,/permission denied/);
 const auth=sql(`select target_version_hash from public.atlas_authorizations where event_id='${job.request_event_id}'`);
 assert.equal(auth,hash({kind:'workflow.action.execute',schema:1,instance_id:inst,def_key:'familje-stunden.monthly-release',def_version:2,def_hash:job.def_hash,state:'content_generation',action_kind:'generate_monthly_story',action_class:'FINANCIAL',target_version_hash:job.target_version_hash,attempt_group:job.id}));cases++;
 // Two independent connections approve the SAME request simultaneously.
 const session=body=>new Promise((resolve,reject)=>{
  const child=spawn(dockerBin,['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','calendar_history_test'],{stdio:['pipe','pipe','pipe']});
  let out='',err='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>err+=c);
  child.on('error',reject);child.on('close',code=>code===0?resolve(out.trim()):reject(new Error(err)));
  child.stdin.end('begin;'+body+';commit;');
 });
 const results=await Promise.all([session(human(approve())),session(human(approve()))]);
 const receipts=results.map(JSON.parse);assert.equal(receipts[0].run_id,receipts[1].run_id);assert.notEqual(receipts[0].replayed,receipts[1].replayed);cases++;
 const run=receipts[0].run_id;
 assert.equal(sql(`select count(*) from public.runs where human_story_request_id='${job.id}'`),'1');cases++;
 assert.equal(sql(`select count(*) from public.run_autonomy_decisions where run_id='${run}'`),'0');cases++;
 assert.equal(sql(`select max_attempts||':'||action_class||':'||status from public.runs where id='${run}'`),'1:FINANCIAL:pending');cases++;
 const another=JSON.parse(prepare('41000000-0000-4000-8000-000000000002'));
 failure(human(approve(another)),/already active or requires reconciliation/);
 assert.equal(sql(`select count(*) from public.atlas_authorizations where authorization_id='${another.authorization_id}'`),'1');cases++;
 sql(`update public.runs set status='failed',action_outcome='FAILED' where id='${run}'`);
 const terminal=JSON.parse(sql(human(approve())));assert.equal(terminal.run_id,run);assert.equal(terminal.replayed,true);cases++;
 // Every refusal below is a separate transaction; input changes cannot be
 // smuggled past a Survival fence in the approval transaction itself.
 sql(`update public.projects set execution_paused=true where id='${project}'`);
 failure(human(approve(another)),/story inputs changed or paused/);
 sql(`update public.projects set execution_paused=false,owner_id='${other}' where id='${project}'`);
 failure(human(approve(another)),/story request not found/);
 sql(`update public.projects set owner_id='${owner}' where id='${project}';select public.workflow_append_transition('${inst}','content_generation','approval_content','synthetic state drift','local-test',null,null)`);
 failure(human(approve(another)),/story inputs changed or paused/);
 sql(`select public.workflow_append_transition('${inst}','approval_content','content_generation','synthetic restore','local-test',null,null)`);
 failure(human(approve(another)+';select 1/0'),/division by zero/);
 assert.equal(sql(`select count(*) from public.workflow_human_story_approvals where request_id='${another.id}'`),'0');cases++;
 assert.equal(sql(`select count(*) from public.atlas_authorizations where authorization_id='${another.authorization_id}'`),'1');cases++;
 // Fixture-owner-only clock shaping of an unapproved synthetic request. The
 // client roles cannot update this table (tested independently above/below).
 sql(`alter table public.workflow_human_story_requests disable trigger human_story_request_immutable;
  update public.workflow_human_story_requests set created_at=clock_timestamp()-interval '16 minutes',expires_at=clock_timestamp()-interval '2 minutes' where id='${another.id}';
  alter table public.workflow_human_story_requests enable trigger human_story_request_immutable;`);
 failure(human(approve(another)),/request expired or already decided/);
 failure(`update public.runs set max_attempts=2 where id='${run}'`,/one approved attempt/);
 failure(`set local role service_role;update public.workflow_human_story_requests set maximum_sek=99 where id='${job.id}'`,/permission denied/);
 failure(`update public.runs set human_story_request_id=null where id='${run}'`,/human story binding immutable/);
 // A duplicate run cannot be smuggled in through a direct insert after terminal status.
 failure(`insert into public.runs(project_id,status,kind,input,context,max_attempts,policy_class,workflow_instance_id,workflow_def_hash,workflow_from_state,action_kind,action_class,target_version_hash,authorization_id,idempotency_key,attempt_group,authorized_at,human_story_request_id)
  select project_id,'pending',kind,input,context,max_attempts,policy_class,workflow_instance_id,workflow_def_hash,workflow_from_state,action_kind,action_class,target_version_hash,authorization_id,idempotency_key,attempt_group,authorized_at,human_story_request_id from public.runs where id='${run}'`,/duplicate key/);
 assert.equal(sql(`select count(*) from public.cost_events where project_id='${project}'`),'0');cases++;
 assert.equal(sql(`select count(*) from public.workflow_evidence where instance_id='${inst}'`),'0');cases++;
 console.log(`HUMAN STORY START PASS ${cases}: real SQL, concurrent duplicate approval, no provider or spend.`);
 return cases;
}
