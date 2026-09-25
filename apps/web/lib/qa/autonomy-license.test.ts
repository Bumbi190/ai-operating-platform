/**
 * Chapter 18 Autonomy Licensing — Phase 2C.
 *
 * Filesystem/local only: no database, no network, no credentials.
 *
 * The production boundary takes ONE argument — the human request. Authority,
 * the workflow subject, the decision lineage, the issue-time clock and the store
 * are resolved inside it and are deliberately NOT overridable, so these tests
 * reach the same coverage by mocking the imported dependencies rather than by
 * passing them in. That is the only way to test the boundary that is also the
 * property under test.
 *
 * Properties only real PostgreSQL can prove live in `autonomy-license-sql.test.ts`.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})) }))
// The production boundary takes ONE argument, so tests reach the same coverage
// by mocking the imported dependencies. Production code cannot do this.
vi.mock('@/lib/auth/platform-operator', () => ({ resolvePlatformOperator: vi.fn() }))
vi.mock('@/lib/workflows/store', () => ({ readInstance: vi.fn() }))
vi.mock('@/lib/atlas/decision-ledger/store', () => ({ createDecisionLedgerStore: vi.fn() }))
vi.mock('@/lib/atlas/autonomy-license/store', () => ({
  createAutonomyLicenseStore: vi.fn(),
  AUTONOMY_LICENSE_EVENT_COLS: [],
}))

import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { readInstance } from '@/lib/workflows/store'
import { createDecisionLedgerStore } from '@/lib/atlas/decision-ledger/store'
import { buildDecisionRecord } from '@/lib/atlas/decision-ledger/build'
import type { DecisionRecord } from '@/lib/atlas/decision-ledger/types'

import { observeEffectiveAutonomy } from '@/lib/atlas/autonomy-license/compose'
import { deriveLicenseState, effectivenessOf, MalformedLicenseLineageError } from '@/lib/atlas/autonomy-license/derive'
import {
  AUTONOMY_LICENSE_LEVELS,
  compareLevels,
  INEFFECTIVE_LEVEL,
} from '@/lib/atlas/autonomy-license/levels'
import {
  issueAutonomyLicense,
  restrictAutonomyLicense,
  revokeAutonomyLicense,
  suspendAutonomyLicense,
  supersedeAutonomyLicense,
} from '@/lib/atlas/autonomy-license/issue'
import { createAutonomyLicenseStore } from '@/lib/atlas/autonomy-license/store'
import { LICENSE_SQLSTATE, LicenseStoreError } from '@/lib/atlas/autonomy-license/errors'
import { resolveAutonomyLicense } from '@/lib/atlas/autonomy-license/resolve'
import { fingerprintFor, resolveActionScope, scopeDrifted } from '@/lib/atlas/autonomy-license/scope'
import type { AutonomyLicenseStore, AppendLicenseEventArgs } from '@/lib/atlas/autonomy-license/store'
import { LICENSE_ACTS, LICENSE_REASONS, noLicense } from '@/lib/atlas/autonomy-license/types'
import type { LicenseEvent } from '@/lib/atlas/autonomy-license/types'
import { ACTION_CLASSES, ACTION_CLASS_POLICY } from '@/lib/workflows/action-target'
import { ACTION_REGISTRY, GOVERNED_EFFECT_ENABLED_KINDS, isKnownActionKind } from '@/lib/workflows/action-registry'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MODULE_DIR = resolve(__dirname, '../atlas/autonomy-license')

const PROJECT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PROJECT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OPERATOR_UUID = '11111111-1111-4111-8111-111111111111'
const OPERATOR_ACTOR = `user:${OPERATOR_UUID}`
const DECISION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const DEF_KEY = 'familje-stunden.monthly-release'
const DEF_HASH = 'f'.repeat(64)

const T0 = '2026-09-20T08:00:00.000Z'
const T1 = '2026-09-20T09:00:00.000Z'
const EFFECTIVE = '2026-09-20T09:30:00.000Z'
const EXPIRES = '2026-10-20T08:00:00.000Z'
/** Between EFFECTIVE and EXPIRES. */
const IN_WINDOW = '2026-09-25T08:00:00.000Z'
/** After EXPIRES. */
const AFTER_EXPIRY = '2026-10-21T08:00:00.000Z'

const INSTANCE = { project_id: PROJECT_A, def_key: DEF_KEY, def_hash: DEF_HASH }

let seq = 0
function decisionRecord(type: string, overrides: Record<string, unknown> = {}): DecisionRecord {
  return buildDecisionRecord({
    type,
    decisionId: DECISION_ID,
    projectId: PROJECT_A,
    principalId: OPERATOR_UUID,
    occurredAt: T0,
    recordId: `dec-rec-${++seq}`,
    version: 1,
    lifecycleGeneration: 0,
    title: 'Grant the monthly-release workflow licensed autonomy',
    statement: 'The workflow may generate the monthly saga without per-action approval inside the licensed scope.',
    materiality: ['autonomy'],
    ...overrides,
  } as never)
}

/** A governing, same-project, autonomy-material decision. */
function autonomyDecision(overrides: { projectId?: string; materiality?: string[]; status?: string } = {}) {
  const projectId = overrides.projectId ?? PROJECT_A
  const materiality = overrides.materiality ?? ['autonomy']
  const proposed = decisionRecord('proposed', { projectId, materiality, occurredAt: T0 })
  if (overrides.status === 'proposed') return [proposed]
  const approved = decisionRecord('approved', {
    projectId,
    materiality,
    occurredAt: T1,
    effectiveAt: EFFECTIVE,
    version: 2,
    lifecycleGeneration: 1,
    // §11.26 and §11.46: an approval must carry its rationale and a review
    // condition. The builder enforces both.
    rationale: 'Evidence and controls now support bounded internal autonomy.',
    review: { trigger: 'time_based', description: 'Review after 30 runs.', dueAt: '2026-10-20T08:00:00.000Z' },
    authority: {
      basis: 'founder_owner',
      authorizationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      principalId: OPERATOR_UUID,
      actionKind: 'decision.approve',
      boundVersionHash: 'a'.repeat(64),
      authorityActAt: T1,
    },
  })
  return [proposed, approved]
}

/** An in-memory store faithful to the RPC's generation derivation. */
class FakeStore implements AutonomyLicenseStore {
  events: LicenseEvent[] = []
  /**
   * How many times the ledger was READ. The auth-first proofs count this: a
   * refused caller must not have caused a service-role read of a SERVER_ONLY
   * table, and must not have learned whether a licence id exists.
   */
  lineageCalls = 0
  /** Every append argument set this store was handed, in order. */
  appendedArgs: AppendLicenseEventArgs[] = []
  /**
   * When set, the next append fails the way the real RPC would — carrying the
   * PostgreSQL SQLSTATE. Lets the boundary's conflict classification be proved
   * against the same signal production receives.
   */
  appendRefusal: { code?: string | null; message?: string } | null = null
  private cursor = 0

  async append(args: AppendLicenseEventArgs): Promise<LicenseEvent> {
    this.appendedArgs.push(args)
    if (this.appendRefusal) {
      const refusal = this.appendRefusal
      this.appendRefusal = null
      throw new LicenseStoreError(refusal.message ?? 'refused', refusal.code ?? null)
    }
    const existing = this.events.filter(e => e.licenseId === args.licenseId)
    const n = ++this.cursor
    const event: LicenseEvent = {
      eventId: `evt-${n}`,
      eventSeq: n,
      licenseId: args.licenseId,
      generation: existing.length,
      act: args.act,
      projectId: args.projectId,
      workflowInstanceId: args.workflowInstanceId,
      boundDefKey: args.boundDefKey,
      boundDefHash: args.boundDefHash,
      licensedLevel: args.licensedLevel,
      allowedActionKinds: [...args.allowedActionKinds],
      actionScopeFingerprint: args.actionScopeFingerprint,
      decisionId: args.decisionId,
      decisionVersion: args.decisionVersion,
      decisionRecordId: args.decisionRecordId,
      effectiveAt: args.effectiveAt,
      expiresAt: args.expiresAt,
      supersededByLicenseId: args.supersededByLicenseId,
      reason: args.reason,
      actor: args.actor,
      occurredAt: new Date(Date.parse(T0) + n * 1000).toISOString(),
    }
    this.events.push(event)
    return event
  }

  async lineage(licenseId: string): Promise<LicenseEvent[]> {
    this.lineageCalls++
    return this.events.filter(e => e.licenseId === licenseId)
  }

  async byInstance(workflowInstanceId: string): Promise<LicenseEvent[]> {
    return this.events.filter(e => e.workflowInstanceId === workflowInstanceId)
  }
}

const OPERATOR = { ok: true as const, actor: OPERATOR_ACTOR }

// ── Dependency wiring ─────────────────────────────────────────────────────
//
// Every exported production mutation takes ONE argument — the human request.
// Authority, the workflow subject, the decision lineage, the issue-time clock
// and the store are all resolved INSIDE the boundary and are deliberately not
// overridable from outside it. These helpers point the mocked imports at one
// scenario, then call the real one-argument API.

const operatorMock = vi.mocked(resolvePlatformOperator)
const readInstanceMock = vi.mocked(readInstance)
const decisionStoreMock = vi.mocked(createDecisionLedgerStore)
const licenseStoreMock = vi.mocked(createAutonomyLicenseStore)

interface Wire {
  store?: FakeStore
  operator?: { ok: true; actor: string } | { ok: false; reason: string }
  instance?: typeof INSTANCE | null
  decision?: unknown[] | (() => unknown[])
}

/** Point the mocked dependencies at one scenario. Returns the licence store. */
function wire(options: Wire = {}): FakeStore {
  const store = options.store ?? new FakeStore()
  operatorMock.mockResolvedValue((options.operator ?? OPERATOR) as never)

  const instance = options.instance === undefined ? INSTANCE : options.instance
  readInstanceMock.mockImplementation(async () => instance as never)

  const chosen = options.decision ?? (() => autonomyDecision())
  const lineage = typeof chosen === 'function' ? chosen : () => chosen
  decisionStoreMock.mockReturnValue({ lineage: async () => lineage() } as never)

  licenseStoreMock.mockReturnValue(store as never)
  return store
}

const issueLicense = <R,>(request: R, o: Wire = {}) => { wire(o); return issueAutonomyLicense(request as never) }
const restrictLicense = <R,>(request: R, o: Wire = {}) => { wire(o); return restrictAutonomyLicense(request as never) }
const suspendLicense = <R,>(request: R, o: Wire = {}) => { wire(o); return suspendAutonomyLicense(request as never) }
const revokeLicense = <R,>(request: R, o: Wire = {}) => { wire(o); return revokeAutonomyLicense(request as never) }
const supersedeLicense = <R,>(request: R, o: Wire = {}) => { wire(o); return supersedeAutonomyLicense(request as never) }
/**
 * Resolve, with the SERVER clock set to `at`.
 *
 * The canonical resolver takes ONE argument and reads `new Date()` itself — a
 * caller-supplied instant would be a caller-supplied authority, able to revive
 * an expired licence or activate a future one. So the instant this suite names
 * is installed as the system time rather than passed in: the call sites still
 * read "at IN_WINDOW", but the code under test gets the clock the way
 * production gives it to it.
 *
 * `toFake: ['Date']` only — the resolver schedules nothing, and faking timers
 * broadly would risk interfering with the promise scheduling around it.
 */
const resolveLicense = async (id: string, at: string, o: Wire = {}) => {
  wire(o)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(at))
  try {
    return await resolveAutonomyLicense(id)
  } finally {
    vi.useRealTimers()
  }
}

