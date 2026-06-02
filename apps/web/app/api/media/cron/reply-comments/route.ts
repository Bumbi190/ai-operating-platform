/**
 * GET /api/media/cron/reply-comments
 *
 * Körs var 2:a minut via pg_cron.
 * Hittar väntande kommentarer vars reply_at har passerat,
 * genererar ett naturligt engelskt svar med Claude och postar det.
 *
 * Logik:
 *  - Max 5 svar per körning (undvik rate-limits)
 *  - Hoppar automatiskt över spam / för korta kommentarer
 *  - Skyddat av Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse }  from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAutomationPaused } from '@/lib/media/safeguards'
import { getToken } from '@/lib/media/token-store'
import { logLlmCost } from '@/lib/cost/track'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const IG_BASE = 'https://graph.facebook.com/v21.0'

function log(msg: string) {
  console.log(`[cron/reply-comments] ${msg}`)
}

// ── Generera AI-svar ──────────────────────────────────────────────────────────

async function generateReply(commentText: string, postHook: string | null): Promise<string | null> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const context = postHook
    ? `The post was about: "${postHook}"`
    : 'The post is about AI and tech news.'

  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 120,
    messages: [{
      role:    'user',
      content: `You manage a social media page called "The Prompt" that covers AI and tech news.
Someone commented on one of your posts. Write a short, friendly, genuine reply in English.

${context}

Comment: "${commentText}"

Rules:
- 1-2 sentences max, conversational tone
- Don't be generic ("Great comment!") — be specific to what they said
- If it's a question, answer it briefly or invite further discussion
- If it's spam, very short or just emojis, reply with null (literally the word null)
- Never use hashtags or emojis in the reply
- Do not start with "Great" or "Thanks for" — vary your openers

Reply (or null if spam):`,
    }],
  })

  void logLlmCost('claude-haiku-4-5-20251001', message.usage, { agent: 'Community Manager', operation: 'Reply to Comment' })

  const text = (message.content[0] as { text: string }).text.trim()
  if (text.toLowerCase() === 'null' || text.length < 5) return null
  return text
}

// ── Posta svar på Instagram ───────────────────────────────────────────────────

async function replyInstagram(commentId: string, text: string): Promise<void> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN
  if (!token) throw new Error('Missing INSTAGRAM_ACCESS_TOKEN')

  const params = new URLSearchParams({ message: text, access_token: token })
  const res    = await fetch(`${IG_BASE}/${commentId}/replies`, { method: 'POST', body: params })
  const data   = await res.json() as { id?: string; error?: { message: string } }

  if (!res.ok || !data.id) {
    throw new Error(data.error?.message ?? `Instagram reply failed (${res.status})`)
  }
}

// ── Posta svar på Facebook ────────────────────────────────────────────────────

async function replyFacebook(commentId: string, text: string): Promise<void> {
  const userToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN
  const pageId    = process.env.FACEBOOK_PAGE_ID
  if (!userToken || !pageId) throw new Error('Missing Facebook env vars')

  // Hämta Page Access Token (återanvänder samma logik som facebook.ts)
  const accountsRes  = await fetch(`${IG_BASE}/me/accounts?access_token=${userToken}`)
  const accountsData = await accountsRes.json() as { data?: Array<{ id: string; access_token: string }> }
  const page         = accountsData.data?.find(p => p.id === pageId)
  const pageToken    = page?.access_token ?? userToken

  const params = new URLSearchParams({ message: text, access_token: pageToken })
  const res    = await fetch(`${IG_BASE}/${commentId}/comments`, { method: 'POST', body: params })
  const data   = await res.json() as { id?: string; error?: { message: string } }

  if (!res.ok || !data.id) {
    throw new Error(data.error?.message ?? `Facebook reply failed (${res.status})`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // Global pauscheck
  const pauseCheck = await checkAutomationPaused(db)
  if (!pauseCheck.allowed) {
    log(`PAUSAD — ${pauseCheck.reason}`)
    return NextResponse.json({ status: 'paused', reason: pauseCheck.reason })
  }

  // ── Läs tokens från Supabase (med env-var fallback) ───────────────────────────
  // Samma mönster som cron/publish: platform_tokens-tabellen är källan, env är fallback.
  // Krävs för att svaren ska använda det färska, roterade token istället för ett
  // gammalt värde i Vercels env.
  const igStored = await getToken('instagram')
  if (igStored?.source === 'supabase') {
    process.env.INSTAGRAM_ACCESS_TOKEN = igStored.accessToken
    log('Instagram token läst från Supabase.')
  }

  const fbStored = await getToken('facebook')
  if (fbStored?.source === 'supabase') {
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = fbStored.accessToken
    log('Facebook token läst från Supabase.')
  }

  // Hämta kommentarer vars fördröjning passerat
  const { data: pending } = await db
    .from('comment_replies')
    .select('id, platform, comment_id, post_id, commenter_name, comment_text')
    .eq('reply_status', 'pending')
    .lte('reply_at', new Date().toISOString())
    .order('reply_at', { ascending: true })
    .limit(5)

  if (!pending || pending.length === 0) {
    return NextResponse.json({ status: 'nothing_to_reply', ranAt: new Date().toISOString() })
  }

  log(`Found ${pending.length} comment(s) to reply to`)

  const results = []

  for (const comment of pending) {
    try {
      // Hitta original-postens hook för kontext
      const { data: script } = await db
        .from('media_scripts')
        .select('hook')
        .or(`instagram_media_id.eq.${comment.post_id},facebook_post_id.eq.${comment.post_id}`)
        .maybeSingle()

      const reply = await generateReply(comment.comment_text, script?.hook ?? null)

      if (!reply) {
        // Spam/emoji-only — hoppa över
        await db.from('comment_replies').update({
          reply_status: 'skipped',
          replied_at:   new Date().toISOString(),
        }).eq('id', comment.id)

        log(`Skipped comment ${comment.comment_id} (spam/too short)`)
        results.push({ id: comment.id, status: 'skipped' })
        continue
      }

      // Posta svar
      if (comment.platform === 'instagram') {
        await replyInstagram(comment.comment_id, reply)
      } else {
        await replyFacebook(comment.comment_id, reply)
      }

      await db.from('comment_replies').update({
        reply_text:   reply,
        reply_status: 'replied',
        replied_at:   new Date().toISOString(),
      }).eq('id', comment.id)

      log(`Replied to ${comment.platform} comment from @${comment.commenter_name}: "${reply.slice(0, 60)}..."`)
      results.push({ id: comment.id, status: 'replied', preview: reply.slice(0, 60) })

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Error replying to ${comment.comment_id}: ${msg}`)

      await db.from('comment_replies').update({
        reply_status: 'failed',
        error:        msg,
        replied_at:   new Date().toISOString(),
      }).eq('id', comment.id)

      results.push({ id: comment.id, status: 'failed', error: msg })
    }
  }

  return NextResponse.json({ status: 'done', results, ranAt: new Date().toISOString() })
}
