/**
 * POST /api/media/token  — spara ett nytt plattforms-token (inloggad operatör)
 *
 * Body: { platform: 'instagram' | 'facebook', token: string, expires_days?: number }
 *
 * Används för att lägga in ett nytt token med rätt scopes (t.ex. efter att du
 * lagt till instagram_manage_insights) utan att röra SQL. Sparas i
 * platform_tokens, som har företräde framför env-variabler.
 *
 * Facebook: det inklistrade (kortlivade) USER-tokenet växlas automatiskt till ett
 * LÅNGLIVAT, icke-utgående SID-token, och read_insights verifieras — så att både
 * postning och insights funkar utan att man rör Vercel-env eller pillar med tokens.
 *
 * ORDER (Settings S0). Each step runs only when every step before it passed:
 *   1. platform operator — these are the PLATFORM's publishing credentials; every
 *      Instagram and Facebook post the pipeline makes uses them
 *      (lib/media/social-destination.ts). Replacing one is the same authority as
 *      posting with it, which 9X/9AC lock to the platform operator.
 *   2. ownership of the default social project — unchanged from C-1.
 *   3. request shape.
 *   4. audit: an `attempted` event in platform_credential_events, under an
 *      operation id the server generates. If that write does not land, nothing
 *      below runs — no provider is contacted, no token exchanged, nothing stored.
 *   5. exchange (Facebook) and store.
 *   6. audit: exactly one terminal event, `replaced` or `failed`, same operation id.
 *
 * AUDIT INTEGRITY. If the terminal event cannot be written after the credential
 * WAS replaced, the replacement stands — there is no canonical rollback for a
 * platform credential, and improvising one could take publishing down — but the
 * route does not pretend it did not happen: 500 with `replaced: true` and
 * `audit_incident`, and a server log line of redacted metadata only.
 *
 * WRITE-ONLY. No response, log line or audit event ever carries a token; every
 * provider message that reaches the response passes redactSecrets() first, and
 * the audit event is credential-blind (lib/media/credential-events.ts).
 */
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { setToken, type Platform } from '@/lib/media/token-store'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { redactSecrets } from '@/lib/media/meta-errors'
import {
  recordCredentialEvent,
  type CredentialEventDetail,
  type CredentialFailureStage,
} from '@/lib/media/credential-events'

export const dynamic = 'force-dynamic'

const FB_GRAPH = 'https://graph.facebook.com/v21.0'

// This route always writes to the default social project via setToken (no project
// param is passed), so ownership is gated against that project's slug.
const DEFAULT_SOCIAL_PROJECT_SLUG = 'ai-media-automation'

// The longest validity a request may claim, so the computed expiry stays a real date.
const MAX_EXPIRES_DAYS = 3650

/**
 * Växlar ett kortlivat FB user-token → långlivat user-token → icke-utgående page-token,
 * och verifierar read_insights. Degraderar steg för steg: misslyckas växlingen sparas
 * det inklistrade tokenet ändå (best-effort), med diagnostik i svaret.
 *
 * Sparar INTE själv: routen sparar, så att den vet om ersättningen faktiskt skedde
 * och kan skriva rätt revisionshändelse.
 */
