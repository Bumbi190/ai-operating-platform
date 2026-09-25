/**
 * Atlas survival governor, Phase 1 — derivation and ceiling.
 *
 * The pure core is tested directly against table-driven inputs, plus a set of
 * STRUCTURAL guards for the properties that must hold no matter which inputs are
 * ever added: the direction of every cap, the inertness of the module, and the
 * absence of a second budget or a clock inside the derivation.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  deriveSurvivalState,
  mostRestrictive,
  PROVISIONAL_CRITICAL_HEADROOM_FRACTION,
  PROVISIONAL_CONSERVE_HEADROOM_FRACTION,
  PROVISIONAL_POLICY_NOTICE,
  SURVIVAL_THRESHOLD_STATUS,
  FUNDING_UNDECLARED_FLOOR,
  FUNDING_UNAVAILABLE_FLOOR,
  FUNDING_DEPLETED_FLOOR,
} from '@/lib/atlas/survival/derive'
import {
  SURVIVAL_CEILING,
  effectiveAutonomy,
  lowestAutonomy,
  describeCeiling,
  survivalCeiling,
} from '@/lib/atlas/survival/ceiling'
import {
  AUTONOMY_LICENSE_LEVELS,
  SURVIVAL_REASONS,
  SURVIVAL_GAPS,
  SURVIVAL_STATES,
  type AutonomyLicenseLevel,
  type BudgetScopeReading,
  type FundingReading,
  type SurvivalInput,
  type SurvivalState,
} from '@/lib/atlas/survival/types'

const AT = '2026-09-23T12:00:00.000Z'

// ─── Fixtures ───────────────────────────────────────────────────────────────

function scope(over: Partial<BudgetScopeReading> = {}): BudgetScopeReading {
  return {
    projectId: 'p1',
    slug: 'ai-media-automation',
    scope: 'global_monthly',
    limitSek: 1500,
    spentSek: 198.47,
    heldSek: 0,
    remainingSek: 1301.53,
    ...over,
  }
}

/** A fully-observed, healthy, funded platform. Every read succeeded. */
function input(over: Partial<SurvivalInput> = {}): SurvivalInput {
  return {
    scopes: [scope()],
    reads: { budgets: true, burn: true, revenue: true },
    burnSekPerDay: 8.3,
    funding: { kind: 'KNOWN', declaredFundingSek: 120_000 },
    // PLATFORM_COMPLETE by default so the pre-Phase-2B expectations below keep
    // their meaning: these fixtures describe a whole-platform observation. The
    // partial-scope rule has its own block.
    runwayCoverage: 'PLATFORM_COMPLETE',
    revenueTrendSek: 12,
    operatingPaused: false,
    ...over,
  }
}

function derive(over: Partial<SurvivalInput> = {}, at = AT) {
  return deriveSurvivalState(input(over), { at })
}

// ─── The five states ────────────────────────────────────────────────────────

describe('survival state derivation', () => {
  it('reports EXPAND only when every fact is present and favourable', () => {
    const s = derive()
    expect(s.state).toBe('EXPAND')
    expect(s.reasons).toContain('headroom_healthy')
    expect(s.runwayDays).toBeGreaterThan(60)
    expect(s.bindingScope).toBe('global_monthly')
    expect(s.asOf).toBe(AT)
  })

  it('reports NORMAL on healthy headroom with a flat or falling revenue signal', () => {
    expect(derive({ revenueTrendSek: 0 }).state).toBe('NORMAL')
    expect(derive({ revenueTrendSek: -5 }).state).toBe('NORMAL')
  })

  it('is NORMAL, not EXPAND, when runway is ample but the remaining fraction is low', () => {
    const s = derive({ scopes: [scope({ remainingSek: 600, limitSek: 1500 })] })
    expect(s.state).toBe('NORMAL')
  })

  it('reports CONSERVE on low headroom', () => {
    const s = derive({ scopes: [scope({ remainingSek: 300, limitSek: 1500 })] })
    expect(s.state).toBe('CONSERVE')
    expect(s.reasons).toContain('headroom_conserve')
  })

  it('reports CRITICAL on critical headroom', () => {
    const s = derive({ scopes: [scope({ remainingSek: 90, limitSek: 1500 })] })
    expect(s.state).toBe('CRITICAL')
    expect(s.reasons).toContain('headroom_critical')
  })

  it('reports HIBERNATE when the binding scope is exhausted', () => {
    const s = derive({ scopes: [scope({ remainingSek: 0, limitSek: 1500, spentSek: 1500 })] })
    expect(s.state).toBe('HIBERNATE')
    expect(s.reasons).toContain('headroom_exhausted')
  })

  it('reports HIBERNATE when the binding scope has a zero limit — no reserve can succeed', () => {
    expect(derive({ scopes: [scope({ limitSek: 0, remainingSek: 0 })] }).state).toBe('HIBERNATE')
  })

  it('treats headroom held by in-flight reservations as unusable', () => {
    // `budget_scope_state` already nets held reservations out of `remaining_sek`,
    // so a scope whose limit is fully held arrives here as remaining 0. Derive
    // trusts `remainingSek` and never recomputes it from limit − spent − held:
    // re-deriving the gate's own arithmetic is how two answers to one question
    // start to disagree.
    const fullyHeld = derive({
      scopes: [scope({ limitSek: 1500, spentSek: 0, heldSek: 1500, remainingSek: 0 })],
    })
    expect(fullyHeld.state).toBe('HIBERNATE')

    // And the converse: a roomy `remainingSek` decides, whatever the other
    // columns say — they are provenance, not inputs.
    const roomy = derive({
      scopes: [scope({ limitSek: 1500, spentSek: 0, heldSek: 1500, remainingSek: 1200 })],
    })
    expect(roomy.state).not.toBe('HIBERNATE')
  })

  it('binds on the TIGHTEST scope, not the first or the largest', () => {
    const s = derive({
      scopes: [
        scope({ scope: 'global_monthly', remainingSek: 1301.53 }),
        scope({ scope: 'project_daily', remainingSek: 4 }),
      ],
    })
    expect(s.bindingScope).toBe('project_daily')
    expect(s.bindingRemainingSek).toBe(4)
    expect(s.state).toBe('CRITICAL')
  })

  it('cannot be made more permissive by adding a roomy scope', () => {
    const tight = derive({ scopes: [scope({ remainingSek: 90, limitSek: 1500 })] })
    const withRoom = derive({
      scopes: [
        scope({ remainingSek: 90, limitSek: 1500 }),
        scope({ scope: 'project_monthly', remainingSek: 5000, limitSek: 5000 }),
      ],
    })
    expect(tight.state).toBe('CRITICAL')
    expect(withRoom.state).toBe('CRITICAL')
  })

  it('threshold constants sit in the documented order', () => {
    expect(PROVISIONAL_CRITICAL_HEADROOM_FRACTION).toBeLessThan(PROVISIONAL_CONSERVE_HEADROOM_FRACTION)
  })

  it('pinned: carrying operatingPaused never changes the state', () => {
    const cases: Partial<SurvivalInput>[] = [
      {},
      { funding: { kind: 'UNDECLARED' } },
      { scopes: [scope({ remainingSek: 0, limitSek: 1500 })] },
      { reads: { budgets: false, burn: false, revenue: false }, scopes: [] },
    ]
    for (const over of cases) {
      const paused = derive({ ...over, operatingPaused: true })
      const running = derive({ ...over, operatingPaused: false })
      expect(paused.state, JSON.stringify(over)).toBe(running.state)
      // Copied through unchanged, never branched on.
      expect(paused.operatingPaused).toBe(true)
      expect(running.operatingPaused).toBe(false)
    }
  })
})

