/**
 * PR9b — pre-spend budget gate.
 *
 * The property that matters most here is FAIL CLOSED: a project with no budget
 * row must be REFUSED, not waved through. "Unconfigured" is exactly the state in
 * which an unnoticed loop bills forever, so treating it as unlimited would make
 * the gate worse than useless — it would look like protection.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATION = join(process.cwd(), 'supabase/migrations/20260830_spend_budget_gate.sql')
const sql = readFileSync(MIGRATION, 'utf8')
const sqlCode = sql.replace(/--.*$/gm, '')

const GATE_SRC = join(process.cwd(), 'lib/cost/budget-gate.ts')
const gate = readFileSync(GATE_SRC, 'utf8')

function withEnv<T>(v: string | undefined, fn: () => T): T {
  const prev = process.env.H1_SPEND_GATE
  if (v === undefined) delete process.env.H1_SPEND_GATE; else process.env.H1_SPEND_GATE = v
  try { return fn() } finally {
    if (prev === undefined) delete process.env.H1_SPEND_GATE; else process.env.H1_SPEND_GATE = prev
  }
}

// ── Fail closed ─────────────────────────────────────────────────────────────

describe('fail closed', () => {
  it('SQL refuses a project with no budget row', () => {
    expect(sqlCode).toMatch(/if v_budget is null then\s*return query select false, null::uuid, 'no_budget_configured'/)
  })

  it('MUTATION — treating a missing budget as unlimited would be rejected', () => {
    // The tempting "no budget means no limit" shape. If the migration ever grew
    // it, the gate would silently stop gating the projects most likely to be
    // misconfigured.
    const failOpen = `if v_budget is null then v_budget := 'Infinity'::numeric; end if;`
    expect(failOpen).toMatch(/Infinity/)
    expect(sqlCode).not.toMatch(/Infinity/)
    expect(sqlCode).not.toMatch(/coalesce\(b\.monthly_sek,\s*[0-9'"]/)   // no silent default
  })

  it('an unreachable gate reports unavailable, never allowed-by-default', () => {
    expect(gate).toMatch(/reason: 'unavailable'/)
    // wouldAllow must be false on every failure path.
    for (const m of gate.matchAll(/verdict\(\{\s*wouldAllow:\s*(\w+),\s*reason:\s*'unavailable'/g)) {
      expect(m[1]).toBe('false')
    }
  })

  it('a negative or null estimate is refused', () => {
    expect(sqlCode).toMatch(/p_estimated_sek is null or p_estimated_sek < 0/)
    expect(sqlCode).toMatch(/'invalid_estimate'/)
  })
})

// ── Enforcement flag ────────────────────────────────────────────────────────

describe('SQL tells the truth; the flag decides enforcement', () => {
  it('the migration never reads a feature flag', () => {
    // If SQL consulted the flag, advisory mode would record fictional verdicts
    // and enabling enforcement would be a schema change rather than a flip.
    expect(sqlCode).not.toMatch(/H1_SPEND_GATE/i)
    expect(sqlCode).not.toMatch(/current_setting/i)
  })

  it('advisory mode allows a refusal through but still reports it', async () => {
    const { default: _ } = { default: null }
    const mod = await import('../cost/spend-gate-flag')
    withEnv(undefined, () => expect(mod.isSpendGateEnforced()).toBe(false))
    withEnv('0', () => expect(mod.isSpendGateEnforced()).toBe(false))
    withEnv('true', () => expect(mod.isSpendGateEnforced()).toBe(false))
    withEnv('1', () => expect(mod.isSpendGateEnforced()).toBe(true))
  })

  it('the verdict distinguishes "budget said yes" from "we let it through"', () => {
    // allowed vs wouldAllow vs advisoryOverride — collapsing these would make
    // advisory mode indistinguishable from a passing budget in the audit trail.
    expect(gate).toMatch(/allowed:\s*p\.wouldAllow \|\| !enforced/)
    expect(gate).toMatch(/advisoryOverride:\s*!p\.wouldAllow && !enforced/)
  })

  it('one predicate, shared — the status surface cannot report a fiction', () => {
    const flags = readFileSync(join(process.cwd(), 'lib/ai/execution-flags.ts'), 'utf8')
    const code = flags.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).toMatch(/isSpendGateEnforced/)
    expect(code).not.toMatch(/H1_SPEND_GATE/)
    expect(gate).toMatch(/from '\.\/spend-gate-flag'/)
  })
})

// ── Reservation semantics ───────────────────────────────────────────────────

describe('reservations make concurrent callers visible to each other', () => {
  it('counts open reservations alongside committed spend', () => {
    expect(sqlCode).toMatch(/v_headroom := v_budget - v_committed - v_reserved/)
    expect(sqlCode).toMatch(/from public\.cost_events c/)
    expect(sqlCode).toMatch(/from public\.spend_reservations r/)
  })

  it('serializes reservations per project', () => {
    // Without the lock, two callers read the same headroom and both fit.
    expect(sqlCode).toMatch(/pg_advisory_xact_lock\(hashtext\('budget_reserve:' \|\| p_project_id::text\)\)/)
  })

  it('ignores stale open reservations so a crash cannot starve the budget', () => {
    expect(sqlCode).toMatch(/r\.created_at > now\(\) - make_interval\(mins => p_stale_minutes\)/)
    expect(sqlCode).toMatch(/p_stale_minutes\s+int\s+default 30/)
  })

  it('settles and releases only from open, so replays cannot double-count', () => {
    for (const fn of ['budget_settle', 'budget_release']) {
      const body = sqlCode.slice(sqlCode.indexOf(`function public.${fn}`))
      expect(body).toMatch(/where id = p_reservation_id and status = 'open'/)
    }
  })

  it('an idempotency key reserves once', () => {
    expect(sqlCode).toMatch(/idempotency_key text unique/)
    expect(sqlCode).toMatch(/if found then\s*return query select \(v_existing\.status <> 'released'\), v_existing\.id, 'replay'/)
  })

  it('records the attempt whatever the verdict', () => {
    // A refusal that leaves no trace cannot be audited, and advisory mode would
    // produce no accounting at all.
    const insertAt = sqlCode.indexOf('insert into public.spend_reservations (project_id')
    const decideAt = sqlCode.indexOf('if p_estimated_sek <= v_headroom then', insertAt)
    expect(insertAt).toBeGreaterThan(-1)
    expect(decideAt).toBeGreaterThan(insertAt)   // insert happens BEFORE the verdict returns
  })
})

// ── One budget table, one price source ──────────────────────────────────────

describe('no duplicated sources of truth', () => {
  it('reuses project_budgets and creates no second budget table', () => {
    expect(sqlCode).toMatch(/from public\.project_budgets/)
    expect(sqlCode).not.toMatch(/create table[^;]*budget[^;]*\(/i)
    // The only table it creates is the reservation ledger.
    const created = [...sqlCode.matchAll(/create table if not exists public\.(\w+)/g)].map(m => m[1])
    expect(created).toEqual(['spend_reservations'])
  })

  it('estimates use the same rate accessor that writes cost_events', () => {
    // A second price table would drift and the estimate would stop matching the
    // figure later recorded. G1 moved the accessor into its own module so a
    // provider adapter can price a call without importing the ledger writer —
    // still exactly ONE implementation, which is what the invariant is about.
    expect(gate).toMatch(/import \{ getRates \} from '\.\/rates'/)
    expect(gate).not.toMatch(/usd_sek\s*[:=]\s*10\.5\s*,/)   // no rival table
    const rates = readFileSync(join(process.cwd(), 'lib/cost/rates.ts'), 'utf8')
    expect(rates).toMatch(/export async function getRates/)
    // track.ts must keep serving the same accessor, not define a second one.
    const track = readFileSync(join(process.cwd(), 'lib/cost/track.ts'), 'utf8')
    expect(track).toMatch(/export \{ getRates \} from '\.\/rates'/)
    expect(track).not.toMatch(/export async function getRates/)
  })

  it('the gate and the ledger charge the same project', () => {
    // G1 replaced `resolveCostProjectId()` — which defaulted to one hardcoded
    // slug and returned null on failure — with an explicit ProjectRef that the
    // caller supplies and the boundary refuses to guess at.
    const el = readFileSync(join(process.cwd(), 'lib/media/elevenlabs.ts'), 'utf8')
    expect(el).toMatch(/project: ProjectRef/)
    expect(el).toMatch(/logVoiceCost/)
    expect(el).not.toMatch(/resolveCostProjectId/)
  })
})

// ── Never breaks the pipeline it guards ─────────────────────────────────────

describe('the gate cannot crash the pipeline', () => {
  it('every exported async call is wrapped', () => {
    for (const fn of ['reserveSpend', 'settleSpend', 'releaseSpend']) {
      const from = gate.indexOf(`export async function ${fn}`)
      const body = gate.slice(from, gate.indexOf('\n}', from))
      expect(body).toMatch(/try \{/)
      expect(body).toMatch(/catch/)
    }
  })

  it('settle/release tolerate a null reservation', () => {
    expect(gate).toMatch(/if \(!reservationId\) return/)
  })
})

// ── Spend-site wiring ───────────────────────────────────────────────────────

describe('ElevenLabs — the spend Familje-Stunden names explicitly', () => {
  const el = readFileSync(join(process.cwd(), 'lib/media/elevenlabs.ts'), 'utf8')

  it('reserves BEFORE the provider call', () => {
    // The reservation is now taken by the shared boundary, which wraps the fetch
    // rather than sitting beside it — an ordering the type system enforces,
    // since the provider call is the callback withGovernedSpend invokes.
    const gateAt = el.indexOf('withGovernedSpend(')
    expect(gateAt).toBeGreaterThan(-1)
    expect(gateAt).toBeLessThan(el.indexOf('api.elevenlabs.io'))
  })

  it('a provably-undispatched failure releases; anything ambiguous does not', () => {
    // Release requires the adapter to raise ProviderNotDispatchedError — a claim
    // it has to make. STRENGTHENED BY PHASE 5B-1: the claim must now be LICENSED
    // by a classifier, so the assertions name the classifier rather than the
    // bare catch. Before, a `catch (e) { throw new ProviderNotDispatchedError }`
    // satisfied this test while asserting the opposite of its own title.
    expect(el).toMatch(/catch \(e\) \{[\s\S]{0,900}classifyTransportFailure\(e\)/)
    expect(el).toMatch(/verdict\.sent === false[\s\S]{0,200}ProviderNotDispatchedError/)
    // The ambiguous branch exists and does NOT claim non-dispatch.
    expect(el).toMatch(/ProviderDispatchUnknownError/)
    // The status split defers to the shared rule instead of a local `< 500`.
    expect(el).toMatch(/statusProvesNotCreated\(response\.status\)[\s\S]{0,200}ProviderNotDispatchedError/)
    expect(el).not.toMatch(/status < 500/)
    expect(el).not.toMatch(/releaseSpend/)
    expect(el).not.toMatch(/settleSpend/)
  })

  it('estimates from character count, which is knowable before the call', () => {
    expect(el).toMatch(/estimateVoiceSek\(text\.length\)/)
  })
})

// ── Scope: PR9b is the budget half only ─────────────────────────────────────

describe('scope', () => {
  it('grants no approval and executes no workflow action', () => {
    // no_spend_without_approval has two halves. A passing budget check is NOT
    // consent, and PR9b must not imply otherwise.
    for (const forbidden of [/atlas_authorizations/, /grantAuthorization/, /workflow_append_transition/,
                             /appendTransition/, /claim_runs/]) {
      expect(gate).not.toMatch(forbidden)
      expect(sqlCode).not.toMatch(forbidden)
    }
  })

  it('the reservation ledger is not reachable without the functions', () => {
    expect(sqlCode).toMatch(/alter table public\.spend_reservations enable row level security/)
    expect(sqlCode).not.toMatch(/create policy/i)
    for (const fn of ['budget_reserve', 'budget_settle', 'budget_release', 'budget_headroom']) {
      expect(sqlCode).toMatch(new RegExp(`revoke all on function public\\.${fn}`))
      expect(sqlCode).toMatch(new RegExp(`grant execute on function public\\.${fn}[^;]*to service_role`))
    }
  })
})
