/**
 * lib/qa/social-account-bindings-sql.test.ts — project-scoped social credentials
 * against real Postgres.
 *
 * The five migrations of 2026-09-14 are applied, in order and on top of Settings S0,
 * to throwaway local databases shaped like production, and every guarantee is
 * exercised as a write Postgres must refuse — or, for the sanctioned paths, accept:
 *
 *   O1 and uniqueness — one active account per project and platform, one project per
 *                       external account, one binding for the platform's YouTube
 *                       credential (Y1).
 *   immutability      — identity never changes, verification only upgrades, a block
 *                       is permanent, a superseded binding is frozen, nothing is
 *                       deleted — proven as the superuser.
 *   rebind            — social_account_rebind supersedes and binds in one transaction;
 *                       a stale expectation or an account owned by another project
 *                       leaves the old binding active.
 *   audit v2          — platform_credential_events names the account on `replaced`,
 *                       never on `attempted`, and a writer without event_version
 *                       cannot record an attempt at all.
 *   health / tokens   — closed codes per (project, platform); platform_tokens holds
 *                       only a project's own Instagram or Facebook credential.
 *   evidence (1A)     — The Prompt is bound only while every piece of its evidence
 *                       holds; any drift binds nothing; a fresh database binds nothing.
 *   server-only       — RLS on, no policy, no client privilege, pinned search_path.
 *
 * ── SERVICE ROLE ───────────────────────────────────────────────────────────
 * As in platform-credential-events-sql.test.ts: a per-run BYPASSRLS role that is a
 * member of service_role stands in for Supabase's service role, and is dropped
 * afterwards. The fixture reproduces Supabase's default ACL for new tables and
 * functions, so the privilege assertions prove the migrations' revokes.
 *
 * LOCAL ONLY. Per-process throwaway databases, dropped in afterAll. Never reaches
 * Supabase and never reads a real credential. SKIPS loudly without a local Postgres.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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
    '[social-account-bindings-sql] SKIPPED — no reachable local Postgres. The binding, audit v2, health, ' +
    'platform_tokens and evidence guarantees were NOT proven in this run. Set ATLAS_SQL_TEST_URL to enable.',
  )
}
const d = AVAILABLE || SQL_REQUIRED ? describe : describe.skip

const SUFFIX = `${process.pid}_${Math.random().toString(36).slice(2, 8)}`
const DB_MAIN = `omnira_psc_main_${SUFFIX}`
const DB_EVIDENCE = `omnira_psc_evidence_${SUFFIX}`
const DB_FRESH = `omnira_psc_fresh_${SUFFIX}`
const SVC = `omnira_psc_svc_${SUFFIX}`

const MIGRATIONS = join(process.cwd(), 'supabase/migrations')
const S0 = [
  '20260914090000_platform_tokens_client_revoke.sql',
  '20260914090100_platform_credential_events.sql',
  '20260914090200_platform_credential_events_search_path.sql',
]
const BINDINGS = '20260914120000_social_account_bindings.sql'
const EVENTS_V2 = '20260914120100_platform_credential_events_account_binding.sql'
const HEALTH = '20260914120200_social_credential_health.sql'
const TOKENS = '20260914120300_platform_tokens_project_binding.sql'
const EVIDENCE = '20260914120400_social_account_bindings_the_prompt_evidence.sql'
const EVIDENCE_SQL = readFileSync(join(MIGRATIONS, EVIDENCE), 'utf8')

const PROMPT = '33333333-3333-4333-8333-333333333333'
const FAMILY = '44444444-4444-4444-8444-444444444444'
const GAIN = '55555555-5555-4555-8555-555555555555'
const IG_PROMPT = '17841437027967629'
const IG_OTHER = '17841400000000002'
const PAGE_PROMPT = '1138612202672850'
const CHANNEL_PROMPT = 'UCUM9JDi75ziLssYcGLo8IPA'
const ACTOR = 'user:0f8a2c4e-6b1d-4e3f-9a5c-7d2e8b1f4a6c'
const IG_TOKEN = `IGAA${'q'.repeat(90)}`
const FB_TOKEN = `EAAB${'q'.repeat(90)}`
const MIGRATION_ACTOR = 'migration:social_account_bindings_the_prompt_evidence'
const PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']

let dsn = ''
let evidenceDsn = ''
let freshDsn = ''

/** Supabase-shaped tables the migrations read or alter, as production defines them. */
const FIXTURE = `
create extension if not exists pgcrypto;
do $do$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $do$;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create function public.fixture_default_acl() returns integer language sql as 'select 1';
create table public.projects (id uuid primary key, slug text unique not null);
-- 20260527_platform_tokens + 20260602_g1_multitenant_platform_tokens
create table public.platform_tokens (
  id           uuid        default gen_random_uuid() primary key,
  platform     text        not null,
  token_type   text        not null default 'user',
  access_token text        not null,
  expires_at   timestamptz,
  refreshed_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  project_id   uuid references public.projects(id) on delete cascade,
  account_id   text
);
create unique index platform_tokens_project_platform_type_key on public.platform_tokens (project_id, platform, token_type);
alter table public.platform_tokens enable row level security;
-- 20260602_atlas_growth_account_snapshots
create table public.account_snapshots (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references public.projects(id) on delete set null,
  platform      text not null check (platform in ('instagram','facebook','youtube')),
  snapshot_date date not null default (now() at time zone 'utc')::date,
  captured_at   timestamptz not null default now(),
  followers     integer,
  following     integer,
  media_count   integer,
  reach         integer,
  profile_views integer,
  raw           jsonb,
  unique (project_id, platform, snapshot_date)
);
-- the media_scripts columns the evidence reads
create table public.media_scripts (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid references public.projects(id),
  facebook_post_id text,
  youtube_video_id text,
  published_at     timestamptz
);
insert into public.projects (id, slug) values
  ('${PROMPT}', 'ai-media-automation'), ('${FAMILY}', 'familje-stunden'), ('${GAIN}', 'gainpilot');
`