async function onboardFacebookToken(inputToken: string) {
  const appId     = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  const pageId    = process.env.FACEBOOK_PAGE_ID

  const diag = { exchanged: false, pageResolved: false, readInsightsOk: false, pageId: pageId ?? null, warnings: [] as string[] }

  // 1) Kortlivat → långlivat user-token (fb_exchange_token).
  let longUserToken = inputToken
  if (appId && appSecret) {
    try {
      const r = await fetch(`${FB_GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(inputToken)}`)
      const j = await r.json() as { access_token?: string; error?: { message?: string } }
      if (j.access_token) { longUserToken = j.access_token; diag.exchanged = true }
      else diag.warnings.push(`Långlivad växling misslyckades: ${j.error?.message ?? r.status}`)
    } catch (e) { diag.warnings.push(`Växlingsfel: ${e instanceof Error ? e.message : 'okänt'}`) }
  } else {
    diag.warnings.push('META_APP_ID/META_APP_SECRET saknas — kan inte göra långlivad växling.')
  }

  // 2) Hämta icke-utgående page-token från det långlivade user-tokenet.
  let pageToken = longUserToken
  if (pageId) {
    try {
      const r = await fetch(`${FB_GRAPH}/${pageId}?fields=access_token&access_token=${encodeURIComponent(longUserToken)}`)
      const j = await r.json() as { access_token?: string; error?: { message?: string } }
      if (j.access_token) { pageToken = j.access_token; diag.pageResolved = true }
      else diag.warnings.push(`Kunde inte hämta page-token: ${j.error?.message ?? r.status}`)
    } catch (e) { diag.warnings.push(`Page-token-fel: ${e instanceof Error ? e.message : 'okänt'}`) }
  } else {
    diag.warnings.push('FACEBOOK_PAGE_ID saknas — sparar tokenet som det är.')
  }

  // 3) Verifiera read_insights mot ett RIKTIGT inlägg (post-nivå) — samma anrop som
  //    insights-cronen gör. Page-level page_impressions ger falska negativ för nya sidor.
  try {
    const { data: lastFb } = await createAdminClient()
      .from('media_scripts')
      .select('facebook_post_id')
      .not('facebook_post_id', 'is', null)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const fbPostId = (lastFb as { facebook_post_id?: string } | null)?.facebook_post_id
    if (fbPostId) {
      // facebook_post_id är video-id:t → hämta post_id, prefixa till {sid-id}_{post-id}.
      const vr = await fetch(`${FB_GRAPH}/${fbPostId}?fields=post_id&access_token=${encodeURIComponent(pageToken)}`)
      const vj = await vr.json() as { post_id?: string }
      const rawPostId = vj.post_id ?? fbPostId
      const probeId = rawPostId.includes('_') || !pageId ? rawPostId : `${pageId}_${rawPostId}`
      const r = await fetch(`${FB_GRAPH}/${probeId}/insights?metric=post_impressions&access_token=${encodeURIComponent(pageToken)}`)
      const j = await r.json() as { data?: unknown[]; error?: { message?: string } }
      diag.readInsightsOk = !j.error && Array.isArray(j.data)
      if (j.error) diag.warnings.push(`read_insights-koll: ${j.error.message}`)
    } else {
      diag.warnings.push('Inget FB-inlägg att verifiera read_insights mot ännu.')
    }
  } catch (e) { diag.warnings.push(`Insights-koll fel: ${e instanceof Error ? e.message : 'okänt'}`) }

  // Provider messages go back to the operator as diagnostics, so they pass the
  // same redaction as everything else Meta says: a message or an exception that
  // quoted a URL cannot carry its access_token or a token literal to the browser.
  diag.warnings = diag.warnings.map(redactSecrets)
  return { diag, pageToken }
}

