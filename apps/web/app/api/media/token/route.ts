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
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { setToken, type Platform } from '@/lib/media/token-store'

export const dynamic = 'force-dynamic'

const FB_GRAPH = 'https://graph.facebook.com/v21.0'

/**
 * Växlar ett kortlivat FB user-token → långlivat user-token → icke-utgående page-token,
 * och verifierar read_insights. Degraderar steg för steg: misslyckas växlingen sparas
 * det inklistrade tokenet ändå (best-effort), med diagnostik i svaret.
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

  // 3) Verifiera read_insights via ett page-insights-anrop (best-effort).
  if (pageId) {
    try {
      const r = await fetch(`${FB_GRAPH}/${pageId}/insights?metric=page_impressions&period=day&access_token=${encodeURIComponent(pageToken)}`)
      const j = await r.json() as { data?: unknown[]; error?: { message?: string } }
      diag.readInsightsOk = !j.error && Array.isArray(j.data)
      if (j.error) diag.warnings.push(`read_insights-koll: ${j.error.message}`)
    } catch (e) { diag.warnings.push(`Insights-koll fel: ${e instanceof Error ? e.message : 'okänt'}`) }
  }

  // 4) Spara page-tokenet (icke-utgående → ingen expiresAt).
  await setToken('facebook', pageToken, undefined, { accountId: pageId ?? undefined })
  return diag
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { platform?: string; token?: string; expires_days?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }) }

  const platform = body.platform as Platform
  const token = body.token?.trim()

  if (platform !== 'instagram' && platform !== 'facebook') {
    return NextResponse.json({ error: "platform måste vara 'instagram' eller 'facebook'" }, { status: 400 })
  }
  if (!token || token.length < 50) {
    return NextResponse.json({ error: 'Tokenet ser för kort ut — klistra in hela värdet' }, { status: 400 })
  }

  try {
    if (platform === 'facebook') {
      const diag = await onboardFacebookToken(token)
      return NextResponse.json({ ok: true, platform, ...diag })
    }

    const expiresAt = body.expires_days
      ? new Date(Date.now() + body.expires_days * 24 * 60 * 60 * 1000)
      : undefined
    await setToken(platform, token, expiresAt)
    return NextResponse.json({ ok: true, platform, expires_at: expiresAt?.toISOString() ?? null })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Kunde inte spara token' }, { status: 500 })
  }
}
