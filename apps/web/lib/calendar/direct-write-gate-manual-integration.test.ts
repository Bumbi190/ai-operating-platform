import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,USER_B,PROJECT_A,PROJECT_B} from './test-db';

let f:ReturnType<typeof initializeCalendarDb>;
const post=randomUUID(),rev=randomUUID(),binding=randomUUID(),decision=randomUUID();
const sha='a'.repeat(64),capability='c'.repeat(64);
const actor={userId:USER_A,allowedProjectIds:[PROJECT_A]};
const prepare={projectId:PROJECT_A,postId:post,revisionId:rev,
 sha256:sha,decisionId:decision,bindingId:binding,
 idempotencyKey:'manual-gated-first',confirmed:true};
const quote=(s:string)=>"'"+s.replaceAll("'","''")+"'";
const json=(v:unknown)=>quote(JSON.stringify(v))+'::jsonb';
const rpc=(name:'prepare'|'step',input:unknown)=>
 'select public.social_publication_'+name+'('+json(actor)+','+json(input)+');';
const invoke=(name:'prepare'|'step',input:unknown)=>JSON.parse(
 f.sql('set local role service_role;'+rpc(name,input)));
const revNum=(owner=USER_A,project=PROJECT_A)=>f.sql(
 'select revision from public.calendar_source_revision_probe where owner_user_id='+
 quote(owner)+' and project_id='+quote(project));
const count=(table:string)=>Number(f.sql('select count(*) from public.'+table));
const publicationState=(id:string)=>f.sql('select state from public.social_publications where id='+quote(id));
const step=(id:string,action:string,version:number,rest:Record<string,unknown>={})=>({
 projectId:PROJECT_A,postId:post,publicationId:id,
 action,expectedVersion:version,...rest
});
const userAuth="begin;set local role authenticated;set local \"request.jwt.claim.sub\"="+quote(USER_A)+';';
const week=(expected:number,day:string)=>
 'select public.calendar_week_revision_batch_probe('+
 json([{title:'Exact human-approved week item',
  startUtc:day+'T08:00:00.000Z',endUtc:day+'T09:00:00.000Z'}])+','+
 quote(randomUUID())+','+quote(PROJECT_A)+','+expected+');';

beforeAll(()=>{
 f=initializeCalendarDb();
 for(const file of ['source-revision-probe.sql','owner-lock-candidate.sql',
  'batch-probe-candidate.sql','week-revision-batch-probe.sql',
  'social-review-source-fixture.sql','social-manual-publication-source-fixture.sql',
  'direct-write-gate-probe.sql','direct-write-gate-manual-integration-probe.sql']){
  f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+file),'utf8'));
 }
 f.sql('insert into public.social_content_posts(id,project_id) values('+
  quote(post)+','+quote(PROJECT_A)+');'+
  'insert into public.social_content_revisions(id,post_id,project_id,sha256,binding_id,draft,binding) values('+
  [rev,post,PROJECT_A,sha,binding].map(quote).join(',')+
  ','+json({channel:'facebook',format:'image'})+
  ','+json({accountId:'12345',label:'fixture-account'})+');');
},60000);
beforeEach(()=>{
 // Owned local test fixture reset, never a production or service_role operation.
 f.sql('truncate public.social_schedule_events,public.social_schedule_jobs,public.social_publications,public.social_publication_events;'+
  'delete from public.user_calendar_events;'+
  'delete from public.calendar_source_revision_probe;'+
  'insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('+
  [USER_A,PROJECT_A].map(quote).join(',')+',1),('+
  [USER_B,PROJECT_B].map(quote).join(',')+',7);');
},60000);
afterAll(()=>f?.close(),60000);