// ─── Funding UNDECLARED — the owner has never supplied a figure ─────────────

describe('funding UNDECLARED', () => {
  it('is CONSERVE, with an explicit reason and gap — not NORMAL', () => {
    const s = derive({ funding: { kind: 'UNDECLARED' } })
    expect(s.state).toBe('CONSERVE')
    expect(s.reasons).toContain('funding_undeclared')
    expect(s.gaps).toContain('funding_undeclared')
  })

  it('leaves runwayDays null', () => {
    expect(derive({ funding: { kind: 'UNDECLARED' } }).runwayDays).toBeNull()
  })

  it('never reports EXPAND or NORMAL for any headroom, once funding is unknown', () => {
    for (const remainingSek of [1301.53, 1200, 900, 750, 600]) {
      const s = derive({
        funding: { kind: 'UNDECLARED' },
        scopes: [scope({ remainingSek, limitSek: 1500 })],
      })
      expect(s.state, `remaining ${remainingSek}`).not.toBe('EXPAND')
      expect(s.state, `remaining ${remainingSek}`).not.toBe('NORMAL')
    }
  })

  it('MRR cannot substitute for funding — a large positive trend changes nothing', () => {
    const withoutRevenue = derive({ funding: { kind: 'UNDECLARED' }, revenueTrendSek: null })
    const withRevenue = derive({ funding: { kind: 'UNDECLARED' }, revenueTrendSek: 10_000 })
    expect(withRevenue.state).toBe('CONSERVE')
    expect(withRevenue.state).toBe(withoutRevenue.state)
    expect(withRevenue.runwayDays).toBeNull()
    expect(withRevenue.reasons).toContain('funding_undeclared')
  })

  it('exposes the revenue trend as a signal without letting it set the state', () => {
    const s = derive({ funding: { kind: 'UNDECLARED' }, revenueTrendSek: 250 })
    expect(s.revenueTrendSek).toBe(250)
    expect(s.state).toBe('CONSERVE')
  })

  it('declares runway unknown when funding is known but no burn was measured', () => {
    const s = derive({ burnSekPerDay: 0 })
    expect(s.runwayDays).toBeNull()
    expect(s.gaps).toContain('runway_unknown')
    expect(s.gaps).not.toContain('funding_undeclared')
  })

  it('reports short runway from declared funding against measured burn', () => {
    // 20 SEK left at 8 SEK/day ≈ 2.5 days.
    const s = derive({ funding: { kind: 'KNOWN', declaredFundingSek: 20 }, burnSekPerDay: 8 })
    expect(s.runwayDays).toBeCloseTo(2.5, 5)
    expect(s.state).toBe('CRITICAL')
    expect(s.reasons).toContain('runway_short')

    // 80 SEK at 8 SEK/day = 10 days → CONSERVE.
    expect(derive({ funding: { kind: 'KNOWN', declaredFundingSek: 80 }, burnSekPerDay: 8 }).state).toBe('CONSERVE')
  })
})

// ─── Funding UNAVAILABLE — a lost reading is not an absent decision ──────────

describe('funding UNAVAILABLE', () => {
  it('floors at HIBERNATE — at least as restrictive as any KNOWN state', () => {
    const s = derive({ funding: { kind: 'UNAVAILABLE' } })
    expect(s.state).toBe('HIBERNATE')
    expect(s.reasons).toContain('funding_unavailable')
    expect(s.gaps).toContain('funding_unavailable')
    expect(s.fundingState).toBe('UNAVAILABLE')
    expect(s.runwayDays).toBeNull()
    expect(s.declaredFundingSek).toBeNull()
  })

  it('the floor ORDERING is the reason for the values, and is asserted', () => {
    // The values alone cannot say why. This is the constraint that makes
    // KNOWN → UNAVAILABLE monotone: a lost reading must floor at least as high
    // as the worst a KNOWN reading can be. Lowering FUNDING_DEPLETED_FLOOR is
    // always safe; lowering FUNDING_UNAVAILABLE_FLOOR below it is not.
    const rank = (s: SurvivalState) => SURVIVAL_STATES.indexOf(s)
    expect(
      rank(FUNDING_UNAVAILABLE_FLOOR),
      'UNAVAILABLE must be at least as restrictive as DEPLETED',
    ).toBeGreaterThanOrEqual(rank(FUNDING_DEPLETED_FLOOR))
    expect(rank(FUNDING_UNAVAILABLE_FLOOR)).toBeGreaterThan(rank(FUNDING_UNDECLARED_FLOOR))
    expect(rank(FUNDING_DEPLETED_FLOOR)).toBeGreaterThan(rank(FUNDING_UNDECLARED_FLOOR))
    // And the owner's stated floor is still met.
    expect(rank(FUNDING_UNAVAILABLE_FLOOR)).toBeGreaterThanOrEqual(rank('CRITICAL'))
  })

  it('is a DIFFERENT state from UNDECLARED, with a different reason and gap', () => {
    const unavailable = derive({ funding: { kind: 'UNAVAILABLE' } })
    const undeclared = derive({ funding: { kind: 'UNDECLARED' } })
    expect(unavailable.fundingState).toBe('UNAVAILABLE')
    expect(undeclared.fundingState).toBe('UNDECLARED')
    // Same headroom, same everything else — only the funding state differs, and
    // it must change the answer.
    expect(unavailable.state).not.toBe(undeclared.state)
    expect(undeclared.reasons).toContain('funding_undeclared')
    expect(unavailable.reasons).not.toContain('funding_undeclared')
    expect(undeclared.gaps).toContain('funding_undeclared')
    expect(unavailable.gaps).not.toContain('funding_undeclared')
  })

  it('still reports HIBERNATE when headroom is exhausted — the floor raises nothing', () => {
    const s = derive({
      funding: { kind: 'UNAVAILABLE' },
      scopes: [scope({ remainingSek: 0, limitSek: 1500 })],
    })
    expect(s.state).toBe('HIBERNATE')
  })

  it('MRR cannot substitute for a lost reading either', () => {
    const withoutRevenue = derive({ funding: { kind: 'UNAVAILABLE' }, revenueTrendSek: null })
    const withRevenue = derive({ funding: { kind: 'UNAVAILABLE' }, revenueTrendSek: 10_000 })
    expect(withRevenue.state).toBe('HIBERNATE')
    expect(withRevenue.state).toBe(withoutRevenue.state)
    expect(withRevenue.runwayDays).toBeNull()
    expect(withRevenue.reasons).toContain('funding_unavailable')
  })
})

