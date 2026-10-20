import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A} from './test-db';
let fixture:ReturnType<typeof initializeCalendarDb>;
beforeAll(()=>{fixture=initializeCalendarDb();fixture.sql(readFileSync(resolve(process.cwd(),'lib/calendar/owner-lock-candidate.sql'),'utf8'));fixture.sql(readFileSync(resolve(process.cwd(),'lib/calendar/batch-probe-candidate.sql'),'utf8'));},60000);
afterAll(()=>fixture?.close(),60000);
const row=(title:string,start:string,end:string)=>({title,startUtc:start,endUtc:end});
const a='2026-10-20T08:00:00.000Z',b='2026-10-20T09:00:00.000Z',c='2026-10-20T10:00:00.000Z';
const count=()=>Number(fixture.sql(`select count(*) from public.user_calendar_events where owner_user_id='${USER_A}'`));
const run=(rows:unknown[])=>fixture.sql(`select public.calendar_week_batch_probe('${JSON.stringify(rows).replaceAll("'","''")}'::jsonb)`,USER_A);
describe('isolated SQL batch probe never production ready',()=>{
 it('inserts two nonoverlapping records atomically',()=>{expect(JSON.parse(run([row('one',a,b),row('two',b,c)]))).toMatchObject({ok:true,count:2});expect(count()).toBe(2);});
 it('rolls back an earlier insert if a later record is invalid',()=>{const before=count();expect(()=>run([row('three','2026-10-21T08:00:00.000Z','2026-10-21T09:00:00.000Z'),row('bad','2026-10-21T11:00:00.000Z','2026-10-21T10:00:00.000Z')])).toThrow();expect(count()).toBe(before);});
 it('rejects an existing all-day private booking',()=>{
  const before=count();
  const draft=JSON.stringify({kind:'private',title:'Leave',description:'',location:'',projectId:null,taskId:null,workStatus:null,time:{kind:'all_day',startDate:'2026-10-22',endDateExclusive:'2026-10-23',timeZone:'Europe/Stockholm'}}).replaceAll("'","''");
  fixture.sql(`insert into public.user_calendar_events(id,owner_user_id,draft) values(gen_random_uuid(),'${USER_A}','${draft}'::jsonb)`,USER_A);
  expect(()=>run([row('collision','2026-10-22T09:00:00.000Z','2026-10-22T10:00:00.000Z')])).toThrow();
  expect(count()).toBe(before+1);
 });
 it('refuses to duplicate an existing timed booking',()=>{const before=count();expect(()=>run([row('overlap','2026-10-20T08:30:00.000Z','2026-10-20T09:30:00.000Z')])).toThrow();expect(count()).toBe(before);});
});