const REQUEST = {
  workflowInstanceId: '99999999-9999-4999-8999-999999999999',
  decisionId: DECISION_ID,
  licensedLevel: 'L3',
  allowedActionKinds: ['generate_monthly_story', 'validate_monthly_story'],
  effectiveAt: EFFECTIVE,
  expiresAt: EXPIRES,
}

// ── ISSUANCE AUTHORITY ────────────────────────────────────────────────────────

describe('Phase 2C — issuance authority', () => {
  it('1. a platform operator may issue when every prerequisite is valid', async () => {
    const store = new FakeStore()
    const result = await issueLicense(REQUEST, { store: store })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.event.act).toBe('LICENSE_ISSUED')
      expect(result.event.generation).toBe(0)
      expect(result.event.projectId).toBe(PROJECT_A)
    }
  })

  it('2. an ordinary project owner cannot issue', async () => {
    const store = new FakeStore()
    const result = await issueLicense(REQUEST, { store: store, operator: { ok: false, reason: 'not_platform_operator' },
    })
    expect(result).toMatchObject({ ok: false, reason: 'not_platform_operator' })
    expect(store.events).toHaveLength(0)
  })

  it('3. an authenticated non-operator cannot issue', async () => {
    const store = new FakeStore()
    const result = await issueLicense(REQUEST, { store: store, operator: { ok: false, reason: 'not_platform_operator' },
    })
    expect(result.ok).toBe(false)
    expect(store.events).toHaveLength(0)
  })

  it('4. missing operator configuration fails closed and is distinguishable', async () => {
    const store = new FakeStore()
    const result = await issueLicense(REQUEST, { store: store, operator: { ok: false, reason: 'no_operator_configured' },
    })
    expect(result).toMatchObject({ ok: false, reason: 'no_operator_configured' })
    expect(store.events).toHaveLength(0)
  })

  it('5. a machine actor cannot issue', async () => {
    const store = new FakeStore()
    const result = await issueLicense(REQUEST, { store: store, operator: { ok: false, reason: 'unauthenticated' },
    })
    expect(result).toMatchObject({ ok: false, reason: 'unauthenticated' })
  })

  it('6. the stored actor is session-derived user:<canonical uuid>', async () => {
    const store = new FakeStore()
    const result = await issueLicense(REQUEST, { store: store })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.event.actor).toBe(OPERATOR_ACTOR)
      expect(result.event.actor).toMatch(
        /^user:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      )
    }
    // The request shape has no actor field a caller could populate.
    expect(Object.keys(REQUEST)).not.toContain('actor')
    expect(Object.keys(REQUEST)).not.toContain('principalId')
  })

  it('6b. no caller-supplied field can name the issuer', async () => {
    const store = new FakeStore()
    const result = await issueLicense(
      { ...REQUEST, ...({ actor: 'user:attacker', principalId: 'x' } as Record<string, unknown>) },
      { store: store },
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.event.actor).toBe(OPERATOR_ACTOR)
  })
})

// ── DECISION ──────────────────────────────────────────────────────────────────

describe('Phase 2C — the authorizing decision', () => {
  const attempt = (lineage: unknown[], request = REQUEST) =>
    issueLicense(request, { store: new FakeStore(), decision: () => lineage })

  it('7. an unknown decision is refused', async () => {
    expect(await attempt([])).toMatchObject({ ok: false, reason: 'decision_not_found' })
  })

  it('8. a wrong-project decision is refused', async () => {
    const result = await attempt(autonomyDecision({ projectId: PROJECT_B }))
    expect(result).toMatchObject({ ok: false, reason: 'decision_project_mismatch' })
  })

  it('9. a non-governing decision is refused', async () => {
    // Approved but with an effective date still in the future: `approved`, not
    // yet `active` (§11.51), so it does not govern.
    const proposed = decisionRecord('proposed', { occurredAt: T0 })
    const approved = decisionRecord('approved', {
      occurredAt: T1,
      effectiveAt: '2099-01-01T00:00:00.000Z',
      version: 2,
      lifecycleGeneration: 1,
      rationale: 'Approved now, effective far in the future.',
      review: { trigger: 'time_based', description: 'Review.', dueAt: '2099-06-01T00:00:00.000Z' },
      authority: {
        basis: 'founder_owner',
        authorizationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        principalId: OPERATOR_UUID,
        actionKind: 'decision.approve',
        boundVersionHash: 'a'.repeat(64),
        authorityActAt: T1,
      },
    })
    const result = await attempt([proposed, approved])
    expect(result).toMatchObject({ ok: false, reason: 'decision_not_governing' })
  })

  it('9b. a superseded decision is refused', async () => {
    const [proposed, approved] = autonomyDecision()
    const superseded = decisionRecord('superseded', {
      occurredAt: T1, version: 3, lifecycleGeneration: 2, supersededBy: 'other',
    })
    const result = await attempt([proposed, approved, superseded])
    expect(result).toMatchObject({ ok: false, reason: 'decision_not_governing' })
  })

  it('10. a malformed decision lineage is refused', async () => {
    // Each record is individually valid, but the CHAIN is not: an approval with
    // no preceding proposal cannot be folded, so it can never be governing.
    const [, approved] = autonomyDecision()
    const result = await attempt([approved])
    expect(result).toMatchObject({ ok: false, reason: 'decision_not_governing' })
  })

  it('11. materiality without autonomy is refused', async () => {
    const result = await attempt(autonomyDecision({ materiality: ['customers', 'money'] }))
    expect(result).toMatchObject({ ok: false, reason: 'decision_not_material_for_autonomy' })
  })

  it('12. a governing same-project autonomy decision is accepted', async () => {
    expect((await attempt(autonomyDecision())).ok).toBe(true)
  })

  it('13. the exact decision act is pinned by existing ledger identity', async () => {
    const store = new FakeStore()
    const lineage = autonomyDecision()
    const result = await issueLicense(REQUEST, { store: store, decision: () => lineage })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const approving = lineage[lineage.length - 1] as { recordId: string; version: number }
    expect(result.event.decisionRecordId).toBe(approving.recordId)
    expect(result.event.decisionVersion).toBe(approving.version)
    expect(result.event.decisionId).toBe(DECISION_ID)
    // The pin is an EXISTING record id, not a hash invented by this module.
    expect(result.event.decisionRecordId).not.toMatch(/^[0-9a-f]{64}$/)
  })

  it('14. later decision expiry makes the licence ineffective with no ledger mutation', async () => {
    const store = new FakeStore()
    await issueLicense(REQUEST, { store: store })
    const before = JSON.stringify(store.events)

    const resolved = await resolveLicense(REQUEST.workflowInstanceId, AFTER_EXPIRY, {
      store, instance: INSTANCE, decision: () => autonomyDecision(),
    })
    // The WINDOW expiry fires first here; the decision fact is proven separately.
    expect(resolved.effective).toBe(false)
    expect(JSON.stringify(store.events)).toBe(before)
  })

  it('15. reversal or supersession makes the licence ineffective with no mutation', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store: store })
    expect(issued.ok).toBe(true)
    const before = JSON.stringify(store.events)

    const [proposed, approved] = autonomyDecision()
    const reversed = decisionRecord('reversed', {
      occurredAt: T1, version: 3, lifecycleGeneration: 2,
      reason: 'Controls weakened after an incident.',
    })
    const resolved = await resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store, instance: INSTANCE, decision: () => [proposed, approved, reversed],
    })
    expect(resolved.effective).toBe(false)
    expect(resolved.reason).toBe('decision_not_governing')
    expect(resolved.decisionReason).toBe('reversed')
    expect(resolved.resolvedLevel).toBe(INEFFECTIVE_LEVEL)
    expect(JSON.stringify(store.events)).toBe(before)
  })
})

// ── WORKFLOW BINDING ──────────────────────────────────────────────────────────

describe('Phase 2C — workflow binding', () => {
  it('16. an unknown workflow instance is refused', async () => {
    const store = new FakeStore()
    const result = await issueLicense(REQUEST, {
      ...{ store: store }, instance: null,
    })
    expect(result).toMatchObject({ ok: false, reason: 'instance_not_found' })
  })

  it('17/18. project and def_hash are derived from the instance, not the caller', async () => {
    const store = new FakeStore()
    const result = await issueLicense(
      { ...REQUEST, ...({ projectId: PROJECT_B, boundDefHash: 'x'.repeat(64) } as Record<string, unknown>) },
      { store: store },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.event.projectId).toBe(PROJECT_A)
      expect(result.event.boundDefHash).toBe(DEF_HASH)
      expect(result.event.boundDefKey).toBe(DEF_KEY)
    }
  })

  it('19. another instance cannot inherit the licence', async () => {
    const store = new FakeStore()
    await issueLicense(REQUEST, { store: store })
    const other = await resolveLicense('11111111-2222-4333-8444-555555555555', IN_WINDOW, {
      store, instance: INSTANCE, decision: () => autonomyDecision(),
    })
    expect(other.effective).toBe(false)
    expect(other.reason).toBe('no_license')
    expect(other.resolvedLevel).toBe(INEFFECTIVE_LEVEL)
  })

  it('20. def_hash drift makes the licence ineffective', async () => {
    const store = new FakeStore()
    await issueLicense(REQUEST, { store: store })
    const resolved = await resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store,
      instance: { ...INSTANCE, def_hash: 'a-different-hash' },
      decision: () => autonomyDecision(),
    })
    expect(resolved.effective).toBe(false)
    expect(resolved.reason).toBe('workflow_definition_drifted')
    expect(resolved.resolvedLevel).toBe(INEFFECTIVE_LEVEL)
  })

  it('20b. def_key drift is also definition drift', async () => {
    const store = new FakeStore()
    await issueLicense(REQUEST, { store: store })
    const resolved = await resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store,
      instance: { ...INSTANCE, def_key: 'another.definition' },
      decision: () => autonomyDecision(),
    })
    expect(resolved.reason).toBe('workflow_definition_drifted')
  })
})

// ── ACTION SCOPE ──────────────────────────────────────────────────────────────

