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
import { callHermesScrape, callHermesRead, callHermesTrends, callHermesCompetitors, isHermesConfigured } from '@/lib/media/hermes'
import { Anthropic } from '@anthropic-ai/sdk'
import { logRun } from '@/lib/media/run-log'
import { logLlmCost } from '@/lib/cost/track'
import type { NewsHunterOutput, ScriptWriterOutput } from '@/lib/media/types'
import { classifyTopic } from '@/lib/atlas/content-tags'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Race a promise against a timeout; resolve to `fallback` if it doesn't finish in time. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ])
}

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

function buildScriptSystem(competitorHooks?: string[], patternSummary?: string): string {
  const competitorBlock = (competitorHooks && competitorHooks.length > 0)
    ? `\n\nCOMPETITOR INTELLIGENCE (what's performing right now on YouTube AI news):
Pattern: ${patternSummary ?? 'mixed'}
Top hooks to learn from (DO NOT copy — draw inspiration only):
${competitorHooks.slice(0, 6).map(h => `- "${h}"`).join('\n')}`
    : ''

  return `You are the lead scriptwriter for "The Prompt" — a daily AI insider news channel. 30-second AI news, no fluff.

Voice: Victoria. Warm, fast, authoritative. TARGET: 18–28 seconds, ~55–70 words. Every word earns its place.

WHAT ACTUALLY WORKS HERE (from our own performance data): hooks naming a REAL actor + a concrete action + a stake out-reach vague or jargon hooks by 10–30×. Lead with the specific surprising fact, never a warm-up.

HOOK (0–3s): max 12 words. Pattern: "{Named actor} just {concrete verb} — {consequence/tension}."
  Proven winners: "Trump just signed an AI executive order — here's what changed." | "Braintrust just eliminated their feature backlog with one workflow." | "Anthropic just shipped production code written 100% by Claude."
  FORBIDDEN: jargon ("mission-critical infrastructure"), vague claims ("AI is changing the world"), "In today's video", anything over 12 words or with NO named actor.

CORE (3–15s): 3–4 rapid-fire facts. Real companies, models, numbers.
WHY IT MATTERS (15–25s): 1–2 sentences. Concrete implication.

RETENTION: every sentence must earn the next. Make the final line loop back toward the hook so re-watches feel seamless.

CAPTIONS: 2–4 punchy on-screen lines (few words each, from frame 0). Make the LAST caption a follow-promise that gives scrollers a reason to follow: "Follow for daily AI news in 30s 🤖".

CTA = a discussion-trigger question that drives comments: "Hype or game-changer?" | "Would you trust this?"${competitorBlock}

Return ONLY valid JSON (no markdown fences):
{
  "hook": "Named actor + just + concrete verb + stake. Max 12 words.",
  "script": "Full voiceover script — hook flows into core, core into consequence...",
  "captions": ["Punchy caption 1", "Punchy caption 2", "Follow for daily AI news in 30s 🤖"],
  "hashtags": ["#AI", "#Tech"],
  "cta": "A discussion-trigger question",
  "tone": "insider",
  "estimated_duration": "~22 seconds",
  "difficulty": "intermediate"
}`
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db     = createAdminClient()
  const claude = new Anthropic()
  const t0     = Date.now()   // budget tracker — step1 must finish within Vercel's 60s

  const { searchParams } = new URL(request.url)
  const projectIdParam = searchParams.get('project_id')

  // Find project — AI-nyhetspipen tillhör The Prompt (ai-media-automation).
  // Utan explicit project_id pinnar vi till The Prompt istället för att ta
  // "första projektet" (vilket var Familje-Stunden och felattribuerade allt).
  let q = db.from('projects').select('id, slug')
  if (projectIdParam) q = q.eq('id', projectIdParam)
  else q = q.eq('slug', 'ai-media-automation')
  const { data: project } = await (q as ReturnType<typeof db.from>).limit(1).single()
  if (!project) return NextResponse.json({ error: 'No project found' }, { status: 404 })

  // ── Load competitor intelligence (weekly cache) ───────────────────────────
  // Stored in memories table as JSON text under key 'competitor_intelligence'.
  // Re-fetched from Hermes if cache is older than 7 days.
  let competitorHooks:   string[] | undefined
  let competitorPattern: string   | undefined

  if (isHermesConfigured()) {
    // READ-ONLY — never fetches in step1 to protect the 60s Vercel budget.
    // The /api/media/cron/competitors route refreshes this cache weekly.
    const { data: cached } = await db
      .from('memories')
      .select('value')
      .eq('project_id', project.id)
      .eq('key', 'competitor_intelligence')
      .limit(1)
      .maybeSingle()

    if (cached?.value) {
      try {
        const parsed      = JSON.parse(cached.value)
        competitorHooks   = parsed?.top_hooks
        competitorPattern = parsed?.pattern_summary
        console.log('[cron/step1] Using cached competitor intelligence')
      } catch { /* malformed — skip */ }
    }
  }

  const SCRIPT_SYSTEM = buildScriptSystem(competitorHooks, competitorPattern)
  // ── End competitor intelligence ───────────────────────────────────────────

  // ── Fetch trends + hunt news in parallel ─────────────────────────────────
  // Trends run alongside the news hunt — no extra time cost.
  // If Hermes isn't configured, trends silently returns null.
  let trendingTopics: string[] = []
  let hunterResult

  const [trendsResult, hunterRes] = await Promise.allSettled([
    callHermesTrends(7_000),               // hard 7s cap (was 25s default)
    runNewsHunter(db, project.id, 5, []),
  ])

  if (trendsResult.status === 'fulfilled' && trendsResult.value) {
    trendingTopics = trendsResult.value.topics.map(t => t.topic)
    console.log(`[cron/step1] Trends: ${trendingTopics.slice(0, 5).join(', ')}...`)
  }

  if (hunterRes.status === 'rejected') {
    return NextResponse.json({ status: 'hunt_failed', error: String(hunterRes.reason) }, { status: 500 })
  }

  // NOTE: we used to re-run runNewsHunter a second time with trend context.
  // That doubled the hunt cost and pushed step1 past Vercel's 60s limit (→ 504,
  // script never saved). We now use the single parallel hunt result directly.
  hunterResult = hunterRes.value

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
    // Time-boxed: callHermesScrape has a 3-min internal timeout — far over our 60s
    // budget. Cap it externally at 18s and fall back to the API hunt if it stalls.
    const hermesResult = await withTimeout(callHermesScrape(excludeUrls), 18_000, null)

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
    void logLlmCost('claude-haiku-4-5-20251001', newsRes.usage, { agent: 'News Hunter', operation: 'Analyze News' })
    news = JSON.parse((newsRes.content[0].type === 'text' ? newsRes.content[0].text : '').replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()) as NewsHunterOutput
  }
  // ── End Hermes fallback ───────────────────────────────────────────────────

  // ── Hermes article read ───────────────────────────────────────────────────
  // If Hermes is available and the story has a URL, fetch the full article text.
  // This gives Claude real quotes, exact numbers and concrete details —
  // far better than RSS summaries for writing punchy scripts.
  let fullArticleText = ''
  const articleUrl = news.source_url ?? null
  // Only read the full article if Hermes is configured AND we still have budget
  // left (skip when >30s elapsed). Bounded to 10s either way (was 30s).
  if (isHermesConfigured() && articleUrl && Date.now() - t0 < 30_000) {
    console.log(`[cron/step1] Reading full article via Hermes: ${articleUrl}`)
    const read = await withTimeout(callHermesRead(articleUrl), 10_000, null)
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
  void logLlmCost('claude-sonnet-4-6', scriptRes.usage, { agent: 'Script Writer', operation: 'Generate Script' })
  let script = JSON.parse((scriptRes.content[0].type === 'text' ? scriptRes.content[0].text : '').replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()) as ScriptWriterOutput

  // Quality gate
  const sourceContext = fullArticleText || `${news.title}\n${news.summary}\n${news.key_insight}`
  const qualityScore  = await scoreScript(script.hook, script.script, sourceContext)

  // Skip the (expensive) regenerate pass if we're low on budget — better to ship a
  // slightly weaker hook than to 504 and save nothing.
  if (shouldRegenerate(qualityScore) && Date.now() - t0 < 40_000) {
    const rewriteRes = await withRetry(() => claude.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 2000, system: SCRIPT_SYSTEM,
      messages: [{ role: 'user', content: `Rewrite — previous rejected.\nSTORY:\n${scriptContext}\nREJECTED HOOK: "${script.hook}"\nVERDICT: ${qualityScore.verdict}\nWEAK SPOTS: ${qualityScore.weak_spots.join(', ')}\nFix everything. Hook must score 8+.` }],
    }))
    void logLlmCost('claude-sonnet-4-6', rewriteRes.usage, { agent: 'Script Writer', operation: 'Rewrite Script' })
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
    topic: classifyTopic(script.hook, script.script), format: 'reel',
    generated_at: new Date().toISOString(),
  }).select('id').single()

  if (!scriptRow) return NextResponse.json({ error: 'Failed to save script' }, { status: 500 })
  if (newsItemId) await db.from('media_news_items').update({ status: 'scripted' }).eq('id', newsItemId)

  console.log(`[cron/step1] Done — scriptId: ${scriptRow.id}, hook: "${script.hook}", quality: ${qualityScore.overall.toFixed(1)}/10`)

  const scriptRunId = await logRun({ workflow: 'Generate Script', context: { scriptId: scriptRow.id, hook: script.hook } })
  // Spårbarhet: stämpla run_id på scriptet → kedjan news → script → run kan följas bakåt.
  if (scriptRunId) { try { await db.from('media_scripts').update({ run_id: scriptRunId }).eq('id', scriptRow.id) } catch { /* non-blocking */ } }

  return NextResponse.json({
    status: 'step1_done',
    scriptId: scriptRow.id,
    hook: script.hook,
    quality: qualityScore.overall,
    next: 'step2 will run in 5 min',
  })
}
