/**
 * Phase 3B1B2 · M1 — permanent guards.
 *
 * The real-PostgreSQL suite (`authority-serialization-m1-sql.test.ts`) proves
 * the primitives work. These guards make sure a future refactor cannot quietly
 * undo them, and that M1 itself widened no runtime authority:
 *
 *   - the database's lifecycle-advancing vocabulary IS TypeScript's
 *     `LIFECYCLE_ADVANCING` (and the ledger's own `one_advance` index list);
 *   - the decision head has no ordinary writer — only the ledger trigger;
 *   - the licence writer locks the workflow instance BEFORE any licence-lineage
 *     access, in its EFFECTIVE (last-applied) definition;
 *   - licensed binds stay fail-closed, and bind.ts reads no M1 primitive;
 *   - the exempt bind RPC is untouched;
 *   - no M2/M3/M4 primitive arrives with M1.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
// Any database access from the bind admission path would be a widening: fail loudly.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => { throw new Error('bind admission must not touch the database') },
}))

import { LIFECYCLE_ADVANCING } from '@/lib/atlas/decision-ledger/derive'
import { admitAutonomyAtBind } from '@/lib/atlas/autonomy-runtime/bind'
import { AUTONOMY_RUNTIME_POLICY } from '@/lib/atlas/autonomy-runtime/policy'

const APP = process.cwd()
const MIGRATIONS = join(APP, 'supabase/migrations')
const M1_FILE = '20261002140000_autonomy_authority_serialization.sql'
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const m1 = read(join(MIGRATIONS, M1_FILE))
const sqlCode = (s: string) => s.replace(/--[^\n]*/g, '')
const tsCode = (s: string) => s.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')

