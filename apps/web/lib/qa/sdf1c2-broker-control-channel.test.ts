/**
 * SDF-1C2: the authenticated broker control channel (discover, claim, claim recovery, heartbeat)
 * — HTTP boundary, signed-request binding, repository scope, raw-token lifecycle, the local
 * protocol client, response ordering and the structural zero-execution boundary. The database
 * invariants are proved against real PostgreSQL in sdf1c2-broker-control-channel-sql.test.ts.
 */
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleControlRequest, readBoundedBody, CONTROL_BODY_LIMIT_BYTES, type ControlOperation } from '@/lib/atlas/code-broker/control-channel/handler'
import { parseDiscoverBody, parseHeartbeatBody, parseWorkIdBody } from '@/lib/atlas/code-broker/control-channel/dto'
import { brokerClaimTokenHash, issueBrokerClaimCredential } from '@/lib/atlas/code-work/claim-credential/claim-credential'
import { canonicalRequestPayload, sha256Hex } from '@/lib/atlas/code-broker/protocol'
import { publicJwkThumbprint } from '@/lib/atlas/code-broker/crypto'
import type { BrokerBuildPolicy } from '@/lib/atlas/code-broker/policy'
import type { AcceptRequestInput, BrokerStore } from '@/lib/atlas/code-broker/store'
import type { BrokerPublicJwk, StoredBroker } from '@/lib/atlas/code-broker/types'
import { CODE_WORK_NON_TERMINAL_STATES, CODE_WORK_TERMINAL_STATES } from '@/lib/atlas/code-work/lifecycle'
import type { StoredCodeWorkRun } from '@/lib/atlas/code-work/control-plane/types'
import { assertOperationalOrigin, claimWork, CODE_WORK_RESPONSE_STATES, discoverWork, DISCOVERY_MAX_ITEMS, heartbeat, isCanonicalClaimToken, OPERATIONAL_PATHS, recoverClaim, type OperationalContext } from '../../../code-broker/src/protocol/operational-client'
import { ClaimHandleTracker, type ClaimHandle } from '../../../code-broker/src/protocol/response-order'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('the control channel test must never reach a real database') } }))

const ROOT = resolve(__dirname, '../../../..')
const NOW = new Date('2026-09-24T12:00:00.000Z')
const REPO = 'github.com/bumbi190/ai-operating-platform'
const OWNER = '10000000-0000-4000-8000-000000000001'
const HOST = '30000000-0000-4000-8000-000000000001'
const BROKER = '40000000-0000-4000-8000-000000000001'
const OTHER_BROKER = '40000000-0000-4000-8000-000000000002'
const OTHER_HOST = '30000000-0000-4000-8000-000000000002'
const WORK = '50000000-0000-4000-8000-000000000001'
const OTHER_WORK = '50000000-0000-4000-8000-000000000002'
const FOREIGN_WORK = '50000000-0000-4000-8000-000000000003'
const CLAIM = '60000000-0000-4000-8000-000000000001'
const BUILD = 'a'.repeat(64)
const BASE_SHA = 'a2751fb3e65a138f460a2a4acf4149a5f1d501f1'
const ORIGIN = 'https://omnira.test'

const key = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const otherKey = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const publicJwk = key.publicKey.export({ format: 'jwk' }) as BrokerPublicJwk
const policy: BrokerBuildPolicy = { protocolVersion: 1, brokerVersion: '0.1.0', allowedBuildSha256: new Set([BUILD]), allowedRepositoryIds: [REPO] }
const now = () => NOW

function brokerRow(over: Partial<StoredBroker> = {}): StoredBroker {
  return { brokerId: BROKER, enrollmentId: '20000000-0000-4000-8000-000000000001', ownerUserId: OWNER, hostId: HOST,
    publicJwk, keyThumbprint: publicJwkThumbprint(publicJwk), algorithm: 'ES256', protocolVersion: 1,
    brokerVersion: '0.1.0', buildSha256: BUILD, hostLabel: 'Synthetic Mac', localUidHash: 'b'.repeat(64),
    osVersion: 'macOS synthetic', status: 'active', allowedRepositoryIds: [REPO], approvedAt: NOW.toISOString(),
    approvedBy: OWNER, lastSeenAt: null, expiresAt: null, revokedAt: null, revokedBy: null, revokedReason: null,
    requestCounter: 0, lastRequestJti: null, lastRequestAt: null, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), ...over }
}

/** Mirrors the SQL boundary: strictly next counter, no immediate jti reuse, +-2 minute window. */
class MemoryBrokerStore implements BrokerStore {
  constructor(public broker: StoredBroker | null = brokerRow()) {}
  async brokerById(id: string) { return this.broker?.brokerId === id ? this.broker : null }
  async acceptRequest(input: AcceptRequestInput) {
    const broker = this.broker
    if (!broker || broker.status !== 'active' || broker.brokerId !== input.brokerId || broker.hostId !== input.hostId
        || input.requestCounter !== broker.requestCounter + 1 || input.jti === broker.lastRequestJti
        || Math.abs(NOW.getTime() - Date.parse(input.requestTimestamp)) > 120_000) throw new Error('replay')
    this.broker = { ...broker, requestCounter: input.requestCounter, lastRequestJti: input.jti, lastRequestAt: input.requestTimestamp, lastSeenAt: NOW.toISOString() }
    return this.broker
  }
  async enrollmentById() { return null } async brokersByOwner() { return [] } async openEnrollmentByOwner() { return null }
  async beginEnrollment(): Promise<never> { throw new Error('unused') } async completeEnrollment(): Promise<never> { throw new Error('unused') }
  async approve(): Promise<never> { throw new Error('unused') } async revoke(): Promise<never> { throw new Error('unused') }
}

function runOf(over: Partial<StoredCodeWorkRun> = {}): StoredCodeWorkRun {
  return { workId: WORK, projectId: 'p', requestedBy: 'u', proposalKeyHash: 'k', proposalFingerprintHash: 'f', admission: { secret: 'must-not-leak' } as never,
    admissionHash: 'a', authorizationId: 'z', authorizationExpiresAt: null, state: 'claimed', stateVersion: 2, authorizedAt: null,
    claimId: CLAIM, fence: 1, leaseUntil: '2026-09-24T12:01:30.000Z', cancelRequested: false, lastReceiptSequence: 4, receiptChainHead: 'h',
    terminalAt: null, terminalReasonCode: null, createdAt: 'x', updatedAt: 'x', ...over }
}

