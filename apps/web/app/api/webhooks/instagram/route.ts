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
 *   WEBHOOK_VERIFY_TOKEN — verifieringssträng för GET-handshaken (matcha i Meta-dashboarden)
 *   META_APP_SECRET      — Metas app-secret; POST-signaturen (X-Hub-Signature-256) verifieras mot den
 *
 * PR-2 (isolationshärdning):
 *   - POST verifierar Metas HMAC-signatur → osignerade/förfalskade events avvisas (401).
 *   - Varje kommentar scopas till ägande projekt (post_id → media_scripts → project_id).
 *     Inlägg vi inte äger hoppas över (fail-safe), så project_id aldrig blir NULL för nya rader.
 */

import crypto from 'node:crypto'
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
  // ── PR-2: verifiera Metas X-Hub-Signature-256 (HMAC-SHA256 av RÅ body) ───────
  // Rå text krävs så HMAC räknas på exakt de bytes Meta signerade.
  const raw    = await request.text()
  const sig    = request.headers.get('x-hub-signature-256') ?? ''
  const secret = process.env.META_APP_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Webhook secret missing' }, { status: 500 })
  }
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex')
  const ok = sig.length === expected.length &&
             crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  if (!ok) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
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

        // PR-2: scopa till ägande projekt (post_id → media_scripts → project_id).
        const { data: ms } = await db
          .from('media_scripts')
          .select('project_id')
          .eq('instagram_media_id', postId)
          .not('project_id', 'is', null)
          .maybeSingle()
        if (!ms?.project_id) continue   // inte vårt inlägg → skippa (fail-safe, ingen NULL-rad)

        await db.from('comment_replies').upsert({
          project_id:     ms.project_id,
          platform:       'instagram',
          comment_id:     commentId,
          post_id:        postId,
          commenter_name: username,
          comment_text:   commentText,
          reply_status:   'pending',
          received_at:    new Date().toISOString(),
          reply_at:       new Date(Date.now() + 5 * 60 * 1000).toISOString(),
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

        // PR-2: scopa till ägande projekt (post_id → media_scripts → project_id).
        // FB fail-safe: stored facebook_post_id är bart post-id; tills riktig FB-webhook-data
        // bekräftar formatet matchar inget → kommentaren skippas (ingen NULL-rad, ingen läcka).
        const { data: ms } = await db
          .from('media_scripts')
          .select('project_id')
          .eq('facebook_post_id', postId)
          .not('project_id', 'is', null)
          .maybeSingle()
        if (!ms?.project_id) continue

        await db.from('comment_replies').upsert({
          project_id:     ms.project_id,
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