// ─── Failed / incomplete reads ──────────────────────────────────────────────

describe('failed and incomplete reads', () => {
  it('caps at CONSERVE when the budget read failed, and says reads — not "no budget"', () => {
    const s = derive({
      scopes: [],
      reads: { budgets: false, burn: true, revenue: true },
    })
    expect(s.state).toBe('CONSERVE')
    expect(s.reasons).toContain('reads_unavailable')
    expect(s.reasons).not.toContain('no_budget_configured')
    expect(s.gaps).toContain('reads_incomplete')
  })

  it('caps healthy headroom at CONSERVE when a non-budget read failed', () => {
    const s = derive({ reads: { budgets: true, burn: false, revenue: false } })
    expect(s.state).toBe('CONSERVE')
    expect(s.reasons).toContain('reads_unavailable')
  })

  it('distinguishes a successful read of nothing from a failed read', () => {
    const noBudget = derive({ scopes: [], reads: { budgets: true, burn: true, revenue: true } })
    expect(noBudget.reasons).toContain('no_budget_configured')
    expect(noBudget.reasons).not.toContain('reads_unavailable')
    expect(noBudget.state).toBe('CONSERVE')
  })

  it('can never be made more permissive by a read failing, at any headroom', () => {
    const remaining = [1301.53, 300, 90, 0]
    for (const r of remaining) {
      const ok = derive({ scopes: [scope({ remainingSek: r, limitSek: 1500 })] })
      const broken = derive({
        scopes: [scope({ remainingSek: r, limitSek: 1500 })],
        reads: { budgets: true, burn: false, revenue: true },
      })
      expect(
        SURVIVAL_STATES.indexOf(broken.state),
        `remaining ${r}: ${broken.state} vs ${ok.state}`,
      ).toBeGreaterThanOrEqual(SURVIVAL_STATES.indexOf(ok.state))
    }
  })

  it('always declares infrastructure cost untracked', () => {
    expect(derive().gaps).toContain('infrastructure_cost_untracked')
    expect(derive({ funding: { kind: 'UNDECLARED' } }).gaps).toContain('infrastructure_cost_untracked')
  })
})

// ─── The ceiling ────────────────────────────────────────────────────────────

const levelIndex = (l: AutonomyLicenseLevel) => AUTONOMY_LICENSE_LEVELS.indexOf(l)

describe('survival ceiling', () => {
  it('maps the five states onto Chapter 18 fallback levels', () => {
    expect(SURVIVAL_CEILING.HIBERNATE).toBe('L0')
    expect(SURVIVAL_CEILING.CRITICAL).toBe('L1')
    expect(SURVIVAL_CEILING.CONSERVE).toBe('L3')
    expect(SURVIVAL_CEILING.NORMAL).toBe('L6')
    expect(SURVIVAL_CEILING.EXPAND).toBe('L6')
  })

  it('HIBERNATE maps to L0 — observe only', () => {
    const s = derive({ scopes: [scope({ remainingSek: 0, limitSek: 1500 })] })
    expect(s.state).toBe('HIBERNATE')
    expect(survivalCeiling(s.state)).toBe('L0')
  })

  it('CRITICAL maps to at most L1', () => {
    const s = derive({ scopes: [scope({ remainingSek: 90, limitSek: 1500 })] })
    expect(s.state).toBe('CRITICAL')
    expect(levelIndex(survivalCeiling(s.state))).toBeLessThanOrEqual(levelIndex('L1'))
  })

  it('CONSERVE maps to at most L3', () => {
    const s = derive({ scopes: [scope({ remainingSek: 300, limitSek: 1500 })] })
    expect(s.state).toBe('CONSERVE')
    expect(levelIndex(survivalCeiling(s.state))).toBeLessThanOrEqual(levelIndex('L3'))
  })

  it('EXPAND and NORMAL add no restriction at all', () => {
    for (const state of ['EXPAND', 'NORMAL'] as SurvivalState[]) {
      for (const licensed of AUTONOMY_LICENSE_LEVELS) {
        expect(effectiveAutonomy(licensed, state)).toBe(licensed)
      }
    }
  })

  it('NEVER exceeds the licensed level — exhaustively, every level × every state', () => {
    for (const licensed of AUTONOMY_LICENSE_LEVELS) {
      for (const state of SURVIVAL_STATES) {
        const effective = effectiveAutonomy(licensed, state)
        expect(
          levelIndex(effective),
          `licensed ${licensed} under ${state} → ${effective}`,
        ).toBeLessThanOrEqual(levelIndex(licensed))
      }
    }
  })

  it('lowers the licensed level whenever the ceiling is below it', () => {
    expect(effectiveAutonomy('L6', 'CONSERVE')).toBe('L3')
    expect(effectiveAutonomy('L6', 'CRITICAL')).toBe('L1')
    expect(effectiveAutonomy('L6', 'HIBERNATE')).toBe('L0')
    expect(effectiveAutonomy('L1', 'CONSERVE')).toBe('L1') // already below the ceiling
    expect(effectiveAutonomy('L0', 'EXPAND')).toBe('L0') // a ceiling never raises
  })

  it('lowestAutonomy is commutative and never raises either operand', () => {
    for (const a of AUTONOMY_LICENSE_LEVELS) {
      for (const b of AUTONOMY_LICENSE_LEVELS) {
        const m = lowestAutonomy(a, b)
        expect(m).toBe(lowestAutonomy(b, a))
        expect(levelIndex(m)).toBeLessThanOrEqual(levelIndex(a))
        expect(levelIndex(m)).toBeLessThanOrEqual(levelIndex(b))
      }
    }
  })

  it('always names the scale, so a bare "L3" never reaches an operator', () => {
    for (const state of SURVIVAL_STATES) {
      expect(describeCeiling(state)).toContain('Autonomy License')
    }
  })

  it('keeps level vocabulary out of the reason and gap sets', () => {
    // Asserted on the actual values, not on the source text: a reason or gap
    // that read 'L3' would be an unqualified level in a policy identifier, which
    // RISK-AND-AUTHORITY.md §0 forbids.
    for (const reason of SURVIVAL_REASONS) expect(reason).not.toMatch(/^L[0-6]$/)
    for (const gap of SURVIVAL_GAPS) expect(gap).not.toMatch(/^L[0-6]$/)
  })
})

