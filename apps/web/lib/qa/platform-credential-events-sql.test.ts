/**
 * lib/qa/platform-credential-events-sql.test.ts — Settings S0 against real Postgres.
 *
 * platform-credential-events.test.ts pins what the migration SAYS. This suite
 * applies the real migration files to a throwaway local database and proves what
 * Postgres DOES with it: every guarantee the owner asked for is exercised as a
 * write that must be refused, and the one sanctioned path as a write that must
 * succeed.
 *
 *   credential-blind  — a token cannot enter `detail` under an unlisted key, as a
 *                       date, as a flag or as a failure stage, and the catalog has
 *                       no column that could hold one.
 *   operation-linked  — a terminal event needs the attempted event of the same
 *                       operation, project, platform, credential type and actor;
 *                       one attempted and one terminal event per operation.
 *   append-only       — UPDATE, DELETE and TRUNCATE refused by the triggers
 *                       themselves (proven as the superuser, who holds every
 *                       privilege), and never granted to the service role either.
 *   server-only       — anon and authenticated hold nothing; the service role
 *                       holds SELECT and INSERT and nothing else; RLS on, no policy.
 *
 * ── SERVICE ROLE ───────────────────────────────────────────────────────────
 * Local roles lack Supabase's BYPASSRLS on service_role, so the sanctioned writer
 * is a per-run role that is BYPASSRLS and a member of service_role — what
 * service_role is in production — exactly as in
 * agent-scorecards-view-isolation-sql.test.ts. It is dropped afterwards.
 *
 * ── SUPABASE DEFAULT PRIVILEGES ────────────────────────────────────────────
 * The fixture reproduces Supabase's default ACL (every new public table granted
 * to anon, authenticated and service_role), so the privilege assertions prove the
 * migration's revoke removed grants production would otherwise hand out — not
 * merely that a bare local database never gave them.
 *
 * LOCAL ONLY. Per-process throwaway database, dropped in afterAll. Never reaches
 * Supabase and never reads a credential. SKIPS loudly without a local Postgres.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

function findPsql(): string | null {
  for (const c of [process.env.ATLAS_SQL_TEST_PSQL, 'psql', '/opt/homebrew/opt/libpq/bin/psql',
    '/usr/local/opt/libpq/bin/psql', '/usr/bin/psql'].filter(Boolean) as string[]) {
    try { execFileSync(c, ['--version'], { stdio: 'pipe' }); return c } catch { /* next */ }
  }
  return null
}
const PSQL = findPsql()
const ADMIN_URL = process.env.ATLAS_SQL_TEST_URL ?? `postgres://${process.env.USER ?? 'postgres'}@127.0.0.1:5432/postgres`
const dsnFor = (db: string) => { const u = new URL(ADMIN_URL); u.pathname = `/${db}`; return u.toString() }

function run(dsn: string, args: string[]): string {
  return execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', dsn, ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
}
function one(dsn: string, sql: string): string {
  return execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', dsn, '-c', sql],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 }).trim()
}

const AVAILABLE = (() => {
  if (!PSQL) return false
  try {
    execFileSync(PSQL, ['-X', '-t', '-A', '-d', ADMIN_URL, '-c', 'select 1'], { stdio: 'pipe', timeout: 10_000 })
    return true
  } catch { return false }
})()
const SQL_REQUIRED = process.env.CI === 'true' || process.env.ATLAS_SQL_TEST_REQUIRED === '1'

if (!AVAILABLE && !SQL_REQUIRED) {
  console.warn(
    '[platform-credential-events-sql] SKIPPED — no reachable local Postgres. The credential-event ' +
    'constraints, append-only triggers and privileges were NOT proven in this run. Set ATLAS_SQL_TEST_URL to enable.',
  )
}
const d = AVAILABLE || SQL_REQUIRED ? describe : describe.skip

const SUFFIX = `${process.pid}_${Math.random().toString(36).slice(2, 8)}`
const DB = `omnira_s0_pce_${SUFFIX}`
const SVC = `omnira_s0_pce_svc_${SUFFIX}`
const MIGRATION = join(process.cwd(), 'supabase/migrations/20260914090100_platform_credential_events.sql')
const FOLLOW_UP = join(process.cwd(), 'supabase/migrations/20260914090200_platform_credential_events_search_path.sql')
let dsn = ''