function codeStore(over: Record<string, unknown> = {}) {
  const repos: Record<string, string> = { [WORK]: REPO, [OTHER_WORK]: REPO, [FOREIGN_WORK]: 'github.com/someone/else' }
  return {
    discoverClaimable: vi.fn(async () => [{ workId: WORK, repositoryId: REPO, pinnedBaseSha: BASE_SHA }]),
    repositoryIdForWork: vi.fn(async (workId: string) => repos[workId] ?? null),
    claim: vi.fn(async () => runOf()),
    recoverClaimCredential: vi.fn(async () => runOf()),
    heartbeat: vi.fn(async () => runOf({ leaseUntil: '2026-09-24T12:03:00.000Z' })),
    ...over,
  }
}

interface SignOptions { counter?: number; jti?: string; timestamp?: string; privateKey?: typeof key.privateKey; signPath?: string; signBody?: string; brokerId?: string; hostId?: string; build?: string }
function signedRequest(route: string, body: string, o: SignOptions = {}): Request {
  const path = `/api/atlas/code-work/broker/${route}`
  const headers = { brokerId: o.brokerId ?? BROKER, hostId: o.hostId ?? HOST, protocolVersion: 1, brokerVersion: '0.1.0', buildSha256: o.build ?? BUILD,
    counter: o.counter ?? 1, jti: o.jti ?? randomUUID(), timestamp: o.timestamp ?? NOW.toISOString() }
  const payload = canonicalRequestPayload({ ...headers, method: 'POST', path: o.signPath ?? path, bodySha256: sha256Hex(o.signBody ?? body) })
  const signature = sign('sha256', Buffer.from(payload), { key: o.privateKey ?? key.privateKey, dsaEncoding: 'der' }).toString('base64url')
  return new Request(`${ORIGIN}${path}`, { method: 'POST', body, headers: {
    'x-omnira-broker-id': headers.brokerId, 'x-omnira-broker-host-id': headers.hostId, 'x-omnira-broker-protocol': '1',
    'x-omnira-broker-version': '0.1.0', 'x-omnira-broker-build-sha256': headers.buildSha256, 'x-omnira-broker-counter': String(headers.counter),
    'x-omnira-broker-jti': headers.jti, 'x-omnira-broker-timestamp': headers.timestamp, 'x-omnira-broker-signature': signature } })
}

const TOKEN = issueBrokerClaimCredential(WORK, () => Buffer.alloc(32, 9)).token
const BODIES: Record<ControlOperation, { route: string; body: string }> = {
  discover: { route: 'discover', body: '{}' },
  claim: { route: 'claim', body: JSON.stringify({ workId: WORK }) },
  recover: { route: 'claim/recover', body: JSON.stringify({ workId: WORK }) },
  heartbeat: { route: 'heartbeat', body: JSON.stringify({ workId: WORK, claimId: CLAIM, fence: 1, claimToken: TOKEN }) },
}
const OPS = Object.keys(BODIES) as ControlOperation[]
const call = (op: ControlOperation, request: Request, store = new MemoryBrokerStore(), work = codeStore(), random?: (n: number) => Buffer) =>
  handleControlRequest(request, op, { auth: { store, policy, now }, store: work as never, random })
const json = async (response: Response) => JSON.parse(await response.text()) as Record<string, unknown>

describe('SDF-1C2 every operation passes the existing signed-request boundary', () => {
  for (const op of OPS) {
    const { route, body } = BODIES[op]
    it(`${op}: accepts a valid signed request and marks the response no-store`, async () => {
      const response = await call(op, signedRequest(route, body))
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
    })
    it(`${op}: rejects an altered body, altered workId, wrong path, stale/duplicate counter, jti reuse, stale timestamp, wrong key, wrong build and a revoked broker`, async () => {
      const denied = async (request: Request, store = new MemoryBrokerStore()) => {
        const work = codeStore(); const response = await call(op, request, store, work)
        expect(response.status).toBe(401); expect(await json(response)).toEqual({ ok: false, error: 'broker_auth_rejected' })
        expect(response.headers.get('cache-control')).toBe('no-store')
        for (const fn of Object.values(work)) expect(fn).not.toHaveBeenCalled()
      }
      const altered = op === 'discover' ? '{"x":1}' : body.replace(WORK, OTHER_WORK)
      await denied(signedRequest(route, altered, { signBody: body }))
      await denied(signedRequest(route, body, { signPath: '/api/atlas/code-work/broker/identity' }))
      await denied(signedRequest(route, body, { counter: 1 }), new MemoryBrokerStore(brokerRow({ requestCounter: 1 })))
      await denied(signedRequest(route, body, { counter: 5 }))
      const jti = randomUUID()
      await denied(signedRequest(route, body, { counter: 2, jti }), new MemoryBrokerStore(brokerRow({ requestCounter: 1, lastRequestJti: jti })))
      await denied(signedRequest(route, body, { timestamp: new Date(NOW.getTime() - 121_000).toISOString() }))
      await denied(signedRequest(route, body, { timestamp: new Date(NOW.getTime() + 121_000).toISOString() }))
      await denied(signedRequest(route, body, { privateKey: otherKey.privateKey }))
      await denied(signedRequest(route, body, { build: 'c'.repeat(64) }))
      await denied(signedRequest(route, body), new MemoryBrokerStore(brokerRow({ status: 'revoked', revokedAt: NOW.toISOString(), revokedBy: OWNER, revokedReason: 'operator_revoked' })))
      await denied(signedRequest(route, body, { brokerId: OTHER_BROKER }))
      await denied(signedRequest(route, body, { hostId: OTHER_HOST }))
    })
    it(`${op}: the same signed request cannot be replayed`, async () => {
      const store = new MemoryBrokerStore(); const request = signedRequest(route, body)
      expect((await call(op, request.clone(), store)).status).toBe(200)
      expect((await call(op, request.clone(), store)).status).toBe(401)
    })
  }
})

