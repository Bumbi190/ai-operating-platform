/**
 * Phase 3B0 — the autonomy runtime FOUNDATION, proven while still inert.
 *
 * ── WHAT THIS SUITE IS FOR ──────────────────────────────────────────────────
 * The foundation is deliberately unreachable from execution. That makes it
 * exactly the kind of code that rots quietly: nothing exercises it, so nothing
 * notices when a rule inverts. So every rule the phase states is pinned here,
 * and the INERTNESS itself is a test rather than a claim.
 *
 * Three families:
 *
 *   1. the POLICY TABLE — exhaustive, explicit, and unable to acquire a new
 *      action kind without a reviewed edit;
 *   2. the ADMISSION CORE — pure, fail-closed, and ordered so that an
 *      ineffective licence can never be rescued by its own historical scope;
 *   3. the PLATFORM SURVIVAL ADAPTER — no caller input, and L0 on any failure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

vi.mock('server-only', () => ({}))

// ── Adapter seams, controllable per test ────────────────────────────────────
// The adapter reuses the canonical whole-platform population reader rather than
// enumerating projects itself, so that reader is the seam to control.
const portfolioReader = vi.fn()
vi.mock('@/lib/auth/portfolio-authority', () => ({
  serviceRolePortfolioReader: (...a: unknown[]) => portfolioReader(...a),
}))

const snapshot = vi.fn()
vi.mock('@/lib/atlas/survival', async orig => ({
  ...(await orig<typeof import('@/lib/atlas/survival')>()),
  readSurvivalSnapshot: (...a: unknown[]) => snapshot(...a),
}))

import {
  AUTONOMY_RUNTIME_POLICY,
  LICENCE_EXEMPT_OBSERVATION_KINDS,
  NOT_EXECUTABLE_KINDS,
  autonomyPolicyFor,
} from '@/lib/atlas/autonomy-runtime/policy'
import { admitAutonomyAction } from '@/lib/atlas/autonomy-runtime/admission'
import { readPlatformSurvivalCeiling } from '@/lib/atlas/autonomy-runtime/platform-survival'
import { ACTION_REGISTRY, type ActionKind } from '@/lib/workflows/action-registry'
import { SURVIVAL_STATES, type SurvivalState } from '@/lib/atlas/survival/types'
import { survivalCeiling, effectiveAutonomy, lowestAutonomy, SURVIVAL_CEILING }
  from '@/lib/atlas/survival/ceiling'
import { observeEffectiveAutonomy } from '@/lib/atlas/autonomy-license/compose'
import { noLicense, type ResolvedAutonomyLicense } from '@/lib/atlas/autonomy-license/types'
import { AUTONOMY_LICENSE_LEVELS, type AutonomyLicenseLevel }
  from '@/lib/atlas/autonomy-license/levels'

const APP = process.cwd()
const ALL_KINDS = Object.keys(ACTION_REGISTRY) as ActionKind[]

/**
 * An EFFECTIVE licence. Built by hand because Phase 2C's reader needs a
 * database; this suite is about what the runtime layer does with a resolved
 * licence, not about how one is resolved.
 */
function effectiveLicence(over: Partial<ResolvedAutonomyLicense> = {}): ResolvedAutonomyLicense {
  return {
    status: 'active',
    effective: true,
    reason: 'active',
    decisionReason: null,
    licenseId: 'lic-1',
    projectId: 'proj-1',
    workflowInstanceId: 'inst-1',
    boundDefKey: 'familje-stunden.monthly-release',
    boundDefHash: 'a'.repeat(64),
    licensedLevel: 'L3',
    resolvedLevel: 'L3',
    allowedActionKinds: ['proof_governed_effect'],
    actionScopeFingerprint: 'b'.repeat(64),
    decision: { decisionId: 'd-1', version: 1, recordId: 'r-1' },
    issuer: 'user:00000000-0000-0000-0000-000000000001',
    effectiveAt: '2026-09-01T00:00:00.000Z',
    expiresAt: '2027-09-01T00:00:00.000Z',
    generation: 1,
    eventCount: 1,
    ...over,
  }
}