const PROJ = '33333333-3333-3333-3333-333333333333'
const OTHER_PROJ = '44444444-4444-4444-4444-444444444444'
const ACTOR = 'user:0f8a2c4e-6b1d-4e3f-9a5c-7d2e8b1f4a6c'
const OTHER_ACTOR = 'user:9e1d3c5b-7a2f-4b8e-8c6d-1f3a5b7c9d2e'
const TOKEN = `EAAB${'q'.repeat(90)}`
const PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']

let opCounter = 0
const newOp = () => `00000000-0000-4000-8000-${String(++opCounter).padStart(12, '0')}`

const FIXTURE = `
create extension if not exists pgcrypto;
do $do$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then begin create role service_role; exception when duplicate_object or unique_violation then null; end; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then begin create role anon; exception when duplicate_object or unique_violation then null; end; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then begin create role authenticated; exception when duplicate_object or unique_violation then null; end; end if;
end $do$;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
create table public.projects (id uuid primary key, slug text unique not null);
insert into public.projects (id, slug) values ('${PROJ}', 'ai-media-automation'), ('${OTHER_PROJ}', 'other-project');
`

interface Ev {
  op: string
  outcome: string
  platform?: string
  type?: string
  project?: string
  actor?: string
  detail?: string
  occurredAt?: string
}

function ev(e: Ev): string {
  const platform = e.platform ?? 'facebook'
  const cols = ['operation_id', 'project_id', 'platform', 'credential_type', 'actor', 'outcome', 'detail']
  const vals = [
    `'${e.op}'`, `'${e.project ?? PROJ}'`, `'${platform}'`, `'${e.type ?? (platform === 'instagram' ? 'user' : 'page')}'`,
    `'${e.actor ?? ACTOR}'`, `'${e.outcome}'`, `'${e.detail ?? '{}'}'::jsonb`,
  ]
  if (e.occurredAt) { cols.push('occurred_at'); vals.push(`'${e.occurredAt}'`) }
  return `insert into public.platform_credential_events (${cols.join(', ')}) values (${vals.join(', ')});`
}

/** Run SQL inside a transaction that is always rolled back — as `role`, or as the superuser when role is null. */
function txn(role: string | null, sql: string): { ok: boolean; out: string; err: string } {
  const setRole = role ? `set local role "${role}";` : ''
  try {
    const out = execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', dsn, '-c',
      `begin; ${setRole} ${sql} rollback;`],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
    return { ok: true, out: out.trim(), err: '' }
  } catch (e) {
    return { ok: false, out: '', err: String((e as { stderr?: Buffer }).stderr ?? '') }
  }
}

const refusal = (r: { ok: boolean; err: string }): string => {
  expect(r.ok, 'the write was accepted').toBe(false)
  return r.err
}
/** As the sanctioned writer: a valid attempted event, then `terminal` under the same operation. */
const refusedAfterAttempt = (terminal: Omit<Ev, 'op'>, attempt: Partial<Omit<Ev, 'op'>> = {}): string => {
  const op = newOp()
  return refusal(txn(SVC, `${ev({ op, outcome: 'attempted', platform: terminal.platform, ...attempt })} ${ev({ op, ...terminal })}`))
}
/** As the sanctioned writer: a single insert with nothing before it. */
const refusedAlone = (e: Omit<Ev, 'op'>): string => refusal(txn(SVC, ev({ op: newOp(), ...e })))
const priv = (role: string, p: string) => one(dsn, `select has_table_privilege('${role}', 'public.platform_credential_events', '${p}')`)

beforeAll(() => {
  if (!AVAILABLE) return
  run(ADMIN_URL, ['-c', `create database "${DB}"`])
  dsn = dsnFor(DB)
  run(dsn, ['-c', FIXTURE])
  run(dsn, ['--single-transaction', '-f', MIGRATION])
  run(dsn, ['--single-transaction', '-f', FOLLOW_UP])
  run(ADMIN_URL, ['-c', `create role "${SVC}" nologin bypassrls in role service_role`])
}, 120_000)

afterAll(() => {
  if (!AVAILABLE) return
  try { run(ADMIN_URL, ['-c', `drop database if exists "${DB}" with (force)`]) } catch { /* best effort */ }
  try { run(ADMIN_URL, ['-c', `drop role if exists "${SVC}"`]) } catch { /* best effort */ }
})

