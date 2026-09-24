/**
 * SDF-1C2 — typed, signed client operations for the broker control channel:
 * discover, claim, claim recovery, heartbeat.
 *
 * Protocol primitives only. There is no CLI command, no loop and no execution here, and no
 * database or service credential anywhere in the local broker: it speaks only to Omnira's
 * signed HTTP API.
 *
 * Load-bearing rules:
 *  - The request body is serialized ONCE into a string; that exact string is hashed, signed
 *    and sent. There is never a second stringify that could diverge from what was signed.
 *  - The path is a member of a CLOSED allowlist (four operational paths). No caller-supplied
 *    path, query or host reaches the URL.
 *  - Operational calls carry a claim credential, so they require https:, except for an
 *    explicit loopback development origin (localhost, 127.0.0.1, ::1).
 *  - Redirects are refused: a signed request is never replayed to another location.
 *  - The caller owns the monotonic request counter. Every result carries the counter it was
 *    made with so a later broker loop can apply "newer counter wins" (see response-order.ts).
 */

import { randomUUID } from 'node:crypto'
import type { BrokerSigner } from '../identity/types.js'
import { canonicalRequestPayload, sha256Hex } from './canonical-request.js'

export const OPERATIONAL_PATHS = Object.freeze({
  discover: '/api/atlas/code-work/broker/discover',
  claim: '/api/atlas/code-work/broker/claim',
  recover: '/api/atlas/code-work/broker/claim/recover',
  heartbeat: '/api/atlas/code-work/broker/heartbeat',
} as const)
export type OperationalOperation = keyof typeof OPERATIONAL_PATHS

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const TOKEN = /^[A-Za-z0-9_-]{43}$/

/** https: always; http: only for an explicit loopback development origin. Returns the parsed origin. */
export function assertOperationalOrigin(origin: string): URL {
  let url: URL
  try { url = new URL(origin) } catch { throw new Error('invalid operational origin') }
  const loopback = LOOPBACK_HOSTS.has(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('operational origin must be https (http is allowed only for loopback development)')
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('operational origin must be a bare origin')
  }
  return url
}

export interface OperationalContext {
  origin: string
  brokerId: string
  hostId: string
  protocolVersion: number
  brokerVersion: string
  buildSha256: string
  identityId: string
  signer: BrokerSigner
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
}

export interface OperationResult<T> {
  /** The signed request counter this response answers. Newer counter wins; see response-order.ts. */
  requestCounter: number
  httpStatus: number
  body: T
}

export type DiscoverBody = { ok: true; work: Array<{ workId: string; repositoryId: string; pinnedBaseSha: string }> } | { ok: false; error: string }
export type ClaimBody = { ok: true; workId: string; claimId: string; fence: number; leaseUntil: string; claimToken: string } | { ok: false; error: string }
export type HeartbeatBody = { ok: true; workId: string; claimId: string; fence: number; leaseUntil: string; state: string } | { ok: false; error: string }

async function send<T>(ctx: OperationalContext, operation: OperationalOperation, counter: number, payload: Record<string, unknown>, parse: (value: unknown) => T): Promise<OperationResult<T>> {
  if (!Number.isSafeInteger(counter) || counter < 1) throw new Error('invalid request counter')
  const origin = assertOperationalOrigin(ctx.origin)
  const path = OPERATIONAL_PATHS[operation]
  if (!Object.values(OPERATIONAL_PATHS).includes(path)) throw new Error('operational path not allowlisted')
  const url = new URL(path, origin)
  if (url.pathname !== path) throw new Error('invalid operational path')

  const bodyString = JSON.stringify(payload)            // serialized exactly once
  const jti = randomUUID()
  const timestamp = new Date().toISOString()
  const signature = await ctx.signer.signCanonicalPayload(ctx.identityId, canonicalRequestPayload({
    brokerId: ctx.brokerId, hostId: ctx.hostId, protocolVersion: ctx.protocolVersion,
    brokerVersion: ctx.brokerVersion, buildSha256: ctx.buildSha256, counter, jti, timestamp,
    method: 'POST', path, bodySha256: sha256Hex(bodyString),
  }))
  const response = await (ctx.fetchImpl ?? fetch)(url, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'content-type': 'application/json',
      'x-omnira-broker-id': ctx.brokerId, 'x-omnira-broker-host-id': ctx.hostId,
      'x-omnira-broker-protocol': String(ctx.protocolVersion), 'x-omnira-broker-version': ctx.brokerVersion,
      'x-omnira-broker-build-sha256': ctx.buildSha256, 'x-omnira-broker-counter': String(counter),
      'x-omnira-broker-jti': jti, 'x-omnira-broker-timestamp': timestamp,
      'x-omnira-broker-signature': signature,
    },
    body: bodyString,                                    // the exact string that was signed
  })
  const value = await response.json().catch(() => null)
  return { requestCounter: counter, httpStatus: response.status, body: parse(value) }
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const refusal = (value: unknown): { ok: false; error: string } =>
  ({ ok: false, error: isRecord(value) && typeof value.error === 'string' ? value.error.slice(0, 64) : 'invalid_response' })

