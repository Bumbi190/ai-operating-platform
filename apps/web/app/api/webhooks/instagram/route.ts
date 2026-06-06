/**
 * /api/webhooks/instagram
 *
 * Hanterar Meta webhooks för Instagram-kommentarer och Facebook Page-kommentarer.
 *
 * GET  — webhook-verifiering (Meta skickar hub.challenge)
 * POST — inkommande events; sparar kommentarer till comment_replies-kön
 *
 * Setup i Meta Developer Dashboard:
 *   1. App → Webhooks → Add Callback URL:
 *      https://ai-operating-platform-web.vercel.app/api/webhooks/instagram
 *   2. Verify Token: värdet av WEBHOOK_VERIFY_TOKEN i Vercel env
 *   3. Prenumerera på:
 *      - Instagram → comments
 *      - Facebook Page → feed (för sidkommentarer)
 *
 * Env vars som krävs:
 *   WEBHOOK_VERIFY_TOKEN — valfri hemlig sträng, matcha i Meta-dashboarden
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// ── GET: Meta webhook-verifiering ─────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('[webhook/instagram] Webhook verified ✓')
    return new Response(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ── POST: inkommande events ────────────────────────────────────────────────────

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const db      = createAdminClient()
  const payload = body as Record<string, unknown>
  const entries: unknown[] = Array.isArray(payload.entry) ? payload.entry as unknown[] : []

  for (const entry of entries) {
    const e       = entry as Record<string, unknown>
    const changes = Array.isArray(e.changes) ? e.changes as unknown[] : []

    for (const change of changes) {
      const c     = change as Record<string, unknown>
      const field = c.field as string
      const value = c.value as Record<string, unknown>

      // ── Instagram-kommentarer ─────────────────────────────────────────────
      if (field === 'comments' && payload.object === 'instagram') {
        const commentId   = value.id as string
        const commentText = (value.text ?? value.message) as string
        const postId      = (value.media as Record<string, unknown>)?.id as string
        const fromUser    = value.from as Record<string, unknown>
        const username    = (fromUser?.username ?? fromUser?.name ?? '') as string
        const fromId      = (fromUser?.id ?? '') as string

        if (!commentId || !commentText || !postId) continue

        // Self-filter: hoppa över kommentarer från VÅRT eget konto — annars feedback-loop.
        // OBS: `from_self` finns INTE på IG comment-webhooks → jämför författaren i stället.
        const SELF_USERNAME = (process.env.IG_SELF_USERNAME ?? 'theprompt.news').toLowerCase()
        const SELF_ID       = process.env.IG_SELF_ACCOUNT_ID ?? '' // sätts efter account_id-backfill
        if ((SELF_ID && fromId === SELF_ID) || username.toLowerCase() === SELF_USERNAME) continue

        await db.from('comment_replies').upsert({
          platform:      'instagram',
          comment_id:    commentId,
          post_id:       postId,
          commenter_name: username,
          comment_text:  commentText,
          reply_status:  'pending',
          received_at:   new Date().toISOString(),
          reply_at:      new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        }, { onConflict: 'comment_id', ignoreDuplicates: true })
      }

      // ── Facebook Page-kommentarer ─────────────────────────────────────────
      if (field === 'feed' && payload.object === 'page') {
        const item      = value.item as string
        if (item !== 'comment') continue

        const commentId   = value.comment_id as string
        const commentText = value.message as string
        const postId      = (value.post_id ?? value.parent_id) as string
        const fromUser    = value.from as Record<string, unknown>
        const username    = (fromUser?.name ?? '') as string
        const fromId      = (fromUser?.id ?? '') as string

        // Hoppa över replies (kommentarer på kommentarer) och tomma
        if (!commentId || !commentText || !postId) continue
        if (value.parent_id && value.parent_id !== value.post_id) continue
        // Self-filter: hoppa över sidans egna kommentarer (FACEBOOK_PAGE_ID).
        if (process.env.FACEBOOK_PAGE_ID && fromId === process.env.FACEBOOK_PAGE_ID) continue

        await db.from('comment_replies').upsert({
          platform:       'facebook',
          comment_id:     commentId,
          post_id:        postId,
          commenter_name: username,
          comment_text:   commentText,
          reply_status:   'pending',
          received_at:    new Date().toISOString(),
          reply_at:       new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        }, { onConflict: 'comment_id', ignoreDuplicates: true })
      }
    }
  }

  // Meta kräver snabbt 200-svar
  return NextResponse.json({ status: 'ok' })
}
