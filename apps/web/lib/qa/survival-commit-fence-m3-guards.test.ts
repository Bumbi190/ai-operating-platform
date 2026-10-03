/**
 * Phase 3B1B2 · M3 — permanent guards.
 *
 * The real-PostgreSQL suites prove the fence and the commit-bound observation
 * work. These guards stop a future edit from quietly undoing them:
 *
 *   - the ONLY validity clock is clock_timestamp() (never now()/CURRENT_TIMESTAMP/
 *     transaction_timestamp()/statement_timestamp());
 *   - the fence takes the 8 shard rows FOR SHARE, ascending, as its LAST locks;
 *   - every self-probe (2PC, vector, shard set, epochs, clock, own write,
 *     forced IMMEDIATE, anchor, top level) stays present;
 *   - the commit-time recheck stays a DEFERRABLE INITIALLY DEFERRED constraint
 *     trigger; a fenced transaction may not write Survival authority;
 *   - the deadline function stays in lock-step with the canonical clock
 *     semantics it mirrors (budget_scope_state windows + stale rule, the TS burn
 *     cutoff) — editing either fails here until the deadline is re-reviewed;
 *   - the fence is INTERNAL (no grant), the commit-bound helper is unspoofable and
 *     unused, licensed binds still fail closed, M2 bytes are unchanged, and no M4
 *     primitive arrives with M3.
 */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => { throw new Error('bind admission must not touch the database') },
}))

import { admitAutonomyAtBind } from '@/lib/atlas/autonomy-runtime/bind'
import { AUTONOMY_RUNTIME_POLICY } from '@/lib/atlas/autonomy-runtime/policy'

const APP = process.cwd()
const MIGRATIONS = join(APP, 'supabase/migrations')
const M3_FILE = '20261003120000_survival_commit_fence.sql'
const M2_FILE = '20261002190000_survival_input_epoch.sql'
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const sqlCode = (s: string) => s.replace(/--[^\n]*/g, '')
const tsCode = (s: string) => s.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')
const m3 = read(join(MIGRATIONS, M3_FILE))
const m3Code = sqlCode(m3)
const MIGRATION_FILES = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()

/** The body of `create or replace function public.<fn>(` in `code`. */
function body(code: string, fn: string): string {
  const m = new RegExp(`create or replace function public\\.${fn}\\(([\\s\\S]*?)\\$\\$([\\s\\S]*?)\\$\\$`, 'i').exec(code)
  return m ? m[2] : ''
}
/** The LAST migration's definition of public.<fn> — the effective body. */
function effective(fn: string): string {
  let b = ''
  for (const f of MIGRATION_FILES) { const x = body(sqlCode(read(join(MIGRATIONS, f))), fn); if (x) b = x }
  return b
}
const FENCE = body(m3Code, 'survival_commit_fence')
const RECHECK = body(m3Code, 'survival_commit_fence_recheck')
const GUARD = body(m3Code, 'survival_fenced_transaction_guard')
const INVALID_AT = body(m3Code, 'survival_clock_invalid_at')
const ANCHOR = body(m3Code, 'survival_observation_anchor')
const M3_FUNCTIONS = { FENCE, RECHECK, GUARD, INVALID_AT, ANCHOR }