describe('Phase 2C — action scope', () => {
  it('21. an unknown ActionKind is refused', async () => {
    const store = new FakeStore()
    const result = await issueLicense(
      { ...REQUEST, allowedActionKinds: ['generate_monthly_story', 'not_a_real_action'] },
      { store: store },
    )
    expect(result).toMatchObject({ ok: false, reason: 'action_kind_unknown' })
    expect(store.events).toHaveLength(0)
  })

  it('22. a caller cannot supply an ActionClass', async () => {
    const store = new FakeStore()
    const result = await issueLicense(
      { ...REQUEST, ...({ allowedActionClasses: ['READ_ONLY'], actionClass: 'READ_ONLY' } as Record<string, unknown>) },
      { store: store },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      // The recorded class is the registry's, and READ_ONLY is not what the
      // registry says about the FINANCIAL story action.
      const classes = new Set(
        result.event.allowedActionKinds.map(k => ACTION_REGISTRY[k as keyof typeof ACTION_REGISTRY].action_class),
      )
      expect(classes.has('FINANCIAL')).toBe(true)
    }
  })

  it('23. ActionClass derives from ACTION_REGISTRY', () => {
    const scope = resolveActionScope(['generate_monthly_story'], DEF_KEY)
    expect(scope.ok).toBe(true)
    if (scope.ok) {
      expect(scope.scope.entries[0].actionClass).toBe(ACTION_REGISTRY.generate_monthly_story.action_class)
    }
  })

  it('24. licensing action A does not license a neighbouring action B of the same class', async () => {
    const store = new FakeStore()
    const result = await issueLicense(
      { ...REQUEST, allowedActionKinds: ['generate_monthly_story'] },
      { store: store },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.event.allowedActionKinds).toEqual(['generate_monthly_story'])
      // `proof_governed_effect` is FINANCIAL too and is NOT licensed.
      expect(ACTION_REGISTRY.proof_governed_effect.action_class).toBe('FINANCIAL')
      expect(result.event.allowedActionKinds).not.toContain('proof_governed_effect')
    }
  })

  it('25. FINANCIAL does not mean "all financial actions"', async () => {
    const financial = Object.entries(ACTION_REGISTRY)
      .filter(([, meta]) => meta.action_class === 'FINANCIAL')
      .map(([kind]) => kind)
    expect(financial.length).toBeGreaterThan(1)
    const licensed = resolveActionScope([financial[0]], DEF_KEY)
    expect(licensed.ok).toBe(true)
    if (licensed.ok) {
      expect(licensed.scope.entries).toHaveLength(1)
      expect(licensed.scope.entries.map(e => e.actionKind)).not.toContain(financial[1])
    }
  })

  it('25b. an empty action set is refused', async () => {
    const store = new FakeStore()
    const result = await issueLicense({ ...REQUEST, allowedActionKinds: [] }, { store: store })
    expect(result).toMatchObject({ ok: false, reason: 'action_kinds_required' })
  })

  it('26. the registry fingerprint is deterministic and order-independent', () => {
    const a = resolveActionScope(['generate_monthly_story', 'validate_monthly_story'], DEF_KEY)
    const b = resolveActionScope(['validate_monthly_story', 'generate_monthly_story'], DEF_KEY)
    expect(a.ok && b.ok).toBe(true)
    if (a.ok && b.ok) expect(a.scope.fingerprint).toBe(b.scope.fingerprint)
  })

  it('26b. prose is not bound, so a description change cannot invalidate authority', () => {
    // The payload binds kind, class and placement — never `description`.
    const source = readFileSync(join(MODULE_DIR, 'scope.ts'), 'utf8')
    const payloadAt = source.indexOf('function fingerprintFor')
    const body = source.slice(payloadAt, source.indexOf('\n}', payloadAt))
    expect(body).toContain('action_class')
    expect(body).toContain('boundDefKey')
    expect(body).not.toContain('description')
  })

  it('27. registry drift makes the licence ineffective', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store: store })
    expect(issued.ok).toBe(true)
    if (!issued.ok) return

    // Simulate a reclassification by rewriting the RECORDED fingerprint, which
    // is exactly what a registry change looks like from the read side: the
    // recomputation no longer equals what was stored at issue time.
    const tampered: LicenseEvent = { ...issued.event, actionScopeFingerprint: 'stale-fingerprint' }
    const tamperedStore = new FakeStore()
    tamperedStore.events = [tampered]

    const resolved = await resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store: tamperedStore, instance: INSTANCE, decision: () => autonomyDecision(),
    })
    expect(resolved.effective).toBe(false)
    expect(resolved.reason).toBe('scope_drifted')
    expect(resolved.resolvedLevel).toBe(INEFFECTIVE_LEVEL)
    // Derived, never written.
    expect(tamperedStore.events).toHaveLength(1)
  })

  it('27b. scopeDrifted compares the recorded value against a live recomputation', () => {
    const scope = resolveActionScope(['generate_monthly_story'], DEF_KEY)
    expect(scope.ok).toBe(true)
    if (!scope.ok) return
    expect(scopeDrifted(['generate_monthly_story'], DEF_KEY, scope.scope.fingerprint)).toBe(false)
    expect(scopeDrifted(['generate_monthly_story'], DEF_KEY, 'something-else')).toBe(true)
    // Removal from the licensed set is drift too.
    expect(scopeDrifted(['validate_monthly_story'], DEF_KEY, scope.scope.fingerprint)).toBe(true)
  })

  it('28. no second ActionKind or ActionClass vocabulary is introduced', () => {
    for (const file of sourceFiles()) {
      const code = codeOnly(readFileSync(file, 'utf8'))
      expect(code, file).not.toMatch(/\[['"](READ_ONLY|REVERSIBLE_WRITE|MATERIAL_WRITE|FINANCIAL|EXTERNAL_COMMUNICATION|DESTRUCTIVE)['"]/)
      expect(code, file).not.toMatch(/ACTION_CLASSES\s*=/)
      expect(code, file).not.toMatch(/ActionKind\s*=\s*['"]/)
    }
    // The classes ARE reused, by import.
    const scope = readFileSync(join(MODULE_DIR, 'scope.ts'), 'utf8')
    expect(scope).toContain('@/lib/workflows/action-registry')
    expect(ACTION_CLASSES).toHaveLength(6)
    expect(ACTION_CLASS_POLICY.FINANCIAL.requiresAuthorization).toBe(true)
  })
})

// ── LIFECYCLE ─────────────────────────────────────────────────────────────────

describe('Phase 2C — lifecycle', () => {
  async function issued() {
    const store = new FakeStore()
    const result = await issueLicense(REQUEST, { store: store })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('issue failed')
    return { store, licenseId: result.event.licenseId }
  }
  it('29. issuing establishes exactly one licence', async () => {
    const { store } = await issued()
    expect(store.events).toHaveLength(1)
    expect(deriveLicenseState(store.events).status).toBe('active')
  })

  it('30. a restriction may lower the level', async () => {
    const { store, licenseId } = await issued()
    const result = await restrictLicense(
      { licenseId, licensedLevel: 'L1', allowedActionKinds: REQUEST.allowedActionKinds, effectiveAt: EFFECTIVE, expiresAt: EXPIRES },
      { store: store },
    )
    expect(result.ok).toBe(true)
    expect(deriveLicenseState(store.events).licensedLevel).toBe('L1')
  })

  it('31. a restriction may remove actions', async () => {
    const { store, licenseId } = await issued()
    const result = await restrictLicense(
      { licenseId, licensedLevel: 'L3', allowedActionKinds: ['validate_monthly_story'], effectiveAt: EFFECTIVE, expiresAt: EXPIRES },
      { store: store },
    )
    expect(result.ok).toBe(true)
    expect(deriveLicenseState(store.events).actionKinds).toEqual(['validate_monthly_story'])
  })

  it('32. a restriction may shorten the window', async () => {
    const { store, licenseId } = await issued()
    const shorter = '2026-10-01T00:00:00.000Z'
    const result = await restrictLicense(
      { licenseId, licensedLevel: 'L3', allowedActionKinds: REQUEST.allowedActionKinds, effectiveAt: EFFECTIVE, expiresAt: shorter },
      { store: store },
    )
    expect(result.ok).toBe(true)
    expect(deriveLicenseState(store.events).expiresAt).toBe(shorter)
  })

  it('33. a restriction cannot raise the level', async () => {
    const { store, licenseId } = await issued()
    const result = await restrictLicense(
      { licenseId, licensedLevel: 'L6', allowedActionKinds: REQUEST.allowedActionKinds, effectiveAt: EFFECTIVE, expiresAt: EXPIRES },
      { store: store },
    )
    expect(result).toMatchObject({ ok: false, reason: 'restriction_raises_level' })
    expect(store.events).toHaveLength(1)
  })

  it('34. a restriction cannot add actions', async () => {
    const { store, licenseId } = await issued()
    const result = await restrictLicense(
      { licenseId, licensedLevel: 'L3', allowedActionKinds: ['generate_monthly_story', 'proof_governed_effect'], effectiveAt: EFFECTIVE, expiresAt: EXPIRES },
      { store: store },
    )
    expect(result).toMatchObject({ ok: false, reason: 'restriction_adds_action' })
    expect(store.events).toHaveLength(1)
  })

  it('35. a restriction cannot extend the expiration', async () => {
    const { store, licenseId } = await issued()
    const result = await restrictLicense(
      { licenseId, licensedLevel: 'L3', allowedActionKinds: REQUEST.allowedActionKinds, effectiveAt: EFFECTIVE, expiresAt: '2099-01-01T00:00:00.000Z' },
      { store: store },
    )
    expect(result).toMatchObject({ ok: false, reason: 'restriction_extends_window' })
    expect(store.events).toHaveLength(1)
  })

  it('35b. a restriction cannot move the window start earlier', async () => {
    const { store, licenseId } = await issued()
    const result = await restrictLicense(
      { licenseId, licensedLevel: 'L3', allowedActionKinds: REQUEST.allowedActionKinds, effectiveAt: '2026-01-01T00:00:00.000Z', expiresAt: EXPIRES },
      { store: store },
    )
    expect(result).toMatchObject({ ok: false, reason: 'restriction_extends_window' })
  })

  it('36. suspension resolves to L0', async () => {
    const { store, licenseId } = await issued()
    expect((await suspendLicense({ licenseId }, { store: store })).ok).toBe(true)
    const resolved = await resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store, instance: INSTANCE, decision: () => autonomyDecision(),
    })
    expect(resolved.status).toBe('suspended')
    expect(resolved.effective).toBe(false)
    expect(resolved.reason).toBe('suspended')
    expect(resolved.resolvedLevel).toBe('L0')
  })

  it('37. revocation resolves to L0 and is terminal', async () => {
    const { store, licenseId } = await issued()
    expect((await revokeLicense({ licenseId }, { store: store })).ok).toBe(true)
    const resolved = await resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store, instance: INSTANCE, decision: () => autonomyDecision(),
    })
    expect(resolved.status).toBe('revoked')
    expect(resolved.reason).toBe('revoked')
    expect(resolved.resolvedLevel).toBe('L0')

    // Terminal: no further act, not even a restriction.
    const after = await restrictLicense(
      { licenseId, licensedLevel: 'L0', allowedActionKinds: REQUEST.allowedActionKinds, effectiveAt: EFFECTIVE, expiresAt: EXPIRES },
      { store: store },
    )
    expect(after).toMatchObject({ ok: false, reason: 'license_terminal' })
  })

  it('38. supersession resolves the REPLACEMENT, not the superseded lineage', async () => {
    const store = new FakeStore()
    const first = await issueLicense(REQUEST, { store: store })
    const second = await issueLicense(REQUEST, { store: store })
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    const resolve = () => resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store, instance: INSTANCE, decision: () => autonomyDecision(),
    })

    // BEFORE the supersession both lineages are live and nothing yet says which
    // governs, so the only safe answer is L0 — not a guess.
    const before = await resolve()
    expect(before.reason).toBe('ambiguous_licenses')
    expect(before.effective).toBe(false)
    expect(before.resolvedLevel).toBe('L0')

    const result = await supersedeLicense(
      { licenseId: first.event.licenseId, supersededByLicenseId: second.event.licenseId },
      { store: store },
    )
    expect(result.ok).toBe(true)

    // AFTER it, B is the unique live lineage — and it must be B that answers.
    // Latest-event-wins would pick A here, because A's supersession act is the
    // newest event in the instance; A is superseded, so the licence would read
    // L0 and the replacement would never be consulted.
    const after = await resolve()
    expect(after.licenseId).toBe(second.event.licenseId)
    expect(after.effective).toBe(true)
    expect(after.reason).toBe('active')
    expect(after.resolvedLevel).toBe('L3')

    // A's own history is untouched and still reads as superseded.
    const a = deriveLicenseState(store.events.filter(e => e.licenseId === first.event.licenseId))
    expect(a.status).toBe('superseded')
    expect(a.supersededByLicenseId).toBe(second.event.licenseId)
  })

  it('38c. a chain A → B → C resolves C', async () => {
    const store = new FakeStore()
    const a = await issueLicense(REQUEST, { store: store })
    const b = await issueLicense(REQUEST, { store: store })
    const c = await issueLicense(REQUEST, { store: store })
    expect(a.ok && b.ok && c.ok).toBe(true)
    if (!a.ok || !b.ok || !c.ok) return

    await supersedeLicense({ licenseId: a.event.licenseId, supersededByLicenseId: b.event.licenseId }, { store: store })
    // B is superseded too: after this every lineage is terminal except C.
    await supersedeLicense({ licenseId: b.event.licenseId, supersededByLicenseId: c.event.licenseId }, { store: store })

    const resolved = await resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store, instance: INSTANCE, decision: () => autonomyDecision(),
    })
    expect(resolved.licenseId).toBe(c.event.licenseId)
    expect(resolved.effective).toBe(true)
    expect(store.events.filter(e => e.licenseId === a.event.licenseId)).toHaveLength(2)
    expect(store.events.filter(e => e.licenseId === b.event.licenseId)).toHaveLength(2)
    expect(store.events.filter(e => e.licenseId === c.event.licenseId)).toHaveLength(1)
  })

  it('38d. two live lineages with no supersession are ambiguous, never guessed', async () => {
    const store = new FakeStore()
    await issueLicense(REQUEST, { store: store })
    await issueLicense(REQUEST, { store: store })
    const resolved = await resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store, instance: INSTANCE, decision: () => autonomyDecision(),
    })
    expect(resolved.reason).toBe('ambiguous_licenses')
    expect(resolved.effective).toBe(false)
    expect(resolved.resolvedLevel).toBe('L0')
    expect(resolved.licenseId).toBeNull()
  })

  it('38e. a revoked lineage does not compete with a live one', async () => {
    const store = new FakeStore()
    const dead = await issueLicense(REQUEST, { store: store })
    const live = await issueLicense(REQUEST, { store: store })
    expect(dead.ok && live.ok).toBe(true)
    if (!dead.ok || !live.ok) return
    await revokeLicense({ licenseId: dead.event.licenseId }, { store: store })

    const resolved = await resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store, instance: INSTANCE, decision: () => autonomyDecision(),
    })
    expect(resolved.licenseId).toBe(live.event.licenseId)
    expect(resolved.effective).toBe(true)
  })

  it('38b. a supersession may not cross instances', async () => {
    const store = new FakeStore()
    const first = await issueLicense(REQUEST, { store: store })
    const otherInstance = { ...REQUEST, workflowInstanceId: '12345678-1234-4123-8123-123456789abc' }
    const second = await issueLicense(otherInstance, { store: store })
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    const result = await supersedeLicense(
      { licenseId: first.event.licenseId, supersededByLicenseId: second.event.licenseId },
      { store: store },
    )
    expect(result.ok).toBe(false)
  })

  it('39. expiration resolves to L0 from the read clock alone', async () => {
    const { store } = await issued()
    const resolved = await resolveLicense(REQUEST.workflowInstanceId, AFTER_EXPIRY, {
      store, instance: INSTANCE, decision: () => autonomyDecision(),
    })
    expect(resolved.reason).toBe('expired')
    expect(resolved.resolvedLevel).toBe('L0')
    // No status column was rewritten to say so.
    expect(deriveLicenseState(store.events).status).toBe('active')
  })

  it('39b. before effective_at the licence is not yet effective', async () => {
    const { store } = await issued()
    const resolved = await resolveLicense(REQUEST.workflowInstanceId, '2026-09-20T09:00:00.000Z', {
      store, instance: INSTANCE, decision: () => autonomyDecision(),
    })
    expect(resolved.reason).toBe('not_yet_effective')
    expect(resolved.resolvedLevel).toBe('L0')
  })

  it('40. there is no RESUMED act in V1', () => {
    expect(LICENSE_ACTS).not.toContain('LICENSE_RESUMED')
    expect(LICENSE_ACTS).toHaveLength(5)
    for (const file of sourceFiles()) {
      expect(codeOnly(readFileSync(file, 'utf8')), file).not.toMatch(/LICENSE_RESUMED|resumeLicense/i)
    }
    // The migration's act vocabulary is asserted as a VOCABULARY, not as an
    // absence from the file: the file legitimately names RESUMED in the comment
    // explaining why there is no such act, and a whole-file substring check
    // would fail on the explanation rather than on the code.
    expect(actVocabularyInMigration()).toEqual([...LICENSE_ACTS])
  })

  it('41. generation position keeps structural uniqueness defence-in-depth', () => {
    // What this asserts is STRUCTURE, in three parts that support each other:
    // the unique index rejects two duplicate LITERAL lineage positions, and the
    // row lock plus the database-derived generation are the machinery that makes
    // a position meaningful at all.
    //
    // It is deliberately NOT a claim about the stale-human race. The unique
    // index cannot detect one: a caller whose read went stale claims the
    // FOLLOWING generation, so nothing ever collides. What refuses that race is
    // the `expectedGeneration` comparison under the lineage lock, proven by the
    // dedicated final-hardening tests in this file and against real PostgreSQL
    // in `autonomy-license-sql.test.ts` — see the "write contract carries the
    // observed generation" block below.
    const sql = migrationSql()
    expect(sql).toMatch(/create unique index[\s\S]{0,200}\(license_id, license_generation\)/)
    expect(sql).toMatch(/perform 1 from public\.atlas_autonomy_license_events[\s\S]{0,80}for update/)
    expect(sql).toMatch(/coalesce\(max\(license_generation\) \+ 1, 0\)/)
  })
})

