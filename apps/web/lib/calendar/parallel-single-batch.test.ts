import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A} from './test-db';
let db:ReturnType<typeof initializeCalendarDb>;
beforeAll(()=>{db=initializeCalendarDb();db.sql(readFileSync(resolve(process.cwd(),'lib/calendar/owner-lock-candidate.sql'),'utf8'));db.sql(readFileSync(resolve(process.cwd(),'lib/calendar/batch-probe-candidate.sql'),'utf8'));},60000);
afterAll(()=>db?.close(),60000);
function run(body:string):Promise<{code:number|null;output:string}>{return new Promise((yes,no)=>{const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db.database]);let output='';p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);p.on('error',no);p.on('exit',code=>yes({code,output}));p.stdin.end(body);});}
const pre=`begin;set local role authenticated;set local "request.jwt.claim.sub"='${USER_A}';`;
const start='2026-10-28T08:00:00.000Z',end='2026-10-28T09:00:00.000Z';
const draft={kind:'private',title:'Single',description:'',location:'',projectId:null,taskId:null,workStatus:null,time:{kind:'timed',startUtc:start,endUtc:end,timeZone:'Europe/Stockholm'}};
const ordinary=()=>`${pre}select public.calendar_event_apply('${JSON.stringify({operation:'create',eventId:randomUUID(),idempotencyKey:randomUUID(),draft})}'::jsonb);commit;`;
const batch=()=>`${pre}select public.calendar_week_batch_probe('${JSON.stringify([{title:'Batch',startUtc:start,endUtc:end}])}'::jsonb,'${randomUUID()}'::uuid);commit;`;
describe('truly concurrent ordinary and batch write candidates',()=>{
 it('allows exactly one successful non-overlapping winner over two parallel connections',async()=>{
  const [single,weekly]=await Promise.all([run(ordinary()),run(batch())]);
  const succeeded=[single,weekly].filter(x=>x.code===0&&!x.output.includes('"ok": false'));
  expect(succeeded).toHaveLength(1);
  expect(db.sql(`select count(*) from public.user_calendar_events where owner_user_id='${USER_A}'`)).toBe('1');
 });
 it('serializes repeated parallel pairs on distinct slots without duplicates',async()=>{
  for(let i=0;i<6;i++){
   const day=String(29+i).padStart(2,'0');
   const date=i<3?'2026-10-'+day:'2026-11-0'+String(i-2);
   const from=date+'T08:00:00.000Z',to=date+'T09:00:00.000Z';
   const payload={...draft,time:{...draft.time,startUtc:from,endUtc:to}};
   const single=`${pre}select public.calendar_event_apply('${JSON.stringify({operation:'create',eventId:randomUUID(),idempotencyKey:randomUUID(),draft:payload})}'::jsonb);commit;`;
   const weekly=`${pre}select public.calendar_week_batch_probe('${JSON.stringify([{title:'Batch',startUtc:from,endUtc:to}])}'::jsonb,'${randomUUID()}'::uuid);commit;`;
   const [a,b]=await Promise.all([run(i%2?weekly:single),run(i%2?single:weekly)]);
   const wins=[a,b].filter(x=>x.code===0&&!x.output.includes('"ok": false'));
   expect(wins,`pair ${i}`).toHaveLength(1);
  }
  expect(db.sql(`select count(*) from public.user_calendar_events where owner_user_id='${USER_A}'`)).toBe('7');
 });
});
