import { spawnSync, spawn } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')
const target = new URL(process.env.WEBSITE_BUILD_TEST_DATABASE_URL || 'http://missing.invalid')
if (target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '54389' || target.pathname !== '/omnira_website_test') throw Error('Set WEBSITE_BUILD_TEST_DATABASE_URL to the explicit isolated local test target; cloud and arbitrary databases are refused')
const container = 'omnira-website-build-test-20261014'
const testNotices = []
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
  if (result.status !== 0) throw Error((result.stderr || result.stdout || result.error?.message).slice(-6000))
  testNotices.push(...result.stderr.split('\n').filter(line => line.includes('NOTICE:') && line.includes('PASS ')))
  return result.stdout.trim()
}
const context = docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])
if (!/^(npipe:\/\/|unix:\/\/)/.test(context)) throw Error('Remote Docker context refused')
if (docker(['inspect', '--format', '{{index .Config.Labels "com.omnira.testplan"}}', container]) !== 'atlas-live-build-20261014') throw Error('Test container ownership label missing')
const database = 'website_test_' + Date.now()
docker(['exec', container, 'createdb', '-U', 'postgres', database])
const psqlArgs = ['exec', '-i', container, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database]
const sql = body => docker(psqlArgs, body)
const bootstrap = `
create extension if not exists pgcrypto;
do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if; end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table auth.users(id uuid primary key);
create table public.projects(id uuid primary key,owner_id uuid not null references auth.users,execution_paused boolean not null default false);
create table public.agents(id uuid primary key,project_id uuid not null references public.projects);
create table public.conversations(id uuid primary key,user_id uuid not null references auth.users);
create table public.runs(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects,workflow_id uuid,kind text,status text not null default 'pending',input jsonb not null default '{}',context jsonb not null default '{}',idempotency_key text unique,policy_class text,claim_id uuid,lease_until timestamptz,claimed_at timestamptz,cancel_requested boolean not null default false,cancel_reason text,cancelled_by text,finished_at timestamptz,error text,created_at timestamptz not null default now(),attempts integer not null default 0,max_attempts integer not null default 3);
create table public.approvals(run_id uuid,status text,reviewed_at timestamptz);
alter table projects enable row level security;
create policy owner_read on projects for select to authenticated using(owner_id=auth.uid());
grant usage on schema public,auth to authenticated,service_role;
grant select on projects to authenticated;
grant all on all tables in schema public,auth to service_role;
insert into auth.users values('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
insert into projects(id,owner_id) values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002');
insert into agents values('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
insert into conversations values('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
`
try {
  sql(bootstrap)
  const canonicalCancel = readFileSync(resolve(root, 'apps/web/supabase/migrations/20260903120000_durable_cancellation_reaper.sql'), 'utf8')
  const cancelStart = canonicalCancel.indexOf('create or replace function public.request_run_cancel(')
  const cancelEnd = canonicalCancel.indexOf('$fn$;', cancelStart) + 6
  if (cancelStart < 0 || cancelEnd < cancelStart) throw Error('Canonical cancellation function not found')
  sql(canonicalCancel.slice(cancelStart, cancelEnd))
  sql('revoke all on function public.request_run_cancel(uuid,uuid,text,text) from public,anon,authenticated; grant execute on function public.request_run_cancel(uuid,uuid,text,text) to service_role;')
  const migrationDir = resolve(root, 'apps/web/supabase/migrations')
  const migration = readdirSync(migrationDir).find(name => name.endsWith('_website_build_sessions.sql'))
  if (!migration) throw Error('Website migration missing')
  sql(readFileSync(resolve(migrationDir, migration), 'utf8'))
  const compile = spawnSync(process.execPath, [resolve(root, 'node_modules/tsx/dist/cli.mjs'), '-e', `import {compileWebsiteArtifact} from './apps/web/lib/website-build/artifact'; console.log(JSON.stringify(compileWebsiteArtifact({format:'static-website.v1',title:'Test',pages:[{key:'index',title:'Hem',bodyHtml:'<h1>Vår idé</h1>',css:'',behaviors:[]}]})));`], { cwd: root, encoding: 'utf8' })
  if (compile.status !== 0) throw Error(compile.stderr)
  const artifact = JSON.parse(compile.stdout.trim())
  const tests = readFileSync(resolve(root, 'apps/web/supabase/tests/website_build.sql'), 'utf8').replaceAll('__ARTIFACT_JSON__', JSON.stringify(artifact).replaceAll("'", "''"))
  sql(tests)
  console.log(testNotices.join('\n'))
  // Multiple real connections prove lock ordering. The SQL suite leaves a
  // dedicated race session; commit holds the run lock before cancel can read it.
  const race = JSON.parse(sql(`select public.website_build_test_race_setup()::text;`).split('\n').filter(l => l.trim().startsWith('{')).at(-1))
  const writerSql = JSON.stringify(race.writer).replaceAll("'", "''")
  const artifactSql = JSON.stringify(artifact).replaceAll("'", "''")
  const contender = spawn('docker', psqlArgs, { stdio: ['pipe', 'pipe', 'pipe'] })
  let raceOut = '', raceErr = ''
  contender.stdout.on('data', d => raceOut += d); contender.stderr.on('data', d => raceErr += d)
  const result = new Promise((resolveRace, reject) => { contender.on('error', reject); contender.on('exit', code => code === 0 ? resolveRace() : reject(Error(raceErr))) })
  contender.stdin.end(`begin; select id from runs where id='${race.writer.runId}' for update; select pg_advisory_xact_lock(881940); select pg_sleep(2); select website_build_commit_revision('${writerSql}'::jsonb,'${artifactSql}'::jsonb); commit;`)
  let locked = false
  for (let attempt = 0; attempt < 20; attempt++) {
    if (sql(`select exists(select 1 from pg_locks where locktype='advisory' and objid=881940 and granted);`) === 't') { locked = true; break }
    await new Promise(resolveWait => setTimeout(resolveWait, 50))
  }
  if (!locked) throw Error('Race contender did not reach the lock barrier')
  sql(`select public.request_run_cancel('${race.writer.runId}','${race.writer.projectId}',null,'race cancel');`)
  await result
  const outcome = sql(`select count(*) from website_preview_revisions where session_id='${race.writer.sessionId}';`)
  if (outcome !== '1') throw Error('Commit holding the lock must win exactly one revision')
  const cancelFirst = JSON.parse(sql('select public.website_build_test_race_setup()::text;'))
  sql(`select public.request_run_cancel('${cancelFirst.writer.runId}','${cancelFirst.writer.projectId}',null,'cancel before commit');`)
  try { sql(`select website_build_commit_revision('${JSON.stringify(cancelFirst.writer)}'::jsonb,'${artifactSql}'::jsonb);`); throw Error('Cancel-first commit was accepted') }
  catch (error) { if (!String(error).includes('WEBSITE_RUN_CANCELLED')) throw error }
  if (sql(`select count(*) from website_preview_revisions where session_id='${cancelFirst.writer.sessionId}';`) !== '0') throw Error('Cancel-first race produced a revision')
  console.log('PASS SQL session/feedback/RLS/fence/control tests and concurrent commit/cancel')
} finally {
  if (process.env.WEBSITE_BUILD_TEST_KEEP_DATABASE === '1') console.log('KEEP_DB=' + database)
  else docker(['exec', container, 'dropdb', '-U', 'postgres', '--force', database])
}
