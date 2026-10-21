import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {initializeCalendarSocialDb} from './social-fixtures.test-utils';
import {USER_A,USER_EMPTY,PROJECT_A} from './test-db';
import {fixtureCreate,fixtureRange} from './fixtures.test-utils';
import {scheduleFixture} from '../social-launch/scheduling/fixtures.test-utils';
import {approveSchedule,saveMonthlyRule} from '../social-launch/scheduling/store';
import {readCalendarSocial} from './source-social';
import {readCalendarWeek} from './read';
import {mutateCalendarEvent} from './store';
import {weekRange,stockholmDate} from './time';
let fixture:ReturnType<typeof initializeCalendarSocialDb>;
beforeAll(()=>{fixture=initializeCalendarSocialDb()},60000);afterAll(()=>{fixture?.close();vi.unstubAllEnvs()});
describe('real project sources',()=>{
 it('projects a proposed slot, then deduplicates it using the actual approved queue time',async()=>{
  const f=await scheduleFixture(fixture.adminDb),range=weekRange(stockholmDate(f.dueAt));
  const before=fixture.testSql("select jsonb_build_object('jobs',(select coalesce(jsonb_agg(to_jsonb(j)),'[]') from social_schedule_jobs j),'approvals',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from social_schedule_decisions a));");
  const proposed=await readCalendarSocial(fixture.adminDb,f.principal,range);
  expect(proposed.entries.filter(e=>e.source.kind==='social'&&e.source.postId===f.source.postId)).toHaveLength(1);
  expect(proposed.entries[0].status).toBe('proposal');
  expect(fixture.testSql("select jsonb_build_object('jobs',(select coalesce(jsonb_agg(to_jsonb(j)),'[]') from social_schedule_jobs j),'approvals',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from social_schedule_decisions a));")).toBe(before);
  const approved=await approveSchedule(fixture.adminDb,f.principal,f.approval);
  const entries=(await readCalendarSocial(fixture.adminDb,f.principal,range)).entries.filter(e=>e.source.kind==='social'&&e.source.postId===f.source.postId);
  expect(entries).toHaveLength(1);expect(entries[0].status).toBe('queued');
  expect(entries[0].time).toMatchObject({startUtc:new Date(f.dueAt).toISOString(),endUtc:null});
  expect(entries[0].source.kind==='social'&&entries[0].source.jobId).toBe(approved.jobs[0].id);
 });
 it('shows the monthly release rule as missing content without a fake job',async()=>{
  await saveMonthlyRule(fixture.adminDb,{userId:USER_A,allowedProjectIds:[PROJECT_A]},{projectId:PROJECT_A,rule:{dayOfMonth:1,localTime:'20:30',timeZone:'Europe/Stockholm',channels:['facebook','instagram'],enabled:true}});
  const entries=(await readCalendarSocial(fixture.adminDb,{userId:USER_A,allowedProjectIds:[PROJECT_A]},weekRange('2026-12-01'))).entries;
  expect(entries.some(e=>e.status==='content_missing'&&e.time.kind==='timed'&&e.time.startUtc==='2026-12-01T19:30:00.000Z')).toBe(true);
  expect(entries.every(e=>!e.editable)).toBe(true);
 });
 it('keeps a private meeting when a project reader fails, and an empty project list reads no project data',async()=>{
  const sessionDb=fixture.forUser(USER_EMPTY),created=await mutateCalendarEvent(sessionDb,fixtureCreate());
  const model=await readCalendarWeek({sessionDb,adminDb:fixture.adminDb},{userId:USER_EMPTY,allowedProjectIds:[]},fixtureRange);
  expect(model.entries.map(e=>e.id)).toEqual(['manual:'+created.event.id]);
  const broken={from(){throw Error('Source unavailable')},rpc(){throw Error('Source unavailable')}} as unknown as typeof fixture.adminDb;
  const degraded=await readCalendarWeek({sessionDb,adminDb:broken},{userId:USER_EMPTY,allowedProjectIds:[PROJECT_A]},fixtureRange);
  expect(degraded.entries.map(e=>e.id)).toContain('manual:'+created.event.id);
  expect(degraded.availability.social).toBe(false);expect(degraded.availability.manual).toBe(true);
 });
 it('keeps tasks without time outside the grid and drops foreign rows',async()=>{
  const model=await readCalendarWeek({sessionDb:fixture.forUser(USER_A),adminDb:fixture.adminDb},{userId:USER_A,allowedProjectIds:[PROJECT_A]},fixtureRange);
  expect(model.unscheduledTasks.every(t=>t.projectId===PROJECT_A)).toBe(true);
  expect(model.unscheduledTasks.length).toBeGreaterThan(0);
  expect(model.entries.some(e=>e.id.startsWith('task:'))).toBe(false);
 });
});

it('reports a capped task feed and preserves actual workflow wake points',async()=>{
 fixture.sql("insert into manager_tasks(id,project_id,title,status) select gen_random_uuid(),'10000000-0000-4000-8000-000000000001','Arbetsuppgift '||n,'pending' from generate_series(1,501) n; insert into workflow_instances(id,project_id,def_key,def_version,instance_key,current_state,status,wake_at) values('40000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000001','familje-stunden.monthly-release',1,'2026-11','preparing','active','2026-10-22T12:00:00Z');");
 const model=await readCalendarWeek({sessionDb:fixture.forUser(USER_A),adminDb:fixture.adminDb},{userId:USER_A,allowedProjectIds:[PROJECT_A]},fixtureRange);
 expect(model.unscheduledTasks).toHaveLength(500);expect(model.truncated.tasks).toBe(true);
 expect(model.availability.workflows).toBe(true);
 const wake=model.entries.find(e=>e.source.kind==='workflow');
 expect(wake).toMatchObject({id:'workflow:40000000-0000-4000-8000-000000000099',title:'Fortsättning · 2026-11',editable:false,time:{kind:'timed',startUtc:'2026-10-22T12:00:00.000Z',endUtc:null}});
});
