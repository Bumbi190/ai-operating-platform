import { generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { approveBroker, beginBrokerEnrollment, revokeBroker } from '@/lib/atlas/code-broker/operator'
import { authenticateBrokerRequest, completeBrokerEnrollment, parseEnrollmentProof } from '@/lib/atlas/code-broker/principal'
import { brokerEnrollmentSecretHash, canonicalEnrollmentPayload, canonicalRequestPayload, sha256Hex } from '@/lib/atlas/code-broker/protocol'
import { publicJwkThumbprint } from '@/lib/atlas/code-broker/crypto'
import { brokerBuildAccepted, configuredBrokerBuildPolicy } from '@/lib/atlas/code-broker/policy'
import type { BrokerBuildPolicy } from '@/lib/atlas/code-broker/policy'
import type { AcceptRequestInput, BeginEnrollmentInput, BrokerStore, CompleteEnrollmentInput } from '@/lib/atlas/code-broker/store'
import type { BrokerPublicJwk, StoredBroker, StoredBrokerEnrollment } from '@/lib/atlas/code-broker/types'

const NOW = new Date('2026-09-19T08:00:00.000Z')
const OWNER = '10000000-0000-4000-8000-000000000001'
const FOREIGN = '10000000-0000-4000-8000-000000000002'
const ENROLLMENT = '20000000-0000-4000-8000-000000000001'
const HOST = '30000000-0000-4000-8000-000000000001'
const BROKER = '40000000-0000-4000-8000-000000000001'
const JTI = '50000000-0000-4000-8000-000000000001'
const BUILD = 'a'.repeat(64)
const CHALLENGE = 'challenge-value'
const PAIRING = 'A1B2C3D4'
const REPO = 'github.com/bumbi190/ai-operating-platform'

const keyA = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const keyB = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const publicJwk = keyA.publicKey.export({ format: 'jwk' }) as BrokerPublicJwk
const policy: BrokerBuildPolicy = { protocolVersion: 1, brokerVersion: '0.1.0', allowedBuildSha256: new Set([BUILD]), allowedRepositoryIds: [REPO] }
const operator = (userId = OWNER) => async () => ({ ok: true as const, userId, email: 'owner@omnira.test', actor: `user:${userId}` })
const now = () => NOW

class MemoryStore implements BrokerStore {
  enrollment: StoredBrokerEnrollment | null = enrollmentRow()
  broker: StoredBroker | null = null
  async beginEnrollment(input: BeginEnrollmentInput) {
    if (this.broker && ['pending', 'active'].includes(this.broker.status)) throw new Error('duplicate')
    if (this.enrollment?.state === 'issued') throw new Error('duplicate')
    this.enrollment = enrollmentRow({ enrollmentId: input.enrollmentId, requestedBy: input.requestedBy,
      hostId: input.hostId, challengeHash: input.challengeHash, pairingCodeHash: input.pairingCodeHash,
      expiresAt: input.expiresAt, allowedRepositoryIds: input.allowedRepositoryIds })
    return this.enrollment
  }
  async enrollmentById(id: string) { return this.enrollment?.enrollmentId === id ? this.enrollment : null }
  async brokerById(id: string) { return this.broker?.brokerId === id ? this.broker : null }
  async brokersByOwner(ownerId: string) { return this.broker?.ownerUserId === ownerId ? [this.broker] : [] }
  async openEnrollmentByOwner(ownerId: string) { return this.enrollment?.requestedBy === ownerId && this.enrollment.state === 'issued' ? this.enrollment : null }
  async completeEnrollment(input: CompleteEnrollmentInput) {
    if (!this.enrollment || this.enrollment.state !== 'issued' || this.broker?.keyThumbprint === input.keyThumbprint) throw new Error('reused')
    this.broker = brokerRow({ publicJwk: input.publicJwk, keyThumbprint: input.keyThumbprint,
      hostLabel: input.hostLabel, localUidHash: input.localUidHash, osVersion: input.osVersion,
      protocolVersion: input.protocolVersion, brokerVersion: input.brokerVersion, buildSha256: input.buildSha256 })
    this.enrollment = { ...this.enrollment, state: 'proof_verified', consumedAt: NOW.toISOString(), brokerId: this.broker.brokerId,
      proposedHostLabel: input.hostLabel, proposedLocalUidHash: input.localUidHash, proposedOsVersion: input.osVersion,
      proposedProtocolVersion: input.protocolVersion, proposedBrokerVersion: input.brokerVersion, proposedBuildSha256: input.buildSha256 }
    return this.broker
  }
  async approve(id: string, ownerId: string) {
    if (!this.broker || this.broker.brokerId !== id || this.broker.ownerUserId !== ownerId || this.broker.status !== 'pending') throw new Error('not found')
    this.broker = { ...this.broker, status: 'active', approvedAt: NOW.toISOString(), approvedBy: ownerId }
    if (this.enrollment) this.enrollment = { ...this.enrollment, state: 'approved', approvedAt: NOW.toISOString(), approvedBy: ownerId }
    return this.broker
  }
  async revoke(id: string, ownerId: string, status: 'revoked' | 'lost', reason: string) {
    if (!this.broker || this.broker.brokerId !== id || this.broker.ownerUserId !== ownerId || !['pending','active'].includes(this.broker.status)) throw new Error('not found')
    this.broker = { ...this.broker, status, revokedAt: NOW.toISOString(), revokedBy: ownerId, revokedReason: reason }
    return this.broker
  }
  async acceptRequest(input: AcceptRequestInput) {
    const broker = this.broker
    if (!broker || broker.status !== 'active' || broker.brokerId !== input.brokerId || broker.hostId !== input.hostId
        || input.requestCounter !== broker.requestCounter + 1 || input.jti === broker.lastRequestJti
        || Math.abs(NOW.getTime() - Date.parse(input.requestTimestamp)) > 120_000) throw new Error('replay')
    this.broker = { ...broker, requestCounter: input.requestCounter, lastRequestJti: input.jti,
      lastRequestAt: input.requestTimestamp, lastSeenAt: NOW.toISOString() }
    return this.broker
  }
}

function enrollmentRow(over: Partial<StoredBrokerEnrollment> = {}): StoredBrokerEnrollment {
  return { enrollmentId: ENROLLMENT, requestedBy: OWNER, hostId: HOST,
    challengeHash: brokerEnrollmentSecretHash('challenge', ENROLLMENT, CHALLENGE),
    pairingCodeHash: brokerEnrollmentSecretHash('pairing', ENROLLMENT, PAIRING), allowedRepositoryIds: [REPO],
    state: 'issued', consumedAt: null, brokerId: null, proposedHostLabel: null, proposedLocalUidHash: null,
    proposedOsVersion: null, proposedProtocolVersion: null, proposedBrokerVersion: null,
    proposedBuildSha256: null, approvedAt: null, approvedBy: null,
    createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 60_000).toISOString(), ...over }
}
function brokerRow(over: Partial<StoredBroker> = {}): StoredBroker {
  return { brokerId: BROKER, enrollmentId: ENROLLMENT, ownerUserId: OWNER, hostId: HOST,
    publicJwk, keyThumbprint: publicJwkThumbprint(publicJwk), algorithm: 'ES256', protocolVersion: 1,
    brokerVersion: '0.1.0', buildSha256: BUILD, hostLabel: 'Synthetic Mac', localUidHash: 'b'.repeat(64),
    osVersion: 'macOS synthetic', status: 'pending', allowedRepositoryIds: [REPO], approvedAt: null,
    approvedBy: null, lastSeenAt: null, expiresAt: null, revokedAt: null, revokedBy: null,
    revokedReason: null, requestCounter: 0, lastRequestJti: null, lastRequestAt: null,
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), ...over }
}
function proof(over: Record<string, unknown> = {}) {
  const unsigned = { enrollmentId: ENROLLMENT, hostId: HOST, challenge: CHALLENGE, pairingCode: PAIRING,
    publicJwk, keyThumbprint: publicJwkThumbprint(publicJwk), algorithm: 'ES256' as const, protocolVersion: 1,
    brokerVersion: '0.1.0', buildSha256: BUILD, hostLabel: 'Synthetic Mac', localUidHash: 'b'.repeat(64), osVersion: 'macOS synthetic', ...over }
  const signature = sign('sha256', Buffer.from(canonicalEnrollmentPayload(unsigned as never)), { key: keyA.privateKey, dsaEncoding: 'der' }).toString('base64url')
  return { ...unsigned, signature }
}
function signedRequest(store: MemoryStore, over: Partial<{ counter: number; jti: string; timestamp: string; privateKey: typeof keyA.privateKey }> = {}) {
  const headers = { brokerId: BROKER, hostId: HOST, protocolVersion: 1, brokerVersion: '0.1.0', buildSha256: BUILD,
    counter: over.counter ?? 1, jti: over.jti ?? JTI, timestamp: over.timestamp ?? NOW.toISOString() }
  const payload = canonicalRequestPayload({ ...headers, method: 'POST', path: '/api/atlas/code-work/broker/identity', bodySha256: sha256Hex('{}') })
  const signature = sign('sha256', Buffer.from(payload), { key: over.privateKey ?? keyA.privateKey, dsaEncoding: 'der' }).toString('base64url')
  const request = new Request('https://omnira.test/api/atlas/code-work/broker/identity', { method: 'POST', headers: {
    'x-omnira-broker-id': headers.brokerId, 'x-omnira-broker-host-id': headers.hostId,
    'x-omnira-broker-protocol': '1', 'x-omnira-broker-version': headers.brokerVersion,
    'x-omnira-broker-build-sha256': headers.buildSha256, 'x-omnira-broker-counter': String(headers.counter),
    'x-omnira-broker-jti': headers.jti, 'x-omnira-broker-timestamp': headers.timestamp,
    'x-omnira-broker-signature': signature,
  } })
  return authenticateBrokerRequest(request, '{}', { store, policy, now })
}