describe('M3 clock: clock_timestamp() is the only validity clock', () => {
  it.each(Object.entries(M3_FUNCTIONS))('%s has a body and uses no transaction/statement-start clock', (_name, b) => {
    expect(b.length).toBeGreaterThan(20)
    expect(b).not.toMatch(/\bnow\s*\(|current_timestamp|transaction_timestamp|statement_timestamp|localtimestamp|current_date|current_time\b/i)
  })

  it('the fence and the recheck compare the deadline against clock_timestamp(), rejecting at equality', () => {
    expect(FENCE).toMatch(/if pg_catalog\.clock_timestamp\(\) >= v_invalid then/)
    expect(RECHECK).toMatch(/if pg_catalog\.clock_timestamp\(\) >= new\.invalid_at then/)
    expect(ANCHOR).toMatch(/select pg_catalog\.clock_timestamp\(\), public\.survival_input_epoch_vector\(\);/)
  })
})

describe('M3 lock order: the 8 shard rows FOR SHARE, ascending, are the fence\'s LAST locks', () => {
  const SHARD_LOOP = 'for i in 0..7 loop\n    perform 1 from public.survival_input_epoch_shards s where s.shard_id = i for share;\n  end loop;'

  it('the fence locks shard by shard, 0 → 7 (never reverse, never a set-based FOR SHARE)', () => {
    expect(FENCE).toContain(SHARD_LOOP)
    expect(FENCE).not.toMatch(/reverse/i)
    expect([...FENCE.matchAll(/for share/gi)]).toHaveLength(1)
    expect(RECHECK).toContain(SHARD_LOOP)
  })

  it('every read and every intent write happens BEFORE the shard loop; after it only the shard table is touched', () => {
    const loop = FENCE.indexOf(SHARD_LOOP)
    const before = FENCE.slice(0, loop)
    const after = FENCE.slice(loop + SHARD_LOOP.length)
    expect(before).toMatch(/v_invalid := public\.survival_clock_invalid_at\(p_anchor\);/)
    expect(before).toMatch(/delete from public\.survival_commit_fence_intents/)
    expect(before).toMatch(/insert into public\.survival_commit_fence_intents/)
    expect(before).toMatch(/for update skip locked/)       // the sweep never waits
    expect([...after.matchAll(/\bpublic\.(\w+)/g)].map(m => m[1])).toEqual(['survival_input_epoch_shards'])
    expect(after).not.toMatch(/\b(insert|update|delete)\b|for (update|share|no key update|key share)|\bperform\b/i)
  })

  it('the recheck reads only the shards it already holds (and nothing a writer can hold)', () => {
    expect([...new Set([...RECHECK.matchAll(/\bpublic\.(\w+)/g)].map(m => m[1]))]).toEqual(['survival_input_epoch_shards'])
  })
})

describe('M3 self-probes stay present', () => {
  it.each([
    ['SV001', 'prepared transactions'], ['SV002', 'observed vector'], ['SV003', 'shard set'], ['SV004', 'epoch vector changed'],
    ['SV005', 'clock expired'], ['SV006', 'own authority write'], ['SV007', 'recheck forced IMMEDIATE'], ['SV008', 'anchor'],
    ['SV009', 'top level'],
  ])('the fence raises %s (%s)', (code) => {
    expect(FENCE).toContain(`errcode = '${code}'`)
  })

  it.each(['SV001', 'SV003', 'SV004', 'SV005', 'SV006'])('the commit-time recheck raises %s', (code) => {
    expect(RECHECK).toContain(`errcode = '${code}'`)
  })

  it('both the fence and the recheck read the LIVE max_prepared_transactions and require 0', () => {
    for (const b of [FENCE, RECHECK]) {
      expect(b).toMatch(/pg_catalog\.current_setting\('max_prepared_transactions'\)::int <> 0/)
    }
  })

  it('the forced-IMMEDIATE probe: the recheck leaves a marker; the fence refuses if it is already set for this transaction', () => {
    expect(RECHECK).toMatch(/set_config\('omnira\.survival_fence_rechecked', new\.xact::text, true\)/)
    expect(FENCE).toMatch(/current_setting\('omnira\.survival_fence_rechecked', true\) is not distinct from v_xact::text/)
  })

  it('the vector comparison is EXACT equality — no delta arithmetic on epochs', () => {
    expect(FENCE).toMatch(/if v_epochs is distinct from p_observed_vector then/)
    expect(RECHECK).toMatch(/if v_epochs is distinct from new\.observed_vector then/)
    expect(`${FENCE}${RECHECK}`).not.toMatch(/epoch\w*\s*[-+]|[-+]\s*\w*epoch/i)
  })
})

describe('M3 commit-time machinery', () => {
  it('the recheck is a DEFERRABLE INITIALLY DEFERRED constraint trigger on the intent insert', () => {
    expect(m3Code).toMatch(/create constraint trigger survival_commit_fence_recheck\n  after insert on public\.survival_commit_fence_intents\n  deferrable initially deferred for each row\n  execute function public\.survival_commit_fence_recheck\(\);/)
  })

  it('a fenced transaction may not change Survival authority: BEFORE UPDATE guard on the shard table', () => {
    expect(m3Code).toMatch(/create trigger survival_fenced_transaction_guard\n  before update on public\.survival_input_epoch_shards\n  for each row execute function public\.survival_fenced_transaction_guard\(\);/)
    expect(GUARD).toMatch(/i\.xact = pg_catalog\.pg_current_xact_id\(\)/)
    expect(GUARD).toContain(`errcode = 'SV006'`)
  })

  it('identity is the FULL xid8 everywhere (the top-level probe is the only xid comparison, and it is a probe, not identity)', () => {
    expect(m3Code).not.toMatch(/txid_current/)
    // Exactly ONE system-column use: the top-level probe on the row this transaction just inserted.
    expect([...m3Code.matchAll(/\bxmin\b/g)]).toHaveLength(1)
    expect(FENCE).toMatch(/select \(x\.xmin::text\)::bigint into v_row_xmin from public\.survival_commit_fence_intents x where x\.xact = v_xact;/)
    expect(FENCE).toMatch(/v_xact\s+xid8 := pg_catalog\.pg_current_xact_id\(\);/)
    expect(m3Code).toMatch(/xact\s+xid8\s+primary key/)
  })

  it('M3 issues no SET CONSTRAINTS anywhere (runtime structural exclusion is the M2 scan)', () => {
    expect(m3Code).not.toMatch(/set\s+constraints/i)
  })

  it('M2 is unchanged: its migration bytes still hash to the applied production statement', () => {
    expect(createHash('sha256').update(read(join(MIGRATIONS, M2_FILE)), 'utf8').digest('hex'))
      .toBe('93e002f0e4308b606816895b91c810c324f66754d3d058026566e898a5761d80')
  })
})

describe('M3 deadline stays in lock-step with the canonical clock semantics it mirrors', () => {
  it('budget_scope_state\'s effective window and stale expressions are exactly the ones the deadline reproduces', () => {
    const bss = effective('budget_scope_state')
    expect(bss).toContain(`with tz as (select 'Europe/Stockholm'::text as z)`)
    for (const e of [`(l_day   + interval '1 day')`, `(l_week  + interval '1 week')`, `(l_month + interval '1 month')`,
      `date_trunc('day',   now() at time zone z)`, `date_trunc('week',  now() at time zone z)`, `date_trunc('month', now() at time zone z)`,
      `now() - make_interval(mins => p_stale_minutes)`, `and r.created_at > win.stale`]) {
      expect(bss, e).toContain(e)
    }
    // Pin the whole effective body: any edit must re-review the M3 deadline.
    expect(createHash('sha256').update(bss.replace(/\s+/g, ' ').trim()).digest('hex'))
      .toBe('a78efaffa19f43372bc35350a12a77f5934c869baaa0c0c0d83ac4c4f6357538')
  })

  it('the deadline mirrors them: Stockholm day/week/month, 30-minute stale on open undispatched, 720 EXACT hours of burn', () => {
    expect(INVALID_AT).toContain(`z       constant text := 'Europe/Stockholm';`)
    for (const u of ['day', 'week', 'month']) {
      expect(INVALID_AT).toMatch(new RegExp(`pg_catalog\\.date_trunc\\('${u}',\\s+p_anchor at time zone z\\) \\+ interval '1 ${u}'\\)\\s+at time zone z`))
    }
    expect(INVALID_AT).toMatch(/r\.status = 'open' and r\.dispatched_at is null/)
    expect(INVALID_AT).toMatch(/r\.created_at \+ interval '30 minutes' > p_anchor/)
    expect(INVALID_AT).toMatch(/c\.created_at >= pg_catalog\.date_trunc\('milliseconds', p_anchor\) - interval '720 hours'/)
    expect(INVALID_AT).not.toMatch(/interval '30 days'/)   // calendar days drift across DST; the burn cutoff is exact ms
    expect(INVALID_AT).toMatch(/return least\(v_day, v_week, v_month, v_stale, v_burn\);/)
  })

  it('the TypeScript side still uses the constants the deadline assumes (30-day burn as exact ms, stale 30 minutes)', () => {
    const snap = tsCode(read(join(APP, 'lib/atlas/survival/snapshot.ts')))
    expect(snap).toMatch(/export const BURN_WINDOW_DAYS = 30\n/)
    expect(snap).toMatch(/const STALE_MINUTES = 30\n/)
    expect(snap).toMatch(/new Date\(Date\.parse\(at\) - BURN_WINDOW_DAYS \* 86_400_000\)\.toISOString\(\)/)
    expect(snap).toMatch(/\.gte\('created_at', cutoff\)/)
    expect(snap).toMatch(/db\.rpc\('budget_headroom', \{ p_stale_minutes: STALE_MINUTES \}\)/)
  })
})

describe('M3 privileges: the fence is INTERNAL', () => {
  it('the exact grant set: service_role may execute only the anchor and the deadline', () => {
    expect([...m3Code.matchAll(/^grant [^;]+;/gm)].map(m => m[0])).toEqual([
      'grant execute on function public.survival_observation_anchor() to service_role;',
      'grant execute on function public.survival_clock_invalid_at(timestamptz) to service_role;',
    ])
    for (const fn of ['survival_commit_fence\\(bigint\\[\\], timestamptz\\)', 'survival_commit_fence_recheck\\(\\)', 'survival_fenced_transaction_guard\\(\\)']) {
      expect(m3Code).toMatch(new RegExp(`revoke all on function public\\.${fn} from public, anon, authenticated, service_role;`))
    }
    expect(m3Code).toMatch(/revoke all on table public\.survival_commit_fence_intents from public, anon, authenticated, service_role;/)
    expect(m3Code).toMatch(/alter table public\.survival_commit_fence_intents enable row level security;/)
    expect(m3Code).not.toMatch(/create policy/)
  })

  it('every M3 function is SECURITY DEFINER with an empty search_path', () => {
    const defs = [...m3Code.matchAll(/create or replace function public\.(\w+)\([^)]*\)\s*returns [\s\S]*?as \$\$/g)]
    expect(defs.map(d => d[1]).sort()).toEqual(['survival_clock_invalid_at', 'survival_commit_fence', 'survival_commit_fence_recheck',
      'survival_fenced_transaction_guard', 'survival_observation_anchor'])
    for (const d of defs) expect(d[0], d[1]).toMatch(/security definer set search_path = ''/)
  })

  it('no later migration grants the fence to anyone', () => {
    for (const f of MIGRATION_FILES.filter(f => f > M3_FILE)) {
      expect(sqlCode(read(join(MIGRATIONS, f))), f).not.toMatch(/grant [^;]*survival_commit_fence/i)
    }
  })
})

