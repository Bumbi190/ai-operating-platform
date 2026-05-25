/**
 * POST /api/media/scripts/[id]/regenerate
 *
 * Rewrites the hook + script for an existing script row using Claude,
 * keeping the same news item and voice/image assets.
 *
 * Body: { what: 'script' | 'image' | 'both' }
 *
 * 'script'  — rewrites hook + body via Claude, bumps version, clears voice
 * 'image'   — regenerates the Ideogram background image only
 * 'both'    — does both (script first, then image)
 *
 * Returns the updated script row.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Anthropic } from '@anthropic-ai/sdk'
import type { ScriptWriterOutput } from '@/lib/media/types'

export const dynamic    = 'force-dynamic'
export const maxDuration = 180  // 3 parallel Ideogram calls can take up to 2min

const SCRIPT_SYSTEM = `You are a short-form video scriptwriter specializing in premium AI documentary content for TikTok and Instagram Reels.

Your videos are: factual, fast-paced, retention-optimized. Think Bloomberg QuickTake meets Wired Magazine — not hype, not fluff.

Voice: Victoria (warm, trustworthy, conversational). Write FOR how Victoria speaks — natural rhythm, punchy sentences, no filler.

Script rules:
- Hook: 1 sentence that creates immediate curiosity or surprise (max 15 words). MUST be different from the previous hook.
- Body: 3–5 paragraphs, each landing one clear idea. Short sentences. No jargon without explanation.
- Total reading time: 50–75 seconds at natural pace
- NO "In this video" / "Make sure to subscribe" / generic openers
- End with a memorable insight or open question — not a CTA

Return ONLY valid JSON (no markdown fences):
{
  "hook": "...",
  "script": "Full voiceover script...",
  "captions": ["Short display caption 1", "Short display caption 2"],
  "hashtags": ["#AI", "#Tech"],
  "cta": "One-line CTA for caption",
  "tone": "educational",
  "estimated_duration": "~65 seconds",
  "difficulty": "intermediate"
}`

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { what = 'script' } = await request.json() as { what?: 'script' | 'image' | 'both' }

  const db = createAdminClient()

  // Load current script + linked news item
  const { data: script, error: scriptErr } = await db
    .from('media_scripts')
    .select('*, media_news_items(title, summary, key_insight, content_angle, virality_score)')
    .eq('id', id)
    .single()

  if (scriptErr || !script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}

  // ── Regenerate script ────────────────────────────────────────────────────────
  if (what === 'script' || what === 'both') {
    const claude = new Anthropic()

    const newsItem = Array.isArray(script.media_news_items)
      ? script.media_news_items[0]
      : script.media_news_items

    const context = newsItem
      ? `Title: ${newsItem.title}\nSummary: ${newsItem.summary ?? ''}\nKey insight: ${newsItem.key_insight ?? ''}\nAngle: ${newsItem.content_angle ?? 'educational'}`
      : `Previous hook: "${script.hook}"\nPrevious script: "${String(script.script ?? '').slice(0, 400)}"`

    const userMsg = `Rewrite this short-form video script with a FRESH angle and DIFFERENT hook than before.

${context}

Previous hook (do NOT reuse): "${script.hook}"

Write a new script that covers the same story but from a different entry point or narrative frame.`

    const res = await claude.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 2000,
      system:     SCRIPT_SYSTEM,
      messages:   [{ role: 'user', content: userMsg }],
    })

    const raw   = res.content[0].type === 'text' ? res.content[0].text : ''
    const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const newScript = JSON.parse(clean) as ScriptWriterOutput

    Object.assign(updates, {
      hook:               newScript.hook,
      script:             newScript.script,
      captions:           newScript.captions,
      hashtags:           newScript.hashtags,
      cta:                newScript.cta,
      tone:               newScript.tone,
      estimated_duration: newScript.estimated_duration,
      raw_output:         newScript,
      version:            (script.version ?? 1) + 1,
      // Clear voice/video so they get regenerated with new text
      voice_status:       'none',
      audio_url:          null,
      timing_url:         null,
      duration_ms:        null,
      video_status:       'none',
      video_url:          null,
      render_id:          null,
      render_bucket:      null,
    })
  }

  // ── Regenerate images (3 distinct scenes) ───────────────────────────────────
  if (what === 'image' || what === 'both') {
    const { generateNewsImages } = await import('@/lib/media/ideogram')
    const { uploadSceneImage }   = await import('@/lib/media/storage')

    const headline = String(updates.hook ?? script.hook ?? '')
    const text     = String(updates.script ?? script.script ?? '')

    const imageUrls  = await generateNewsImages(headline, text, 3)
    const storedUrls = await Promise.all(
      imageUrls.map((url, i) => uploadSceneImage(script.project_id, id, i, url)),
    )

    updates.images        = storedUrls
    updates.composition   = 'SimpleNewsReel'
    // Clear video since images changed
    updates.video_status  = 'none'
    updates.video_url     = null
    updates.render_id     = null
    updates.render_bucket = null
  }

  // ── Save updates ─────────────────────────────────────────────────────────────
  const { data: updated, error: updateErr } = await db
    .from('media_scripts')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json(updated)
}