describe('SDF-1C1 ES256 identity and enrollment', () => {
  it('accepts a valid P-256 proof but leaves the broker pending for explicit human approval', async () => {
    const store = new MemoryStore()
    const result = await completeBrokerEnrollment(proof(), { store, policy, now })
    expect(result.status).toBe('ok')
    expect(store.broker?.status).toBe('pending')
    expect(store.enrollment?.state).toBe('proof_verified')
  })
  it('rejects invalid signatures, wrong keys and altered signed payloads', async () => {
    const wrong = proof(); wrong.signature = sign('sha256', Buffer.from(canonicalEnrollmentPayload({ ...wrong, signature: undefined } as never)), { key: keyB.privateKey, dsaEncoding: 'der' }).toString('base64url')
    expect((await completeBrokerEnrollment(wrong, { store: new MemoryStore(), policy, now })).status).toBe('rejected')
    const altered = proof(); altered.hostLabel = 'Altered Mac'
    expect((await completeBrokerEnrollment(altered, { store: new MemoryStore(), policy, now })).status).toBe('rejected')
  })
  it('rejects malformed/private JWKs, unsupported algorithms and unknown builds or versions', async () => {
    expect(parseEnrollmentProof({ ...proof(), publicJwk: { ...publicJwk, d: 'private' } })).toBeNull()
    expect(parseEnrollmentProof({ ...proof(), algorithm: 'HS256' })).toBeNull()
    expect((await completeBrokerEnrollment(proof({ buildSha256: 'c'.repeat(64) }), { store: new MemoryStore(), policy, now })).status).toBe('rejected')
    expect((await completeBrokerEnrollment(proof({ brokerVersion: '0.2.0' }), { store: new MemoryStore(), policy, now })).status).toBe('rejected')
  })
  it('denies unauthenticated initiation and stores only domain-bound hashes', async () => {
    const store = new MemoryStore(); store.enrollment = null
    expect((await beginBrokerEnrollment({ operator: async () => ({ ok: false, reason: 'unauthenticated' }), store, now })).status).toBe('no_principal')
    const random = (size: number) => Buffer.alloc(size, 7)
    const ids = [ENROLLMENT, HOST]
    const result = await beginBrokerEnrollment({ operator: operator(), store, now, randomBytes: random, randomUUID: () => ids.shift()! })
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      const persisted = await store.openEnrollmentByOwner(OWNER)
      expect(persisted?.challengeHash).not.toContain(result.enrollment.challenge)
      expect(persisted?.pairingCodeHash).not.toContain(result.enrollment.pairingCode)
    }
  })
  it('rejects expired and consumed challenges, wrong host and challenge reuse', async () => {
    const expired = new MemoryStore(); expired.enrollment = enrollmentRow({ expiresAt: new Date(NOW.getTime() - 1).toISOString() })
    expect((await completeBrokerEnrollment(proof(), { store: expired, policy, now })).status).toBe('expired')
    const consumed = new MemoryStore(); consumed.enrollment = enrollmentRow({ state: 'proof_verified', consumedAt: NOW.toISOString() })
    expect((await completeBrokerEnrollment(proof(), { store: consumed, policy, now })).status).toBe('rejected')
    expect((await completeBrokerEnrollment(proof({ hostId: randomUUID() }), { store: new MemoryStore(), policy, now })).status).toBe('rejected')
    const reuse = new MemoryStore(); expect((await completeBrokerEnrollment(proof(), { store: reuse, policy, now })).status).toBe('ok')
    expect((await completeBrokerEnrollment(proof(), { store: reuse, policy, now })).status).toBe('rejected')
  })
  it('rejects a duplicate live enrollment and a duplicate public key', async () => {
    const store = new MemoryStore(); store.broker = brokerRow(); store.enrollment = null
    expect((await beginBrokerEnrollment({ operator: operator(), store, now })).status).toBe('conflict')
    const duplicate = new MemoryStore(); duplicate.broker = brokerRow();
    expect((await completeBrokerEnrollment(proof(), { store: duplicate, policy, now })).status).toBe('rejected')
  })
  it('makes foreign and unknown brokers indistinguishable and revoked keys non-reactivatable', async () => {
    const store = new MemoryStore(); store.broker = brokerRow()
    expect((await approveBroker(BROKER, { operator: operator(FOREIGN), store, now })).status).toBe('not_permitted')
    expect((await approveBroker(randomUUID(), { operator: operator(), store, now })).status).toBe('not_permitted')
    expect((await approveBroker(BROKER, { operator: operator(), store, now })).status).toBe('ok')
    expect((await revokeBroker(BROKER, 'revoked', 'operator_revoked', { operator: operator(), store, now })).status).toBe('ok')
    expect((await approveBroker(BROKER, { operator: operator(), store, now })).status).toBe('not_permitted')
  })
})