d('Settings S0 · platform_credential_events in Postgres — the sanctioned path', () => {
  it('the real migrations apply to a fresh database, and replaying them in order changes nothing', () => {
    expect(one(dsn, `select to_regclass('public.platform_credential_events') is not null`)).toBe('t')
    run(dsn, ['--single-transaction', '-f', MIGRATION])
    run(dsn, ['--single-transaction', '-f', FOLLOW_UP])
    expect(priv('service_role', 'INSERT')).toBe('t')
    expect(priv('anon', 'SELECT')).toBe('f')
    expect(one(dsn, `select count(*) from public.platform_credential_events`)).toBe('0')
  })

  it('attempted, then replaced — Facebook, with its three booleans', () => {
    const op = newOp()
    const r = txn(SVC, `${ev({ op, outcome: 'attempted' })}
      ${ev({ op, outcome: 'replaced', detail: '{"exchanged": true, "page_resolved": true, "read_insights_ok": false}' })}
      select string_agg(outcome, ',' order by outcome) from public.platform_credential_events where operation_id = '${op}';`)
    expect(r.err).toBe('')
    expect(r.out).toBe('attempted,replaced')
  })

  it('attempted, then failed — Instagram, with its failure stage', () => {
    const op = newOp()
    const r = txn(SVC, `${ev({ op, outcome: 'attempted', platform: 'instagram' })}
      ${ev({ op, outcome: 'failed', platform: 'instagram', detail: '{"failure_stage": "store"}' })}
      select string_agg(outcome, ',' order by outcome) from public.platform_credential_events where operation_id = '${op}';`)
    expect(r.err).toBe('')
    expect(r.out).toBe('attempted,failed')
  })

  it('an Instagram replacement may carry an ISO-8601 expiry, or nothing at all', () => {
    const [a, b] = [newOp(), newOp()]
    const r = txn(SVC, `${ev({ op: a, outcome: 'attempted', platform: 'instagram' })}
      ${ev({ op: a, outcome: 'replaced', platform: 'instagram', detail: '{"expires_at": "2026-11-13T05:17:55.129Z"}' })}
      ${ev({ op: b, outcome: 'attempted', platform: 'instagram' })}
      ${ev({ op: b, outcome: 'replaced', platform: 'instagram' })}
      select count(*) from public.platform_credential_events where outcome = 'replaced';`)
    expect(r.err).toBe('')
    expect(r.out).toBe('2')
  })

  it('the clock is the database\'s — a caller-supplied occurred_at is overwritten', () => {
    const op = newOp()
    const r = txn(SVC, `${ev({ op, outcome: 'attempted', occurredAt: '1999-01-01T00:00:00Z' })}
      select (occurred_at = now())::text from public.platform_credential_events where operation_id = '${op}';`)
    expect(r.err).toBe('')
    expect(r.out).toBe('true')
  })
})

d('Settings S0 · platform_credential_events in Postgres — every outcome is tied to its attempt', () => {
  it('a terminal event with no attempted event is refused', () => {
    expect(refusedAlone({ outcome: 'replaced' })).toMatch(/has no matching attempted event/)
    expect(refusedAlone({ outcome: 'failed', detail: '{"failure_stage": "store"}' })).toMatch(/has no matching attempted event/)
  })

  it('a terminal event cannot borrow the attempt of another actor, project or platform', () => {
    expect(refusedAfterAttempt({ outcome: 'replaced', actor: OTHER_ACTOR }, { actor: ACTOR })).toMatch(/has no matching attempted event/)
    expect(refusedAfterAttempt({ outcome: 'replaced', project: OTHER_PROJ }, { project: PROJ })).toMatch(/has no matching attempted event/)
    expect(refusedAfterAttempt({ outcome: 'replaced', platform: 'instagram' }, { platform: 'facebook' })).toMatch(/has no matching attempted event/)
  })

  it('one attempted event per operation', () => {
    const op = newOp()
    expect(refusal(txn(SVC, `${ev({ op, outcome: 'attempted' })} ${ev({ op, outcome: 'attempted' })}`)))
      .toMatch(/platform_credential_events_one_attempt/)
  })

  it('one terminal event per operation — replaced cannot be followed by failed', () => {
    const op = newOp()
    expect(refusal(txn(SVC, `${ev({ op, outcome: 'attempted' })} ${ev({ op, outcome: 'replaced' })}
      ${ev({ op, outcome: 'failed', detail: '{"failure_stage": "store"}' })}`)))
      .toMatch(/platform_credential_events_one_terminal/)
  })
})

