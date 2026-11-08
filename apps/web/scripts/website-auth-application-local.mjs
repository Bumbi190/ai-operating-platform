// Test-only application schema + real Auth integration. Caller owns the isolated Docker target.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {readProvenanceInputs} from './migration-baseline-provenance.mjs';
import {planCanonicalBootstrap} from './migration-bootstrap-plan.mjs';
import {planProblems,loadVerifiedSequence,STORAGE_IMAGE,STORAGE_PREREQUISITES} from './migration-bootstrap-replay-local.mjs';
import {sha256} from './migration-replay-preflight.mjs';
import {prepareAcceptanceStep} from './website-acceptance-transaction.mjs';
const root=new URL('../../../',import.meta.url);
export function bootstrapApplication({sql:adminSql,atomicSql,docker,check,receipt,a,b,asPostgres=false,atomicAcceptance=false,storageReady=false}){
 let sql=adminSql;
 const read=path=>readFileSync(new URL(path,root),'utf8');
 const plan=planCanonicalBootstrap(readProvenanceInputs(fileURLToPath(root)));
 if(planProblems(plan).length)throw Error('APPLICATION_PLAN_REFUSED');
 const steps=loadVerifiedSequence(plan.sequence,read); // Verify every pin before executing application SQL.
 if(atomicAcceptance&&(!asPostgres||typeof atomicSql!=='function'))throw Error('ATOMIC_EXECUTOR_REQUIRED');
 const preparedSteps=atomicAcceptance?steps.map(prepareAcceptanceStep):null;
 check('application_target_has_no_public_tables',sql("select count(*) from pg_tables where schemaname='public';")==='0');
 const authFingerprint=sql("select md5(pg_get_functiondef('auth.uid()'::regprocedure));");
 check('two_real_auth_accounts_before_schema',sql('select count(*) from auth.users;')==='2');
 receipt.application={applied:0,planned:steps.length,authPreserved:false};
 sql("create extension if not exists pg_cron;create extension if not exists pg_net;create schema if not exists supabase_migrations;create table if not exists supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);");
 sql("alter default privileges for role supabase_admin in schema public grant all on tables to postgres,anon,authenticated,service_role;alter default privileges for role supabase_admin in schema public grant all on sequences to postgres,anon,authenticated,service_role;alter default privileges for role supabase_admin in schema public grant execute on functions to postgres,anon,authenticated,service_role;grant usage on schema auth to anon,authenticated,service_role;");
 if(storageReady){
  check('real_storage_schema_ready',sql("select to_regclass('storage.objects') is not null and to_regclass('storage.buckets') is not null;")==='t');
  receipt.application.storageSchema='real-local-storage-api';
 }
 for(const [name,expected] of storageReady?[]:STORAGE_PREREQUISITES){
  const exact=docker(['run','--rm','--pull=never','--network','none','--entrypoint','cat',STORAGE_IMAGE,'/app/migrations/tenant/'+name],undefined,true);
  if(sha256(exact)!==expected)throw Error('STORAGE_SOURCE_PIN_MISMATCH');
  sql("SET storage.install_roles='false';"+exact);
 }
 sql('grant usage on schema storage to anon,authenticated,service_role;');
 if(asPostgres){
  // Explicit local fixture: the managed parent grants these privileges, but the two
  // pinned old Storage schema files above do not reconstruct managed table ACLs.
  sql('grant select,insert on storage.buckets to postgres;');
  sql('grant execute on function cron.alter_job(bigint,text,text,text,text,boolean),cron.schedule(text,text),cron.schedule(text,text,text),cron.unschedule(bigint),cron.unschedule(text) to postgres;');
  sql('alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;alter default privileges for role postgres in schema public grant all on sequences to anon,authenticated,service_role;alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role;');
  receipt.application.localRoleFixtures=['postgres SELECT,INSERT on storage.buckets','postgres EXECUTE on five observed cron overloads','postgres public default ACLs observed on parent'];
 }
 // Legacy mode keeps cron launching off. Atomic mode uses one prepared transaction per step,
 // with the identity check and schedule deactivation inside that same transaction.
 check(atomicAcceptance?'application_atomic_launcher_is_active':'application_quiescence_requires_disabled_launcher',sql("select current_setting('cron.launch_active_jobs');")===(atomicAcceptance?'on':'off'));
 if(asPostgres){
  sql=body=>adminSql('SET SESSION AUTHORIZATION postgres;\n'+body);
  receipt.application.executor=JSON.parse(sql("select json_build_object('currentUser',current_user,'sessionUser',session_user,'superuser',rolsuper,'bypassRls',rolbypassrls) from pg_roles where rolname=current_user;"));
 }
 if(asPostgres)check('application_executor_is_non_superuser_postgres',sql("select current_user='postgres' and session_user='postgres' and not rolsuper from pg_roles where rolname=current_user;")==='t');
 const applyAtomic=body=>atomicSql('SET SESSION AUTHORIZATION postgres;\n'+body);
 if(atomicAcceptance)receipt.application.atomicSteps=[];
 receipt.application.quiescedSteps=0;
 for(const step of steps){
  receipt.application.currentPath=step.path;
  if(atomicAcceptance){
   const {body,...reference}=preparedSteps[step.index];
   applyAtomic(body);
   receipt.application.atomicSteps.push(reference);
  }else{
  sql(step.body+`
;
DO $quiesce$
BEGIN
  PERFORM cron.alter_job(jobid, active := false) FROM cron.job WHERE active;
  IF EXISTS (SELECT 1 FROM cron.job WHERE active) THEN
    RAISE EXCEPTION 'ACCEPTANCE_SCHEDULE_STILL_ACTIVE';
  END IF;
END;
$quiesce$;
`);
  }
  receipt.application.quiescedSteps++;
  receipt.application.applied++;
 }
 if(atomicAcceptance){
  // A real failed installation must roll back both its table and registered cron job.
  const body="BEGIN;CREATE TABLE public.omnira_acceptance_rollback_probe(id integer);"+
   "SELECT cron.schedule('omnira_acceptance_rollback_probe','1 second','select 1');"+
   "DO $probe$BEGIN RAISE EXCEPTION 'EXPECTED_ACCEPTANCE_ROLLBACK';END;$probe$;COMMIT;";
  let failedAsExpected=false;
  try{applyAtomic(prepareAcceptanceStep({path:'synthetic/rollback-probe',body,lfSha256:sha256(body)}).body);}
  catch(error){
   failedAsExpected=String(error.detail??'').includes('EXPECTED_ACCEPTANCE_ROLLBACK');
   if(!failedAsExpected)receipt.application.rollbackProbeFailure={message:String(error.message),detail:String(error.detail??'')};
  }
  check('atomic_probe_fails_for_expected_reason',failedAsExpected);
  check('atomic_failed_table_is_absent',sql("select to_regclass('public.omnira_acceptance_rollback_probe') is null;")==='t');
  check('atomic_failed_schedule_is_absent',sql("select count(*) from cron.job where jobname='omnira_acceptance_rollback_probe';")==='0');
 }
 delete receipt.application.currentPath;
 check('application_replay_complete',receipt.application.applied===steps.length);
 check('application_has_no_active_schedules',sql('select count(*) from cron.job where active;')==='0');
 receipt.application.installedSchedules=Number(sql('select count(*) from cron.job;'));
 check('application_preserves_inactive_schedule_definitions',receipt.application.installedSchedules>0);
 check('application_has_no_queued_network_requests',sql('select count(*) from net.http_request_queue;')==='0');
 check('managed_auth_uid_unchanged',sql("select md5(pg_get_functiondef('auth.uid()'::regprocedure));")===authFingerprint);
 check('real_auth_accounts_preserved',sql('select count(*) from auth.users;')==='2');
 receipt.application.authPreserved=true;
 const projects=[randomUUID(),randomUUID()],agents=[randomUUID(),randomUUID()],conversations=[randomUUID(),randomUUID()];
 for(let i=0;i<2;i++){
  const uid=[a.id,b.id][i];if(!/^[0-9a-f-]{36}$/.test(uid))throw Error('INVALID_TEST_ID');
  sql(`insert into public.projects(id,owner_id,name,slug) values('${projects[i]}','${uid}','Fictional Auth Application ${i}','auth-app-${projects[i]}');
  insert into public.agents(id,project_id,name,system_prompt) values('${agents[i]}','${projects[i]}','Synthetic builder','No external actions');
  insert into public.conversations(id,project_id,user_id) values('${conversations[i]}','${projects[i]}','${uid}');`);
 }
 console.log('Application schema: '+steps.length+'/'+steps.length+' steps; real Auth preserved.');
 return {projects,agents,conversations};
}
export async function testApplicationHTTP({sql,check,request,rest,auth,service,a,b,token,context}){
 const {projects,agents,conversations}=context,[projectA,projectB]=projects;
 const principal={userId:a.id,allowedProjectIds:[projectA]};
 const rpc=(name,p_input,p_principal=principal,jwt=service)=>request(rest,'/rpc/'+name,{token:jwt,method:'POST',body:{p_principal,p_input}});
 const identity=await request(auth,'/user',{token});check('application_principal_validated_by_auth',identity.status===200&&identity.data?.id===a.id);
 const filter='/projects?select=id&id=in.('+projects.join(',')+')';
 const own=await request(rest,filter,{token});
 const other=await request(rest,filter,{token:b.access_token});
 check('canonical_projects_owner_a_only',own.status===200&&own.data?.length===1&&own.data[0].id===projectA);
 check('canonical_projects_owner_b_only',other.status===200&&other.data?.length===1&&other.data[0].id===projectB);
 const builder=await rpc('website_build_builder_set',{projectId:projectA,agentId:agents[0]});
 check('server_rpc_builder_selected',builder.status===200);
 const content={title:'Real Auth test',purpose:'Verify canonical planning',audience:'Fictional users',pages:[{key:'index',title:'Home',purpose:'Test'}],design:{style:'Clear',reference:null},features:[],architecture:'Static pages',steps:['Build','Check'],domain:{registrar:'strato',requestedName:null}};
 const canonicalContent=JSON.stringify(content),hash=createHash('sha256').update(canonicalContent).digest('hex');
 const input={projectId:projectA,conversationId:conversations[0],expectedRevisionId:null,content,canonicalContent,sha256:hash,brief:'Fictional real-auth plan',idempotencyKey:'real-auth-plan'};
 const saved=await rpc('website_build_plan_save',input);
 check('canonical_plan_saved_via_postgrest',saved.status===200&&saved.data?.currentRevision?.sha256===hash);
 const again=await rpc('website_build_plan_save',input);
 check('canonical_plan_save_idempotent',again.status===200&&again.data?.currentRevision?.revisionId===saved.data.currentRevision.revisionId);
 const ownPlans=await request(rest,'/website_build_plans?select=id&project_id=eq.'+projectA,{token});
 const foreignPlans=await request(rest,'/website_build_plans?select=id&project_id=eq.'+projectA,{token:b.access_token});
 check('canonical_plan_owner_can_read',ownPlans.status===200&&ownPlans.data?.length===1);
 check('canonical_plan_foreign_user_sees_none',foreignPlans.status===200&&foreignPlans.data?.length===0);
 const direct=await rpc('website_build_plan_save',input,principal,token);
 check('authenticated_cannot_invoke_server_rpc',direct.status===401||direct.status===403);
 const foreign=await rpc('website_build_plan_save',{...input,projectId:projectB,conversationId:conversations[1],idempotencyKey:'foreign-plan'},{userId:a.id,allowedProjectIds:projects});
 check('canonical_write_checks_owner_even_with_both_project_ids',foreign.status===500&&foreign.data?.code==='P0002'&&foreign.data?.message==='WEBSITE_BUILD_NOT_FOUND');
 const noApproval=await rpc('website_build_create',{projectId:projectA,agentId:agents[0],conversationId:conversations[0],brief:'Unapproved',idempotencyKey:'unapproved'});
 console.log('Approval guard contract: '+JSON.stringify(noApproval));check('canonical_build_requires_plan_approval',noApproval.status>=400&&noApproval.status<600&&noApproval.data?.code==='55000'&&noApproval.data?.message==='PLAN_REVIEW_REQUIRED');
 check('no_unapproved_build_jobs',sql("select count(*) from public.runs where project_id in ('"+projects.join("','")+"');")==='0');
 check('application_no_cron_runs',sql('select count(*) from cron.job_run_details;')==='0');
}