describe('SDF-1C2 discovery', () => {
  it('returns only the closed three-field shape, whatever the store returns', async () => {
    const work = codeStore({ discoverClaimable: vi.fn(async () => [{ workId: WORK, repositoryId: REPO, pinnedBaseSha: BASE_SHA, admission: { secret: 'x' }, projectId: 'p', token: 't' }]) })
    const response = await call('discover', signedRequest('discover', '{}'), new MemoryBrokerStore(), work)
    const body = await json(response)
    expect(body).toEqual({ ok: true, work: [{ workId: WORK, repositoryId: REPO, pinnedBaseSha: BASE_SHA }] })
    expect(JSON.stringify(body)).not.toMatch(/admission|project|secret|token|receipt|mission|delegation/i)
  })

  it('takes the repository scope from the stored broker identity and never from the request', async () => {
    const work = codeStore()
    await call('discover', signedRequest('discover', '{}'), new MemoryBrokerStore(brokerRow({ allowedRepositoryIds: [REPO] })), work)
    expect(work.discoverClaimable).toHaveBeenCalledWith([REPO], 20)
    for (const body of ['{"repositoryId":"github.com/other/repo"}', '{"repositoryIds":["x"]}', '[]', '"x"', 'null', '{"limit":100}']) {
      const rejected = await call('discover', signedRequest('discover', body), new MemoryBrokerStore(), codeStore())
      expect(rejected.status, body).toBe(400)
    }
  })

  it('is bounded to 20 results and changes no CodeWork authority state', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ workId: `50000000-0000-4000-8000-${String(100 + i).padStart(12, '0')}`, repositoryId: REPO, pinnedBaseSha: BASE_SHA }))
    const work = codeStore({ discoverClaimable: vi.fn(async () => many) })
    const body = await json(await call('discover', signedRequest('discover', '{}'), new MemoryBrokerStore(), work))
    expect((body.work as unknown[]).length).toBe(20)
    expect(work.claim).not.toHaveBeenCalled(); expect(work.recoverClaimCredential).not.toHaveBeenCalled(); expect(work.heartbeat).not.toHaveBeenCalled()
  })

  it('reports an unavailable read generically', async () => {
    const work = codeStore({ discoverClaimable: vi.fn(async () => { throw new Error('boom secret-detail') }) })
    const response = await call('discover', signedRequest('discover', '{}'), new MemoryBrokerStore(), work)
    expect(response.status).toBe(503)
    expect(JSON.stringify(await json(response))).not.toContain('secret-detail')
  })
})

describe('SDF-1C2 claim', () => {
  it('claims with identity taken from the authenticated principal and returns the raw token once', async () => {
    const random = () => Buffer.alloc(32, 7)
    const work = codeStore(); const response = await call('claim', signedRequest('claim', BODIES.claim.body), new MemoryBrokerStore(), work, random)
    const body = await json(response)
    const token = Buffer.alloc(32, 7).toString('base64url')
    expect(body).toEqual({ ok: true, workId: WORK, claimId: CLAIM, fence: 1, leaseUntil: '2026-09-24T12:01:30.000Z', claimToken: token })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(work.claim).toHaveBeenCalledTimes(1)
    expect(work.claim).toHaveBeenCalledWith(WORK, BROKER, HOST, brokerClaimTokenHash(WORK, token))
    expect(JSON.stringify(work.claim.mock.calls)).not.toContain(token)
    expect(JSON.stringify(body)).not.toMatch(/admission|must-not-leak|tokenHash|projectId/)
  })

  it('never accepts broker id, host id, repository, project, fence, claim id, lease or token hash from the body', async () => {
    for (const extra of ['brokerId', 'hostId', 'repositoryId', 'projectId', 'fence', 'claimId', 'leaseUntil', 'tokenHash', 'brokerTokenHash']) {
      const work = codeStore()
      const response = await call('claim', signedRequest('claim', JSON.stringify({ workId: WORK, [extra]: 'x' })), new MemoryBrokerStore(), work)
      expect(response.status, extra).toBe(400); expect(work.claim).not.toHaveBeenCalled()
    }
  })

  it('treats unknown, foreign-repository and unclaimable work identically', async () => {
    const seen: string[] = []
    const cases: Array<[string, ReturnType<typeof codeStore>]> = [
      [OTHER_WORK, codeStore({ claim: vi.fn(async () => { throw new Error('code-work run is not claimable') }) })],
      ['50000000-0000-4000-8000-0000000000ff', codeStore()],
      [FOREIGN_WORK, codeStore()],
      [WORK, codeStore({ claim: vi.fn(async () => runOf({ state: 'cancelled', claimId: null, leaseUntil: null })) })],
    ]
    for (const [workId, work] of cases) {
      const response = await call('claim', signedRequest('claim', JSON.stringify({ workId })), new MemoryBrokerStore(), work)
      seen.push(`${response.status}:${JSON.stringify(await json(response))}`)
    }
    expect(new Set(seen)).toEqual(new Set(['404:{"ok":false,"error":"not_available"}']))
  })

  it('enforces the broker repository allowlist before the database is asked (and never trusts the run to carry it)', async () => {
    const work = codeStore()
    const scoped = new MemoryBrokerStore(brokerRow({ allowedRepositoryIds: ['github.com/someone/else'] }))
    const response = await call('claim', signedRequest('claim', BODIES.claim.body), scoped, work)
    expect(response.status).toBe(404); expect(work.claim).not.toHaveBeenCalled()
    const recovered = await call('recover', signedRequest('claim/recover', BODIES.recover.body), new MemoryBrokerStore(brokerRow({ allowedRepositoryIds: ['github.com/someone/else'] })), work)
    expect(recovered.status).toBe(404); expect(work.recoverClaimCredential).not.toHaveBeenCalled()
    const none = await call('claim', signedRequest('claim', BODIES.claim.body), new MemoryBrokerStore(brokerRow({ allowedRepositoryIds: [] })), work)
    expect(none.status).toBe(404)
  })

  it('never echoes a token or body detail in an error, and logs nothing', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(name => vi.spyOn(console, name).mockImplementation(() => undefined))
    const work = codeStore({ claim: vi.fn(async () => { throw new Error(`leaked ${TOKEN} detail`) }) })
    const response = await call('claim', signedRequest('claim', BODIES.claim.body), new MemoryBrokerStore(), work, () => Buffer.alloc(32, 7))
    expect(await response.text()).not.toMatch(/leaked|detail|[A-Za-z0-9_-]{43}/)
    for (const spy of spies) { expect(spy).not.toHaveBeenCalled(); spy.mockRestore() }
  })
})

