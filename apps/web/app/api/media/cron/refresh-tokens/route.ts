/**
 * GET /api/media/cron/refresh-tokens
 *
 * Förnyar Instagram long-lived access token via Meta:s refresh-API.
 * Kör den 1:a varje månad kl 06:00 UTC (se vercel.json).
 *
 * Flöde:
 *   1. Hämta nuvarande token (Supabase → env-var fallback)
 *   2. Anropa GET https://graph.instagram.com/refresh_access_token
 *   3. Spara nytt token + ny expires_at till Supabase via token-store
 *
 * Facebook Page-token:
 *   Page access tokens som skapats från ett long-lived user token löper normalt
 *   inte ut. Om Facebook-posting slutar fungera — förnya manuellt via Meta Developer
 *   portal och uppdatera FACEBOOK_PAGE_ACCESS_TOKEN i Vercel.
 *
 * Nödvändiga env vars:
 *   CRON_SECRET — skyddar endpointen (sätts i Vercel)
 *   INSTAGRAM_ACCESS_TOKEN — nuvarande token (används på första körningen)
 *
 * Saknade env vars:
 *   META_APP_ID / META_APP_SECRET behövs INTE för ig_refresh_token-flödet.
 *   Instagram refreshar tokenet utan app credentials — tillräckligt med nuvarande token.
 *
 * Docs: https://developers.facebook.com/docs/instagram-basic-display-api/reference/refresh_access_token
 */

import { NextResponse } from 'next/server'
import { getToken, setToken } from '@/lib/media/token-store'
import { sendPipelineAlert, sendTokenExpiryWarning } from '@/lib/media/alert'

export const dynamic    = 'force-dynamic'
export const maxDuration = 30

// Instagram Graph API för Business använder Facebook User Tokens.
// Dessa förnyas via graph.facebook.com med fb_exchange_token — INTE via
// graph.instagram.com/refresh_access_token (det är för Basic Display API / personkonton).
const FB_TOKEN_URL = 'https://graph.facebook.com/oauth/access_token'

function log(msg: string) {
  console.log(`[cron/refresh-tokens] ${msg}`)
}

