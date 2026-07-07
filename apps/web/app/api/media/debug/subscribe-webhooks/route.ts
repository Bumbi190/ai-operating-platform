/**
 * GET /api/media/debug/subscribe-webhooks
 *
 * One-time setup: subscribes the Instagram Business Account and Facebook Page
 * to receive webhook events. Run this ONCE after deploying the webhook handler.
 *
 * Flow:
 *   1. Resolve Page Access Token from FACEBOOK_PAGE_ACCESS_TOKEN
 *   2. Get the Instagram Business Account ID linked to the Facebook Page
 *   3. Subscribe the IG Business Account to comment webhooks
 *   4. Subscribe the Facebook Page to feed webhooks
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse } from 'next/server'

const BASE = 'https://graph.facebook.com/v21.0'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const fbToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN
  const pageId  = process.env.FACEBOOK_PAGE_ID

  if (!fbToken || !pageId) {
    return NextResponse.json({
      error: 'Missing FACEBOOK_PAGE_ACCESS_TOKEN or FACEBOOK_PAGE_ID',
    }, { status: 500 })
  }

  const results: Record<string, unknown> = {}

  // ── 1. Resolve Page Access Token ─────────────────────────────────────────────
  const accountsRes  = await fetch(`${BASE}/me/accounts?access_token=${fbToken}`)
  const accountsData = await accountsRes.json() as {
    data?: Array<{ id: string; name: string; access_token: string }>
  }
  const page      = accountsData.data?.find(p => p.id === pageId)
  const pageToken = page?.access_token ?? fbToken
  results.page    = { id: pageId, name: page?.name ?? 'unknown', token_resolved: !!page }

  // ── 2. Get Instagram Business Account ID via the Facebook Page ────────────────
  // INSTAGRAM_ACCESS_TOKEN is actually a Facebook User token — not an IG Graph token.
  // The correct way to get the IG Business Account ID is via the Page object.
  const igPageRes  = await fetch(
    `${BASE}/${pageId}?fields=instagram_business_account&access_token=${pageToken}`
  )
  const igPageData = await igPageRes.json() as {
    instagram_business_account?: { id: string }
    error?: { message: string }
  }
  results.ig_lookup = igPageData

  const igUserId = igPageData.instagram_business_account?.id ?? null

  // ── 3. Subscribe Instagram Business Account to comment webhooks ───────────────
  if (igUserId) {
    const subRes  = await fetch(
      `${BASE}/${igUserId}/subscribed_apps?subscribed_fields=comments,mentions&access_token=${pageToken}`,
      { method: 'POST' }
    )
    const subData = await subRes.json()
    results.ig_subscribe = { ig_user_id: igUserId, status: subRes.status, data: subData }
  } else {
    results.ig_subscribe = 'Skipped — could not find Instagram Business Account linked to this Page'
  }

  // ── 4. Subscribe Facebook Page to feed webhooks ───────────────────────────────
  const fbSubRes  = await fetch(
    `${BASE}/${pageId}/subscribed_apps?subscribed_fields=feed&access_token=${pageToken}`,
    { method: 'POST' }
  )
  const fbSubData = await fbSubRes.json()
  results.fb_subscribe = { status: fbSubRes.status, data: fbSubData }

  return NextResponse.json({ status: 'done', results })
}