// ─── Direction of every cap ─────────────────────────────────────────────────

describe('MECHANICAL: degrading any input can never improve the state', () => {
  // The core invariant, swept rather than sampled: enumerate a matrix of inputs,
  // apply each degradation, and assert the state never becomes less restrictive.
  // An example-based test can only show that the cases someone thought of are
  // safe; this shows that the DIRECTION is safe across the matrix.
  const HEADROOMS = [0.95, 0.6, 0.4, 0.2, 0.05, 0]
  const KNOWN_FUNDING = [0, -100, 1, 20, 80, 5_000, 120_000]
  const FUNDINGS: FundingReading[] = [
    { kind: 'UNDECLARED' },
    { kind: 'UNAVAILABLE' },
    ...KNOWN_FUNDING.map(
      declaredFundingSek => ({ kind: 'KNOWN', declaredFundingSek }) as const,
    ),
  ]
  const READS: SurvivalInput['reads'][] = [
    { budgets: true, burn: true, revenue: true },
    { budgets: true, burn: false, revenue: true },
    { budgets: false, burn: false, revenue: false },
  ]
  const BURNS = [null, 0, 8.3, 500]

  function base(hFraction: number, funding: FundingReading, reads: SurvivalInput['reads'], burn: number | null): SurvivalInput {
    return {
      scopes: [scope({ limitSek: 1500, remainingSek: hFraction * 1500 })],
      reads,
      burnSekPerDay: burn,
      funding,
      // The sweep below is about HEADROOM monotonicity, so it holds the scope
      // fixed at complete. The partial-scope rule has its own dedicated block.
      runwayCoverage: 'PLATFORM_COMPLETE',
      revenueTrendSek: 12,
      operatingPaused: false,
    }
  }

  const idx = (s: SurvivalInput) => SURVIVAL_STATES.indexOf(derive(s).state)
  const atLeast = (state: string, floor: SurvivalState) =>
    SURVIVAL_STATES.indexOf(state as SurvivalState) >= SURVIVAL_STATES.indexOf(floor)

  it('worsening headroom never improves the state', () => {
    for (const funding of FUNDINGS) {
      for (const reads of READS) {
        for (const burn of BURNS) {
          for (let i = 1; i < HEADROOMS.length; i++) {
            const good = base(HEADROOMS[i - 1], funding, reads, burn)
            const worse = base(HEADROOMS[i], funding, reads, burn)
            expect(
              idx(worse),
              `headroom ${HEADROOMS[i - 1]}→${HEADROOMS[i]} (${JSON.stringify(funding)}, burn ${burn})`,
            ).toBeGreaterThanOrEqual(idx(good))
          }
        }
      }
    }
  })

  it('a LOST funding reading always yields HIBERNATE — never anything more permissive', () => {
    // The owner's requirement, swept: the floor for UNAVAILABLE applies whatever
    // the headroom, whatever the burn, whatever the other reads say.
    for (const h of HEADROOMS) {
      for (const reads of READS) {
        for (const burn of BURNS) {
          const s = derive({ ...base(h, { kind: 'UNAVAILABLE' }, reads, burn) })
          expect(s.state, `UNAVAILABLE at headroom ${h}, burn ${burn}`).toBe('HIBERNATE')
          expect(atLeast(s.state, 'CRITICAL')).toBe(true)
          expect(s.reasons).toContain('funding_unavailable')
          expect(s.gaps).toContain('funding_unavailable')
          expect(s.runwayDays).toBeNull()
        }
      }
    }
  })

  it('KNOWN → UNAVAILABLE can never make the state more permissive', () => {
    // THE regression this redesign exists to prevent. Before the discriminated
    // union, a known-near-zero position (CRITICAL) became CONSERVE when the
    // reading was lost — a ceiling that ROSE when information disappeared.
    for (const h of HEADROOMS) {
      for (const reads of READS) {
        for (const burn of BURNS) {
          for (const declaredFundingSek of KNOWN_FUNDING) {
            const known = derive({
              ...base(h, { kind: 'KNOWN', declaredFundingSek }, reads, burn),
            })
            const lost = derive({ ...base(h, { kind: 'UNAVAILABLE' }, reads, burn) })
            expect(
              SURVIVAL_STATES.indexOf(lost.state),
              `KNOWN(${declaredFundingSek}) ${known.state} → UNAVAILABLE ${lost.state} `
              + `at headroom ${h}, burn ${burn}`,
            ).toBeGreaterThanOrEqual(SURVIVAL_STATES.indexOf(known.state))
          }
        }
      }
    }
  })

  it('UNDECLARED is a FLOOR, not a ceiling — and never reaches NORMAL or EXPAND', () => {
    // UNDECLARED is the owner's CONSERVE policy floor: a deliberate, stable
    // absence rather than a lost reading. It is therefore NOT required to be at
    // least as restrictive as a known-near-zero figure, and the one case where
    // it is less restrictive is recorded explicitly below so it cannot drift.
    for (const h of HEADROOMS) {
      for (const reads of READS) {
        for (const burn of BURNS) {
          const s = derive({ ...base(h, { kind: 'UNDECLARED' }, reads, burn) })
          expect(s.state).not.toBe('EXPAND')
          expect(s.state).not.toBe('NORMAL')
          expect(atLeast(s.state, FUNDING_UNDECLARED_FLOOR)).toBe(true)
          expect(s.runwayDays).toBeNull()
        }
      }
    }

    // RECORDED, OWNER-ACCEPTED: a known figure may be MORE restrictive than
    // undeclared, because undeclared is fixed at the CONSERVE floor while a
    // known figure can be as bad as HIBERNATE. This asymmetry is confined to
    // UNDECLARED — it is a policy floor the owner chose, not a telemetry
    // failure — and it can never reach NORMAL or EXPAND.
    const knownNearZero = derive({
      funding: { kind: 'KNOWN', declaredFundingSek: 1 }, burnSekPerDay: 8.3,
    })
    const undeclared = derive({ funding: { kind: 'UNDECLARED' }, burnSekPerDay: 8.3 })
    expect(knownNearZero.state).toBe('CRITICAL')
    expect(undeclared.state).toBe('CONSERVE')
  })

  it('zero or negative KNOWN funding is HIBERNATE, whatever the headroom', () => {
    for (const h of HEADROOMS) {
      for (const declaredFundingSek of [0, -100]) {
        const s = derive({ ...base(h, { kind: 'KNOWN', declaredFundingSek }, READS[0], 8.3) })
        expect(s.state, `KNOWN(${declaredFundingSek}) at headroom ${h}`).toBe('HIBERNATE')
        expect(s.reasons).toContain('funding_depleted')
      }
    }
  })

  it('failing more reads never improves the state', () => {
    for (const h of HEADROOMS) {
      for (const funding of FUNDINGS) {
        for (const burn of BURNS) {
          const all = base(h, funding, READS[0], burn)
          const oneGone = base(h, funding, READS[1], burn)
          const allGone = base(h, funding, READS[2], burn)
          expect(idx(oneGone), `one read gone at ${h}`).toBeGreaterThanOrEqual(idx(all))
          expect(idx(allGone), `all reads gone at ${h}`).toBeGreaterThanOrEqual(idx(all))
          expect(idx(allGone), `all vs one gone at ${h}`).toBeGreaterThanOrEqual(idx(oneGone))
        }
      }
    }
  })

  it('a worse revenue signal never improves the state', () => {
    for (const h of HEADROOMS) {
      for (const funding of FUNDINGS) {
        for (const burn of BURNS) {
          const positive = { ...base(h, funding, READS[0], burn), revenueTrendSek: 50 }
          const flat = { ...base(h, funding, READS[0], burn), revenueTrendSek: 0 }
          const missing = { ...base(h, funding, READS[0], burn), revenueTrendSek: null }
          expect(idx(flat)).toBeGreaterThanOrEqual(idx(positive))
          expect(idx(missing)).toBeGreaterThanOrEqual(idx(positive))
        }
      }
    }
  })
})