describe('SDF-1C2 lost-response recovery', () => {
  it('re-hands a FRESH token for the SAME claim through the recovery route and forwards only its hash', async () => {
    const claimRandom = () => Buffer.alloc(32, 1); const recoverRandom = () => Buffer.alloc(32, 2)
    const work = codeStore()
    const first = await json(await call('claim', signedRequest('claim', BODIES.claim.body, { counter: 1 }), new MemoryBrokerStore(), work, claimRandom))
    // The response above is treated as LOST; the same device recovers.
    const store = new MemoryBrokerStore(brokerRow({ requestCounter: 1 }))
    const response = await call('recover', signedRequest('claim/recover', BODIES.recover.body, { counter: 2 }), store, work, recoverRandom)
    const second = await json(response)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(second.claimId).toBe(first.claimId); expect(second.fence).toBe(first.fence); expect(second.leaseUntil).toBe(first.leaseUntil)
    expect(second.claimToken).toBe(Buffer.alloc(32, 2).toString('base64url')); expect(second.claimToken).not.toBe(first.claimToken)
    expect(work.recoverClaimCredential).toHaveBeenCalledWith(WORK, BROKER, HOST, brokerClaimTokenHash(WORK, second.claimToken as string))
    expect(JSON.stringify(work.recoverClaimCredential.mock.calls)).not.toContain(second.claimToken as string)
    expect(work.claim).toHaveBeenCalledTimes(1)             // recovery never creates a claim
  })

  it('answers a refused recovery exactly like an unknown work item', async () => {
    const refused = codeStore({ recoverClaimCredential: vi.fn(async () => { throw new Error('claim credential is not recoverable') }) })
    const settled = codeStore({ recoverClaimCredential: vi.fn(async () => runOf({ state: 'timeout', claimId: null, leaseUntil: null })) })
    const seen = new Set<string>()
    for (const work of [refused, settled, codeStore({ repositoryIdForWork: vi.fn(async () => null) })]) {
      const response = await call('recover', signedRequest('claim/recover', BODIES.recover.body), new MemoryBrokerStore(), work)
      seen.add(`${response.status}:${JSON.stringify(await json(response))}`)
    }
    expect(seen).toEqual(new Set(['404:{"ok":false,"error":"not_available"}']))
  })
})

describe('SDF-1C2 heartbeat', () => {
  it('hashes the raw token, sends only the hash with the principal identity, and returns non-secret claim state', async () => {
    const work = codeStore(); const response = await call('heartbeat', signedRequest('heartbeat', BODIES.heartbeat.body), new MemoryBrokerStore(), work)
    const body = await json(response)
    expect(body).toEqual({ ok: true, workId: WORK, claimId: CLAIM, fence: 1, leaseUntil: '2026-09-24T12:03:00.000Z', state: 'claimed' })
    expect(work.heartbeat).toHaveBeenCalledWith(WORK, CLAIM, 1, BROKER, HOST, brokerClaimTokenHash(WORK, TOKEN))
    expect(JSON.stringify(work.heartbeat.mock.calls)).not.toContain(TOKEN)
    expect(JSON.stringify(body)).not.toContain(TOKEN)
  })

  it('rejects malformed tokens and ids before any database call', async () => {
    const good = { workId: WORK, claimId: CLAIM, fence: 1, claimToken: TOKEN }
    const bad: unknown[] = [
      { ...good, claimToken: TOKEN.slice(1) }, { ...good, claimToken: `${TOKEN}A` }, { ...good, claimToken: '' }, { ...good, claimToken: 5 },
      { ...good, workId: 'x' }, { ...good, claimId: 'x' }, { ...good, fence: 0 }, { ...good, fence: -1 }, { ...good, fence: 1.5 }, { ...good, fence: '1' },
      { ...good, extra: 1 }, { workId: WORK }, [], null,
    ]
    for (const value of bad) {
      const work = codeStore()
      const response = await call('heartbeat', signedRequest('heartbeat', JSON.stringify(value)), new MemoryBrokerStore(), work)
      expect(response.status, JSON.stringify(value)).toBe(400); expect(work.heartbeat).not.toHaveBeenCalled()
      expect(await response.text()).not.toContain(TOKEN)
    }
  })

  it('answers every non-live claim (wrong token, cancelled, expired, error) with one closed stop signal', async () => {
    const seen = new Set<string>()
    for (const heartbeatImpl of [
      vi.fn(async () => { throw new Error('stale code-work fence') }),
      vi.fn(async () => runOf({ state: 'cancelled', claimId: null, leaseUntil: null })),
      vi.fn(async () => runOf({ cancelRequested: true })),
      vi.fn(async () => runOf({ fence: 9 })),
      vi.fn(async () => { throw new Error(`db down ${TOKEN}`) }),
    ]) {
      const response = await call('heartbeat', signedRequest('heartbeat', BODIES.heartbeat.body), new MemoryBrokerStore(), codeStore({ heartbeat: heartbeatImpl }))
      seen.add(`${response.status}:${await response.text()}`)
    }
    expect(seen).toEqual(new Set(['409:{"ok":false,"error":"claim_not_live"}']))
  })
})

describe('SDF-1C2 HTTP hygiene', () => {
  it('bounds the body before reading further and fails closed on oversized or malformed bodies', async () => {
    const big = JSON.stringify({ workId: WORK, pad: 'x'.repeat(CONTROL_BODY_LIMIT_BYTES) })
    expect((await call('claim', signedRequest('claim', big))).status).toBe(413)
    expect(await readBoundedBody(new Request(ORIGIN, { method: 'POST', body: 'x'.repeat(CONTROL_BODY_LIMIT_BYTES + 1) }), CONTROL_BODY_LIMIT_BYTES)).toBeNull()
    expect(await readBoundedBody(new Request(ORIGIN, { method: 'POST', body: 'abc' }), CONTROL_BODY_LIMIT_BYTES)).toBe('abc')
    expect((await call('claim', signedRequest('claim', '{not json'))).status).toBe(400)
    expect((await call('claim', signedRequest('claim', ''))).status).toBe(400)
    expect(parseWorkIdBody('{"workId":"' + WORK.toUpperCase() + '"}')).toEqual({ workId: WORK })
    expect(parseWorkIdBody('{"workId":"nope"}')).toBeNull()
    expect(parseDiscoverBody('{}')).not.toBeNull(); expect(parseDiscoverBody('{"a":1}')).toBeNull()
    expect(parseHeartbeatBody(BODIES.heartbeat.body)?.fence).toBe(1)
  })
})

