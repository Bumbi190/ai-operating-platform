/**
 * Test-infrastructure regression: the real-PostgreSQL suites all bootstrap the cluster-global
 * Supabase roles (anon, authenticated, service_role) and vitest runs those files in parallel
 * against ONE cluster. A check-then-create (`if not exists … then create role`) is a TOCTOU:
 * two sessions both see the role missing and the loser dies with
 *   duplicate key value violates unique constraint "pg_authid_rolname_index"
 * (observed in CI on the Phase 1C2 merge commit). This is TEST SETUP only — no product SQL.
 *
 * Two proofs:
 *  1. STRUCTURAL — every suite that creates those roles wraps `create role` in a handler for
 *     duplicate_object / unique_violation, so a new suite cannot reintroduce the bare pattern.
 *  2. BEHAVIOURAL, DETERMINISTIC — session A creates a role inside an open transaction (invisible
 *     to pg_roles until commit); session B then runs the bootstrap. The bare pattern fails with
 *     the exact CI error every time; the wrapped pattern tolerates it.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { execFile, execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const QA_DIR = __dirname
const exec = promisify(execFile)

function findPsql(): string | null {
  for (const candidate of [process.env.ATLAS_SQL_TEST_PSQL, 'psql', '/opt/homebrew/bin/psql', '/opt/homebrew/opt/libpq/bin/psql'].filter(Boolean) as string[]) {
    try { execFileSync(candidate, ['--version'], { stdio: 'pipe' }); return candidate } catch { /* next */ }
  }
  return null
}
const PSQL = findPsql()
const ADMIN_URL = process.env.ATLAS_SQL_TEST_URL ?? `postgres://${process.env.USER ?? 'postgres'}@127.0.0.1:5432/postgres`
const AVAILABLE = (() => {
  if (!PSQL) return false
  try { execFileSync(PSQL, ['-X', '-t', '-A', '-d', ADMIN_URL, '-c', 'select 1'], { stdio: 'pipe', timeout: 10_000 }); return true } catch { return false }
})()
const SQL_REQUIRED = process.env.CI === 'true' || process.env.ATLAS_SQL_TEST_REQUIRED === '1'
const d = AVAILABLE || SQL_REQUIRED ? describe : describe.skip

const GUARD = /if not exists \(select 1 from pg_roles where rolname\s*=\s*'([A-Za-z_]+)'\)\s+then\s+([\s\S]*?)\s*end if;/g
const SAFE_CREATE = /^begin create role [A-Za-z_]+[^;]*; exception when duplicate_object or unique_violation then null; end;$/

describe('SQL test role bootstrap is safe under concurrent suites (structural)', () => {
  const suites = readdirSync(QA_DIR).filter(name => name.endsWith('.ts') && name !== 'sql-test-role-bootstrap-race.test.ts')
    .map(name => ({ name, source: readFileSync(join(QA_DIR, name), 'utf8') }))
    .filter(({ source }) => /from pg_roles where rolname/.test(source))

  it('finds the real-Postgres suites that bootstrap roles (so this guard cannot silently cover nothing)', () => {
    expect(suites.length).toBeGreaterThanOrEqual(22)
    for (const name of ['sdf1c-trusted-broker-sql.test.ts', 'sdf1c-broker-claim-credential-sql.test.ts', 'sdf1c2-broker-control-channel-sql.test.ts', 'sdf1b-code-work-control-plane-sql.test.ts']) {
      expect(suites.map(suite => suite.name)).toContain(name)
    }
  })

  it('every role creation tolerates a concurrent creator (duplicate_object / unique_violation)', () => {
    const offenders: string[] = []
    for (const { name, source } of suites) {
      const guards = [...source.matchAll(GUARD)]
      if (guards.length === 0) offenders.push(`${name}: guard pattern not recognised`)
      for (const [, role, body] of guards) {
        if (!SAFE_CREATE.test(body.replace(/\s+/g, ' ').trim())) offenders.push(`${name}: ${role}`)
      }
      // no create role may sit outside a guard handler at all
      const bare = source.split('\n').filter(line => /\bcreate role\b/.test(line) && !/exception when duplicate_object or unique_violation/.test(line) && !/create role "\$\{/.test(line) && !/in role service_role/.test(line))
      if (bare.length) offenders.push(`${name}: unwrapped create role: ${bare[0].trim().slice(0, 80)}`)
    }
    expect(offenders).toEqual([])
  })
})

d('SQL test role bootstrap under a real concurrent creator (deterministic race)', () => {
  const suffix = `${process.pid}_${Math.random().toString(36).slice(2, 8)}`
  const roles = [`omnira_race_old_${suffix}`, `omnira_race_new_${suffix}`]
  const psql = (sql: string) => exec(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', ADMIN_URL, '-c', sql], { timeout: 60_000 })
  const BARE = (role: string) => `do $roles$ begin if not exists (select 1 from pg_roles where rolname='${role}') then create role ${role} nologin; end if; end $roles$;`
  const SAFE = (role: string) => `do $roles$ begin if not exists (select 1 from pg_roles where rolname='${role}') then begin create role ${role} nologin; exception when duplicate_object or unique_violation then null; end; end if; end $roles$;`

  /** Session A holds an UNCOMMITTED role creation while session B bootstraps the same name. */
  async function raceWith(role: string, bootstrap: (role: string) => string) {
    const holder = psql(`begin; create role ${role} nologin; select pg_sleep(2.5); commit;`)
    await new Promise(resolve => setTimeout(resolve, 700))          // A has inserted; B cannot see it yet
    const contender = await psql(bootstrap(role)).then(() => ({ ok: true, err: '' }), (error: { stderr?: string }) => ({ ok: false, err: String(error.stderr ?? error) }))
    await holder
    return contender
  }

  afterAll(async () => { for (const role of roles) await psql(`drop role if exists ${role}`).catch(() => undefined) })

  it('the bare check-then-create loses the race with the exact CI error (proves the race is real)', async () => {
    const result = await raceWith(roles[0], BARE)
    expect(result.ok).toBe(false)
    expect(result.err).toMatch(/duplicate key value violates unique constraint "pg_authid_rolname_index"/)
  })

  it('the wrapped bootstrap tolerates the same race and leaves the role in place', async () => {
    const result = await raceWith(roles[1], SAFE)
    expect(result).toEqual({ ok: true, err: '' })
    const { stdout } = await exec(PSQL!, ['-X', '-t', '-A', '-d', ADMIN_URL, '-c', `select count(*) from pg_roles where rolname='${roles[1]}'`])
    expect(stdout.trim()).toBe('1')
  })
})