function quoted(list: string): string[] {
  return [...list.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort()
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

/** Production TypeScript (no tests, no generated types). */
function productionSources(): string[] {
  return ['lib', 'app', 'components'].flatMap(root => walk(join(APP, root)))
    .filter(f => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.replace(/\\/g, '/').includes('/lib/qa/')
      && !f.endsWith('database.types.ts'))
}

/** The body of one `create or replace function public.<name>(` statement, through its `$$;`. */
function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  expect(start, `${name} is defined`).toBeGreaterThanOrEqual(0)
  const open = sql.indexOf('$$', start)
  const close = sql.indexOf('$$;', open + 2)
  return sql.slice(open + 2, close)
}

// ── Vocabulary ──────────────────────────────────────────────────────────────

describe('lifecycle-advancing vocabulary: SQL == TypeScript, permanently', () => {
  it('the M1 head trigger vocabulary equals LIFECYCLE_ADVANCING exactly', () => {
    const block = /-- lifecycle-advancing:begin([\s\S]*?)-- lifecycle-advancing:end/.exec(m1)?.[1]
    expect(block, 'the delimited vocabulary block exists').toBeTruthy()
    expect(quoted(block!)).toEqual([...LIFECYCLE_ADVANCING].sort())
  })

  it('…and equals the Decision Ledger\'s own one_advance index list (one meaning, three places)', () => {
    const ledger = read(join(MIGRATIONS, '20260819_atlas_decision_ledger.sql'))
    const index = /create unique index if not exists atlas_decision_ledger_one_advance_idx[\s\S]*?where record_type in \(([\s\S]*?)\);/.exec(ledger)?.[1]
    expect(quoted(index!)).toEqual([...LIFECYCLE_ADVANCING].sort())
  })

  it('the vocabulary lives in ONE SQL function that every M1 consumer calls (no second list)', () => {
    const code = sqlCode(m1)
    // The only quoted lifecycle-type list in the migration's code is inside the function.
    expect(code.match(/'drafted'/g)).toHaveLength(1)
    for (const consumer of ['atlas_decision_lineage_head_advance', 'atlas_decision_lineage_heads']) {
      expect(code).toContain(consumer)
    }
    expect(functionBody(code, 'atlas_decision_lineage_head_advance')).toContain('public.atlas_decision_record_type_advances(new.record_type)')
    expect(code).toMatch(/check \(public\.atlas_decision_record_type_advances\(head_record_type\)\)/)
  })
})

// ── The head has no ordinary writer ─────────────────────────────────────────

describe('the decision head has exactly one writer: the ledger insert trigger', () => {
  it('no role is granted DML on the head; SELECT to service_role only', () => {
    const code = sqlCode(m1)
    expect(code).toMatch(/revoke all on table public\.atlas_decision_lineage_heads from public, anon, authenticated, service_role;/)
    expect(code).toMatch(/grant select on table public\.atlas_decision_lineage_heads to service_role;/)
    expect(code).not.toMatch(/grant\s+(insert|update|delete|truncate|all)[^;]*atlas_decision_lineage_heads/i)
  })

  it('outside the migration\'s backfill, only the trigger function inserts or updates heads', () => {
    const code = sqlCode(m1)
    const writes = [...code.matchAll(/(insert into|update)\s+public\.atlas_decision_lineage_heads/g)].map(m => m.index!)
    const trigger = code.indexOf('create or replace function public.atlas_decision_lineage_head_advance()')
    const triggerEnd = code.indexOf('$$;', code.indexOf('$$', trigger) + 2)
    const backfill = code.indexOf('do $backfill$')
    const backfillEnd = code.indexOf('$backfill$;', backfill + 1)
    for (const at of writes) {
      expect((at > trigger && at < triggerEnd) || (at > backfill && at < backfillEnd), `stray head write at ${at}`).toBe(true)
    }
    expect(writes.length).toBe(3)                                   // backfill insert, trigger insert, trigger update
  })

  it('no production TypeScript reads or writes the head (M1 is inert: nothing consumes it yet)', () => {
    const touching = productionSources().filter(f => tsCode(read(f)).includes('atlas_decision_lineage_heads'))
    expect(touching).toEqual([])
  })

  it('the maintenance trigger is AFTER INSERT on the ledger, SECURITY DEFINER, with a pinned search_path', () => {
    expect(m1).toMatch(/create trigger atlas_decision_lineage_head_advance\s+after insert on public\.atlas_decision_ledger\s+for each row/)
    const header = m1.slice(m1.indexOf('create or replace function public.atlas_decision_lineage_head_advance()'))
    expect(header.slice(0, 200)).toMatch(/security definer\s+set search_path = ''/)
  })
})

// ── Licence writer lock order ───────────────────────────────────────────────

describe('licence writer: workflow instance FIRST, in the effective definition', () => {
  it('the effective writer is M1\'s body: the only later definition (M4-A) is M1 + ONE marked Decision-head block', () => {
    const M4A_FILE = '20261004100000_m4a_licensed_authority_substrate.sql'
    const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
    const defining = files.filter(f => sqlCode(read(join(MIGRATIONS, f))).includes('create or replace function public.autonomy_license_append('))
    expect(defining.slice(defining.indexOf(M1_FILE) + 1)).toEqual([M4A_FILE])
    // Byte-level: removing the M4-A block (and the one variable it declares) from the
    // M4-A definition gives back the M1 definition EXACTLY, so every M1 property in this
    // file still describes the effective writer.
    const m4a = functionBody(read(join(MIGRATIONS, M4A_FILE)), 'autonomy_license_append')
    const start = m4a.indexOf('\n  -- ── Phase 3B1B2 M4-A: an ISSUED act serializes on the CURRENT Decision')
    const tail = "      raise exception\n        'the pinned decision act is not the current lifecycle head of decision % (stale observation)',\n        p_decision_id using errcode = '40001';\n    end if;\n  end if;\n"
    const end = m4a.indexOf(tail, start) + tail.length
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start + tail.length)
    const stripped = (m4a.slice(0, start) + m4a.slice(end)).replace('  v_head         public.atlas_decision_lineage_heads;\n', '')
    expect(stripped).toBe(functionBody(m1, 'autonomy_license_append'))
  })

  it('the instance FOR UPDATE precedes every read or lock of licence-lineage or Decision truth', () => {
    // From `begin`: the `declare` section names the licence table only as a ROW TYPE.
    const full = sqlCode(functionBody(m1, 'autonomy_license_append'))
    const body = full.slice(full.indexOf('\nbegin\n'))
    expect(body.length).toBeLessThan(full.length)
    const lock = body.search(/perform 1 from public\.workflow_instances\s+where id = p_workflow_instance_id\s+for no key update;/)
    expect(lock, 'the instance lock exists').toBeGreaterThan(0)
    for (const table of ['public.atlas_autonomy_license_events', 'public.atlas_decision_ledger']) {
      expect(body.indexOf(table), `${table} is first touched after the instance lock`).toBeGreaterThan(lock)
    }
    // Before the lock there are only pure argument checks: no SELECT, PERFORM or INSERT.
    expect(body.slice(0, lock)).not.toMatch(/\b(select|perform|insert|update)\b/i)
  })

  it('apart from that one block, the function body is the merged Phase 2C body, unchanged', () => {
    const phase2c = read(join(MIGRATIONS, '20260924180000_autonomy_license_phase2c.sql'))
    const block = /  -- ── Phase 3B1B2 M1: the workflow instance is locked FIRST[\s\S]*?   for no key update;\n\n/.exec(m1)?.[0]
    expect(block).toBeTruthy()
    expect(functionBody(m1, 'autonomy_license_append').replace(block!, '')).toBe(functionBody(phase2c, 'autonomy_license_append'))
  })

  it('the instance lock is EXACTLY FOR NO KEY UPDATE — the minimum mode that still conflicts with a bind\'s FOR UPDATE', () => {
    const body = sqlCode(functionBody(m1, 'autonomy_license_append'))
    const instanceLocks = [...body.matchAll(/from public\.workflow_instances\s+where id = p_workflow_instance_id\s+for ([a-z ]+);/g)].map(m => m[1])
    // Not weaker (key share / share would not serialize two licence writers),
    // not stronger (update would queue behind every FK child insert).
    expect(instanceLocks).toEqual(['no key update'])
  })

  it('privileges are restated exactly: service_role may execute, client roles may not', () => {
    expect(m1).toMatch(/revoke all on function public\.autonomy_license_append\([\s\S]*?\) from public, anon, authenticated;/)
    expect(m1).toMatch(/grant execute on function public\.autonomy_license_append\([\s\S]*?\) to service_role;/)
  })
})

