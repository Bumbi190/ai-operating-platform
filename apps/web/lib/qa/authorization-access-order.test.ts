/**
 * Authorization V1 — auth-before-read regression suite (EI-S1.3A-R1).
 *
 * Two properties are asserted here that source-level checks cannot prove:
 *
 *  1. NO PRIVILEGED READ BEFORE AUTHENTICATION. The service-role event store
 *     must not be touched at all until `resolveProjectAccess` has established a
 *     principal, and must not be touched for a foreign project beyond the single
 *     scope-resolving read.
 *
 *  2. NO EXISTENCE ORACLE. A caller who has not proven scope must not be able to
 *     tell "this authorization id does not exist" apart from "this authorization
 *     exists but is not yours". Both answer with one indistinguishable denial.
 *
 * The store is a recording fake, so "did a privileged read happen" is directly
 * observable. `resolveProjectAccess` is mocked because it needs a Next request
 * context; everything else is the real implementation.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/project-access', () => ({
  resolveProjectAccess: vi.fn(),
}))

import { resolveProjectAccess } from '@/lib/auth/project-access'
import { buildAuthorizationEvent } from '@/lib/atlas/authorization/build'
import {
  denyAuthorization,
  grantAuthorization,
  requestAuthorization,
  revokeAuthorization,
  supersedeAuthorization,
} from '@/lib/atlas/authorization/principal-write'
import {
  listProjectAuthorizations,
  resolveAuthorization,
} from '@/lib/atlas/authorization/principal-read'
import type { AuthorizationEvent } from '@/lib/atlas/authorization/types'
import type { AuthorizationEventStore } from '@/lib/atlas/authorization/store'

const PRINCIPAL_A = '11111111-1111-4111-8111-111111111111'
const PROJECT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PROJECT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const T0 = '2026-08-19T08:00:00.000Z'
const T1 = '2026-08-19T09:00:00.000Z'
const EXPIRES = '2026-08-20T08:00:00.000Z'
const VERSION = 'a'.repeat(64)

const AUTH_IN_B = 'auth-in-project-b'
const UNKNOWN = 'auth-that-does-not-exist'

function chainInProjectB(): AuthorizationEvent[] {
  return [
    buildAuthorizationEvent({
      type: 'requested',
      authorizationId: AUTH_IN_B,
      projectId: PROJECT_B,
      principalId: '22222222-2222-4222-8222-222222222222',
      target: { targetType: 'article', targetId: 'art-b', versionHash: VERSION },
      authority: { actionKind: 'publish_article', description: 'Publish once.' },
      occurredAt: T0,
      eventId: 'b-1',
    }),
  ]
}

/** Records every privileged access so "was the store touched?" is observable. */
class RecordingStore implements AuthorizationEventStore {
  reads: string[] = []
  appends: AuthorizationEvent[] = []
  constructor(private readonly seed: Record<string, AuthorizationEvent[]> = {}) {}

  async append(event: AuthorizationEvent): Promise<AuthorizationEvent> {
    this.appends.push(event)
    this.seed[event.authorizationId] = [...(this.seed[event.authorizationId] ?? []), event]
    return event
  }
  async history(authorizationId: string): Promise<AuthorizationEvent[]> {
    this.reads.push(`history:${authorizationId}`)
    return this.seed[authorizationId] ?? []
  }
  async byProject(projectId: string): Promise<AuthorizationEvent[]> {
    this.reads.push(`byProject:${projectId}`)
    return Object.values(this.seed).flat().filter(e => e.projectId === projectId)
  }
  async byTarget(projectId: string, targetType: string, targetId: string): Promise<AuthorizationEvent[]> {
    this.reads.push(`byTarget:${projectId}`)
    return Object.values(this.seed).flat()
      .filter(e => e.projectId === projectId && e.target.targetType === targetType && e.target.targetId === targetId)
  }
}

const mockAccess = vi.mocked(resolveProjectAccess)

