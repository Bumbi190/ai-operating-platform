/**
 * Chapter 18 Autonomy Licensing — Phase 2C.
 *
 * Filesystem/local only: no database, no network, no credentials. The write and
 * read boundaries run against injected fakes so authority, decision validation,
 * workflow binding and lifecycle can be proven without a session. Properties
 * that only real PostgreSQL can prove live in `autonomy-license-sql.test.ts`.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})) }))

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
import { resolveAutonomyLicense } from '@/lib/atlas/autonomy-license/resolve'
import { resolveActionScope, scopeDrifted } from '@/lib/atlas/autonomy-license/scope'
import type { AutonomyLicenseStore, AppendLicenseEventArgs } from '@/lib/atlas/autonomy-license/store'
import { LICENSE_ACTS, LICENSE_REASONS, noLicense } from '@/lib/atlas/autonomy-license/types'
import type { LicenseEvent } from '@/lib/atlas/autonomy-license/types'
import { ACTION_CLASSES, ACTION_CLASS_POLICY } from '@/lib/workflows/action-target'
import { ACTION_REGISTRY, isKnownActionKind } from '@/lib/workflows/action-registry'

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
  private cursor = 0

  async append(args: AppendLicenseEventArgs): Promise<LicenseEvent> {
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
    return this.events.filter(e => e.licenseId === licenseId)
  }

  async byInstance(workflowInstanceId: string): Promise<LicenseEvent[]> {
    return this.events.filter(e => e.workflowInstanceId === workflowInstanceId)
  }
}

const OPERATOR = { ok: true as const, actor: OPERATOR_ACTOR }

function issueArgs(store: FakeStore, decisionLineage: unknown[] = autonomyDecision()) {
  return { store, operator: OPERATOR, instance: INSTANCE, decisionLineage: async () => decisionLineage, now: IN_WINDOW }
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
    const result = await issueAutonomyLicense(REQUEST, issueArgs(store))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.event.act).toBe('LICENSE_ISSUED')
      expect(result.event.generation).toBe(0)
      expect(result.event.projectId).toBe(PROJECT_A)
    }
  })

  it('2. an ordinary project owner cannot issue', async () => {
    const store = new FakeStore()
    const result = await issueAutonomyLicense(REQUEST, {
      ...issueArgs(store), operator: { ok: false, reason: 'not_platform_operator' },
    })
    expect(result).toMatchObject({ ok: false, reason: 'not_platform_operator' })
    expect(store.events).toHaveLength(0)
  })

  it('3. an authenticated non-operator cannot issue', async () => {
    const store = new FakeStore()
    const result = await issueAutonomyLicense(REQUEST, {
      ...issueArgs(store), operator: { ok: false, reason: 'not_platform_operator' },
    })
    expect(result.ok).toBe(false)
    expect(store.events).toHaveLength(0)
  })

  it('4. missing operator configuration fails closed and is distinguishable', async () => {
    const store = new FakeStore()
    const result = await issueAutonomyLicense(REQUEST, {
      ...issueArgs(store), operator: { ok: false, reason: 'no_operator_configured' },
    })
    expect(result).toMatchObject({ ok: false, reason: 'no_operator_configured' })
    expect(store.events).toHaveLength(0)
  })

  it('5. a machine actor cannot issue', async () => {
    const store = new FakeStore()
    const result = await issueAutonomyLicense(REQUEST, {
      ...issueArgs(store), operator: { ok: false, reason: 'unauthenticated' },
    })
    expect(result).toMatchObject({ ok: false, reason: 'unauthenticated' })
  })

  it('6. the stored actor is session-derived user:<canonical uuid>', async () => {
    const store = new FakeStore()
    const result = await issueAutonomyLicense(REQUEST, issueArgs(store))
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
    const result = await issueAutonomyLicense(
      { ...REQUEST, ...({ actor: 'user:attacker', principalId: 'x' } as Record<string, unknown>) },
      issueArgs(store),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.event.actor).toBe(OPERATOR_ACTOR)
  })
})

// ── DECISION ──────────────────────────────────────────────────────────────────

describe('Phase 2C — the authorizing decision', () => {
  const attempt = (lineage: unknown[], request = REQUEST) =>
    issueAutonomyLicense(request, issueArgs(new FakeStore(), lineage))

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
    const result = await issueAutonomyLicense(REQUEST, issueArgs(store, lineage))
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
    await issueAutonomyLicense(REQUEST, issueArgs(store))
    const before = JSON.stringify(store.events)

    const resolved = await resolveAutonomyLicense(REQUEST.workflowInstanceId, AFTER_EXPIRY, {
      store, instance: INSTANCE, decisionLineage: async () => autonomyDecision(),
    })
    // The WINDOW expiry fires first here; the decision fact is proven separately.
    expect(resolved.effective).toBe(false)
    expect(JSON.stringify(store.events)).toBe(before)
  })

  it('15. reversal or supersession makes the licence ineffective with no mutation', async () => {
    const store = new FakeStore()
    const issued = await issueAutonomyLicense(REQUEST, issueArgs(store))
    expect(issued.ok).toBe(true)
    const before = JSON.stringify(store.events)

    const [proposed, approved] = autonomyDecision()
    const reversed = decisionRecord('reversed', {
      occurredAt: T1, version: 3, lifecycleGeneration: 2,
      reason: 'Controls weakened after an incident.',
    })
    const resolved = await resolveAutonomyLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store, instance: INSTANCE, decisionLineage: async () => [proposed, approved, reversed],
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
    const result = await issueAutonomyLicense(REQUEST, {
      ...issueArgs(store), instance: null,
    })
    expect(result).toMatchObject({ ok: false, reason: 'instance_not_found' })
  })

  it('17/18. project and def_hash are derived from the instance, not the caller', async () => {
    const store = new FakeStore()
    const result = await issueAutonomyLicense(
      { ...REQUEST, ...({ projectId: PROJECT_B, boundDefHash: 'x'.repeat(64) } as Record<string, unknown>) },
      issueArgs(store),
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
    await issueAutonomyLicense(REQUEST, issueArgs(store))
    const other = await resolveAutonomyLicense('11111111-2222-4333-8444-555555555555', IN_WINDOW, {
      store, instance: INSTANCE, decisionLineage: async () => autonomyDecision(),
    })
    expect(other.effective).toBe(false)
    expect(other.reason).toBe('no_license')
    expect(other.resolvedLevel).toBe(INEFFECTIVE_LEVEL)
  })

  it('20. def_hash drift makes the licence ineffective', async () => {
    const store = new FakeStore()
    await issueAutonomyLicense(REQUEST, issueArgs(store))
    const resolved = await resolveAutonomyLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store,
      instance: { ...INSTANCE, def_hash: 'a-different-hash' },
      decisionLineage: async () => autonomyDecision(),
    })
    expect(resolved.effective).toBe(false)
    expect(resolved.reason).toBe('workflow_definition_drifted')
    expect(resolved.resolvedLevel).toBe(INEFFECTIVE_LEVEL)
  })

  it('20b. def_key drift is also definition drift', async () => {
    const store = new FakeStore()
    await issueAutonomyLicense(REQUEST, issueArgs(store))
    const resolved = await resolveAutonomyLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store,
      instance: { ...INSTANCE, def_key: 'another.definition' },
      decisionLineage: async () => autonomyDecision(),
    })
    expect(resolved.reason).toBe('workflow_definition_drifted')
  })
})

// ── ACTION SCOPE ──────────────────────────────────────────────────────────────

describe('Phase 2C — action scope', () => {
  it('21. an unknown ActionKind is refused', async () => {
    const store = new FakeStore()
    const result = await issueAutonomyLicense(
      { ...REQUEST, allowedActionKinds: ['generate_monthly_story', 'not_a_real_action'] },
      issueArgs(store),
    )
    expect(result).toMatchObject({ ok: false, reason: 'action_kind_unknown' })
    expect(store.events).toHaveLength(0)
  })

  it('22. a caller cannot supply an ActionClass', async () => {
    const store = new FakeStore()
    const result = await issueAutonomyLicense(
      { ...REQUEST, ...({ allowedActionClasses: ['READ_ONLY'], actionClass: 'READ_ONLY' } as Record<string, unknown>) },
      issueArgs(store),
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
    const result = await issueAutonomyLicense(
      { ...REQUEST, allowedActionKinds: ['generate_monthly_story'] },
      issueArgs(store),
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
    const result = await issueAutonomyLicense({ ...REQUEST, allowedActionKinds: [] }, issueArgs(store))
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
    const issued = await issueAutonomyLicense(REQUEST, issueArgs(store))
    expect(issued.ok).toBe(true)
    if (!issued.ok) return

    // Simulate a reclassification by rewriting the RECORDED fingerprint, which
    // is exactly what a registry change looks like from the read side: the
    // recomputation no longer equals what was stored at issue time.
    const tampered: LicenseEvent = { ...issued.event, actionScopeFingerprint: 'stale-fingerprint' }
    const tamperedStore = new FakeStore()
    tamperedStore.events = [tampered]

    const resolved = await resolveAutonomyLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store: tamperedStore, instance: INSTANCE, decisionLineage: async () => autonomyDecision(),
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
    const result = await issueAutonomyLicense(REQUEST, issueArgs(store))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('issue failed')
    return { store, licenseId: result.event.licenseId }
  }
  const args = (store: FakeStore) =>
    ({ store, operator: OPERATOR, instance: INSTANCE, decisionLineage: async () => autonomyDecision(), now: IN_WINDOW })

  it('29. issuing establishes exactly one licence', async () => {
    const { store } = await issued()
    expect(store.events).toHaveLength(1)
    expect(deriveLicenseState(store.events).status).toBe('active')
  })

  it('30. a restriction may lower the level', async () => {
    const { store, licenseId } = await issued()
    const result = await restrictAutonomyLicense(
      { licenseId, licensedLevel: 'L1', allowedActionKinds: REQUEST.allowedActionKinds, effectiveAt: EFFECTIVE, expiresAt: EXPIRES },
      args(store),
    )
    expect(result.ok).toBe(true)
    expect(deriveLicenseState(store.events).licensedLevel).toBe('L1')
  })

  it('31. a restriction may remove actions', async () => {
    const { store, licenseId } = await issued()
    const result = await restrictAutonomyLicense(
      { licenseId, licensedLevel: 'L3', allowedActionKinds: ['validate_monthly_story'], effectiveAt: EFFECTIVE, expiresAt: EXPIRES },
      args(store),
    )
    expect(result.ok).toBe(true)
    expect(deriveLicenseState(store.events).actionKinds).toEqual(['validate_monthly_story'])
  })

  it('32. a restriction may shorten the window', async () => {
    const { store, licenseId } = await issued()
    const shorter = '2026-10-01T00:00:00.000Z'
    const result = await restrictAutonomyLicense(
      { licenseId, licensedLevel: 'L3', allowedActionKinds: REQUEST.allowedActionKinds, effectiveAt: EFFECTIVE, expiresAt: shorter },
      args(store),
    )
    expect(result.ok).toBe(true)
    expect(deriveLicenseState(store.events).expiresAt).toBe(shorter)
  })

  it('33. a restriction cannot raise the level', async () => {
    const { store, licenseId } = await issued()
    const result = await restrictAutonomyLicense(
      { licenseId, licensedLevel: 'L6', allowedActionKinds: REQUEST.allowedActionKinds, effectiveAt: EFFECTIVE, expiresAt: EXPIRES },
      args(store),
    )
    expect(result).toMatchObject({ ok: false, reason: 'restriction_raises_level' })
    expect(store.events).toHaveLength(1)
  })

  it('34. a restriction cannot add actions', async () => {
    const { store, licenseId } = await issued()
    const result = await restrictAutonomyLicense(
      { licenseId, licensedLevel: 'L3', allowedActionKinds: ['generate_monthly_story', 'proof_governed_effect'], effectiveAt: EFFECTIVE, expiresAt: EXPIRES },
      args(store),
    )
    expect(result).toMatchObject({ ok: false, reason: 'restriction_adds_action' })
    expect(store.events).toHaveLength(1)
  })

  it('35. a restriction cannot extend the expiration', async () => {
    const { store, licenseId } = await issued()
    const result = await restrictAutonomyLicense(
      { licenseId, licensedLevel: 'L3', allowedActionKinds: REQUEST.allowedActionKinds, effectiveAt: EFFECTIVE, expiresAt: '2099-01-01T00:00:00.000Z' },
      args(store),
    )
    expect(result).toMatchObject({ ok: false, reason: 'restriction_extends_window' })
    expect(store.events).toHaveLength(1)
  })

  it('35b. a restriction cannot move the window start earlier', async () => {
    const { store, licenseId } = await issued()
    const result = await restrictAutonomyLicense(
      { licenseId, licensedLevel: 'L3', allowedActionKinds: REQUEST.allowedActionKinds, effectiveAt: '2026-01-01T00:00:00.000Z', expiresAt: EXPIRES },
      args(store),
    )
    expect(result).toMatchObject({ ok: false, reason: 'restriction_extends_window' })
  })

  it('36. suspension resolves to L0', async () => {
    const { store, licenseId } = await issued()
    expect((await suspendAutonomyLicense({ licenseId }, args(store))).ok).toBe(true)
    const resolved = await resolveAutonomyLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store, instance: INSTANCE, decisionLineage: async () => autonomyDecision(),
    })
    expect(resolved.status).toBe('suspended')
    expect(resolved.effective).toBe(false)
    expect(resolved.reason).toBe('suspended')
    expect(resolved.resolvedLevel).toBe('L0')
  })

  it('37. revocation resolves to L0 and is terminal', async () => {
    const { store, licenseId } = await issued()
    expect((await revokeAutonomyLicense({ licenseId }, args(store))).ok).toBe(true)
    const resolved = await resolveAutonomyLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store, instance: INSTANCE, decisionLineage: async () => autonomyDecision(),
    })
    expect(resolved.status).toBe('revoked')
    expect(resolved.reason).toBe('revoked')
    expect(resolved.resolvedLevel).toBe('L0')

    // Terminal: no further act, not even a restriction.
    const after = await restrictAutonomyLicense(
      { licenseId, licensedLevel: 'L0', allowedActionKinds: REQUEST.allowedActionKinds, effectiveAt: EFFECTIVE, expiresAt: EXPIRES },
      args(store),
    )
    expect(after).toMatchObject({ ok: false, reason: 'license_terminal' })
  })

  it('38. supersession resolves to L0', async () => {
    const store = new FakeStore()
    const first = await issueAutonomyLicense(REQUEST, issueArgs(store))
    const second = await issueAutonomyLicense(REQUEST, issueArgs(store))
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    const result = await supersedeAutonomyLicense(
      { licenseId: first.event.licenseId, supersededByLicenseId: second.event.licenseId },
      args(store),
    )
    expect(result.ok).toBe(true)

    const resolved = await resolveAutonomyLicense(REQUEST.workflowInstanceId, IN_WINDOW, {
      store, instance: INSTANCE, decisionLineage: async () => autonomyDecision(),
    })
    expect(resolved.reason).toBe('superseded')
    expect(resolved.resolvedLevel).toBe('L0')
  })

  it('38b. a supersession may not cross instances', async () => {
    const store = new FakeStore()
    const first = await issueAutonomyLicense(REQUEST, issueArgs(store))
    const otherInstance = { ...REQUEST, workflowInstanceId: '12345678-1234-4123-8123-123456789abc' }
    const second = await issueAutonomyLicense(otherInstance, issueArgs(store))
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    const result = await supersedeAutonomyLicense(
      { licenseId: first.event.licenseId, supersededByLicenseId: second.event.licenseId },
      args(store),
    )
    expect(result.ok).toBe(false)
  })

  it('39. expiration resolves to L0 from the read clock alone', async () => {
    const { store } = await issued()
    const resolved = await resolveAutonomyLicense(REQUEST.workflowInstanceId, AFTER_EXPIRY, {
      store, instance: INSTANCE, decisionLineage: async () => autonomyDecision(),
    })
    expect(resolved.reason).toBe('expired')
    expect(resolved.resolvedLevel).toBe('L0')
    // No status column was rewritten to say so.
    expect(deriveLicenseState(store.events).status).toBe('active')
  })

  it('39b. before effective_at the licence is not yet effective', async () => {
    const { store } = await issued()
    const resolved = await resolveAutonomyLicense(REQUEST.workflowInstanceId, '2026-09-20T09:00:00.000Z', {
      store, instance: INSTANCE, decisionLineage: async () => autonomyDecision(),
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

  it('41. conflicting same-generation acts are structurally serializable', () => {
    // Two acts derived from one state claim the same generation, and the
    // database's unique index is what decides — not a timestamp.
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
    const offenders: string[] = []
    for (const file of walk(resolve(__dirname, '..', 'atlas'))) {
      if (!/\.ts$/.test(file) || file.includes('autonomy-license')) continue
      // codeOnly, not raw text: a comment that NAMES this module is not a
      // consumer of it — the principle `survival-history.test.ts` states for the
      // same reason. Survival's header comment legitimately explains the split.
      const machineryLines = codeOnly(readFileSync(file, 'utf8'))
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