/** The Prompt's production evidence (read-only discovery, 2026-09-14). */
const EVIDENCE_SEED = `
insert into public.platform_tokens (project_id, platform, token_type, access_token, account_id, expires_at, refreshed_at) values
  ('${PROMPT}', 'instagram', 'user', '${IG_TOKEN}', null, '2026-11-13 06:00:06+00', '2026-09-14 06:00:06+00'),
  ('${PROMPT}', 'facebook',  'page', '${FB_TOKEN}', '${PAGE_PROMPT}', null, '2026-06-05 08:51:09+00');
insert into public.account_snapshots (project_id, platform, snapshot_date, captured_at, raw) values
  ('${PROMPT}', 'instagram', '2026-09-13', '2026-09-13 07:00:05+00', '{"user_id": "${IG_PROMPT}", "username": "theprompt.news"}'),
  ('${PROMPT}', 'instagram', '2026-09-14', '2026-09-14 07:00:07+00', '{"user_id": "${IG_PROMPT}", "username": "theprompt.news", "id": "26840520785639963"}'),
  ('${PROMPT}', 'facebook',  '2026-09-14', '2026-09-14 07:00:07+00', '{"id": "${PAGE_PROMPT}", "followers_count": 12}'),
  ('${PROMPT}', 'youtube',   '2026-09-14', '2026-09-14 07:00:07+00', '{"items": [{"id": "${CHANNEL_PROMPT}"}]}');
insert into public.media_scripts (project_id, facebook_post_id, youtube_video_id, published_at) values
  ('${PROMPT}', '${PAGE_PROMPT}_900', 'ytvideo0001', '2026-09-13 18:00:00+00');
`

const applyFile = (target: string, file: string) => run(target, ['--single-transaction', '-f', join(MIGRATIONS, file)])

/** Run SQL inside a transaction that is always rolled back — as `role`, or as the superuser when role is null. */
function txn(target: string, role: string | null, sql: string): { ok: boolean; out: string; err: string } {
  const setRole = role ? `set local role "${role}";` : ''
  try {
    const out = execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', target, '-c',
      `begin; ${setRole} ${sql} rollback;`],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
    return { ok: true, out: out.trim(), err: '' }
  } catch (e) {
    return { ok: false, out: '', err: String((e as { stderr?: Buffer }).stderr ?? '') }
  }
}
const accepted = (r: { ok: boolean; out: string; err: string }): string => {
  expect(r.err, 'the statement was refused').toBe('')
  return r.out
}
const refused = (r: { ok: boolean; err: string }): string => {
  expect(r.ok, 'the statement was accepted').toBe(false)
  return r.err
}

const bindingId = (platform: string, project = PROMPT) =>
  one(dsn, `select binding_id from public.social_account_bindings where project_id = '${project}' and platform = '${platform}' and superseded_at is null`)

function newBinding(b: { project: string; platform: string; account: string; source?: string; label?: string | null; verification?: string; boundBy?: string; extra?: Record<string, string> }): string {
  const source = b.source ?? (b.platform === 'youtube' ? 'platform_env_transitional' : 'project_store')
  const cols = ['project_id', 'platform', 'external_account_id', 'account_label', 'credential_source', 'verification', 'verified_at', 'bound_by']
  const vals = [`'${b.project}'`, `'${b.platform}'`, `'${b.account}'`, b.label == null ? 'null' : `'${b.label}'`, `'${source}'`,
    `'${b.verification ?? 'provider_attested'}'`, 'now()', `'${b.boundBy ?? ACTOR}'`]
  for (const [column, value] of Object.entries(b.extra ?? {})) { cols.push(column); vals.push(value) }
  return `insert into public.social_account_bindings (${cols.join(', ')}) values (${vals.join(', ')});`
}

let opCounter = 0
const newOp = () => `00000000-0000-4000-8000-${String(++opCounter).padStart(12, '0')}`