// ── VOCABULARIES ──────────────────────────────────────────────────────────────

describe('Phase 2C — vocabularies', () => {
  it('42. the L0–L6 vocabulary is exactly §18.10s seven levels, in order', () => {
    expect([...AUTONOMY_LICENSE_LEVELS]).toEqual(['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6'])
    expect(AUTONOMY_LICENSE_LEVELS).toHaveLength(7)
  })

  it('42b. no second level vocabulary was introduced', () => {
    for (const file of sourceFiles()) {
      expect(codeOnly(readFileSync(file, 'utf8')), file)
        .not.toMatch(/LicenceLevelV1|LicenseLevelV1|AutonomyTier|PermissionLevel/)
    }
  })

  it('43/44. Mission risk vocabularies never enter level resolution', () => {
    for (const file of sourceFiles()) {
      const code = codeOnly(readFileSync(file, 'utf8'))
      expect(code, file).not.toMatch(/MissionRiskLevel|riskLevel|MissionRecord\b/)
      expect(code, file).not.toMatch(/\brisks\b\s*[:=]/)
    }
  })

  it('45. ActionClass is reused, not duplicated', () => {
    const scope = readFileSync(join(MODULE_DIR, 'scope.ts'), 'utf8')
    expect(scope).toContain("from '@/lib/workflows/action-registry'")
    expect(scope).not.toMatch(/export const ACTION_CLASSES/)
  })

  it('46. the decision materiality domain is reused, not duplicated', () => {
    const issue = readFileSync(join(MODULE_DIR, 'issue.ts'), 'utf8')
    // The domain is a string looked up against the canonical MaterialityDomain
    // list; a local list would be a second declaration of the same fact.
    expect(issue).not.toMatch(/MATERIALITY_DOMAINS\s*=\s*\[/)
    expect(issue).toMatch(/materiality\.includes\('autonomy'\)/)
  })

  it('46b. the reason vocabulary is closed and covers every ineffective path', () => {
    for (const reason of [
      'no_license', 'not_yet_effective', 'expired', 'suspended', 'revoked', 'superseded',
      'malformed_lineage', 'decision_not_governing', 'workflow_definition_drifted', 'scope_drifted',
    ]) {
      expect(LICENSE_REASONS).toContain(reason)
    }
  })
})

// ── SINGLE SOURCE OF THE LEVEL VOCABULARY ─────────────────────────────────────
//
// Phase 2C's vocabulary ruling: Chapter 18 OWNS the L0–L6 scale; Survival is a
// CONSUMER of it. Before the ruling the declaration lived in the Survival
// module and this one imported it, which had the ownership backwards and made
// this module an importer of Survival.

describe('Phase 2C — one canonical owner of the level vocabulary', () => {
  const LEVELS_PATH = join(MODULE_DIR, 'levels.ts')
  const SURVIVAL_TYPES = resolve(__dirname, '..', 'atlas', 'survival', 'types.ts')

  it('levels.ts declares the canonical vocabulary', () => {
    const src = readFileSync(LEVELS_PATH, 'utf8')
    expect(src).toMatch(/export const AUTONOMY_LICENSE_LEVELS = \[/)
    expect(src).toMatch(/export type AutonomyLicenseLevel = \(typeof AUTONOMY_LICENSE_LEVELS\)\[number\]/)
    expect(src).toMatch(/export const AUTONOMY_LICENSE_LABELS: Record<AutonomyLicenseLevel, string>/)
  })

  it('levels.ts is a LEAF — it imports nothing at all', () => {
    // A vocabulary that depends on a subsystem is a vocabulary that subsystem
    // can bend. This is the property that makes the ownership real.
    const code = codeOnly(readFileSync(LEVELS_PATH, 'utf8'))
    expect(code).not.toMatch(/\bimport\b/)
    expect(code).not.toMatch(/\brequire\(/)
    expect(code).not.toMatch(/\bfrom\s+['"]/)
  })

  it('survival/types.ts declares no vocabulary of its own', () => {
    const src = readFileSync(SURVIVAL_TYPES, 'utf8')
    expect(src).not.toMatch(/export const AUTONOMY_LICENSE_LEVELS\s*=\s*\[/)
    expect(src).not.toMatch(/export type AutonomyLicenseLevel\s*=/)
    expect(src).not.toMatch(/export const AUTONOMY_LICENSE_LABELS\s*[:=]/)
  })

  it('survival/types.ts imports AND re-exports the canonical vocabulary', () => {
    const src = readFileSync(SURVIVAL_TYPES, 'utf8')
    // Imported for this file's own use (it names the type in an interface)...
    expect(src).toMatch(/from '@\/lib\/atlas\/autonomy-license\/levels'/)
    expect(src).toMatch(/type AutonomyLicenseLevel/)
    // ...AND re-exported, so every existing Survival consumer is unchanged.
    expect(src).toMatch(/export \{ AUTONOMY_LICENSE_LEVELS, AUTONOMY_LICENSE_LABELS \}/)
    expect(src).toMatch(/export type \{ AutonomyLicenseLevel \}/)
  })

  it('exactly ONE declaration of the canonical array exists repo-wide', () => {
    const declarers: string[] = []
    // `__dirname` is lib/qa, so the app root is two levels up.
    const APP_ROOT = resolve(__dirname, '..', '..')
    for (const root of ['lib', 'app', 'components'].map(r => join(APP_ROOT, r))) {
      for (const file of walk(root)) {
        if (!/\.(ts|tsx)$/.test(file)) continue
        if (/export const AUTONOMY_LICENSE_LEVELS\s*=\s*\[/.test(readFileSync(file, 'utf8'))) {
          declarers.push(file)
        }
      }
    }
    expect(declarers, `declared in: ${declarers.join(', ')}`).toEqual([LEVELS_PATH])
  })

  it('no autonomy-license file references Survival at all', () => {
    // RAW text, not comment-stripped: this mirrors the closed-consumer walker in
    // survival-derivation.test.ts, which matches raw text too. Asserting the
    // stricter form means passing here cannot coexist with failing there.
    for (const file of sourceFiles()) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/atlas\/survival/)
    }
  })

  it('no second L0–L6 autonomy declaration exists inside this module', () => {
    for (const file of sourceFiles()) {
      if (file === LEVELS_PATH) continue
      const code = codeOnly(readFileSync(file, 'utf8'))
      expect(code, file).not.toMatch(/AUTONOMY_LICENSE_LEVELS\s*=\s*\[/)
      expect(code, file).not.toMatch(/\['L0',\s*'L1'/)
    }
  })

  it('the canonical scale is not conflated with Mission risk', () => {
    const code = codeOnly(readFileSync(LEVELS_PATH, 'utf8'))
    expect(code).not.toMatch(/MissionRiskLevel|riskLevel|MissionRecord/)
    expect(code).not.toMatch(/low.?medium.?high/i)
    // Survival's ceiling arithmetic stays Survival's — not moved here.
    expect(code).not.toMatch(/SURVIVAL_CEILING|survivalCeiling|effectiveAutonomy|lowestAutonomy/)
  })
})

// ── MIGRATION HYGIENE ─────────────────────────────────────────────────────────

describe('Phase 2C — the migration does not collide with the chain it joins', () => {
  const MIGRATION_DIR = resolve(__dirname, '../../supabase/migrations')
  const MY_FILE = '20260924180000_autonomy_license_phase2c.sql'

  /** Object names a migration creates, alters or drops. Comments stripped first. */
  function objectsOf(sql: string): Set<string> {
    const names = new Set<string>()
    const code = sql.replace(/--[^\n]*/g, '')
    const pats = [
      /create\s+(?:or\s+replace\s+)?(?:table|index|function|trigger|view|sequence|policy)(?:\s+if\s+not\s+exists)?\s+(?:public\.)?([a-z0-9_]+)/gi,
      /alter\s+table(?:\s+if\s+exists)?\s+(?:public\.)?([a-z0-9_]+)/gi,
      /drop\s+(?:table|index|function|trigger|view|sequence)(?:\s+if\s+exists)?\s+(?:public\.)?([a-z0-9_]+)/gi,
    ]
    for (const pat of pats) for (const m of code.matchAll(pat)) names.add(m[1].toLowerCase())
    return names
  }

  it('shares no created, altered or dropped object with any earlier canonical migration', () => {
    // This branch was cut from `69957d3`; Phase 1C2 (`20260924140000`) merged while it
    // was in flight, so Phase 2C now applies AFTER a migration that did not exist when
    // it was written. The SQL fixture cannot rebuild 1C2's own dependencies
    // (`atlas_code_work_*` tables, from SDF-1B1), so the question that actually matters
    // is answered here instead: the two migrations must not touch the same database
    // object, which is the only way the apply ORDER could make Phase 2C fail.
    const mine = objectsOf(readFileSync(join(MIGRATION_DIR, MY_FILE), 'utf8'))
    expect(mine.size).toBeGreaterThan(0)

    const earlier = readdirSync(MIGRATION_DIR)
      .filter(f => f.endsWith('.sql') && f < MY_FILE)
    expect(earlier.length).toBeGreaterThan(0)

    const collisions: string[] = []
    for (const file of earlier) {
      for (const name of objectsOf(readFileSync(join(MIGRATION_DIR, file), 'utf8'))) {
        if (mine.has(name)) collisions.push(`${name} (also in ${file})`)
      }
    }
    expect(collisions, `object collision with an earlier migration:\n${collisions.join('\n')}`).toEqual([])
  })

  it('names itself so it sorts last in the current canonical set', () => {
    const files = readdirSync(MIGRATION_DIR).filter(f => f.endsWith('.sql')).sort()
    expect(files[files.length - 1]).toBe(MY_FILE)
    expect(files).toHaveLength(101)
  })
})

// ── HARDENING ─────────────────────────────────────────────────────────────────
//
// Each of these reproduces a defect found by independent review, and asserts the
// fixed behaviour. The defect is stated in the test so a future reader can tell
// what the assertion is defending against.

describe('Phase 2C — hardening', () => {
  it('H1. causal order is generation, not the clock', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store: store })
    expect(issued.ok).toBe(true)
    if (!issued.ok) return
    await suspendLicense({ licenseId: issued.event.licenseId }, { store: store })

    // Scramble the timestamps so the CLOCK contradicts the causal order: the
    // suspension claims to have happened before the issue it followed. Under
    // clock-first ordering this chain either reorders into
    // "suspended, then issued" (which cannot be folded at all) or folds to the
    // wrong status. Generation is the act's structural position and cannot be
    // skewed by an NTP correction or a client's clock.
    const scrambled = store.events.map(e => ({
      ...e,
      occurredAt: e.generation === 0 ? '2026-12-31T00:00:00.000Z' : '2026-01-01T00:00:00.000Z',
    }))
    let state
    expect(() => { state = deriveLicenseState(scrambled) }).not.toThrow()
    expect(state!.status).toBe('suspended')
  })

  it('H2. a restriction cannot clear a suspension — write boundary', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store: store })
    expect(issued.ok).toBe(true)
    if (!issued.ok) return
    await suspendLicense({ licenseId: issued.event.licenseId }, { store: store })

    // The defect: ISSUED → SUSPENDED → RESTRICTED left the last act RESTRICTED,
    // so the status computed as `restricted`, the suspension check never fired,
    // and the licence silently returned to effective — a suspended grant revived
    // by an act that is only supposed to narrow.
    const result = await restrictLicense(
      { licenseId: issued.event.licenseId, licensedLevel: 'L1',
        allowedActionKinds: REQUEST.allowedActionKinds, effectiveAt: EFFECTIVE, expiresAt: EXPIRES },
      { store: store },
    )
    expect(result).toMatchObject({ ok: false, reason: 'license_suspended' })
    expect(store.events).toHaveLength(2)
  })

  it('H3. after a suspension only revocation and supersession are admissible', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store: store })
    expect(issued.ok).toBe(true)
    if (!issued.ok) return
    await suspendLicense({ licenseId: issued.event.licenseId }, { store: store })

    expect((await revokeLicense({ licenseId: issued.event.licenseId }, { store: store })).ok).toBe(true)
    const resolved = await resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store, instance: INSTANCE, decision: () => autonomyDecision(),
    })
    expect(resolved.status).toBe('revoked')
    expect(resolved.effective).toBe(false)
    expect(resolved.resolvedLevel).toBe('L0')
  })

  it('H3b. suspension then supersession is a valid lineage', async () => {
    const store = new FakeStore()
    const a = await issueLicense(REQUEST, { store: store })
    const b = await issueLicense(REQUEST, { store: store })
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    await suspendLicense({ licenseId: a.event.licenseId }, { store: store })
    expect((await supersedeLicense(
      { licenseId: a.event.licenseId, supersededByLicenseId: b.event.licenseId }, { store: store },
    )).ok).toBe(true)

    const resolved = await resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store, instance: INSTANCE, decision: () => autonomyDecision(),
    })
    expect(resolved.licenseId).toBe(b.event.licenseId)
    expect(resolved.effective).toBe(true)
  })

  it('H4. the pure fold fails closed on ANY act after a suspension', async () => {
    // Even if a future writer bypassed both the boundary and the RPC, an
    // impossible history must not fold into an effective licence. A restriction
    // would be a hidden resume; a second suspension is outside the vocabulary
    // entirely. Both must fail to fold.
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store })
    if (!issued.ok) throw new Error('issue failed')
    await suspendLicense({ licenseId: issued.event.licenseId }, { store })

    for (const act of ['LICENSE_RESTRICTED', 'LICENSE_SUSPENDED'] as const) {
      const forged = [
        ...store.events,
        { ...store.events[1], eventId: `forged-${act}`, generation: 2, eventSeq: 99, act },
      ]
      expect(() => deriveLicenseState(forged), act).toThrow(/act-after-suspension/)
    }
  })

  it('H5. invalid level input is REFUSED, never thrown', async () => {
    const store = new FakeStore()
    for (const level of ['L9', '', '2', 'l3', 'L', null, undefined, 3, {}, []]) {
      let threw: unknown = null
      let result: Awaited<ReturnType<typeof issueAutonomyLicense>> | null = null
      try {
        result = await issueLicense(
          { ...REQUEST, licensedLevel: level as string }, { store: store },
        )
      } catch (error) { threw = error }
      expect(threw, `level ${JSON.stringify(level)} must not throw`).toBeNull()
      expect(result, `level ${JSON.stringify(level)}`).toMatchObject({ ok: false, reason: 'invalid_level' })
    }
    expect(store.events).toHaveLength(0)
  })

  it('H5b. the same refusal applies to a restriction', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store: store })
    expect(issued.ok).toBe(true)
    if (!issued.ok) return
    const result = await restrictLicense(
      { licenseId: issued.event.licenseId, licensedLevel: 'L9',
        allowedActionKinds: REQUEST.allowedActionKinds, effectiveAt: EFFECTIVE, expiresAt: EXPIRES },
      { store: store },
    )
    expect(result).toMatchObject({ ok: false, reason: 'invalid_level' })
    expect(store.events).toHaveLength(1)
  })

  it('H6. the fingerprint binds executability, not only class and placement', () => {
    // The defect: an action could move from INERT to EXECUTABLE without its
    // class or placement changing — `executor_family` could change, or the kind
    // could join `GOVERNED_EFFECT_ENABLED_KINDS`. The fingerprint stayed equal,
    // so a licence issued while the action did nothing would silently become a
    // licence to make it do something real.
    //
    // Proven by MUTATING the real registry and calling the real function, so the
    // test cannot drift from the payload it is testing.
    const registry = ACTION_REGISTRY as unknown as Record<string, Record<string, unknown>>
    const enabled = GOVERNED_EFFECT_ENABLED_KINDS as unknown as string[]
    const kind = 'generate_monthly_story'
    const originalMeta = { ...registry[kind] }
    const originalEnabled = [...enabled]
    const before = fingerprintFor([kind], DEF_KEY)
    expect(before).toMatch(/^[0-9a-f]{64}$/)

    try {
      registry[kind] = { ...originalMeta, executor_family: 'a-different-family' }
      expect(fingerprintFor([kind], DEF_KEY), 'family change must move the fingerprint').not.toBe(before)

      registry[kind] = originalMeta
      expect(fingerprintFor([kind], DEF_KEY)).toBe(before)

      const at = enabled.indexOf(kind)
      if (at !== -1) enabled.splice(at, 1)
      expect(fingerprintFor([kind], DEF_KEY), 'enablement change must move the fingerprint').not.toBe(before)

      enabled.length = 0
      enabled.push(...originalEnabled)
      expect(fingerprintFor([kind], DEF_KEY)).toBe(before)

      // Prose is deliberately NOT bound: rewording a description must not
      // invalidate authority, or reviewers learn to ignore the signal.
      registry[kind] = { ...originalMeta, description: 'reworded prose' }
      expect(fingerprintFor([kind], DEF_KEY), 'description must not move the fingerprint').toBe(before)
    } finally {
      registry[kind] = originalMeta
      enabled.length = 0
      enabled.push(...originalEnabled)
    }
  })

  it('H6b. an executability change reads as scope_drifted at read time', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store: store })
    expect(issued.ok).toBe(true)
    if (!issued.ok) return
    // A fingerprint recorded under a registry that has since moved cannot match
    // a live recomputation, whatever moved.
    const stale = new FakeStore()
    stale.events = [{ ...issued.event, actionScopeFingerprint: 'b'.repeat(64) }]
    const resolved = await resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store: stale, instance: INSTANCE, decision: () => autonomyDecision(),
    })
    expect(resolved.reason).toBe('scope_drifted')
    expect(resolved.resolvedLevel).toBe('L0')
  })

  it('H7. the machine write seam is closed at the code level', () => {
    const namingRpc: string[] = []
    const appending: string[] = []
    for (const file of sourceFiles()) {
      const code = codeOnly(readFileSync(file, 'utf8'))
      if (code.includes('autonomy_license_append')) namingRpc.push(file.split('/').pop()!)
      if (/\.append\(/.test(code)) appending.push(file.split('/').pop()!)
    }
    // The RPC may be NAMED in exactly one place, and the store's append path may
    // be DRIVEN from exactly one place: the reviewed human licensing boundary.
    // resolve/compose/executors/gates/providers/spend have no write reach.
    expect(namingRpc, 'only store.ts may name the RPC').toEqual(['store.ts'])
    expect(appending, 'only issue.ts may drive the append path').toEqual(['issue.ts'])
  })

  it('H7b. the actor constraint is documented as defence in depth, not authority', () => {
    const sql = migrationSql()
    expect(sql).toMatch(/defence in depth|defense in depth/i)
    expect(sql).toMatch(/resolvePlatformOperator/)
    expect(sql).toMatch(/NOT proof of/i)
  })
})

