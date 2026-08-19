/**
 * Explicit Human Authorization V1 — EI-S1.3A.
 *
 * Filesystem/local only: no database, no network, no credentials. The write and
 * read boundaries are exercised through injected fakes; the properties that can
 * only be proven at the source level (server-only, no execution imports, the
 * principal never being a parameter) are asserted by reading the modules.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildAuthorizationEvent,
  canonicalTargetVersionHash,
  newAuthorizationId,
} from '@/lib/atlas/authorization/build'
import {
  deriveAuthorizationState,
  isAuthorizationRequired,
  isEffectiveNow,
  orderAuthorizationEvents,
} from '@/lib/atlas/authorization/derive'
import { MalformedAuthorizationChainError } from '@/lib/atlas/authorization/types'
import type {
  AuthorizationCondition,
  AuthorizationEvent,
  AuthorizationEventType,
  AuthorizationTarget,
} from '@/lib/atlas/authorization/types'

const REPO_ROOT = resolve(__dirname, '../../../..')
const AUTH_DIR = 'apps/web/lib/atlas/authorization'

const PRINCIPAL = '11111111-1111-4111-8111-111111111111'
const OTHER_PRINCIPAL = '22222222-2222-4222-8222-222222222222'
const PROJECT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PROJECT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const PAYLOAD_V1 = { headline: 'Launch note', body: 'Reviewed copy.' }
const PAYLOAD_V2 = { headline: 'Launch note', body: 'Materially changed copy.' }

const TARGET_V1: AuthorizationTarget = {
  targetType: 'article', targetId: 'art-1', versionHash: canonicalTargetVersionHash(PAYLOAD_V1),
}
const TARGET_V2: AuthorizationTarget = {
  targetType: 'article', targetId: 'art-1', versionHash: canonicalTargetVersionHash(PAYLOAD_V2),
}

const AUTHORITY = { actionKind: 'publish_article', description: 'Publish the reviewed article once.' }
const T0 = '2026-08-19T08:00:00.000Z'
const T1 = '2026-08-19T09:00:00.000Z'
const T2 = '2026-08-19T10:00:00.000Z'
const EXPIRES = '2026-08-20T08:00:00.000Z'
const AFTER_EXPIRY = '2026-08-21T08:00:00.000Z'

const CONDITION: AuthorizationCondition = {
  conditionId: 'c1', type: 'channel_limit', value: 'newsletter', description: 'Newsletter channel only.',
}

let seq = 0
function event(type: AuthorizationEventType, overrides: Record<string, unknown> = {}): AuthorizationEvent {
  return buildAuthorizationEvent({
    type,
    authorizationId: 'auth-1',
    projectId: PROJECT_A,
    principalId: PRINCIPAL,
    target: TARGET_V1,
    authority: AUTHORITY,
    occurredAt: T0,
    eventId: `e${++seq}`,
    ...overrides,
  } as never)
}

const requested = (o: Record<string, unknown> = {}) => event('requested', { occurredAt: T0, ...o })
const granted = (o: Record<string, unknown> = {}) => event('granted', { occurredAt: T1, expiresAt: EXPIRES, ...o })
const grantedCond = (o: Record<string, unknown> = {}) =>
  event('granted_with_conditions', { occurredAt: T1, expiresAt: EXPIRES, conditions: [CONDITION], ...o })

// ── 1–3. Construction and validation ──────────────────────────────────────────

describe('Authorization V1 — request and validation', () => {
  it('builds a valid pending request', () => {
    const state = deriveAuthorizationState([requested()], { at: T1 })
    expect(state.status).toBe('pending')
    expect(state.projectId).toBe(PROJECT_A)
    expect(state.principalId).toBe(PRINCIPAL)
    expect(state.authorityBasis).toBe('founder_owner')
    expect(state.effectiveAt).toBeNull()
  })

  it('requires an explicit project scope — V1 has no cross-project authority', () => {
    expect(() => event('requested', { projectId: '' })).toThrow(/project-scope-required/)
  })

  it('requires a human principal', () => {
    expect(() => event('requested', { principalId: '' })).toThrow(/human-principal-required/)
  })

  it('requires a complete, well-formed target and version pin', () => {
    expect(() => event('requested', { target: { targetType: '', targetId: 'x', versionHash: TARGET_V1.versionHash } }))
      .toThrow(/target-type-required/)
    expect(() => event('requested', { target: { targetType: 'article', targetId: '', versionHash: TARGET_V1.versionHash } }))
      .toThrow(/target-id-required/)
    expect(() => event('requested', { target: { ...TARGET_V1, versionHash: 'not-a-hash' } }))
      .toThrow(/target-version-hash-format/)
  })

  it('requires an explicit requested authority', () => {
    expect(() => event('requested', { authority: { actionKind: '', description: 'x' } }))
      .toThrow(/authority-action-required/)
  })

  it('rejects a caller-supplied version hash that does not match the payload', () => {
    expect(() => event('requested', { target: TARGET_V1, targetPayload: PAYLOAD_V2 }))
      .toThrow(/target-version-matches-payload/)
    expect(() => event('requested', { target: TARGET_V1, targetPayload: PAYLOAD_V1 })).not.toThrow()
  })

  it('hashes payloads deterministically and independently of key order', () => {
    expect(canonicalTargetVersionHash({ a: 1, b: 2 })).toBe(canonicalTargetVersionHash({ b: 2, a: 1 }))
    expect(canonicalTargetVersionHash(PAYLOAD_V1)).not.toBe(canonicalTargetVersionHash(PAYLOAD_V2))
  })
})

// ── 4–8. Grant, deny, revoke, supersede ───────────────────────────────────────

describe('Authorization V1 — lifecycle acts', () => {
  it('grants unconditionally and becomes effective', () => {
    const result = isEffectiveNow([requested(), granted()], { at: T2 })
    expect(result.effective).toBe(true)
    expect(result.reason).toBe('effective')
    expect(result.state?.status).toBe('granted')
    expect(result.state?.effectiveAt).toBe(T1)
  })

  it('records a denial that is never effective', () => {
    const result = isEffectiveNow([requested(), event('denied', { occurredAt: T1, reason: 'Not now.' })], { at: T2 })
    expect(result.effective).toBe(false)
    expect(result.reason).toBe('denied')
    expect(result.state?.status).toBe('denied')
  })

  it('revokes through a NEW event, and a revoked authorization is never effective', () => {
    const chain = [requested(), granted(), event('revoked', { occurredAt: T2, reason: 'Scope changed.' })]
    const result = isEffectiveNow(chain, { at: T2 })
    expect(result.reason).toBe('revoked')
    expect(result.effective).toBe(false)
    expect(result.state?.revokedAt).toBe(T2)
    // The grant remains in history — revocation adds, never rewrites.
    expect(chain.filter(e => e.type === 'granted')).toHaveLength(1)
    expect(result.state?.eventCount).toBe(3)
  })

  it('supersedes through a NEW event naming the successor', () => {
    const successor = newAuthorizationId()
    const result = isEffectiveNow(
      [requested(), granted(), event('superseded', { occurredAt: T2, supersededBy: successor })],
      { at: T2 },
    )
    expect(result.reason).toBe('superseded')
    expect(result.state?.supersededBy).toBe(successor)
    expect(() => event('superseded', { occurredAt: T2 })).toThrow(/supersede-requires-successor/)
  })

  it('keeps the full history intact and ordered deterministically', () => {
    const chain = [event('revoked', { occurredAt: T2 }), requested(), granted()]
    const ordered = orderAuthorizationEvents(chain)
    expect(ordered.map(e => e.type)).toEqual(['requested', 'granted', 'revoked'])
    expect(orderAuthorizationEvents([...chain].reverse()).map(e => e.eventId)).toEqual(ordered.map(e => e.eventId))
  })
})

// ── 9. Determinism ────────────────────────────────────────────────────────────

describe('Authorization V1 — deterministic derivation', () => {
  it('yields identical output for identical events and time', () => {
    const chain = [requested(), granted()]
    expect(JSON.stringify(deriveAuthorizationState(chain, { at: T2 })))
      .toBe(JSON.stringify(deriveAuthorizationState([...chain].reverse(), { at: T2 })))
  })

  it('treats a retried identical append as idempotent, not as a contradiction', () => {
    const grant = granted()
    const state = deriveAuthorizationState([requested(), grant, { ...grant }], { at: T2 })
    expect(state.eventCount).toBe(2)
    expect(state.status).toBe('granted')
  })

  it('rejects two different events reusing one event id', () => {
    const grant = granted()
    expect(() => orderAuthorizationEvents([requested(), grant, { ...grant, reason: 'tampered' }]))
      .toThrow(MalformedAuthorizationChainError)
  })
})

// ── 10–11. Human principal provenance ─────────────────────────────────────────

describe('Authorization V1 — human authority provenance', () => {
  it('records the deciding principal, which may differ from the requester', () => {
    const state = deriveAuthorizationState(
      [requested({ principalId: OTHER_PRINCIPAL }), granted({ principalId: PRINCIPAL })],
      { at: T2 },
    )
    expect(state.principalId).toBe(PRINCIPAL)
    expect(state.authorityBasis).toBe('founder_owner')
  })

  it('never accepts a principal as a caller parameter in the write boundary', () => {
    const source = readFileSync(resolve(REPO_ROOT, `${AUTH_DIR}/principal-write.ts`), 'utf8')
    // The principal comes from the authenticated session only.
    expect(source).toContain('resolveProjectAccess()')
    expect(source).toContain('principalId: principal.userId')
    // Authentication precedes every privileged store access (EI-S1.3A-R1).
    // Checked per entrypoint body, because `persist()` also reads the store —
    // legitimately, since it only ever runs after authentication.
    for (const entry of ['function decider(', 'export async function requestAuthorization(']) {
      const body = source.slice(source.indexOf(entry))
      const auth = body.indexOf('await authenticate()')
      expect(auth).toBeGreaterThan(-1)
      const read = body.indexOf('store.history(')
      const append = body.indexOf('store.append(')
      for (const access of [read, append]) {
        if (access > -1) expect(auth).toBeLessThan(access)
      }
    }
    // No exported argument interface may carry a principal id — a caller can
    // never name the authority; only the session can.
    const exportedArgs = source.match(/export interface \w+Args[\s\S]*?\n}/g) ?? []
    expect(exportedArgs.length).toBeGreaterThan(0)
    for (const block of exportedArgs) expect(block).not.toMatch(/principalId/)
  })

  it('cannot be authored by a service role: no session fails closed', () => {
    const source = readFileSync(resolve(REPO_ROOT, `${AUTH_DIR}/principal-write.ts`), 'utf8')
    expect(source).toContain("if (!access.ok) return DENY('no_principal')")
    // Service-role access exists only inside the store, never as an authority.
    expect(source).not.toContain('createAdminClient')
  })
})

// ── 12–16. Scope and isolation ────────────────────────────────────────────────

describe('Authorization V1 — project isolation', () => {
  it('pins the project across the whole chain', () => {
    expect(() => deriveAuthorizationState([requested(), granted({ projectId: PROJECT_B })], { at: T2 }))
      .toThrow(/project-scope-stable/)
  })

  it('denies effectiveness when queried for a different project', () => {
    const result = isEffectiveNow([requested(), granted()], { at: T2, projectId: PROJECT_B })
    expect(result.effective).toBe(false)
    expect(result.reason).toBe('project_mismatch')
  })

  it('gates every write and read on the caller allow-list', () => {
    const write = readFileSync(resolve(REPO_ROOT, `${AUTH_DIR}/principal-write.ts`), 'utf8')
    const read = readFileSync(resolve(REPO_ROOT, `${AUTH_DIR}/principal-read.ts`), 'utf8')
    for (const source of [write, read]) {
      expect(source).toContain('assertProjectAllowed')
      expect(source).toContain('resolveProjectAccess')
    }
    // An empty allow-list makes assertProjectAllowed fail for every project, and
    // reads never take the project from the caller — they take the chain's own.
    expect(read).toContain('assertProjectAllowed(history[0].projectId, access.allowedProjectIds)')
    // The shared cron secret is never read as user authorization here.
    expect(read).not.toMatch(/process\.env\.CRON_SECRET/)
  })
})

// ── 17–22. Target pinning and expiry ──────────────────────────────────────────

describe('Authorization V1 — version pinning and expiry', () => {
  it('does not float across a materially changed target', () => {
    const chain = [requested(), granted()]
    expect(isEffectiveNow(chain, { at: T2, target: TARGET_V1 }).effective).toBe(true)
    const mismatched = isEffectiveNow(chain, { at: T2, target: TARGET_V2 })
    expect(mismatched.effective).toBe(false)
    expect(mismatched.reason).toBe('version_mismatch')
  })

  it('pins the target across the chain', () => {
    expect(() => deriveAuthorizationState([requested(), granted({ target: TARGET_V2 })], { at: T2 }))
      .toThrow(/target-pin-stable/)
  })

  it('rejects a grant with no expiry, or an expiry at or before the act', () => {
    expect(() => event('granted', { occurredAt: T1, expiresAt: null })).toThrow(/grant-requires-expiry/)
    expect(() => event('granted', { occurredAt: T1, expiresAt: T1 })).toThrow(/grant-expiry-after-effective/)
    expect(() => event('granted', { occurredAt: T1, expiresAt: T0 })).toThrow(/grant-expiry-after-effective/)
    expect(() => event('granted', { occurredAt: T1, expiresAt: 'not-a-date' })).toThrow(/grant-expiry-valid/)
  })

  it('expires by time alone, with no expired event and no background job', () => {
    const chain = [requested(), granted()]
    expect(chain.some(e => e.type === 'expired')).toBe(false)
    const result = isEffectiveNow(chain, { at: AFTER_EXPIRY })
    expect(result.effective).toBe(false)
    expect(result.reason).toBe('expired')
    expect(result.state?.status).toBe('expired')
  })

  it('still reports effective inside the validity window', () => {
    expect(isEffectiveNow([requested(), granted()], { at: EXPIRES }).reason).toBe('expired')
    expect(isEffectiveNow([requested(), granted()], { at: T2 }).reason).toBe('effective')
  })
})

// ── 23–26. Conditions ─────────────────────────────────────────────────────────

describe('Authorization V1 — conditions are recorded, never enforced', () => {
  it('preserves structured conditions verbatim', () => {
    const state = deriveAuthorizationState([requested(), grantedCond()], { at: T2 })
    expect(state.status).toBe('granted_with_conditions')
    expect(state.conditions).toEqual([CONDITION])
  })

  it('is NOT execution-effective without verified conditions', () => {
    const result = isEffectiveNow([requested(), grantedCond()], { at: T2 })
    expect(result.effective).toBe(false)
    expect(result.reason).toBe('conditions_unverified')
    // The authority act is still genuine and recorded.
    expect(result.state?.status).toBe('granted_with_conditions')
    expect(result.state?.principalId).toBe(PRINCIPAL)
  })

  it('keeps the two grant types distinguishable', () => {
    expect(() => event('granted_with_conditions', { occurredAt: T1, expiresAt: EXPIRES, conditions: [] }))
      .toThrow(/conditional-grant-requires-conditions/)
    expect(() => event('granted', { occurredAt: T1, expiresAt: EXPIRES, conditions: [CONDITION] }))
      .toThrow(/unconditional-grant-has-no-conditions/)
  })

  it('requires structured condition identity, not a free-text note', () => {
    expect(() => event('granted_with_conditions', {
      occurredAt: T1, expiresAt: EXPIRES, conditions: [{ ...CONDITION, conditionId: '' }],
    })).toThrow(/condition-id-required/)
    expect(() => event('granted_with_conditions', {
      occurredAt: T1, expiresAt: EXPIRES, conditions: [CONDITION, { ...CONDITION }],
    })).toThrow(/condition-id-unique/)
  })

  it('ships no condition enforcement engine', () => {
    const derive = readFileSync(resolve(REPO_ROOT, `${AUTH_DIR}/derive.ts`), 'utf8')
    expect(derive).toContain('conditions_unverified')
    // No policy evaluation, no rule engine, no enforcement hooks — a conditional
    // grant is reported unverified rather than evaluated.
    expect(derive).not.toMatch(/function\s+(evaluate|enforce)\w*Condition/)
    expect(derive).not.toMatch(/conditionsSatisfied|policyEngine|ruleEngine/)
  })
})

// ── 27–30. Malformed and terminal chains ──────────────────────────────────────

describe('Authorization V1 — impossible chains fail closed', () => {
  it('rejects an empty chain or one that does not start with a request', () => {
    expect(() => deriveAuthorizationState([], { at: T2 })).toThrow(/chain-non-empty/)
    expect(() => deriveAuthorizationState([granted()], { at: T2 })).toThrow(/chain-starts-with-request/)
  })

  it('rejects a second decision on one request', () => {
    expect(() => deriveAuthorizationState([requested(), granted(), event('denied', { occurredAt: T2 })], { at: T2 }))
      .toThrow(/single-decision/)
  })

  it('rejects a close act with no grant to close', () => {
    expect(() => deriveAuthorizationState([requested(), event('revoked', { occurredAt: T1 })], { at: T2 }))
      .toThrow(/close-requires-grant/)
  })

  it('rejects events from a different aggregate and a widened authority', () => {
    expect(() => deriveAuthorizationState([requested(), granted({ authorizationId: 'auth-2' })], { at: T2 }))
      .toThrow(/single-aggregate/)
    expect(() => deriveAuthorizationState(
      [requested(), granted({ authority: { actionKind: 'spend_money', description: 'wider' } })], { at: T2 },
    )).toThrow(/authority-statement-stable/)
  })

  it('reports a malformed chain as ineffective rather than throwing at the seam', () => {
    const result = isEffectiveNow([granted()], { at: T2 })
    expect(result.effective).toBe(false)
    expect(result.reason).toBe('malformed_chain')
    expect(result.state).toBeNull()
  })
})

// ── 31–36. Semantic and authority boundaries ──────────────────────────────────

describe('Authorization V1 — boundary separation', () => {
  it('grants no more than the explicit requested act', () => {
    const chain = [requested(), granted()]
    expect(isEffectiveNow(chain, { at: T2, actionKind: 'publish_article' }).effective).toBe(true)
    const wider = isEffectiveNow(chain, { at: T2, actionKind: 'spend_money' })
    expect(wider.effective).toBe(false)
    expect(wider.reason).toBe('action_mismatch')
  })

  it('is not a recommendation and not a decision', () => {
    const types = readFileSync(resolve(REPO_ROOT, `${AUTH_DIR}/types.ts`), 'utf8')
    // No EI reasoning types leak into the authority domain.
    expect(types).not.toContain("from '../intelligence/types'")
    expect(types).not.toMatch(/\bconfidence\b/i)
    for (const file of ['types.ts', 'derive.ts', 'build.ts', 'store.ts', 'principal-write.ts', 'principal-read.ts']) {
      const source = readFileSync(resolve(REPO_ROOT, `${AUTH_DIR}/${file}`), 'utf8')
      expect(source).not.toContain('ExecutiveBriefBody')
      expect(source).not.toContain('IntelligenceObject')
    }
  })

  it('never executes anything', () => {
    for (const file of ['derive.ts', 'build.ts', 'principal-write.ts', 'principal-read.ts']) {
      const source = readFileSync(resolve(REPO_ROOT, `${AUTH_DIR}/${file}`), 'utf8')
      expect(source).not.toMatch(/atlasActions|executeWorkflow|publishArticle|runSteps|sendEmail|brevo/)
    }
  })

  it('keeps the pure core free of all I/O and clock reads', () => {
    const derive = readFileSync(resolve(REPO_ROOT, `${AUTH_DIR}/derive.ts`), 'utf8')
    expect(derive).not.toMatch(/createAdminClient|supabase|fetch\(|node:fs|new Date\(|Date\.now/)
    expect(derive).toContain('options: { at: string }')
  })

  it('does not bypass the Memory boundary or touch Architecture Knowledge', () => {
    for (const file of ['types.ts', 'derive.ts', 'build.ts', 'store.ts', 'principal-write.ts', 'principal-read.ts']) {
      const source = readFileSync(resolve(REPO_ROOT, `${AUTH_DIR}/${file}`), 'utf8')
      expect(source).not.toMatch(/recallMemories|atlas_recall|memories|architecture-knowledge/)
    }
  })

  it('keeps write and read server-only', () => {
    for (const file of ['principal-write.ts', 'principal-read.ts']) {
      expect(readFileSync(resolve(REPO_ROOT, `${AUTH_DIR}/${file}`), 'utf8')).toContain("import 'server-only'")
    }
  })
})

// ── 37–40. Evidence, seam, storage invariants ─────────────────────────────────

describe('Authorization V1 — evidence, storage and the Chapter 11 seam', () => {
  it('preserves evidence captured at the authority act', () => {
    const evidence = [{ kind: 'brief', ref: 'eb-1', label: 'Executive Brief', capturedAt: T0 }]
    const state = deriveAuthorizationState([requested({ evidence }), granted()], { at: T2 })
    expect(state.evidence).toEqual(evidence)
  })

  it('exposes typed authority state for the Decision Ledger seam', () => {
    const state = deriveAuthorizationState([requested(), grantedCond()], { at: T2 })
    for (const field of [
      'authorizationId', 'status', 'principalId', 'authorityBasis', 'authority',
      'projectId', 'target', 'conditions', 'evidence', 'requestedAt',
      'effectiveAt', 'expiresAt', 'revokedAt', 'supersededBy',
    ]) {
      expect(state).toHaveProperty(field)
    }
    expect(isEffectiveNow([requested(), grantedCond()], { at: T2 }).reason).toBe('conditions_unverified')
  })

  it('defaults to requiring authorization unless non-materiality is established', () => {
    expect(isAuthorizationRequired({ materiality: 'material' })).toBe(true)
    expect(isAuthorizationRequired({ materiality: 'unknown' })).toBe(true)
    expect(isAuthorizationRequired({ materiality: 'non_material' })).toBe(false)
  })

  it('offers no update or delete path in the store interface', () => {
    const store = readFileSync(resolve(REPO_ROOT, `${AUTH_DIR}/store.ts`), 'utf8')
    expect(store).toContain('append(')
    expect(store).not.toMatch(/\.update\(|\.delete\(|\.upsert\(/)
  })

  it('enforces append-only in the database, not only in TypeScript', () => {
    const migration = readFileSync(
      resolve(REPO_ROOT, 'apps/web/supabase/migrations/20260819_atlas_authorizations.sql'), 'utf8',
    )
    expect(migration).toContain('before update on public.atlas_authorizations')
    expect(migration).toContain('before delete on public.atlas_authorizations')
    expect(migration).toContain('append-only')
    expect(migration).toContain('project_id            uuid not null')
    expect(migration).toContain('principal_id          uuid not null')
    expect(migration).toContain('enable row level security')
    expect(migration).toContain('revoke all on public.atlas_authorizations from anon, authenticated')
    // Transition invariants serialize concurrent terminal acts (EI-S1.3A-R1).
    expect(migration).toContain('atlas_authorizations_one_request_idx')
    expect(migration).toContain('atlas_authorizations_one_decision_idx')
    expect(migration).toContain('atlas_authorizations_one_close_idx')
    // No mutable current-status column: status is derived from the chain.
    expect(migration).not.toMatch(/^\s*status\s+text/m)
    expect(migration).not.toMatch(/current_status/)
  })
})
