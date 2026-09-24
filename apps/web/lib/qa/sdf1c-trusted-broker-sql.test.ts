/** SDF-1C1 identity invariants against a per-process throwaway PostgreSQL database. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFile, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

function findPsql(): string | null {
  for (const candidate of [process.env.ATLAS_SQL_TEST_PSQL, 'psql', '/opt/homebrew/bin/psql', '/opt/homebrew/opt/libpq/bin/psql'].filter(Boolean) as string[]) {
    try { execFileSync(candidate, ['--version'], { stdio: 'pipe' }); return candidate } catch { /* next */ }
  }
  return null
}
const PSQL = findPsql()
const ADMIN_URL = process.env.ATLAS_SQL_TEST_URL ?? `postgres://${process.env.USER ?? 'postgres'}@127.0.0.1:5432/postgres`
const dsnFor = (db: string) => { const url = new URL(ADMIN_URL); url.pathname = `/${db}`; return url.toString() }
const AVAILABLE = (() => {
  if (!PSQL) return false
  try { execFileSync(PSQL, ['-X', '-t', '-A', '-d', ADMIN_URL, '-c', 'select 1'], { stdio: 'pipe', timeout: 10_000 }); return true } catch { return false }
})()
const SQL_REQUIRED = process.env.CI === 'true' || process.env.ATLAS_SQL_TEST_REQUIRED === '1'
if (!AVAILABLE && !SQL_REQUIRED) console.warn('[sdf1c-sql] SKIPPED — no local Postgres; set ATLAS_SQL_TEST_URL')
const d = AVAILABLE || SQL_REQUIRED ? describe : describe.skip

