import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {vi} from 'vitest';
import {initializeCalendarDb,PROJECT_A} from './test-db';
import {initializeSchedulingDb} from '../social-launch/scheduling/test-db';
import {testSql} from '../website-build/test-db';
/** Own fresh calendar DB, canonical social fixture bootstraps; no shared reset. */
export function initializeCalendarSocialDb(){
 const fixture=initializeCalendarDb();
 try {
 fixture.sql(`alter table projects add column execution_paused boolean not null default false,add column color text,add column created_at timestamptz not null default now();
 create table agents(id uuid primary key,project_id uuid not null references projects);
 create table conversations(id uuid primary key,user_id uuid not null references auth.users);
 create table runs(id uuid primary key default gen_random_uuid(),project_id uuid not null references projects,workflow_id uuid,kind text,status text not null default 'pending',input jsonb not null default '{}',context jsonb not null default '{}',idempotency_key text unique,policy_class text,claim_id uuid,lease_until timestamptz,claimed_at timestamptz,cancel_requested boolean not null default false,cancel_reason text,cancelled_by text,finished_at timestamptz,error text,created_at timestamptz not null default now(),attempts integer not null default 0,max_attempts integer not null default 3);
 create table approvals(run_id uuid,status text,reviewed_at timestamptz);
 grant usage on schema public,auth to service_role;
 grant all on projects,manager_tasks,agents,conversations,runs,approvals,auth.users to service_role;
 insert into agents values('40000000-0000-4000-8000-000000000001','${PROJECT_A}');
 insert into conversations values('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
 alter table runs add column workflow_instance_id uuid,add column workflow_def_hash text,add column workflow_from_state text,add column action_kind text,add column action_class text,add column target_version_hash text,add column authorization_id uuid,add column attempt_group uuid,add column authorized_at timestamptz;`);
 const dir=resolve(process.cwd(),'supabase/migrations');
 for(const [file,name] of [['20260830_workflow_action_binding.sql','runs_idempotency_key_sha256'],['20260830_readonly_action_authorization.sql','runs_action_binding_complete']]){
  const source=readFileSync(resolve(dir,file),'utf8'),start=source.indexOf('alter table public.runs add constraint '+name+' check ('),end=source.indexOf(');',start)+2;
  if(start<0||end<start)throw Error('Canonical fixture constraint missing');
  fixture.sql(source.slice(start,end));
 }
 const canonical=readFileSync(resolve(dir,'20260903120000_durable_cancellation_reaper.sql'),'utf8');
 const start=canonical.indexOf('create or replace function public.request_run_cancel('),end=canonical.indexOf('$fn$;',start)+6;
 if(start<0||end<start)throw Error('Canonical cancellation fixture missing');
 fixture.sql(canonical.slice(start,end));
 fixture.sql(readFileSync(resolve(dir,readdirSync(dir).find(n=>n.endsWith('_website_build_sessions.sql'))!),'utf8'));
 vi.stubEnv('WEBSITE_BUILD_TEST_DATABASE_NAME',fixture.database);
 const db=initializeSchedulingDb();
 // Sources test only these actual tables; a raw task has no invented deadline.
 fixture.sql(`create table workflow_instances(id uuid primary key,def_id uuid,def_version integer,closed_at timestamptz,def_key text,def_hash text,instance_key text,current_state text,status text,context jsonb,version integer,project_id uuid,wake_at timestamptz,last_tick_at timestamptz,last_tick_outcome text,created_at timestamptz,updated_at timestamptz);grant select on workflow_instances to service_role;`);
 return {...fixture,adminDb:db,testSql};
 }catch(error){fixture.close();throw error;}
}