// ── THE AUTHORITY API HAS NO BYPASS SEAM ──────────────────────────────────────
//
// The defect these guard: every exported mutation used to accept an optional
// `args` object carrying `operator`, `store`, `instance`, `decisionLineage` and
// `now`. Any caller could therefore satisfy authorization with
//
//     { operator: { ok: true, actor: 'user:…' } }
//
// and skip the session entirely. Tests reached the same coverage by mocking the
// imported dependencies instead.

describe('Phase 2C — the production authority API', () => {
  const issueSource = readFileSync(join(MODULE_DIR, 'issue.ts'), 'utf8')
  const resolveSource = readFileSync(join(MODULE_DIR, 'resolve.ts'), 'utf8')

  const declaredParams = (source: string, fn: string, until: string): string[] => {
    const at = source.indexOf(`export async function ${fn}(`)
    expect(at, `${fn} must be exported`).toBeGreaterThan(-1)
    const sig = source.slice(at, source.indexOf(until, at))
    return sig.slice(sig.indexOf('(') + 1).split(',').map(s => s.trim()).filter(Boolean)
  }

  it('1/2. every exported mutation takes EXACTLY ONE parameter', () => {
    for (const fn of [
      'issueAutonomyLicense', 'restrictAutonomyLicense', 'suspendAutonomyLicense',
      'revokeAutonomyLicense', 'supersedeAutonomyLicense',
    ]) {
      const params = declaredParams(issueSource, fn, '): Promise<LicenseWriteResult>')
      expect(params, `${fn} must take only the request`).toHaveLength(1)
      expect(params[0]).toMatch(/^request/)
    }
  })

  it('3/4/5/6/7. no injection type survives, and the resolver takes only the instance', () => {
    for (const src of [issueSource, resolveSource]) {
      // codeOnly: the prose explaining WHY the seam was removed legitimately
      // names the types it removed. A comment that names a concept is not a
      // declaration of it.
      const code = codeOnly(src)
      expect(code).not.toMatch(/interface IssueArgs\b|interface ResolveArgs\b/)
      expect(code).not.toMatch(/IssueArgs\b|ResolveArgs\b/)
    }
    // ── The canonical resolver takes EXACTLY ONE argument ───────────────────
    // `at` used to be the second. A caller-supplied evaluation instant is a
    // caller-supplied authority: it decides whether an expired licence reads as
    // effective and whether a future one has started. The canonical answer uses
    // the server clock, so no clock, `now`, `options` or `args` parameter may
    // reappear here — and no exported alternate resolver may supply one.
    const params = declaredParams(resolveSource, 'resolveAutonomyLicense', '): Promise<ResolvedAutonomyLicense>')
    expect(params).toHaveLength(1)
    expect(params[0]).toMatch(/workflowInstanceId/)
    for (const forbidden of ['at', 'now', 'clock', 'options', 'args', 'instant', 'asOf']) {
      expect(params[0], `the resolver must not accept ${forbidden}`).not.toMatch(
        new RegExp(`\\b${forbidden}\\b`),
      )
    }
  })

  it('10. no exported alternate resolver provides a caller-controlled authority clock', async () => {
    const mod: Record<string, unknown> = await import('@/lib/atlas/autonomy-license/resolve')
    const exported = Object.keys(mod)
    expect(exported).toContain('resolveAutonomyLicense')
    for (const name of exported) {
      expect(name, `${name} looks like a caller-clock resolver`).not.toMatch(
        /At$|WithClock|unsafeResolve|resolveAt|resolveAsOf|Historical|PointInTime/i,
      )
    }
    // And the canonical one really does read the server clock.
    expect(codeOnly(resolveSource)).toMatch(/new Date\(\)\.toISOString\(\)/)
  })

  it('3/4/5/6. the request shapes carry only what a human may decide', () => {
    for (const shape of ['IssueLicenseRequest', 'RestrictLicenseRequest', 'LicenseIdRequest', 'SupersedeLicenseRequest']) {
      const at = issueSource.indexOf(`interface ${shape}`)
      expect(at, `${shape} must exist`).toBeGreaterThan(-1)
      const body = issueSource.slice(at, issueSource.indexOf('\n}', at))
      for (const forbidden of ['operator', 'store', 'instance', 'decisionLineage', 'now', 'actor', 'principal', 'projectId', 'def_hash']) {
        expect(body, `${shape} must not expose ${forbidden}`).not.toMatch(new RegExp(`\\b${forbidden}\\b`))
      }
    }
  })

  it('3/4/5/6. the boundary reaches the REAL sources itself', () => {
    // Positive direction: not merely "no override exists", but "the real thing
    // is what gets used".
    expect(issueSource).toMatch(/await resolvePlatformOperator\(\)/)
    expect(issueSource).toMatch(/await readInstance\(/)
    expect(issueSource).toMatch(/createDecisionLedgerStore\(\)/)
    expect(issueSource).toMatch(/new Date\(\)\.toISOString\(\)/)
    expect(resolveSource).toMatch(/await readInstance\(/)
    expect(resolveSource).toMatch(/createDecisionLedgerStore\(\)/)
    expect(resolveSource).toMatch(/createAutonomyLicenseStore\(\)/)
  })

  it('6. the issue-time clock cannot be backdated through a public override', () => {
    expect(issueSource).not.toMatch(/args\.now|now\?:\s*string/)
    expect(issueSource).toMatch(/new Date\(\)\.toISOString\(\)/)
  })
})

// ── FAIL-CLOSED SIBLINGS, SUBJECT DRIFT, EXACT LIFECYCLE, PROVENANCE ──────────

describe('Phase 2C — review #2 proofs', () => {
  const FORGED = 'b0000000-0000-4000-8000-00000000000b'

  it('8. a malformed sibling lineage fails the whole resolution closed', async () => {
    const store = new FakeStore()
    expect((await issueLicense(REQUEST, { store })).ok).toBe(true)
    // A healthy live licence PLUS a chain for the same instance that cannot fold.
    store.events.push({ ...store.events[0], eventId: 'broken', eventSeq: 99, licenseId: FORGED, generation: 5 })

    const resolved = await resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, { store })
    expect(resolved.reason).toBe('malformed_lineage')
    expect(resolved.effective).toBe(false)
    expect(resolved.resolvedLevel).toBe('L0')
    expect(resolved.licenseId).toBeNull()
  })

  it('9. a malformed sibling fails closed even beside a TERMINAL healthy lineage', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store })
    if (!issued.ok) throw new Error('issue failed')
    await revokeLicense({ licenseId: issued.event.licenseId }, { store })
    store.events.push({ ...store.events[0], eventId: 'broken', eventSeq: 99, licenseId: FORGED, generation: 5 })

    const resolved = await resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, { store })
    expect(resolved.reason).toBe('malformed_lineage')
    expect(resolved.resolvedLevel).toBe('L0')
  })

  it('10. workflow project drift resolves to L0', async () => {
    const store = new FakeStore()
    expect((await issueLicense(REQUEST, { store })).ok).toBe(true)
    // The instance now claims another project; the decision is moved with it so
    // that project drift is the ONLY thing under test.
    const resolved = await resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store,
      instance: { ...INSTANCE, project_id: PROJECT_B },
      decision: () => autonomyDecision({ projectId: PROJECT_B }),
    })
    expect(resolved.effective).toBe(false)
    expect(resolved.reason).toBe('workflow_project_drifted')
    expect(resolved.resolvedLevel).toBe('L0')
  })

  it('11. a second suspension is refused at the boundary', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store })
    if (!issued.ok) throw new Error('issue failed')
    expect((await suspendLicense({ licenseId: issued.event.licenseId }, { store })).ok).toBe(true)

    const second = await suspendLicense({ licenseId: issued.event.licenseId }, { store })
    expect(second).toMatchObject({ ok: false, reason: 'license_already_suspended' })
    expect(store.events).toHaveLength(2)
  })

  it('13. a forged duplicate suspension is malformed in the fold', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store })
    if (!issued.ok) throw new Error('issue failed')
    await suspendLicense({ licenseId: issued.event.licenseId }, { store })
    const forged = [...store.events, { ...store.events[1], eventId: 'forged', eventSeq: 99, generation: 2 }]
    expect(() => deriveLicenseState(forged)).toThrow(/act-after-suspension/)
  })

  it('14. revocation remains valid after a suspension, and resolves L0', async () => {
    const store = new FakeStore()
    const a = await issueLicense(REQUEST, { store })
    if (!a.ok) throw new Error('issue failed')
    await suspendLicense({ licenseId: a.event.licenseId }, { store })

    expect((await revokeLicense({ licenseId: a.event.licenseId }, { store })).ok).toBe(true)

    const resolved = await resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, { store })
    expect(resolved.status).toBe('revoked')
    expect(resolved.effective).toBe(false)
    expect(resolved.resolvedLevel).toBe('L0')
  })

  it('15. supersession remains valid after a suspension, and the replacement governs', async () => {
    const store = new FakeStore()
    const a = await issueLicense(REQUEST, { store })
    const b = await issueLicense(REQUEST, { store })
    if (!a.ok || !b.ok) throw new Error('issue failed')
    await suspendLicense({ licenseId: a.event.licenseId }, { store })

    expect((await supersedeLicense(
      { licenseId: a.event.licenseId, supersededByLicenseId: b.event.licenseId }, { store },
    )).ok).toBe(true)

    // A is suspended-then-superseded, hence terminal and silent; B is the
    // unique live lineage and answers.
    const resolved = await resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, { store })
    expect(resolved.licenseId).toBe(b.event.licenseId)
    expect(resolved.effective).toBe(true)
  })

  it('16. a second LICENSE_ISSUED in one lineage is malformed', async () => {
    const store = new FakeStore()
    expect((await issueLicense(REQUEST, { store })).ok).toBe(true)
    const forged = [...store.events, { ...store.events[0], eventId: 'forged', eventSeq: 99, generation: 1 }]
    expect(() => deriveLicenseState(forged)).toThrow(/issue-not-at-generation-zero/)
  })

  it('16b. the actor MAY change between acts — different humans, one licence', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store })
    if (!issued.ok) throw new Error('issue failed')
    // Not every field is immutable. `actor` is deliberately excluded from the
    // provenance check, because a second authorized operator legitimately acts
    // on a licence someone else issued.
    const other = { ...store.events[0], eventId: 'second-actor', eventSeq: 98, generation: 1,
      act: 'LICENSE_SUSPENDED' as const, actor: 'user:22222222-2222-4222-8222-222222222222' }
    const state = deriveLicenseState([...store.events, other])
    expect(state.status).toBe('suspended')
    expect(state.issuer).toBe(OPERATOR_ACTOR)   // the ISSUING actor, recorded at issue
  })

  it.each([
    ['licenseId', { licenseId: 'c0000000-0000-4000-8000-00000000000c' }],
    ['projectId', { projectId: PROJECT_B }],
    ['workflowInstanceId', { workflowInstanceId: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f' }],
    ['boundDefKey', { boundDefKey: 'some.other.definition' }],
    ['boundDefHash', { boundDefHash: '9'.repeat(64) }],
    ['decisionId', { decisionId: '00000000-0000-4000-8000-00000000000d' }],
    ['decisionVersion', { decisionVersion: 99 }],
    ['decisionRecordId', { decisionRecordId: '00000000-0000-4000-8000-00000000000e' }],
  ])('17-24. %s drift makes the lineage malformed and the read L0', async (_field, patch) => {
    const store = new FakeStore()
    expect((await issueLicense(REQUEST, { store })).ok).toBe(true)
    const forged = [
      ...store.events,
      { ...store.events[0], eventId: 'drift', eventSeq: 99, generation: 1, act: 'LICENSE_SUSPENDED' as const, ...patch },
    ]
    // The fold refuses every one of the eight.
    expect(() => deriveLicenseState(forged)).toThrow(MalformedLicenseLineageError)

    // The resolver reads events BY instance, so a forgery that moved the
    // instance id does not belong to this instance's history and is filtered
    // before the fold ever sees it. Every other drift stays inside the event set
    // and must poison the read.
    if (_field !== 'workflowInstanceId') {
      const broken = new FakeStore()
      broken.events = forged
      const resolved = await resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, { store: broken })
      expect(resolved.reason).toBe('malformed_lineage')
      expect(resolved.effective).toBe(false)
      expect(resolved.resolvedLevel).toBe('L0')
    }
  })

  it('§9. no production runtime outside this module calls the RPC or drives the store', () => {
    const APP_ROOT = resolve(__dirname, '..', '..')
    // ── THE ONE EXEMPTION, AND WHY IT IS NOT A LOOPHOLE ──────────────────────
    // The LIVE generated type surface necessarily DECLARES the writer RPC,
    // because the function exists in the production database. A key in the
    // generated `Functions` map is production EVIDENCE — metadata describing
    // what exists — not an invocation, a caller, or authority reach.
    //
    // The scan below is a literal `code.includes`, so it cannot tell a type key
    // from a call site; hence this exemption. It is EXACT-PATH ONLY. It is
    // deliberately not `lib/supabase/**`, not `*.types.ts`, and not "generated
    // files" — none of those can widen by accident or by a future filename.
    //
    // Exempting the file from the NAME scan does not exempt it from the RUNTIME
    // scan: `driving` is still checked for every file, this one included, and
    // the positive assertions after the loop prove the generated file declares
    // without ever calling.
    const GENERATED_TYPES = join(APP_ROOT, 'lib', 'supabase', 'database.types.ts')
    const naming: string[] = []
    const driving: string[] = []
    for (const root of ['lib', 'app', 'components']) {
      for (const file of walk(join(APP_ROOT, root))) {
        if (!/\.(ts|tsx)$/.test(file)) continue
        if (/\.test\.tsx?$/.test(file)) continue
        if (file.includes('/autonomy-license/')) continue
        const code = codeOnly(readFileSync(file, 'utf8'))
        // Repo-wide and unconditional: nothing outside this module may construct
        // the licence store. Checked BEFORE the name-scan exemption so the
        // generated file cannot slip past this half of the invariant.
        if (code.includes('createAutonomyLicenseStore')) driving.push(file)
        if (file === GENERATED_TYPES) continue
        if (code.includes('autonomy_license_append')) naming.push(file)
      }
    }
    expect(naming, `production files naming the RPC:\n${naming.join('\n')}`).toEqual([])
    expect(driving, `production files driving the licence store:\n${driving.join('\n')}`).toEqual([])

    // ── DECLARES, NEVER CALLS ───────────────────────────────────────────────
    const generated = readFileSync(GENERATED_TYPES, 'utf8')
    expect(generated).toContain('autonomy_license_append')
    expect(generated).not.toContain('createAutonomyLicenseStore')
    for (const invocation of [`.rpc('autonomy_license_append'`, `.rpc("autonomy_license_append"`]) {
      expect(generated, `generated types must not invoke the writer: ${invocation}`)
        .not.toContain(invocation)
    }
  })
})