describe('M3 commit-bound observation helper: unspoofable and inert', () => {
  const raw = read(join(APP, 'lib/atlas/survival/commit-bound-observation.ts'))
  const helper = tsCode(raw)

  it('its only exported runtime signature takes the project scope', () => {
    const sig = /export async function observeSurvivalCommitBound\(([\s\S]*?)\): Promise<CommitBoundSurvivalObservation>/.exec(helper)?.[1] ?? ''
    expect(sig.replace(/\s+/g, ' ').trim()).toBe('allowedProjectIds: readonly string[],')
    expect([...helper.matchAll(/^export (?:async function|function|const|type|interface) (\w+)/gm)].map(m => m[1]).sort())
      .toEqual(['COMMIT_BOUND_EPOCH_SHARDS', 'COMMIT_BOUND_MAX_ATTEMPTS', 'CommitBoundSurvivalObservation', 'observeSurvivalCommitBound'])
    expect(helper).not.toMatch(/Options\b|\boptions\b|\boverrides?\b|\bargs\b|maxAttempts/)
  })

  it('it derives everything itself: createAdminClient(), the DATABASE anchor, the deadline, both vectors', () => {
    expect(helper).toMatch(/\n  const db: AnyDb = createAdminClient\(\)\n/)
    expect([...helper.matchAll(/createAdminClient\(/g)]).toHaveLength(1)
    expect(helper).not.toContain('??')
    expect(helper).not.toMatch(/new Date\(\)|Date\.now\(\)/)             // never the application clock
    expect([...helper.matchAll(/readSurvivalSnapshot\(([^)]*)\)/g)].map(m => m[1].replace(/\s+/g, ' ').trim()))
      .toEqual(['allowedProjectIds, { db, now: before.anchor }'])
    expect([...new Set([...helper.matchAll(/\.rpc\(\s*'(\w+)'/g)].map(m => m[1]))].sort())
      .toEqual(['survival_clock_invalid_at', 'survival_observation_anchor'])
    expect([...helper.matchAll(/await readAnchor\(db\)/g)]).toHaveLength(2)
    expect(helper).toMatch(/\nexport const COMMIT_BOUND_MAX_ATTEMPTS = 3\n/)
  })

  it('it accepts only equal vectors AND a closing anchor strictly before the deadline', () => {
    expect(helper).toMatch(/if \(!sameVector\(before\.vector, after\.vector\)\)/)
    expect(helper).toMatch(/if \(Date\.parse\(after\.anchor\) >= Date\.parse\(invalidAt\)\)/)
  })

  it('it records the M4 preconditions', () => {
    const prose = raw.replace(/\n\s*\*\s?/g, ' ').replace(/\s+/g, ' ')
    expect(prose).toContain('must reach survival_commit_fence() UNMODIFIED')
    expect(prose).toContain('single-statement transaction that calls the fence LAST and issues no SET CONSTRAINTS')
    expect(prose).toContain('M4 must use THIS observation (database-anchored)')
  })

  it('nothing at runtime imports the helper or calls the fence', () => {
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e)
        if (statSync(p).isDirectory()) { if (!['node_modules', '.next', 'qa'].includes(e)) walk(p) }
        else if (/\.(ts|tsx|mjs|js)$/.test(e) && !/\.test\.tsx?$/.test(e)
          && /commit-bound-observation['"]|observeSurvivalCommitBound\s*\(|survival_commit_fence/.test(tsCode(read(p)))) hits.push(p)
      }
    }
    for (const root of ['lib', 'app', 'scripts']) walk(join(APP, root))
    expect(hits).toEqual([join(APP, 'lib/atlas/survival/commit-bound-observation.ts')])
  })
})