function unauthenticated() {
  mockAccess.mockResolvedValue({ ok: false, response: { status: 401 } as never })
}
function authenticatedAs(userId: string, allowedProjectIds: string[]) {
  mockAccess.mockResolvedValue({ ok: true, userId, allowedProjectIds })
}

function seeded() {
  return new RecordingStore({ [AUTH_IN_B]: chainInProjectB() })
}

const DECISIONS = [
  ['grant', (a: never) => grantAuthorization(a)],
  ['deny', (a: never) => denyAuthorization(a)],
  ['revoke', (a: never) => revokeAuthorization(a)],
] as const

beforeEach(() => { mockAccess.mockReset() })

// ── 1–2. Unauthenticated caller ───────────────────────────────────────────────

describe('Authorization V1 — unauthenticated callers learn nothing', () => {
  it.each(DECISIONS)('%s: unknown and existing ids are indistinguishable, and no store read happens', async (_label, call) => {
    unauthenticated()

    const storeUnknown = seeded()
    const unknown = await call({ authorizationId: UNKNOWN, store: storeUnknown, now: T1, expiresAt: EXPIRES } as never)

    const storeExisting = seeded()
    const existing = await call({ authorizationId: AUTH_IN_B, store: storeExisting, now: T1, expiresAt: EXPIRES } as never)

    // Identical outward result — no existence oracle.
    expect(unknown.status).toBe(existing.status)
    expect(unknown.status).toBe('no_principal')
    expect(unknown.state).toBeNull()
    expect(existing.state).toBeNull()

    // And the privileged store was never touched for either.
    expect(storeUnknown.reads).toEqual([])
    expect(storeExisting.reads).toEqual([])
    expect(storeUnknown.appends).toEqual([])
    expect(storeExisting.appends).toEqual([])
  })

  it('supersede and request also refuse before any privileged read', async () => {
    unauthenticated()
    const store = seeded()

    const superseded = await supersedeAuthorization({
      authorizationId: AUTH_IN_B, supersededBy: 'successor', store, now: T1,
    })
    const requested = await requestAuthorization({
      projectId: PROJECT_A, store, now: T1,
      target: { targetType: 'article', targetId: 'art-a', versionHash: VERSION },
      authority: { actionKind: 'publish_article', description: 'Publish once.' },
    })

    expect(superseded.status).toBe('no_principal')
    expect(requested.status).toBe('no_principal')
    expect(store.reads).toEqual([])
    expect(store.appends).toEqual([])
  })

  it('reads refuse before any privileged read too', async () => {
    unauthenticated()
    const store = seeded()

    const unknown = await resolveAuthorization(UNKNOWN, { store, now: T1 })
    const existing = await resolveAuthorization(AUTH_IN_B, { store, now: T1 })
    const listed = await listProjectAuthorizations(PROJECT_B, { store })

    expect(unknown.status).toBe(existing.status)
    expect(unknown.status).toBe('no_principal')
    expect(existing.history).toEqual([])
    expect(listed.status).toBe('no_principal')
    expect(store.reads).toEqual([])
  })
})

// ── 3–4. Authenticated caller without scope ───────────────────────────────────

