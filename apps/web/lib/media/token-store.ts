/**
 * token-store.ts — the stored social credential of one project on one platform.
 *
 * PROJECT-EXPLICIT, NOTHING IMPLICIT (project-scoped social credentials,
 * 2026-09-14). Every read and write names a project UUID the caller derived
 * server-side from the resource it acts on. There is no default project, no slug
 * lookup, no environment fallback and no read across projects: a missing or
 * malformed project id reads nothing and writes nothing. The database agrees —
 * platform_tokens.project_id is NOT NULL.
 *
 * NOT THE WAY IN. A stored credential says nothing about which account it reaches.
 * Consumers get a VERIFIED credential from lib/media/social-credentials.ts, which
 * requires the project's verified account binding and asks the provider before
 * anything is dispatched. This module is the storage underneath that resolver,
 * /api/media/token and the refresh cron — and those two store only a credential
 * whose account the provider has just attested.
 *
 * NEVER THROWS, NEVER ECHOES. Failures come back as { ok: false }. A database
 * message, which can quote the row being written, is neither returned nor logged.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { isProjectId, type StoredSocialPlatform } from './social-bindings'
import { EXTERNAL_ACCOUNT_ID } from './social-identity'

/** The credential type platform_tokens stores for each platform — pinned by a CHECK constraint. */
export const STORED_TOKEN_TYPE: Record<StoredSocialPlatform, 'user' | 'page'> = { instagram: 'user', facebook: 'page' }

export interface StoredCredential {
  accessToken: string
  /** The provider-attested account the credential was stored for, when recorded. */
  accountId: string | null
  expiresAt: Date | null
  refreshedAt: Date | null
}

export type StoredCredentialRead = { ok: true; credential: StoredCredential | null } | { ok: false }

const date = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** The project's stored credential on a platform. `ok: false` is unreadable — never "missing". */
export async function readStoredCredential(projectId: string, platform: StoredSocialPlatform): Promise<StoredCredentialRead> {
  if (!isProjectId(projectId) || (platform !== 'instagram' && platform !== 'facebook')) return { ok: false }
  try {
    const { data, error } = await createAdminClient()
      .from('platform_tokens')
      .select('access_token, account_id, expires_at, refreshed_at')
      .eq('project_id', projectId)
      .eq('platform', platform)
      .eq('token_type', STORED_TOKEN_TYPE[platform])
      .maybeSingle()
    if (error) return { ok: false }
    if (!data || typeof data.access_token !== 'string' || data.access_token.length === 0) return { ok: true, credential: null }
    return {
      ok: true,
      credential: {
        accessToken: data.access_token,
        accountId: typeof data.account_id === 'string' && EXTERNAL_ACCOUNT_ID.test(data.account_id) ? data.account_id : null,
        expiresAt: date(data.expires_at),
        refreshedAt: date(data.refreshed_at),
      },
    }
  } catch {
    return { ok: false }
  }
}

export interface CredentialToStore {
  accessToken: string
  /** The account the provider attested for this credential just now. Required. */
  accountId: string
  expiresAt: Date | null
}

/** Stores (or replaces) the project's credential for an account the provider has just attested. */
export async function storeCredential(
  projectId: string, platform: StoredSocialPlatform, input: CredentialToStore,
): Promise<{ ok: true } | { ok: false }> {
  if (!isProjectId(projectId) || (platform !== 'instagram' && platform !== 'facebook')) return { ok: false }
  if (typeof input.accessToken !== 'string' || input.accessToken.length === 0) return { ok: false }
  if (!EXTERNAL_ACCOUNT_ID.test(input.accountId)) return { ok: false }
  try {
    const { error } = await createAdminClient()
      .from('platform_tokens')
      .upsert({
        project_id: projectId,
        platform,
        token_type: STORED_TOKEN_TYPE[platform],
        access_token: input.accessToken,
        account_id: input.accountId,
        expires_at: input.expiresAt?.toISOString() ?? null,
        refreshed_at: new Date().toISOString(),
      }, { onConflict: 'project_id,platform,token_type' })
    return error ? { ok: false } : { ok: true }
  } catch {
    return { ok: false }
  }
}