describe('M3 did NOT widen runtime authority', () => {
  const licensed = Object.entries(AUTONOMY_RUNTIME_POLICY).filter(([, p]) => p.mode === 'licensed').map(([k]) => k)

  it('there are licensed kinds to test (the guard is not vacuous)', () => {
    expect(licensed.length).toBeGreaterThan(0)
  })

  it.each(licensed)('licensed kind %s is still refused with licensed_bind_not_serializable', async (kind) => {
    const r = await admitAutonomyAtBind(kind, '99999999-9999-4999-8999-999999999999')
    expect(r).toMatchObject({ admitted: false, reason: 'licensed_bind_not_serializable' })
  })

  it('bind.ts reads no M3 primitive', () => {
    const bind = tsCode(read(join(APP, 'lib/atlas/autonomy-runtime/bind.ts')))
    expect(bind).not.toMatch(/survival_commit_fence|commit-bound|survival_clock|survival_observation_anchor|stable-observation/)
    expect(bind).toMatch(/reason: 'licensed_bind_not_serializable'/)
  })

  it('no M4 primitive arrives with M3: no bind, run, licence, Decision or provenance object', () => {
    const code = m3Code.replace(/'[^']*'/g, "''").toLowerCase()   // code, not prose inside string literals
    for (const forbidden of ['bind_workflow', 'run_autonomy', 'public.runs', 'license', 'licence', 'atlas_decision', 'provenance', 'workflow_instances']) {
      expect(code, forbidden).not.toContain(forbidden)
    }
  })
})