// ── The local broker's protocol client, end-to-end against the real server boundary ────────────
const signer = {
  generateIdentity: async () => { throw new Error('unused') }, getPublicIdentity: async () => { throw new Error('unused') },
  verifyLocalIdentityAvailable: async () => true,
  signCanonicalPayload: async (_id: string, payload: string) => sign('sha256', Buffer.from(payload), { key: key.privateKey, dsaEncoding: 'der' }).toString('base64url'),
}
function clientFor(handlerFor: (request: Request) => Promise<Response>, origin = ORIGIN): { ctx: OperationalContext; sent: Array<{ url: string; init: RequestInit }> } {
  const sent: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl = (async (url: URL, init: RequestInit) => { sent.push({ url: String(url), init }); return handlerFor(new Request(String(url), init)) }) as unknown as typeof fetch
  return { ctx: { origin, brokerId: BROKER, hostId: HOST, protocolVersion: 1, brokerVersion: '0.1.0', buildSha256: BUILD, identityId: randomUUID(), signer, fetchImpl }, sent }
}

describe('SDF-1C2 local protocol client', () => {
  // The client stamps real time; the server boundary under test runs on the fixed clock.
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW) })
  afterEach(() => { vi.useRealTimers() })

  it('signs and sends the exact same body string for every operation, verified by the real server boundary', async () => {
    const work = codeStore(); const store = new MemoryBrokerStore()
    const routes: Record<string, ControlOperation> = { [OPERATIONAL_PATHS.discover]: 'discover', [OPERATIONAL_PATHS.claim]: 'claim', [OPERATIONAL_PATHS.recover]: 'recover', [OPERATIONAL_PATHS.heartbeat]: 'heartbeat' }
    const { ctx, sent } = clientFor(request => call(routes[new URL(request.url).pathname], request, store, work, () => Buffer.alloc(32, 4)))
    const discovered = await discoverWork(ctx, 1)
    const claimed = await claimWork(ctx, 2, WORK)
    const recovered = await recoverClaim(ctx, 3, WORK)
    expect(claimed.body.ok && recovered.body.ok).toBe(true)
    if (!recovered.body.ok) return
    const beat = await heartbeat(ctx, 4, { workId: WORK, claimId: recovered.body.claimId, fence: recovered.body.fence, claimToken: recovered.body.claimToken })
    expect(discovered.body).toEqual({ ok: true, work: [{ workId: WORK, repositoryId: REPO, pinnedBaseSha: BASE_SHA }] })
    expect(beat.body.ok).toBe(true)
    expect([discovered, claimed, recovered, beat].map(result => result.httpStatus)).toEqual([200, 200, 200, 200])
    expect([discovered, claimed, recovered, beat].map(result => result.requestCounter)).toEqual([1, 2, 3, 4])
    for (const request of sent) {
      expect(typeof request.init.body).toBe('string')
      expect(request.init.redirect).toBe('error')
      expect(request.init.method).toBe('POST')
    }
    expect(sent.map(request => new URL(request.url).pathname)).toEqual([OPERATIONAL_PATHS.discover, OPERATIONAL_PATHS.claim, OPERATIONAL_PATHS.recover, OPERATIONAL_PATHS.heartbeat])
  })

  it('cannot reach any path outside the closed operational allowlist', () => {
    expect(Object.values(OPERATIONAL_PATHS).sort()).toEqual([
      '/api/atlas/code-work/broker/claim', '/api/atlas/code-work/broker/claim/recover',
      '/api/atlas/code-work/broker/discover', '/api/atlas/code-work/broker/heartbeat',
    ])
    expect(Object.isFrozen(OPERATIONAL_PATHS)).toBe(true)
    const source = readFileSync(resolve(ROOT, 'apps/code-broker/src/protocol/operational-client.ts'), 'utf8')
    expect(source).not.toMatch(/path\s*:\s*string|operation\s*:\s*string|new URL\((?!path|origin|ctx\.origin)/)
  })

  it('requires https for operational calls, allowing http only for an explicit loopback development origin', () => {
    for (const origin of ['https://omnira.test', 'https://omnira.test/', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
      expect(() => assertOperationalOrigin(origin), origin).not.toThrow()
    }
    for (const origin of ['http://omnira.test', 'http://10.0.0.5', 'http://localhost.evil.test', 'http://evil.localhost', 'ftp://omnira.test', 'file:///etc/passwd',
      'https://user:pw@omnira.test', 'https://omnira.test/x', 'https://omnira.test/?a=1', 'https://omnira.test/#x', 'omnira.test', '']) {
      expect(() => assertOperationalOrigin(origin), origin).toThrow()
    }
  })

  it('refuses plaintext remote origins before anything is signed or sent', async () => {
    const { ctx, sent } = clientFor(async () => new Response('{}'), 'http://omnira.test')
    for (const operation of [() => claimWork(ctx, 1, WORK), () => recoverClaim(ctx, 2, WORK), () => discoverWork(ctx, 3),
      () => heartbeat(ctx, 4, { workId: WORK, claimId: CLAIM, fence: 1, claimToken: TOKEN })]) await expect(operation()).rejects.toThrow(/https/)
    expect(sent).toHaveLength(0)
  })

  it('refuses malformed handles and counters before signing', async () => {
    const { ctx, sent } = clientFor(async () => new Response('{}'))
    await expect(claimWork(ctx, 0, WORK)).rejects.toThrow(); await expect(claimWork(ctx, 1.5, WORK)).rejects.toThrow()
    await expect(claimWork(ctx, 1, 'nope')).rejects.toThrow()
    await expect(heartbeat(ctx, 1, { workId: WORK, claimId: CLAIM, fence: 1, claimToken: 'short' })).rejects.toThrow()
    await expect(heartbeat(ctx, 1, { workId: WORK, claimId: CLAIM, fence: 0, claimToken: TOKEN })).rejects.toThrow()
    expect(sent).toHaveLength(0)
  })

  it('treats a malformed or hostile server response as a closed refusal, never as a claim', async () => {
    for (const payload of ['not json', '{"ok":true}', '{"ok":true,"workId":"x"}', JSON.stringify({ ok: true, workId: WORK, claimId: CLAIM, fence: 1, leaseUntil: 'x', claimToken: 'short' }), '{"ok":false,"error":"' + 'x'.repeat(500) + '"}']) {
      const { ctx } = clientFor(async () => new Response(payload, { status: 200 }))
      const result = await claimWork(ctx, 1, WORK)
      expect(result.body.ok).toBe(false)
      if (!result.body.ok) expect(result.body.error.length).toBeLessThanOrEqual(64)
    }
  })
})

