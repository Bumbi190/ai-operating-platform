/**
 * GET /api/media/debug/subscribe-webhooks?project_id=<uuid>
 *
 * One-time setup for ONE project: subscribes that project's verified Facebook page
 * to feed webhooks and — when the Instagram account linked to that page is the
 * project's own verified Instagram binding — that account to comment webhooks.
 *
 * Credentials (project-scoped social credentials, 2026-09-14): the page and its token
 * come from the project's verified Facebook binding (lib/media/social-credentials.ts),
 * never from environment variables. No project_id or no verified binding: nothing is
 * called. The answer carries ids and HTTP statuses only — never a provider body.
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse } from 'next/server'
import { isProjectId, readActiveBinding } from '@/lib/media/social-bindings'
import { resolveFacebookCredential } from '@/lib/media/social-credentials'

const BASE = 'https://graph.facebook.com/v21.0'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectId = new URL(request.url).searchParams.get('project_id')
  if (!isProjectId(projectId)) {
    return NextResponse.json({ error: 'project_id (uuid) krävs — webhooks sätts upp per projekt' }, { status: 400 })
  }

  const facebook = await resolveFacebookCredential(projectId)
  if (!facebook.ok) {
    return NextResponse.json({ error: 'no_verified_facebook_credential', refusal: facebook.refusal }, { status: 409 })
  }
  const { pageId, pageToken, pageName } = facebook.credential
  const auth = { Authorization: `Bearer ${pageToken}` }
  const results: Record<string, unknown> = { page: { id: pageId, name: pageName } }

  // ── Instagram: only the project's own verified account, linked to its page ──
  const igBinding = await readActiveBinding(projectId, 'instagram')
  let linkedId: string | null = null
  try {
    const linkedRes = await fetch(`${BASE}/${pageId}?fields=instagram_business_account`, { headers: auth })
    const linked = await linkedRes.json().catch(() => null) as { instagram_business_account?: { id?: unknown } } | null
    linkedId = typeof linked?.instagram_business_account?.id === 'string' ? linked.instagram_business_account.id : null
  } catch { linkedId = null }

  if (!igBinding.ok) {
    results.ig_subscribe = { skipped: 'binding_unreadable' }
  } else if (!igBinding.binding) {
    results.ig_subscribe = { skipped: 'binding_missing' }
  } else if (!linkedId || linkedId !== igBinding.binding.externalAccountId) {
    results.ig_subscribe = { skipped: 'linked_account_is_not_the_project_binding' }
  } else {
    const subRes = await fetch(`${BASE}/${linkedId}/subscribed_apps?subscribed_fields=comments,mentions`, {
      method: 'POST', headers: auth,
    })
    results.ig_subscribe = { ig_user_id: linkedId, status: subRes.status }
  }

  // ── Facebook page feed ──────────────────────────────────────────────────────
  const fbSubRes = await fetch(`${BASE}/${pageId}/subscribed_apps?subscribed_fields=feed`, {
    method: 'POST', headers: auth,
  })
  results.fb_subscribe = { page_id: pageId, status: fbSubRes.status }

  return NextResponse.json({ status: 'done', project_id: projectId, results })
}