// ── INERTNESS ─────────────────────────────────────────────────────────────────

describe('Phase 2C — inertness', () => {
  const RUNTIME_ROOTS = ['lib/workflows', 'lib/cost', 'lib/media', 'lib/os', 'app/api']

  it('47–51. no executor, dispatcher, provider, spend boundary or gate consumes the licence', () => {
    const offenders: string[] = []
    for (const root of RUNTIME_ROOTS) {
      for (const file of walk(resolve(__dirname, '..', root))) {
        if (!/\.(ts|tsx)$/.test(file)) continue
        if (file.includes('autonomy-license')) continue
        if (readFileSync(file, 'utf8').includes('autonomy-license')) offenders.push(file)
      }
    }
    expect(offenders, `unexpected runtime consumers: ${offenders.join(', ')}`).toEqual([])
  })

  it('52. no other atlas subsystem consumes the licence MACHINERY', () => {
    // Scan the WHOLE atlas tree, which is strictly stronger than checking the
    // subsystems the brief names by hand: the existing guards say Work Package
    // and Delegation must not IMPLEMENT autonomy licensing and that the Survival
    // history and funding modules must not GRANT one, and a future sibling must
    // not quietly become another consumer.
    //
    // ONE cross-module reference is permitted, and only one: the canonical level
    // vocabulary, which Phase 2C's vocabulary ruling moved into this module and
    // which Survival now consumes because Chapter 18 owns the L0–L6 scale. That
    // is shared vocabulary, not licence authority — `issue`, `resolve`, `store`,
    // `derive`, `scope`, `compose` and `types` remain unreachable from outside.
    const ALLOWED_VOCABULARY_REFERENCE = 'atlas/autonomy-license/levels'
    // Phase 3B0 — the reviewed runtime sibling, added DELIBERATELY.
    //
    // `lib/atlas/autonomy-runtime/` is the layer this module was always going to
    // acquire: the pure admission core reads the licence's RESOLVED shape and
    // the composition, and nothing else. A reviewed consumer, not a quiet one.
    //
    // Widened to the directory because the three modules there are one reviewed
    // unit (policy / admission / platform-survival); enumerating them would go
    // stale silently.
    //
    // What this guard protects — that no EXECUTOR, scheduler, drain, spend
    // boundary or provider path consumes autonomy — is NOT relaxed: those roots
    // are `lib/workflows`, `lib/cost`, `lib/media`, `lib/os` and `app/api`, none
    // of which is under `lib/atlas`. The autonomy-runtime suite now asserts that
    // absence directly, so the property is enforced rather than assumed.
    // ── EXACT per-file import authority ─────────────────────────────────────
    //
    // NOT a directory exemption. A directory exemption would defeat the whole
    // property this guard exists for: a future file under `autonomy-runtime/`
    // could import `store`, `issue`, `derive` or `resolve` — everything that
    // CREATES licence authority — and the guard would never see it.
    //
    // So each reviewed sibling names the EXACT module specifiers it may use, and
    // a file under `autonomy-runtime/` that is not listed here inherits NOTHING.
    // Adding a consumer, or widening one, requires an edit to this map.
    const REVIEWED_RUNTIME_IMPORTS: Record<string, readonly string[]> = {
      // The shared canonical level vocabulary, and nothing else.
      'lib/atlas/autonomy-runtime/policy.ts': ['levels'],
      // The minimum PURE surfaces the foundation needs: the composition rule,
      // the resolved shape it reads, and the vocabulary. Note what is absent —
      // no `issue`, no `resolve`, no `store`, no `derive`, no `errors`. The
      // runtime layer must never be able to create, mutate or re-resolve a
      // licence; it only reads what resolution already produced.
      'lib/atlas/autonomy-runtime/admission.ts': ['levels', 'types', 'compose'],
      // NONE. The platform-reader layer has no business touching licence
      // machinery at all.
      'lib/atlas/autonomy-runtime/platform-survival.ts': [],
    }

    /** The `autonomy-license/<name>` specifiers a file actually imports. */
    const licenceSpecifiersIn = (code: string): string[] =>
      [...code.matchAll(/autonomy-license\/([a-z0-9-]+)/g)].map(m => m[1])

    const offenders: string[] = []
    for (const file of walk(resolve(__dirname, '..', 'atlas'))) {
      if (!/\.ts$/.test(file) || file.includes('autonomy-license')) continue
      // codeOnly, not raw text: a comment that NAMES this module is not a
      // consumer of it — the principle `survival-history.test.ts` states for the
      // same reason. Survival's header comment legitimately explains the split.
      const code = codeOnly(readFileSync(file, 'utf8'))

      const key = Object.keys(REVIEWED_RUNTIME_IMPORTS)
        .find(rel => file.endsWith(rel))
      if (key) {
        // A reviewed sibling: every licence module it names must be on ITS list.
        const allowed = REVIEWED_RUNTIME_IMPORTS[key]
        for (const spec of new Set(licenceSpecifiersIn(code))) {
          if (!allowed.includes(spec)) {
            offenders.push(`${file}: '${spec}' is not in its reviewed allowlist [${allowed.join(', ')}]`)
          }
        }
        continue
      }

      // Anything under autonomy-runtime that is NOT listed inherits nothing, and
      // is judged by the ordinary vocabulary rule below — which is to say, a new
      // import of licence machinery fails until it is reviewed into the map.
      const machineryLines = code
        .split('\n')
        .filter(line => line.includes('autonomy-license'))
        .filter(line => !line.includes(ALLOWED_VOCABULARY_REFERENCE))
      if (machineryLines.length > 0) offenders.push(`${file}: ${machineryLines[0].trim()}`)
    }
    expect(offenders, `unexpected atlas consumers:\n${offenders.join('\n')}`).toEqual([])
  })

  it('53/54. no scheduler, cron or automatic suspension/revival exists', () => {
    for (const source of sourceFiles()) {
      const code = codeOnly(readFileSync(source, 'utf8'))
      expect(code, source).not.toMatch(/setInterval|setTimeout|cron|queueMicrotask/)
      expect(code, source).not.toMatch(/suspendExpired|autoSuspend|autoRevive|reapExpired/)
    }
    // Nor a route or server action that could be scheduled or called remotely.
    const files = sourceFiles().map(f => f.split('/').pop())
    expect(files).not.toContain('route.ts')
    expect(files).not.toContain('actions.ts')
  })

  it('54b. the module declares no side-effecting entry point', () => {
    const files = sourceFiles().map(f => f.split('/').pop())
    expect(files).not.toContain('route.ts')
    expect(files).not.toContain('actions.ts')
  })
})