describe('SDF-1C1 signed request replay boundary', () => {
  const activeStore = () => { const store = new MemoryStore(); store.broker = brokerRow({ status: 'active', approvedAt: NOW.toISOString(), approvedBy: OWNER }); return store }
  it('accepts exactly one valid diagnostic and records real authenticated contact', async () => {
    const store = activeStore(); expect((await signedRequest(store)).status).toBe('ok')
    expect(store.broker?.requestCounter).toBe(1); expect(store.broker?.lastSeenAt).toBe(NOW.toISOString())
  })
  it('rejects invalid signatures, stale timestamps and stale counters', async () => {
    expect((await signedRequest(activeStore(), { privateKey: keyB.privateKey })).status).toBe('rejected')
    expect((await signedRequest(activeStore(), { timestamp: new Date(NOW.getTime() - 120_001).toISOString() })).status).toBe('rejected')
    const store = activeStore(); store.broker = brokerRow({ status: 'active', approvedAt: NOW.toISOString(), approvedBy: OWNER, requestCounter: 1,
      lastRequestJti: randomUUID(), lastRequestAt: NOW.toISOString(), lastSeenAt: NOW.toISOString() })
    expect((await signedRequest(store, { counter: 1 })).status).toBe('rejected')
  })
  it('rejects duplicate jti and allows only one concurrent duplicate request', async () => {
    const used = activeStore(); used.broker = { ...used.broker!, lastRequestJti: JTI }
    expect((await signedRequest(used)).status).toBe('rejected')
    const concurrent = activeStore()
    const results = await Promise.all([signedRequest(concurrent), signedRequest(concurrent)])
    expect(results.filter(result => result.status === 'ok')).toHaveLength(1)
  })
  it('rejects an otherwise valid request immediately after revocation', async () => {
    const store = activeStore(); store.broker = { ...store.broker!, status: 'revoked', revokedAt: NOW.toISOString(), revokedBy: OWNER, revokedReason: 'operator_revoked' }
    expect((await signedRequest(store)).status).toBe('rejected')
  })
})

