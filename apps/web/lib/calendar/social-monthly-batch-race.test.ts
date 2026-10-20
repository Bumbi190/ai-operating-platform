import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,PROJECT_A} from './test-db';

let f:ReturnType<typeof initializeCalendarDb>;
beforeAll(()=>{
 f=initializeCalendarDb();
 for(const file of [
  'source-revision-probe.sql',
  'owner-lock-candidate.sql',
  'batch-probe-candidate.sql',
  'week-revision-batch-probe.sql',
  'social-monthly-source-fixture.sql',
  'social-monthly-rule-revision-candidate.sql'
 ])f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+file),'utf8'));
 f.sql("insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('"+USER_A+"','"+PROJECT_A+"',1)");
},60000);
afterAll(()=>f?.close(),60000);

const principal=JSON.stringify({userId:USER_A,allowedProjectIds:[PROJECT_A]});
const rule=(enabled:boolean)=>JSON.stringify({
 projectId:PROJECT_A,
 rule:{dayOfMonth:1,localTime:'20:30',timeZone:'Europe/Stockholm',channels:['facebook','instagram'],enabled}
});
const social=(enabled:boolean)=>"select public.social_schedule_monthly_rule_save('"+principal+"'::jsonb,'"+rule(enabled)+"'::jsonb);";
const batch=(version:number,date:string)=>"select public.calendar_week_revision_batch_probe('"+
 JSON.stringify([{title:'Approved planning',startUtc:date+'T08:00:00.000Z',endUtc:date+'T09:00:00.000Z'}])+
 "'::jsonb,'"+randomUUID()+"','"+PROJECT_A+"',"+version+");";
const auth="begin;set local role authenticated;set local \"request.jwt.claim.sub\"='"+USER_A+"';";
const revision=()=>f.sql("select revision from public.calendar_source_revision_probe where owner_user_id='"+USER_A+"' and project_id='"+PROJECT_A+"'");
const events=()=>f.sql("select count(*) from public.user_calendar_events where owner_user_id='"+USER_A+"'");
const monthly=()=>f.sql("select count(*) from public.social_monthly_release_rules where project_id='"+PROJECT_A+"'");
function session(){
 const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t',
  '-v','ON_ERROR_STOP=1','-U','postgres','-d',f.database]);
 let output='';
 const listeners:((v:string)=>void)[]=[];
 p.stdout.on('data',v=>{output+=v;listeners.forEach(fn=>fn(output));});
 p.stderr.on('data',v=>{output+=v;listeners.forEach(fn=>fn(output));});
 return {
  send:(v:string)=>p.stdin.write(v+'\n'),end:()=>p.stdin.end(),output:()=>output,
  wait:(s:string)=>new Promise<void>((ok,fail)=>{
   if(output.includes(s))return ok();
   listeners.push(v=>{if(v.includes(s))ok();});
   p.once('close',()=>fail(Error('Closed before '+s)));
  }),
  closed:new Promise<{code:number|null;output:string}>(ok=>p.once('close',code=>ok({code,output})))
 };
}
async function waitingOn(fragment:string){
 for(let i=0;i<50;i++){
  const blocked=f.sql("select count(*) from pg_stat_activity where datname='"+f.database+
   "' and wait_event_type='Lock' and query like '%"+fragment+"%'");
  if(Number(blocked)>=1)return true;
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 return false;
}
describe('exact social monthly RPC and calendar batch lock together in PostgreSQL',()=>{
 it('monthly rule waits until an approved weekly batch commits',async()=>{
  const a=session();a.send(auth);a.send(batch(1,'2026-11-20'));
  a.send("select 'BATCH_HELD';");await a.wait('BATCH_HELD');
  const b=session();b.send('begin;set local role service_role;');b.send(social(true));
  b.send("select 'SOCIAL_DONE';");
  let closedB=false;
  try{
   expect(await waitingOn('social_schedule_monthly_rule_save')).toBe(true);
   expect(b.output()).not.toContain('SOCIAL_DONE');
   expect(monthly()).toBe('0');expect(revision()).toBe('1');expect(events()).toBe('0');
  }finally{
   a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
   b.send('commit;');b.end();const result=await b.closed;closedB=true;
   expect(result.code).toBe(0);expect(result.output).toContain('SOCIAL_DONE');
  }
  expect(closedB).toBe(true);
  expect(events()).toBe('1');expect(monthly()).toBe('1');expect(revision()).toBe('2');
 },20000);
 it('a weekly batch using the old revision is rejected after a social rule saves first',async()=>{
  const a=session();a.send('begin;set local role service_role;');a.send(social(false));
  a.send("select 'SOCIAL_HELD';");await a.wait('SOCIAL_HELD');
  const b=session();b.send(auth);b.send(batch(2,'2026-11-21'));
  b.send("select 'BATCH_DONE';");
  try{
   expect(await waitingOn('calendar_week_revision_batch_probe')).toBe(true);
   expect(b.output()).not.toContain('BATCH_DONE');
   expect(revision()).toBe('2');expect(events()).toBe('1');
  }finally{
   a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
   b.end();const result=await b.closed;
   expect(result.code).not.toBe(0);expect(result.output).toMatch(/STALE_SOURCE/);
  }
  expect(revision()).toBe('3');expect(events()).toBe('1');
  expect(f.sql("select rule->>'enabled' from public.social_monthly_release_rules where project_id='"+PROJECT_A+"'")).toBe('false');
 },20000);
});
