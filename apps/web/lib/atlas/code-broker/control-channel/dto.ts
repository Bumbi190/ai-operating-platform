/**
 * SDF-1C2 — closed request DTOs for the broker control channel.
 *
 * Every parser is FAIL-CLOSED: the signed raw body must be a plain JSON object with EXACTLY
 * the documented keys and canonical value formats. Nothing in a body is ever authority:
 * broker id, host id, repository, project, fence-of-record, lease and token hash are all
 * derived server-side (from the authenticated principal or from SQL), never read from here.
 */

import { isBrokerClaimToken } from '../../code-work/claim-credential/claim-credential'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export interface WorkIdBody { workId: string }
export interface HeartbeatBody { workId: string; claimId: string; fence: number; claimToken: string }

function parseObject(raw: string, keys: readonly string[]): Record<string, unknown> | null {
  let value: unknown
  try { value = JSON.parse(raw) } catch { return null }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const present = Object.keys(record)
  if (present.length !== keys.length || present.some(key => !keys.includes(key))) return null
  return record
}

function uuid(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value.toLowerCase()
  return UUID.test(id) ? id : null
}

/** Discovery carries no parameters: the repository scope comes from the stored broker identity. */
export function parseDiscoverBody(raw: string): {} | null {
  return parseObject(raw, []) ? {} : null
}

/** Claim and claim-recovery both name only the work. */
export function parseWorkIdBody(raw: string): WorkIdBody | null {
  const record = parseObject(raw, ['workId'])
  const workId = record && uuid(record.workId)
  return workId ? { workId } : null
}

export function parseHeartbeatBody(raw: string): HeartbeatBody | null {
  const record = parseObject(raw, ['workId', 'claimId', 'fence', 'claimToken'])
  if (!record) return null
  const workId = uuid(record.workId)
  const claimId = uuid(record.claimId)
  const fence = record.fence
  if (!workId || !claimId || typeof fence !== 'number' || !Number.isSafeInteger(fence) || fence < 1) return null
  if (!isBrokerClaimToken(record.claimToken)) return null
  return { workId, claimId, fence, claimToken: record.claimToken }
}