describe('Authorization V1 — a caller without scope cannot probe existence', () => {
  it.each(DECISIONS)('%s: unknown id and foreign-project id return the same denial', async (_label, call) => {
    authenticatedAs(PRINCIPAL_A, [PROJECT_A])

    const storeUnknown = seeded()
    const unknown = await call({ authorizationId: UNKNOWN, store: storeUnknown, now: T1, expiresAt: EXPIRES } as never)

    const storeForeign = seeded()
    const foreign = await call({ authorizationId: AUTH_IN_B, store: storeForeign, now: T1, expiresAt: EXPIRES } as never)

    // The whole point: these must be indistinguishable.
    expect(unknown.status).toBe(foreign.status)
    expect(unknown.state).toBeNull()
    expect(foreign.state).toBeNull()
    // Nothing was written to a project the caller does not own.
    expect(storeForeign.appends).toEqual([])
    expect(storeUnknown.appends).toEqual([])
  })

  it('resolveAuthorization returns the same denial for unknown and foreign, and no history', async () => {
    authenticatedAs(PRINCIPAL_A, [PROJECT_A])
    const store = seeded()

    const unknown = await resolveAuthorization(UNKNOWN, { store, now: T1 })
    const foreign = await resolveAuthorization(AUTH_IN_B, { store, now: T1 })

    expect(unknown.status).toBe(foreign.status)
    expect(unknown.state).toBeNull()
    expect(foreign.state).toBeNull()
    expect(foreign.history).toEqual([])
  })

  it('an empty allow-list denies everything', async () => {
    authenticatedAs(PRINCIPAL_A, [])
    const store = seeded()

    const read = await resolveAuthorization(AUTH_IN_B, { store, now: T1 })
    const write = await grantAuthorization({ authorizationId: AUTH_IN_B, store, now: T1, expiresAt: EXPIRES })
    const listed = await listProjectAuthorizations(PROJECT_B, { store })

    expect(read.state).toBeNull()
    expect(write.state).toBeNull()
    expect(listed.events).toEqual([])
    expect(store.appends).toEqual([])
  })
})

// ── 5. The owner path still works ─────────────────────────────────────────────

describe('Authorization V1 — the legitimate owner is unaffected', () => {
  it('requests, grants and reads inside an owned project', async () => {
    authenticatedAs(PRINCIPAL_A, [PROJECT_A])
    const store = new RecordingStore()

    const requested = await requestAuthorization({
      projectId: PROJECT_A, store, now: T0,
      target: { targetType: 'article', targetId: 'art-a', versionHash: VERSION },
      authority: { actionKind: 'publish_article', description: 'Publish once.' },
    })
    expect(requested.status).toBe('ok')
    expect(requested.state?.status).toBe('pending')
    expect(requested.state?.principalId).toBe(PRINCIPAL_A)

    const authorizationId = requested.state!.authorizationId
    const granted = await grantAuthorization({ authorizationId, store, now: T1, expiresAt: EXPIRES })
    expect(granted.status).toBe('ok')
    expect(granted.state?.status).toBe('granted')

    const read = await resolveAuthorization(authorizationId, { store, now: T1 })
    expect(read.status).toBe('ok')
    expect(read.history).toHaveLength(2)
  })

  it('denies a request for a project the caller does not own', async () => {
    authenticatedAs(PRINCIPAL_A, [PROJECT_A])
    const store = new RecordingStore()
    const result = await requestAuthorization({
      projectId: PROJECT_B, store, now: T0,
      target: { targetType: 'article', targetId: 'art-b', versionHash: VERSION },
      authority: { actionKind: 'publish_article', description: 'Publish once.' },
    })
    expect(result.status).toBe('project_denied')
    expect(store.appends).toEqual([])
  })
})

// ── 6. Retry semantics stated honestly ────────────────────────────────────────

describe('Authorization V1 — retry semantics', () => {
  it('requestAuthorization is retry-SAFE but NOT idempotent: a retry opens a new aggregate', async () => {
    authenticatedAs(PRINCIPAL_A, [PROJECT_A])
    const store = new RecordingStore()
    const args = {
      projectId: PROJECT_A, store, now: T0,
      target: { targetType: 'article', targetId: 'art-a', versionHash: VERSION },
      authority: { actionKind: 'publish_article', description: 'Publish once.' },
    }
    const first = await requestAuthorization(args)
    const second = await requestAuthorization(args)

    expect(first.state?.authorizationId).not.toBe(second.state?.authorizationId)
    expect(store.appends).toHaveLength(2)
    // Neither is a grant: a duplicate request creates two pending chains, which
    // is safe (nothing is authorized) but is not idempotency.
    expect(first.state?.status).toBe('pending')
    expect(second.state?.status).toBe('pending')
  })
})
