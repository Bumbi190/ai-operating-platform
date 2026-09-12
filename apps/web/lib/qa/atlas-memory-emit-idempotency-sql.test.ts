/**
 * Atlas Memory Slice 2A — emit idempotency, proven in SQL.
 *
 * Every Slice 2A emitter relies on one database rule for retries: the partial
 * unique index `memory_events_idem` on (source, source_id, event_type) where
 * source_id is not null, which `public.atlas_record_event` honours with
 * ON CONFLICT DO NOTHING. A mocked test can only mirror that rule; this file
 * replays the REAL migration files into a throwaway local Postgres database and
 * calls the real wrapper with the exact key shape each emitter sends — so the
 * dedupe does not depend on application timing.
 *
 * It also pins the two reasons the emit API now refuses input before any write:
 * a NULL source_id is never deduped, and a project event without a project is
 * refused by the table's scope CHECK rather than stored as unowned memory.
 *
 * And it proves Slice 2A leaves consolidation semantics alone: the source the
 * article-review route actually emits (read from the route file, not restated
 * here) is run through the REAL consolidation function and must land on the
 * same trust weight as an approval decision — not on the unknown-source fallback.
 *
 * HARNESS: identical to atlas-memory-recall-sql.test.ts — its own database
 * (created and dropped here), never an existing one; FAILS instead of skipping
 * where SQL proof is required (CI=true or ATLAS_SQL_TEST_REQUIRED=1).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const MIGRATIONS_DIR = path.join(WEB_ROOT, 'supabase/migrations')

/** The shipped files that build the emit and consolidation paths, in dependency order. */
const MIGRATIONS = [
  '20260616120000_atlas_schema_init.sql',
  '20260616120100_atlas_memory_events.sql',
  '20260616120200_atlas_memories.sql',
  '20260617130100_atlas_salience_fn.sql',
  '20260617130000_atlas_record_event_fn.sql',
  '20260617140000_atlas_event_type_to_class_fn.sql',
  '20260617140100_atlas_consolidate_fn.sql',
]

/** Source with comments removed (strings kept), so prose can never satisfy a check. */
function codeOnly(src: string): string {
  let out = ''
  let i = 0
  let quote: string | null = null
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    if (quote) {
      out += c
      if (c === '\\') { out += n ?? ''; i += 2; continue }
      if (c === quote) quote = null
      i++
      continue
    }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
    if (c === '"' || c === "'" || c === '`') quote = c
    out += c
    i++
  }
  return out
}

/** What the article-review route really sends: one source and one dedupe key across its emits. */
const ARTICLE_REVIEW = (() => {
  const code = codeOnly(fs.readFileSync(path.join(WEB_ROOT, 'app/api/content/articles/[id]/review/route.ts'), 'utf8'))
  const payloads = code.split(/recordMemoryEvent\(/).slice(1).map((p) => p.slice(0, 700))
  const sources = new Set(payloads.map((p) => p.match(/\bsource:\s*'([^']+)'/)?.[1]))
  const keys = new Set(payloads.map((p) => p.match(/\bdedupeKey:\s*'([^']+)'/)?.[1]))
  if (payloads.length === 0 || sources.size !== 1 || keys.size !== 1) {
    throw new Error(`article-review emits disagree: sources=${[...sources]} keys=${[...keys]}`)
  }
  return { source: [...sources][0] as string, dedupeKey: [...keys][0] as string }
})()

const PROJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const APPROVAL_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ARTICLE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const LEGACY_RUN = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const ACTION_RUN = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const CANCELLED_RUN = '12121212-1212-4212-8212-121212121212'
const CHECKPOINT_RUN = '13131313-1313-4313-8313-131313131313'
const WORKFLOW_TRANSITION = '14141414-1414-4414-8414-141414141414'
const DREAM_ISSUE = '17171717-1717-4717-8717-171717171717'
const DREAM_DAY = '2026-09-12'

// ── Harness discovery (same contract as the recall SQL suite) ────────────────

function findPsql(): string | null {
  const candidates = [
    process.env.ATLAS_SQL_TEST_PSQL,
    'psql',
    '/opt/homebrew/opt/libpq/bin/psql',
    '/usr/local/opt/libpq/bin/psql',
    '/usr/bin/psql',
  ].filter(Boolean) as string[]
  for (const c of candidates) {
    try {
      execFileSync(c, ['--version'], { stdio: 'pipe' })
      return c
    } catch { /* try next */ }
  }
  return null
}

const PSQL = findPsql()
const ADMIN_URL =
  process.env.ATLAS_SQL_TEST_URL ??
  `postgres://${process.env.USER ?? 'postgres'}@127.0.0.1:5432/postgres`

function dsnFor(database: string): string {
  const url = new URL(ADMIN_URL)
  url.pathname = `/${database}`
  return url.toString()
}

function run(dsn: string, args: string[], input?: string): string {
  return execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', dsn, ...args], {
    encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000,
  })
}

function query(dsn: string, sql: string): string[][] {
  const out = execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-F', '|', '-d', dsn, '-c', sql], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000,
  })
  return out.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split('|'))
}