// ── A · the policy table is exhaustive ──────────────────────────────────────

describe('A · the policy table is exhaustive over ActionKind', () => {
  it('has exactly one entry per canonical action kind, and no extras', () => {
    expect(Object.keys(AUTONOMY_RUNTIME_POLICY).sort()).toEqual([...ALL_KINDS].sort())
  })

  it('every entry has a closed mode', () => {
    for (const kind of ALL_KINDS) {
      expect(['license_exempt_observation', 'licensed', 'unsupported'],
        kind).toContain(AUTONOMY_RUNTIME_POLICY[kind].mode)
    }
  })

  it('an unknown kind has NO policy — it does not fall back to one', () => {
    expect(autonomyPolicyFor('no_such_action')).toBeNull()
    expect(autonomyPolicyFor('')).toBeNull()
    // Hostile prototype names must not resolve through the object chain.
    expect(autonomyPolicyFor('constructor')).toBeNull()
    expect(autonomyPolicyFor('toString')).toBeNull()
  })
})

// ── B · exemption is explicit, never derived ────────────────────────────────

describe('B · the observation exemption is an explicit list, not a predicate', () => {
  it('the exempt set is exactly the reviewed list', () => {
    const exempt = ALL_KINDS.filter(k => AUTONOMY_RUNTIME_POLICY[k].mode === 'license_exempt_observation')
    expect(exempt.sort()).toEqual([...LICENCE_EXEMPT_OBSERVATION_KINDS].sort())
  })

  it('every exempt kind is genuinely READ_ONLY + read_only_observation in the registry', () => {
    for (const kind of LICENCE_EXEMPT_OBSERVATION_KINDS) {
      const meta = ACTION_REGISTRY[kind]
      expect(meta.action_class, kind).toBe('READ_ONLY')
      expect(meta.executor_family, kind).toBe('read_only_observation')
    }
  })

  it('every READ_ONLY observation kind is accounted for — no silent omission', () => {
    // The exemption is not "everything read-only"; it is a named list. This
    // asserts the two happen to coincide TODAY, so a new READ_ONLY kind shows up
    // as a failure here rather than being silently exempt or silently unsupported.
    const readOnly = ALL_KINDS.filter(k => ACTION_REGISTRY[k].action_class === 'READ_ONLY')
    expect(readOnly.sort()).toEqual([...LICENCE_EXEMPT_OBSERVATION_KINDS].sort())
  })

  it('the exemption is not implemented by a class predicate', async () => {
    const src = readFileSync(join(APP, 'lib/atlas/autonomy-runtime/policy.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    // If a rule like `action_class === 'READ_ONLY'` ever decides exemption, a
    // future READ_ONLY kind is exempted without review.
    expect(code).not.toMatch(/action_class\s*===\s*'READ_ONLY'/)
    expect(code).not.toMatch(/executor_family\s*===\s*'read_only_observation'/)
  })
})

// ── C/D/E · the special pins ────────────────────────────────────────────────

describe('C/D/E · the pinned entries', () => {
  it('proof_governed_effect is licensed at L3 — NOT L5', () => {
    const p = AUTONOMY_RUNTIME_POLICY.proof_governed_effect
    expect(p.mode).toBe('licensed')
    if (p.mode !== 'licensed') throw new Error('unreachable')
    expect(p.minimumLevel).toBe('L3')
    expect(p.requiresLicence).toBe(true)
    // The FINANCIAL class must not be read as an autonomy level.
    expect(ACTION_REGISTRY.proof_governed_effect.action_class).toBe('FINANCIAL')
    expect(p.minimumLevel).not.toBe('L5')
  })

  it('generate_monthly_story is unsupported with a closed v1 reason', () => {
    const p = AUTONOMY_RUNTIME_POLICY.generate_monthly_story
    expect(p.mode).toBe('unsupported')
    if (p.mode !== 'unsupported') throw new Error('unreachable')
    expect(p.unsupportedReason).toBe('v1_scope_incomplete')
    expect(p.detail).toMatch(/provider|model/i)
  })

  it('the not_executable kinds are explicit unsupported entries', () => {
    for (const kind of NOT_EXECUTABLE_KINDS) {
      const p = AUTONOMY_RUNTIME_POLICY[kind]
      expect(p.mode, kind).toBe('unsupported')
      if (p.mode !== 'unsupported') throw new Error('unreachable')
      expect(p.unsupportedReason, kind).toBe('not_executable')
      // And the table agrees with the registry.
      expect(ACTION_REGISTRY[kind].executor_family, kind).toBe('not_executable')
    }
  })

  it('no not_executable kind is ever licensed — enablement is not authority', () => {
    const licensed = ALL_KINDS.filter(k => AUTONOMY_RUNTIME_POLICY[k].mode === 'licensed')
    for (const kind of licensed) {
      expect(ACTION_REGISTRY[kind].executor_family, kind).not.toBe('not_executable')
    }
  })
})

// ── F/G/H · admission ordering for licensed actions ─────────────────────────

describe('F/G/H · a licensed action, in order', () => {
  const K = 'proof_governed_effect'

  it('F · an INEFFECTIVE licence refuses BEFORE scope can grant anything', () => {
    // The licence is revoked, and its HISTORICAL scope still names the action.
    // A naive `allowedActionKinds.includes(kind)` would admit this.
    const revoked = effectiveLicence({
      effective: false, status: 'revoked', reason: 'revoked', resolvedLevel: 'L0',
      allowedActionKinds: [K],
    })
    const r = admitAutonomyAction({ actionKind: K, licence: revoked, survivalCeiling: 'L6' })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('licence_not_effective')
  })

  it('G · every ineffective status retains scope and still refuses', () => {
    for (const reason of ['revoked', 'suspended', 'expired', 'superseded', 'scope_drifted'] as const) {
      const lic = effectiveLicence({
        effective: false, reason, resolvedLevel: 'L0', allowedActionKinds: [K],
      })
      const r = admitAutonomyAction({ actionKind: K, licence: lic, survivalCeiling: 'L6' })
      expect(r.allowed, reason).toBe(false)
      expect(r.reason, reason).toBe('licence_not_effective')
      // …and it never reports a usable level from the dead licence's scope.
      expect(r.effectiveLevel, reason).toBeNull()
    }
  })

  it('no licence at all refuses with its own reason, distinct from ineffective', () => {
    const r = admitAutonomyAction({
      actionKind: K, licence: noLicense('inst-1', 'no_license'), survivalCeiling: 'L6',
    })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('licence_not_effective')
    expect(r.licenceRequired).toBe(true)

    const absent = admitAutonomyAction({ actionKind: K, licence: null, survivalCeiling: 'L6' })
    expect(absent.allowed).toBe(false)
    // `null` and "a resolved licence that is ineffective" are different facts.
    expect(absent.reason).toBe('licence_absent')
  })

  it('an effective licence that does NOT name the kind refuses on scope', () => {
    const lic = effectiveLicence({ allowedActionKinds: ['observe_release_gate'] })
    const r = admitAutonomyAction({ actionKind: K, licence: lic, survivalCeiling: 'L6' })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('action_not_in_licence_scope')
  })

  it('H · scope alone is not enough — an insufficient effective level refuses', () => {
    // L2 licence, kind requires L3, ceiling generous. Scope is satisfied.
    const lic = effectiveLicence({ licensedLevel: 'L2', resolvedLevel: 'L2', allowedActionKinds: [K] })
    const r = admitAutonomyAction({ actionKind: K, licence: lic, survivalCeiling: 'L6' })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('effective_level_below_required')
    expect(r.requiredLevel).toBe('L3')
  })

  it('the happy path admits, and says which input decided it', () => {
    const lic = effectiveLicence({ licensedLevel: 'L4', resolvedLevel: 'L4', allowedActionKinds: [K] })
    const r = admitAutonomyAction({ actionKind: K, licence: lic, survivalCeiling: 'L6' })
    expect(r.allowed).toBe(true)
    expect(r.reason).toBe('allowed')
    expect(r.licenceRequired).toBe(true)
    expect(r.effectiveLevel).toBe('L4')
    expect(r.boundedBy).toBe('licence')
  })
})

// ── I/J/K · Survival ────────────────────────────────────────────────────────

describe('I · Survival can only ever lower', () => {
  it('the ceiling binds downward and never upward', () => {
    for (const licensed of AUTONOMY_LICENSE_LEVELS) {
      for (const state of SURVIVAL_STATES) {
        const eff = effectiveAutonomy(licensed, state)
        const li = AUTONOMY_LICENSE_LEVELS.indexOf(licensed)
        const ei = AUTONOMY_LICENSE_LEVELS.indexOf(eff)
        expect(ei, `${licensed} under ${state}`).toBeLessThanOrEqual(li)
      }
    }
  })

  it('the composition agrees with the ceiling table', () => {
    const lic = effectiveLicence({ licensedLevel: 'L5', resolvedLevel: 'L5' })
    const composed = observeEffectiveAutonomy(lic, survivalCeiling('CONSERVE'))
    expect(composed.effectiveLevel).toBe('L3')
    expect(composed.boundedBy).toBe('survival_ceiling')
  })
})

describe('J · a null / unavailable Survival ceiling is L0, never "no opinion"', () => {
  it('an effective L6 licence under a null ceiling resolves to L0', () => {
    const lic = effectiveLicence({ licensedLevel: 'L6', resolvedLevel: 'L6' })
    const c = observeEffectiveAutonomy(lic, null)
    expect(c.effectiveLevel).toBe('L0')
    expect(c.boundedBy).toBe('survival_unavailable')
    // The failure must be distinguishable from a ceiling that actually bound.
    expect(c.boundedBy).not.toBe('survival_ceiling')
  })

  it('L3 under a null ceiling is also L0 — it never returns the licensed level', () => {
    const lic = effectiveLicence({ licensedLevel: 'L3', resolvedLevel: 'L3' })
    expect(observeEffectiveAutonomy(lic, null).effectiveLevel).toBe('L0')
  })

  it('an ineffective licence is L0 under a null ceiling too', () => {
    const lic = effectiveLicence({ effective: false, resolvedLevel: 'L0', licensedLevel: null })
    const c = observeEffectiveAutonomy(lic, null)
    expect(c.effectiveLevel).toBe('L0')
    expect(c.boundedBy).toBe('licence_ineffective')
  })

  it('null NEVER returns anything above L0, for every licensed level', () => {
    for (const level of AUTONOMY_LICENSE_LEVELS) {
      const lic = effectiveLicence({ licensedLevel: level, resolvedLevel: level })
      expect(observeEffectiveAutonomy(lic, null).effectiveLevel, level).toBe('L0')
    }
  })

  it('…and the whole licensed action refuses under a null ceiling', () => {
    const lic = effectiveLicence({ licensedLevel: 'L6', resolvedLevel: 'L6',
      allowedActionKinds: ['proof_governed_effect'] })
    const r = admitAutonomyAction({
      actionKind: 'proof_governed_effect', licence: lic, survivalCeiling: null,
    })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('effective_level_below_required')
    expect(r.effectiveLevel).toBe('L0')
  })
})

describe('K · an unrecognised runtime survival state fails closed to L0', () => {
  /** Deliberately widened call — the whole point is passing what the types forbid. */
  const ceiling = (v: string) => survivalCeiling(v as unknown as SurvivalState)

  it('hostile and unknown strings all answer L0', () => {
    for (const v of ['constructor', 'toString', '__proto__', 'valueOf', 'hasOwnProperty',
                     'NOT_A_STATE', '', 'l0', 'L7']) {
      expect(ceiling(v), v).toBe('L0')
    }
  })

  it('never returns a function, an object or undefined', () => {
    for (const v of ['constructor', 'toString', '__proto__']) {
      const got = ceiling(v) as unknown
      expect(typeof got, v).toBe('string')
      expect(got, v).toBe('L0')
    }
  })

  it('the five real states still map exactly as before', () => {
    expect(ceiling('EXPAND')).toBe('L6')
    expect(ceiling('NORMAL')).toBe('L6')
    expect(ceiling('CONSERVE')).toBe('L3')
    expect(ceiling('CRITICAL')).toBe('L1')
    expect(ceiling('HIBERNATE')).toBe('L0')
  })

  it('lowestAutonomy fails closed on a non-level too', () => {
    const hostile = 'constructor' as unknown as AutonomyLicenseLevel
    expect(lowestAutonomy(hostile, 'L6')).toBe('L0')
    expect(lowestAutonomy('L6', hostile)).toBe('L0')
  })

  it('the table itself is frozen', () => {
    expect(Object.isFrozen(SURVIVAL_CEILING)).toBe(true)
  })
})

// ── L/M · the platform adapter ──────────────────────────────────────────────

describe('L/M · the platform Survival adapter', () => {
  beforeEach(() => {
    portfolioReader.mockReset()
    snapshot.mockReset()
    portfolioReader.mockResolvedValue([{ id: 'p1', owner_id: null }, { id: 'p2', owner_id: null }])
    snapshot.mockResolvedValue({ snapshot: { state: 'CONSERVE' }, ceiling: 'L3' })
  })

  afterEach(() => { portfolioReader.mockReset(); snapshot.mockReset() })

  it('takes NO caller input — the signature has zero parameters', () => {
    expect(readPlatformSurvivalCeiling.length).toBe(0)
  })

  it('reuses the CANONICAL population reader — no second global project enumeration', () => {
    // A second `createAdminClient().from('projects')` would be a second answer to
    // "what is the platform", and two answers can drift apart.
    const src = readFileSync(join(APP, 'lib/atlas/autonomy-runtime/platform-survival.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).toContain('serviceRolePortfolioReader')
    expect(code).not.toMatch(/createAdminClient/)
    expect(code).not.toMatch(/from\('projects'\)/)
  })

  it('never calls the operator/portfolio AUTHORITY check', () => {
    // The execution path is cron/background with no session. Reusing the reader
    // is a data question; requiring an operator would invent a human where none
    // exists.
    const src = readFileSync(join(APP, 'lib/atlas/autonomy-runtime/platform-survival.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/resolvePlatformPortfolioAuthority/)
    expect(code).not.toMatch(/resolvePlatformOperator/)
    expect(code).not.toMatch(/provePortfolioAuthority/)
  })

  it('derives the population itself and passes the COMPLETE set', async () => {
    const r = await readPlatformSurvivalCeiling()
    expect(r.ok).toBe(true)
    expect(snapshot).toHaveBeenCalledTimes(1)
    const arg = snapshot.mock.calls[0][0]
    expect(arg).toEqual(['p1', 'p2'])
    // No options object at all: neither test seam can be reached.
    expect(snapshot.mock.calls[0][1]).toBeUndefined()
  })

  it('passes no funding override and no coverage override, ever', () => {
    const src = readFileSync(join(APP, 'lib/atlas/autonomy-runtime/platform-survival.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/testRunwayCoverage/)
    expect(code).not.toMatch(/funding\s*:/)
    expect(code).not.toMatch(/now\s*:/)
  })

  it('the returned object does NOT expose the project population', async () => {
    const r = await readPlatformSurvivalCeiling()
    expect(Object.keys(r).sort()).toEqual(['ceiling', 'ok', 'state'])
  })

  it('M · an unreadable population is a CLOSED failure at L0', async () => {
    portfolioReader.mockRejectedValue(new Error('enumeration failed'))
    const r = await readPlatformSurvivalCeiling()
    expect(r.ok).toBe(false)
    expect(r.ceiling).toBe('L0')
    if (r.ok) throw new Error('unreachable')
    expect(r.reason).toBe('population_unavailable')
    expect(snapshot).not.toHaveBeenCalled()
  })

  it('M · a THROWING reader is L0, not an upward throw', async () => {
    portfolioReader.mockImplementation(() => { throw new Error('no service credentials') })
    const r = await readPlatformSurvivalCeiling()
    expect(r.ok).toBe(false)
    expect(r.ceiling).toBe('L0')
  })

  it('M · an EMPTY population is not a complete one', async () => {
    portfolioReader.mockResolvedValue([])
    const r = await readPlatformSurvivalCeiling()
    expect(r.ok).toBe(false)
    expect(r.ceiling).toBe('L0')
    expect(snapshot).not.toHaveBeenCalled()
  })

  it('M · a throwing snapshot reader is L0', async () => {
    snapshot.mockRejectedValue(new Error('survival exploded'))
    const r = await readPlatformSurvivalCeiling()
    expect(r.ok).toBe(false)
    expect(r.ceiling).toBe('L0')
    if (r.ok) throw new Error('unreachable')
    expect(r.reason).toBe('snapshot_unavailable')
  })

  it('M · never uses the survival history ledger as current truth', () => {
    const src = readFileSync(join(APP, 'lib/atlas/autonomy-runtime/platform-survival.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/survival_state_events|latestProjectSurvivalEvent|listProjectSurvivalTransitions/)
  })
})

// ── N · the exemption adds no refusal ───────────────────────────────────────

describe('N · a licence-exempt observation adds no autonomy refusal', () => {
  const OBS = 'observe_release_gate'

  it('with ZERO licences it is allowed by the autonomy layer', () => {
    const r = admitAutonomyAction({ actionKind: OBS, licence: null, survivalCeiling: null })
    expect(r.allowed).toBe(true)
    expect(r.reason).toBe('exempt_observation')
  })

  it('with an EXPIRED licence it is still allowed', () => {
    const r = admitAutonomyAction({
      actionKind: OBS,
      licence: effectiveLicence({ effective: false, reason: 'expired', resolvedLevel: 'L0' }),
      survivalCeiling: 'L0',
    })
    expect(r.allowed).toBe(true)
  })

  it('with a REVOKED licence it is still allowed', () => {
    const r = admitAutonomyAction({
      actionKind: OBS,
      licence: effectiveLicence({ effective: false, reason: 'revoked', resolvedLevel: 'L0' }),
      survivalCeiling: 'L0',
    })
    expect(r.allowed).toBe(true)
  })

  it('it reports licenceRequired = false and NEVER claims to be licensed', () => {
    const r = admitAutonomyAction({ actionKind: OBS, licence: null, survivalCeiling: 'L6' })
    expect(r.licenceRequired).toBe(false)
    expect(r.licensedLevel).toBeNull()
    expect(r.effectiveLevel).toBeNull()
    expect(r.boundedBy).toBeNull()
    // The vocabulary has no way to express a grant here.
    expect(JSON.stringify(r)).not.toMatch(/license_granted|licensed:\s*true/)
  })

  it('every exempt kind behaves the same way', () => {
    for (const kind of LICENCE_EXEMPT_OBSERVATION_KINDS) {
      const r = admitAutonomyAction({ actionKind: kind, licence: null, survivalCeiling: null })
      expect(r.allowed, kind).toBe(true)
      expect(r.reason, kind).toBe('exempt_observation')
      expect(r.licenceRequired, kind).toBe(false)
    }
  })
})

// ── unsupported can never be reached by level ───────────────────────────────

describe('an unsupported action refuses BEFORE any level can matter', () => {
  it('an effective L6 licence naming the kind, under an L6 ceiling, still refuses', () => {
    const lic = effectiveLicence({
      licensedLevel: 'L6', resolvedLevel: 'L6',
      allowedActionKinds: ['generate_monthly_story'],
    })
    const r = admitAutonomyAction({
      actionKind: 'generate_monthly_story', licence: lic, survivalCeiling: 'L6',
    })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('unsupported_action')
    expect(r.unsupportedReason).toBe('v1_scope_incomplete')
  })

  it('that holds under the MOST permissive survival state too', () => {
    const lic = effectiveLicence({ licensedLevel: 'L6', resolvedLevel: 'L6',
      allowedActionKinds: ['generate_monthly_story'] })
    expect(admitAutonomyAction({
      actionKind: 'generate_monthly_story', licence: lic, survivalCeiling: survivalCeiling('EXPAND'),
    }).allowed).toBe(false)
  })

  it('and for a not_executable kind', () => {
    const r = admitAutonomyAction({ actionKind: 'upload_protected_artifacts', licence: null, survivalCeiling: 'L6' })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('unsupported_action')
    expect(r.unsupportedReason).toBe('not_executable')
  })

  it('an unknown kind refuses without inventing a policy', () => {
    const r = admitAutonomyAction({ actionKind: 'invented_action', licence: null, survivalCeiling: 'L6' })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('unknown_action_kind')
  })
})

// ── O/P · inertness and no provider routing ─────────────────────────────────

describe('O · the foundation has ZERO runtime execution importers', () => {
  const EXECUTION_ROOTS = ['lib/workflows', 'lib/cost', 'lib/media', 'lib/os', 'app/api']

  function walk(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next' || entry === '.turbo') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) { out.push(...walk(full)); continue }
      if (/\.(ts|tsx)$/.test(entry)) out.push(full)
    }
    return out
  }

  it('no file under any execution root names autonomy-runtime', () => {
    const offenders: string[] = []
    for (const root of EXECUTION_ROOTS) {
      for (const file of walk(resolve(APP, root))) {
        if (readFileSync(file, 'utf8').includes('autonomy-runtime')) offenders.push(file)
      }
    }
    expect(offenders, `execution paths must not import the foundation:\n${offenders.join('\n')}`)
      .toEqual([])
  })

  it('the pure admission core imports nothing impure', () => {
    const src = readFileSync(join(APP, 'lib/atlas/autonomy-runtime/admission.ts'), 'utf8')
    // Strip the header comment, then look at actual import statements only.
    const imports = src.split('\n').filter(l => /^\s*import\s/.test(l)).join('\n')
    for (const forbidden of ['server-only', 'supabase', 'next/headers', 'react',
                             'autonomy-runtime/platform-survival', 'workflows/effect',
                             'cost/governed-spend']) {
      expect(imports, `admission must not import ${forbidden}`).not.toContain(forbidden)
    }
    // …and no ambient reads.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/process\.env/)
    expect(code).not.toMatch(/Date\.now|new Date\(/)
    expect(code).not.toMatch(/fetch\(/)
  })

  it('the whole foundation is unreachable from the executor and the drain', () => {
    for (const f of ['lib/workflows/action-run.ts', 'lib/workflows/action-executor.ts',
                     'app/api/runs/drain/route.ts', 'lib/workflows/action-scheduling.ts']) {
      const src = readFileSync(join(APP, f), 'utf8')
      expect(src, f).not.toContain('autonomy-runtime')
      expect(src, f).not.toContain('admitAutonomyAction')
      expect(src, f).not.toContain('readPlatformSurvivalCeiling')
    }
  })
})

describe('P · no provider or model selection is introduced', () => {
  const FILES = ['policy.ts', 'admission.ts', 'platform-survival.ts']

  it('no provider SDK, hostname or model literal appears', () => {
    for (const f of FILES) {
      const src = readFileSync(join(APP, 'lib/atlas/autonomy-runtime', f), 'utf8')
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      for (const pat of [/@anthropic-ai/, /openai/i, /elevenlabs/i, /ideogram/i,
                         /api\.(anthropic|openai|elevenlabs|ideogram)\./,
                         /claude-[a-z0-9-]+/, /gpt-[a-z0-9-]+/, /flux-/]) {
        expect(code, `${f} must not contain ${pat}`).not.toMatch(pat)
      }
    }
  })

  it('no model/provider selection phrasing exists', () => {
    for (const f of FILES) {
      const src = readFileSync(join(APP, 'lib/atlas/autonomy-runtime', f), 'utf8')
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(code, f).not.toMatch(/selectProvider|selectModel|chooseProvider|routeProvider|fallbackModel/)
    }
  })
})
