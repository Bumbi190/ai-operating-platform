/**
 * SDF-1C2 — the shared HTTP boundary for the four broker control-channel routes.
 *
 * Order is load-bearing: bounded raw body → authenticateBrokerRequest over the EXACT raw body
 * (identity, ES256 signature, build, counter, jti, timestamp) → only then parse the closed DTO
 * → operate. Every response is `Cache-Control: no-store` (claim/recovery responses carry a raw
 * secret). Errors are closed generic codes that never echo the body or any token, and nothing
 * here logs.
 */

import 'server-only'

import { NextResponse } from 'next/server'
import { authenticateBrokerRequest } from '../principal'
import { parseDiscoverBody, parseHeartbeatBody, parseWorkIdBody } from './dto'
import {
  claimForBroker, discoverForBroker, heartbeatForBroker, recoverForBroker,
  type ControlChannelDeps,
} from './operations'

export type ControlOperation = 'discover' | 'claim' | 'recover' | 'heartbeat'

/** Deliberately tiny: the largest legitimate body is a heartbeat (~200 bytes). */
export const CONTROL_BODY_LIMIT_BYTES = 1_024

const NO_STORE = { 'Cache-Control': 'no-store' } as const

function respond(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

/** Reads at most `limit` bytes; returns null when the body is larger (never buffers past it). */
export async function readBoundedBody(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) { await reader.cancel().catch(() => undefined); return null }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function handleControlRequest(
  request: Request,
  operation: ControlOperation,
  deps?: ControlChannelDeps & { auth?: Parameters<typeof authenticateBrokerRequest>[2] },
): Promise<NextResponse> {
  const raw = await readBoundedBody(request, CONTROL_BODY_LIMIT_BYTES)
  if (raw === null) return respond(413, { ok: false, error: 'invalid_request' })

  const authenticated = await authenticateBrokerRequest(request, raw, deps?.auth)
  if (authenticated.status !== 'ok') return respond(401, { ok: false, error: 'broker_auth_rejected' })
  const broker = authenticated.broker

  if (operation === 'discover') {
    if (!parseDiscoverBody(raw)) return respond(400, { ok: false, error: 'invalid_request' })
    try {
      const { work } = await discoverForBroker(broker, deps)
      return respond(200, { ok: true, work })
    } catch {
      return respond(503, { ok: false, error: 'unavailable' })
    }
  }

  if (operation === 'claim' || operation === 'recover') {
    const body = parseWorkIdBody(raw)
    if (!body) return respond(400, { ok: false, error: 'invalid_request' })
    const outcome = operation === 'claim' ? await claimForBroker(broker, body, deps) : await recoverForBroker(broker, body, deps)
    if (outcome.status !== 'claimed') return respond(404, { ok: false, error: 'not_available' })
    return respond(200, {
      ok: true, workId: outcome.workId, claimId: outcome.claimId, fence: outcome.fence,
      leaseUntil: outcome.leaseUntil, claimToken: outcome.claimToken,
    })
  }

  const body = parseHeartbeatBody(raw)
  if (!body) return respond(400, { ok: false, error: 'invalid_request' })
  const outcome = await heartbeatForBroker(broker, body, deps)
  if (outcome.status !== 'renewed') return respond(409, { ok: false, error: 'claim_not_live' })
  return respond(200, {
    ok: true, workId: outcome.workId, claimId: outcome.claimId, fence: outcome.fence,
    leaseUntil: outcome.leaseUntil, state: outcome.state,
  })
}