describe('SDF-1C2 hostile server responses are refused by the local broker (fail closed)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW) })
  afterEach(() => { vi.useRealTimers() })

  const LEASE = '2026-09-24T12:01:30.000Z'
  const LETTERED = 'abcdef00-0000-4000-8000-00000000000a'   // has hex letters, so upper-casing really changes it
  const item = (over: Record<string, unknown> = {}) => ({ workId: WORK, repositoryId: REPO, pinnedBaseSha: BASE_SHA, ...over })
  const claimPayload = (over: Record<string, unknown> = {}) => ({ ok: true, workId: WORK, claimId: CLAIM, fence: 1, leaseUntil: LEASE, claimToken: TOKEN, ...over })
  const beatPayload = (over: Record<string, unknown> = {}) => ({ ok: true, workId: WORK, claimId: CLAIM, fence: 1, leaseUntil: LEASE, state: 'claimed', ...over })
  const respond = (payload: unknown) => clientFor(async () => new Response(JSON.stringify(payload), { status: 200 })).ctx
  const invalid = { ok: false, error: 'invalid_response' }

  // A non-canonical alias of a valid token: same 43 chars, same bytes, but the last symbol carries
  // non-zero padding bits, so decode → re-encode does not reproduce it.
  const alias = (() => {
    const canonical = Buffer.alloc(32, 9).toString('base64url')
    const last = canonical[42]; const other = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('').find(c => c !== last && Buffer.from(canonical.slice(0, 42) + c, 'base64url').equals(Buffer.alloc(32, 9)))!
    return canonical.slice(0, 42) + other
  })()

  it('accepts the well-formed shape of every operation (so the refusals below are meaningful)', async () => {
    expect((await discoverWork(respond({ ok: true, work: [item()] }), 1)).body).toEqual({ ok: true, work: [item()] })
    expect((await claimWork(respond(claimPayload()), 2, WORK)).body.ok).toBe(true)
    expect((await recoverClaim(respond(claimPayload()), 3, WORK)).body.ok).toBe(true)
    for (const state of CODE_WORK_RESPONSE_STATES) expect((await heartbeat(respond(beatPayload({ state })), 4, { workId: WORK, claimId: CLAIM, fence: 1, claimToken: TOKEN })).body.ok, state).toBe(true)
    expect((await discoverWork(respond({ ok: true, work: Array.from({ length: DISCOVERY_MAX_ITEMS }, () => item())}), 5)).body.ok).toBe(true)
    expect((await discoverWork(respond({ ok: true, work: [] }), 6)).body.ok).toBe(true)
  })

  it('DISCOVER: refuses invalid uuid, hostile/empty repository, bad SHA (upper, 39, 41, non-hex) and more than 20 items', async () => {
    const bad: Array<[string, unknown]> = [
      ['invalid uuid', item({ workId: 'not-a-uuid' })], ['uppercase uuid', item({ workId: LETTERED.toUpperCase() })], ['non-string uuid', item({ workId: 7 })],
      ['empty repository', item({ repositoryId: '' })], ['newline repository', item({ repositoryId: 'github.com/a/b\ngithub.com/c/d' })],
      ['carriage return repository', item({ repositoryId: 'github.com/a/b\r' })], ['NUL repository', item({ repositoryId: 'github.com/a\u0000b' })],
      ['tab repository', item({ repositoryId: 'github.com/a\tb' })], ['space repository', item({ repositoryId: 'github.com/a b' })],
      ['DEL repository', item({ repositoryId: 'github.com/a\u007fb' })], ['oversized repository', item({ repositoryId: 'r'.repeat(201) })], ['non-string repository', item({ repositoryId: 5 })],
      ['uppercase sha', item({ pinnedBaseSha: BASE_SHA.toUpperCase() })], ['39-char sha', item({ pinnedBaseSha: BASE_SHA.slice(0, 39) })],
      ['41-char sha', item({ pinnedBaseSha: `${BASE_SHA}a` })], ['non-hex sha', item({ pinnedBaseSha: `${BASE_SHA.slice(0, 39)}g` })], ['missing sha', { workId: WORK, repositoryId: REPO }],
      ['64-char sha', item({ pinnedBaseSha: 'a'.repeat(64) })], ['non-object item', 'x'],
    ]
    for (const [name, entry] of bad) expect((await discoverWork(respond({ ok: true, work: [entry] }), 1)).body, name).toEqual(invalid)
    // one bad item poisons the whole page
    expect((await discoverWork(respond({ ok: true, work: [item(), item({ pinnedBaseSha: 'zz' })] }), 1)).body).toEqual(invalid)
    expect((await discoverWork(respond({ ok: true, work: Array.from({ length: DISCOVERY_MAX_ITEMS + 1 }, () => item()) }), 1)).body).toEqual(invalid)
    expect((await discoverWork(respond({ ok: true, work: Array.from({ length: 500 }, () => item()) }), 1)).body).toEqual(invalid)
    expect((await discoverWork(respond({ ok: true, work: 'x' }), 1)).body).toEqual(invalid)
    expect((await discoverWork(respond({ ok: true }), 1)).body).toEqual(invalid)
  })

  it('CLAIM and RECOVERY: refuse invalid uuids, fence 0/fractional/unsafe, bad leaseUntil and every non-canonical token', async () => {
    const bad: Array<[string, Record<string, unknown>]> = [
      ['invalid workId', { workId: 'x' }], ['invalid claimId', { claimId: 'x' }], ['uppercase claimId', { claimId: LETTERED.toUpperCase() }], ['missing claimId', { claimId: undefined }],
      ['fence 0', { fence: 0 }], ['negative fence', { fence: -1 }], ['fractional fence', { fence: 1.5 }], ['string fence', { fence: '1' }],
      ['unsafe fence', { fence: Number.MAX_SAFE_INTEGER + 2 }], ['NaN-ish fence', { fence: null }],
      ['invalid leaseUntil', { leaseUntil: 'not-a-time' }], ['empty leaseUntil', { leaseUntil: '' }], ['numeric leaseUntil', { leaseUntil: 1790000000000 }], ['null leaseUntil', { leaseUntil: null }],
      ['month 13 leaseUntil', { leaseUntil: '2026-13-45T25:61:61.000Z' }],
      ['short token', { claimToken: TOKEN.slice(1) }], ['long token', { claimToken: `${TOKEN}A` }], ['padded token', { claimToken: `${TOKEN.slice(0, 42)}=` }],
      ['padded 44-char token', { claimToken: `${TOKEN}=` }], ['standard-alphabet token', { claimToken: Buffer.alloc(32, 0xfb).toString('base64').replace(/=+$/, '') }],
      ['non-canonical base64url alias', { claimToken: alias }], ['empty token', { claimToken: '' }], ['numeric token', { claimToken: 5 }], ['missing token', { claimToken: undefined }],
      ['token with whitespace', { claimToken: `${TOKEN.slice(0, 42)} ` }],
    ]
    for (const [name, over] of bad) {
      expect((await claimWork(respond(claimPayload(over)), 1, WORK)).body, `claim: ${name}`).toEqual(invalid)
      expect((await recoverClaim(respond(claimPayload(over)), 2, WORK)).body, `recover: ${name}`).toEqual(invalid)
    }
    expect((await claimWork(respond({ ok: true }), 1, WORK)).body).toEqual(invalid)
  })

  it('token validation is decode → 32 bytes → re-encode, not a length/alphabet regex', () => {
    expect(alias).not.toBe(Buffer.alloc(32, 9).toString('base64url'))
    expect(/^[A-Za-z0-9_-]{43}$/.test(alias)).toBe(true)        // the weak check would accept it …
    expect(Buffer.from(alias, 'base64url').length).toBe(32)      // … it even decodes to 32 bytes …
    expect(isCanonicalClaimToken(alias)).toBe(false)             // … but it is not the canonical encoding
    expect(isCanonicalClaimToken(Buffer.alloc(32, 9).toString('base64url'))).toBe(true)
    expect(isCanonicalClaimToken(Buffer.alloc(31, 9).toString('base64url'))).toBe(false)
    expect(isCanonicalClaimToken(Buffer.alloc(33, 9).toString('base64url'))).toBe(false)
  })

  it('HEARTBEAT: refuses invalid uuids, fence 0/fractional, invalid leaseUntil and any state outside the closed vocabulary', async () => {
    const bad: Array<[string, Record<string, unknown>]> = [
      ['invalid workId', { workId: 'x' }], ['invalid claimId', { claimId: 'x' }], ['fence 0', { fence: 0 }], ['fractional fence', { fence: 2.5 }], ['string fence', { fence: '1' }],
      ['invalid leaseUntil', { leaseUntil: 'soon' }], ['empty leaseUntil', { leaseUntil: '' }], ['null leaseUntil', { leaseUntil: null }],
      ['unknown state', { state: 'exploded' }], ['empty state', { state: '' }], ['uppercase state', { state: 'CLAIMED' }], ['numeric state', { state: 3 }], ['missing state', { state: undefined }],
      ['state with newline', { state: 'claimed\n' }], ['prototype-ish state', { state: 'constructor' }],
    ]
    for (const [name, over] of bad) {
      expect((await heartbeat(respond(beatPayload(over)), 1, { workId: WORK, claimId: CLAIM, fence: 1, claimToken: TOKEN })).body, name).toEqual(invalid)
    }
  })

  it('malformed refusals never surface hostile server text (error codes are a closed lowercase token or invalid_response)', async () => {
    for (const error of ['<script>x</script>', 'a'.repeat(300), 'Bad Value', 'line\nbreak', '']) {
      const result = await claimWork(respond({ ok: false, error }), 1, WORK)
      expect(result.body).toEqual(invalid)
    }
    expect((await claimWork(respond({ ok: false, error: 'not_available' }), 1, WORK)).body).toEqual({ ok: false, error: 'not_available' })
  })

  it('the client state vocabulary is exactly the canonical CodeWork lifecycle (no drift)', () => {
    expect([...CODE_WORK_RESPONSE_STATES].sort()).toEqual([...CODE_WORK_NON_TERMINAL_STATES, ...CODE_WORK_TERMINAL_STATES].sort())
    expect(Object.isFrozen(CODE_WORK_RESPONSE_STATES)).toBe(true)
  })

  it('a refused claim response never yields a claim handle for the ordering tracker', async () => {
    const tracker = new ClaimHandleTracker()
    const result = await claimWork(respond(claimPayload({ claimToken: alias })), 9, WORK)
    expect(result.body.ok).toBe(false)
    if (result.body.ok) tracker.offer({ requestCounter: result.requestCounter, ...result.body })
    expect(tracker.handle).toBeNull()
  })
})

