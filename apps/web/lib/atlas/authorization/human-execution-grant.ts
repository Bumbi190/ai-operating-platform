/**
 * lib/atlas/authorization/human-execution-grant.ts — the M4 HUMAN execution grant.
 *
 * Phase 3B1B2 M4 (human-origin closure). An M4 licensed bind accepts a
 * `workflow.action.execute` grant ONLY if the database holds a human-origin
 * attestation for it, and that attestation can be written only by
 * `atlas_grant_m4_execution_authorization()` — executable by `authenticated`
 * alone, deriving the human from `auth.uid()` and requiring that user to own the
 * project.
 *
 * So this module calls the RPC through the USER'S OWN Supabase session
 * (`createClient` from `lib/supabase/server`, which forwards the user's JWT), so
 * PostgreSQL sees the real `auth.uid()`. It never uses the service-role admin
 * client, and it sends no user id: the caller chooses only WHICH pending request
 * to approve and the expiry. Everything authority-bearing is derived in the
 * database.
 */

import 'server-only'

import { createClient } from '@/lib/supabase/server'

/** The ledger action whose grants must carry a human-origin attestation for M4. */
export const HUMAN_ATTESTED_ACTION_KIND = 'workflow.action.execute'

export type HumanExecutionGrantStatus =
  | 'ok'
  | 'no_principal'      // no authenticated human session (42501)
  | 'not_permitted'     // not the project owner, or not allowed (42501)
  | 'not_found'         // unknown authorization (P0002)
  | 'conflict'          // not a single pending request: already decided / replayed (55000)
  | 'invalid_request'   // wrong purpose, drifted target, or expiry outside the bound (22023)
  | 'unavailable'

export interface HumanExecutionGrantResult {
  readonly status: HumanExecutionGrantStatus
  readonly grant?: {
    readonly authorizationId: string
    readonly grantEventId: string
    readonly attestationId: string
    readonly humanPrincipal: string
    readonly expiresAt: string
  }
  readonly detail?: string
}

const STATUS_BY_CODE: Record<string, HumanExecutionGrantStatus> = {
  '42501': 'not_permitted',
  P0002: 'not_found',
  '55000': 'conflict',
  '22023': 'invalid_request',
}

/**
 * Approve ONE pending M4 execution request as the signed-in human.
 * The caller supplies only the authorization id and the expiry.
 */
export async function grantHumanExecutionAuthorization(
  args: { authorizationId: string; expiresAt: string },
): Promise<HumanExecutionGrantResult> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return { status: 'no_principal' }

  const { data, error } = await (supabase as unknown as {
    rpc: (fn: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>
  }).rpc('atlas_grant_m4_execution_authorization', {
    p_authorization_id: args.authorizationId,
    p_expires_at: args.expiresAt,
  })
  if (error) {
    return { status: STATUS_BY_CODE[error.code ?? ''] ?? 'unavailable', detail: error.message }
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, string> | undefined
  if (!row?.grant_event_id || !row?.attestation_id) return { status: 'unavailable', detail: 'no grant returned' }
  return {
    status: 'ok',
    grant: {
      authorizationId: row.authorization_id,
      grantEventId: row.grant_event_id,
      attestationId: row.attestation_id,
      humanPrincipal: row.human_principal,
      expiresAt: row.expires_at,
    },
  }
}
