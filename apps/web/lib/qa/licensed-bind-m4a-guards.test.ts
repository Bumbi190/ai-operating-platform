/**
 * Phase 3B1B2 · M4-A — permanent static guards.
 *
 * The real-PostgreSQL suites prove the substrate works and that every V1
 * predicate is ONE-WAY safe (DB_ALLOWS ⇒ CANONICAL_TS_ALLOWS). These guards stop
 * a later edit from quietly undoing the conditions those proofs rely on:
 *
 *   - the SQL V1 supported set is exactly the TS policy's licensed set (one kind,
 *     its minimum level) and carries the canonical fingerprint per placement;
 *   - every SQL margin is STRICTLY on the refusing side of the canonical Survival
 *     threshold it stands in for (headroom 0.11 > 0.10, runway 4 > 3 days, the
 *     burn window one second LONGER than the TS window);
 *   - the predicates are named and described as admissible SUBSETS, never as the
 *     canonical state;
 *   - the only clocks are the caller's `p_at` and clock_timestamp();
 *   - nothing in M4-A binds, schedules, runs, or defers constraints by hand;
 *   - every M4-A primitive is internal; the Decision ledger has no direct INSERT;
 *   - the Decision store writes through the append boundary;
 *   - the parity suite keeps its one-way assertions;
 *   - the canonical thresholds keep their approved values AND equality semantics.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { AUTONOMY_RUNTIME_POLICY } from '@/lib/atlas/autonomy-runtime/policy'
import { fingerprintFor } from '@/lib/atlas/autonomy-license/scope'
import { ACTION_REGISTRY, type ActionKind } from '@/lib/workflows/action-registry'
import {
  deriveSurvivalState,
  CRITICAL_HEADROOM_FRACTION,
  CONSERVE_HEADROOM_FRACTION,
  EXPAND_MIN_HEADROOM_FRACTION,
  RUNWAY_CRITICAL_DAYS,
  RUNWAY_CONSERVE_DAYS,
  EXPAND_MIN_RUNWAY_DAYS,
  SURVIVAL_THRESHOLD_STATUS,
} from '@/lib/atlas/survival/derive'
import { BURN_WINDOW_DAYS } from '@/lib/atlas/survival/snapshot'
import { survivalCeiling } from '@/lib/atlas/survival/ceiling'
import type { BudgetScopeReading, SurvivalInput } from '@/lib/atlas/survival/types'

const APP = process.cwd()
const MIGRATIONS = join(APP, 'supabase/migrations')
const M4A_FILE = '20261004100000_m4a_licensed_authority_substrate.sql'
const THRESHOLD_FILE = '20261004090000_survival_threshold_status_canonical.sql'
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const sqlCode = (s: string) => s.replace(/--[^\n]*/g, '')
const tsCode = (s: string) => s.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')
const m4a = read(join(MIGRATIONS, M4A_FILE))
const m4aCode = sqlCode(m4a)
const MIGRATION_FILES = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()

function body(code: string, fn: string): string {
  const m = new RegExp(`create or replace function public\\.${fn}\\(([\\s\\S]*?)\\$\\$([\\s\\S]*?)\\$\\$`, 'i').exec(code)
  return m ? m[2] : ''
}
const SUPPORTED = body(m4aCode, 'licensed_bind_v1_supported')
const DECISION = body(m4aCode, 'licensed_bind_v1_decision_proof')
const LICENCE = body(m4aCode, 'licensed_bind_v1_licence_proof')
const SURVIVAL = body(m4aCode, 'licensed_bind_v1_survival_proof')
const RECHECK = body(m4aCode, 'licensed_bind_authority_recheck')
const REGISTER = body(m4aCode, 'licensed_bind_register_authority_deadline')
const APPEND = body(m4aCode, 'atlas_decision_ledger_append')
const PREDICATES = { DECISION, LICENCE, SURVIVAL }
const M4A_FUNCTIONS = { SUPPORTED, DECISION, LICENCE, SURVIVAL, RECHECK, REGISTER, APPEND }