const AVAILABLE = (() => {
  if (!PSQL) return false
  try {
    execFileSync(PSQL, ['-X', '-t', '-A', '-d', ADMIN_URL, '-c', 'select 1'], { stdio: 'pipe', timeout: 10_000 })
    return true
  } catch {
    return false
  }
})()

const SQL_REQUIRED = process.env.CI === 'true' || process.env.ATLAS_SQL_TEST_REQUIRED === '1'

if (!AVAILABLE && !SQL_REQUIRED) {
  console.warn(
    '[atlas-memory-emit-idempotency-sql] SKIPPED — no reachable local Postgres. ' +
      'Emit idempotency was NOT proven in SQL in this run. ' +
      'Set ATLAS_SQL_TEST_URL (superuser DSN) / ATLAS_SQL_TEST_PSQL to enable it.',
  )
}

const DB_NAME = `atlas_mem_emit_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

const lit = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`)

/** Calls the real wrapper; returns the new id, or null when it deduped. */
function emit(e: { eventType: string; source: string; sourceId: string | null; dedupeKey?: string | null; projectId?: string | null; content?: string }): string | null {
  const rows = query(dsn, `select public.atlas_record_event(
      p_scope := 'project', p_event_type := ${lit(e.eventType)}, p_content := ${lit(e.content ?? 'c')},
      p_source := ${lit(e.source)}, p_project_id := ${e.projectId === undefined ? lit(PROJECT) : e.projectId === null ? 'null' : `${lit(e.projectId)}::uuid`},
      p_source_id := ${lit(e.sourceId)}, p_dedupe_key := ${lit(e.dedupeKey ?? null)})`)
  return rows[0]?.[0] || null
}

const countKey = (source: string, sourceId: string, eventType: string) =>
  Number(query(dsn, `select count(*) from atlas.memory_events
    where source = ${lit(source)} and source_id = ${lit(sourceId)} and event_type = ${lit(eventType)}`)[0][0])

// ── Suite ────────────────────────────────────────────────────────────────────

