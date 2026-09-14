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
 *
 * CREDENTIAL (project-scoped social credentials, 2026-09-14): ett svar skickas med
 * den verifierade credentialn för kommentarens EGET projekt, på kommentarens
 * plattform (lib/media/social-credentials.ts) — aldrig ett env-token, aldrig ett
 * annat projekts konto. Credentialn löses innan något svar genereras, så ingen
 * kostnad uppstår för en kommentar som inget verifierat konto får besvara.
 */

import { NextResponse }  from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertExecutionDispatchAllowed, isExecutionStopped } from '@/lib/governance/execution-dispatch'
import { logLlmCost } from '@/lib/cost/track'
import Anthropic from '@anthropic-ai/sdk'
import { getAnthropic } from '@/lib/ai/anthropic'
import { MEDIA_PIPELINE_PROJECT } from '@/lib/cost/governed-spend'
import { projectScope, type ExecutionContract } from '@/lib/governance/execution-stop'
import {
  createCredentialResolver,
  type FacebookCredential,
  type InstagramCredential,
} from '@/lib/media/social-credentials'
import { redactSecrets } from '@/lib/media/meta-errors'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const FB_BASE = 'https://graph.facebook.com/v21.0'

function log(msg: string) {
  console.log(`[cron/reply-comments] ${msg}`)
}

// ── Generera AI-svar ──────────────────────────────────────────────────────────

async function generateReply(
  commentText: string, postHook: string | null, execution: ExecutionContract,
): Promise<string | null> {
  const client = getAnthropic({
    // Billing stays on the pipeline project; authority is the caller's, which is
    // the project the comment's own post belongs to. Same latent defect as
    // step3: with every script in one project today the two coincide, and that
    // coincidence is not architecture.
    project: MEDIA_PIPELINE_PROJECT, execution, agent: 'Community Manager', operation: 'Reply to Comment',
  })

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


  const text = (message.content[0] as { text: string }).text.trim()
  if (text.toLowerCase() === 'null' || text.length < 5) return null
  return text
}

// ── Posta svar på Instagram ───────────────────────────────────────────────────

