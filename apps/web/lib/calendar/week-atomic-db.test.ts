import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {initializeCalendarDb,USER_A} from './test-db';

/** A real Postgres fixture proof, NOT the production approval function. */
let db:ReturnType<typeof initializeCalendarDb>;
beforeAll(()=>{db=initializeCalendarDb();},60000);
afterAll(()=>db?.close(),60000);
const count=()=>Number(db.sql(`select count(*) from public.user_calendar_events where owner_user_id='${USER_A}'`));
const draft=(name:string)=>JSON.stringify({kind:'private',title:name,description:'',location:'',projectId:null,taskId:null,time:{kind:'timed',startUtc:'2026-10-20T08:00:00.000Z',endUtc:'2026-10-20T09:00:00.000Z',timeZone:'Europe/Stockholm'},workStatus:null}).replaceAll("'","''");
describe('Postgres atomic weekly batch prerequisite',()=>{
 it('rolls back earlier inserts after a later statement fails in the same transaction',()=>{
  const before=count();
  expect(()=>db.sql(`insert into public.user_calendar_events(id,owner_user_id,draft) values(gen_random_uuid(),'${USER_A}','${draft('first')}'::jsonb); insert into public.user_calendar_events(id,owner_user_id,draft) values(gen_random_uuid(),'${USER_A}','{}'::jsonb)`,USER_A)).toThrow();
  expect(count()).toBe(before);
 });
 it('commits every insert if all statements succeed',()=>{
  const before=count();
  db.sql(`insert into public.user_calendar_events(id,owner_user_id,draft) values(gen_random_uuid(),'${USER_A}','${draft('second')}'::jsonb);insert into public.user_calendar_events(id,owner_user_id,draft) values(gen_random_uuid(),'${USER_A}','${draft('third')}'::jsonb)`,USER_A);
  expect(count()).toBe(before+2);
 });
});