describe('SDF-1C2 response ordering (newer broker request counter wins)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW) })
  afterEach(() => { vi.useRealTimers() })

  const handle = (over: Partial<ClaimHandle>): ClaimHandle => ({ requestCounter: 1, workId: WORK, claimId: CLAIM, fence: 1, leaseUntil: '2026-09-24T12:01:30.000Z', claimToken: 'T'.repeat(43), ...over })

  it('a delayed response to claim N does not replace the state from recovery N+1', () => {
    const tracker = new ClaimHandleTracker()
    const recovered = handle({ requestCounter: 7, claimToken: 'R'.repeat(43) })
    expect(tracker.offer(recovered)).toBe('accepted')                                  // N+1 arrives first
    expect(tracker.offer(handle({ requestCounter: 6, claimToken: 'C'.repeat(43) }))).toBe('stale')   // the late ORIGINAL claim response (N)
    expect(tracker.handle?.claimToken).toBe('R'.repeat(43)); expect(tracker.handle?.requestCounter).toBe(7)
  })

  it('in-order responses advance the handle; equal counters are stale; another claim or fence is never adopted', () => {
    const tracker = new ClaimHandleTracker()
    expect(tracker.offer(handle({ requestCounter: 6, claimToken: 'C'.repeat(43) }))).toBe('accepted')
    expect(tracker.offer(handle({ requestCounter: 7, claimToken: 'R'.repeat(43) }))).toBe('accepted')
    expect(tracker.offer(handle({ requestCounter: 7, claimToken: 'X'.repeat(43) }))).toBe('stale')
    expect(tracker.offer(handle({ requestCounter: 9, claimId: OTHER_WORK }))).toBe('rejected')
    expect(tracker.offer(handle({ requestCounter: 9, fence: 2 }))).toBe('rejected')
    expect(tracker.offer(handle({ requestCounter: 9, workId: OTHER_WORK }))).toBe('rejected')
    expect(tracker.handle?.claimToken).toBe('R'.repeat(43))
  })

  it('every client result carries the counter that produced it so the rule is decidable', async () => {
    const { ctx } = clientFor(async () => new Response(JSON.stringify({ ok: true, workId: WORK, claimId: CLAIM, fence: 1, leaseUntil: '2026-09-24T12:01:30.000Z', claimToken: TOKEN }), { status: 200 }))
    const claim = await claimWork(ctx, 6, WORK); const recovery = await recoverClaim(ctx, 7, WORK)
    expect([claim.requestCounter, recovery.requestCounter]).toEqual([6, 7])
  })
})

