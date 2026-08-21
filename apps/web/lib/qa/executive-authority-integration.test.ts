/**
 * lib/qa/executive-authority-integration.test.ts — EI-S1.6B-R4
 *
 * REAL-BOUNDARY EVIDENCE. The companion adapter suite
 * (`executive-authority-entrypoint.test.ts`) mocks `principal-write`, which is
 * right for proving what the HTTP layer forwards and refuses — but it cannot
 * prove reachability, and an earlier revision wrongly called one of its cases
 * "end to end". Worse, the mock hid two non-canonical fixtures: `version`
 * instead of `decisionVersion`, and a `missionType` that is not in the union.
 * The real domain would have rejected both.
 *
 * EI-REACH-01 is about reaching the REAL sanctioned boundary, so nothing here
 * mocks it. `proposeDecision`, `openMission` and `grantAuthorization` execute
 * for real, along with their builders and derive paths. Only the edges are
 * faked:
 *
 *   resolveProjectAccess   the authenticated session seam
 *   store factories        in-memory append-only ledgers
 *   readProjectMode        project operational mode
 *   resolveDecision        the sanctioned governing-decision read
 *
 * Nothing touches production, and no institutional history is invented
 * anywhere real.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { MissionDecisionReference, MissionType } from '@/lib/atlas/mission/types'
import type { MaterialityDomain } from '@/lib/atlas/decision-ledger/types'

const OWNER = 'owner-user-id'
const PROJECT = '11111111-1111-4111-8111-111111111111'
const FOREIGN = '33333333-3333-4333-8333-333333333333'
const HOST = 'omnira.example'

// ── Edge seams only ───────────────────────────────────────────────────────────

const S = vi.hoisted(() => {
  const missionRecords: any[] = []
  const decisionRecords: any[] = []
  const authEvents: any[] = []

  const access = { ok: true, userId: 'owner-user-id', allowedProjectIds: ['11111111-1111-4111-8111-111111111111'] }

  const missionStore = {
    append: async (r: any) => { missionRecords.push(r); return r },
    lineage: async (id: string) => missionRecords.filter(r => r.missionId === id),
    byProject: async (p: string) => missionRecords.filter(r => r.projectId === p),
  }
  const decisionStore = {
    append: async (r: any) => { decisionRecords.push(r); return r },
    lineage: async (id: string) => decisionRecords.filter(r => r.decisionId === id),
    byProject: async (p: string) => decisionRecords.filter(r => r.projectId === p),
  }
  const authStore = {
    append: async (e: any) => { authEvents.push(e); return e },
    history: async (id: string) => authEvents.filter(e => e.authorizationId === id),
    byProject: async (p: string) => authEvents.filter(e => e.projectId === p),
    byTarget: async (p: string, tt: string, ti: string) =>
      authEvents.filter(e => e.projectId === p && e.target?.targetType === tt && e.target?.targetId === ti),
  }

  return { missionRecords, decisionRecords, authEvents, access, missionStore, decisionStore, authStore,
           governingDecision: { evaluation: null as any, status: 'ok' } }
})

vi.mock('@/lib/auth/project-access', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveProjectAccess: async () => S.access,
}))
vi.mock('@/lib/atlas/mission/store', () => ({ createMissionLedgerStore: () => S.missionStore }))
vi.mock('@/lib/atlas/decision-ledger/store', () => ({ createDecisionLedgerStore: () => S.decisionStore }))
vi.mock('@/lib/atlas/authorization/store', () => ({ createAuthorizationEventStore: () => S.authStore }))
vi.mock('@/lib/atlas/mission/operational-authority', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readProjectMode: async () => 'operational',
}))
vi.mock('@/lib/atlas/decision-ledger/principal-read', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveDecision: async () => S.governingDecision,
}))
// `@/lib/atlas/isolation` stays REAL — assertProjectAllowed is pure and is the
// project boundary under test.

import { POST as decisionRoute } from '@/app/api/atlas/executive/decision/route'
import { POST as missionRoute } from '@/app/api/atlas/executive/mission/route'
import { POST as authorizationRoute } from '@/app/api/atlas/executive/authorization/route'
// Statically imported, exactly like the routes. A dynamic `await import()`
// inside a test body raced module initialisation against the mock registry and
// intermittently resolved the REAL store, which fails closed as `unavailable`.
import { requestAuthorization } from '@/lib/atlas/authorization/principal-write'

function req(body: unknown): Request {
  return new Request(`https://${HOST}/api/atlas/executive/x`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: `https://${HOST}`, host: HOST },
    body: JSON.stringify(body),
  })
}

const MISSION_TYPE = 'operational' satisfies MissionType
const MATERIALITY: MaterialityDomain[] = ['strategy']

const missionBase = {
  action: 'open', projectId: PROJECT,
  title: 'Stabilise the ingest path',
  objective: 'Reduce ingest failures to under one percent',
  missionType: MISSION_TYPE,
  executiveOwner: 'atlas.executive',
}

beforeEach(() => {
  S.missionRecords.length = 0
  S.decisionRecords.length = 0
  S.authEvents.length = 0
  S.access.userId = OWNER
  S.access.allowedProjectIds = [PROJECT]
  S.governingDecision = { evaluation: null, status: 'ok' }
})

// ── Structural: this suite must not mock the boundary it is proving ──────────

describe('EI-S1.6B-R4 — the integration suite reaches the real boundary', () => {
  it('mocks no principal-write module', () => {
    const src = require('node:fs').readFileSync(__filename, 'utf8') as string
    const mocked = [...src.matchAll(/vi\.mock\('([^']+)'/g)].map(m => m[1])
    for (const m of mocked) {
      expect(m, `${m} must not be a principal-write module`).not.toContain('principal-write')
    }
    // ...and the real ones are genuinely loaded.
    expect(mocked).toContain('@/lib/atlas/mission/store')
    expect(mocked).toContain('@/lib/auth/project-access')
  })
})

// ── Decision ─────────────────────────────────────────────────────────────────

describe('EI-S1.6B-R4 — real Decision boundary', () => {
  const proposeBody = {
    action: 'propose', projectId: PROJECT,
    title: 'Adopt the ingest backpressure policy',
    statement: 'Ingest applies backpressure rather than dropping events.',
    materiality: MATERIALITY,
  }

  it('authenticated HTTP reaches the real proposeDecision and appends a record', async () => {
    const res = await decisionRoute(req(proposeBody))
    expect(res.status).toBe(200)
    expect(S.decisionRecords).toHaveLength(1)

    const record = S.decisionRecords[0]
    expect(record.projectId).toBe(PROJECT)
    expect(record.decisionId).toBeTruthy()
    // The real builder ran: it minted the id and stamped canonical fields.
    expect(record.recordId).toBeTruthy()
    expect(record.occurredAt).toBeTruthy()
  })

  it('takes the principal from the session seam, never the body', async () => {
    await decisionRoute(req(proposeBody))
    expect(S.decisionRecords[0].principalId).toBe(OWNER)
  })

  it('denies a project the principal does not own, through the real boundary', async () => {
    const res = await decisionRoute(req({ ...proposeBody, projectId: FOREIGN }))
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('{"error":"Not found"}')
    expect(S.decisionRecords).toHaveLength(0)
  })

  it('lets the real domain reject a non-canonical payload', async () => {
    const res = await decisionRoute(req({ ...proposeBody, materiality: ['not_a_domain'] }))
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(S.decisionRecords).toHaveLength(0)
  })
})

// ── Mission ──────────────────────────────────────────────────────────────────

describe('EI-S1.6B-R4 — real Mission boundary', () => {
  it('authenticated HTTP reaches the real openMission and appends a record', async () => {
    const res = await missionRoute(req(missionBase))
    expect(res.status).toBe(200)
    expect(S.missionRecords).toHaveLength(1)
    const record = S.missionRecords[0]
    expect(record.projectId).toBe(PROJECT)
    expect(record.missionId).toBeTruthy()
    expect(record.principalId).toBe(OWNER)
  })

  /**
   * The canonical-vocabulary proof. `delivery` was used throughout the earlier
   * adapter fixtures and passed because the domain was mocked; the real
   * builder rejects it.
   */
  it('rejects a non-canonical missionType at the real builder', async () => {
    const res = await missionRoute(req({ ...missionBase, missionType: 'delivery' }))
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(S.missionRecords).toHaveLength(0)
  })

  it('normalizes action bounds before they reach the immutable record', async () => {
    await missionRoute(req({
      ...missionBase,
      authority: [{ action: 'draft_copy', note: 'no publishing', smuggled: 'nope' }],
    }))
    expect(S.missionRecords).toHaveLength(1)
    expect(S.missionRecords[0].authority).toEqual([{ action: 'draft_copy', note: 'no publishing' }])
    expect(JSON.stringify(S.missionRecords[0])).not.toContain('smuggled')
  })
})