function event(e: { op: string; outcome: string; platform?: string; detail?: string; account?: string | null; action?: string | null; version?: number | null }): string {
  const platform = e.platform ?? 'facebook'
  const cols = ['operation_id', 'project_id', 'platform', 'credential_type', 'actor', 'outcome', 'detail']
  const vals = [`'${e.op}'`, `'${PROMPT}'`, `'${platform}'`, `'${platform === 'instagram' ? 'user' : 'page'}'`, `'${ACTOR}'`,
    `'${e.outcome}'`, `'${e.detail ?? '{}'}'::jsonb`]
  if (e.version !== null) { cols.push('event_version'); vals.push(String(e.version ?? 2)) }
  if (e.account !== undefined) { cols.push('external_account_id'); vals.push(e.account === null ? 'null' : `'${e.account}'`) }
  if (e.action !== undefined) { cols.push('binding_action'); vals.push(e.action === null ? 'null' : `'${e.action}'`) }
  return `insert into public.platform_credential_events (${cols.join(', ')}) values (${vals.join(', ')});`
}

beforeAll(() => {
  if (!AVAILABLE) return
  run(ADMIN_URL, ['-c', `create role "${SVC}" nologin bypassrls in role service_role`])

  // Production-shaped: The Prompt's evidence present, every migration applied in order.
  run(ADMIN_URL, ['-c', `create database "${DB_MAIN}"`])
  dsn = dsnFor(DB_MAIN)
  run(dsn, ['-c', FIXTURE + EVIDENCE_SEED])
  for (const file of [...S0, BINDINGS, EVENTS_V2, HEALTH, TOKENS, EVIDENCE]) applyFile(dsn, file)

  // The evidence migration not yet applied, so each scenario can run it inside a rolled-back transaction.
  run(ADMIN_URL, ['-c', `create database "${DB_EVIDENCE}"`])
  evidenceDsn = dsnFor(DB_EVIDENCE)
  run(evidenceDsn, ['-c', FIXTURE + EVIDENCE_SEED])
  for (const file of [...S0, BINDINGS, EVENTS_V2, HEALTH, TOKENS]) applyFile(evidenceDsn, file)

  // A fresh deploy: projects exist, nothing else does.
  run(ADMIN_URL, ['-c', `create database "${DB_FRESH}"`])
  freshDsn = dsnFor(DB_FRESH)
  run(freshDsn, ['-c', FIXTURE])
  for (const file of [...S0, BINDINGS, EVENTS_V2, HEALTH, TOKENS, EVIDENCE]) applyFile(freshDsn, file)
}, 180_000)

afterAll(() => {
  if (!AVAILABLE) return
  for (const db of [DB_MAIN, DB_EVIDENCE, DB_FRESH]) {
    try { run(ADMIN_URL, ['-c', `drop database if exists "${db}" with (force)`]) } catch { /* best effort */ }
  }
  try { run(ADMIN_URL, ['-c', `drop role if exists "${SVC}"`]) } catch { /* best effort */ }
})

// ─────────────────────────────────────────────────────────────────────────────

d('project-scoped credentials in Postgres · The Prompt bound from its evidence (1A)', () => {
  it('exactly The Prompt’s three verified accounts are bound — as runtime evidence, by the migration, active and unblocked', () => {
    expect(one(dsn, `select string_agg(concat_ws('|', project_id, platform, external_account_id, coalesce(account_label, '-'), credential_source,
        verification, bound_by, (superseded_at is null)::text, (blocked_at is null)::text), E'\\n' order by platform)
      from public.social_account_bindings`)).toBe([
      `${PROMPT}|facebook|${PAGE_PROMPT}|-|project_store|runtime_evidence|${MIGRATION_ACTOR}|true|true`,
      `${PROMPT}|instagram|${IG_PROMPT}|theprompt.news|project_store|runtime_evidence|${MIGRATION_ACTOR}|true|true`,
      `${PROMPT}|youtube|${CHANNEL_PROMPT}|-|platform_env_transitional|runtime_evidence|${MIGRATION_ACTOR}|true|true`,
    ].join('\n'))
  })

  it('each binding is verified as of the evidence it was bound from', () => {
    expect(one(dsn, `select bool_and(b.verified_at = (select max(s.captured_at) from public.account_snapshots s
        where s.project_id = b.project_id and s.platform = b.platform)) from public.social_account_bindings b`)).toBe('t')
  })

  it('no other project was bound, and no stored credential changed', () => {
    expect(one(dsn, `select count(*) from public.social_account_bindings where project_id <> '${PROMPT}'`)).toBe('0')
    expect(one(dsn, `select string_agg(concat_ws('|', platform, token_type,
        (case platform when 'instagram' then access_token = '${IG_TOKEN}' else access_token = '${FB_TOKEN}' end)::text,
        coalesce(account_id, '-'), to_char(refreshed_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS')), ',' order by platform)
      from public.platform_tokens`))
      .toBe(`facebook|page|true|${PAGE_PROMPT}|2026-06-05 08:51:09,instagram|user|true|-|2026-09-14 06:00:06`)
  })

  it('a second run refuses rather than binding twice', () => {
    expect(refused(txn(dsn, null, EVIDENCE_SQL))).toMatch(/already has bindings/)
  })
})

