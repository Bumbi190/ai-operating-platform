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
import { callHermesScrape, callHermesRead, callHermesTrends, isHermesConfigured } from '@/lib/media/hermes'
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

  // ── Fetch trends + hunt news in parallel ─────────────────────────────────
  // Trends run alongside the news hunt — no extra time cost.
  // If Hermes isn't configured, trends silently returns null.
  let trendingTopics: string[] = []
  let hunterResult

  const [trendsResult, hunterRes] = await Promise.allSettled([
    callHermesTrends(),
    runNewsHunter(db, project.id, 5, []),  // will be re-run with trends if available
  ])

  if (trendsResult.status === 'fulfilled' && trendsResult.value) {
    trendingTopics = trendsResult.value.topics.map(t => t.topic)
    console.log(`[cron/step1] Trends: ${trendingTopics.slice(0, 5).join(', ')}...`)
  }

  if (hunterRes.status === 'rejected') {
    return NextResponse.json({ status: 'hunt_failed', error: String(hunterRes.reason) }, { status: 500 })
  }

  // Re-run editorial pick with trend context if we got trends
  if (trendingTopics.length > 0) {
    try {
      hunterResult = await runNewsHunter(db, project.id, 5, trendingTopics)
    } catch {
      hunterResult = hunterRes.value  // fall back to trendless result
    }
  } else {
    hunterResult = hunterRes.value
  }

  // ── Hermes fallback ──────────────────────────────────────────────────────
  // If the API hunt found nothing (or everything was low-virality), ask Hermes
  // to autonomously browse news sites with Playwright + Gemini Computer Use.
  // Hermes is optional — gracefully skipped if HERMES_URL is not set.
  const VIRALITY_THRESHOLD = 60
  const topCandidate       = hunterResult.candidates[0]
  const shouldUseHermes    = isHermesConfigured() && (
    !hunterResult.candidates.length ||
    (topCandidate && topCandidate.estimatedViralityScore < VIRALITY_THRESHOLD)
  )

  let news: NewsHunterOutput
  // newsItemId is captured directly from each insert — avoids the race condition
  // of querying "most recent row" which could grab a concurrent insert's ID.
  let newsItemId: string | null = null

  if (shouldUseHermes) {
    console.log('[cron/step1] Calling Hermes for web-scraped news...')
    const { data: existingUrls } = await db
      .from('media_news_items')
      .select('url')
      .not('url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50)

    const excludeUrls = (existingUrls ?? []).map(r => r.url).filter(Boolean) as string[]
    const hermesResult = await callHermesScrape(excludeUrls)

    if (hermesResult) {
      console.log(`[cron/step1] Hermes found: "${hermesResult.title}" (virality: ${hermesResult.virality_score})`)
      // Hermes already returns structured NewsHunterOutput-compatible data
      news = {
        title:           hermesResult.title,
        summary:         hermesResult.summary,
        key_insight:     hermesResult.key_insight,
        virality_score:  hermesResult.virality_score,
        target_audience: 'intermediate',
        content_angle:   hermesResult.content_angle,
        source_url:      hermesResult.url,
        source_name:     hermesResult.source_name,
      }

      // Save news item from Hermes — capture ID directly to avoid race conditions
      const { data: hermesNI } = await db.from('media_news_items').insert({
        project_id: project.id,
        title:          hermesResult.title,
        summary:        hermesResult.summary,
        url:            hermesResult.url,
        source_name:    hermesResult.source_name,
        virality_score: hermesResult.virality_score,
        content_angle:  hermesResult.content_angle,
        key_insight:    hermesResult.key_insight,
        status:         'approved',
        raw_output:     { ...hermesResult, source: 'hermes' },
      }).select('id').single()
      newsItemId = hermesNI?.id ?? null
    } else {
      // Hermes also failed — fall back to original hunt or give up
      if (!hunterResult.candidates.length) {
        return NextResponse.json({ status: 'no_news' })
      }
      // Use original hunt result even if low-virality
      const top       = hunterResult.candidates[0]
      const articleText = [top.story.title, top.story.summary ?? '', top.editorialNote ? `Key insight: ${top.editorialNote}` : '', `Source: ${top.story.sourceLabel}`].filter(Boolean).join('\n\n')
      const newsRes   = await withRetry(() => claude.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, system: NEWS_SYSTEM, messages: [{ role: 'user', content: `Analyze this article for short-form video:\n\n${articleText}` }] }))
      news            = JSON.parse((newsRes.content[0].type === 'text' ? newsRes.content[0].text : '').replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()) as NewsHunterOutput
      const { data: fallbackNI } = await db.from('media_news_items').insert({ project_id: project.id, title: top.story.title, summary: top.story.summary ?? null, url: top.story.url, source_name: top.story.sourceLabel, virality_score: top.estimatedViralityScore, content_angle: top.suggestedAngle, key_insight: top.editorialNote ?? null, status: 'approved', raw_output: { title: top.story.title, summary: top.story.summary, key_insight: top.editorialNote, virality_score: top.estimatedViralityScore, target_audience: 'intermediate', content_angle: top.suggestedAngle, source_url: top.story.url, source_name: top.story.sourceLabel } }).select('id').single()
      newsItemId = fallbackNI?.id ?? null
    }
  } else {
    // Standard path: use top result from API hunt
    if (!hunterResult.candidates.length) {
      return NextResponse.json({ status: 'no_news' })
    }
    const top         = hunterResult.candidates[0]
    const articleText = [top.story.title, top.story.summary ?? '', top.editorialNote ? `Key insight: ${top.editorialNote}` : '', `Source: ${top.story.sourceLabel}`].filter(Boolean).join('\n\n')

    // Save news item — capture ID directly to avoid race conditions
    const { data: standardNI } = await db.from('media_news_items').insert({
      project_id: project.id, title: top.story.title, summary: top.story.summary ?? null,
      url: top.story.url, source_name: top.story.sourceLabel, virality_score: top.estimatedViralityScore,
      content_angle: top.suggestedAngle, key_insight: top.editorialNote ?? null, status: 'approved',
      raw_output: { title: top.story.title, summary: top.story.summary, key_insight: top.editorialNote, virality_score: top.estimatedViralityScore, target_audience: 'intermediate', content_angle: top.suggestedAngle, source_url: top.story.url, source_name: top.story.sourceLabel },
    }).select('id').single()
    newsItemId = standardNI?.id ?? null

    // Analyze article
    const newsRes = await withRetry(() => claude.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, system: NEWS_SYSTEM, messages: [{ role: 'user', content: `Analyze this article for short-form video:\n\n${articleText}` }] }))
    news = JSON.parse((newsRes.content[0].type === 'text' ? newsRes.content[0].text : '').replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()) as NewsHunterOutput
  }
  // ── End Hermes fallback ───────────────────────────────────────────────────

  // ── Hermes article read ───────────────────────────────────────────────────
  // If Hermes is available and the story has a URL, fetch the full article text.
  // This gives Claude real quotes, exact numbers and concrete details —
  // far better than RSS summaries for writing punchy scripts.
  let fullArticleText = ''
  const articleUrl = news.source_url ?? null
  if (isHermesConfigured() && articleUrl) {
    console.log(`[cron/step1] Reading full article via Hermes: ${articleUrl}`)
    const read = await callHermesRead(articleUrl)
    if (read?.success && read.word_count > 100) {
      fullArticleText = read.text
      console.log(`[cron/step1] Got ${read.word_count} words from article`)
    }
  }

  // Build the script-writing context — prefer full article, fall back to summary
  const scriptContext = fullArticleText
    ? `Title: ${news.title}\nFull article text:\n${fullArticleText}\n\nKey insight: ${news.key_insight}\nVirality: ${news.virality_score}/100\nAudience: ${news.target_audience}\nAngle: ${news.content_angle}`
    : `Title: ${news.title}\nSummary: ${news.summary}\nKey insight: ${news.key_insight}\nVirality: ${news.virality_score}/100\nAudience: ${news.target_audience}\nAngle: ${news.content_angle}`
  // ── End article read ──────────────────────────────────────────────────────

  // Write script
  const scriptRes = await withRetry(() => claude.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 2000, system: SCRIPT_SYSTEM,
    messages: [{ role: 'user', content: `Write a short-form video script:\n${scriptContext}` }],
  }))
  let script = JSON.parse((scriptRes.content[0].type === 'text' ? scriptRes.content[0].text : '').replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()) as ScriptWriterOutput

  // Quality gate
  const sourceContext = fullArticleText || `${news.title}\n${news.summary}\n${news.key_insight}`
  const qualityScore  = await scoreScript(script.hook, script.script, sourceContext)

  if (shouldRegenerate(qualityScore)) {
    const rewriteRes = await withRetry(() => claude.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 2000, system: SCRIPT_SYSTEM,
      messages: [{ role: 'user', content: `Rewrite — previous rejected.\nSTORY:\n${scriptContext}\nREJECTED HOOK: "${script.hook}"\nVERDICT: ${qualityScore.verdict}\nWEAK SPOTS: ${qualityScore.weak_spots.join(', ')}\nFix everything. Hook must score 8+.` }],
    }))
    script = JSON.parse((rewriteRes.content[0].type === 'text' ? rewriteRes.content[0].text : '').replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()) as ScriptWriterOutput
  }

  // Save script — voice_status='none' signals step2 to pick it up
  const { data: scriptRow } = await db.from('media_scripts').insert({
    project_id: project.id, news_item_id: newsItemId,
    hook: script.hook, script: script.script, captions: script.captions,
    hashtags: script.hashtags, cta: script.cta, tone: script.tone,
    estimated_duration: script.estimated_duration, raw_output: script,
    quality_score: qualityScore, status: 'approved',
    voice_status: 'none', video_status: 'none', version: 1,
    generated_at: new Date().toISOString(),
  }).select('id').single()

  if (!scriptRow) return NextResponse.json({ error: 'Failed to save script' }, { status: 500 })
  if (newsItemId) await db.from('media_news_items').update({ status: 'scripted' }).eq('id', newsItemId)

  console.log(`[cron/step1] Done — scriptId: ${scriptRow.id}, hook: "${script.hook}", quality: ${qualityScore.overall.toFixed(1)}/10`)

  return NextResponse.json({
    status: 'step1_done',
    scriptId: scriptRow.id,
    hook: script.hook,
    quality: qualityScore.overall,
    next: 'step2 will run in 5 min',
  })
}