export async function POST(request: Request) {
  // ── 1. PLATFORM OPERATOR (Settings S0) — first, before anything else ──────
  const operator = await resolvePlatformOperator()
  if (!operator.ok) {
    if (operator.reason === 'unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // One answer for every reason; the reason itself stays in the server log.
    console.warn(`[media/token] denied: ${operator.reason}`)
    return NextResponse.json({ error: 'Forbidden', denied: 'platform_operator_required' }, { status: 403 })
  }

  // ── 2. OWNERSHIP (C-1) ────────────────────────────────────────────────────
  // Storing a platform OAuth token is a high-value write. This route always
  // targets the default social project (ai-media-automation) via setToken, so
  // only that project's owner may replace its tokens.
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const gateDb = createAdminClient()
  const { data: proj } = await gateDb.from('projects').select('id').eq('slug', DEFAULT_SOCIAL_PROJECT_SLUG).maybeSingle()
  const projectId = (proj as { id?: string } | null)?.id
  if (!projectId) return NextResponse.json({ error: `Projekt ${DEFAULT_SOCIAL_PROJECT_SLUG} saknas` }, { status: 404 })
  if (!assertProjectAllowed(projectId, access.allowedProjectIds)) return projectForbidden()

  // ── 3. REQUEST SHAPE ──────────────────────────────────────────────────────
  let body: { platform?: unknown; token?: unknown; expires_days?: unknown } | null
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }) }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 })

  const platform = body.platform as Platform
  const token = typeof body.token === 'string' ? body.token.trim() : ''

  if (platform !== 'instagram' && platform !== 'facebook') {
    return NextResponse.json({ error: "platform måste vara 'instagram' eller 'facebook'" }, { status: 400 })
  }
  if (!token || token.length < 50) {
    return NextResponse.json({ error: 'Tokenet ser för kort ut — klistra in hela värdet' }, { status: 400 })
  }
  // Absent, null or 0 means no expiry, as before; anything else must be a real number of days.
  const rawDays = body.expires_days
  const expiresDays = typeof rawDays === 'number' && Number.isFinite(rawDays) ? rawDays : null
  if (rawDays !== undefined && rawDays !== null && (expiresDays === null || expiresDays < 0 || expiresDays > MAX_EXPIRES_DAYS)) {
    return NextResponse.json({ error: `expires_days måste vara ett antal dagar mellan 0 och ${MAX_EXPIRES_DAYS}` }, { status: 400 })
  }

  // ── 4. AUDIT: attempted — before any provider contact or store ────────────
  const operationId = randomUUID()
  const audit = { operationId, projectId, platform, actor: operator.actor }
  const attempted = await recordCredentialEvent({ ...audit, outcome: 'attempted' })
  if (!attempted.ok) {
    console.error(`[media/token] audit: attempted event not recorded (operation ${operationId}, ${platform}, code ${attempted.code}) — nothing contacted, exchanged or stored`)
    return NextResponse.json({
      ok: false,
      replaced: false,
      operation_id: operationId,
      error: 'Ersättningen kunde inte revisionsloggas och har inte genomförts. Inget token har skickats till Meta eller sparats.',
    }, { status: 503 })
  }

  // ── 5. EXCHANGE + STORE ───────────────────────────────────────────────────
  let replaced = false
  let failureStage: CredentialFailureStage = 'unexpected'
  let failureMessage = 'Kunde inte spara token'
  let detail: CredentialEventDetail = {}
  let result: Record<string, unknown> = {}
  try {
    if (platform === 'facebook') {
      const { diag, pageToken } = await onboardFacebookToken(token)
      failureStage = 'store'
      // Page-tokenet är icke-utgående → ingen expiresAt.
      await setToken('facebook', pageToken, undefined, { accountId: diag.pageId ?? undefined })
      replaced = true
      detail = { exchanged: diag.exchanged, page_resolved: diag.pageResolved, read_insights_ok: diag.readInsightsOk }
      result = { ok: true, platform, ...diag }
    } else {
      const expiresAt = expiresDays ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000) : undefined
      failureStage = 'store'
      await setToken(platform, token, expiresAt)
      replaced = true
      detail = expiresAt ? { expires_at: expiresAt.toISOString() } : {}
      result = { ok: true, platform, expires_at: expiresAt?.toISOString() ?? null }
    }
  } catch (e) {
    failureMessage = redactSecrets(e instanceof Error ? e.message : failureMessage)
  }

  // ── 6. AUDIT: terminal — exactly one, same operation ──────────────────────
  const terminal = await recordCredentialEvent({
    ...audit,
    outcome: replaced ? 'replaced' : 'failed',
    detail: replaced ? detail : { failure_stage: failureStage },
  })

  if (!terminal.ok) {
    if (replaced) {
      // AUDIT INTEGRITY INCIDENT. The credential was replaced; the record of it was
      // not completed. Not undone, not hidden.
      console.error(`[media/token] AUDIT INTEGRITY INCIDENT: ${platform} credential replaced but the replaced event was not recorded (operation ${operationId}, project ${projectId}, code ${terminal.code})`)
      return NextResponse.json({
        ok: false,
        replaced: true,
        operation_id: operationId,
        audit_incident: 'terminal_event_not_recorded',
        error: 'Tokenet ersattes, men revisionsloggen kunde inte slutföras. Ersättningen är inte ångrad — detta är en revisionsincident.',
      }, { status: 500 })
    }
    console.error(`[media/token] audit: failed event not recorded (operation ${operationId}, ${platform}, project ${projectId}, code ${terminal.code}) — the credential was not replaced`)
    return NextResponse.json({
      ok: false,
      replaced: false,
      operation_id: operationId,
      audit_incident: 'terminal_event_not_recorded',
      error: failureMessage,
    }, { status: 500 })
  }

  if (!replaced) {
    return NextResponse.json({ ok: false, replaced: false, operation_id: operationId, error: failureMessage }, { status: 500 })
  }
  return NextResponse.json({ ...result, replaced: true, operation_id: operationId })
}
