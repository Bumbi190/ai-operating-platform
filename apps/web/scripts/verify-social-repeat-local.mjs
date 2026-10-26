import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const bin=process.env.DOCKER_BIN||'docker',name='omnira-repeat-'+randomUUID(),label='family-repeat-local';
const image='public.ecr.aws/supabase/postgres:17.11.0.004';
const docker=(args,input)=>{const r=spawnSync(bin,args,{input,encoding:'utf8',maxBuffer:4194304});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim()};
const file=p=>readFileSync(new URL(p,import.meta.url),'utf8');
let owned=false;
try{
 docker(['image','inspect',image]);
 docker(['run','--pull=never','-d','--name',name,'--label','com.omnira.testplan='+label,'--network','none','-e','POSTGRES_PASSWORD=synthetic-local-only',image,'postgres','-c','cron.launch_active_jobs=off']);owned=true;
 for(let n=0;n<60;n++){const r=spawnSync(bin,['exec',name,'pg_isready','-U','postgres'],{encoding:'utf8'});if(!r.status&&['postgres','.postgres-wrapp'].includes(docker(['exec',name,'cat','/proc/1/comm'])))break;await new Promise(r=>setTimeout(r,500));}
 const sql=s=>docker(['exec','-i',name,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],s);
 sql(`create table public.projects(id uuid primary key,slug text,owner_id uuid);
 create table public.social_content_revisions(id uuid primary key,post_id uuid,project_id uuid,binding_id uuid,draft jsonb,media jsonb);
 create table public.social_content_posts(id uuid primary key,project_id uuid,current_revision_id uuid);
 create table public.social_account_bindings(binding_id uuid primary key,project_id uuid,platform text,external_account_id text,superseded_at timestamptz,blocked_at timestamptz);
 create table public.social_schedule_jobs(id uuid primary key,project_id uuid,post_id uuid,revision_id uuid,channel text,item jsonb,state text,scheduled_at timestamptz);
 create table public.social_publications(id uuid primary key,project_id uuid,post_id uuid,revision_id uuid,channel text,account_id text,state text,requested_at timestamptz default clock_timestamp(),updated_at timestamptz default clock_timestamp());
 create function public.social_launch_assert_owner(p jsonb,i jsonb) returns void language plpgsql as $$begin
 if not exists(select 1 from public.projects where id=(i->>'projectId')::uuid and owner_id=(p->>'userId')::uuid) or not(p->'allowedProjectIds' @> jsonb_build_array(i->>'projectId')) then raise exception 'not owner' using errcode='42501';end if;end$$;`);
 const snapshotArg=process.argv.find(x=>x.startsWith('--snapshot='));
 if(snapshotArg){
  const path=snapshotArg.slice('--snapshot='.length),snapshot=JSON.parse(readFileSync(path,'utf8'));
  assert.equal(snapshot.projectId,'77cda551-57c9-4dc0-b019-1bb6438777f7');
  const quote=s=>"'"+s.replaceAll("'","''")+"'";
  for(const table of ['projects','social_account_bindings','social_content_posts','social_content_revisions','social_schedule_jobs','social_publications']){
   assert.ok(Array.isArray(snapshot[table]));
   sql(`insert into public.${table} select * from jsonb_populate_recordset(null::public.${table},${quote(JSON.stringify(snapshot[table]))}::jsonb)`);
  }
  sql(file('../supabase/migrations/20261026070303_family_social_repeat_guard.sql'));
  const principal={userId:'90000000-0000-4000-8000-000000000001',allowedProjectIds:[snapshot.projectId]};
  const conflicts=JSON.parse(sql(`select public.social_content_repeat_check(${quote(JSON.stringify(principal))},${quote(JSON.stringify({projectId:snapshot.projectId}))})`));
  const result={scope:'offline snapshot; no production writes',postCount:snapshot.social_content_posts.length,conflicts:conflicts.map(c=>{
   const post=snapshot.social_content_posts.find(p=>p.id===c.postId),r=snapshot.social_content_revisions.find(r=>r.id===post?.current_revision_id);
   return {...c,title:r?.draft.title,channel:r?.draft.channel,scheduledAt:r?.draft.scheduledAt,queued:snapshot.social_schedule_jobs.some(j=>j.post_id===c.postId&&j.state==='queued')};
  })};
  writeFileSync(path+'.result.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({postCount:result.postCount,conflicts:result.conflicts.length,queuedConflicts:result.conflicts.filter(c=>c.queued).length}));
 }else{
 sql(file('../supabase/migrations/20261026070303_family_social_repeat_guard.sql'));
 sql(file('./probe-social-repeat.sql'));
 sql(`insert into projects values('10000000-0000-4000-8000-000000000001','familje-stunden',gen_random_uuid());
 insert into social_content_revisions(id,post_id,project_id,draft,media) select
 ('20000000-0000-4000-8000-00000000000'||n)::uuid,('30000000-0000-4000-8000-00000000000'||n)::uuid,
 '10000000-0000-4000-8000-000000000001', '{"channel":"facebook","text":"Rymdäventyr med Nova och Pling under stjärnorna"}','[]' from generate_series(1,2) n;`);
 const writer=n=>new Promise(resolve=>{
  const p=spawn(bin,['exec','-i',name,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{stdio:['pipe','pipe','pipe']});let error='';
  p.stderr.on('data',b=>error+=b);p.on('close',code=>resolve({code,error}));
  p.stdin.end(`begin;insert into social_publications(id,project_id,post_id,revision_id,channel,account_id,state) values(gen_random_uuid(),'10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-00000000000${n}','20000000-0000-4000-8000-00000000000${n}','facebook','123','requested');select pg_sleep(0.4);commit;`);
 });
 const race=await Promise.all([writer(1),writer(2)]);
 assert.deepEqual(race.map(r=>r.code).sort(),[0,3]);assert.match(race.find(r=>r.code===3).error,/REVIEW_REQUIRED/);
 assert.equal(sql('select count(*) from social_publications'),'1');
 console.log('Concurrent distinct-ID writers: exactly one admitted.');
 }
 console.log('SOCIAL REPEAT SQL PASS: isolated schema contract; no provider calls.');
}finally{if(owned){assert.equal(docker(['inspect','--format','{{index .Config.Labels "com.omnira.testplan"}}',name]),label);docker(['rm','-f',name]);console.log('Owned repeat fixture removed.');}}
