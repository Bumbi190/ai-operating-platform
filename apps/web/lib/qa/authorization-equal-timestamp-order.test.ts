/**
 * EI-AUTH-ORDER-01 — equal-timestamp Authorization chain ordering.
 *
 * `orderAuthorizationEvents` used to tie-break equal `occurredAt` values on
 * `eventId`, a RANDOM UUID. Two events written inside one millisecond therefore
 * received a random lifecycle order, and when a `granted` UUID happened to sort
 * below its own `requested`, `deriveAuthorizationState` threw
 * `chain-starts-with-request` — after the append had already landed, in an
 * append-only ledger with no repair path.
 *
 * These are pure-core tests: no HTTP, no store, no mocks. Each builds the
 * adversarial UUID order explicitly rather than hoping for it, so a regression
 * cannot hide behind a lucky random draw.
 */
import { describe, expect, it } from 'vitest'
import { deriveAuthorizationState, orderAuthorizationEvents } from '@/lib/atlas/authorization/derive'
import type { AuthorizationEvent, AuthorizationEventType } from '@/lib/atlas/authorization/types'

const T = '2027-03-01T12:00:00.000Z'
const AUTH_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT = '22222222-2222-4222-8222-222222222222'
const PRINCIPAL = '33333333-3333-4333-8333-333333333333'

const TARGET = { targetType: 'decision', targetId: 'd-1', versionHash: 'a'.repeat(64) }
const AUTHORITY = { actionKind: 'decision.approve', description: 'Executive Decision: approve' }

/** `eventId` is supplied explicitly so lexical order can be made adversarial. */
function event(
  type: AuthorizationEventType,
  eventId: string,
  extra: Record<string, unknown> = {},
  occurredAt = T,
): AuthorizationEvent {
  return {
    eventId, authorizationId: AUTH_ID, type, projectId: PROJECT, principalId: PRINCIPAL,
    target: TARGET, authority: AUTHORITY, occurredAt,
    conditions: [], evidence: [], expiresAt: null, supersededBy: null, reason: null,
    ...extra,
  } as unknown as AuthorizationEvent
}

const FUTURE = '2099-01-01T00:00:00.000Z'
/** Lexically LAST — a decision built with this sorts after `requested` by UUID. */
const HI = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
/** Lexically FIRST — the adversarial case the old tie-break got wrong. */
const LO = '00000000-0000-4000-8000-000000000000'
const MID = '88888888-8888-4888-8888-888888888888'

describe('EI-AUTH-ORDER-01 — lifecycle phase decides equal-instant order', () => {
  it('requested + granted at the same instant derives granted, whichever UUID sorts first', () => {
    for (const [reqId, grantId] of [[HI, LO], [LO, HI]] as const) {
      const chain = [
        event('granted', grantId, { expiresAt: FUTURE }),
        event('requested', reqId),
      ]
      const ordered = orderAuthorizationEvents(chain)
      expect(ordered[0].type, `req=${reqId} grant=${grantId}`).toBe('requested')
      expect(deriveAuthorizationState(chain, { at: T }).status).toBe('granted')
    }
  })

  it('requested + denied at the same instant derives denied', () => {
    for (const [reqId, denyId] of [[HI, LO], [LO, HI]] as const) {
      const chain = [event('denied', denyId), event('requested', reqId)]
      expect(deriveAuthorizationState(chain, { at: T }).status).toBe('denied')
    }
  })

  it('requested + granted + revoked at one instant derives revoked', () => {
    // Adversarial: revoked sorts FIRST by UUID, granted second, requested last.
    const chain = [
      event('requested', HI),
      event('granted', MID, { expiresAt: FUTURE }),
      event('revoked', LO),
    ]
    const ordered = orderAuthorizationEvents(chain).map(e => e.type)
    expect(ordered).toEqual(['requested', 'granted', 'revoked'])
    expect(deriveAuthorizationState(chain, { at: T }).status).toBe('revoked')
  })

  it('an impossible chain still fails closed — ordering never invents a request', () => {
    // revoked without any grant: reordering must not rescue it.
    expect(() => deriveAuthorizationState(
      [event('requested', LO), event('revoked', HI)], { at: T },
    )).toThrow()
  })

  it('a chain with no `requested` at all still fails chain-starts-with-request', () => {
    expect(() => deriveAuthorizationState(
      [event('granted', LO, { expiresAt: FUTURE })], { at: T },
    )).toThrow(/chain-starts-with-request/)
  })

  it('random eventId lexical order cannot decide lifecycle semantics', () => {
    // 200 random UUID pairs; the derived status must be identical every time.
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const chain = [
        event('granted', crypto.randomUUID(), { expiresAt: FUTURE }),
        event('requested', crypto.randomUUID()),
      ]
      seen.add(deriveAuthorizationState(chain, { at: T }).status)
    }
    expect([...seen]).toEqual(['granted'])
  })

  it('genuine time order still wins over phase', () => {
    // A revocation a second later must not be dragged in front of its grant,
    // and an earlier request must stay first regardless of phase arithmetic.
    const chain = [
      event('revoked', LO, {}, '2027-03-01T12:00:01.000Z'),
      event('granted', MID, { expiresAt: FUTURE }),
      event('requested', HI),
    ]
    expect(orderAuthorizationEvents(chain).map(e => e.type))
      .toEqual(['requested', 'granted', 'revoked'])
  })

  it('duplicate contradictory events with a shared eventId remain malformed', () => {
    const a = event('granted', LO, { expiresAt: FUTURE })
    const b = event('denied', LO)
    expect(() => orderAuthorizationEvents([a, b])).toThrow(/event-id-stable/)
  })

  it('an identical duplicate is de-duplicated rather than treated as two events', () => {
    const one = event('requested', LO)
    expect(orderAuthorizationEvents([one, { ...one }])).toHaveLength(1)
  })

  it('every AuthorizationEventType has a phase — ordering is total', () => {
    const TYPES: AuthorizationEventType[] = [
      'requested', 'granted', 'granted_with_conditions', 'denied',
      'revoked', 'superseded', 'expired',
    ]
    // A missing phase would make the comparator return NaN, which leaves array
    // order untouched and silently restores the old non-determinism.
    for (const type of TYPES) {
      const ordered = orderAuthorizationEvents([
        event(type, HI, type === 'granted' || type === 'granted_with_conditions'
          ? { expiresAt: FUTURE } : {}),
        event('requested', LO),
      ])
      expect(ordered.map(e => e.type)[0], `${type} vs requested`).toBe('requested')
    }
  })
})
