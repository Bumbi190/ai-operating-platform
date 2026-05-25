/**
 * GET /api/media/cron/step1
 *
 * Autonomous pipeline — Step 1 of 3 (< 60s, runs on Vercel Hobby)
 * Schedule: 07:20 UTC and 17:20 UTC
 *
 * Does: News hunt → article analysis → script writing → quality gate → save to DB
 * Next: /api/media/cron/step2 picks up 5 min later
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runNewsHunter } from '@/lib/media/news-hunter'
import { scoreScript, shouldRegenerate } from '@/lib/media/quality'
import { Anthropic } from '@anthropic-ai/sdk'
import type { NewsHunterOutput, ScriptWriterOutput } from '@/lib/media/types'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 2000): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try { return await fn() } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if ((!msg.includes('overloaded') && !msg.includes('529')) || i === attempts - 1) throw err
      await sleep(baseDelayMs * Math.pow(2, i))
    }
  }
  throw new Error('Max retries exceeded')
}

const NEWS_SYSTEM = `You are an AI media analyst. Given a news article or description, extract structured metadata for short-form video production.

Return ONLY valid JSON (no markdown fences):
{
  "title": "Short punchy headline (max 10 words)",
  "summary": "2-3 sentence summary of the key development",
  "key_insight": "The single most surprising or important takeaway",
  "virality_score": 85,
  "target_audience": "intermediate",
  "content_angle": "educational",
  "source_url": "https://... or null",
  "source_name": "Publication name or null"
}
virality_score: 0–100, target_audience: "beginners"|"intermediate"|"advanced", content_angle: "educational"|"controversial"|"inspiring"|"practical"`

const SCRIPT_SYSTEM = `You are the lead scriptwriter for "The Prompt" — a daily AI insider news channel for developers and tech professionals.

Voice: Victoria. Warm, fast, authoritative. TARGET FORMAT: 18–28 seconds. ~55–70 words.

HOOK (0-3s): One sentence max 12 words. Breaking insider information feel.
CORE (3-15s): 3-4 rapid-fire facts. Real companies, models, numbers.
WHY IT MATTERS (15-25s): 1-2 sentences. Concrete implication.

FORBIDDEN hooks: "AI is changing the world", "In today's video", anything vague or over 13 words.

Return ONLY valid JSON (no markdown fences):
{
  "hook": "...",
  "script": "Full voiceover script...",
  "captions": ["Caption 1", "Caption 2"],
  "hashtags": ["#AI", "#Tech"],
  "cta": "One-line CTA",
  "tone": "insider",
  "estimated_duration": "~22 seconds",
  "difficulty": "intermediate"
}`

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db     = createAdminClient()
  const claude = new Anthropic()

  const { searchParams } = new URL(request.url)
  const projectIdParam = searchParams.get('project_id')

  // Find project
  let q = db.from('projects').select('id, slug')
  if (projectIdParam) q = q.eq('id', projectIdParam)
  const { data: project } = await (q as ReturnType<typeof db.from>).limit(1).single()
  if (!project) return NextResponse.json({ error: 'No project found' }, { status: 404 })

  // Hunt news
  let hunterResult
  try {
    hunterResult = await runNewsHunter(db, project.id, 5)
  } catch (err) {
    return NextResponse.json({ status: 'hunt_failed', error: err instanceof Error ? err.message : err }, { status: 500 })
  }
  if (!hunterResult.candidates.length) {
    return NextResponse.json({ status: 'no_news' })
  }

  const top = hunterResult.candidates[0]
  const articleText = [top.story.title, top.story.summary ?? '', top.editorialNote ? `Key insight: ${top.editorialNote}` : '', `Source: ${top.story.sourceLabel}`].filter(Boolean).join('\n\n')

  // Save news item
  const { data: newsItem } = await db.from('media_news_items').insert({
    project_id: project.id, title: top.story.title, summary: top.story.summary ?? null,
    url: top.story.url, source_name: top.story.sourceLabel, virality_score: top.estimatedViralityScore,
    content_angle: top.suggestedAngle, key_insight: top.editorialNote ?? null, status: 'approved',
    raw_output: { title: top.story.title, summary: top.story.summary, key_insight: top.editorialNote, virality_score: top.estimatedViralityScore, target_audience: 'intermediate', content_angle: top.suggestedAngle, source_url: top.story.url, source_name: top.story.sourceLabel },
  }).select('id').single()

  // Analyze article
  const newsRes = await withRetry(() => claude.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, system: NEWS_SYSTEM, messages: [{ role: 'user', content: `Analyze this article for short-form video:\n\n${articleText}` }] }))
  const news = JSON.parse((newsRes.content[0].type === 'text' ? newsRes.content[0].text : '').replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()) as NewsHunterOutput

  // Write script
  const scriptRes = await withRetry(() => claude.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 2000, system: SCRIPT_SYSTEM,
    messages: [{ role: 'user', content: `Write a short-form video script:\nTitle: ${news.title}\nSummary: ${news.summary}\nKey insight: ${news.key_insight}\nVirality: ${news.virality_score}/100\nAudience: ${news.target_audience}\nAngle: ${news.content_angle}` }],
  }))
  let script = JSON.parse((scriptRes.content[0].type === 'text' ? scriptRes.content[0].text : '').replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()) as ScriptWriterOutput

  // Quality gate
  const sourceContext = `${news.title}\n${news.summary}\n${news.key_insight}`
  const qualityScore  = await scoreScript(script.hook, script.script, sourceContext)

  if (shouldRegenerate(qualityScore)) {
    const rewriteRes = await withRetry(() => claude.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 2000, system: SCRIPT_SYSTEM,
      messages: [{ role: 'user', content: `Rewrite — previous rejected.\nSTORY: ${news.title}\n${news.summary}\n${news.key_insight}\nREJECTED HOOK: "${script.hook}"\nVERDICT: ${qualityScore.verdict}\nWEAK SPOTS: ${qualityScore.weak_spots.join(', ')}\nFix everything. Hook must score 8+.` }],
    }))
    script = JSON.parse((rewriteRes.content[0].type === 'text' ? rewriteRes.content[0].text : '').replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()) as ScriptWriterOutput
  }

  // Save script — voice_status='none' signals step2 to pick it up
  const { data: scriptRow } = await db.from('media_scripts').insert({
    project_id: project.id, news_item_id: newsItem?.id ?? null,
    hook: script.hook, script: script.script, captions: script.captions,
    hashtags: script.hashtags, cta: script.cta, tone: script.tone,
    estimated_duration: script.estimated_duration, raw_output: script,
    quality_score: qualityScore, status: 'approved',
    voice_status: 'none', video_status: 'none', version: 1,
    generated_at: new Date().toISOString(),
  }).select('id').single()

  if (!scriptRow) return NextResponse.json({ error: 'Failed to save script' }, { status: 500 })
  if (newsItem?.id) await db.from('media_news_items').update({ status: 'scripted' }).eq('id', newsItem.id)

  console.log(`[cron/step1] Done — scriptId: ${scriptRow.id}, hook: "${script.hook}", quality: ${qualityScore.overall.toFixed(1)}/10`)

  return NextResponse.json({
    status: 'step1_done',
    scriptId: scriptRow.id,
    hook: script.hook,
    quality: qualityScore.overall,
    next: 'step2 will run in 5 min',
  })
}
