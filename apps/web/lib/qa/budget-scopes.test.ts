/**
 * G2 — source invariants that execution cannot demonstrate.
 *
 * `budget-scopes-sql.test.ts` proves the BEHAVIOUR against a real database:
 * every scope refuses, replay is terminal-aware, and two overlapping
 * transactions cannot both fit one ceiling. Three properties are not
 * behavioural and belong here instead:
 *
 *   lock ORDER      — a deadlock needs two acquisition orders. No single run
 *                     can show that only one exists; the source can.
 *   one AUTHORITY   — that no second budget table, ledger or rate source was
 *                     introduced. A passing test proves nothing about the
 *                     tables it never touched.
 *   one DEFINITION  — that neither caller of budget_scope_state re-implements
 *                     the arithmetic, which is what makes F-204 unrepresentable
 *                     rather than merely fixed.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATION = join(process.cwd(), 'supabase/migrations/20260831_budget_scopes.sql')
const sql = readFileSync(MIGRATION, 'utf8')
const sqlCode = sql.replace(/--.*$/gm, '')

describe('lock ordering is unambiguous', () => {
  it('project lock is acquired before the platform lock', () => {
    const proj = sqlCode.indexOf("hashtext('budget_reserve:' || p_project_id::text)")
    const plat = sqlCode.indexOf("hashtext('budget_reserve:__platform__')")
    expect(proj).toBeGreaterThan(-1)
    expect(plat).toBeGreaterThan(-1)
    expect(proj).toBeLessThan(plat)
  })

  it('there is exactly ONE acquisition site for each lock', () => {
    // A deadlock needs the same pair taken in two orders. One site each makes
    // that unrepresentable rather than merely unlikely.
    expect(sqlCode.match(/pg_advisory_xact_lock/g)?.length).toBe(2)
  })

  it('both locks are taken BEFORE the replay branch (the F-106 fix)', () => {
    const plat = sqlCode.indexOf("hashtext('budget_reserve:__platform__')")
    const replay = sqlCode.indexOf('p_idempotency_key is not null')
    expect(plat).toBeLessThan(replay)
  })

  it('MUTATION — returning replay before the lock would be rejected', () => {
    // The exact pre-G2 shape. If it ever reappears, a settled key can be
    // replayed as allowed with no budget check.
    const preG2 = `if p_idempotency_key is not null then
    select * into v_existing from public.spend_reservations where idempotency_key = p_idempotency_key;
    if found then
      return query select (v_existing.status <> 'released')`
    expect(sqlCode).not.toContain(preG2)
    expect(sqlCode).not.toMatch(/v_existing\.status\s*<>\s*'released'/)
  })
})

describe('replay verdicts are terminal-aware and dispatch-aware', () => {
  it('a fresh open reservation is REFUSED, not handed to a second caller', () => {
    // One reservation holds a fixed amount of headroom; authorising two
    // dispatches against it is an under-reservation and a ceiling bypass.
    expect(sqlCode).toMatch(/'replay_in_flight'/)
    const inFlight = sqlCode.slice(sqlCode.indexOf("'replay_in_flight'") - 200,
                                   sqlCode.indexOf("'replay_in_flight'"))
    expect(inFlight).toMatch(/return query select false/)
  })

  it.each([
    ['settled',  'replay_settled'],
    ['released', 'replay_released'],
  ])('a %s reservation replays as %s and is refused', (status, reason) => {
    expect(sqlCode).toMatch(new RegExp(`'${reason}'`))
    const at = sqlCode.indexOf(`'${reason}'`)
    expect(sqlCode.slice(at - 200, at)).toMatch(/return query select false/)
  })

  it('ZERO replay states return allowed — no key may authorise a second dispatch', () => {
    const allowed = [...sqlCode.matchAll(/return query select (true|false), v_existing\.id/g)]
      .filter(m => m[1] === 'true')
    expect(allowed).toEqual([])
    // and the reason that used to be allowed is gone entirely
    expect(sqlCode).not.toMatch(/replay_open/)
  })

  it('stale open is REFUSED and released, not re-decided into a new spend', () => {
    // A visibility timeout proves only that no progress was OBSERVED. Re-deciding
    // a stale reservation against current budget and allowing it would still let
    // one reservation authorise a second dispatch if the first call outlived the
    // timeout.
    expect(sqlCode).toMatch(/'replay_stale'/)
    const at = sqlCode.indexOf("'replay_stale'")
    const branch = sqlCode.slice(at - 400, at)
    expect(branch).toMatch(/set status = 'released'/)
    expect(branch).toMatch(/return query select false/)
  })

  it('the stale branch no longer refreshes created_at into a fresh hold', () => {
    expect(sqlCode).not.toMatch(/set created_at = now\(\)/)
  })

  it('identity is bound BEFORE the state branch', () => {
    const identity = sqlCode.indexOf('replay_identity_mismatch')
    const stateBranch = sqlCode.indexOf("v_existing.status = 'open'")
    expect(identity).toBeGreaterThan(-1)
    expect(identity).toBeLessThan(stateBranch)
  })

  it.each([
    ['project',   /v_existing\.project_id\s+is distinct from p_project_id/],
    ['provider',  /v_existing\.provider\s+is distinct from p_provider/],
    ['operation', /v_existing\.operation\s+is distinct from p_operation/],
    ['estimate',  /p_estimated_sek > v_existing\.estimated_sek/],
  ])('a mismatched %s is refused', (_label, re) => {
    expect(sqlCode).toMatch(re)
  })

  it('no replay branch evaluates budget — refusal does not depend on headroom', () => {
    // Budget availability is irrelevant to a replay: the question is whether a
    // dispatch may already be live, which no ceiling can answer. The comparison
    // belongs to the NORMAL path only, and must appear exactly once.
    // Bounded by CODE, not by a comment — `sqlCode` has comments stripped.
    const replayBlock = sqlCode.slice(
      sqlCode.indexOf('if p_idempotency_key is not null then'),
      sqlCode.indexOf('select exists (select 1 from public.project_budgets'))
    expect(replayBlock).not.toMatch(/v_rem/)
    expect(replayBlock).not.toMatch(/budget_scope_state/)
    expect(sqlCode.match(/if p_estimated_sek <= v_rem then/g)).toHaveLength(1)
  })
})

describe('canonical comments describe the FINAL code', () => {
  it.each([
    ['replay_open',                /replay_open/],
    ['both callers allowed',       /both get `allowed`/],
    ['may both dispatch',          /may both dispatch/],
  ])('the migration makes no withdrawn claim about %s', (_l, re) => {
    expect(sql).not.toMatch(re)
  })

  it('states the invariant it actually implements', () => {
    expect(sql).toMatch(/ZERO REPLAY STATES RETURN ALLOWED/)
  })

  it('historical references to the pre-G2 bypass stay, and stay labelled', () => {
    expect(sql).toMatch(/The old replay branch read `idempotency_key`/)
  })
})

describe('gross-spend ceiling (negative cost cannot mint headroom)', () => {
  it('enforcement sums only non-negative spend', () => {
    expect(sqlCode).toMatch(/sum\(greatest\(c\.cost_sek, 0\)\)/)
  })

  it('and the ledger constraint stops the row being written at all', () => {
    expect(sqlCode).toMatch(/add constraint cost_events_cost_nonneg\s+check \(cost_sek >= 0 and cost_usd >= 0\)/)
  })

  it('both directions are covered — clamp above, gross below', () => {
    expect(sqlCode).toMatch(/least\(s\.lim, s\.lim - x\.spent - x\.held\)/)
  })
})

describe('exactly one budget authority', () => {
  it('creates no new table', () => {
    expect([...sqlCode.matchAll(/create table[^;]*?public\.(\w+)/g)].map(m => m[1])).toEqual([])
  })

  it('reuses project_budgets and platform_config rather than a new store', () => {
    expect(sqlCode).toMatch(/alter table public\.project_budgets/)
    expect(sqlCode).toMatch(/alter table public\.platform_config/)
    // A rival TABLE, not merely the substring — `platform_config_global_budget_nonneg`
    // is a constraint on the reused table and is exactly what we want to see.
    expect(sqlCode).not.toMatch(/(create|alter) table[^;]*?public\.(platform_budget|budget_config|global_budgets)\b/)
  })

  it('reads spend from cost_events only — no second ledger', () => {
    const ledgers = [...sqlCode.matchAll(/from public\.(\w+)/g)].map(m => m[1])
    expect(new Set(ledgers.filter(t => t.includes('cost')))).toEqual(new Set(['cost_events']))
  })

  it('embeds no rate table — pricing stays in cost_rates via getRates()', () => {
    expect(sqlCode).not.toMatch(/usd_sek|per_1k_chars|per_image/)
  })
})

describe('one definition of headroom (audit F-204)', () => {
  it('budget_scope_state is the only place the arithmetic exists', () => {
    const formula = /limit_sek|s\.lim - x\.spent - x\.held/
    const scopeFn = sqlCode.slice(sqlCode.indexOf('function public.budget_scope_state'),
                                  sqlCode.indexOf('function public.budget_reserve'))
    expect(scopeFn).toMatch(formula)
  })

  it('both callers delegate to it rather than recomputing', () => {
    const reserveFn = sqlCode.slice(sqlCode.indexOf('function public.budget_reserve'),
                                    sqlCode.indexOf('function public.budget_headroom'))
    const headroomFn = sqlCode.slice(sqlCode.indexOf('function public.budget_headroom'))
    expect(reserveFn).toMatch(/budget_scope_state\(/)
    expect(headroomFn).toMatch(/budget_scope_state\(/)
    // Neither may contain the subtraction itself.
    expect(reserveFn).not.toMatch(/- x\.spent - x\.held/)
    expect(headroomFn).not.toMatch(/- x\.spent - x\.held/)
  })
})

describe('windows are deterministic and canonical', () => {
  it('every window is Europe/Stockholm, never server-local or UTC', () => {
    expect(sqlCode).toMatch(/'Europe\/Stockholm'::text as z/)
    // The pre-G2 UTC month boundary must not survive.
    expect(sqlCode).not.toMatch(/at time zone 'utc'/)
  })

  it('day, week and month each have BOTH edges', () => {
    for (const unit of ['day', 'week', 'month']) {
      expect(sqlCode).toMatch(new RegExp(`date_trunc\\('${unit}'`))
      expect(sqlCode).toMatch(new RegExp(`interval '1 ${unit}'`))
    }
  })

  it('intervals are added in LOCAL time so DST days are 23h or 25h', () => {
    // `(l_day + interval '1 day') at time zone z` is right;
    // `(l_day at time zone z) + interval '1 day'` would be a fixed 24 hours.
    expect(sqlCode).toMatch(/\(l_day\s*\+\s*interval '1 day'\)\s*at time zone z/)
    expect(sqlCode).not.toMatch(/at time zone z\s*\+\s*interval/)
  })

  it('MUTATION — an unbounded window would be rejected', () => {
    // Without an upper edge a future-dated row consumes today's ceiling forever.
    expect(sqlCode).toMatch(/c\.created_at >= s\.since and c\.created_at < s\.until/)
    expect(sqlCode).toMatch(/r\.created_at >= s\.since and r\.created_at < s\.until/)
  })
})

describe('fail closed', () => {
  it('an absent platform ceiling refuses rather than meaning "no ceiling"', () => {
    expect(sqlCode).toMatch(/'no_global_budget_configured'/)
    expect(sqlCode).toMatch(/global_daily_sek is not null[\s\S]{0,120}global_monthly_sek is not null/)
  })

  it('NaN and Infinity are named explicitly, not left to a bare < 0 test', () => {
    for (const v of ["'NaN'::numeric", "'Infinity'::numeric", "'-Infinity'::numeric"]) {
      expect(sqlCode).toContain(v)
    }
  })

  it('the function is service-role only, like every other governance RPC', () => {
    for (const fn of ['budget_reserve', 'budget_scope_state', 'budget_headroom']) {
      expect(sqlCode).toMatch(new RegExp(`revoke all on function public\\.${fn}`))
      expect(sqlCode).toMatch(new RegExp(`grant execute on function public\\.${fn}[^;]*to service_role`))
    }
  })

  it('no scope is granted a default that would widen it', () => {
    expect(sqlCode).not.toMatch(/coalesce\(\s*(daily_sek|weekly_sek|monthly_sek)\s*,\s*'?[Ii]nfinity/)
    expect(sqlCode).not.toMatch(/default\s+999/)
  })
})

describe('migration safety', () => {
  it('is additive — no drop of a column or table', () => {
    expect(sqlCode).not.toMatch(/drop table/i)
    expect(sqlCode).not.toMatch(/drop column/i)
  })

  it('only drops the function it immediately replaces', () => {
    const drops = [...sqlCode.matchAll(/drop function if exists public\.(\w+)/g)].map(m => m[1])
    expect(drops).toEqual(['budget_headroom'])
  })

  it('seeds explicit limits, never an unlimited placeholder', () => {
    expect(sqlCode).toMatch(/global_daily_sek\s*,\s*150\.0000/)
    expect(sqlCode).toMatch(/global_weekly_sek\s*,\s*600\.0000/)
    expect(sqlCode).toMatch(/global_monthly_sek\s*,\s*1500\.0000/)
  })

  it('covers the project the audit found spending without a budget row', () => {
    expect(sqlCode).toMatch(/omnira-selftest/)
  })
})

describe('spend identity', () => {
  const src = readFileSync(join(process.cwd(), 'lib/cost/spend-identity.ts'), 'utf8')

  it('binds project, provider, operation and subject — all four', () => {
    for (const part of ['project', 'provider', 'operation', 'subject']) {
      expect(src).toMatch(new RegExp(`id\\.${part}|${part}:`))
    }
  })

  it('produces a stable key for the same identity and different keys otherwise', async () => {
    const { spendIdempotencyKey } = await import('@/lib/cost/spend-identity')
    const base = { project: { projectSlug: 'p' }, provider: 'elevenlabs',
                   operation: 'generateVoiceover', subject: 's1' } as const
    expect(spendIdempotencyKey(base)).toBe(spendIdempotencyKey({ ...base }))
    expect(spendIdempotencyKey(base)).not.toBe(spendIdempotencyKey({ ...base, subject: 's2' }))
    expect(spendIdempotencyKey(base)).not.toBe(spendIdempotencyKey({ ...base, operation: 'other' }))
    expect(spendIdempotencyKey(base)).not.toBe(spendIdempotencyKey({ ...base, provider: 'openai' }))
    expect(spendIdempotencyKey(base))
      .not.toBe(spendIdempotencyKey({ ...base, project: { projectId: 'p' } }))
  })

  it('N units of one job do not collide with each other', async () => {
    const { spendIdempotencyKey } = await import('@/lib/cost/spend-identity')
    const keys = [0, 1, 2].map(i => spendIdempotencyKey({
      project: { projectSlug: 'p' }, provider: 'ideogram',
      operation: 'Scene Image', subject: `script-1#${i}`,
    }))
    expect(new Set(keys).size).toBe(3)
  })
})
