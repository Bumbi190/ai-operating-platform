import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A} from './test-db';
let fixture:ReturnType<typeof initializeCalendarDb>;
beforeAll(()=>{fixture=initializeCalendarDb();fixture.sql(readFileSync(resolve(process.cwd(),'lib/calendar/owner-lock-candidate.sql'),'utf8'));fixture.sql(readFileSync(resolve(process.cwd(),'lib/calendar/batch-probe-candidate.sql'),'utf8'));},60000);
afterAll(()=>fixture?.close(),60000);
function concurrent(sql:string):Promise<{exit:number|null;out:string}>{return new Promise((yes,no)=>{const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',fixture.database]);let out='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>out+=b);p.on('error',no);p.on('exit',exit=>yes({exit,out}));p.stdin.end(sql);});}
const count=()=>Number(fixture.sql(`select count(*) from public.user_calendar_events where owner_user_id='${USER_A}'`));
const data=JSON.stringify([{title:'Concurrent block',startUtc:'2026-10-23T08:00:00.000Z',endUtc:'2026-10-23T09:00:00.000Z'}]).replaceAll("'","''");
const request=(key:string)=>`begin;set local role authenticated;set local "request.jwt.claim.sub"='${USER_A}';select public.calendar_week_batch_probe('${data}'::jsonb,'${key}'::uuid);commit;`;
describe('isolated batch concurrent request serialization',()=>{
 it('same key from two sessions creates exactly one calendar event and one receipt',async()=>{
  const key=randomUUID(),[a,b]=await Promise.all([concurrent(request(key)),concurrent(request(key))]);
  expect(a.exit).toBe(0);expect(b.exit).toBe(0);expect(a.out).toContain('"ok": true');expect(b.out).toContain('"ok": true');
  expect(count()).toBe(1);
  expect(fixture.sql(`select count(*) from public.calendar_week_probe_receipts where owner_user_id='${USER_A}'`)).toBe('1');
 });
 it('different key cannot rebook the occupied timeslot',async()=>{
  const result=await concurrent(request(randomUUID()));expect(result.exit).not.toBe(0);expect(count()).toBe(1);
 });
});
