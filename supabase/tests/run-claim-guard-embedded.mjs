// Runs supabase/tests/claim_media_publication_guard.test.sql against an
// ISOLATED, throwaway real PostgreSQL instance (embedded-postgres), applying
// the ledger table, unique indexes, and claim_media_publication function
// extracted verbatim from the actual migration source. Also runs two
// concurrency probes with parallel connections.
//
// Usage — ESM resolves imports relative to this file's location, so either
// install the deps at the repo root, or copy this file into a scratch dir:
//   mkdir /tmp/claim-guard && cd /tmp/claim-guard
//   npm i embedded-postgres pg
//   cp <repo>/supabase/tests/run-claim-guard-embedded.mjs .
//   REPO_ROOT=<repo> PGT_PORT=55433 node run-claim-guard-embedded.mjs
//
// This never touches a shared or production database.
import EmbeddedPostgres from 'embedded-postgres'
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'

const REPO = process.env.REPO_ROOT ?? process.cwd()
const PORT = Number(process.env.PGT_PORT ?? 55433)
const migration = readFileSync(
  join(REPO, 'supabase/migrations/20260707190359_media_semantic_duplicate_guard.sql'), 'utf8')
const assertions = readFileSync(
  join(REPO, 'supabase/tests/claim_media_publication_guard.test.sql'), 'utf8')

function extract(startMarker, endMarker) {
  const s = migration.indexOf(startMarker)
  if (s < 0) throw new Error(`marker not found: ${startMarker}`)
  const e = migration.indexOf(endMarker, s)
  if (e < 0) throw new Error(`end marker not found after: ${startMarker}`)
  return migration.slice(s, e + endMarker.length)
}

const tableSql = extract('create table if not exists public.media_publication_ledger', ');')
const idx1 = extract('create unique index if not exists unique_media_asset_channel_publication', ';')
const idx2 = extract('create unique index if not exists unique_publication_idempotency_key', ';')
const fnSql = extract('create or replace function public.claim_media_publication', '$$;')

const server = new EmbeddedPostgres({
  databaseDir: mkdtempSync(join(tmpdir(), 'claim-guard-pg-')),
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: false,
})

await server.initialise()
await server.start()
await server.createDatabase('guardtest')

const conn = { host: 'localhost', port: PORT, user: 'postgres', password: 'postgres', database: 'guardtest' }
const client = new pg.Client(conn)
await client.connect()

await client.query(`
  create table public.projects (id uuid primary key);
  create table public.media_news_items (id uuid primary key);
  create table public.media_scripts (id uuid primary key);
`)
await client.query(tableSql)
await client.query(idx1)
await client.query(idx2)
await client.query(fnSql)
console.log('schema + claim function applied from migration source')

await client.query(assertions)
console.log('PASS: claim_media_publication_guard.test.sql (all DO-block assertions)')

// ── Concurrency probe 1: fresh key, two parallel connections ─────────────────
await client.query(`insert into public.projects (id) values ('00000000-0000-0000-0000-0000000000aa')`)
await client.query(`insert into public.media_scripts (id) values ('00000000-0000-0000-0000-0000000000bb')`)
const c1 = new pg.Client(conn); const c2 = new pg.Client(conn)
await c1.connect(); await c2.connect()
const call = (c, asset, key) => c.query(
  `select * from public.claim_media_publication($1, null, $2, $3, 'youtube', now(), $4)`,
  ['00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000bb', asset, key],
)
const [r1, r2] = await Promise.all([call(c1, 'asset-c', 'k-concurrent'), call(c2, 'asset-c', 'k-concurrent')])
const statuses = [r1.rows[0].status, r2.rows[0].status].sort()
console.log('fresh-key concurrency statuses:', statuses)
if (statuses.filter(s => s === 'claimed').length !== 1) {
  throw new Error(`CONCURRENCY PROBE FAILED: expected exactly one 'claimed', got ${statuses}`)
}

// ── Concurrency probe 2: dangerous row — both racers must be refused ─────────
await client.query(`
  insert into public.media_publication_ledger
    (project_id, script_id, media_asset_id, channel, state, idempotency_key,
     provider_attempt_id, retry_count)
  values
    ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000bb',
     'asset-d', 'youtube', 'retryable_failed', 'k-danger',
     'https://upload.youtube.example/session-9', 0)
`)
const [d1, d2] = await Promise.all([call(c1, 'asset-d', 'k-danger'), call(c2, 'asset-d', 'k-danger')])
const dStatuses = [d1.rows[0].status, d2.rows[0].status]
console.log('dangerous-row concurrency statuses:', dStatuses)
if (dStatuses.some(s => ['retry_claimed', 'claimed', 'stale_claim_recovered'].includes(s))) {
  throw new Error(`DANGEROUS-ROW CONCURRENCY FAILED: an actionable claim escaped: ${dStatuses}`)
}

await c1.end(); await c2.end(); await client.end()
await server.stop()
console.log('ALL REAL-POSTGRESQL GUARD TESTS PASSED')