d('project-scoped credentials in Postgres · the evidence binds nothing it cannot prove', () => {
  const bindWith = (mutation: string) => txn(evidenceDsn, null, `${mutation} ${EVIDENCE_SQL}
    select count(*) from public.social_account_bindings;`)

  it('with the evidence intact it binds three, and reads platform_tokens without writing it', () => {
    expect(accepted(txn(evidenceDsn, null, `create temp table tokens_before as select * from public.platform_tokens;
      ${EVIDENCE_SQL}
      select (select count(*) from public.social_account_bindings) || '|' ||
             (select count(*) from (select * from public.platform_tokens except select * from tokens_before) changed);`))).toBe('3|0')
  })

  it('Instagram drift — another account, another username, an errored or stale snapshot — binds nothing', () => {
    for (const mutation of [
      `update public.account_snapshots set raw = jsonb_set(raw, '{user_id}', '"${IG_OTHER}"') where platform = 'instagram' and snapshot_date = '2026-09-14';`,
      `update public.account_snapshots set raw = jsonb_set(raw, '{username}', '"imposter.account"') where platform = 'instagram' and snapshot_date = '2026-09-14';`,
      `insert into public.account_snapshots (project_id, platform, snapshot_date, captured_at, raw) values ('${PROMPT}', 'instagram', '2026-09-15', '2026-09-15 07:00:00+00', '{"error": {"code": 190}}');`,
      `update public.platform_tokens set refreshed_at = '2026-09-14 08:00:00+00' where platform = 'instagram';`,
      `delete from public.account_snapshots where platform = 'instagram';`,
    ]) {
      expect(refused(bindWith(mutation)), mutation).toMatch(/social account evidence drift: instagram/)
    }
  })

  it('Facebook drift — another stored page, another snapshot page, no publication with the stored credential — binds nothing', () => {
    expect(refused(bindWith(`update public.platform_tokens set account_id = '2000000000000002' where platform = 'facebook';`)))
      .toMatch(/drift: facebook stored account/)
    expect(refused(bindWith(`update public.account_snapshots set raw = '{"id": "2000000000000002"}' where platform = 'facebook';`)))
      .toMatch(/drift: facebook snapshot/)
    expect(refused(bindWith(`update public.media_scripts set published_at = '2026-01-01 00:00:00+00';`)))
      .toMatch(/no facebook publication with the stored credential/)
  })

  it('YouTube drift — another channel, or no upload for the project — binds nothing', () => {
    expect(refused(bindWith(`update public.account_snapshots set raw = '{"items": [{"id": "UCsomeoneElse0000000000"}]}' where platform = 'youtube';`)))
      .toMatch(/drift: youtube/)
    expect(refused(bindWith(`update public.media_scripts set youtube_video_id = null;`))).toMatch(/no youtube upload for the project/)
  })

  it('half the stored credentials is refused, not half-bound', () => {
    expect(refused(bindWith(`delete from public.platform_tokens where platform = 'facebook';`))).toMatch(/must hold both/)
  })

  it('without The Prompt, or without its stored credentials, there is nothing to bind — and nothing is bound', () => {
    expect(accepted(bindWith(`update public.projects set slug = 'renamed' where id = '${PROMPT}';`))).toBe('0')
    expect(accepted(bindWith(`delete from public.platform_tokens;`))).toBe('0')
  })

  it('a fresh database takes the whole chain and binds nothing', () => {
    expect(one(freshDsn, `select count(*) from public.social_account_bindings`)).toBe('0')
    expect(one(freshDsn, `select to_regclass('public.social_credential_health') is not null`)).toBe('t')
  })
})