// ── helpers ───────────────────────────────────────────────────────────────────

function sourceFiles(): string[] {
  return readdirSync(MODULE_DIR)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map(f => join(MODULE_DIR, f))
}

const MIGRATION = resolve(__dirname, '../../supabase/migrations/20260924180000_autonomy_license_phase2c.sql')

function migrationSql(): string {
  return readFileSync(MIGRATION, 'utf8')
}

/** The act list inside the CHECK constraint — the vocabulary, not the prose. */
function actVocabularyInMigration(): string[] {
  const sql = migrationSql()
  const at = sql.indexOf('constraint atlas_autonomy_license_events_act_valid')
  const body = sql.slice(at, sql.indexOf('),', at))
  return [...body.matchAll(/'([A-Z_]+)'/g)].map(m => m[1])
}

function walk(dir: string): string[] {
  let out: string[] = []
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return out }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out = out.concat(walk(full))
    else out.push(full)
  }
  return out
}

/** Comment-stripped source: a comment that NAMES a concept is not a consumer. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
}

// ── FINAL REMOTE REVIEW — the four authority blockers ─────────────────────────
//
// Each block below is the permanent proof for one blocker found in the final
// remote review. They are grouped by the property, not by the file that changed.

describe('Phase 2C — authority is established BEFORE anything is read', () => {
  const DENIALS = [
    { reason: 'unauthenticated',        operator: { ok: false, reason: 'unauthenticated' } },
    { reason: 'not_platform_operator',  operator: { ok: false, reason: 'not_platform_operator' } },
    { reason: 'no_operator_configured', operator: { ok: false, reason: 'no_operator_configured' } },
  ] as const

  type Run = (id: string, o: Wire) => Promise<{ ok: boolean; reason?: string }>

  const ACTS: readonly { name: string; run: Run }[] = [
    { name: 'restrict', run: (id, o) => restrictLicense({
        licenseId: id, licensedLevel: 'L2', allowedActionKinds: REQUEST.allowedActionKinds,
        effectiveAt: EFFECTIVE, expiresAt: EXPIRES }, o) },
    { name: 'suspend', run: (id, o) => suspendLicense({ licenseId: id }, o) },
    { name: 'revoke', run: (id, o) => revokeLicense({ licenseId: id }, o) },
    { name: 'supersede', run: (id, o) => supersedeLicense({
        licenseId: id, supersededByLicenseId: '11111111-2222-4333-8444-555555555555' }, o) },
  ]

  for (const denial of DENIALS) {
    for (const act of ACTS) {
      it(`${act.name} by ${denial.reason}: auth refusal and ZERO licence reads`, async () => {
        const store = new FakeStore()
        const issued = await issueLicense(REQUEST, { store })
        expect(issued.ok).toBe(true)
        if (!issued.ok) return

        store.lineageCalls = 0
        const result = await act.run(issued.event.licenseId, { store, operator: denial.operator })

        expect(result).toMatchObject({ ok: false, reason: denial.reason })
        // The load-bearing assertion: an unauthorized caller caused no
        // service-role read of the SERVER_ONLY ledger.
        expect(store.lineageCalls).toBe(0)
        expect(store.events).toHaveLength(1)
      })
    }
  }

  for (const denial of DENIALS) {
    it(`an unknown licence id is not an existence oracle for ${denial.reason}`, async () => {
      const store = new FakeStore()
      const result = await suspendLicense(
        { licenseId: '00000000-0000-4000-8000-000000000000' },
        { store, operator: denial.operator },
      )
      // Not `license_not_found`: a caller that has proved nothing learns nothing
      // about whether the id exists.
      expect(result).toMatchObject({ ok: false, reason: denial.reason })
      expect(store.lineageCalls).toBe(0)
    })
  }

  it('a supersession does not resolve its replacement before authority succeeds', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store })
    expect(issued.ok).toBe(true)
    if (!issued.ok) return

    store.lineageCalls = 0
    const result = await supersedeLicense(
      { licenseId: issued.event.licenseId, supersededByLicenseId: '11111111-2222-4333-8444-555555555555' },
      { store, operator: { ok: false, reason: 'not_platform_operator' } },
    )
    expect(result).toMatchObject({ ok: false, reason: 'not_platform_operator' })
    // Neither the source NOR the candidate replacement was read.
    expect(store.lineageCalls).toBe(0)
  })
})

describe('Phase 2C — the write contract carries the observed generation', () => {
  it('5. issue sends expectedGeneration 0', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store })
    expect(issued.ok).toBe(true)
    expect(store.appendedArgs).toHaveLength(1)
    expect(store.appendedArgs[0].expectedGeneration).toBe(0)
  })

  it('6. a continuing act sends the generation derived from the chain it read', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store })
    expect(issued.ok).toBe(true)
    if (!issued.ok) return

    const restricted = await restrictLicense(
      { licenseId: issued.event.licenseId, licensedLevel: 'L2', allowedActionKinds: REQUEST.allowedActionKinds,
        effectiveAt: EFFECTIVE, expiresAt: EXPIRES },
      { store },
    )
    expect(restricted.ok).toBe(true)
    // The chain had one event, so the next generation is 1 — and that is what
    // the caller tells the database it observed.
    expect(store.appendedArgs[1].expectedGeneration).toBe(1)

    const revoked = await revokeLicense({ licenseId: issued.event.licenseId }, { store })
    expect(revoked.ok).toBe(true)
    expect(store.appendedArgs[2].expectedGeneration).toBe(2)
  })

  it('7/10. a stale generation is reported as a CONFLICT, never as malformed data', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store })
    expect(issued.ok).toBe(true)
    if (!issued.ok) return

    // The exact signal the RPC raises when another act landed first.
    store.appendRefusal = { code: LICENSE_SQLSTATE.SERIALIZATION_FAILURE, message: 'stale licence generation' }
    const result = await revokeLicense({ licenseId: issued.event.licenseId }, { store })

    expect(result).toMatchObject({ ok: false, reason: 'license_conflict' })
    expect(result).not.toMatchObject({ reason: 'license_malformed' })
    // Nothing was written: the refusal happened before the insert.
    expect(store.events).toHaveLength(1)
  })

  it('any other SQLSTATE still reports as malformed, not as a conflict', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store })
    expect(issued.ok).toBe(true)
    if (!issued.ok) return

    store.appendRefusal = { code: '22023', message: 'unsupported act' }
    const result = await revokeLicense({ licenseId: issued.event.licenseId }, { store })
    expect(result).toMatchObject({ ok: false, reason: 'license_malformed' })
  })

  it('9. a returned row always matches the generation the caller predicted', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store })
    expect(issued.ok).toBe(true)
    if (!issued.ok) return
    const revoked = await revokeLicense({ licenseId: issued.event.licenseId }, { store })
    expect(revoked.ok).toBe(true)
    if (!revoked.ok) return
    // The RPC refuses stale writes before inserting, so a committed row whose
    // generation disagreed with the observation is unreachable by construction.
    expect(revoked.event.generation).toBe(store.appendedArgs[1].expectedGeneration)
  })
})

describe('Phase 2C — a drifted grant may not be rebound by restriction', () => {
  /** A licence whose recorded fingerprint no longer matches today's registry. */
  async function drifted(store: FakeStore) {
    const issued = await issueLicense(REQUEST, { store })
    if (!issued.ok) throw new Error('seed failed: ' + issued.reason)
    store.events[0] = {
      ...issued.event,
      actionScopeFingerprint: fingerprintFor(['some_kind_that_changed'], DEF_KEY),
    }
    return issued.event
  }

  it('11. restriction is refused and writes nothing', async () => {
    const store = new FakeStore()
    const licence = await drifted(store)

    const result = await restrictLicense(
      { licenseId: licence.licenseId, licensedLevel: 'L2', allowedActionKinds: REQUEST.allowedActionKinds,
        effectiveAt: EFFECTIVE, expiresAt: EXPIRES },
      { store },
    )
    expect(result).toMatchObject({ ok: false, reason: 'license_scope_drifted' })
    expect(store.events).toHaveLength(1)
  })

  it('the resolver agrees the same licence is drifted, so the two cannot disagree', async () => {
    const store = new FakeStore()
    const licence = await drifted(store)
    // `IN` the window: drift is the ONLY reason this can fail to be effective.
    const resolved = await resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, { store })
    expect(resolved.effective).toBe(false)
    expect(resolved.reason).toBe('scope_drifted')
    expect(resolved.resolvedLevel).toBe(INEFFECTIVE_LEVEL)
    void licence
  })

  it('12. a drifted licence can still be revoked, suspended and superseded', async () => {
    for (const act of ['revoke', 'suspend'] as const) {
      const store = new FakeStore()
      const licence = await drifted(store)
      const result = act === 'revoke'
        ? await revokeLicense({ licenseId: licence.licenseId }, { store })
        : await suspendLicense({ licenseId: licence.licenseId }, { store })
      expect(result.ok, `${act} must remain available on a drifted licence`).toBe(true)
    }
  })

  it('13. a normal, non-drifted restriction is still valid', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store })
    expect(issued.ok).toBe(true)
    if (!issued.ok) return

    const result = await restrictLicense(
      { licenseId: issued.event.licenseId, licensedLevel: 'L2', allowedActionKinds: ['generate_monthly_story'],
        effectiveAt: EFFECTIVE, expiresAt: EXPIRES },
      { store },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.event.act).toBe('LICENSE_RESTRICTED')
      expect(result.event.licensedLevel).toBe('L2')
    }
  })
})