const suffix = `${process.pid}_${Math.random().toString(36).slice(2, 8)}`
const DB = `omnira_sdf1c1_${suffix}`
const SVC = `omnira_sdf1c1_svc_${suffix}`
let dsn = ''
const run = (target: string, args: string[]) => execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', target, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 90_000 })
const one = (sql: string) => execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', dsn, '-c', sql], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 90_000 }).trim()
const rpc = (sql: string) => one(`set role "${SVC}"; ${sql}; reset role`)
const txn = (sql: string, role: string | null = SVC) => {
  try { return { ok: true, out: one(`begin; ${role ? `set local role "${role}";` : ''} ${sql}; rollback;`), err: '' } }
  catch (error) { return { ok: false, out: '', err: String((error as { stderr?: Buffer }).stderr ?? error) } }
}
const asyncExec = promisify(execFile)
const concurrently = async (a: string, b: string) => Promise.allSettled([a, b].map(sql =>
  asyncExec(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', dsn, '-c', `set role "${SVC}"; ${sql}`], { encoding: 'utf8', timeout: 90_000 })))
const q = (value: string) => `'${value.replaceAll("'", "''")}'`
const REPO = 'github.com/bumbi190/ai-operating-platform'
const HASH = 'a'.repeat(64)
const UID = 'b'.repeat(64)
const X = 'A'.repeat(43)
const Y = 'B'.repeat(43)
let seq = 0
const id = (prefix: string) => `${prefix}0000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`

interface Fixture { owner: string; enrollment: string; host: string; broker: string; challengeHash: string; pairingHash: string; thumb: string }
function createBroker(options: { owner?: string; approve?: boolean; thumb?: string; build?: string } = {}): Fixture {
  const owner = options.owner ?? id('1'), enrollment = id('2'), host = id('3')
  const challengeHash = createHash('sha256').update(`${enrollment}:challenge`).digest('hex')
  const pairingHash = createHash('sha256').update(`${enrollment}:pairing`).digest('hex')
  const thumb = options.thumb ?? createHash('sha256').update(`${enrollment}:key`).digest('base64url')
  rpc(`select (public.atlas_code_broker_begin_enrollment('${enrollment}','${owner}','${host}','${challengeHash}','${pairingHash}',clock_timestamp()+interval '10 minutes',array['${REPO}'])).enrollment_id`)
  const broker = rpc(`select (public.atlas_code_broker_complete_enrollment('${enrollment}','${challengeHash}','${pairingHash}','{"kty":"EC","crv":"P-256","x":"${X}","y":"${Y}"}'::jsonb,'${thumb}','ES256',1,'0.1.0','${options.build ?? HASH}','Synthetic Mac','${UID}','macOS synthetic')).broker_id`)
  if (options.approve) rpc(`select (public.atlas_code_broker_approve('${broker}','${owner}')).status`)
  return { owner, enrollment, host, broker, challengeHash, pairingHash, thumb }
}

beforeAll(() => {
  if (!AVAILABLE) return
  run(ADMIN_URL, ['-c', `do $roles$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then begin create role anon nologin; exception when duplicate_object or unique_violation then null; end; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then begin create role authenticated nologin; exception when duplicate_object or unique_violation then null; end; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then begin create role service_role nologin bypassrls; exception when duplicate_object or unique_violation then null; end; end if;
  end $roles$;`])
  run(ADMIN_URL, ['-c', `create database "${DB}"`])
  dsn = dsnFor(DB)
  run(dsn, ['-c', 'alter default privileges in schema public grant all on tables to anon,authenticated,service_role; alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;'])
  run(dsn, ['--single-transaction', '-f', join(process.cwd(), 'supabase/migrations/20260923150000_sdf1c1_trusted_broker_identity.sql')])
  run(ADMIN_URL, ['-c', `create role "${SVC}" nologin bypassrls in role service_role`])
}, 120_000)

afterAll(() => {
  if (!AVAILABLE) return
  try { run(ADMIN_URL, ['-c', `drop database if exists "${DB}" with (force)`]) } catch { /* best effort */ }
  try { run(ADMIN_URL, ['-c', `drop role if exists "${SVC}"`]) } catch { /* best effort */ }
})

d('SDF-1C1 SQL/RLS/ACL and lifecycle boundary', () => {
  it('1/14 creates exactly two SERVER_ONLY broker tables with RLS and no policies', () => {
    expect(one("select string_agg(tablename,',' order by tablename) from pg_tables where schemaname='public' and tablename like 'atlas_code_broker%'")).toBe('atlas_code_broker_enrollments,atlas_code_brokers')
    for (const table of ['atlas_code_brokers','atlas_code_broker_enrollments']) {
      expect(one(`select relrowsecurity from pg_class where oid='public.${table}'::regclass`)).toBe('t')
      expect(one(`select count(*) from pg_policies where schemaname='public' and tablename='${table}'`)).toBe('0')
      expect(one(`select obj_description('public.${table}'::regclass) like '%SERVER_ONLY%'`)).toBe('t')
    }
  })
  it('2/14 revokes all client access and permits service_role read plus purpose-specific functions only', () => {
    for (const table of ['atlas_code_brokers','atlas_code_broker_enrollments']) for (const role of ['anon','authenticated']) {
      expect(one(`select has_table_privilege('${role}','public.${table}','SELECT')`)).toBe('f')
      expect(one(`select has_table_privilege('${role}','public.${table}','INSERT')`)).toBe('f')
    }
    expect(one("select has_table_privilege('service_role','public.atlas_code_brokers','SELECT')")).toBe('t')
    expect(one("select has_table_privilege('service_role','public.atlas_code_brokers','INSERT')")).toBe('f')
    expect(one("select has_function_privilege('authenticated','public.atlas_code_broker_approve(uuid,uuid)','EXECUTE')")).toBe('f')
    expect(one("select has_function_privilege('service_role','public.atlas_code_broker_approve(uuid,uuid)','EXECUTE')")).toBe('t')
  })
  it('3/14 stores hashes rather than plaintext enrollment material', () => {
    const owner = id('1'), enrollment = id('2'), host = id('3')
    rpc(`select public.atlas_code_broker_begin_enrollment('${enrollment}','${owner}','${host}','${'e'.repeat(64)}','${'f'.repeat(64)}',clock_timestamp()+interval '5 minutes',array['${REPO}'])`)
    expect(one(`select challenge_hash||':'||pairing_code_hash from public.atlas_code_broker_enrollments where enrollment_id='${enrollment}'`)).toBe(`${'e'.repeat(64)}:${'f'.repeat(64)}`)
  })
  it('4/14 requires the exact repository allowlist', () => {
    const result = txn(`select public.atlas_code_broker_begin_enrollment('${id('2')}','${id('1')}','${id('3')}','${'a'.repeat(64)}','${'b'.repeat(64)}',clock_timestamp()+interval '5 minutes',array['github.com/other/repo'])`)
    expect(result.ok).toBe(false); expect(result.err).toMatch(/invalid broker enrollment request/)
  })
  it('5/14 blocks duplicate live enrollment and duplicate key identity', () => {
    const fixture = createBroker()
    const live = txn(`select public.atlas_code_broker_begin_enrollment('${id('2')}','${fixture.owner}','${id('3')}','${'e'.repeat(64)}','${'f'.repeat(64)}',clock_timestamp()+interval '5 minutes',array['${REPO}'])`)
    expect(live.err).toMatch(/already has a live broker identity/)
    const otherOwner = id('1'), enrollment = id('2'), host = id('3')
    rpc(`select public.atlas_code_broker_begin_enrollment('${enrollment}','${otherOwner}','${host}','${'1'.repeat(64)}','${'2'.repeat(64)}',clock_timestamp()+interval '5 minutes',array['${REPO}'])`)
    const duplicate = txn(`select public.atlas_code_broker_complete_enrollment('${enrollment}','${'1'.repeat(64)}','${'2'.repeat(64)}','{"kty":"EC","crv":"P-256","x":"${X}","y":"${Y}"}'::jsonb,'${fixture.thumb}','ES256',1,'0.1.0','${HASH}','Other Mac','${UID}','macOS synthetic')`)
    expect(duplicate.ok).toBe(false); expect(duplicate.err).toMatch(/key_thumbprint/)
  })
  it('6/14 consumes challenge once and rejects wrong or expired proof', () => {
    const fixture = createBroker()
    expect(txn(`select public.atlas_code_broker_complete_enrollment('${fixture.enrollment}','${fixture.challengeHash}','${fixture.pairingHash}','{"kty":"EC","crv":"P-256","x":"${X}","y":"${Y}"}'::jsonb,'${'Z'.repeat(43)}','ES256',1,'0.1.0','${HASH}','Mac','${UID}','macOS')`).err).toMatch(/not usable/)
    const owner = id('1'), enrollment = id('2'), host = id('3')
    one(`insert into public.atlas_code_broker_enrollments(enrollment_id,requested_by,host_id,challenge_hash,pairing_code_hash,allowed_repository_ids,created_at,expires_at) values('${enrollment}','${owner}','${host}','${'4'.repeat(64)}','${'5'.repeat(64)}',array['${REPO}'],clock_timestamp()-interval '10 minutes',clock_timestamp()-interval '5 minutes')`)
    expect(txn(`select public.atlas_code_broker_complete_enrollment('${enrollment}','${'4'.repeat(64)}','${'5'.repeat(64)}','{"kty":"EC","crv":"P-256","x":"${X}","y":"${Y}"}'::jsonb,'${'Q'.repeat(43)}','ES256',1,'0.1.0','${HASH}','Mac','${UID}','macOS')`).err).toMatch(/not usable/)
  })
  it('7/14 requires explicit owner approval and hides foreign or unknown identity', () => {
    const fixture = createBroker()
    expect(one(`select status from public.atlas_code_brokers where broker_id='${fixture.broker}'`)).toBe('pending')
    expect(txn(`select public.atlas_code_broker_approve('${fixture.broker}','${id('1')}')`).err).toMatch(/not found/)
    expect(txn(`select public.atlas_code_broker_approve('${id('4')}','${fixture.owner}')`).err).toMatch(/not found/)
    expect(rpc(`select (public.atlas_code_broker_approve('${fixture.broker}','${fixture.owner}')).status`)).toBe('active')
  })
  it('8/14 makes revocation immediate, terminal and non-reactivatable', () => {
    const fixture = createBroker({ approve: true })
    expect(rpc(`select (public.atlas_code_broker_revoke('${fixture.broker}','${fixture.owner}','revoked','operator_revoked')).status`)).toBe('revoked')
    expect(txn(`select public.atlas_code_broker_approve('${fixture.broker}','${fixture.owner}')`).err).toMatch(/cannot be approved/)
    expect(txn(`select public.atlas_code_broker_accept_request('${fixture.broker}','${fixture.host}',1,'0.1.0','${HASH}',1,'${id('5')}',clock_timestamp())`).err).toMatch(/not active/)
  })
  it('9/14 keeps identity and terminal lifecycle immutable and rejects delete/truncate', () => {
    const fixture = createBroker({ approve: true })
    expect(txn(`select set_config('omnira.code_broker_control','on',true); update public.atlas_code_brokers set host_id='${id('3')}' where broker_id='${fixture.broker}'`, null).err).toMatch(/identity is immutable/)
    for (const statement of [`delete from public.atlas_code_brokers where broker_id='${fixture.broker}'`, 'truncate public.atlas_code_brokers cascade']) {
      expect(txn(statement, null).err).toMatch(/append-preserved/)
    }
  })
  it('10/14 accepts the next counter and rejects stale counter, duplicate jti and stale timestamp', () => {
    const fixture = createBroker({ approve: true }), jti = id('5')
    expect(rpc(`select (public.atlas_code_broker_accept_request('${fixture.broker}','${fixture.host}',1,'0.1.0','${HASH}',1,'${jti}',clock_timestamp())).request_counter`)).toBe('1')
    expect(txn(`select public.atlas_code_broker_accept_request('${fixture.broker}','${fixture.host}',1,'0.1.0','${HASH}',1,'${id('5')}',clock_timestamp())`).err).toMatch(/replay or timestamp/)
    expect(txn(`select public.atlas_code_broker_accept_request('${fixture.broker}','${fixture.host}',1,'0.1.0','${HASH}',2,'${jti}',clock_timestamp())`).err).toMatch(/replay or timestamp/)
    expect(txn(`select public.atlas_code_broker_accept_request('${fixture.broker}','${fixture.host}',1,'0.1.0','${HASH}',2,'${id('5')}',clock_timestamp()-interval '3 minutes')`).err).toMatch(/replay or timestamp/)
  })
  it('11/14 serializes concurrent duplicate authenticated contact so only one succeeds', async () => {
    const fixture = createBroker({ approve: true }), jti = id('5')
    const sql = `select public.atlas_code_broker_accept_request('${fixture.broker}','${fixture.host}',1,'0.1.0','${HASH}',1,'${jti}',clock_timestamp())`
    const results = await concurrently(sql, sql)
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(one(`select request_counter from public.atlas_code_brokers where broker_id='${fixture.broker}'`)).toBe('1')
  })
  it('12/14 fails closed on host, protocol, version and build mismatch', () => {
    const fixture = createBroker({ approve: true })
    for (const args of [
      `'${id('3')}',1,'0.1.0','${HASH}'`, `'${fixture.host}',2,'0.1.0','${HASH}'`,
      `'${fixture.host}',1,'9.9.9','${HASH}'`, `'${fixture.host}',1,'0.1.0','${'f'.repeat(64)}'`,
    ]) expect(txn(`select public.atlas_code_broker_accept_request('${fixture.broker}',${args},1,'${id('5')}',clock_timestamp())`).err).toMatch(/not active/)
  })
  it('13/14 contains no token, claim, cron, network or execution bridge', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260923150000_sdf1c1_trusted_broker_identity.sql'), 'utf8').replace(/--.*$/gm, '')
    expect(sql).not.toMatch(/code_work_claim|broker_token|cron\.schedule|pg_net|net\.http|dblink|copy\s+.+program|listen\s|notify\s/i)
    expect((sql.match(/create table public\.atlas_code_broker/g) ?? [])).toHaveLength(2)
  })
  it('14/14 pins the replay boundary: the counter is durable, the jti is only the last one (not a global nonce)', () => {
    const fixture = createBroker({ approve: true }), first = id('5'), second = id('5')
    const accept = (counter: number, jti: string) =>
      `select public.atlas_code_broker_accept_request('${fixture.broker}','${fixture.host}',1,'0.1.0','${HASH}',${counter},'${jti}',clock_timestamp())`
    rpc(accept(1, first)); rpc(accept(2, second))
    // A replay of an already-accepted request is refused by the counter, whatever its jti.
    expect(txn(accept(1, first)).err).toMatch(/replay or timestamp/)
    expect(txn(accept(2, second)).err).toMatch(/replay or timestamp/)
    expect(txn(accept(1, id('5'))).err).toMatch(/replay or timestamp/)
    // Only the LAST jti is remembered, so an older jti is accepted again at the next counter.
    // Documented so no later phase relies on global jti uniqueness that is not persisted.
    expect(rpc(`select (public.atlas_code_broker_accept_request('${fixture.broker}','${fixture.host}',1,'0.1.0','${HASH}',3,'${first}',clock_timestamp())).request_counter`)).toBe('3')
  })
})