d('project-scoped credentials in Postgres · one account, one project (O1)', () => {
  it('an account bound to one project cannot be bound to another', () => {
    expect(refused(txn(dsn, SVC, newBinding({ project: FAMILY, platform: 'instagram', account: IG_PROMPT }))))
      .toMatch(/social_account_bindings_account_single_project/)
    expect(refused(txn(dsn, SVC, newBinding({ project: GAIN, platform: 'facebook', account: PAGE_PROMPT }))))
      .toMatch(/social_account_bindings_account_single_project/)
  })

  it('a project holds one active account per platform', () => {
    expect(refused(txn(dsn, SVC, newBinding({ project: PROMPT, platform: 'instagram', account: IG_OTHER }))))
      .toMatch(/social_account_bindings_one_active_per_project_platform/)
  })

  it('another project binds its own account freely — the relation is per project, not a platform lock', () => {
    expect(accepted(txn(dsn, SVC, `${newBinding({ project: FAMILY, platform: 'instagram', account: IG_OTHER, label: 'familjestunden' })}
      select count(*) from public.social_account_bindings where project_id = '${FAMILY}';`))).toBe('1')
  })

  it('Y1: the platform’s YouTube credential serves one binding — another project cannot attach to it', () => {
    expect(refused(txn(dsn, SVC, newBinding({ project: FAMILY, platform: 'youtube', account: 'UCfamily000000000000000' }))))
      .toMatch(/social_account_bindings_one_platform_env_credential/)
  })

  it('Instagram and Facebook live in the project’s own store; YouTube is transitional only', () => {
    expect(refused(txn(dsn, SVC, newBinding({ project: FAMILY, platform: 'facebook', account: '2000000000000002', source: 'platform_env_transitional' }))))
      .toMatch(/credential_source_matches_platform/)
    expect(refused(txn(dsn, SVC, newBinding({ project: FAMILY, platform: 'youtube', account: 'UCfamily000000000000000', source: 'project_store' }))))
      .toMatch(/credential_source_matches_platform/)
  })

  it('shapes: a bounded account id, a clean bounded label, a real actor, closed vocabularies', () => {
    const cases: [string, RegExp][] = [
      [newBinding({ project: FAMILY, platform: 'instagram', account: 'has space' }), /external_account_id_shape/],
      [newBinding({ project: FAMILY, platform: 'instagram', account: IG_OTHER, label: 'x'.repeat(201) }), /account_label_shape/],
      [newBinding({ project: FAMILY, platform: 'instagram', account: IG_OTHER, boundBy: 'operator@omnira.test' }), /bound_by_shape/],
      [newBinding({ project: FAMILY, platform: 'instagram', account: IG_OTHER, verification: 'guessed' }), /verification_valid/],
      [newBinding({ project: FAMILY, platform: 'tiktok', account: IG_OTHER, source: 'project_store' }), /platform_valid|credential_source_matches_platform/],
    ]
    for (const [sql, pattern] of cases) expect(refused(txn(dsn, SVC, sql)), sql).toMatch(pattern)
    expect(refused(txn(dsn, SVC, `insert into public.social_account_bindings
        (project_id, platform, external_account_id, account_label, credential_source, verification, verified_at, bound_by)
      values ('${FAMILY}', 'instagram', '${IG_OTHER}', E'line\\nbreak', 'project_store', 'provider_attested', now(), '${ACTOR}');`)))
      .toMatch(/account_label_shape/)
  })

  it('a binding is born active and unblocked, on the database’s clock', () => {
    expect(refused(txn(dsn, SVC, newBinding({ project: FAMILY, platform: 'instagram', account: IG_OTHER, extra: { superseded_at: 'now()' } }))))
      .toMatch(/inserted active and unblocked/)
    expect(refused(txn(dsn, SVC, newBinding({ project: FAMILY, platform: 'instagram', account: IG_OTHER,
      extra: { blocked_at: 'now()', blocked_reason: `'account_mismatch'` } })))).toMatch(/inserted active and unblocked/)
    expect(accepted(txn(dsn, SVC, `${newBinding({ project: FAMILY, platform: 'instagram', account: IG_OTHER, extra: { bound_at: `'1999-01-01T00:00:00Z'` } })}
      select (bound_at = now())::text from public.social_account_bindings where project_id = '${FAMILY}';`))).toBe('true')
  })
})

d('project-scoped credentials in Postgres · identity immutable, verification one-way, nothing deleted', () => {
  it('the identity of a binding never changes — not even for the superuser', () => {
    const id = bindingId('instagram')
    for (const change of [
      `project_id = '${FAMILY}'`, `platform = 'facebook'`, `external_account_id = '${IG_OTHER}'`,
      `credential_source = 'platform_env_transitional'`, `bound_by = '${ACTOR}'`, `bound_at = now() - interval '1 day'`,
    ]) {
      expect(refused(txn(dsn, null, `update public.social_account_bindings set ${change} where binding_id = '${id}';`)), change)
        .toMatch(/is immutable/)
    }
  })

  it('verification upgrades to a provider attestation with the name the platform gave — and never goes back', () => {
    const id = bindingId('facebook')
    expect(accepted(txn(dsn, SVC, `update public.social_account_bindings
        set verification = 'provider_attested', account_label = 'The Prompt', verified_at = now() where binding_id = '${id}';
      select verification || '|' || account_label from public.social_account_bindings where binding_id = '${id}';`)))
      .toBe('provider_attested|The Prompt')
    expect(refused(txn(dsn, SVC, `update public.social_account_bindings set verification = 'provider_attested', verified_at = now() where binding_id = '${id}';
      update public.social_account_bindings set verification = 'runtime_evidence' where binding_id = '${id}';`))).toMatch(/cannot be downgraded/)
    expect(refused(txn(dsn, SVC, `update public.social_account_bindings set verified_at = '2020-01-01T00:00:00Z' where binding_id = '${id}';`)))
      .toMatch(/cannot move backwards/)
  })

  it('a block is complete and permanent', () => {
    const id = bindingId('youtube')
    expect(refused(txn(dsn, SVC, `update public.social_account_bindings set blocked_at = now() where binding_id = '${id}';`)))
      .toMatch(/block_is_complete/)
    expect(refused(txn(dsn, SVC, `update public.social_account_bindings set blocked_at = now(), blocked_reason = 'account_mismatch' where binding_id = '${id}';
      update public.social_account_bindings set blocked_at = null, blocked_reason = null where binding_id = '${id}';`))).toMatch(/cannot be lifted/)
  })

  it('a superseded binding is frozen', () => {
    const id = bindingId('instagram')
    expect(refused(txn(dsn, null, `update public.social_account_bindings set superseded_at = now() where binding_id = '${id}';
      update public.social_account_bindings set account_label = 'renamed' where binding_id = '${id}';`))).toMatch(/is superseded and cannot change/)
  })

  it('rows are never deleted or truncated, and a bound project cannot be deleted away', () => {
    expect(refused(txn(dsn, null, `delete from public.social_account_bindings where project_id = '${PROMPT}';`))).toMatch(/never deleted \(attempted DELETE\)/)
    expect(refused(txn(dsn, null, `truncate public.social_account_bindings cascade;`))).toMatch(/never deleted \(attempted TRUNCATE\)/)
    expect(refused(txn(dsn, null, `delete from public.projects where id = '${PROMPT}';`))).toMatch(/violates foreign key constraint/)
  })
})

