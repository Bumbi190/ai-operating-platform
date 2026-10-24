// Standalone local-only PostgreSQL fixture. No hosted credentials, ports, mounts or pulls.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
const name='omnira-calendar-history-'+randomUUID();
const image='public.ecr.aws/supabase/postgres:17.11.0.004';
const label='calendar-history-local';
const schemaBaseline=process.argv.includes('--schema-baseline');
const dockerBin=process.env.DOCKER_BIN||'docker';
const docker=(args,input)=>{
 const result=spawnSync(dockerBin,args,{input,encoding:'utf8',maxBuffer:4194304});
 assert.equal(result.status,0,result.stderr||result.error?.message);return result.stdout.trim();
};
assert.match(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),/^(npipe:\/\/|unix:\/\/)/);
docker(['image','inspect',image]);
let owned=false;
try{
 docker(['run','--pull=never','-d','--name',name,'--label','com.omnira.testplan='+label,'--network','none','-e','POSTGRES_PASSWORD=synthetic-local-only',image,'postgres','-c','shared_preload_libraries=pg_stat_statements,pg_cron,pg_net','-c','cron.launch_active_jobs=off','-c','cron.database_name=calendar_history_test']);owned=true;
 let ready=false;
 for(let i=0;i<60;i++){
  const result=spawnSync(dockerBin,['exec',name,'pg_isready','-U','postgres'],{encoding:'utf8'});
  const process=docker(['exec',name,'cat','/proc/1/comm']);
  if(result.status===0&&['postgres','.postgres-wrapp'].includes(process)){ready=true;break;}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 assert.ok(ready,'local PostgreSQL ready');
 const inspect=JSON.parse(docker(['inspect',name]))[0];
 assert.equal(inspect.HostConfig.NetworkMode,'none');assert.deepEqual(inspect.Mounts,[]);
 assert.equal(Object.keys(inspect.HostConfig.PortBindings??{}).length,0);
 docker(['exec',name,'createdb','-U','postgres','calendar_history_test']);
 const sql=body=>docker(['exec','-i',name,'psql','-X','-q','-A','-t','--single-transaction','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','calendar_history_test'],body);
 const repo=new URL('../../../',import.meta.url);
 const file=path=>readFileSync(new URL(path,repo),'utf8');
 const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
 const rows=[1,2,3,4].flatMap(part=>JSON.parse(file('docs/validation/quarantine/calendar-ledger-full-20261024-part'+part+'.json')).rows);
 const pinned=JSON.parse(file('docs/validation/calendar-ledger-main-20261023.json')).rows;
 assert.equal(rows.length,177);assert.equal(new Set(rows.map(r=>r.version)).size,177);
 for(const row of rows){
  assert.equal(row.statements.length,row.statement_count);
  assert.equal(sha(row.statements.join('\n')),row.body_sha256);
  assert.equal(pinned.find(r=>r.version===row.version)?.body_sha256,row.body_sha256);
 }
 const report={scope:'local original-ledger replay; no hosted parity claim',replayReady:false,originalRows:rows.length,schemaBaseline,adaptations:[],orderChanges:[],applied:[],prerequisites:[],exclusions:[],failure:null};
 const applyFile=path=>{const body=file(path);try{sql(body)}catch(error){report.failure={phase:'prerequisites',path,error:error.message};throw error;}report.prerequisites.push({path,lfSha256:sha(body.replaceAll('\r\n','\n'))});};
 try{
  sql(`create schema extensions;create extension pgcrypto with schema extensions;create extension pg_cron;create extension pg_net;
   create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`);
  // A new createdb lacks the managed project's per-database default ACLs.
  // These public-schema grants were observed read-only on main on 2026-10-24.
  // Explicit revokes in every subsequent original migration still take effect.
  sql(`alter default privileges for role supabase_admin in schema public grant all on tables to postgres,anon,authenticated,service_role;
   alter default privileges for role supabase_admin in schema public grant all on sequences to postgres,anon,authenticated,service_role;
   alter default privileges for role supabase_admin in schema public grant execute on functions to postgres,anon,authenticated,service_role;
   grant usage on schema auth to anon,authenticated,service_role;`);
  report.fixtureManagedDefaults='Public-schema future table/sequence/function grants for supabase_admin mirror read-only observed main defaults; Auth namespace usage is test plumbing, not managed Auth equivalence.';
  for(const [upstream,expected] of [
   ['0002-storage-schema.sql','19562682ff1b77cda9ba096671b873e7e226b10f0b0564bd4823e6c1754393b6'],
   ['0008-add-public-to-buckets.sql','1d881092aea62e83493f1a9c4cb4f101f3035a08d62be84a7e7970ee0c6f0f48'],
  ]){
   const exact=spawnSync(dockerBin,['run','--rm','--pull=never','--network','none','--entrypoint','cat','public.ecr.aws/supabase/storage-api:v1.79.36','/app/migrations/tenant/'+upstream],{encoding:'utf8'});
   assert.equal(exact.status,0);assert.equal(sha(exact.stdout),expected);
   sql("SET storage.install_roles='false';"+exact.stdout);
   report.prerequisites.push({path:'storage-api:v1.79.36/'+upstream,sha256:expected});
  }
  applyFile('packages/db/full_schema_run_in_supabase.sql');
  for(const name of ['20260520_media_tables.sql','20260520_media_images.sql','20260525_media_scripts_facebook.sql','20260525_media_scripts_quality_music.sql','20260527_platform_tokens.sql','20260528_agent_decisions.sql'])applyFile('apps/web/supabase/migrations/'+name);
  for(const name of ['20260520_background_music.sql','20260520_render_columns.sql','20260521_composition_column.sql','20260522_instagram_columns.sql','20260528_pass_a_safeguards.sql','20260528_pg_cron_setup.sql','20260530_news_items_dedup.sql','20260531_pg_cron_competitors.sql'])applyFile('supabase/migrations/'+name);
  const commentPath='supabase/migrations/20260529_comment_replies.sql';
  const commentBody=file(commentPath).replaceAll('\r\n','\n');
  assert.equal(sha(commentBody),'b7ca35d9faf4fd8de49462114a9408e1e638de0c875d41dc409e83af224b8e3d');
  const boundary=commentBody.indexOf('SELECT cron.schedule(');assert.ok(boundary>0);
  const schemaOnly=commentBody.slice(0,boundary);sql(schemaOnly);
  report.prerequisites.push({path:commentPath,selection:'prefix before SELECT cron.schedule(',lfSha256:sha(schemaOnly)});
  report.exclusions.push({path:commentPath,reason:'Invalid SELECT ... ON CONFLICT cron suffix, independently observed before any original ledger row. No source mutation.',sourceLfSha256:sha(commentBody)});
  const revenuePath='apps/web/supabase/migrations/20260601_revenue_os.sql';
  const revenueBody=file(revenuePath).replaceAll('\r\n','\n');
  const start=revenueBody.indexOf('CREATE TABLE IF NOT EXISTS morning_briefings (');
  const last='CREATE INDEX IF NOT EXISTS idx_briefing_generated ON morning_briefings(generated_at DESC);';
  const end=revenueBody.indexOf(last,start);assert.ok(start>0&&end>start);
  const morningSchema=revenueBody.slice(start,end+last.length);sql(morningSchema);
  report.prerequisites.push({path:revenuePath,selection:'morning_briefings table and its index only; required by declarative_rls_parity',sourceLfSha256:sha(revenueBody),executedSha256:sha(morningSchema)});
  const executionRows=[...rows];
  if(schemaBaseline){
   const source=executionRows.findIndex(r=>r.name==='handlarborsen_test_data_integration');
   const target=executionRows.findIndex(r=>r.name==='handlarborsen_test_data_reviews');
   assert.ok(source>target&&target>=0);
   const [prerequisite]=executionRows.splice(source,1);executionRows.splice(target,0,prerequisite);
   report.orderChanges.push({version:prerequisite.version,before:executionRows[target+1].version,reason:'The reviews RPCs require tables created by the later registered integration entry. Original SQL unchanged.'});
  }
  const quote=s=>"'"+s.replaceAll("'","''")+"'";
  for(const row of executionRows){
   console.log('REPLAY '+row.version+' '+row.name);
   try{
    let statements=row.statements;
    if(schemaBaseline&&row.version==='20260603085842'){
     const original=row.statements.join('\n');
     assert.equal(sha(original),'02bf082e31b14c045386daa7e4acabb1b9ab7cc9086ea0ae7fe2072b08a00cdf');
     const obsolete="select cron.unschedule('omnira_reset_stuck_images');";
     assert.equal(original.split(obsolete).length,2);
     const candidate=original.replace(obsolete,"select cron.unschedule(jobid) from cron.job where jobname='omnira_reset_stuck_images';");
     statements=[candidate];
     report.adaptations.push({version:row.version,reason:'Guard removal of a retired cron job absent on clean install. Original exact replay independently fails here.',sourceSha256:sha(original),executedSha256:sha(candidate)});
    }
    sql(statements.join('\n')+'\n'+`;insert into supabase_migrations.schema_migrations(version,name,statements) values(${quote(row.version)},${quote(row.name)},array[${statements.map(quote).join(',')}]);`);
    report.applied.push({version:row.version,name:row.name,sourceBodySha256:row.body_sha256,executedBodySha256:sha(statements.join('\n'))});
   }catch(error){report.failure={version:row.version,name:row.name,error:error.message};throw error;}
  }
  applyFile('apps/web/supabase/migrations/20261024174000_user_calendar_responsibility.sql');
  applyFile('apps/web/supabase/migrations/20261024174001_user_calendar_workflow_link.sql');
  const linkProbe=sql(file('apps/web/scripts/calendar-workflow-link-full-probe.sql'));
  assert.ok(linkProbe.includes('FULL CALENDAR WORKFLOW LINK PASS 10'));
  report.calendarWorkflowLinkCases=10;
  const ownerRegression=sql(file('apps/web/scripts/calendar-provenance-owner-regression-probe.sql'));
  assert.ok(ownerRegression.includes('FULL PROVENANCE REGRESSION PASS 16'));
  assert.equal(sql("select count(*) from public.assets where storage_path like 'provenance-regression/%'"),'0');
  report.ownerRegressionCases=16;
  const calendarProbe=sql(file('apps/web/scripts/calendar-responsibility-full-probe.sql'));
  assert.ok(calendarProbe.includes('FULL CALENDAR RESPONSIBILITY PASS 8'));
  assert.equal(sql("select count(*) from public.user_calendar_events where id='40000000-0000-4000-8000-000000000001'"),'0');
  report.calendarResponsibilityCases=8;
  console.log('PASS: 16 real-schema provenance owner regression cases; test changes rolled back.');
  assert.equal(sql("select current_setting('cron.launch_active_jobs')"),'off');
  assert.equal(sql('select count(*) from supabase_migrations.schema_migrations'),'177');
  console.log('PASS: all 177 source entries replayed; inspect explicit adaptations; job launching disabled.');
 }catch(error){if(!report.failure)report.failure={phase:report.applied.length===rows.length?'verification':'prerequisites',error:error.message};throw error;}
 finally{
  const path=new URL('docs/validation/'+(schemaBaseline?'calendar-full-ledger-replay-20261024.json':'calendar-original-ledger-failure-20261024.json'),repo);
  writeFileSync(path,JSON.stringify(report,null,2)+'\n');
  console.log('Evidence saved; applied='+report.applied.length+'/'+rows.length+'; replayReady remains false.');
 }
}finally{
 if(owned){
  assert.equal(docker(['inspect','--format','{{index .Config.Labels "com.omnira.testplan"}}',name]),label);
  docker(['rm','-f',name]);console.log('Owned fixture removed.');
 }
}
