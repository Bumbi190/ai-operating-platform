/**
 * lib/media/credential-health.ts — what a project's bound social credential is worth
 * right now, and how that is recorded.
 *
 * One verdict for both the daily health cron (cron/token-health) and the operator's
 * "Verifiera nu" (api/media/social-accounts/verify). The platform is asked, with the
 * project's own credential, which account it is (lib/media/social-credentials.ts). A
 * match upgrades the binding to a provider attestation carrying the name the platform
 * gave — the Instagram username, the Facebook page name, the YouTube channel title —
 * and the outcome is written to social_credential_health as closed codes. Never a
 * token, never provider text.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordProviderAttestation, type SocialAccountBinding } from './social-bindings'
import {
  resolveFacebookCredential,
  resolveInstagramCredential,
  resolveYouTubeCredential,
  type CredentialRefusal,
} from './social-credentials'

// The table is newer than the generated database types.
type AnyDb = any

const DAY = 86_400_000

export type CredentialHealthStatus =
  | 'ok' | 'warning' | 'expired' | 'account_mismatch' | 'binding_blocked' | 'credential_missing' | 'verification_failed'

/** Statuses a person has to act on. */
export const BROKEN_HEALTH: ReadonlySet<CredentialHealthStatus> =
  new Set(['expired', 'account_mismatch', 'binding_blocked', 'credential_missing'])

export interface CredentialHealthVerdict {
  status: CredentialHealthStatus
  /** The platform confirmed the binding's account for this credential, just now. */
  identityVerified: boolean
  verifiedAccountId: string | null
  /** The name the platform gave for the account when it confirmed it. */
  accountLabel: string | null
  expiresAt: Date | null
  daysLeft: number | null
  refusal: CredentialRefusal | null
}

export function refusalHealthStatus(refusal: CredentialRefusal): CredentialHealthStatus {
  switch (refusal) {
    case 'credential_invalid': return 'expired'
    case 'account_mismatch':   return 'account_mismatch'
    case 'binding_blocked':    return 'binding_blocked'
    case 'credential_missing': return 'credential_missing'
    default:                   return 'verification_failed'
  }
}

export function expiryHealthStatus(daysLeft: number | null): CredentialHealthStatus {
  if (daysLeft === null) return 'ok'        // giltigt men ingen dagräkning (fb-sidtoken / youtube)
  if (daysLeft <= 0)  return 'expired'
  if (daysLeft <= 14) return 'warning'
  return 'ok'
}

const daysUntil = (at: Date | null): number | null =>
  at ? Math.round((at.getTime() - Date.now()) / DAY) : null

/** Ask the platform, with the project's own credential, whether it is still the bound account. */
export async function verifyBindingHealth(binding: SocialAccountBinding): Promise<CredentialHealthVerdict> {
  const refused = (refusal: CredentialRefusal): CredentialHealthVerdict => ({
    status: refusalHealthStatus(refusal), identityVerified: false, verifiedAccountId: null,
    accountLabel: null, expiresAt: null, daysLeft: null, refusal,
  })

  try {
    if (binding.platform === 'instagram') {
      const r = await resolveInstagramCredential(binding.projectId)
      if (!r.ok) return refused(r.refusal)
      await recordProviderAttestation(r.binding, r.credential.username)
      const daysLeft = daysUntil(r.credential.expiresAt)
      return { status: expiryHealthStatus(daysLeft), identityVerified: true, verifiedAccountId: r.credential.accountId,
               accountLabel: r.credential.username, expiresAt: r.credential.expiresAt, daysLeft, refusal: null }
    }

    if (binding.platform === 'facebook') {
      const r = await resolveFacebookCredential(binding.projectId)
      if (!r.ok) return refused(r.refusal)
      await recordProviderAttestation(r.binding, r.credential.pageName)
      const daysLeft = daysUntil(r.credential.expiresAt)
      return { status: expiryHealthStatus(daysLeft), identityVerified: true, verifiedAccountId: r.credential.pageId,
               accountLabel: r.credential.pageName, expiresAt: r.credential.expiresAt, daysLeft, refusal: null }
    }

    const r = await resolveYouTubeCredential(binding.projectId)
    if (!r.ok) return refused(r.refusal)
    const verified = r.credential.channelVerifiedBeforeUpload
    if (verified) await recordProviderAttestation(r.binding, r.credential.channelTitle)
    return { status: 'ok', identityVerified: verified, verifiedAccountId: verified ? r.credential.channelId : null,
             accountLabel: verified ? r.credential.channelTitle : null, expiresAt: null, daysLeft: null, refusal: null }
  } catch {
    return refused('provider_unavailable')
  }
}

/**
 * Records a verdict for the binding's (project, platform). `lastWarnedThreshold` is
 * written only when given, so a manual verification never resets the cron's
 * warning deduplication.
 */
export async function writeCredentialHealth(
  binding: SocialAccountBinding,
  verdict: CredentialHealthVerdict,
  checkedAt: string,
  lastWarnedThreshold?: number | null,
  client?: AnyDb,
): Promise<boolean> {
  try {
    const db = client ?? createAdminClient()
    const { error } = await (db as AnyDb).from('social_credential_health').upsert({
      project_id:          binding.projectId,
      platform:            binding.platform,
      binding_id:          binding.bindingId,
      status:              verdict.status,
      identity_verified:   verdict.identityVerified,
      verified_account_id: verdict.verifiedAccountId,
      checked_at:          checkedAt,
      expires_at:          verdict.expiresAt?.toISOString() ?? null,
      days_left:           verdict.daysLeft,
      ...(lastWarnedThreshold !== undefined ? { last_warned_threshold: lastWarnedThreshold } : {}),
    }, { onConflict: 'project_id,platform' })
    return !error
  } catch {
    return false
  }
}
