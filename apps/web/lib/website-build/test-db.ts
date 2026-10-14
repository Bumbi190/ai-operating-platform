// Test-only SQL transport. It executes the real RPCs and table queries in the
// labeled local fixture; no in-memory imitation of fencing or feedback state.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { createAdminClient } from '@/lib/supabase/admin'
const root = resolve(process.cwd(), '../..')
const container = 'omnira-website-build-test-20261014'
export const TEST_PROJECT = '10000000-0000-4000-8000-000000000001'
export const TEST_AGENT = '40000000-0000-4000-8000-000000000001'
export const TEST_CONVERSATION = '50000000-0000-4000-8000-000000000001'
export const TEST_PRINCIPAL = { userId: '20000000-0000-4000-8000-000000000001', allowedProjectIds: [TEST_PROJECT] }
let database = ''
function literal(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return "'" + (typeof value === 'string' ? value : JSON.stringify(value)).replaceAll("'", "''") + "'" + (typeof value === 'object' ? '::jsonb' : '')
}
function ident(value: string): string { if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw Error('Unsafe test SQL identifier'); return '"' + value + '"' }
export function testSql(body: string, service = false): string {
  if (!/^website_test_[0-9]+$/.test(database)) throw Error('No owned test DB')
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database], { input: '\\set VERBOSITY verbose\n' + (service ? 'set role service_role;\n' : '') + body, encoding: 'utf8', maxBuffer: 4_194_304 })
  if (result.status !== 0) throw Object.assign(Error(result.stderr), { code: result.stderr.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1] || 'XX000' })
  return result.stdout.trim()
}
function canonicalFunction(file: string, name: string): string {
  const source = readFileSync(resolve(root, 'apps/web/supabase/migrations', file), 'utf8')
  const start = source.indexOf(`create or replace function public.${name}(`)
  if (start < 0) throw Error('Canonical function missing: ' + name)
  const part = source.slice(start), match = part.match(/\bas\s+(\$\w*\$)/i)
  if (!match) throw Error('Function body delimiter missing')
  return part.slice(0, part.indexOf(match[1] + ';', match.index! + match[0].length) + match[1].length + 1)
}
export function initializeWorkerDb(): ReturnType<typeof createAdminClient> {
  const configured = process.env.WEBSITE_BUILD_TEST_DATABASE_NAME
  if (configured) database = configured
  else {
    try { const log = readFileSync(resolve(root, '.superpowers/sdd/2026-10-14-atlas-live-build-workspace/task3-db-setup.log'), 'utf8').replace(/\u0000/g, ''); database = log.match(/KEEP_DB=(website_test_\d+)/)?.[1] || '' } catch { throw Error('Prepare the isolated SQL fixture and set WEBSITE_BUILD_TEST_DATABASE_NAME to its KEEP_DB value; see the build validation report.') }
  }
  const label = spawnSync('docker', ['inspect', '--format', '{{index .Config.Labels "com.omnira.testplan"}}', container], { encoding: 'utf8' })
  if (label.status !== 0 || label.stdout.trim() !== 'atlas-live-build-20261014') throw Error('Local fixture ownership missing')
  testSql(`alter table agents add column if not exists name text not null default 'Webbbyggare', add column if not exists model text not null default 'claude-sonnet-4-20250514', add column if not exists system_prompt text not null default 'Bygg genomtänkta svenska hemsidor.', add column if not exists config jsonb not null default '{}', add column if not exists skill_ids text[] not null default '{}';
    alter table projects add column if not exists paused_at timestamptz,add column if not exists paused_reason text,add column if not exists name text not null default 'Testprojekt',add column if not exists slug text not null default 'test-project';
    alter table runs add column if not exists error_history jsonb not null default '[]',add column if not exists last_error text,add column if not exists next_retry_at timestamptz,add column if not exists steps_snapshot jsonb,add column if not exists workflow_instance_id uuid,add column if not exists started_at timestamptz,add column if not exists reconciliation_required boolean not null default false,add column if not exists reconciliation_reason text;
    alter table conversations add column if not exists title text,add column if not exists updated_at timestamptz default now();
    create table if not exists conversation_messages(id uuid primary key default gen_random_uuid(),conversation_id uuid references conversations(id),role text,content text,tool_data jsonb,created_at timestamptz default now());
    grant select,insert on conversation_messages to service_role;
    create table if not exists platform_config(id integer primary key,automation_paused boolean not null default false,paused_at timestamptz,paused_reason text);
    insert into platform_config(id) values(1) on conflict do nothing;
    create table if not exists run_logs(id uuid default gen_random_uuid(),run_id uuid,role text,content text);
    grant all on platform_config,run_logs to service_role;`)
  testSql(canonicalFunction('20260831_unified_stop_authority.sql', 'stop_state'))
  testSql(canonicalFunction('20260903120000_durable_cancellation_reaper.sql', 'release_stopped_run'))
  testSql(canonicalFunction('20260902081500_stop_atomic_execution_admission.sql', 'claim_runs'))
  testSql(`grant execute on function stop_state(uuid),release_stopped_run(uuid,uuid),claim_runs(integer,integer) to service_role;`)
  const setReturning = new Set(['stop_state', 'claim_runs'])
  const transport = {
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      try {
        const call = 'public.' + ident(name) + '(' + Object.entries(args).map(([key, value]) => ident(key) + '=>' + literal(value)).join(',') + ')'
        const body = setReturning.has(name) ? `select coalesce(jsonb_agg(to_jsonb(r)),'[]') from ${call} r;` : `select to_jsonb(${call});`
        return { data: JSON.parse(testSql(body, true) || 'null'), error: null }
      } catch (error) { return { data: null, error: { message: (error as Error).message, code: (error as { code: string }).code } } }
    },
    from: (table: string) => {
      let fields = '*', update: Record<string, unknown> | null = null, insert: Record<string, unknown> | null = null
      const where: string[] = []
      const execute = async (single = false) => {
        try {
          const columns = fields === '*' ? '*' : fields.split(',').map(s => ident(s.trim())).join(',')
          const filter = where.length ? ' where ' + where.join(' and ') : ''
          let statement: string
          if (update) statement = `update public.${ident(table)} set ${Object.entries(update).map(([k, v]) => ident(k) + '=' + literal(v)).join(',')}${filter} returning ${columns}`
          else if (insert) statement = `insert into public.${ident(table)}(${Object.keys(insert).map(ident).join(',')}) values(${Object.values(insert).map(literal).join(',')}) returning ${columns}`
          else statement = `select ${columns} from public.${ident(table)}${filter}`
          const body = update || insert ? `with r as (${statement}) select coalesce(jsonb_agg(to_jsonb(r)),'[]') from r;` : `select coalesce(jsonb_agg(to_jsonb(r)),'[]') from (${statement}) r;`
          const rows = JSON.parse(testSql(body, true))
          return { data: single ? rows[0] || null : rows, error: null }
        } catch (error) { return { data: null, error: { message: (error as Error).message, code: (error as { code: string }).code } } }
      }
      const chain = {
        select: (selection = '*') => { fields = selection; return chain },
        eq: (key: string, value: unknown) => { where.push(ident(key) + '=' + literal(value)); return chain },
        is: (key: string, value: unknown) => { where.push(ident(key) + ' is ' + literal(value)); return chain },
        update: (payload: Record<string, unknown>) => { update = payload; return chain },
        insert: (payload: Record<string, unknown>) => { insert = payload; return chain },
        maybeSingle: () => execute(true), single: () => execute(true),
        then: (onFulfilled: (value: unknown) => unknown, onRejected?: (error: unknown) => unknown) => execute().then(onFulfilled, onRejected),
      }
      return chain
    },
  }
  return transport as unknown as ReturnType<typeof createAdminClient>
}
export function resetWorkerDb(): void { testSql('update platform_config set automation_paused=false; update projects set execution_paused=false; update runs set status=\'failed\' where status in (\'pending\',\'running\');') }