/**
 * GET /api/media/debug/subscribe-webhooks
 *
 * One-time setup: subscribes the Instagram Business Account and Facebook Page
 * to receive webhook events. Run this ONCE after deploying the webhook handler.
 *
 * Without this call, Meta's app-level webhook subscription only registers the URL.
 * You also need to tell each account to actually send its events to that URL.
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse } from 'next/server'

const BASE = 'https://graph.facebook.com/v21.0'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const igToken  = process.env.INSTAGRAM_ACCESS_TOKEN
  const fbToken  = process.env.FACEBOOK_PAGE_ACCESS_TOKEN
  const pageId   = process.env.FACEBOOK_PAGE_ID

  const results: Record<string, unknown> = {}

  // ── 1. Get Instagram Business Account ID ──────────────────────────────────────
  let igUserId: string | null = null
  if (igToken) {
    const meRes  = await fetch(`${BASE}/me?fields=id,name,username&access_token=${igToken}`)
    const meData = await meRes.json() as { id?: string; name?: string; username?: string; error?: { message: string } }
    results.ig_me = meData
    igUserId = meData.id ?? null
  } else {
    results.ig_me = 'INSTAGRAM_ACCESS_TOKEN not set'
  }

  // ── 2. Subscribe Instagram account to comments webhooks ───────────────────────
  if (igUserId && igToken) {
    const subRes  = await fetch(
      `${BASE}/${igUserId}/subscribed_fields?subscribed_fields=comments,mentions&access_token=${igToken}`,
      { method: 'POST' }
    )
    const subData = await subRes.json()
    results.ig_subscribe = { status: subRes.status, data: subData }
  } else {
    results.ig_subscribe = 'Skipped (no IG token or user ID)'
  }

  // ── 3. Subscribe Facebook Page to feed webhooks ───────────────────────────────
  if (fbToken && pageId) {
    // First resolve Page Access Token
    const accountsRes  = await fetch(`${BASE}/me/accounts?access_token=${fbToken}`)
    const accountsData = await accountsRes.json() as { data?: Array<{ id: string; access_token: string }> }
    const page         = accountsData.data?.find(p => p.id === pageId)
    const pageToken    = page?.access_token ?? fbToken

    const fbSubRes  = await fetch(
      `${BASE}/${pageId}/subscribed_apps?subscribed_fields=feed,comments&access_token=${pageToken}`,
      { method: 'POST' }
    )
    const fbSubData = await fbSubRes.json()
    results.fb_subscribe = { status: fbSubRes.status, data: fbSubData }
  } else {
    results.fb_subscribe = 'Skipped (FACEBOOK_PAGE_ACCESS_TOKEN or FACEBOOK_PAGE_ID not set)'
  }

  return NextResponse.json({ status: 'done', results })
}