d('project-scoped credentials in Postgres · social_account_rebind — an explicit account change in one transaction', () => {
  const rebind = (platform: string, expected: string, account: string, boundBy = ACTOR) =>
    `select public.social_account_rebind('${PROMPT}', '${platform}', '${expected}', '${account}', 'someone.else', '${boundBy}');`

  it('supersedes the expected binding and binds the new, provider-attested account', () => {
    const out = accepted(txn(dsn, SVC, `${rebind('instagram', bindingId('instagram'), IG_OTHER)}
      select (select string_agg(concat_ws('|', external_account_id, verification, credential_source, bound_by), ',')
                from public.social_account_bindings where project_id = '${PROMPT}' and platform = 'instagram' and superseded_at is null)
          || '#' || (select count(*) from public.social_account_bindings where project_id = '${PROMPT}' and platform = 'instagram' and superseded_at is not null);`))
    expect(out.split('\n').pop()).toBe(`${IG_OTHER}|provider_attested|project_store|${ACTOR}#1`)
  })

  it('a stale expectation is refused, and the current binding stays active', () => {
    expect(accepted(txn(dsn, SVC, `do $t$ begin
        perform public.social_account_rebind('${PROMPT}', 'instagram', '00000000-0000-4000-8000-000000000000', '${IG_OTHER}', null, '${ACTOR}');
        raise exception 'the stale rebind was accepted';
      exception when no_data_found then null;
      end $t$;
      select external_account_id from public.social_account_bindings where project_id = '${PROMPT}' and platform = 'instagram' and superseded_at is null;`)))
      .toBe(IG_PROMPT)
  })

  it('an account that belongs to another project is refused, and the supersession rolls back with it', () => {
    expect(accepted(txn(dsn, SVC, `${newBinding({ project: FAMILY, platform: 'instagram', account: IG_OTHER })}
      do $t$ begin
        perform public.social_account_rebind('${PROMPT}', 'instagram', '${bindingId('instagram')}', '${IG_OTHER}', null, '${ACTOR}');
        raise exception 'the rebind onto another project''s account was accepted';
      exception when unique_violation then null;
      end $t$;
      select string_agg(project_id || ':' || external_account_id, ',' order by project_id) from public.social_account_bindings
       where platform = 'instagram' and superseded_at is null;`)))
      .toBe(`${PROMPT}:${IG_PROMPT},${FAMILY}:${IG_OTHER}`)
  })

  it('YouTube cannot be rebound through it during Y1, and the actor must be the server-authenticated operator', () => {
    expect(refused(txn(dsn, SVC, rebind('youtube', bindingId('youtube'), 'UCsomeoneElse0000000000')))).toMatch(/credential_source_matches_platform/)
    expect(refused(txn(dsn, SVC, rebind('instagram', bindingId('instagram'), IG_OTHER, 'operator@omnira.test')))).toMatch(/bound_by_shape/)
  })
})