async function replyInstagram(credential: InstagramCredential, commentId: string, text: string): Promise<void> {
  // Instagram-login credentials post via graph.instagram.com, Facebook-login via
  // graph.facebook.com — the credential carries which. The token travels as a header.
  const res  = await fetch(`${credential.apiBase}/${commentId}/replies`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${credential.token}` },
    body:    new URLSearchParams({ message: text }),
  })
  const data = await res.json().catch(() => null) as { id?: string; error?: { message: string } } | null

  if (!res.ok || !data?.id) {
    throw new Error(redactSecrets(data?.error?.message ?? `Instagram reply failed (${res.status})`))
  }
}

// ── Posta svar på Facebook ────────────────────────────────────────────────────

async function replyFacebook(credential: FacebookCredential, commentId: string, text: string): Promise<void> {
  // The page token Meta confirmed IS the project's bound page.
  const res  = await fetch(`${FB_BASE}/${commentId}/comments`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${credential.pageToken}` },
    body:    new URLSearchParams({ message: text }),
  })
  const data = await res.json().catch(() => null) as { id?: string; error?: { message: string } } | null

  if (!res.ok || !data?.id) {
    throw new Error(redactSecrets(data?.error?.message ?? `Facebook reply failed (${res.status})`))
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // Den legacy-globala engångskontrollen stod här. Den såg inte PROJEKT-stopp och
  // lästes en gång per körning, så ett stopp mitt i loopen hindrade inte nästa
  // svar. Ersatt av en färsk kanonisk kontroll omedelbart före varje svar.

  // Hämta kommentarer vars fördröjning passerat
  const { data: pending } = await db
    .from('comment_replies')
    .select('id, project_id, platform, comment_id, post_id, commenter_name, comment_text')
    .eq('reply_status', 'pending')
    .lte('reply_at', new Date().toISOString())
    .order('reply_at', { ascending: true })
    .limit(5)

  if (!pending || pending.length === 0) {
    return NextResponse.json({ status: 'nothing_to_reply', ranAt: new Date().toISOString() })
  }

  log(`Found ${pending.length} comment(s) to reply to`)

  const results = []
  const credentials = createCredentialResolver()

  for (const comment of pending) {
    try {
      // Hitta original-postens hook för kontext
      const { data: script } = await db
        .from('media_scripts')
        .select('hook, project_id')
        .or(`instagram_media_id.eq.${comment.post_id},facebook_post_id.eq.${comment.post_id}`)
        .maybeSingle()

      // Authority comes from the comment's own project, or failing that from the
      // post it belongs to. Never from the billing slug: a reply is that
      // project's outward speech, and its pause must silence it.
      const projectId = (comment.project_id as string | null)
        ?? ((script as { project_id?: string } | null)?.project_id ?? null)
      if (!projectId) {
        // No establishable project means no establishable authority. Fail closed
        // and leave the row pending — inventing a project from billing is
        // exactly the bypass this slice exists to remove.
        log(`Hoppar över ${comment.comment_id}: inget projekt kunde härledas — svarar inte`)
        results.push({ id: comment.id, status: 'skipped_no_project' })
        continue
      }
      const execution: ExecutionContract = {
        context: 'AUTONOMOUS', scope: projectScope({ projectId }),
      }

      // The project's own verified account on the comment's platform.
      let post: ((text: string) => Promise<void>) | null = null
      let refusal: string | null = null
      if (comment.platform === 'instagram') {
        const instagram = await credentials.instagram(projectId)
        if (instagram.ok) post = (text) => replyInstagram(instagram.credential, comment.comment_id, text)
        else refusal = instagram.refusal
      } else {
        const facebook = await credentials.facebook(projectId)
        if (facebook.ok) post = (text) => replyFacebook(facebook.credential, comment.comment_id, text)
        else refusal = facebook.refusal
      }
      if (!post) {
        const error = `credential_refused:${refusal}`
        log(`Hoppar över ${comment.comment_id}: ingen verifierad ${comment.platform}-credential för projektet (${refusal})`)
        await db.from('comment_replies').update({
          reply_status: 'failed',
          error,
          replied_at:   new Date().toISOString(),
        }).eq('id', comment.id)
        results.push({ id: comment.id, status: 'failed', error })
        continue
      }

      const reply = await generateReply(comment.comment_text, script?.hook ?? null, execution)

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

      // GOVERNANCE BOUNDARY — omedelbart före svaret lämnar maskinen. Per
      // kommentar, så ett stopp efter kommentar 1 hindrar kommentar 2.
      await assertExecutionDispatchAllowed(execution, {
        system: comment.platform === 'instagram' ? 'instagram' : 'facebook',
        operation: 'reply_to_comment',
      })

      // Posta svar
      await post(reply)

      await db.from('comment_replies').update({
        reply_text:   reply,
        reply_status: 'replied',
        replied_at:   new Date().toISOString(),
      }).eq('id', comment.id)

      log(`Replied to ${comment.platform} comment from @${comment.commenter_name}: "${reply.slice(0, 60)}..."`)
      results.push({ id: comment.id, status: 'replied', preview: reply.slice(0, 60) })

    } catch (err) {
      if (isExecutionStopped(err)) {
        // Ingenting skickades. Raden får INTE markeras 'failed' — den ligger
        // kvar som 'pending' och tas om efter resume. Resten av kön lyder samma
        // auktoritet, så loopen avbryts.
        log(`Uppskjuten av stopp (${err.reason}) för ${comment.comment_id} — avbryter kön`)
        results.push({ id: comment.id, status: 'deferred_by_stop', reason: err.reason })
        break
      }
      const msg = redactSecrets(err instanceof Error ? err.message : String(err))
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
