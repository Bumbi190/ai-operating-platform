/**
 * Platform credential events — the audit trail for replacing the platform's
 * publishing credentials (Settings S0).
 *
 * /api/media/token is the only caller. It records `attempted` BEFORE any provider
 * contact or store and refuses the replacement when that write does not land, then
 * records exactly one terminal event — `replaced` or `failed` — under the same
 * server-generated operation id. The table is
 * supabase/migrations/20260914090100_platform_credential_events.sql.
 *
 * CREDENTIAL-BLIND. The row is assembled field by field from a closed set of
 * inputs; nothing is spread from the caller, so a token, header, provider message
 * or secret has no path into it. `detail` keeps only the allowlisted keys, in the
 * types and the platform/outcome shape the table's CHECK constraints accept —
 * anything else is dropped here rather than refused there. occurred_at and
 * event_id are never sent: the database stamps them.
 *
 * NEVER THROWS. A failed write comes back as { ok: false, code } carrying the
 * Postgres or PostgREST error code only, never the message, which can quote the
 * row being written.
 */
import { createAdminClient } from '@/lib/supabase/admin'

// The table is newer than the generated database types; same boundary cast as
// the atlas ledger stores.
type AnyDb = any

export type CredentialPlatform = 'instagram' | 'facebook'
export type CredentialEventOutcome = 'attempted' | 'replaced' | 'failed'
export type CredentialFailureStage = 'store' | 'unexpected'

export interface CredentialEventDetail {
  exchanged?: boolean
  page_resolved?: boolean
  read_insights_ok?: boolean
  expires_at?: string
  failure_stage?: CredentialFailureStage
}

export interface CredentialEventInput {
  operationId: string
  projectId: string
  platform: CredentialPlatform
  actor: string
  outcome: CredentialEventOutcome
  detail?: CredentialEventDetail
}

export type CredentialEventWrite = { ok: true } | { ok: false; code: string }

/** The credential type platform_tokens stores for each platform (lib/media/token-store.ts). */
export const CREDENTIAL_TYPE: Record<CredentialPlatform, 'user' | 'page'> = { instagram: 'user', facebook: 'page' }

/** Every key `detail` may hold — mirrored by the table's allowlist constraint. */
export const CREDENTIAL_EVENT_DETAIL_KEYS = ['exchanged', 'page_resolved', 'read_insights_ok', 'expires_at', 'failure_stage'] as const

const FACEBOOK_FLAGS = ['exchanged', 'page_resolved', 'read_insights_ok'] as const
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/

/** The exact row that will be inserted. Exported so its construction is testable. */
export function credentialEventRow(input: CredentialEventInput) {
  const src = input.detail ?? {}
  const detail: Record<string, boolean | string> = {}

  if (input.outcome === 'failed') {
    detail.failure_stage = src.failure_stage === 'store' ? 'store' : 'unexpected'
  } else if (input.outcome === 'replaced') {
    if (input.platform === 'facebook') {
      for (const key of FACEBOOK_FLAGS) {
        if (typeof src[key] === 'boolean') detail[key] = src[key] as boolean
      }
    } else if (typeof src.expires_at === 'string' && ISO_UTC.test(src.expires_at)) {
      detail.expires_at = src.expires_at
    }
  }

  return {
    operation_id:    input.operationId,
    project_id:      input.projectId,
    platform:        input.platform,
    credential_type: CREDENTIAL_TYPE[input.platform],
    actor:           input.actor,
    outcome:         input.outcome,
    detail,
  }
}

export async function recordCredentialEvent(input: CredentialEventInput): Promise<CredentialEventWrite> {
  try {
    const { error } = await (createAdminClient() as AnyDb)
      .from('platform_credential_events')
      .insert(credentialEventRow(input))
    if (error) {
      const code = typeof error.code === 'string' && error.code ? error.code : 'insert_failed'
      return { ok: false, code }
    }
    return { ok: true }
  } catch {
    return { ok: false, code: 'exception' }
  }
}
