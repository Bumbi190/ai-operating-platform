/**
 * lib/qa/media-asset-foundation-sql.test.ts — the Phase 1 migration, APPLIED.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Everything else about Phase 1 is proven against mocks. That is right for the
 * admission logic and useless for the SQL: a migration that has never been run
 * is a file, not a schema. The G2 lesson recorded in
 * `workflow-transition-stop-guard-sql.test.ts` is exactly this — "G2 shipped a
 * migration that passed every test and then failed in production, because the
 * harness had built a greenfield database."
 *
 * So this suite APPLIES `20260902_media_asset_foundation.sql` to a throwaway
 * local database and asserts the properties the TypeScript layer assumes but
 * cannot see: that the CHECK constraints exist and reject, that the private
 * bucket is created non-public, that provenance really is append-only, and that
 * `assets` really is not.
 *
 * ── SAFETY ─────────────────────────────────────────────────────────────────
 * LOCAL ONLY. Creates its own database, named per-process, and drops it in
 * `afterAll`. It never reaches Supabase, never reads a project credential, and
 * mutates no pre-existing database — the DSN defaults to a local postgres and
 * the suite SKIPS entirely when none is reachable, so a normal `vitest run`
 * on a machine without postgres is unaffected.
 *
 * Same construction and same helpers as the existing SQL suite; nothing new was
 * invented for the harness.
 *
 * ── WHAT THE FIXTURE SUPPLIES, AND WHY ─────────────────────────────────────
 * Only what the migration DEPENDS on and does not create: `public.projects`,
 * `public.website_content`, the three Supabase roles, `auth.uid()`, and the
 * `storage.buckets` table. Everything the migration is responsible for —
 * assets, provenance, triggers, policies, the bucket ROW — comes from the real
 * file. If the fixture ever created one of those, this suite would be proving
 * itself rather than the migration.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

function findPsql(): string | null {
  const candidates = [
    process.env.ATLAS_SQL_TEST_PSQL, 'psql',
    '/opt/homebrew/opt/libpq/bin/psql', '/usr/local/opt/libpq/bin/psql', '/usr/bin/psql',
  ].filter(Boolean) as string[]
  for (const c of candidates) {
    try { execFileSync(c, ['--version'], { stdio: 'pipe' }); return c } catch { /* next */ }
  }
  return null
}

const PSQL = findPsql()
const ADMIN_URL = process.env.ATLAS_SQL_TEST_URL
  ?? `postgres://${process.env.USER ?? 'postgres'}@127.0.0.1:5432/postgres`
const dsnFor = (db: string) => { const u = new URL(ADMIN_URL); u.pathname = `/${db}`; return u.toString() }

function run(dsn: string, args: string[]): string {
  return execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', dsn, ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
}
function query(dsn: string, sql: string): string[][] {
  const out = execFileSync(PSQL!,
    ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-F', '|', '-d', dsn, '-c', sql],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
  return out.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split('|'))
}
const one = (dsn: string, sql: string) => { const r = query(dsn, sql); return r.length ? r[0].join('|') : '' }

/** Runs SQL expected to FAIL; returns stderr so the reason can be asserted. */
function expectFailure(dsn: string, sql: string): string {
  try {
    execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', dsn, '-c', sql],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
    return ''
  } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? '') }
}

const AVAILABLE = (() => {
  if (!PSQL) return false
  try {
    execFileSync(PSQL, ['-X', '-t', '-A', '-d', ADMIN_URL, '-c', 'select 1'], { stdio: 'pipe', timeout: 10_000 })
    return true
  } catch { return false }
})()

const DB_NAME = `omnira_media_asset_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

const MIGRATION = join(process.cwd(), 'supabase/migrations/20260902_media_asset_foundation.sql')

const PROJ  = '11111111-1111-1111-1111-111111111111'
const PROJ2 = '22222222-2222-2222-2222-222222222222'
const ART   = '33333333-3333-3333-3333-333333333333'

/** Only the migration's dependencies. Nothing the migration itself creates. */
const FIXTURE = `
create extension if not exists pgcrypto;

do $do$ begin
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $do$;

-- Supabase supplies these two in a real project; the migration only USES them.
create schema if not exists auth;
create schema if not exists storage;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now());

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text,
  owner_id uuid);

create table public.website_content (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id),
  hero_image_url text,
  hero_image_status text);

insert into public.projects (id, slug, name) values
  ('${PROJ}', 'proj-a', 'A'),
  ('${PROJ2}', 'proj-b', 'B');
