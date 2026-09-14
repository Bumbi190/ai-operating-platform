/**
 * GET /api/media/cron/refresh-tokens
 *
 * Förnyar varje projekts lagrade Instagram-credential (måndagar 06:00 UTC,
 * cron omnira_refresh_tokens).
 *
 * Project-scoped social credentials (2026-09-14): körningen går över projektens
 * aktiva Instagram-bindningar — aldrig ett standardprojekt och aldrig ett env-token.
 * Ett förnyat token ersätter det lagrade först när Instagram har bekräftat att det
 * fortfarande är bindningens konto; annars behålls det gamla och ett larm skickas.
 * Inget token lämnar körningen: svar, loggar och larm bär bara projekt, konto-id och
 * stängda felkoder.
 *
 * Flöden:
 *   - Instagram-login (IG…): graph.instagram.com/refresh_access_token
 *     (grant_type=ig_refresh_token) — kräver inga app-uppgifter.
 *   - Facebook-login (EAA…): fb_exchange_token med META_APP_ID / META_APP_SECRET.
 * Facebook-sidtoken från ett långlivat användartoken löper normalt inte ut och förnyas
 * inte här. YouTube (Y1) förnyas inte här: refresh-tokenet ligger i Vercel.
 *
 * Skyddad med: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listActiveBindings } from '@/lib/media/social-bindings'
import { readStoredCredential, storeCredential } from '@/lib/media/token-store'
import { attestInstagramCredential } from '@/lib/media/social-identity'
import { sendPipelineAlert } from '@/lib/media/alert'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

const IG_REFRESH_URL = 'https://graph.instagram.com/refresh_access_token'
const FB_TOKEN_URL   = 'https://graph.facebook.com/oauth/access_token'
const DAY = 86_400_000

function log(msg: string) {
  console.log(`[cron/refresh-tokens] ${msg}`)
}

type Refreshed = { ok: true; accessToken: string; expiresAt: Date | null } | { ok: false; reason: string }

function refreshedFrom(res: Response, data: { access_token?: unknown; expires_in?: unknown } | null, flow: string): Refreshed {
  if (!res.ok || typeof data?.access_token !== 'string' || data.access_token.length === 0) {
    return { ok: false, reason: `${flow}_http_${res.status}` }
  }
  const expiresIn = typeof data.expires_in === 'number' && data.expires_in > 0 ? data.expires_in : null
  return { ok: true, accessToken: data.access_token, expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null }
}

/** Instagram-login token → a fresh 60-day token for the same account. */
async function refreshInstagramLogin(token: string): Promise<Refreshed> {
  try {
    const url = new URL(IG_REFRESH_URL)
    url.searchParams.set('grant_type', 'ig_refresh_token')
    url.searchParams.set('access_token', token)
    const res  = await fetch(url.toString(), { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    const data = await res.json().catch(() => null) as { access_token?: unknown; expires_in?: unknown } | null
    return refreshedFrom(res, data, 'instagram_refresh')
  } catch {
    return { ok: false, reason: 'instagram_refresh_unreachable' }
  }
}

/** Facebook-login token → a fresh long-lived token (needs the Meta app credentials). */
async function refreshFacebookLogin(token: string): Promise<Refreshed> {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) return { ok: false, reason: 'meta_app_credentials_missing' }
  try {
    const url = new URL(FB_TOKEN_URL)
    url.searchParams.set('grant_type', 'fb_exchange_token')
    url.searchParams.set('client_id', appId)
    url.searchParams.set('client_secret', appSecret)
    url.searchParams.set('fb_exchange_token', token)
    const res  = await fetch(url.toString(), { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    const data = await res.json().catch(() => null) as { access_token?: unknown; expires_in?: unknown } | null
    return refreshedFrom(res, data, 'facebook_exchange')
  } catch {
    return { ok: false, reason: 'facebook_exchange_unreachable' }
  }
}

export async function GET(request: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ranAt = new Date().toISOString()
  const bindings = await listActiveBindings()
  if (!bindings.ok) {
    return NextResponse.json({ ranAt, ok: false, error: 'bindings_unreadable' }, { status: 500 })
  }

  const db = createAdminClient()
  const results: Array<Record<string, unknown>> = []
  let failures = 0

  for (const binding of bindings.bindings) {
    const projectId = binding.projectId

    if (binding.platform === 'facebook') {
      // Page access tokens skapade från long-lived user tokens löper normalt inte ut.
      results.push({ project_id: projectId, platform: 'facebook', status: 'no_refresh_needed' })
      continue
    }
    if (binding.platform !== 'instagram') continue

    const fail = async (reason: string) => {
      failures++
      log(`✗ Instagram-förnyelse för projekt ${projectId} misslyckades: ${reason}`)
      await sendPipelineAlert({
        cronRoute: 'cron/refresh-tokens',
        step:      'instagram_token_refresh',
        error:     reason,
        context:   { projectId, accountId: binding.externalAccountId,
                     tip: 'Det lagrade tokenet behölls. Ersätt det i Inställningar om det har gått ut.' },
      })
      results.push({ project_id: projectId, platform: 'instagram', status: 'failed', reason })
    }

    const stored = await readStoredCredential(projectId, 'instagram')
    if (!stored.ok) { await fail('credential_unreadable'); continue }
    if (!stored.credential) {
      results.push({ project_id: projectId, platform: 'instagram', status: 'skipped', reason: 'credential_missing' })
      continue
    }

    const refreshed = stored.credential.accessToken.startsWith('IG')
      ? await refreshInstagramLogin(stored.credential.accessToken)
      : await refreshFacebookLogin(stored.credential.accessToken)
    if (!refreshed.ok) { await fail(refreshed.reason); continue }

    // The refreshed credential replaces the stored one only while Instagram still says
    // it is the binding's account.
    const identity = await attestInstagramCredential(refreshed.accessToken, binding.externalAccountId)
    if (!identity.ok) { await fail(`refreshed_credential_${identity.failure}`); continue }
    if (identity.accountId !== binding.externalAccountId) { await fail('refreshed_credential_account_mismatch'); continue }

    const saved = await storeCredential(projectId, 'instagram', {
      accessToken: refreshed.accessToken,
      accountId: identity.accountId,
      expiresAt: refreshed.expiresAt,
    })
    if (!saved.ok) { await fail('store_failed'); continue }

    // Spårbarhet: senaste lyckade förnyelse, per projekt.
    await (db as any).from('social_credential_health')
      .update({ last_refreshed_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('platform', 'instagram')

    const daysUntilExpiry = refreshed.expiresAt ? Math.round((refreshed.expiresAt.getTime() - Date.now()) / DAY) : null
    log(`✓ Instagram-credential förnyad för projekt ${projectId}. Löper ut om ${daysUntilExpiry ?? '?'} dagar.`)
    results.push({
      project_id: projectId,
      platform: 'instagram',
      status: 'refreshed',
      expiresAt: refreshed.expiresAt?.toISOString() ?? null,
      daysUntilExpiry,
    })
  }

  return NextResponse.json({ ranAt, ok: failures === 0, results }, { status: failures === 0 ? 200 : 500 })
}