describe('SDF-1C2 structural boundary', () => {
  const api = resolve(ROOT, 'apps/web/app/api/atlas/code-work/broker')
  const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name); return statSync(path).isDirectory() ? files(path) : /\.(?:ts|tsx)$/.test(name) ? [path] : []
  })

  it('exposes exactly the six purpose-specific broker routes and no generic boundary', () => {
    expect(files(api).map(file => file.slice(api.length + 1)).sort()).toEqual([
      'claim/recover/route.ts', 'claim/route.ts', 'discover/route.ts', 'enroll/route.ts', 'heartbeat/route.ts', 'identity/route.ts',
    ])
    for (const name of ['execute', 'tool', 'rpc', 'action', 'command', 'context', 'evidence', 'transition', 'preflight', 'patch', 'run', 'cancel', '[...path]', '[action]', '[op]']) {
      expect(existsSync(join(api, name)), name).toBe(false)
    }
    for (const file of files(api).filter(file => !/(enroll|identity)/.test(file))) {
      const source = readFileSync(file, 'utf8')
      expect(source).toMatch(/export async function POST/); expect(source).not.toMatch(/export async function (?:GET|PUT|PATCH|DELETE)/)
      expect(source).not.toMatch(/createAdminClient|createClient|SUPABASE|service_role/i)
    }
  })

  it('keeps the local CLI at generate | enroll | diagnostic and puts no service-role secret near the broker', () => {
    const cli = readFileSync(resolve(ROOT, 'apps/code-broker/src/cli.ts'), 'utf8')
    expect(cli).toContain("throw new Error('usage: generate | enroll | diagnostic')")
    expect(cli).not.toMatch(/claim|heartbeat|discover|recover|operational/i)
    const brokerSources = files(resolve(ROOT, 'apps/code-broker/src')).map(file => readFileSync(file, 'utf8')).join('\n')
    expect(brokerSources).not.toMatch(/SUPABASE|service[_-]?role|@supabase|createAdminClient|process\.env\.[A-Z_]*(?:KEY|SECRET|TOKEN)/i)
  })

  it('adds no execution, model, repository or filesystem capability anywhere in the control channel', () => {
    const sources = [
      ...files(resolve(ROOT, 'apps/web/lib/atlas/code-broker/control-channel')),
      ...files(api), resolve(ROOT, 'apps/code-broker/src/protocol/operational-client.ts'), resolve(ROOT, 'apps/code-broker/src/protocol/response-order.ts'),
    ].map(file => readFileSync(file, 'utf8')).join('\n')
    expect(sources).not.toMatch(/child_process|\b(?:spawn|exec|execFile|fork)\s*\(|from ['"](?:node:)?fs['"]|writeFile|mkdir|readFile/)
    expect(sources).not.toMatch(/@anthropic-ai|from ['"]openai['"]|\banthropic\b|claude-/i)
    expect(sources).not.toMatch(/git\s+(?:fetch|clone|worktree|commit|push|merge|apply|checkout)|gh\s+pr|vercel\s+(?:deploy|promote)|docker|apply[_-]?patch|command[_-]?runner|worker[_-]?invoke/i)
    expect(sources).not.toMatch(/\bconsole\.|\blogger\b/)
  })

  it('makes no operational route handler forward a body field as authority', () => {
    const dto = readFileSync(resolve(ROOT, 'apps/web/lib/atlas/code-broker/control-channel/dto.ts'), 'utf8')
    const operations = readFileSync(resolve(ROOT, 'apps/web/lib/atlas/code-broker/control-channel/operations.ts'), 'utf8')
    expect(dto).not.toMatch(/brokerId|hostId|repositoryId|projectId|tokenHash/)
    expect(operations).toMatch(/broker\.brokerId, broker\.hostId/)
    expect(operations).toMatch(/broker\.allowedRepositoryIds/)
    expect(operations).not.toMatch(/body\.(?:brokerId|hostId|repositoryId|projectId)/)
  })

  it('ships a new migration that leaves canonical history alone and is wired into the workflow with floors', () => {
    const migrations = resolve(ROOT, 'apps/web/supabase/migrations')
    const sql = readFileSync(join(migrations, '20260924140000_sdf1c2_broker_control_channel.sql'), 'utf8').replace(/--.*$/gm, '')
    expect(sql).toMatch(/drop function public\.atlas_code_work_heartbeat\(uuid, uuid, bigint\)/)
    expect(sql).toMatch(/atlas_code_work_recover_claim_credential/)
    expect(sql).not.toMatch(/create table|create extension|cron\.schedule|pg_net|\b(?:begin|commit)\s*;/i)
    expect(readdirSync(migrations).filter(name => name.includes('sdf1c2'))).toEqual(['20260924140000_sdf1c2_broker_control_channel.sql'])
    const workflow = readFileSync(resolve(ROOT, '.github/workflows/sdf1c-trusted-broker-boundary.yml'), 'utf8')
    for (const file of ['sdf1c2-broker-control-channel.test.ts', 'sdf1c2-broker-control-channel-sql.test.ts']) {
      expect(workflow).toContain(`lib/qa/${file}`); expect(workflow).toMatch(new RegExp(`\\['${file.replace(/\./g, '\\.')}', \\d+\\]`))
    }
  })
})