function session(){
 const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql',
 '-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',f.database]);
 let output='';const callbacks:((s:string)=>void)[]=[];
 p.stdout.on('data',c=>{output+=c;callbacks.forEach(fn=>fn(output));});
 p.stderr.on('data',c=>{output+=c;callbacks.forEach(fn=>fn(output));});
 return {send:(sql:string)=>p.stdin.write(sql+'\n'),end:()=>p.stdin.end(),output:()=>output,
  wait:(tag:string)=>new Promise<void>((resolve,reject)=>{
   if(output.includes(tag))return resolve();
   callbacks.push(s=>{if(s.includes(tag))resolve();});
   p.once('close',()=>reject(Error('Session closed before '+tag)));
  }),
  closed:new Promise<{code:number|null;output:string}>(resolve=>p.once('close',code=>resolve({code,output})))
 };
}
async function waitLock(fragment:string){
 for(let i=0;i<50;i++){
  const locks=Number(f.sql("select count(*) from pg_stat_activity where datname="+
   quote(f.database)+" and wait_event_type='Lock' and query like '%"+fragment+"%'"));
  if(locks>0)return true;
  await new Promise<void>(resolve=>setTimeout(resolve,50));
 }
 return false;
}

describe('exact final manual social RPC bodies under automatic guarded table triggers',()=>{
 it('prepares once with one trigger bump; replay and a forged direct UPDATE do not mutate',()=>{
  const made=invoke('prepare',prepare) as {id:string;state:string;version:number};
  expect(made.state).toBe('requested');expect(made.version).toBe(1);
  expect(count('social_publications')).toBe(1);
  expect(count('social_publication_events')).toBe(1);
  expect(revNum()).toBe('2');expect(revNum(USER_B,PROJECT_B)).toBe('7');
  expect((invoke('prepare',prepare) as {id:string}).id).toBe(made.id);
  expect(revNum()).toBe('2');expect(count('social_publication_events')).toBe(1);
  expect(()=>f.sql('set local role service_role;'+
   "update public.social_publications set state='failed' where id="+quote(made.id)))
   .toThrow(/CALENDAR_WRITE_GATE_REQUIRED/);
  expect(publicationState(made.id)).toBe('requested');expect(revNum()).toBe('2');
 });
 it('manual step uses one automatic bump per actual state change, with no double bumps',()=>{
  const made=invoke('prepare',prepare) as {id:string};
  const claimed=invoke('step',step(made.id,'claim_create',1,{capabilityHash:capability}));
  expect(claimed.changed).toBe(true);expect(claimed.record.state).toBe('publishing');
  expect(revNum()).toBe('3');
  const ended=invoke('step',step(made.id,'complete',2,{
   providerId:'12345_67890',permalink:'https://www.facebook.com/posts/12345'
  }));
  expect(ended.record.state).toBe('published');expect(revNum()).toBe('4');
  expect(count('social_publications')).toBe(1);
  expect(count('social_publication_events')).toBe(3);
  const stale=invoke('step',step(made.id,'complete',2,{providerId:'12345_67890'}));
  expect(stale.changed).toBe(false);expect(revNum()).toBe('4');
 });
 it('late error rolls back signed token, publication, evidence and source revision',()=>{
  expect(()=>f.sql('set local role service_role;'+rpc('prepare',prepare)+'select 1/0;'))
   .toThrow();
  expect(count('social_publications')).toBe(0);
  expect(count('social_publication_events')).toBe(0);
  expect(revNum()).toBe('1');
 });
 it('manual RPC cannot transfer its signed gate token into a later direct service request',()=>{
  const made=invoke('prepare',prepare) as {id:string};
  expect(()=>f.sql('set local role service_role;'+
   "update public.social_publications set state='publishing' where id="+quote(made.id)+';'))
   .toThrow(/CALENDAR_WRITE_GATE_REQUIRED/);
  expect(revNum()).toBe('2');expect(publicationState(made.id)).toBe('requested');
 });
 it('manual prepare transaction locks source first and invalidates a concurrent stale week',async()=>{
  const a=session();a.send('begin;set local role service_role;');
  a.send(rpc('prepare',prepare));a.send("select 'MANUAL_GATE_HELD';");
  await a.wait('MANUAL_GATE_HELD');
  const b=session();b.send(userAuth);b.send(week(1,'2026-11-22'));
  b.send("select 'BATCH_DONE';");
  try{
   expect(await waitLock('calendar_week_revision_batch_probe')).toBe(true);
   expect(revNum()).toBe('1');
  }finally{
   a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
   b.end();const result=await b.closed;
   expect(result.code).not.toBe(0);expect(result.output).toMatch(/STALE_SOURCE/);
  }
  expect(count('social_publications')).toBe(1);
  expect(count('user_calendar_events')).toBe(0);
  expect(revNum()).toBe('2');
 },20000);
});
