/**
 * lib/qa/spend-advisory-override.test.ts — Phase 2B-3C.
 *
 * Making "this call proceeded ONLY because enforcement is off" observable,
 * without making it matter.
 *
 * The two properties under test pull in opposite directions and both must hold:
 * a row is written exactly when the runtime verdict says the refusal was
 * overridden, and NOTHING about the recording — including its total failure —
 * may change whether the provider is called.
 *
 * No network, no provider, no database. The reservation verdict and the admin
 * client are both replaced, so every case below is a pure decision test.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── The two seams under the boundary ────────────────────────────────────────
const reserveSpy = vi.fn()
const inserted: { table: string; row: Record<string, unknown> }[] = []
let insertBehaviour: 'ok' | 'error' | 'throw' = 'ok'

vi.mock('@/lib/cost/budget-gate', async orig => ({
  ...(await orig<typeof import('@/lib/cost/budget-gate')>()),
  reserveSpend: (...a: unknown[]) => reserveSpy(...a),
  settleSpend: async () => {},
  releaseSpend: async () => {},
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        if (insertBehaviour === 'throw') throw new Error('connection reset')
        inserted.push({ table, row })
        return insertBehaviour === 'error' ? { error: { message: 'insert refused' } } : { error: null }
      },
    }),
    // `withGovernedSpend` resolves the project and the stop decision through the
    // same client; both are answered permissively so the only thing under test
    // is the override recording.
    rpc: async () => ({ data: null, error: null }),
  }),
}))

vi.mock('@/lib/governance/execution-stop', async orig => ({
  ...(await orig<typeof import('@/lib/governance/execution-stop')>()),
  resolveExecutionStopForContract: async () => ({ allowed: true, reason: null }),
}))

const { withGovernedSpend, SpendRefusedError } = await import('@/lib/cost/governed-spend')
const { recordAdvisoryOverride } = await import('@/lib/cost/advisory-override')
const { GLOBAL_ONLY } = await import('@/lib/governance/execution-stop')

const PROJECT = '00000000-0000-4000-8000-0000000000b1'

/** A verdict as `verdict()` in budget-gate.ts would build it. */
function verdictOf(wouldAllow: boolean, enforced: boolean, reason: string, over: Record<string, unknown> = {}) {
  return {
    allowed: wouldAllow || !enforced,
    wouldAllow,
    advisoryOverride: !wouldAllow && !enforced,
    reason,
    reservationId: wouldAllow ? 'res-1' : null,
    budgetSek: 700, committedSek: 51.74, reservedSek: 0, headroomSek: 648.26,
    bindingScope: wouldAllow ? null : 'project_monthly',
    ...over,
  }
}

const input = (over: Record<string, unknown> = {}) => ({
  project: { projectId: PROJECT },
  execution: { context: 'AUTONOMOUS' as const, scope: GLOBAL_ONLY },
  provider: 'anthropic',
  operation: 'Write Article',
  estimatedSek: 0.1024,
  ...over,
})

const overrideRows = () => inserted.filter(i => i.table === 'spend_advisory_overrides')

beforeEach(() => {
  reserveSpy.mockReset(); inserted.length = 0; insertBehaviour = 'ok'
})

// ── A. When a row is written, and when it is not ────────────────────────────

describe('A. a row means exactly one thing', () => {
  it('A1 — an ALLOWED reservation records no override', async () => {
    reserveSpy.mockResolvedValue(verdictOf(true, false, 'ok'))
    const out = await withGovernedSpend(input(), async () => 'called')
    expect(out).toBe('called')
    expect(overrideRows()).toHaveLength(0)
  })

  it('A2 — wouldAllow=false + not enforced records exactly ONE override, and dispatches', async () => {
    reserveSpy.mockResolvedValue(verdictOf(false, false, 'budget_exceeded'))
    const out = await withGovernedSpend(input(), async () => 'called')
    // The whole point: the call still happened.
    expect(out).toBe('called')
    expect(overrideRows()).toHaveLength(1)
  })

  it('A3 — wouldAllow=false + ENFORCED is a hard refusal with NO override row', async () => {
    reserveSpy.mockResolvedValue(verdictOf(false, true, 'budget_exceeded'))
    let ran = false
    await expect(withGovernedSpend(input(), async () => { ran = true; return 'x' }))
      .rejects.toThrow(SpendRefusedError)
    expect(ran).toBe(false)
    // An enforced refusal is not an override. Recording one would make the
    // measurement claim enforcement was off when it was on.
    expect(overrideRows()).toHaveLength(0)
  })

  it('A3b — the recorder itself refuses a non-override verdict, called directly', async () => {
    // Behavioural, not a source scan: the guard is proved by calling it with a
    // verdict that is allowed and with one that is an enforced refusal. Neither
    // is an override, and neither may write.
    await recordAdvisoryOverride({
      projectId: PROJECT, provider: 'anthropic', operation: 'Write Article',
      estimatedSek: 0.1, verdict: verdictOf(true, false, 'ok') as never,
    })
    await recordAdvisoryOverride({
      projectId: PROJECT, provider: 'anthropic', operation: 'Write Article',
      estimatedSek: 0.1, verdict: verdictOf(false, true, 'budget_exceeded') as never,
    })
    expect(overrideRows()).toHaveLength(0)
    // And it DOES write for a real override, so the two assertions above are
    // not passing because the recorder is simply broken.
    await recordAdvisoryOverride({
      projectId: PROJECT, provider: 'anthropic', operation: 'Write Article',
      estimatedSek: 0.1, verdict: verdictOf(false, false, 'budget_exceeded') as never,
    })
    expect(overrideRows()).toHaveLength(1)
  })

  it('A4 — one decision writes at most one row', async () => {
    reserveSpy.mockResolvedValue(verdictOf(false, false, 'budget_exceeded'))
    await withGovernedSpend(input(), async () => 'called')
    expect(overrideRows()).toHaveLength(1)
    // And a second, separate decision writes its own — not a duplicate of the first.
    await withGovernedSpend(input({ operation: 'Analyze News' }), async () => 'called')
    expect(overrideRows()).toHaveLength(2)
    expect(overrideRows().map(r => r.row.operation)).toEqual(['Write Article', 'Analyze News'])
  })
})