insert into public.website_content (id, project_id) values ('${ART}', '${PROJ}');
`

const d = AVAILABLE ? describe : describe.skip

if (!AVAILABLE) {
  console.warn(
    '[media-asset-foundation-sql] SKIPPED — no reachable local Postgres. The Phase 1 migration '
    + 'was NOT proven to apply in this run. Set ATLAS_SQL_TEST_URL to enable it.',
  )
}

beforeAll(() => {
  if (!AVAILABLE) return
  run(ADMIN_URL, ['-c', `create database "${DB_NAME}"`])
  dsn = dsnFor(DB_NAME)
  run(dsn, ['-c', FIXTURE])
  // THE REAL MIGRATION FILE. If this throws, the suite fails here — which is
  // the single most valuable assertion in it.
  run(dsn, ['-f', MIGRATION])
})

afterAll(() => {
  if (!AVAILABLE || !dsn) return
  try { run(ADMIN_URL, ['-c', `drop database if exists "${DB_NAME}" with (force)`]) } catch { /* best effort */ }
})

/** Insert an asset, returning its id. */
function insertAsset(over: Partial<Record<string, string>> = {}): string {
  const f = {
    project_id: `'${PROJ}'`,
    kind: `'image'`,
    mime_type: `'image/png'`,
    byte_size: '1024',
    checksum_sha256: `'${'a'.repeat(64)}'`,
    visibility: `'internal'`,
    storage_bucket: `'media-assets-private'`,
    storage_path: `'images/x/${Math.random().toString(36).slice(2)}.png'`,
    ...over,
  }
  return one(dsn, `insert into public.assets
    (project_id, kind, mime_type, byte_size, checksum_sha256, visibility, storage_bucket, storage_path)
    values (${f.project_id}, ${f.kind}, ${f.mime_type}, ${f.byte_size}, ${f.checksum_sha256},
            ${f.visibility}, ${f.storage_bucket}, ${f.storage_path})
    returning id`)
}

d('the Phase 1 migration applies to a real database', () => {
  it('creates both tables', () => {
    expect(one(dsn, `select to_regclass('public.assets')`)).toBe('assets')
    expect(one(dsn, `select to_regclass('public.asset_provenance')`)).toBe('asset_provenance')
  })

  it('creates the private bucket as NON-PUBLIC', () => {
    // The load-bearing row of the hardening amendment. If `public` were true
    // here, every draft would be world-readable at a guessable URL and the
    // visibility column would be decoration.
    const row = query(dsn, `select id, public from storage.buckets where id='media-assets-private'`)
    expect(row).toHaveLength(1)
    expect(row[0][0]).toBe('media-assets-private')
    expect(row[0][1]).toBe('f')
  })

  it('does not touch any other bucket', () => {
    // The fixture created no other bucket, so the migration must have created
    // exactly one. A migration that also flipped `media-assets` would show here.
    expect(one(dsn, `select count(*) from storage.buckets`)).toBe('1')
  })

  it('adds hero_asset_id to website_content, nullable, with ON DELETE SET NULL', () => {
    expect(one(dsn, `select is_nullable from information_schema.columns
                     where table_name='website_content' and column_name='hero_asset_id'`)).toBe('YES')
    // Addressed by the exact constraint, not by table: website_content also has
    // a project_id FK, and matching on table alone returned that one instead.
    expect(one(dsn, `select confdeltype from pg_constraint
                     where conrelid='public.website_content'::regclass
                       and conkey = array[(select attnum from pg_attribute
                                           where attrelid='public.website_content'::regclass
                                             and attname='hero_asset_id')]`)).toBe('n')
  })

  it('is idempotent — applying it twice is not an error', () => {
    // Every statement is `if not exists` / `on conflict do nothing` /
    // `create or replace` / `drop trigger if exists`. Re-running a migration is
    // a normal recovery action and must not fail.
    expect(() => run(dsn, ['-f', MIGRATION])).not.toThrow()
    expect(one(dsn, `select count(*) from storage.buckets where id='media-assets-private'`)).toBe('1')
  })
})

d('the constraints the TypeScript layer assumes really exist', () => {
  it('defaults visibility to internal — the fail-closed half', () => {
    const id = one(dsn, `insert into public.assets
      (project_id, kind, mime_type, byte_size, checksum_sha256, storage_bucket, storage_path)
      values ('${PROJ}','image','image/png',1,'${'b'.repeat(64)}','media-assets-private','p/default.png')
      returning id`)
    expect(one(dsn, `select visibility from public.assets where id='${id}'`)).toBe('internal')
  })

  it('rejects an unknown visibility, kind and status', () => {
    expect(expectFailure(dsn, `insert into public.assets
      (project_id,kind,mime_type,byte_size,checksum_sha256,visibility,storage_bucket,storage_path)
      values ('${PROJ}','image','image/png',1,'${'c'.repeat(64)}','secret','media-assets-private','p/1.png')`))
      .toMatch(/violates check constraint/)

    expect(expectFailure(dsn, `insert into public.assets
      (project_id,kind,mime_type,byte_size,checksum_sha256,storage_bucket,storage_path)
      values ('${PROJ}','hologram','image/png',1,'${'d'.repeat(64)}','media-assets-private','p/2.png')`))
      .toMatch(/violates check constraint/)
  })

  it('rejects a malformed checksum and a non-positive size', () => {
    expect(expectFailure(dsn, `insert into public.assets
      (project_id,kind,mime_type,byte_size,checksum_sha256,storage_bucket,storage_path)
      values ('${PROJ}','image','image/png',1,'not-a-sha','media-assets-private','p/3.png')`))
      .toMatch(/violates check constraint/)

    expect(expectFailure(dsn, `insert into public.assets
      (project_id,kind,mime_type,byte_size,checksum_sha256,storage_bucket,storage_path)
      values ('${PROJ}','image','image/png',0,'${'e'.repeat(64)}','media-assets-private','p/4.png')`))
      .toMatch(/violates check constraint/)
  })

  it('refuses two assets at the same storage object', () => {
    insertAsset({ storage_path: `'p/collide.png'` })
    expect(expectFailure(dsn, `insert into public.assets
      (project_id,kind,mime_type,byte_size,checksum_sha256,storage_bucket,storage_path)
      values ('${PROJ}','image','image/png',1,'${'f'.repeat(64)}','media-assets-private','p/collide.png')`))
      .toMatch(/duplicate key value|unique constraint/)
  })

  it('requires a project — there is no unowned asset', () => {
    expect(expectFailure(dsn, `insert into public.assets
      (kind,mime_type,byte_size,checksum_sha256,storage_bucket,storage_path)
      values ('image','image/png',1,'${'1'.repeat(64)}','media-assets-private','p/5.png')`))
      .toMatch(/null value in column "project_id"|violates not-null/)
  })
})

d('provenance is append-only, and assets deliberately are not', () => {
  it('accepts a provenance row with every provider field absent', () => {
    // The uploaded-reference case: no provider, model, seed or brief.
    const id = insertAsset()
    run(dsn, ['-c', `insert into public.asset_provenance (asset_id, source) values ('${id}','uploaded')`])
    expect(one(dsn, `select provider is null and model is null and seed is null
                     from public.asset_provenance where asset_id='${id}'`)).toBe('t')
    expect(one(dsn, `select simulated from public.asset_provenance where asset_id='${id}'`)).toBe('f')
  })

  it('REFUSES an update to provenance', () => {
    const id = insertAsset()
    run(dsn, ['-c', `insert into public.asset_provenance (asset_id, source, provider)
                     values ('${id}','generated','ideogram')`])
    const err = expectFailure(dsn, `update public.asset_provenance set provider='someone-else' where asset_id='${id}'`)
    expect(err).toMatch(/append-only/)
    expect(one(dsn, `select provider from public.asset_provenance where asset_id='${id}'`)).toBe('ideogram')
  })

  it('REFUSES a delete of provenance', () => {
    const id = insertAsset()
    run(dsn, ['-c', `insert into public.asset_provenance (asset_id, source) values ('${id}','generated')`])
    expect(expectFailure(dsn, `delete from public.asset_provenance where asset_id='${id}'`)).toMatch(/append-only/)
  })

  it('ALLOWS an asset to be published, archived and moved', () => {
    // The deliberate asymmetry. An asset's location, visibility and status are
    // meant to change — that is the whole point of separating identity from
    // location. Only the record of what PRODUCED it is frozen.
    const id = insertAsset()
    run(dsn, ['-c', `update public.assets
                     set visibility='public', storage_bucket='media-assets',
                         storage_path='p/moved.png', status='archived'
                     where id='${id}'`])
    expect(one(dsn, `select visibility||'|'||status||'|'||storage_bucket
                     from public.assets where id='${id}'`)).toBe('public|archived|media-assets')
  })

  it('one provenance row per asset, and it cannot outlive the asset', () => {
    const id = insertAsset()
    run(dsn, ['-c', `insert into public.asset_provenance (asset_id, source) values ('${id}','generated')`])
    expect(expectFailure(dsn, `insert into public.asset_provenance (asset_id, source) values ('${id}','uploaded')`))
      .toMatch(/duplicate key value|unique constraint/)

    // Cascade: deleting the asset removes provenance. A flat no-delete trigger
    // BLOCKED this — caught here, fixed in the migration — which would have made
    // every asset with provenance, and every project owning one, undeletable.
    run(dsn, ['-c', `delete from public.assets where id='${id}'`])
    expect(one(dsn, `select count(*) from public.asset_provenance where asset_id='${id}'`)).toBe('0')
  })

  it('REFUSES an orphan delete while the asset survives, but ALLOWS the cascade', () => {
    const id = insertAsset()
    run(dsn, ['-c', `insert into public.asset_provenance (asset_id, source) values ('${id}','generated')`])

    // Direct delete — the asset is still there, so this would leave an asset
    // nobody can account for. Refused.
    expect(expectFailure(dsn, `delete from public.asset_provenance where asset_id='${id}'`))
      .toMatch(/append-only/)
    expect(one(dsn, `select count(*) from public.asset_provenance where asset_id='${id}'`)).toBe('1')

    // Same row, removed via its asset. Allowed — the whole record retires together.
    run(dsn, ['-c', `delete from public.assets where id='${id}'`])
    expect(one(dsn, `select count(*) from public.asset_provenance where asset_id='${id}'`)).toBe('0')
  })

  it('a project with assets can still be deleted (cascade reaches provenance)', () => {
    // assets.project_id cascades from projects, and assets cascades to
    // provenance. If the append-only trigger blocked the second hop, deleting a
    // project would fail — a defect invisible to every mocked test.
    run(dsn, ['-c', `insert into public.projects (id, slug, name)
                     values ('44444444-4444-4444-4444-444444444444','proj-del','Del')`])
    const id = insertAsset({ project_id: `'44444444-4444-4444-4444-444444444444'` })
    run(dsn, ['-c', `insert into public.asset_provenance (asset_id, source) values ('${id}','generated')`])

    expect(() => run(dsn, ['-c', `delete from public.projects
                                  where id='44444444-4444-4444-4444-444444444444'`])).not.toThrow()
    expect(one(dsn, `select count(*) from public.assets where id='${id}'`)).toBe('0')
    expect(one(dsn, `select count(*) from public.asset_provenance where asset_id='${id}'`)).toBe('0')
  })

  it('stores reference asset ids as an array of identities', () => {
    const ref = insertAsset()
    const child = insertAsset()
    run(dsn, ['-c', `insert into public.asset_provenance (asset_id, source, reference_asset_ids)
                     values ('${child}','generated', array['${ref}']::uuid[])`])
    expect(one(dsn, `select reference_asset_ids[1] from public.asset_provenance where asset_id='${child}'`))
      .toBe(ref)
  })
})

d('row-level security is enabled and owner-scoped', () => {
  it('enables RLS on both tables', () => {
    expect(one(dsn, `select relrowsecurity from pg_class where relname='assets'`)).toBe('t')
    expect(one(dsn, `select relrowsecurity from pg_class where relname='asset_provenance'`)).toBe('t')
  })

  it('creates exactly one owner policy on each', () => {
    expect(one(dsn, `select count(*) from pg_policies where tablename='assets'`)).toBe('1')
    expect(one(dsn, `select count(*) from pg_policies where tablename='asset_provenance'`)).toBe('1')
    expect(one(dsn, `select policyname from pg_policies where tablename='assets'`)).toBe('assets_owner')
  })

  it('scopes both policies through projects.owner_id', () => {
    // Provenance derives its scope from assets rather than duplicating the
    // projects lookup, so the two cannot drift apart.
    // qual is pretty-printed across lines; collapse it so the assertion sees
    // the whole expression rather than its first line.
    const qual = (t: string) =>
      one(dsn, `select replace(qual, chr(10), ' ') from pg_policies where tablename='${t}'`)
    expect(qual('assets')).toMatch(/owner_id/)
    expect(qual('asset_provenance')).toMatch(/assets/)
    expect(qual('asset_provenance')).toMatch(/owner_id/)
  })
})
