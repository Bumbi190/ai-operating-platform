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

const SCRIPT_SYSTEM = `You are the lead scriptwriter for "The Prompt" — a daily AI insider news channel for developers and tech professionals.

The single test for every script: "Would this interrupt doomscrolling?"
If the answer is no, rewrite it.

Voice: Victoria. Warm, fast, authoritative. A smart friend explaining something important — not a narrator setting atmosphere.

TARGET FORMAT: 18–28 seconds. ~55–70 words. Dense and fast. Every word earns its place.

IMPORTANT: This is a RE-WRITE. The hook MUST be completely different from the previous one — new entry point, new angle, new tension.

═══ STRUCTURE ═══

0–3s   HOOK — the only thing that matters in the first 1.5 seconds
       One sentence. Max 12 words. Creates immediate tension, curiosity, or stakes.
       Must feel like: breaking insider information. Different from previous hook.

3–15s  CORE — rapid-fire facts
       3–4 short sentences. One fact per sentence.
       Name real companies, real models, real benchmarks, real numbers.
       No context-setting. No "here's some background." Start mid-story.

15–25s WHY IT MATTERS — the consequence
       1–2 sentences. Concrete, specific implication.
       Who is affected. What changes. What developers / companies / the industry should do.

TOTAL: 55–70 words max. Cut ruthlessly — remove the weakest sentence entirely if over 70 words.

═══ HOOK SYSTEM — insider energy required ═══

APPROVED patterns:
- "Most developers completely missed what Anthropic released this week."
- "This benchmark result reportedly got OpenAI employees talking."
- "Nvidia may have just become the most important company in AI infrastructure."
- "This single AI update could seriously impact software engineering jobs."
- "The AI race may have shifted again — and most people didn't notice."
- "The model everyone dismissed just outperformed GPT-4 on every benchmark."

WHAT MAKES A HOOK WORK:
✓ Specific (company name, model name, benchmark, number)
✓ Implies consequence (something important happened or is about to)
✓ Creates a knowledge gap ("most people missed this")
✓ Sounds timely ("this week", "just", "yesterday")

FORBIDDEN:
✗ "AI is changing the world." ✗ "In today's video..." ✗ Anything vague or over 13 words

═══ SPECIFICITY REQUIREMENTS ═══
Always name real entities: OpenAI, Anthropic, Google DeepMind, Nvidia, Meta, Apple, Microsoft, Cursor, Windsurf, Perplexity, xAI
Use exact model names: GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro, Llama 3, etc.
Preserve all numbers exactly: percentages, benchmark scores, parameter counts, pricing.

═══ FACTUAL INTEGRITY — non-negotiable ═══
- Rewrite in your own words. Never copy source sentences verbatim.
- OMIT any detail not explicitly in the source. Never extrapolate.
- If the source says "may" or "could", Victoria says "may" or "could."

Return ONLY valid JSON (no markdown fences):
{
  "hook": "...",
  "script": "Full voiceover script — hook flows directly into core, core into consequence...",
  "captions": ["Short punchy caption 1", "Short punchy caption 2"],
  "hashtags": ["#AI", "#Tech"],
  "cta": "One-line CTA for the Instagram/TikTok caption",
  "tone": "insider",
  "estimated_duration": "~22 seconds",
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

    const imageUrls  = await generateNewsImages(headline, text, 5)
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
