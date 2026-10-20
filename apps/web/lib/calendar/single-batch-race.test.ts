import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A} from './test-db';
let db:ReturnType<typeof initializeCalendarDb>;
beforeAll(()=>{db=initializeCalendarDb();db.sql(readFileSync(resolve(process.cwd(),'lib/calendar/owner-lock-candidate.sql'),'utf8'));db.sql(readFileSync(resolve(process.cwd(),'lib/calendar/batch-probe-candidate.sql'),'utf8'));},60000);
afterAll(()=>db?.close(),60000);
function sql(body:string){return new Promise<{code:number|null;output:string}>((yes,no)=>{const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db.database]);let output='';p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);p.on('error',no);p.on('exit',code=>yes({code,output}));p.stdin.end(body);});}
const auth=`begin;set local role authenticated;set local "request.jwt.claim.sub"='${USER_A}';`;
const draft=(start:string,end:string)=>JSON.stringify({kind:'private',title:'Regular event',description:'',location:'',projectId:null,taskId:null,workStatus:null,time:{kind:'timed',startUtc:start,endUtc:end,timeZone:'Europe/Stockholm'}}).replaceAll("'","''");
const first='2026-10-23T08:00:00.000Z',last='2026-10-23T09:00:00.000Z';
const batch=JSON.stringify([{title:'Batch',startUtc:first,endUtc:last}]);
const ordinary=()=>`${auth}select public.calendar_event_apply('${JSON.stringify({operation:'create',eventId:randomUUID(),idempotencyKey:randomUUID(),draft:JSON.parse(draft(first,last))}).replaceAll("'","''")}'::jsonb);commit;`;
const plan=()=>`${auth}select public.calendar_week_batch_probe('${batch}'::jsonb,'${randomUUID()}'::uuid);commit;`;
const count=()=>Number(db.sql(`select count(*) from public.user_calendar_events where owner_user_id='${USER_A}'`));
describe('ordinary writer vs weekly batch in isolated DB',()=>{
 it('demonstrates the still-open conflict gap when ordinary create wins',async()=>{
  const a=await sql(ordinary());expect(a.code).toBe(0);
  const b=await sql(plan());expect(b.code).not.toBe(0);expect(count()).toBe(1);
 });
 it('refuses an ordinary booking after the batch reserved its time',async()=>{
  const fresh='2026-10-26T08:00:00.000Z',end='2026-10-26T09:00:00.000Z';
  const proposed=JSON.stringify([{title:'Batch first',startUtc:fresh,endUtc:end}]);
  const b=await sql(`${auth}select public.calendar_week_batch_probe('${proposed}'::jsonb,'${randomUUID()}'::uuid);commit;`);expect(b.code).toBe(0);
  const a=await sql(`${auth}select public.calendar_event_apply('${JSON.stringify({operation:'create',eventId:randomUUID(),idempotencyKey:randomUUID(),draft:JSON.parse(draft(fresh,end))}).replaceAll("'","''")}'::jsonb);commit;`);expect(a.output).toContain('"code": "CONFLICT"');
  expect(count()).toBe(2);
 });
});