d('project-scoped credentials in Postgres · platform_credential_events v2', () => {
  it('attempted, then replaced naming the attested account and how it was bound', () => {
    const op = newOp()
    expect(accepted(txn(dsn, SVC, `${event({ op, outcome: 'attempted' })}
      ${event({ op, outcome: 'replaced', detail: '{"exchanged": true, "page_resolved": true, "read_insights_ok": true}', account: PAGE_PROMPT, action: 'matched' })}
      select string_agg(outcome || ':' || coalesce(external_account_id, '-') || ':' || coalesce(binding_action, '-'), ',' order by outcome)
        from public.platform_credential_events where operation_id = '${op}';`))).toBe(`attempted:-:-,replaced:${PAGE_PROMPT}:matched`)
  })

  it('a writer built before v2 cannot even record an attempt — so it can never replace a credential', () => {
    expect(refused(txn(dsn, SVC, event({ op: newOp(), outcome: 'attempted', version: null })))).toMatch(/null value in column "event_version"/)
    expect(refused(txn(dsn, SVC, event({ op: newOp(), outcome: 'attempted', version: 1 })))).toMatch(/event_version_valid/)
  })

  it('attempted knows no account; replaced always names one and its binding action; failed never claims a binding', () => {
    const afterAttempt = (terminal: Parameters<typeof event>[0]) => {
      const op = newOp()
      return txn(dsn, SVC, `${event({ op, outcome: 'attempted', platform: terminal.platform })} ${event({ ...terminal, op })}`)
    }
    expect(refused(txn(dsn, SVC, event({ op: newOp(), outcome: 'attempted', account: PAGE_PROMPT })))).toMatch(/account_matches_outcome/)
    expect(refused(afterAttempt({ op: '', outcome: 'replaced' }))).toMatch(/account_matches_outcome/)
    expect(refused(afterAttempt({ op: '', outcome: 'replaced', account: PAGE_PROMPT }))).toMatch(/account_matches_outcome/)
    expect(refused(afterAttempt({ op: '', outcome: 'replaced', action: 'matched' }))).toMatch(/account_matches_outcome/)
    expect(refused(afterAttempt({ op: '', outcome: 'failed', detail: '{"failure_stage": "account_mismatch"}', account: IG_OTHER, action: 'matched', platform: 'instagram' })))
      .toMatch(/account_matches_outcome/)
    expect(accepted(afterAttempt({ op: '', outcome: 'failed', detail: '{"failure_stage": "account_mismatch"}', account: IG_OTHER, platform: 'instagram' }))).toBe('')
  })

  it('the account failure stages are accepted; anything else — or a token posing as one — is refused', () => {
    for (const stage of ['provider_verification', 'account_mismatch', 'account_bound_to_other_project', 'binding']) {
      const op = newOp()
      expect(accepted(txn(dsn, SVC, `${event({ op, outcome: 'attempted' })} ${event({ op, outcome: 'failed', detail: `{"failure_stage": "${stage}"}` })}`)), stage).toBe('')
    }
    for (const stage of ['account_guess', FB_TOKEN]) {
      const op = newOp()
      expect(refused(txn(dsn, SVC, `${event({ op, outcome: 'attempted' })} ${event({ op, outcome: 'failed', detail: `{"failure_stage": "${stage}"}` })}`)))
        .toMatch(/detail_types/)
    }
  })

  it('the account is a bounded identifier and the binding action a closed set', () => {
    const op = newOp()
    expect(refused(txn(dsn, SVC, `${event({ op, outcome: 'attempted' })} ${event({ op, outcome: 'replaced', account: `${FB_TOKEN} x`, action: 'matched' })}`)))
      .toMatch(/external_account_id_shape/)
    const op2 = newOp()
    expect(refused(txn(dsn, SVC, `${event({ op: op2, outcome: 'attempted' })} ${event({ op: op2, outcome: 'replaced', account: PAGE_PROMPT, action: 'moved' })}`)))
      .toMatch(/binding_action_valid/)
  })

  it('S0 still holds: append-only for everyone, nothing for client roles', () => {
    const op = newOp()
    expect(refused(txn(dsn, null, `${event({ op, outcome: 'attempted' })} update public.platform_credential_events set binding_action = null where operation_id = '${op}';`)))
      .toMatch(/append-only \(attempted UPDATE\)/)
    expect(refused(txn(dsn, 'anon', 'select count(*) from public.platform_credential_events;'))).toMatch(/permission denied/)
  })
})

d('project-scoped credentials in Postgres · social_credential_health', () => {
  const health = (over: Record<string, string> = {}) => {
    const row: Record<string, string> = {
      project_id: `'${PROMPT}'`, platform: `'instagram'`, binding_id: `'${bindingId('instagram')}'`, status: `'ok'`,
      identity_verified: 'true', verified_account_id: `'${IG_PROMPT}'`, checked_at: 'now()', ...over,
    }
    return `insert into public.social_credential_health (${Object.keys(row).join(', ')}) values (${Object.values(row).join(', ')})`
  }

  it('one row per project and platform, pointing at the binding it verified — upserted daily', () => {
    expect(accepted(txn(dsn, SVC, `${health()};
      ${health({ status: `'warning'`, days_left: '6', last_warned_threshold: '7' })} on conflict (project_id, platform) do update
        set status = excluded.status, days_left = excluded.days_left, last_warned_threshold = excluded.last_warned_threshold;
      select status || '|' || days_left || '|' || last_warned_threshold from public.social_credential_health;`))).toBe('warning|6|7')
    expect(refused(txn(dsn, SVC, `${health()}; ${health()};`))).toMatch(/social_credential_health_pkey/)
  })

  it('closed codes and bounded ids only — and a verified identity names its account', () => {
    const cases: [Record<string, string>, RegExp][] = [
      [{ status: `'fine-probably'` }, /status_valid/],
      [{ verified_account_id: `'has space'` }, /verified_account_id_shape/],
      [{ identity_verified: 'true', verified_account_id: 'null' }, /identity_needs_account/],
      [{ last_warned_threshold: '5' }, /warned_threshold_valid/],
      [{ platform: `'tiktok'` }, /platform_valid/],
      [{ binding_id: `'00000000-0000-4000-8000-000000000000'` }, /violates foreign key constraint/],
    ]
    for (const [over, pattern] of cases) expect(refused(txn(dsn, SVC, `${health(over)};`)), JSON.stringify(over)).toMatch(pattern)
  })

  it('no column can hold provider text or a credential', () => {
    expect(one(dsn, `select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
      where table_schema = 'public' and table_name = 'social_credential_health'`))
      .toBe('project_id,platform,binding_id,status,identity_verified,verified_account_id,checked_at,expires_at,days_left,last_refreshed_at,last_warned_threshold')
  })
})