describe('every cap moves toward HIBERNATE, never away', () => {
  it('mostRestrictive returns the more restrictive of two states', () => {
    for (const a of SURVIVAL_STATES) {
      for (const b of SURVIVAL_STATES) {
        const m = mostRestrictive(a, b)
        expect(SURVIVAL_STATES.indexOf(m)).toBeGreaterThanOrEqual(SURVIVAL_STATES.indexOf(a))
        expect(SURVIVAL_STATES.indexOf(m)).toBeGreaterThanOrEqual(SURVIVAL_STATES.indexOf(b))
      }
    }
  })

  it('applying a cap can never make a state more permissive', () => {
    // A cap IS mostRestrictive — there is deliberately no second function for
    // it. 'Cap at CONSERVE' means 'not more permissive than CONSERVE', which is
    // the same max-over-index as combining two sources.
    for (const state of SURVIVAL_STATES) {
      for (const cap of SURVIVAL_STATES) {
        expect(SURVIVAL_STATES.indexOf(mostRestrictive(state, cap)))
          .toBeGreaterThanOrEqual(SURVIVAL_STATES.indexOf(state))
      }
    }
  })
})

// ─── Structural guards ──────────────────────────────────────────────────────

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

/**
 * Source with comments removed.
 *
 * Most guards below ask "does this file DO X", and a file that explains what it
 * refuses to do names the very thing it avoids. This codebase has a documented
 * history of exactly that mistake: G3A's rot-guard matched an explanatory
 * comment rather than an authorisation branch, which is why the G3C-1
 * replacement reads the comparison. So these guards scan CODE, never
 * documentation.
 */
