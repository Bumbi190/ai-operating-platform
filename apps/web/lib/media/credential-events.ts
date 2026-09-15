/**
 * Platform credential events — the audit trail for replacing a project's social
 * credential (Settings S0, made project- and account-aware 2026-09-14).
 *
 * /api/media/token and the YouTube connection callback (/api/media/youtube/oauth/callback)
 * are the only callers. Each records `attempted` BEFORE any provider contact or store
 * and refuses the operation when that write does not land, then
 * records exactly one terminal event — `replaced` or `failed` — under the same
 * server-generated operation id. The tables are
 * supabase/migrations/20260914090100_platform_credential_events.sql and
 * supabase/migrations/20260914120100_platform_credential_events_account_binding.sql.
 *
 * PROJECT AND ACCOUNT. Every event names the project the operator chose and the
 * server authorised. A `replaced` event also names the provider-attested account
 * the new credential belongs to and how that account relates to the project's
 * binding (`matched`, `created`, `rebound`, and for YouTube `migrated`); a `failed`
 * event may name the account
 * when the failure was about the account.
 *
 * CREDENTIAL-BLIND. The row is assembled field by field from a closed set of inputs;
 * nothing is spread from the caller, so a token, header, provider message or secret
 * has no path into it. `detail` keeps only the allowlisted keys, in the types and the
 * platform/outcome shape the table's CHECK constraints accept — anything else is
 * dropped here rather than refused there. occurred_at and event_id are never sent:
 * the database stamps them.
 *
 * NEVER THROWS. A failed write comes back as { ok: false, code } carrying the
 * Postgres or PostgREST error code only, never the message, which can quote the row
 * being written.
 */
import { createAdminClient } from '@/lib/supabase/admin'

// The table is newer than the generated database types; same boundary cast as
// the atlas ledger stores.
type AnyDb = any

export type CredentialPlatform = 'instagram' | 'facebook' | 'youtube'
export type CredentialEventOutcome = 'attempted' | 'replaced' | 'failed'
export type CredentialFailureStage =
  | 'store'
  | 'unexpected'
  | 'provider_verification'
  | 'account_mismatch'
  | 'account_bound_to_other_project'
  | 'binding'
  // YouTube connections (Google OAuth) only:
  | 'authorization_denied'
  | 'code_exchange'
  | 'scope_missing'
  | 'refresh_token_missing'
  | 'account_ambiguous'
/** `migrated` — YouTube only: the Y1 channel moving to the project's own connection. */
export type CredentialBindingAction = 'matched' | 'created' | 'rebound' | 'migrated'

export const CREDENTIAL_FAILURE_STAGES: readonly CredentialFailureStage[] = [
  'store', 'unexpected', 'provider_verification', 'account_mismatch', 'account_bound_to_other_project', 'binding',
  'authorization_denied', 'code_exchange', 'scope_missing', 'refresh_token_missing', 'account_ambiguous',
]
/** The OAuth stages only a YouTube connection records — the table refuses them for any other platform. */
export const YOUTUBE_ONLY_FAILURE_STAGES: readonly CredentialFailureStage[] = [
  'authorization_denied', 'code_exchange', 'scope_missing', 'refresh_token_missing', 'account_ambiguous',
]
export const CREDENTIAL_BINDING_ACTIONS: readonly CredentialBindingAction[] = ['matched', 'created', 'rebound', 'migrated']

/** The audit contract every row is written under — pinned by the table (event_version = 2). */
export const CREDENTIAL_EVENT_VERSION = 2

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
  /** The provider-attested account. Required for `replaced`, optional for `failed`, never kept on `attempted`. */
  externalAccountId?: string | null
  /** How the account relates to the project's binding. Required for `replaced`, never kept otherwise. */
  bindingAction?: CredentialBindingAction | null
}

export type CredentialEventWrite = { ok: true } | { ok: false; code: string }

/** The credential type platform_tokens stores for each platform (lib/media/token-store.ts). */
export const CREDENTIAL_TYPE: Record<CredentialPlatform, 'user' | 'page' | 'oauth_refresh'> =
  { instagram: 'user', facebook: 'page', youtube: 'oauth_refresh' }

/** Every key `detail` may hold — mirrored by the table's allowlist constraint. */
export const CREDENTIAL_EVENT_DETAIL_KEYS = ['exchanged', 'page_resolved', 'read_insights_ok', 'expires_at', 'failure_stage'] as const

const FACEBOOK_FLAGS = ['exchanged', 'page_resolved', 'read_insights_ok'] as const
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/
// Mirrors the table's external_account_id constraint.
const ACCOUNT_ID = /^[A-Za-z0-9_-]{1,64}$/

/** The exact row that will be inserted. Exported so its construction is testable. */
export function credentialEventRow(input: CredentialEventInput) {
  const src = input.detail ?? {}
  const detail: Record<string, boolean | string> = {}

  if (input.outcome === 'failed') {
    const stage = src.failure_stage as CredentialFailureStage
    detail.failure_stage = CREDENTIAL_FAILURE_STAGES.includes(stage)
      && (input.platform === 'youtube' || !YOUTUBE_ONLY_FAILURE_STAGES.includes(stage))
      ? stage
      : 'unexpected'
  } else if (input.outcome === 'replaced') {
    if (input.platform === 'facebook') {
      for (const key of FACEBOOK_FLAGS) {
        if (typeof src[key] === 'boolean') detail[key] = src[key] as boolean
      }
    } else if (input.platform === 'instagram' && typeof src.expires_at === 'string' && ISO_UTC.test(src.expires_at)) {
      detail.expires_at = src.expires_at
    }
  }

  const account = typeof input.externalAccountId === 'string' && ACCOUNT_ID.test(input.externalAccountId)
    ? input.externalAccountId
    : null
  const bindingAction = input.outcome === 'replaced'
    && CREDENTIAL_BINDING_ACTIONS.includes(input.bindingAction as CredentialBindingAction)
    && (input.bindingAction !== 'migrated' || input.platform === 'youtube')
    ? input.bindingAction as CredentialBindingAction
    : null

  return {
    operation_id:        input.operationId,
    project_id:          input.projectId,
    platform:            input.platform,
    credential_type:     CREDENTIAL_TYPE[input.platform],
    actor:               input.actor,
    outcome:             input.outcome,
    detail,
    event_version:       CREDENTIAL_EVENT_VERSION,
    external_account_id: input.outcome === 'attempted' ? null : account,
    binding_action:      bindingAction,
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
