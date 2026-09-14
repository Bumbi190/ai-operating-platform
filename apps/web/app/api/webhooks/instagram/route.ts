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
 *   META_APP_SECRET      — Meta-appens hemlighet; används för att verifiera
 *                          X-Hub-Signature-256 på inkommande POST. UTAN denna
 *                          är endpointen avstängd (fail-closed).
 *
 * KONTOIDENTITET (project-scoped social credentials, 2026-09-14). Vilket konto en
 * kommentar kom in för — och därmed vilka kommentarer som är våra egna — avgörs av
 * projektets verifierade kontobindning, aldrig av env-variabler eller ett hårdkodat
 * användarnamn. Instagram: bindningen för kontot Meta anger i entryn, annars
 * bindningen för projektet vars egna publicerade inlägg kommenterades. Facebook:
 * bindningen för sidan Meta anger i entryn. En kommentar till ett konto utan
 * verifierad bindning köas inte — inget verifierat konto skulle kunna besvara den.
 */

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  isProjectId,
  readActiveBinding,
  readActiveBindingForAccount,
  type SocialAccountBinding,
} from '@/lib/media/social-bindings'

export const dynamic = 'force-dynamic'

type AdminDb = ReturnType<typeof createAdminClient>

// ── Signaturverifiering (Meta X-Hub-Signature-256) ────────────────────────────
//
// Meta signerar varje webhook-POST med app-hemligheten:
//   X-Hub-Signature-256: sha256=<HMAC-SHA256(app_secret, RÅ request-body)>
//
// Utan denna kontroll kan vem som helst POSTa förfalskade kommentar-events till
// den publika callback-URL:en → de hamnar i comment_replies-kön och besvaras
// PUBLIKT av reply-cronen. Verifieringen sker mot den RÅA bodyn (inte JSON-parsad,
// eftersom omserialisering ändrar bytes) med timingsäker jämförelse.
function verifyMetaSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false
  // Header-format: "sha256=<hex>". Acceptera bara sha256-prefixet.
  const [algo, providedHex] = signatureHeader.split('=')
  if (algo !== 'sha256' || !providedHex) return false

  const expectedHex = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')

  const providedBuf = Buffer.from(providedHex, 'hex')
  const expectedBuf = Buffer.from(expectedHex, 'hex')
  // Längdskillnad → timingSafeEqual kastar; jämför längd först (icke-hemlig).
  if (providedBuf.length !== expectedBuf.length) return false
  try {
    return crypto.timingSafeEqual(providedBuf, expectedBuf)
  } catch {
    return false
  }
}

/**
 * The verified Instagram binding a comment arrived for: the binding of the account
 * Meta names in the entry, or else the binding of the project whose own published
 * post was commented on. Null when neither can be proven.
 */
async function instagramBindingFor(db: AdminDb, entryAccountId: string, mediaId: string): Promise<SocialAccountBinding | null> {
  if (entryAccountId) {
    const byAccount = await readActiveBindingForAccount('instagram', entryAccountId, db)
    if (byAccount.ok && byAccount.binding) return byAccount.binding
  }
  const { data: script } = await db
    .from('media_scripts')
    .select('project_id')
    .eq('instagram_media_id', mediaId)
    .maybeSingle()
  const projectId = (script as { project_id?: unknown } | null)?.project_id
  if (!isProjectId(projectId)) return null
  const byProject = await readActiveBinding(projectId, 'instagram', db)
  return byProject.ok ? byProject.binding : null
}

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
  // ── Auth: verifiera Meta-signaturen FÖRE all bearbetning ────────────────────
  // FAIL-CLOSED: saknas app-hemligheten kan vi inte verifiera → processa inget.
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) {
    console.error('[webhook/instagram] META_APP_SECRET saknas — avvisar POST (fail-closed).')
    return NextResponse.json({ error: 'Webhook signature verification not configured' }, { status: 500 })
  }

  // RÅ body krävs för signaturen — läs som text, verifiera, parsa sedan.
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256')
  if (!verifyMetaSignature(rawBody, signature, appSecret)) {
    console.warn('[webhook/instagram] Ogiltig eller saknad X-Hub-Signature-256 — avvisar.')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const db      = createAdminClient()
  const payload = body as Record<string, unknown>
  const entries: unknown[] = Array.isArray(payload.entry) ? payload.entry as unknown[] : []

  for (const entry of entries) {
    const e       = entry as Record<string, unknown>
    const entryId = typeof e.id === 'string' || typeof e.id === 'number' ? String(e.id) : ''
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

        // Whose account is this? The verified binding says — and that account's own
        // comments are skipped, or the reply cron would answer itself.
        // OBS: `from_self` finns INTE på IG comment-webhooks → jämför författaren i stället.
        const account = await instagramBindingFor(db, entryId, postId)
        if (!account) {
          console.warn('[webhook/instagram] Instagram-kommentar för ett konto utan verifierad bindning — köas inte.')
          continue
        }
        const selfName = account.accountLabel?.toLowerCase() ?? null
        if (fromId === account.externalAccountId || (selfName !== null && username.toLowerCase() === selfName)) continue

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

        // The page Meta names in the entry, as a project's verified binding — and the
        // page's own comments are skipped.
        const page = entryId ? await readActiveBindingForAccount('facebook', entryId, db) : null
        if (!page || !page.ok || !page.binding) {
          console.warn('[webhook/instagram] Facebook-kommentar för en sida utan verifierad bindning — köas inte.')
          continue
        }
        if (fromId === page.binding.externalAccountId) continue

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