// ── B. The recorded facts ───────────────────────────────────────────────────

describe('B. every field the re-audit needs', () => {
  it('B1 — reason is preserved verbatim, for every refusal in the vocabulary', async () => {
    const REASONS = ['budget_exceeded', 'no_budget_configured', 'no_global_budget_configured',
                     'invalid_estimate', 'unavailable', 'replay_in_flight', 'replay_stale',
                     'replay_identity_mismatch', 'replay_settled', 'replay_released']
    for (const reason of REASONS) {
      inserted.length = 0
      reserveSpy.mockResolvedValue(verdictOf(false, false, reason))
      await withGovernedSpend(input(), async () => 'called')
      expect(overrideRows(), reason).toHaveLength(1)
      expect(overrideRows()[0].row.reason, reason).toBe(reason)
    }
  })

  it('B2 — project, operation, provider and estimate are preserved', async () => {
    reserveSpy.mockResolvedValue(verdictOf(false, false, 'budget_exceeded'))
    await withGovernedSpend(input(), async () => 'called')
    const r = overrideRows()[0].row
    expect(r.project_id).toBe(PROJECT)
    expect(r.operation).toBe('Write Article')
    expect(r.provider).toBe('anthropic')
    expect(r.estimated_sek).toBe(0.1024)
  })

  it('B3 — the deciding ceiling and its headroom travel with the row', async () => {
    reserveSpy.mockResolvedValue(verdictOf(false, false, 'budget_exceeded'))
    await withGovernedSpend(input(), async () => 'called')
    const r = overrideRows()[0].row
    expect(r.binding_scope).toBe('project_monthly')
    expect(r.budget_sek).toBe(700)
    expect(r.headroom_sek).toBe(648.26)
  })

  it('B4 — a REPLAY override is distinguishable, and names the other reservation', async () => {
    reserveSpy.mockResolvedValue(
      verdictOf(false, false, 'replay_in_flight', { reservationId: 'someone-elses' }))
    await withGovernedSpend(input({ idempotencyKey: 'intent-42' }), async () => 'called')
    const r = overrideRows()[0].row
    expect(r.reason).toBe('replay_in_flight')
    expect(r.idempotency_key).toBe('intent-42')
    // The id belongs to a reservation this call did not create — worth knowing.
    expect(r.reservation_id).toBe('someone-elses')
  })

  it('B5 — an UNAVAILABLE override is distinguishable, and carries no invented numbers', async () => {
    // The gate could not be consulted: no scope decided, no headroom known. This
    // is the shape the historical Write Article cluster would have produced.
    reserveSpy.mockResolvedValue(verdictOf(false, false, 'unavailable', {
      reservationId: null, bindingScope: null, budgetSek: null, headroomSek: null,
    }))
    await withGovernedSpend(input(), async () => 'called')
    const r = overrideRows()[0].row
    expect(r.reason).toBe('unavailable')
    expect(r.reservation_id).toBeNull()
    expect(r.binding_scope).toBeNull()
    expect(r.headroom_sek).toBeNull()
  })

  it('B6 — no prompt, message or secret is recorded', async () => {
    reserveSpy.mockResolvedValue(verdictOf(false, false, 'budget_exceeded'))
    await withGovernedSpend(input(), async () => 'called')
    const keys = Object.keys(overrideRows()[0].row).sort()
    expect(keys).toEqual([
      'binding_scope', 'budget_sek', 'estimated_sek', 'headroom_sek',
      'idempotency_key', 'operation', 'project_id', 'provider', 'reason', 'reservation_id',
    ])
  })
})

// ── C. It cannot become a gate ──────────────────────────────────────────────