export async function GET(request: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, unknown> = {}

  // ── Instagram ─────────────────────────────────────────────────────────────────
  log('Startar Instagram token-refresh...')

  const appId     = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  const currentIg = await getToken('instagram')

  if (!currentIg) {
    const msg = 'Inget Instagram-token hittat (varken i Supabase eller INSTAGRAM_ACCESS_TOKEN). Sätt env-variabeln i Vercel.'
    log(`⚠️  ${msg}`)
    results.instagram = { status: 'skipped', reason: msg }
  } else if (currentIg.accessToken.startsWith('IG')) {
    // ── IGAA (Instagram Login) — förnya via Instagrams egen ig_refresh_token ──
    // Kräver INGA app-credentials och är fristående från Facebook-webbsessionen,
    // så token dör inte när FB-sessionen loggar ut. Detta är den robusta vägen.
    log('IGAA-token upptäckt. Förnyar via graph.instagram.com/refresh_access_token...')
    try {
      const url = new URL('https://graph.instagram.com/refresh_access_token')
      url.searchParams.set('grant_type',  'ig_refresh_token')
      url.searchParams.set('access_token', currentIg.accessToken)

      const res  = await fetch(url.toString())
      const data = await res.json() as { access_token?: string; expires_in?: number; error?: { message: string } }

      if (!res.ok || data.error || !data.access_token) {
        throw new Error(data.error?.message ?? `Instagram API ${res.status}`)
      }

      const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined
      await setToken('instagram', data.access_token, expiresAt)

      const daysUntilExpiry = expiresAt
        ? Math.round((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null
      log(`✓ Instagram (IGAA) token förnyat. Löper ut om ${daysUntilExpiry ?? '?'} dagar.`)
      results.instagram = { status: 'refreshed', flow: 'ig_refresh_token', expiresAt: expiresAt?.toISOString() ?? null, daysUntilExpiry }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`✗ Instagram (IGAA) refresh misslyckades: ${msg}`)
      await sendPipelineAlert({
        cronRoute: 'cron/refresh-tokens',
        step:      'instagram_token_refresh',
        error:     msg,
        context:   { flow: 'ig_refresh_token', tip: 'IGAA-token måste förnyas inom 60 dagar och vara minst 24h gammalt.' },
      })
      results.instagram = { status: 'failed', error: msg }
    }
  } else if (!appId || !appSecret) {
    const msg = 'META_APP_ID eller META_APP_SECRET saknas i env. Sätt dem i Vercel → Environment Variables.'
    log(`⚠️  ${msg}`)
    results.instagram = { status: 'skipped', reason: msg }
  } else {
      log(`Nuvarande token hämtat från ${currentIg.source}. Förnyar via Meta fb_exchange_token...`)

      try {
        // Byt nuvarande long-lived token mot ett nytt (fungerar med både short- och long-lived tokens)
        const url = new URL(FB_TOKEN_URL)
        url.searchParams.set('grant_type',       'fb_exchange_token')
        url.searchParams.set('client_id',        appId)
        url.searchParams.set('client_secret',    appSecret)
        url.searchParams.set('fb_exchange_token', currentIg.accessToken)

        const res = await fetch(url.toString())

        if (!res.ok) {
          const body = await res.text().catch(() => '(no body)')
          throw new Error(`Meta API ${res.status}: ${body}`)
        }

        const data = await res.json() as {
          access_token?: string
          token_type?:   string
          expires_in?:   number
          error?:        { message: string; type: string; code: number }
        }

        if (data.error) {
          throw new Error(`Meta API-fel: ${data.error.type} (${data.error.code}) — ${data.error.message}`)
        }

        if (!data.access_token) {
          throw new Error('Meta API returnerade inget access_token')
        }

        // expires_in är sekunder från nu
        const expiresAt = data.expires_in
          ? new Date(Date.now() + data.expires_in * 1000)
          : undefined

        await setToken('instagram', data.access_token, expiresAt)

        const daysUntilExpiry = expiresAt
          ? Math.round((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : null

        log(`✓ Instagram token förnyat. Löper ut om ${daysUntilExpiry ?? '?'} dagar.`)
        results.instagram = {
          status:         'refreshed',
          expiresAt:      expiresAt?.toISOString() ?? null,
          daysUntilExpiry,
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log(`✗ Instagram refresh misslyckades: ${msg}`)
        await sendPipelineAlert({
          cronRoute: 'cron/refresh-tokens',
          step:      'instagram_token_refresh',
          error:     msg,
          context:   { tip: 'Kontrollera META_APP_ID, META_APP_SECRET och att INSTAGRAM_ACCESS_TOKEN är satt i Vercel' },
        })
        results.instagram = { status: 'failed', error: msg }
      }
  }

  // ── Facebook ──────────────────────────────────────────────────────────────────
  // Page access tokens skapade från long-lived user tokens löper normalt inte ut.
  // Vi loggar bara nuvarande status utan att försöka refresha.
  const currentFb = await getToken('facebook')
  log(
    currentFb
      ? `Facebook token finns (source=${currentFb.source}). Page-tokens kräver inget automatiskt refresh.`
      : 'Facebook token saknas — sätt FACEBOOK_PAGE_ACCESS_TOKEN i Vercel om Facebook-publicering används.'
  )
  results.facebook = {
    status:   currentFb ? 'ok_no_refresh_needed' : 'missing',
    source:   currentFb?.source ?? null,
    expiresAt: currentFb?.expiresAt?.toISOString() ?? null,
  }

  // ── Sammanfattning ────────────────────────────────────────────────────────────
  const overallOk = results.instagram !== undefined &&
    (results.instagram as { status: string }).status !== 'failed'

  return NextResponse.json(
    {
      ranAt:  new Date().toISOString(),
      ok:     overallOk,
      results,
    },
    { status: overallOk ? 200 : 500 }
  )
}