describe('Phase 2C — the canonical resolver runs on the server clock', () => {
  /**
   * Resolve with the SERVER clock at `systemTime`, while smuggling `smuggled`
   * as a hypothetical second argument.
   *
   * The smuggled value must be ignored — it is precisely what a future caller
   * would pass in order to move the question in time, and the whole point is
   * that there is no longer any argument through which to do it.
   */
  async function resolveWithSmuggledClock(store: FakeStore, systemTime: string, smuggled: string) {
    wire({ store })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(systemTime))
    try {
      const smuggledCall = resolveAutonomyLicense as unknown as
        (id: string, second?: string) => Promise<{ effective: boolean; reason: string; resolvedLevel: string }>
      return await smuggledCall(REQUEST.workflowInstanceId, smuggled)
    } finally {
      vi.useRealTimers()
    }
  }

  it('15. an expired licence cannot be revived by a caller-supplied clock', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store })   // window EFFECTIVE..EXPIRES
    expect(issued.ok).toBe(true)

    // Server time is AFTER_EXPIRY, so the licence has lapsed. The smuggled
    // instant sits INSIDE the closed window — honoured, it would read as
    // effective. It must have no effect at all.
    const resolved = await resolveWithSmuggledClock(store, AFTER_EXPIRY, IN_WINDOW)
    expect(resolved.effective).toBe(false)
    expect(resolved.reason).toBe('expired')
    expect(resolved.resolvedLevel).toBe(INEFFECTIVE_LEVEL)
  })

  it('16. a future licence cannot be activated early by a caller-supplied clock', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(
      { ...REQUEST, effectiveAt: '2026-10-01T00:00:00.000Z', expiresAt: '2026-11-01T00:00:00.000Z' },
      { store },
    )
    expect(issued.ok).toBe(true)

    // Server time is IN_WINDOW — before this licence starts. The smuggled
    // instant is after it starts; it must not activate anything.
    const resolved = await resolveWithSmuggledClock(store, IN_WINDOW, '2026-10-05T00:00:00.000Z')
    expect(resolved.effective).toBe(false)
    expect(resolved.reason).toBe('not_yet_effective')
    expect(resolved.resolvedLevel).toBe(INEFFECTIVE_LEVEL)
  })

  it('17. fake system time drives the resolved answer deterministically', async () => {
    const store = new FakeStore()
    const issued = await issueLicense(REQUEST, { store })
    expect(issued.ok).toBe(true)

    const inside = await resolveLicense(REQUEST.workflowInstanceId, IN_WINDOW, { store })
    expect(inside.effective).toBe(true)

    const before = await resolveLicense(REQUEST.workflowInstanceId, T1, { store })
    expect(before.effective).toBe(false)
    expect(before.reason).toBe('not_yet_effective')

    const after = await resolveLicense(REQUEST.workflowInstanceId, AFTER_EXPIRY, { store })
    expect(after.effective).toBe(false)
    expect(after.reason).toBe('expired')

    // The clock is restored: real time is not left faked for other suites.
    expect(vi.isFakeTimers()).toBe(false)
  })
})