d('Settings S0 · platform_credential_events in Postgres — credential-blind', () => {
  it('the catalog holds exactly the nine bounded columns', () => {
    expect(one(dsn, `select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
      where table_schema = 'public' and table_name = 'platform_credential_events'`))
      .toBe('event_id,operation_id,occurred_at,project_id,platform,credential_type,actor,outcome,detail')
  })

  it('a token under an unlisted key is refused', () => {
    expect(refusedAfterAttempt({ outcome: 'replaced', detail: `{"access_token": "${TOKEN}"}` })).toMatch(/detail_keys_allowlisted/)
  })

  it('a token hash or fingerprint under an unlisted key is refused', () => {
    expect(refusedAfterAttempt({ outcome: 'replaced', detail: '{"token_sha256": "9f86d081884c7d65"}' })).toMatch(/detail_keys_allowlisted/)
  })

  it('a provider message riding along with a failure stage is refused', () => {
    expect(refusedAfterAttempt({ outcome: 'failed', detail: `{"failure_stage": "store", "message": "Invalid OAuth access_token=${TOKEN}"}` }))
      .toMatch(/platform_credential_events_detail_/)
  })

  it('a token passed off as an expiry is refused', () => {
    expect(refusedAfterAttempt({ outcome: 'replaced', platform: 'instagram', detail: `{"expires_at": "${TOKEN}"}` })).toMatch(/detail_types/)
  })

  it('a token passed off as a flag is refused', () => {
    expect(refusedAfterAttempt({ outcome: 'replaced', detail: `{"exchanged": "${TOKEN}"}` })).toMatch(/detail_types/)
  })

  it('a token passed off as a failure stage is refused', () => {
    expect(refusedAfterAttempt({ outcome: 'failed', detail: `{"failure_stage": "${TOKEN}"}` })).toMatch(/detail_types/)
  })

  it('a JSON null failure stage is refused — a NULL can never slip through a CHECK', () => {
    expect(refusedAfterAttempt({ outcome: 'failed', detail: '{"failure_stage": null}' })).toMatch(/detail_types/)
  })

  it('a detail that is not an object is refused', () => {
    expect(refusedAfterAttempt({ outcome: 'replaced', detail: `["${TOKEN}"]` })).toMatch(/detail_(is_object|keys_allowlisted)/)
  })

  it('an email is not an actor — only the server-authenticated user:<uuid> is', () => {
    expect(refusedAlone({ outcome: 'attempted', actor: 'operator@omnira.test' })).toMatch(/actor_is_a_user/)
  })
})

d('Settings S0 · platform_credential_events in Postgres — shaped by platform and by outcome', () => {
  it('attempted says nothing yet', () => {
    expect(refusedAlone({ outcome: 'attempted', detail: '{"exchanged": true}' })).toMatch(/detail_matches_outcome/)
  })

  it('failed must say where, and only where', () => {
    expect(refusedAfterAttempt({ outcome: 'failed', detail: '{}' })).toMatch(/detail_matches_outcome/)
    expect(refusedAfterAttempt({ outcome: 'failed', detail: '{"failure_stage": "store", "exchanged": false}' })).toMatch(/detail_matches_outcome/)
  })

  it('replaced never claims a failure stage', () => {
    expect(refusedAfterAttempt({ outcome: 'replaced', detail: '{"failure_stage": "store"}' })).toMatch(/detail_matches_outcome/)
  })

  it('an Instagram event carries no Facebook flags, and a Facebook event no expiry', () => {
    expect(refusedAfterAttempt({ outcome: 'replaced', platform: 'instagram', detail: '{"exchanged": true}' })).toMatch(/detail_matches_platform/)
    expect(refusedAfterAttempt({ outcome: 'replaced', platform: 'facebook', detail: '{"expires_at": "2026-11-13T05:17:55.129Z"}' })).toMatch(/detail_matches_platform/)
  })

  it('the credential type follows the platform', () => {
    expect(refusedAlone({ outcome: 'attempted', platform: 'instagram', type: 'page' })).toMatch(/credential_type_matches_platform/)
  })

  it('outcome and platform are closed vocabularies', () => {
    expect(refusedAfterAttempt({ outcome: 'deleted' })).toMatch(/platform_credential_events_(outcome_valid|detail_matches_outcome)/)
    expect(refusedAlone({ outcome: 'attempted', platform: 'youtube', type: 'user' })).toMatch(/platform_credential_events_(platform_valid|credential_type_matches_platform)/)
  })
})

