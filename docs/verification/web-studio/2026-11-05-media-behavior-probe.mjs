import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const repo='C:/Users/Andre/Projects/Omnira/.worktrees/atlas-builder-references-20261017';
const temp='C:/Users/Andre/Projects/Omnira/Temp';
const moduleAt=p=>import(pathToFileURL(repo+'/'+p).href);
const {runBootstrapReplay}=await moduleAt('apps/web/scripts/migration-bootstrap-replay-local.mjs');
const {readProvenanceInputs}=await moduleAt('apps/web/scripts/migration-baseline-provenance.mjs');
const {planCanonicalBootstrap}=await moduleAt('apps/web/scripts/migration-bootstrap-plan.mjs');
const {CATALOG_SQL}=await moduleAt('apps/web/scripts/migration-bootstrap-catalog-local.mjs');
const {extractRunsDispatchSchema,RUNS_DISPATCH_FIXTURE}=await moduleAt('apps/web/scripts/migration-bootstrap-runs.mjs');
const awaitMedia=await moduleAt('apps/web/scripts/migration-bootstrap-media.mjs');
const fixture=extractRunsDispatchSchema(readFileSync(repo+'/'+RUNS_DISPATCH_FIXTURE.sourcePath,'utf8')).body;
const opts={encoding:'utf8',maxBuffer:16*1024*1024,timeout:600000};
const run=(args,input)=>spawnSync('docker',args,{...opts,input});
const evidence={guardCases:[],enqueue:false};
const receipt=await runBootstrapReplay({
 plan:planCanonicalBootstrap(readProvenanceInputs(repo)),read:p=>readFileSync(repo+'/'+p,'utf8'),env:{DOCKER_HOST:process.env.DOCKER_HOST},
 catalogCompare:temp+'/webbuilder-production-catalog-security-20261105.json',
 docker:(args,input)=>{
  const result=run(args,input);
  if(input===CATALOG_SQL&&result.status===0){
   const name=args[args.indexOf('-i')+1];
   if(run(['exec',name,'createdb','-U','postgres','runs_guard_test']).status!==0) throw Error('Guard database creation failed');
   const pg=db=>['exec','-i',name,'psql','-X','-q','-A','-t','--single-transaction','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',db];
   for(const [label,extra,expected] of [['empty','',true],['nonempty',"insert into public.runs(id,workflow_id) values(gen_random_uuid(),gen_random_uuid());",false],['existing_kind','alter table public.runs add column kind text;',false]]){
    if(run(pg('runs_guard_test'),'drop table if exists public.runs; create table public.runs(id uuid primary key,workflow_id uuid not null,created_at timestamptz default now(),status text default \'pending\');'+extra).status!==0) throw Error('Guard setup failed');
    const attempt=run(pg('runs_guard_test'),fixture);
    const passed=expected?attempt.status===0:attempt.status!==0&&attempt.stderr.includes('runs dispatch fixture requires owned empty baseline');
    evidence.guardCases.push({label,passed});
    if(!passed) throw Error('Guard case failed: '+label);
   }
   const detailed=run(args,"SELECT json_build_object('columns',(SELECT json_agg(x ORDER BY table_name,column_name) FROM (SELECT c.relname AS table_name,a.attname AS column_name,pg_catalog.format_type(a.atttypid,a.atttypmod) AS data_type,a.attnotnull AS not_null,pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expression FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relname IN ('media_insights','runs') AND a.attnum>0 AND NOT a.attisdropped) x));");
   if(detailed.status!==0)throw Error('Detailed column query failed');
   evidence.detail=JSON.parse(detailed.stdout);
   const idx=run(args,"SELECT json_build_object('definition',pg_catalog.pg_get_indexdef(i.indexrelid),'unique',i.indisunique,'valid',i.indisvalid) FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='media_insights_script_platform_key';");
   if(idx.status!==0)throw Error('Index query failed');
   evidence.mediaIndex=JSON.parse(idx.stdout);
   if(!evidence.mediaIndex.unique||!evidence.mediaIndex.valid||evidence.mediaIndex.definition!=='CREATE UNIQUE INDEX media_insights_script_platform_key ON public.media_insights USING btree (script_id, platform)')throw Error('Media index mismatch');
   const {MEDIA_FIXTURES,extractMediaFixture}=awaitMedia;
   evidence.mediaGuards=[];
   for(const pin of MEDIA_FIXTURES)for(const variant of ['empty','nonempty','existing_column']){
    const column=pin.path.includes('retention')?'avg_view_pct':'youtube_video_id';
    const extra=variant==='nonempty'?"insert into public.media_insights(script_id) values(gen_random_uuid());":variant==='existing_column'?'alter table public.media_insights add column '+column+' text;':'';
    if(run(pg('runs_guard_test'),"drop table if exists public.media_insights;create table public.media_insights(script_id uuid,platform text not null default 'instagram');"+extra).status!==0)throw Error('Media guard setup failed');
    const attempt=run(pg('runs_guard_test'),extractMediaFixture(pin,readFileSync(repo+'/'+pin.sourcePath,'utf8')).body);
    const passed=variant==='empty'?attempt.status===0:attempt.status!==0&&attempt.stderr.includes('media fixture requires privileged empty table');
    evidence.mediaGuards.push({path:pin.path,variant,passed});
    if(!passed)throw Error('Media guard failed');
   }
   evidence.roleCases=[];
   for(const check of [{"label":"anon_config_hidden","sql":"INSERT INTO public.platform_config(id) VALUES(1) ON CONFLICT(id) DO NOTHING; SET LOCAL ROLE anon; DO $t$ BEGIN IF (SELECT count(*) FROM public.platform_config)<>0 THEN RAISE EXCEPTION 'anon configuration leak'; END IF; END $t$; ROLLBACK;","allowed":true},{"label":"authenticated_config_readonly","sql":"INSERT INTO public.platform_config(id) VALUES(1) ON CONFLICT(id) DO NOTHING; SET LOCAL ROLE authenticated; DO $t$ BEGIN IF (SELECT count(*) FROM public.platform_config WHERE id=1)<>1 THEN RAISE EXCEPTION 'configuration read denied'; END IF; UPDATE public.platform_config SET automation_paused=true WHERE id=1; IF FOUND THEN RAISE EXCEPTION 'authenticated configuration write allowed'; END IF; END $t$; ROLLBACK;","allowed":true},{"label":"anon_heartbeat_denied","sql":"SET LOCAL ROLE anon; SELECT * FROM public.cron_heartbeat;","allowed":false},{"label":"authenticated_heartbeat_denied","sql":"SET LOCAL ROLE authenticated; SELECT * FROM public.cron_heartbeat;","allowed":false},{"label":"service_direct_stop_change_denied","sql":"INSERT INTO public.platform_config(id) VALUES(1) ON CONFLICT(id) DO NOTHING; SET LOCAL ROLE service_role; UPDATE public.platform_config SET automation_paused=true WHERE id=1;","allowed":false},{"label":"service_access","sql":"INSERT INTO public.platform_config(id) VALUES(1) ON CONFLICT(id) DO NOTHING; SET LOCAL ROLE service_role; INSERT INTO public.cron_heartbeat(jobname) VALUES('local_security_probe'); DO $t$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.platform_config WHERE id=1) OR NOT EXISTS(SELECT 1 FROM public.cron_heartbeat WHERE jobname='local_security_probe') THEN RAISE EXCEPTION 'service access blocked'; END IF; END $t$; ROLLBACK;","allowed":true}]){
    const attempt=run(pg('bootstrap_replay_test'),check.sql);
    const passed=check.allowed?attempt.status===0:attempt.status!==0&&/permission denied|platform stop state is writable only/.test(attempt.stderr);
    evidence.roleCases.push({label:check.label,passed});
    if(!passed){evidence.roleError=attempt.stderr.slice(-1500);throw Error('Role check failed: '+check.label);}
   }
   const enqueue=run(pg('bootstrap_replay_test'),"INSERT INTO auth.users(id) VALUES('20000000-0000-4000-8000-000000000001');\nINSERT INTO public.projects(id,owner_id,name,slug) VALUES('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Fictional dispatch test','fictional-dispatch-test');\nINSERT INTO public.agents(id,project_id,name,system_prompt) VALUES('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Test builder','Synthetic fixture only');\nINSERT INTO public.conversations(id,project_id,user_id) VALUES('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');\nINSERT INTO public.website_build_sessions(id,project_id,created_by,agent_id,conversation_id,brief,idempotency_key)\nVALUES('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','Fictional enqueue regression','dispatch-test');\nSELECT public.website_build_enqueue('70000000-0000-4000-8000-000000000001');\nSELECT public.website_build_enqueue('70000000-0000-4000-8000-000000000001');\nDO $test$ BEGIN\n IF (SELECT count(*) FROM public.runs WHERE project_id='10000000-0000-4000-8000-000000000001' AND workflow_id IS NULL AND kind='website.static.build.v1' AND status='pending')<>1 THEN RAISE EXCEPTION 'Expected exactly one non-workflow website job'; END IF;\n IF NOT EXISTS(SELECT 1 FROM public.website_build_sessions s JOIN public.runs r ON r.id=s.current_run_id WHERE s.id='70000000-0000-4000-8000-000000000001' AND s.generation=1 AND r.input->>'sessionId'=s.id::text) THEN RAISE EXCEPTION 'Session/run binding or idempotency mismatch'; END IF;\nEND $test$;\nROLLBACK;");
   evidence.enqueue=enqueue.status===0;
   if(!evidence.enqueue){ evidence.enqueueError=enqueue.stderr.slice(-2500); throw Error('Enqueue regression failed'); }
  }
  return result;
 }
});
writeFileSync(temp+'/webbuilder-media-behavior-20261105.json',JSON.stringify({receipt,evidence},null,2)+'\n');
console.log(JSON.stringify({completed:receipt.completed,applied:receipt.coverage.applied,cleanup:receipt.cleanup,cronRuns:receipt.environment.cronJobRuns,evidence,failure:receipt.failure}));
process.exitCode=receipt.completed&&evidence.enqueue&&evidence.guardCases.every(c=>c.passed)?0:1;