d('project-scoped credentials in Postgres · platform_tokens holds only a project’s own credential', () => {
  const token = (over: Record<string, string>) => {
    const row: Record<string, string> = {
      project_id: `'${FAMILY}'`, platform: `'instagram'`, token_type: `'user'`, access_token: `'${IG_TOKEN}'`, account_id: `'${IG_OTHER}'`, ...over,
    }
    return `insert into public.platform_tokens (${Object.keys(row).join(', ')}) values (${Object.values(row).join(', ')});`
  }

  it('a credential without a project — a global credential — cannot be stored', () => {
    expect(refused(txn(dsn, SVC, token({ project_id: 'null' })))).toMatch(/null value in column "project_id"/)
  })

  it('platform and credential type are pinned, and the account id is bounded', () => {
    expect(refused(txn(dsn, SVC, token({ platform: `'youtube'` })))).toMatch(/platform_tokens_platform_valid|token_type_matches_platform/)
    expect(refused(txn(dsn, SVC, token({ token_type: `'page'` })))).toMatch(/token_type_matches_platform/)
    expect(refused(txn(dsn, SVC, token({ account_id: `'not an id'` })))).toMatch(/platform_tokens_account_id_shape/)
    expect(accepted(txn(dsn, SVC, `${token({})} select count(*) from public.platform_tokens where project_id = '${FAMILY}';`))).toBe('1')
  })

  it('the rows production holds satisfy every new constraint — both The Prompt’s, untouched', () => {
    expect(one(dsn, `select count(*) || '|' || bool_and(project_id = '${PROMPT}') from public.platform_tokens`)).toBe('2|true')
  })
})

d('project-scoped credentials in Postgres · server-only', () => {
  const tablePriv = (role: string, table: string, p: string) => one(dsn, `select has_table_privilege('${role}', 'public.${table}', '${p}')`)
  const REBIND = 'public.social_account_rebind(uuid, text, uuid, text, text, text)'

  it('the fixture really handed new tables and functions to the client roles — so the revokes are what took them away', () => {
    expect(tablePriv('anon', 'projects', 'SELECT')).toBe('t')
    expect(one(dsn, `select has_function_privilege('anon', 'public.fixture_default_acl()', 'EXECUTE')`)).toBe('t')
  })

  it('RLS is on and no policy exists on the bindings or the health table', () => {
    for (const table of ['social_account_bindings', 'social_credential_health']) {
      expect(one(dsn, `select relrowsecurity from pg_class where oid = 'public.${table}'::regclass`), table).toBe('t')
      expect(one(dsn, `select count(*) from pg_policies where schemaname = 'public' and tablename = '${table}'`), table).toBe('0')
    }
  })

  it('anon and authenticated hold no privilege on either table and cannot execute the rebind', () => {
    for (const table of ['social_account_bindings', 'social_credential_health']) {
      for (const role of ['anon', 'authenticated']) {
        for (const p of PRIVILEGES) expect(tablePriv(role, table, p), `${role} ${table} ${p}`).toBe('f')
        expect(one(dsn, `select has_function_privilege('${role}', '${REBIND}', 'EXECUTE')`), role).toBe('f')
      }
    }
    expect(one(dsn, `select coalesce(array_to_string(proacl, ','), '') from pg_proc where proname = 'social_account_rebind'`)).not.toMatch(/(^|,)=X/)
  })

  it('the service role holds SELECT, INSERT and UPDATE — never DELETE or TRUNCATE — and may execute the rebind', () => {
    for (const table of ['social_account_bindings', 'social_credential_health']) {
      expect(PRIVILEGES.filter((p) => tablePriv('service_role', table, p) === 't'), table).toEqual(['SELECT', 'INSERT', 'UPDATE'])
    }
    expect(one(dsn, `select has_function_privilege('service_role', '${REBIND}', 'EXECUTE')`)).toBe('t')
  })

  it('a client role is refused at the privilege layer', () => {
    expect(refused(txn(dsn, 'anon', 'select count(*) from public.social_account_bindings;'))).toMatch(/permission denied/)
    expect(refused(txn(dsn, 'authenticated', `select public.social_account_rebind('${PROMPT}', 'instagram', '${bindingId('instagram')}', '${IG_OTHER}', null, '${ACTOR}');`)))
      .toMatch(/permission denied/)
  })

  it('the bindings table carries exactly its four triggers, and every new function runs on a pinned, empty search_path', () => {
    expect(one(dsn, `select string_agg(tgname, ',' order by tgname) from pg_trigger
      where tgrelid = 'public.social_account_bindings'::regclass and not tgisinternal`))
      .toBe('social_account_bindings_guard_insert,social_account_bindings_guard_update,social_account_bindings_no_delete,social_account_bindings_no_truncate')
    expect(one(dsn, `select string_agg(p.proname || '=' || coalesce(array_to_string(p.proconfig, ','), '-'), ' ' order by p.proname)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and (p.proname like 'social_account_%')`))
      .toBe('social_account_bindings_guard_insert=search_path="" social_account_bindings_guard_update=search_path="" social_account_bindings_no_delete=search_path="" social_account_rebind=search_path=""')
  })
})
