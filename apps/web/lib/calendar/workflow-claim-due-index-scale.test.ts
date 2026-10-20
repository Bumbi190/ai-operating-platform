import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A} from './test-db';

let f:ReturnType<typeof initializeCalendarDb>;
const dueLookup=[
 'select r.project_id,due.oldest_wake',
 'from public.calendar_source_revision_probe r',
 'join public.projects p on p.id=r.project_id and p.owner_id=r.owner_user_id',
 'join lateral (',
 ' select d.wake_at oldest_wake from public.workflow_instances d',
 " where d.project_id=r.project_id and d.status='active'",
 ' and d.wake_at is not null and d.wake_at<=now()',
 ' order by d.wake_at limit 1',
 ') due on true',
 'where p.execution_paused is not true',
 'order by r.last_workflow_claim_at nulls first,due.oldest_wake,r.project_id',
 'limit 16'
].join(' ');
type PlanNode={'Node Type'?:string;'Index Name'?:string;'Relation Name'?:string;'Actual Rows'?:number;'Actual Loops'?:number;Plans?:PlanNode[]};
function flatten(plan:PlanNode):PlanNode[]{return [plan,...(plan.Plans??[]).flatMap(flatten)];}

beforeAll(()=>{
 f=initializeCalendarDb();
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/source-revision-probe.sql'),'utf8'));
 f.sql("alter table public.projects add column execution_paused boolean not null default false;"
   +"create table public.platform_config(id integer primary key,automation_paused boolean not null default false);"
   +"insert into public.platform_config(id) values(1);"
   +"create table public.workflow_instances(id uuid primary key,project_id uuid not null references public.projects(id),"
   +"status text not null default 'active',wake_at timestamptz,last_tick_at timestamptz);");
 // 80 additional projects and 20,000 due rows, all isolated test data.
 f.sql("insert into public.projects(id,owner_id) "
  +"select ('10000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'"+USER_A+"'::uuid "
  +"from generate_series(1001,1080) g;"
  +"insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) "
  +"select owner_id,id,1 from public.projects where id in "
  +"(select ('10000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid from generate_series(1001,1080) g);"
  +"insert into public.workflow_instances(id,project_id,wake_at) "
  +"select gen_random_uuid(),p.id,'2026-09-01T08:00:00Z'::timestamptz+(g%180)*interval '1 minute' "
  +"from public.projects p cross join generate_series(1,250) g "
  +"where p.owner_id='"+USER_A+"' and p.id in "
  +"(select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1001,1080) n);");
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/workflow-wake-trigger-candidate.sql'),'utf8'));
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/workflow-claim-due-revision-candidate.sql'),'utf8'));
 f.sql('analyze public.workflow_instances;analyze public.calendar_source_revision_probe;analyze public.projects;');
},60000);
afterAll(()=>f?.close(),60000);

describe('indexed calendar workflow claim on a larger isolated backlog',()=>{
 it('supports an index lookup for the earliest due workflow per project',()=>{
  const result=JSON.parse(f.sql('explain (analyze,buffers,format json) '+dueLookup)) as {Plan:PlanNode}[];
  const nodes=flatten(result[0].Plan);
  const scans=nodes.filter(n=>n['Relation Name']==='workflow_instances');
  expect(scans.length).toBeGreaterThan(0);
  expect(nodes.some(n=>n['Index Name']==='calendar_workflow_due_probe_idx')).toBe(true);
  expect(scans.every(n=>(n['Actual Rows']??0)<=1)).toBe(true);
 });
 it('limits claims and updates matching source revisions atomically',()=>{
  expect(f.sql('select count(*) from public.workflow_instances')).toBe('20000');
  const first=f.sql('select id from public.workflow_claim_due(8,300)').split(/\r?\n/).filter(Boolean);
  expect(first).toHaveLength(8);
  expect(new Set(first).size).toBe(8);
  expect(f.sql("select count(*) from public.calendar_source_revision_probe where revision=2")).toBe('8');
  expect(f.sql('select count(*) from public.workflow_instances where wake_at<=now()')).toBe('19992');
 });
});