function readCode(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('the pure core stays pure', () => {
  for (const file of ['lib/atlas/survival/derive.ts', 'lib/atlas/survival/ceiling.ts']) {
    it(`${file} has no clock, no I/O and no await`, () => {
      const src = readCode(file)
      expect(src, `${file} reads the clock`).not.toMatch(/\bDate\.now\b|\bnew Date\b/)
      expect(src, `${file} awaits`).not.toMatch(/\bawait\b/)
      expect(src, `${file} does I/O`).not.toMatch(/\bfetch\s*\(|createAdminClient|readFile/)
    })
  }

  it('the derivation takes its instant as a parameter', () => {
    const src = readCode('lib/atlas/survival/derive.ts')
    expect(src).toMatch(/options:\s*DeriveOptions/)
    expect(src).toContain('asOf: options.at')
  })
})

describe('one budget system, and this is not one', () => {
  it('never reserves — a status check must not consume headroom', () => {
    const src = readCode('lib/atlas/survival/snapshot.ts')
    expect(src).not.toMatch(/budget_reserve|reserveSpend|settleSpend|releaseSpend/)
  })

  it('reads headroom through budget_headroom, the gate\'s own function', () => {
    expect(readCode('lib/atlas/survival/snapshot.ts')).toContain("rpc('budget_headroom'")
  })

  it('depends on no part of the categorical authority chain', () => {
    // The authority chain (Mission → Delegation → WorkPackage, and the
    // authorization/decision ledgers) is a different system answering a
    // different question. A licence NARROWS this ceiling; this ceiling must
    // never reach into it. (`MissionBudget` is named in a comment in types.ts
    // precisely to record that it is deliberately NOT used — so this asserts on
    // imports, not on the word.)
    for (const f of ['types.ts', 'derive.ts', 'ceiling.ts', 'snapshot.ts', 'index.ts']) {
      const src = readCode(`lib/atlas/survival/${f}`)
      expect(src, `${f} imports the authority chain`).not.toMatch(
        /from ['"][^'"]*atlas\/(mission|delegation|workpackage|authorization|decision-ledger|code-work)/,
      )
    }
  })

  it('reaches lib/cost only for the BudgetScope type, never for behaviour', () => {
    for (const f of ['types.ts', 'derive.ts', 'ceiling.ts', 'snapshot.ts']) {
      const src = readCode(`lib/atlas/survival/${f}`)
      const costImports = src.match(/from ['"]@\/lib\/cost\/[^'"]+['"]/g) ?? []
      for (const imp of costImports) {
        // A type-only import is erased at compile time and leaves no runtime
        // edge — the same deliberate pattern `execution-stop.ts` uses for
        // `ProjectRef`.
        expect(imp, `${f}: ${imp}`).toMatch(/from ['"]@\/lib\/cost\/budget-gate['"]/)
      }
    }
  })

  it('ships no migration', () => {
    const files = readdirSync(resolve(process.cwd(), 'lib/atlas/survival'))
    expect(files.filter(f => f.endsWith('.sql'))).toEqual([])
  })
})

describe('the thresholds cannot be mistaken for approved policy', () => {
  const THRESHOLDS = [
    'CRITICAL_HEADROOM_FRACTION',
    'CONSERVE_HEADROOM_FRACTION',
    'EXPAND_MIN_HEADROOM_FRACTION',
    'RUNWAY_CRITICAL_DAYS',
    'RUNWAY_CONSERVE_DAYS',
    'EXPAND_MIN_RUNWAY_DAYS',
  ]

  it('every threshold constant is EXPORTED with the PROVISIONAL_ prefix', () => {
    // The name is the signal. A phase that approves these numbers must rename
    // them, which puts the act in the diff instead of letting an implementer's
    // choice drift into policy through nobody's decision.
    const src = readCode('lib/atlas/survival/derive.ts')
    for (const name of THRESHOLDS) {
      expect(src, `missing PROVISIONAL_${name}`).toContain(`export const PROVISIONAL_${name} =`)
    }
  })

  it('no threshold is exported WITHOUT the prefix', () => {
    const src = readCode('lib/atlas/survival/derive.ts')
    for (const bare of THRESHOLDS) {
      expect(src, `${bare} exported unqualified`).not.toContain(`export const ${bare} =`)
    }
  })

  it('declares its own status rather than leaving it to prose', () => {
    expect(SURVIVAL_THRESHOLD_STATUS).toBe('provisional')
    expect(PROVISIONAL_POLICY_NOTICE).toMatch(/provisional/i)
    expect(PROVISIONAL_POLICY_NOTICE).toMatch(/not owner-approved/i)
    // The corrected claim: the thresholds ARE applied, to the Phase 1
    // observation. Only the wiring to anything that acts is absent.
    expect(PROVISIONAL_POLICY_NOTICE).toMatch(/ARE applied/i)
    expect(PROVISIONAL_POLICY_NOTICE).not.toMatch(/applied to nothing/i)
    expect(PROVISIONAL_POLICY_NOTICE).toMatch(/NOT wired to execution/i)
  })

  it('travels to the surface that shows the numbers to an operator', () => {
    // An operator reading the API never sees the source, so the notice must
    // ride with the response in BOTH branches.
    const src = readCode('app/api/system/survival/route.ts')
    expect(src).toContain('SURVIVAL_THRESHOLD_STATUS')
    expect(src).toContain('PROVISIONAL_POLICY_NOTICE')
    expect(src.match(/\.\.\.policy,/g) ?? []).toHaveLength(2)
  })
})

describe('read-only, with a closed consumer set', () => {
  // PHASE 1 asserted this module was inert: nothing imported it at all. Phase 1b
  // deliberately broke that, with owner approval, by displaying the observation
  // in Systemhälsa. The guard is therefore rewritten rather than deleted — the
  // property that matters now is not "nobody reads it" but "ONLY these read it".
  //
  // Any new importer fails this test. That is the point: a module whose ceiling
  // can narrow autonomy should not silently acquire consumers, and adding one
  // should be a deliberate edit to this list rather than an accident nobody sees.
  it('only the route and the Systemhälsa surface import it', () => {
    const roots = ['lib', 'app', 'components'].map(r => resolve(process.cwd(), r))
    const allowPrefixes = [
      resolve(process.cwd(), 'lib/atlas/survival'),
      resolve(process.cwd(), 'lib/qa/survival-derivation.test.ts'),
      resolve(process.cwd(), 'app/api/system/survival'),
      // Phase 1b's own suite imports the backend deliberately: it asserts the
      // surface renders the module's OWN strings rather than fixture copies.
      resolve(process.cwd(), 'lib/qa/system-health-survival.test.ts'),
      // Phase 2A's structural suite, for the same reason.
      resolve(process.cwd(), 'lib/qa/survival-history.test.ts'),
      // Phase 2A's SQL suite and Phase 2B's two suites: they prove the record
      // and the funding boundary against real PostgreSQL and against the code.
      resolve(process.cwd(), 'lib/qa/survival-history-sql.test.ts'),
      resolve(process.cwd(), 'lib/qa/survival-funding.test.ts'),
      resolve(process.cwd(), 'lib/qa/survival-funding-sql.test.ts'),
      // Phase 1b — display only. The loader carries the observation into the
      // system-health model, and the Systemhälsa view renders it.
      resolve(process.cwd(), 'lib/os/system-health'),
      resolve(process.cwd(), 'components/platform/vnext/SystemHealth'),
      // Phase 3B0 — the platform-runtime adapter, added DELIBERATELY.
      //
      // This is the first consumer that exists to feed an autonomy decision
      // rather than to display one, which is precisely the kind of change this
      // list is designed to make visible. It is added as a single FILE rather
      // than the `autonomy-runtime` directory so that any further consumer —
      // and in particular anything on an execution path — has to be added here
      // by hand too.
      //
      // The adapter itself is still INERT: a separate guard (autonomy-runtime
      // suite) proves no execution module imports it, so adding it here does
      // not make the ceiling reachable from execution.
      resolve(process.cwd(), 'lib/atlas/autonomy-runtime/platform-survival.ts'),
      // Phase 3B0's own suite: it drives the adapter and asserts the pure
      // ceiling rules (null → L0, hostile state → L0), which requires importing
      // the backend rather than copying its constants.
      resolve(process.cwd(), 'lib/qa/autonomy-runtime-foundation.test.ts'),
    ]
    const offenders: string[] = []

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '.next' || entry === '.turbo') continue
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.(ts|tsx)$/.test(entry)) continue
        if (allowPrefixes.some(p => full.startsWith(p))) continue
        if (readFileSync(full, 'utf8').includes('atlas/survival')) offenders.push(full)
      }
    }
    for (const root of roots) walk(root)

    expect(offenders, `unexpected importers: ${offenders.join(', ')}`).toEqual([])
  })

  it('the route is a read-only GET that takes no request input', () => {
    const src = readCode('app/api/system/survival/route.ts')
    expect(src).toMatch(/export async function GET\(\)/)
    expect(src).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/)
    // A caller that could supply the funding figure could choose the input that
    // governs its own expansion ceiling. The signature above already proves the
    // handler accepts nothing; these prove it cannot reach for anything either.
    expect(src).not.toMatch(/NextRequest|searchParams|URL\(/)
    // Phase 2B: the route no longer NAMES a funding state at all. Funding is a
    // canonical read and coverage is derived from the caller's real project set,
    // so the route must pass neither — naming a state by hand was the Phase 1
    // placeholder, and asserting it now would be asserting the placeholder.
    expect(src).not.toContain('kind:')
    expect(src).not.toMatch(/testRunwayCoverage|runwayCoverage:/)
    expect(src).toMatch(/readSurvivalSnapshot\(access\.allowedProjectIds\)/)
  })

  it('the route is session-authenticated and project-scoped', () => {
    const src = readCode('app/api/system/survival/route.ts')
    expect(src).toContain('resolveProjectAccess()')
    expect(src).toContain('access.response')
    expect(src).toContain('access.allowedProjectIds')
  })

  it('calls no provider and touches no scheduler', () => {
    for (const f of ['types.ts', 'derive.ts', 'ceiling.ts', 'snapshot.ts', 'index.ts']) {
      const src = readCode(`lib/atlas/survival/${f}`)
      expect(src, `${f} reaches a provider`).not.toMatch(
        /anthropic|openai|elevenlabs|ideogram|muapi|getAnthropic|@\/lib\/media/,
      )
      expect(src, `${f} touches a scheduler`).not.toMatch(/cron|schedule/i)
      expect(src, `${f} reads the environment`).not.toMatch(/process\.env/)
    }
  })

  it('scopes every read to the caller-supplied project allow-list', () => {
    // The allow-list is the tenancy boundary. A read that forgot it would return
    // another tenant's burn, headroom or revenue.
    const src = readCode('lib/atlas/survival/snapshot.ts')
    expect(src).toContain("allowedProjectIds.includes(row.project_id")
    expect((src.match(/\.in\('project_id', allowedProjectIds\)/g) ?? [])).toHaveLength(2)
  })

  it('returns no secret and no environment value', () => {
    const src = readCode('app/api/system/survival/route.ts')
    expect(src).not.toMatch(/process\.env|credential|secret|token/i)
  })

  it('performs no write of any kind, anywhere in the subsystem', () => {
    // The strongest form of the claim: not "does not pause", but "cannot write".
    // One SELECT set and one read-only RPC is the entire database surface.
    for (const f of ['types.ts', 'derive.ts', 'ceiling.ts', 'snapshot.ts', 'index.ts']) {
      const src = readCode(`lib/atlas/survival/${f}`)
      expect(src, `${f} inserts`).not.toMatch(/\.insert\s*\(|\.upsert\s*\(/)
      expect(src, `${f} updates`).not.toMatch(/\.update\s*\(/)
      expect(src, `${f} deletes`).not.toMatch(/\.delete\s*\(/)
      expect(src, `${f} touches the stop authority`).not.toMatch(/stop_set_(platform|project)/)
    }
  })
})

// ─── Phase 2B: runway coverage ──────────────────────────────────────────────

describe('runway coverage — a partial scope may only restrict', () => {
  const COMPLETE_SCOPE = [scope({ limitSek: 1500, remainingSek: 1500 })]

  it('computes runway only when the scope is platform-complete', () => {
    const complete = derive({ runwayCoverage: 'PLATFORM_COMPLETE' })
    expect(complete.runwayDays).not.toBeNull()
    expect(complete.runwayCoverage).toBe('PLATFORM_COMPLETE')
    expect(complete.gaps).not.toContain('runway_scope_incomplete')
  })

  it('withholds runway on a partial scope, and says WHICH kind of unknown it is', () => {
    const partial = derive({ runwayCoverage: 'PARTIAL_SCOPE' })
    expect(partial.runwayDays).toBeNull()
    expect(partial.runwayCoverage).toBe('PARTIAL_SCOPE')
    // The distinguishing gap. Without it a reader could not tell this from a
    // complete scope that simply had no burn to measure.
    expect(partial.gaps).toContain('runway_scope_incomplete')
    expect(partial.gaps).not.toContain('runway_unknown')
  })

  it('caps a partial scope at CRITICAL even with ample headroom and revenue', () => {
    // This is the load-bearing rule. Under v1 this exact input was EXPAND:
    // healthy headroom, positive revenue, and 120 000 / 8.3 days of runway.
    const partial = derive({
      scopes: COMPLETE_SCOPE,
      runwayCoverage: 'PARTIAL_SCOPE',
    })
    const complete = derive({ scopes: COMPLETE_SCOPE, runwayCoverage: 'PLATFORM_COMPLETE' })
    expect(complete.state).toBe('EXPAND')
    expect(partial.state).toBe('CRITICAL')
  })

  it('a partial scope can NEVER reach EXPAND or NORMAL, for any headroom', () => {
    for (const remaining of [1500, 1200, 900, 600, 400, 100]) {
      const s = derive({ scopes: [scope({ limitSek: 1500, remainingSek: remaining })],
                         runwayCoverage: 'PARTIAL_SCOPE' })
      expect(SURVIVAL_STATES.indexOf(s.state), `remaining=${remaining}`)
        .toBeGreaterThanOrEqual(SURVIVAL_STATES.indexOf('CONSERVE'))
    }
  })

  it('changing ONLY the coverage can never raise the state — the monotonicity that matters', () => {
    // The whole point: losing RUNWAY information must not buy MORE autonomy.
    //
    // Scoped deliberately. Every case below supplies the SAME measurements to
    // both coverages, so the only thing under test is the coverage change. This
    // is not a claim that a real project-scoped observation is always at least
    // as restrictive as a real platform-complete one — it is not, because
    // headroom is itself scope-dependent and a platform-complete set can see a
    // project whose headroom is exhausted. That divergence is the headroom
    // measurement's, not runway's.
    //
    // The last two cases are the ones that exposed the defect. The original set
    // varied HEADROOM only, and every one of those cases has a runway long
    // enough that the complete observation is not pulled further down — so a
    // CONSERVE cap looked safe. A short BURN-derived runway is what breaks it:
    // the complete observation becomes CRITICAL, and a CONSERVE cap would then
    // sit a whole level above it. That is a ceiling raised by losing runway
    // information, and it is the direction this subsystem must never move.
    for (const over of [
      {}, { revenueTrendSek: 0 }, { scopes: [scope({ limitSek: 1500, remainingSek: 300 })] },
      { scopes: [scope({ limitSek: 1500, remainingSek: 90 })] },
      // Ample headroom, so the state is set by RUNWAY alone: 100 SEK over
      // 50 SEK/day is 2 days, under the critical threshold.
      { funding: { kind: 'KNOWN', declaredFundingSek: 100 }, burnSekPerDay: 50 },
      { funding: { kind: 'KNOWN', declaredFundingSek: 300 }, burnSekPerDay: 50 },
    ] as Partial<SurvivalInput>[]) {
      const wide = derive({ ...over, runwayCoverage: 'PLATFORM_COMPLETE' })
      const narrow = derive({ ...over, runwayCoverage: 'PARTIAL_SCOPE' })
      expect(SURVIVAL_STATES.indexOf(narrow.state), JSON.stringify(over))
        .toBeGreaterThanOrEqual(SURVIVAL_STATES.indexOf(wide.state))
      // And the ceiling follows the state, never the capital: losing runway
      // information cannot raise what the licence permits.
      expect(effectiveAutonomy('L6', narrow.state)).toBe(survivalCeiling(narrow.state))
    }
  })

  it('COVERAGE monotonicity holds exhaustively, with every other input held equal', () => {
    // The invariant as a property rather than an example, stated at exactly the
    // strength it has:
    //
    //   For EVERY combination of funding, burn, headroom and revenue the
    //   derivation accepts, flipping ONLY the coverage from PLATFORM_COMPLETE to
    //   PARTIAL_SCOPE — with all four of those inputs IDENTICAL on both sides —
    //   may never yield a more permissive state.
    //
    // That "identical on both sides" is the entire content. The requirement is
    // NOT that a real one-project observation is always at least as restrictive
    // as a real platform-complete one; headroom is scope-dependent, so a
    // platform-complete set can include a project whose headroom is exhausted
    // while a different single project's is not. That gap is headroom's, not
    // runway's, and it is outside what this rule can speak to.
    //
    // Holding the inputs fixed, the only divergence coverage can introduce is
    // the short-runway path: depleted funding and exhausted headroom are
    // reachable in both coverages from the same input, so CRITICAL is the exact
    // upper bound of what the coverage change can cost.
    const fundings = [
      { kind: 'UNDECLARED' }, { kind: 'UNAVAILABLE' },
      { kind: 'KNOWN', declaredFundingSek: 0 },
      { kind: 'KNOWN', declaredFundingSek: -10 },
      { kind: 'KNOWN', declaredFundingSek: 50 },
      { kind: 'KNOWN', declaredFundingSek: 100 },
      { kind: 'KNOWN', declaredFundingSek: 400 },
      { kind: 'KNOWN', declaredFundingSek: 120_000 },
    ] as SurvivalInput['funding'][]
    const burns = [null, 0, 0.5, 8.3, 50, 4000]
    const remainings = [1500, 900, 300, 90, 0, -25]
    const revenues = [null, 0, -5, 250]

    let checked = 0
    for (const funding of fundings) {
      for (const burnSekPerDay of burns) {
        for (const remainingSek of remainings) {
          for (const revenueTrendSek of revenues) {
            const over = {
              funding, burnSekPerDay, revenueTrendSek,
              scopes: [scope({ limitSek: 1500, remainingSek })],
            } as Partial<SurvivalInput>
            const wide = derive({ ...over, runwayCoverage: 'PLATFORM_COMPLETE' })
            const narrow = derive({ ...over, runwayCoverage: 'PARTIAL_SCOPE' })
            const label = `funding=${JSON.stringify(funding)} burn=${burnSekPerDay} rem=${remainingSek} rev=${revenueTrendSek}`
            expect(SURVIVAL_STATES.indexOf(narrow.state), label)
              .toBeGreaterThanOrEqual(SURVIVAL_STATES.indexOf(wide.state))
            // Never a positive runway on a partial scope — the same rule the
            // table's `survival_events_coverage_runway_valid` CHECK enforces.
            if (narrow.runwayDays !== null) expect(narrow.runwayDays, label).toBeLessThanOrEqual(0)
            checked += 1
          }
        }
      }
    }
    // Guards against the matrix silently collapsing to nothing.
    expect(checked).toBe(fundings.length * burns.length * remainings.length * revenues.length)
  })

  it('KNOWN zero and negative stay HIBERNATE in BOTH coverages', () => {
    // "There is nothing to spend" does not become less true by looking at less
    // of the platform, so coverage must not touch these.
    for (const kind of [0, -1, -125.5]) {
      for (const coverage of ['PLATFORM_COMPLETE', 'PARTIAL_SCOPE'] as const) {
        const s = derive({ funding: { kind: 'KNOWN', declaredFundingSek: kind }, runwayCoverage: coverage })
        expect(s.state, `funding=${kind} coverage=${coverage}`).toBe('HIBERNATE')
        expect(s.runwayDays).toBe(0)
      }
    }
  })

  it('UNAVAILABLE stays HIBERNATE in both coverages', () => {
    for (const coverage of ['PLATFORM_COMPLETE', 'PARTIAL_SCOPE'] as const) {
      const s = derive({ funding: { kind: 'UNAVAILABLE' }, runwayCoverage: coverage })
      expect(s.state, coverage).toBe('HIBERNATE')
      expect(s.runwayDays).toBeNull()
    }
  })

  it('UNDECLARED stays CONSERVE in both coverages, with runway null', () => {
    for (const coverage of ['PLATFORM_COMPLETE', 'PARTIAL_SCOPE'] as const) {
      const s = derive({ funding: { kind: 'UNDECLARED' }, runwayCoverage: coverage })
      expect(s.state, coverage).toBe('CONSERVE')
      expect(s.runwayDays).toBeNull()
    }
  })

  it('a complete scope with no measured burn is runway_unknown, NOT the scope gap', () => {
    const s = derive({ runwayCoverage: 'PLATFORM_COMPLETE', burnSekPerDay: null })
    expect(s.runwayDays).toBeNull()
    expect(s.gaps).toContain('runway_unknown')
    expect(s.gaps).not.toContain('runway_scope_incomplete')
  })

  it('never manufactures Infinity when burn is zero', () => {
    const s = derive({ runwayCoverage: 'PLATFORM_COMPLETE', burnSekPerDay: 0 })
    expect(s.runwayDays).toBeNull()
    expect(Number.isFinite(s.runwayDays ?? 0)).toBe(true)
  })

  it('carries the coverage onto the snapshot so a stored row can explain itself', () => {
    expect(derive({ runwayCoverage: 'PARTIAL_SCOPE' }).runwayCoverage).toBe('PARTIAL_SCOPE')
    expect(derive({ runwayCoverage: 'PLATFORM_COMPLETE' }).runwayCoverage).toBe('PLATFORM_COMPLETE')
  })
})