describe('C. observability never changes dispatch', () => {
  it('C1 — a recording ERROR does not stop the call', async () => {
    insertBehaviour = 'error'
    reserveSpy.mockResolvedValue(verdictOf(false, false, 'budget_exceeded'))
    await expect(withGovernedSpend(input(), async () => 'called')).resolves.toBe('called')
  })

  it('C2 — a recording THROW does not stop the call', async () => {
    insertBehaviour = 'throw'
    reserveSpy.mockResolvedValue(verdictOf(false, false, 'budget_exceeded'))
    await expect(withGovernedSpend(input(), async () => 'called')).resolves.toBe('called')
    expect(overrideRows()).toHaveLength(0)   // lost the measurement, kept the behaviour
  })

  it('C3 — a recording throw does not rescue an ENFORCED refusal either', async () => {
    insertBehaviour = 'throw'
    reserveSpy.mockResolvedValue(verdictOf(false, true, 'budget_exceeded'))
    await expect(withGovernedSpend(input(), async () => 'called'))
      .rejects.toThrow(SpendRefusedError)
  })

  it('C4 — MUTATION: the recorder returns void, so no caller can branch on it', () => {
    const src = readFileSync(join(process.cwd(), 'lib/cost/advisory-override.ts'), 'utf8')
    expect(src).toMatch(/Promise<void>/)
    expect(src).not.toMatch(/return (true|false)/)
    // Every failure is swallowed at the recorder, not at the call site.
    expect(src).toMatch(/catch/)
  })
})

// ── D. One implementation, shared by every client ───────────────────────────

describe('D. implemented once, at the shared layer', () => {
  const CLIENTS = ['lib/ai/anthropic.ts', 'lib/ai/openai-client.ts', 'lib/media/elevenlabs.ts',
                   'lib/media/image-client.ts', 'lib/media/dispatch/governed-dispatch.ts',
                   'lib/workflows/effect/proof-handler.ts',
                   'lib/workflows/effect/effect-execution.ts']

  it('D1 — exactly one call site, and it is in governed-spend', () => {
    const gs = readFileSync(join(process.cwd(), 'lib/cost/governed-spend.ts'), 'utf8')
    expect(gs.match(/await recordAdvisoryOverride\(/g)?.length).toBe(1)
  })

  it('D2 — MUTATION: no provider client records its own overrides', () => {
    for (const f of CLIENTS) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(src, f).not.toMatch(/recordAdvisoryOverride|advisory-override|advisoryOverride/)
      expect(src, f).not.toMatch(/spend_advisory_overrides/)
    }
  })

  it('D3 — the condition is read from the verdict, never re-derived', () => {
    const src = readFileSync(join(process.cwd(), 'lib/cost/advisory-override.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    // One guard, on the flag the verdict already computed.
    expect(src).toMatch(/if \(!input\.verdict\.advisoryOverride\) return/)
    // A second expression of the same rule would eventually disagree with it.
    expect(src).not.toMatch(/isSpendGateEnforced|H1_SPEND_GATE|wouldAllow/)
  })

  it('D4 — the recording happens BEFORE dispatch, not after', () => {
    const gs = readFileSync(join(process.cwd(), 'lib/cost/governed-spend.ts'), 'utf8')
    expect(gs.indexOf('await recordAdvisoryOverride('))
      .toBeLessThan(gs.indexOf('const result = await run()'))
    // And after the verdict exists — there is nothing to record before that.
    expect(gs.indexOf('const verdict = await reserveSpend('))
      .toBeLessThan(gs.indexOf('await recordAdvisoryOverride('))
  })
})

// ── E. Nothing else moved ───────────────────────────────────────────────────

describe('E. no behaviour changed', () => {
  it('E1 — the enforcement flag itself is untouched', () => {
    const flag = readFileSync(join(process.cwd(), 'lib/cost/spend-gate-flag.ts'), 'utf8')
    expect(flag).toMatch(/process\.env\.H1_SPEND_GATE === '1'/)
  })

  it('E2 — the verdict formula is unchanged', () => {
    const gate = readFileSync(join(process.cwd(), 'lib/cost/budget-gate.ts'), 'utf8')
    expect(gate).toMatch(/allowed: p\.wouldAllow \|\| !enforced/)
    expect(gate).toMatch(/advisoryOverride: !p\.wouldAllow && !enforced/)
  })

  it('E3 — the migration is additive: no drop, no alter of existing objects', () => {
    const sql = readFileSync(join(process.cwd(),
      'supabase/migrations/20260907090000_spend_advisory_overrides.sql'), 'utf8')
      .replace(/--.*$/gm, '')
    expect(sql).not.toMatch(/drop table|drop column|delete from|truncate/i)
    // The only DROPs are the idempotent trigger guards on the NEW table.
    for (const m of sql.matchAll(/drop trigger if exists (\w+)/g)) {
      expect(m[1]).toMatch(/^spend_advisory_overrides_/)
    }
    // Nothing touches an existing table.
    expect(sql).not.toMatch(/alter table public\.(spend_reservations|cost_events|projects|project_budgets|platform_config)/)
  })

  it('E4 — the new table is append-only and RLS-enabled', () => {
    const sql = readFileSync(join(process.cwd(),
      'supabase/migrations/20260907090000_spend_advisory_overrides.sql'), 'utf8')
    expect(sql).toMatch(/before update on public\.spend_advisory_overrides/)
    expect(sql).toMatch(/before delete on public\.spend_advisory_overrides/)
    expect(sql).toMatch(/enable row level security/)
  })
})