// ── Decision-backed Mission — the proof R3 claimed but lacked ────────────────

describe('EI-S1.6B-R4 — Decision-backed Mission through the real builder', () => {
  const authoritySource = { kind: 'decision_ledger', reference: 'decision:governing' }

  it('accepts the canonical decisionVersion contract', async () => {
    const decisionRef: MissionDecisionReference =
      { decisionId: '22222222-2222-4222-8222-222222222222', decisionVersion: 2 }

    const res = await missionRoute(req({ ...missionBase, authoritySource, decisionRef }))
    expect(res.status).toBe(200)
    expect(S.missionRecords).toHaveLength(1)
    expect(S.missionRecords[0].decisionRef).toEqual(decisionRef)
    expect(S.missionRecords[0].authoritySource).toEqual(authoritySource)
  })

  /**
   * The independently-found defect, locked. HTTP JSON has no types, so this
   * cannot be left to TypeScript: the wrong key must be refused at runtime.
   */
  it('refuses `version` where the canonical field is `decisionVersion`', async () => {
    const res = await missionRoute(req({
      ...missionBase, authoritySource,
      decisionRef: { decisionId: '22222222-2222-4222-8222-222222222222', version: 2 },
    }))
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(S.missionRecords).toHaveLength(0)
  })

  it('refuses decision_ledger authority with no reference at all', async () => {
    const res = await missionRoute(req({ ...missionBase, authoritySource }))
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(S.missionRecords).toHaveLength(0)
  })

  it('never accepts caller-supplied decisionProvenance', async () => {
    const res = await missionRoute(req({
      ...missionBase, authoritySource,
      decisionRef: { decisionId: '22222222-2222-4222-8222-222222222222', decisionVersion: 1 },
      decisionProvenance: { projectId: FOREIGN, decisionId: 'x' },
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).detail).toBe('reserved_field:decisionProvenance')
    expect(S.missionRecords).toHaveLength(0)
  })
})

// ── Authorization ────────────────────────────────────────────────────────────

describe('EI-S1.6B-R4 — real Authorization boundary', () => {
  /** Seed a pending authorization through the REAL request path. */
  async function seedPending(): Promise<string> {
    const result = await requestAuthorization({
      projectId: PROJECT,
      target: { targetType: 'decision', targetId: 'dec-1', versionHash: 'a'.repeat(64) },
      authority: { actionKind: 'decision.approve', description: 'Executive Decision: approve' },
    })
    expect(result.status).toBe('ok')
    return (result.state as { authorizationId: string }).authorizationId
  }

  it('authenticated HTTP grant reaches the real grantAuthorization and appends', async () => {
    const authorizationId = await seedPending()
    const before = S.authEvents.length

    const res = await authorizationRoute(req({
      action: 'grant', authorizationId,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      reason: 'reviewed and approved',
    }))
    expect(res.status).toBe(200)
    expect(S.authEvents.length).toBe(before + 1)

    const granted = S.authEvents[S.authEvents.length - 1]
    expect(granted.type).toBe('granted')
    expect(granted.authorizationId).toBe(authorizationId)
    expect(granted.principalId).toBe(OWNER)
  })

  it('rejects an identity-spoof attempt before the real boundary', async () => {
    const authorizationId = await seedPending()
    const before = S.authEvents.length

    const res = await authorizationRoute(req({
      action: 'grant', authorizationId,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      principalId: 'someone-else', userId: 'someone-else',
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).detail).toMatch(/^reserved_field:(principalId|userId)$/)
    expect(S.authEvents.length, 'no event may be appended').toBe(before)
  })

  it('refuses a grant with no bounded expiry', async () => {
    const authorizationId = await seedPending()
    const before = S.authEvents.length
    const res = await authorizationRoute(req({ action: 'grant', authorizationId }))
    expect(res.status).toBe(400)
    expect(S.authEvents.length).toBe(before)
  })

  it('the route appends nothing itself — every event carries domain shape', async () => {
    const authorizationId = await seedPending()
    await authorizationRoute(req({
      action: 'grant', authorizationId,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    }))
    for (const event of S.authEvents) {
      expect(event.eventId).toBeTruthy()
      expect(event.occurredAt).toBeTruthy()
      expect(event.projectId).toBe(PROJECT)
    }
  })
})