// ── Licensed binds stay OFF ─────────────────────────────────────────────────

describe('M1 did NOT widen runtime authority', () => {
  const licensed = Object.entries(AUTONOMY_RUNTIME_POLICY).filter(([, p]) => p.mode === 'licensed').map(([k]) => k)

  it('there are licensed kinds to test (the guard is not vacuous)', () => {
    expect(licensed.length).toBeGreaterThan(0)
  })

  it.each(licensed)('licensed kind %s is still refused with licensed_bind_not_serializable, touching no database', async (kind) => {
    const r = await admitAutonomyAtBind(kind, '99999999-9999-4999-8999-999999999999')
    expect(r).toMatchObject({ admitted: false, reason: 'licensed_bind_not_serializable' })
  })

  it('bind.ts reads no M1 primitive, no licence and no Decision Ledger', () => {
    const bind = tsCode(read(join(APP, 'lib/atlas/autonomy-runtime/bind.ts')))
    expect(bind).not.toMatch(/atlas_decision_lineage_heads|decision-ledger|autonomy-license\/(store|resolve|issue)|createAdminClient|\.rpc\(|\.from\(/)
    expect(bind).toMatch(/reason: 'licensed_bind_not_serializable'/)
  })

  it('the exempt bind RPC is untouched by M1, and no licensed bind RPC exists', () => {
    const code = sqlCode(m1)
    expect(code).not.toMatch(/bind_workflow_action_run|run_autonomy_decisions|runs_require_bind_provenance/)
    const all = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql'))
      .map(f => sqlCode(read(join(MIGRATIONS, f)))).join('\n')
    // M4-A adds the licensed-bind SUBSTRATE (conservative predicates and the commit-time
    // deadline) — none of them binds anything. A licensed BIND function is M4-B.
    const SUBSTRATE = ['licensed_bind_v1_supported', 'licensed_bind_v1_decision_proof', 'licensed_bind_v1_licence_proof',
      'licensed_bind_v1_survival_proof', 'licensed_bind_authority_recheck', 'licensed_bind_register_authority_deadline']
    const named = [...all.matchAll(/create or replace function public\.(\w*licensed\w*bind\w*)\(/gi)].map(m => m[1])
    expect(named.filter(n => !SUBSTRATE.includes(n))).toEqual([])
  })

  it('no M2/M3/M4 primitive sneaks into M1 (Survival, commit clock/fence, prepared-txn guard, licensed provenance)', () => {
    const code = sqlCode(m1).toLowerCase()
    for (const forbidden of ['survival', 'clock_timestamp', 'statement_timestamp', 'txid_current', 'pg_prepared_xacts',
      'prepare transaction', 'epoch', 'fence', 'runs', 'license_provenance', 'proof_governed_effect']) {
      expect(code, forbidden).not.toMatch(new RegExp(`\\b${forbidden}\\b`))
    }
  })
})