describe.skipIf(!AVAILABLE && !SQL_REQUIRED)('Slice 2A — emit idempotency in the real wrapper (SQL)', () => {
  beforeAll(() => {
    if (!AVAILABLE) return
    run(ADMIN_URL, ['-c', `create database ${DB_NAME}`])
    dsn = dsnFor(DB_NAME)
    run(dsn, [], `
      do $$ begin
        if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role  nologin; end if;
        if not exists (select 1 from pg_roles where rolname='anon')          then create role anon          nologin; end if;
        if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      end $$;
      create table if not exists public.projects (id uuid primary key default gen_random_uuid(), owner_id uuid);
      insert into public.projects (id, owner_id) values ('${PROJECT}', '11111111-1111-4111-8111-111111111111');
    `)
    for (const file of MIGRATIONS) {
      const full = path.join(MIGRATIONS_DIR, file)
      if (!fs.existsSync(full)) throw new Error(`migration missing: ${file}`)
      run(dsn, ['-f', full])
    }
  }, 120_000)

  afterAll(() => {
    if (!dsn) return
    try {
      run(ADMIN_URL, ['-c', `drop database if exists ${DB_NAME} with (force)`])
    } catch { /* best effort — a throwaway database */ }
  })

  it('PostgreSQL is reachable — this suite must never pass by skipping in CI', () => {
    expect(AVAILABLE, 'no reachable Postgres; set ATLAS_SQL_TEST_URL / ATLAS_SQL_TEST_PSQL').toBe(true)
  })

  it('the idempotency index is exactly (source, source_id, event_type) where source_id is not null', () => {
    const [[def]] = query(dsn, `select indexdef from pg_indexes where schemaname = 'atlas' and indexname = 'memory_events_idem'`)
    expect(def).toMatch(/UNIQUE INDEX memory_events_idem ON atlas\.memory_events USING btree \(source, source_id, event_type\) WHERE \(source_id IS NOT NULL\)/)
  })

  it.each([
    ['approval decision', { eventType: 'feedback', source: 'approval', sourceId: APPROVAL_ID, dedupeKey: 'feedback:article' }],
    ['article review', { eventType: 'feedback', source: ARTICLE_REVIEW.source, sourceId: ARTICLE_ID, dedupeKey: ARTICLE_REVIEW.dedupeKey }],
    ['legacy drained run', { eventType: 'outcome', source: 'drain', sourceId: LEGACY_RUN }],
    ['workflow-action run', { eventType: 'outcome', source: 'drain', sourceId: ACTION_RUN }],
    ['finalization cancel', { eventType: 'outcome', source: 'drain', sourceId: CANCELLED_RUN }],
    ['step-checkpoint cancel (2B-1)', { eventType: 'outcome', source: 'drain', sourceId: CHECKPOINT_RUN }],
    ['workflow completion (2B-1, transition id)', { eventType: 'outcome', source: 'workflow', sourceId: WORKFLOW_TRANSITION }],
    ['dream new issue (2B-2)', { eventType: 'reflection', source: 'dream', sourceId: `${DREAM_ISSUE}:first_seen` }],
    ['dream severity change (2B-2, dated)', { eventType: 'reflection', source: 'dream', sourceId: `${DREAM_ISSUE}:severity:critical:${DREAM_DAY}` }],
    ['dream cycle summary (2B-2, project + date)', { eventType: 'reflection', source: 'dream', sourceId: `${PROJECT}:${DREAM_DAY}` }],
  ])('%s: a retry of the same emit is one event', (_label, key) => {
    const first = emit(key)
    const retry = emit(key)
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(retry, 'the wrapper returns NULL when it dedupes').toBeNull()
    expect(countKey(key.source, key.sourceId, key.eventType)).toBe(1)
  })

  it('a run cancelled through several cancel paths (reclaim, final write, approval write) is one event', () => {
    const run = '15151515-1515-4515-8515-151515151515'
    const paths = ['cancelled at a step checkpoint', 'cancelled before completion', 'cancelled before approval']
    const ids = paths.map((content) => emit({ eventType: 'outcome', source: 'drain', sourceId: run, content }))
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(ids.slice(1)).toEqual([null, null])
    expect(countKey('drain', run, 'outcome')).toBe(1)
  })

  it('a workflow transition id is its own identity: two completions are two events, one completion is one', () => {
    const second = '16161616-1616-4616-8616-161616161616'
    expect(emit({ eventType: 'outcome', source: 'workflow', sourceId: second })).not.toBeNull()
    expect(emit({ eventType: 'outcome', source: 'workflow', sourceId: second })).toBeNull()
    expect(countKey('workflow', second, 'outcome')).toBe(1)
    expect(countKey('workflow', WORKFLOW_TRANSITION, 'outcome')).toBe(1)
  })

  it('a run cannot gain a second terminal outcome — the first one stands', () => {
    // LEGACY_RUN already holds its outcome from the case above.
    expect(emit({ eventType: 'outcome', source: 'drain', sourceId: LEGACY_RUN, content: 'cancelled later' })).toBeNull()
    expect(countKey('drain', LEGACY_RUN, 'outcome')).toBe(1)
    const [[content]] = query(dsn, `select content from atlas.memory_events where source='drain' and source_id='${LEGACY_RUN}'`)
    expect(content).not.toBe('cancelled later')
  })

  it('a Dream issue is first seen once for its whole lifetime, however often it recurs', () => {
    const issue = '18181818-1818-4818-8818-181818181818'
    const key = `${issue}:first_seen`
    expect(emit({ eventType: 'reflection', source: 'dream', sourceId: key, content: 'new issue' })).not.toBeNull()
    // 30 more nights of the same issue recurring: the producer emits nothing, and
    // even a retried first sighting cannot fork a second identity.
    expect(emit({ eventType: 'reflection', source: 'dream', sourceId: key, content: 'seen again' })).toBeNull()
    expect(countKey('dream', key, 'reflection')).toBe(1)
  })

  it('a severity change dedupes within its UTC cycle but stays visible on a later date', () => {
    const issue = '19191919-1919-4919-8919-191919191919'
    const day1 = `${issue}:severity:critical:2026-09-12`
    const day8 = `${issue}:severity:critical:2026-09-19`
    // cron, then a manual run, then a retry — one UTC day, one event.
    expect(emit({ eventType: 'reflection', source: 'dream', sourceId: day1 })).not.toBeNull()
    expect(emit({ eventType: 'reflection', source: 'dream', sourceId: day1 })).toBeNull()
    expect(emit({ eventType: 'reflection', source: 'dream', sourceId: day1 })).toBeNull()
    expect(countKey('dream', day1, 'reflection')).toBe(1)
    // A genuine later flip back to `critical` is a different night, so it stands:
    // this is exactly what a lifetime `:severity:<new>` key would have swallowed.
    expect(emit({ eventType: 'reflection', source: 'dream', sourceId: day8 })).not.toBeNull()
    expect(countKey('dream', day8, 'reflection')).toBe(1)
    const [[n]] = query(dsn, `select count(*) from atlas.memory_events
      where source='dream' and source_id like '${issue}:severity:%'`)
    expect(Number(n)).toBe(2)
  })

  it('a project gets at most one Dream summary per UTC cycle date', () => {
    const day = `${PROJECT}:2026-09-20`
    const next = `${PROJECT}:2026-09-21`
    expect(emit({ eventType: 'reflection', source: 'dream', sourceId: day, content: 'cron' })).not.toBeNull()
    expect(emit({ eventType: 'reflection', source: 'dream', sourceId: day, content: 'manual, same day' })).toBeNull()
    expect(countKey('dream', day, 'reflection')).toBe(1)
    expect(emit({ eventType: 'reflection', source: 'dream', sourceId: next, content: 'next night' })).not.toBeNull()
    const [[content]] = query(dsn, `select content from atlas.memory_events where source='dream' and source_id='${day}'`)
    expect(content).toBe('cron')
  })

  it('the three Dream identities never collide with each other or with the June backfill', () => {
    const issue = '20202020-2020-4020-8020-202020202020'
    const ids = [`${issue}:first_seen`, `${issue}:severity:warning:${DREAM_DAY}`, `${PROJECT}:${DREAM_DAY}`,
                 `alerting_missing:${DREAM_DAY}`]
    const written = ids.map((sourceId) => emit({ eventType: 'reflection', source: 'dream', sourceId }))
    expect(written.filter(Boolean)).toHaveLength(3) // the summary key already exists from the it.each row
    const [[n]] = query(dsn, `select count(distinct source_id) from atlas.memory_events
      where source='dream' and source_id in (${ids.map((i) => lit(i)).join(',')})`)
    expect(Number(n)).toBe(4)
  })

  it('an article review and an approval decision share a source but never dedupe onto each other', () => {
    // Different identities (a content id vs an approval id) under the same source.
    const review = '34343434-3434-4434-8434-343434343434'
    const decision = '78787878-7878-4878-8878-787878787878'
    expect(emit({ eventType: 'feedback', source: ARTICLE_REVIEW.source, sourceId: review, dedupeKey: ARTICLE_REVIEW.dedupeKey })).not.toBeNull()
    expect(emit({ eventType: 'feedback', source: 'approval', sourceId: decision, dedupeKey: 'feedback:article' })).not.toBeNull()
    expect(countKey(ARTICLE_REVIEW.source, review, 'feedback')).toBe(1)
    expect(countKey('approval', decision, 'feedback')).toBe(1)
  })

  it('the article review consolidates at the approval trust weight, not the unknown-source fallback (real function)', () => {
    const probe = (source: string, sourceId: string, key: string) =>
      emit({ eventType: 'feedback', source, sourceId, dedupeKey: key })
    probe(ARTICLE_REVIEW.source, '9a9a9a9a-9a9a-4a9a-8a9a-9a9a9a9a9a9a', 'trust-probe:article-review')
    probe('approval', '9b9b9b9b-9b9b-4b9b-8b9b-9b9b9b9b9b9b', 'trust-probe:approval-decision')
    probe('slice2a_unknown_source_probe', '9c9c9c9c-9c9c-4c9c-8c9c-9c9c9c9c9c9c', 'trust-probe:unknown-source')
    query(dsn, `select atlas.consolidate_memory_events(1000)`)
    const trust = (key: string) => {
      const rows = query(dsn, `select source_trust, value->>'last_source' from atlas.memories where mem_key = '${key}'`)
      expect(rows, `no consolidated memory for ${key}`).toHaveLength(1)
      return { weight: Number(rows[0][0]), lastSource: rows[0][1] }
    }
    const review = trust('trust-probe:article-review')
    const decision = trust('trust-probe:approval-decision')
    const unknown = trust('trust-probe:unknown-source')
    expect(review.weight).toBe(decision.weight)
    expect(review.weight).not.toBe(unknown.weight)
    expect(review.weight).toBeGreaterThan(unknown.weight)
    expect(review.lastSource).toBe(ARTICLE_REVIEW.source)
  })

  it('why sourceId is required: a NULL source_id is never deduped', () => {
    const before = Number(query(dsn, `select count(*) from atlas.memory_events where source_id is null`)[0][0])
    emit({ eventType: 'outcome', source: 'drain', sourceId: null })
    emit({ eventType: 'outcome', source: 'drain', sourceId: null })
    const after = Number(query(dsn, `select count(*) from atlas.memory_events where source_id is null`)[0][0])
    expect(after - before).toBe(2)
  })

  it('a project event without a project is refused by the table, never stored as unowned memory', () => {
    const before = Number(query(dsn, `select count(*) from atlas.memory_events`)[0][0])
    expect(() => emit({ eventType: 'outcome', source: 'drain', sourceId: '56565656-5656-4656-8656-565656565656', projectId: null }))
      .toThrow(/memory_events_project_scope/)
    expect(Number(query(dsn, `select count(*) from atlas.memory_events`)[0][0])).toBe(before)
  })
})