function parseDiscover(value: unknown): DiscoverBody {
  if (!isRecord(value) || value.ok !== true || !Array.isArray(value.work)) return refusal(value)
  const work: Array<{ workId: string; repositoryId: string; pinnedBaseSha: string }> = []
  for (const item of value.work) {
    if (!isRecord(item) || typeof item.workId !== 'string' || !UUID.test(item.workId)
        || typeof item.repositoryId !== 'string' || typeof item.pinnedBaseSha !== 'string') return refusal(null)
    work.push({ workId: item.workId, repositoryId: item.repositoryId, pinnedBaseSha: item.pinnedBaseSha })
  }
  return { ok: true, work }
}

function parseClaim(value: unknown): ClaimBody {
  if (!isRecord(value) || value.ok !== true) return refusal(value)
  const { workId, claimId, fence, leaseUntil, claimToken } = value
  if (typeof workId !== 'string' || !UUID.test(workId) || typeof claimId !== 'string' || !UUID.test(claimId)
      || typeof fence !== 'number' || !Number.isSafeInteger(fence) || typeof leaseUntil !== 'string'
      || typeof claimToken !== 'string' || !TOKEN.test(claimToken)) return refusal(null)
  return { ok: true, workId, claimId, fence, leaseUntil, claimToken }
}

function parseHeartbeat(value: unknown): HeartbeatBody {
  if (!isRecord(value) || value.ok !== true) return refusal(value)
  const { workId, claimId, fence, leaseUntil, state } = value
  if (typeof workId !== 'string' || typeof claimId !== 'string' || typeof fence !== 'number'
      || typeof leaseUntil !== 'string' || typeof state !== 'string') return refusal(null)
  return { ok: true, workId, claimId, fence, leaseUntil, state }
}

const requireUuid = (value: string, name: string) => { if (!UUID.test(value)) throw new Error(`invalid ${name}`); return value }

export const discoverWork = async (ctx: OperationalContext, counter: number) => send(ctx, 'discover', counter, {}, parseDiscover)
export const claimWork = async (ctx: OperationalContext, counter: number, workId: string) =>
  send(ctx, 'claim', counter, { workId: requireUuid(workId, 'workId') }, parseClaim)
/** Same-broker recovery of a claim whose response was lost. Handshake only; it renews nothing. */
export const recoverClaim = async (ctx: OperationalContext, counter: number, workId: string) =>
  send(ctx, 'recover', counter, { workId: requireUuid(workId, 'workId') }, parseClaim)
export async function heartbeat(ctx: OperationalContext, counter: number, claim: { workId: string; claimId: string; fence: number; claimToken: string }) {
  if (!TOKEN.test(claim.claimToken) || !Number.isSafeInteger(claim.fence) || claim.fence < 1) throw new Error('invalid claim handle')
  return send(ctx, 'heartbeat', counter, {
    workId: requireUuid(claim.workId, 'workId'), claimId: requireUuid(claim.claimId, 'claimId'),
    fence: claim.fence, claimToken: claim.claimToken,
  }, parseHeartbeat)
}