describe('SDF-1C1 repository, secret and no-execution boundary', () => {
  const ROOT = resolve(__dirname, '../../../..')
  const sourceFiles = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name); return statSync(path).isDirectory() ? sourceFiles(path) : /\.(?:ts|tsx|swift)$/.test(name) ? [path] : []
  })
  it('binds the only repository exactly and stores no private key column', () => {
    const migration = readFileSync(resolve(ROOT, 'apps/web/supabase/migrations/20260923150000_sdf1c1_trusted_broker_identity.sql'), 'utf8')
    expect(migration).toContain("array['github.com/bumbi190/ai-operating-platform']::text[]")
    expect(migration).not.toMatch(/private[_ ]?key|service[_-]?role[_-]?key/i)
    expect((migration.match(/create table public\.atlas_code_broker/g) ?? [])).toHaveLength(2)
  })
  it('exposes only enrollment and identity diagnostics, never execution capability', () => {
    const roots = [resolve(ROOT, 'apps/web/lib/atlas/code-broker'), resolve(ROOT, 'apps/code-broker')]
    const source = roots.flatMap(sourceFiles).map(file => readFileSync(file, 'utf8')).join('\n')
    expect(source).not.toMatch(/git\s+(?:fetch|worktree|commit|push|merge|rebase|reset)|gh\s+pr|vercel\s+(?:deploy|promote)/i)
    expect(source).not.toMatch(/@anthropic-ai\/sdk|from ['"]openai['"]|apply[_-]?patch|command[_-]?runner|worker[_-]?invoke/i)
    // SDF-1C3A: exactly TWO modules may import child_process — the identity signer's native helper
    // client and the isolation substrate's single infrastructure runner (closed git/docker vocabulary).
    expect(source.match(/from ['"]node:child_process['"]/g) ?? []).toHaveLength(2)
    const importers = roots.flatMap(sourceFiles).filter(file => /from ['"]node:child_process['"]/.test(readFileSync(file, 'utf8'))).map(file => file.slice(ROOT.length + 1)).sort()
    expect(importers).toEqual(['apps/code-broker/src/identity/keychain.ts', 'apps/code-broker/src/isolation/process-runner.ts'])
    expect(readFileSync(resolve(ROOT, 'apps/code-broker/src/identity/keychain.ts'), 'utf8')).toContain("execFileAsync(this.helperPath, args")
    expect(existsSync(resolve(ROOT, 'apps/web/app/api/atlas/code-work/claim'))).toBe(false)
    expect(existsSync(resolve(ROOT, 'apps/web/app/api/atlas/code-work/preflight'))).toBe(false)
  })
  it('treats buildSha256 as a declared identity checked against a fail-closed allowlist (not attestation)', () => {
    const declared = { protocolVersion: 1, brokerVersion: '0.1.0', buildSha256: BUILD }
    const previous = process.env.OMNIRA_CODE_BROKER_ALLOWED_BUILD_SHA256
    try {
      delete process.env.OMNIRA_CODE_BROKER_ALLOWED_BUILD_SHA256
      expect(configuredBrokerBuildPolicy().allowedBuildSha256.size).toBe(0)
      expect(brokerBuildAccepted(declared)).toBe(false)
      process.env.OMNIRA_CODE_BROKER_ALLOWED_BUILD_SHA256 = `not-a-hash, ${BUILD.toUpperCase()}`
      expect(brokerBuildAccepted(declared)).toBe(true)
      expect(brokerBuildAccepted({ ...declared, buildSha256: 'c'.repeat(64) })).toBe(false)
    } finally {
      if (previous === undefined) delete process.env.OMNIRA_CODE_BROKER_ALLOWED_BUILD_SHA256
      else process.env.OMNIRA_CODE_BROKER_ALLOWED_BUILD_SHA256 = previous
    }
    // The declaration is sourced from an operator flag and nothing measures the executable.
    expect(readFileSync(resolve(ROOT, 'apps/code-broker/src/cli.ts'), 'utf8')).toContain("buildSha256: value('--build-sha256')")
    expect(readFileSync(resolve(ROOT, 'apps/web/lib/atlas/code-broker/policy.ts'), 'utf8')).toContain('NOT remote attestation')
  })
  it('never touches atlas_code_work_runs or the dormant broker-token columns SDF-1C1B will activate', () => {
    const migration = readFileSync(resolve(ROOT, 'apps/web/supabase/migrations/20260923150000_sdf1c1_trusted_broker_identity.sql'), 'utf8')
    expect(migration).not.toMatch(/atlas_code_work_runs/)
    const controlPlane = readFileSync(resolve(ROOT, 'apps/web/supabase/migrations/20260918095827_sdf1b1_code_work_control_plane.sql'), 'utf8')
    expect(controlPlane).toContain('constraint atlas_code_work_runs_token_dormant_check check (')
    expect(controlPlane).toMatch(/atlas_code_work_runs_token_dormant_check check \(\s*broker_token_hash is null and broker_token_expires_at is null/)
  })
  it('keeps broker failures closed and free of supplied challenge or pairing secrets', async () => {
    const bad = proof({ challenge: 'private-challenge-marker', pairingCode: 'private-pairing-marker' })
    const result = await completeBrokerEnrollment(bad, { store: new MemoryStore(), policy, now })
    expect(JSON.stringify(result)).not.toContain('private-')
    expect(result.status).toBe('rejected')
  })
})