describe('M4-A V1 supported set = the TS policy, exactly', () => {
  const block = /-- licensed-bind-v1-supported:begin\n([\s\S]*?)\n\s*-- licensed-bind-v1-supported:end/.exec(m4a)
  const rows = block
    ? [...block[1].matchAll(/select '([^']+)'::text, '([^']+)'::text, '([^']+)'::text,\s*'([0-9a-f]{64})'::text/g)]
        .map(m => ({ kind: m[1], level: m[2], defKey: m[3], fp: m[4] }))
    : []

  it('the marked block exists and lists at least one row', () => {
    expect(block).not.toBeNull()
    expect(rows.length).toBeGreaterThan(0)
  })

  it('the SQL kinds are EXACTLY the TS licensed kinds, at the TS minimum level', () => {
    const licensed = Object.entries(AUTONOMY_RUNTIME_POLICY)
      .filter(([, p]) => p.mode === 'licensed')
      .map(([k, p]) => ({ kind: k, level: (p as { minimumLevel: string }).minimumLevel }))
    // A new licensed kind fails here until a reviewed migration admits it.
    expect(licensed).toEqual([{ kind: 'proof_governed_effect', level: 'L3' }])
    expect([...new Set(rows.map(r => r.kind))].sort()).toEqual(licensed.map(l => l.kind).sort())
    for (const r of rows) expect(r.level).toBe(licensed.find(l => l.kind === r.kind)!.level)
  })

  it('one row per registry placement, each carrying the canonical fingerprintFor([kind], def_key)', () => {
    for (const kind of new Set(rows.map(r => r.kind))) {
      const defKeys = [...new Set(ACTION_REGISTRY[kind as ActionKind].placements.map(p => p.def_key))].sort()
      expect(rows.filter(r => r.kind === kind).map(r => r.defKey).sort()).toEqual(defKeys)
    }
    for (const r of rows) expect(r.fp).toBe(fingerprintFor([r.kind], r.defKey))
  })

  it('the licence predicate takes kind, def_key and fingerprint FROM the supported set — never a literal of its own', () => {
    expect(LICENCE).toMatch(/public\.licensed_bind_v1_supported\(\)/)
    expect(LICENCE).not.toMatch(/'proof_governed_effect'|'omnira\.execution-proof'|'[0-9a-f]{64}'/)
  })
})

describe('M4-A Survival margins sit strictly on the REFUSING side of the canonical thresholds', () => {
  it('headroom: every row >= 0.11 × limit, and 0.11 > CRITICAL_HEADROOM_FRACTION', () => {
    const m = /h\.remaining_sek >= ([0-9.]+) \* h\.limit_sek/.exec(SURVIVAL)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBeGreaterThan(CRITICAL_HEADROOM_FRACTION)
    expect(SURVIVAL).toMatch(/h\.limit_sek > 0 and h\.remaining_sek > 0/)
    expect(SURVIVAL).toMatch(/h\.limit_sek <> 'NaN'::numeric and h\.remaining_sek <> 'NaN'::numeric/)
    // EVERY row — a count of bad rows, not a min/first/binding pick.
    expect(SURVIVAL).toMatch(/if v_bad > 0 then/)
  })

  it('runway: funding >= 4 × burn upper bound, and 4 > RUNWAY_CRITICAL_DAYS', () => {
    const m = /v_funding < ([0-9.]+) \* v_burn_upper/.exec(SURVIVAL)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBeGreaterThan(RUNWAY_CRITICAL_DAYS)
  })

  it('burn: a window strictly LONGER than the TS window, every cost at max(cost, 0), divided by the TS window', () => {
    const m = /c\.created_at >= p_at - interval '(\d+) hours' - interval '1 second'/.exec(SURVIVAL)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBe(BURN_WINDOW_DAYS * 24)
    expect(SURVIVAL).toMatch(/greatest\(coalesce\(c\.cost_sek, 0\), 0\)/)
    expect(SURVIVAL).toMatch(/greatest\(coalesce\(r\.estimated_sek, 0\), 0\)/)
    expect(SURVIVAL).toMatch(new RegExp(`v_burn_upper := \\(v_recorded \\+ v_pending\\) / ${BURN_WINDOW_DAYS};`))
  })

  it('funding: NaN and <= 0 refuse; a missing row refuses; NULL is the UNDECLARED floor', () => {
    expect(SURVIVAL).toMatch(/if v_found is null then\s*return query select false, 'funding_unavailable'/)
    expect(SURVIVAL).toMatch(/if v_funding = 'NaN'::numeric or v_funding <= 0 then/)
  })

  it('reads no caller-supplied state: the only parameter is the instant', () => {
    expect(m4aCode).toMatch(/create or replace function public\.licensed_bind_v1_survival_proof\(p_at timestamptz\)/)
  })
})