d('Settings S0 · platform_credential_events in Postgres — append-only', () => {
  it('UPDATE is refused by the trigger itself, even for the superuser who holds every privilege', () => {
    const op = newOp()
    expect(refusal(txn(null, `${ev({ op, outcome: 'attempted' })}
      update public.platform_credential_events set outcome = 'replaced' where operation_id = '${op}';`)))
      .toMatch(/append-only \(attempted UPDATE\)/)
  })

  it('DELETE is refused by the trigger itself', () => {
    const op = newOp()
    expect(refusal(txn(null, `${ev({ op, outcome: 'attempted' })}
      delete from public.platform_credential_events where operation_id = '${op}';`)))
      .toMatch(/append-only \(attempted DELETE\)/)
  })

  it('TRUNCATE is refused by the trigger itself', () => {
    const op = newOp()
    expect(refusal(txn(null, `${ev({ op, outcome: 'attempted' })} truncate public.platform_credential_events;`)))
      .toMatch(/append-only \(attempted TRUNCATE\)/)
  })

  it('a project with audit events cannot be deleted — its audit rows are never cascaded away', () => {
    const op = newOp()
    expect(refusal(txn(null, `${ev({ op, outcome: 'attempted' })} delete from public.projects where id = '${PROJ}';`)))
      .toMatch(/violates foreign key constraint/)
  })
})

d('Settings S0 · platform_credential_events in Postgres — server-only', () => {
  it('RLS is on and no policy exists', () => {
    expect(one(dsn, `select relrowsecurity from pg_class where oid = 'public.platform_credential_events'::regclass`)).toBe('t')
    expect(one(dsn, `select count(*) from pg_policies where schemaname = 'public' and tablename = 'platform_credential_events'`)).toBe('0')
  })

  it('the fixture really handed new tables to the client roles — so the revoke is what took it away', () => {
    expect(one(dsn, `select has_table_privilege('anon', 'public.projects', 'SELECT')`)).toBe('t')
  })

  it('anon and authenticated hold no privilege at all', () => {
    for (const role of ['anon', 'authenticated']) {
      for (const p of PRIVILEGES) expect(priv(role, p), `${role} ${p}`).toBe('f')
    }
  })

  it('the service role holds SELECT and INSERT, and nothing else', () => {
    expect(PRIVILEGES.filter((p) => priv('service_role', p) === 't')).toEqual(['SELECT', 'INSERT'])
  })

  it('a client role is refused at the privilege layer', () => {
    expect(refusal(txn('anon', 'select count(*) from public.platform_credential_events;'))).toMatch(/permission denied/)
    expect(refusal(txn('authenticated', ev({ op: newOp(), outcome: 'attempted' })))).toMatch(/permission denied/)
  })

  it('the service role cannot UPDATE, DELETE or TRUNCATE even the rows it wrote', () => {
    for (const stmt of [
      'update public.platform_credential_events set outcome = outcome;',
      'delete from public.platform_credential_events;',
      'truncate public.platform_credential_events;',
    ]) {
      expect(refusal(txn(SVC, `${ev({ op: newOp(), outcome: 'attempted' })} ${stmt}`)), stmt).toMatch(/permission denied/)
    }
  })

  it('the table carries exactly the three triggers the migration promises', () => {
    expect(one(dsn, `select string_agg(tgname, ',' order by tgname) from pg_trigger
      where tgrelid = 'public.platform_credential_events'::regclass and not tgisinternal`))
      .toBe('platform_credential_events_guard_insert,platform_credential_events_no_mutation,platform_credential_events_no_truncate')
  })

  it('both of its functions run on a pinned, empty search_path', () => {
    expect(one(dsn, `select string_agg(p.proname || '=' || coalesce(array_to_string(p.proconfig, ','), '-'), ' ' order by p.proname)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'platform_credential_events_%'`))
      .toBe('platform_credential_events_append_only=search_path="" platform_credential_events_guard_insert=search_path=""')
  })
})