describe('M4-A predicates are SUBSETS, never the canonical state', () => {
  it.each(Object.entries(PREDICATES))('%s returns (admissible, reason, …) and never a state/ceiling/level verdict', (_n, b) => {
    expect(b.length).toBeGreaterThan(50)
    expect(b).not.toMatch(/'(EXPAND|NORMAL|CONSERVE|CRITICAL|HIBERNATE)'/)
    expect(b).not.toMatch(/\b(survival_state|ceiling|is_governing|governs)\b/i)
  })

  it('every success reason names the V1 subset it proved', () => {
    const successes = [...m4aCode.matchAll(/select true, '([a-z0-9_]+)'::text/g)].map(m => m[1])
    expect(successes.length).toBeGreaterThan(0)
    for (const r of successes) expect(r).toMatch(/^v1_/)
  })

  it('the header comment calls them admissible subsets and states the one-way contract', () => {
    expect(m4a).toMatch(/V1 admissible subset/)
    expect(m4a).toMatch(/DB_ALLOWS\s+=>\s+CANONICAL_TYPESCRIPT_ALLOWS/)
    expect(m4a).toMatch(/deliberately INCOMPLETE SAFE SUBSETS/)
  })
})

describe('M4-A clocks: only the caller instant and clock_timestamp()', () => {
  it.each(Object.entries(M4A_FUNCTIONS))('%s uses no transaction/statement-start clock', (_n, b) => {
    expect(b.length).toBeGreaterThan(20)
    expect(b).not.toMatch(/\bnow\s*\(|current_timestamp|transaction_timestamp|statement_timestamp|localtimestamp|current_date|current_time\b/i)
  })

  it('the predicates read no clock at all — the instant is a parameter', () => {
    for (const b of Object.values(PREDICATES)) expect(b).not.toMatch(/clock_timestamp/)
  })

  it('the deadline is refused at equality, at registration and at commit', () => {
    expect(REGISTER).toMatch(/if pg_catalog\.clock_timestamp\(\) >= p_authority_invalid_at then/)
    expect(RECHECK).toMatch(/if pg_catalog\.clock_timestamp\(\) >= new\.authority_invalid_at then/)
    expect(m4aCode).toMatch(/deferrable initially deferred/i)
  })
})

describe('M4-A is substrate only: nothing binds, schedules or self-starts', () => {
  it('no SET CONSTRAINTS, no cron, no bind, no run, no fence call', () => {
    expect(m4aCode).not.toMatch(/set\s+constraints/i)
    expect(m4aCode).not.toMatch(/\bcron\b|pg_cron|net\.http|pg_net/i)
    expect(m4aCode).not.toMatch(/survival_commit_fence\s*\(/i)
    expect(m4aCode).not.toMatch(/autonomy_runtime_bind|workflow_runs|insert into public\.(run|workflow)/i)
    expect(m4aCode).not.toMatch(/create (or replace )?function public\.[a-z_]*licensed_bind\s*\(/i)
  })

  it('no licence, Decision or licensed action is CREATED by the migration', () => {
    // Function bodies (the append boundaries) legitimately INSERT; top-level
    // statements — what the migration itself executes — must not.
    const topLevel = m4aCode.replace(/\$\$[\s\S]*?\$\$/g, '$$$$')
    expect(topLevel).not.toMatch(/insert into|update public\.|delete from/i)
    expect(topLevel).not.toMatch(/^\s*select public\.(atlas_decision_ledger_append|autonomy_license_append)\(/im)
  })

  it('every predicate and the deadline machinery is executable by NO API role', () => {
    for (const fn of ['licensed_bind_v1_supported', 'licensed_bind_v1_decision_proof', 'licensed_bind_v1_licence_proof',
      'licensed_bind_v1_survival_proof', 'licensed_bind_authority_recheck', 'licensed_bind_register_authority_deadline']) {
      expect(m4aCode).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\)\\s*from public, anon, authenticated, service_role;`))
      expect(m4aCode).not.toMatch(new RegExp(`grant [a-z, ]+ on function public\\.${fn}\\(`, 'i'))
    }
    expect(m4aCode).toMatch(/revoke all on table public\.licensed_bind_authority_intents from public, anon, authenticated, service_role;/)
    expect(m4aCode).not.toMatch(/grant [a-z, ]+ on table public\.licensed_bind_authority_intents/i)
  })

  it('every M4-A function is SECURITY DEFINER-safe: search_path pinned to empty', () => {
    const headers = [...m4aCode.matchAll(/create or replace function public\.([a-z_0-9]+)\(([\s\S]*?)\$\$/g)]
    expect(headers.length).toBeGreaterThanOrEqual(8)
    for (const h of headers) expect(h[2], h[1]).toMatch(/set search_path (=|to) ''/)
  })
})

describe('M4-A Decision closure: the append boundary is the only writer', () => {
  it('direct DML on the ledger is revoked from every API role; service_role keeps SELECT only', () => {
    expect(m4aCode).toMatch(/revoke all on table public\.atlas_decision_ledger from public, anon, authenticated, service_role;/)
    expect(m4aCode).toMatch(/grant select on table public\.atlas_decision_ledger to service_role;/)
    expect(m4aCode).not.toMatch(/grant (insert|update|delete|all)[a-z, ]* on table public\.atlas_decision_ledger/i)
  })

  it('the append boundary locks the head and checks generation continuity', () => {
    expect(APPEND).toMatch(/from public\.atlas_decision_lineage_heads[\s\S]*?for update/)
    expect(APPEND).toMatch(/errcode = '40001'/)
  })

  it('the TS Decision store writes through the RPC, never a table insert', () => {
    const src = tsCode(read(join(APP, 'lib/atlas/decision-ledger/store.ts')))
    expect(src).toMatch(/\.rpc\(\s*'atlas_decision_ledger_append'/)
    expect(src).not.toMatch(/from\(\s*'atlas_decision_ledger'\s*\)\s*\.(insert|upsert|update|delete)/)
  })

  it('the licence ISSUED path serializes on the CURRENT Decision head (M1 lock order: instance → head)', () => {
    const lic = body(m4aCode, 'autonomy_license_append')
    const instanceLock = lic.search(/from public\.workflow_instances[\s\S]*?for update/)
    const headLock = lic.search(/from public\.atlas_decision_lineage_heads\s*where decision_id = p_decision_id\s*for share/)
    expect(instanceLock).toBeGreaterThan(-1)
    expect(headLock).toBeGreaterThan(instanceLock)
    expect(lic).toMatch(/v_head\.head_record_id <> p_decision_record_id/)
  })
})

describe('M4-A parity suite keeps its one-way contract', () => {
  const src = read(join(APP, 'lib/qa/licensed-bind-v1-parity-sql.test.ts'))

  it('asserts zero DB_ALLOW && TS_REFUSE, the presence of both-allow, and the presence of false refusals', () => {
    expect(src).toMatch(/DB_ALLOW&&TS_REFUSE/)
    expect(src).toMatch(/const violations = outcomes\.filter\(o => o\.db && !o\.ts\)/)
    expect(src.match(/expect\(violations\.map\([^\n]*\)\.toEqual\(\[\]\)/g)).toHaveLength(3)
    expect(src.match(/expect\(bothAllow\.length\)\.toBeGreaterThan\(\d+\)/g)).toHaveLength(3)
    expect(src.match(/expect\(falseRefusals\.length\)\.toBeGreaterThan\(\d+\)/g)).toHaveLength(3)
  })

  it('covers all three predicates', () => {
    for (const fn of ['licensed_bind_v1_decision_proof', 'licensed_bind_v1_licence_proof', 'licensed_bind_v1_survival_proof']) {
      expect(src).toContain(fn)
    }
  })
})

// ─── Canonical Survival v1 thresholds (owner-approved 2026-10-04) ────────────

function scope(remainingSek: number, limitSek = 1000): BudgetScopeReading {
  return { projectId: 'p1', slug: 's', scope: 'global_monthly', limitSek, spentSek: limitSek - remainingSek, heldSek: 0, remainingSek }
}
function input(over: Partial<SurvivalInput> = {}): SurvivalInput {
  return {
    scopes: [scope(900)],
    reads: { budgets: true, burn: true, revenue: true },
    burnSekPerDay: 1,
    funding: { kind: 'KNOWN', declaredFundingSek: 1000 },
    runwayCoverage: 'PLATFORM_COMPLETE',
    revenueTrendSek: 12,
    operatingPaused: false,
    ...over,
  }
}
const state = (over: Partial<SurvivalInput>) => deriveSurvivalState(input(over), { at: '2026-10-04T12:00:00.000Z' }).state

describe('canonical Survival v1 thresholds — values and EQUALITY semantics are pinned', () => {
  it('the six approved values, status canonical', () => {
    expect(SURVIVAL_THRESHOLD_STATUS).toBe('canonical')
    expect([CRITICAL_HEADROOM_FRACTION, CONSERVE_HEADROOM_FRACTION, EXPAND_MIN_HEADROOM_FRACTION]).toEqual([0.10, 0.35, 0.50])
    expect([RUNWAY_CRITICAL_DAYS, RUNWAY_CONSERVE_DAYS, EXPAND_MIN_RUNWAY_DAYS]).toEqual([3, 14, 60])
  })

  it('headroom: exactly 0.10 is NOT critical; just below is', () => {
    expect(state({ scopes: [scope(100)] })).toBe('CONSERVE')
    expect(state({ scopes: [scope(99.99)] })).toBe('CRITICAL')
  })

  it('headroom: exactly 0.35 is NOT conserve; just below is', () => {
    expect(state({ scopes: [scope(350)] })).not.toBe('CONSERVE')
    expect(state({ scopes: [scope(349.99)] })).toBe('CONSERVE')
  })

  it('runway: exactly 3 days is NOT critical; just below is', () => {
    expect(state({ funding: { kind: 'KNOWN', declaredFundingSek: 30 }, burnSekPerDay: 10 })).toBe('CONSERVE')
    expect(state({ funding: { kind: 'KNOWN', declaredFundingSek: 29.99 }, burnSekPerDay: 10 })).toBe('CRITICAL')
  })

  it('runway: exactly 14 days is NOT conserve; just below is', () => {
    expect(state({ funding: { kind: 'KNOWN', declaredFundingSek: 140 }, burnSekPerDay: 10 })).not.toBe('CONSERVE')
    expect(state({ funding: { kind: 'KNOWN', declaredFundingSek: 139.99 }, burnSekPerDay: 10 })).toBe('CONSERVE')
  })

  it('EXPAND needs BOTH 0.50 headroom and 60 days runway (inclusive); just below either is not EXPAND', () => {
    const expand = { scopes: [scope(500)], funding: { kind: 'KNOWN' as const, declaredFundingSek: 600 }, burnSekPerDay: 10 }
    expect(state(expand)).toBe('EXPAND')
    expect(state({ ...expand, scopes: [scope(499.99)] })).not.toBe('EXPAND')
    expect(state({ ...expand, funding: { kind: 'KNOWN', declaredFundingSek: 599.99 } })).not.toBe('EXPAND')
  })

  it('the SQL recorder accepts canonical only for policy v2, and the old provisional writer keeps working', () => {
    const t = sqlCode(read(join(MIGRATIONS, THRESHOLD_FILE)))
    expect(t).toMatch(/'canonical'/)
    expect(t).toMatch(/'provisional'/)
    expect(t).not.toMatch(/set constraints|cron/i)
  })

  it('Survival only LOWERS: no state\'s ceiling is ever the reason an action is admitted', () => {
    // The ceiling is an upper bound composed by min(); this is the bound itself.
    for (const s of ['EXPAND', 'NORMAL', 'CONSERVE', 'CRITICAL', 'HIBERNATE'] as const) {
      expect(['L0', 'L1', 'L3', 'L6']).toContain(survivalCeiling(s))
    }
    // The licence predicate's admission requires a licence; Survival's predicate
    // alone has no path that names a level or a licence.
    expect(SURVIVAL).not.toMatch(/licen[cs]e|\bL[0-6]\b/i)
  })
})

describe('M4-A ships no new runtime consumer', () => {
  it('no TS module outside the QA suites names a licensed_bind_* function', () => {
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(e.name) && !p.includes(join('lib', 'qa'))) {
          if (/licensed_bind_(v1_|authority_|register_)/.test(read(p))) hits.push(p)
        }
      }
    }
    for (const d of ['lib', 'app']) walk(join(APP, d))
    expect(hits).toEqual([])
  })

  it('MIGRATION_FILES lists M4-A after the threshold migration', () => {
    expect(MIGRATION_FILES.indexOf(M4A_FILE)).toBeGreaterThan(MIGRATION_FILES.indexOf(THRESHOLD_FILE))
    expect(MIGRATION_FILES.indexOf(THRESHOLD_FILE)).toBeGreaterThan(-1)
  })
})
