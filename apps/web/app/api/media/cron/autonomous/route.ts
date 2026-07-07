/**
 * GET /api/media/cron/autonomous
 *
 * Phase-1 of the fully autonomous AI media engine.
 * Runs at 07:30 and 17:30 UTC every day (30 min before the target post times).
 *
 * What it does (end-to-end, no human in the loop):
 *   1.  Hunt latest AI news (News Hunter agent)
 *   2.  Select highest-scoring story
 *   3.  Save news item (auto-approved)
 *   4.  Analyze article  →  NewsHunterOutput  (Claude Haiku)
 *   5.  Write script     →  ScriptWriterOutput (Claude Sonnet)
 *   6.  Quality gate — auto-regenerate once if hook is weak
 *   7.  Save script (auto-approved)
 *   8.  Generate voice   (ElevenLabs Victoria)
 *   9.  Upload audio + timing to Supabase Storage
 *   10. Generate 5 scene images + fetch background music (parallel)
 *   11. Upload images to Supabase Storage
 *   12. Start Remotion Lambda render
 *   13. Poll render (up to 220 s) — if done in time, auto-publish immediately
 *   14. If render still in progress → Phase-2 cron at 08:00 / 18:00 publishes it
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAutomationPaused, checkDailyRenderLimit } from '@/lib/media/safeguards'
import { runNewsHunter } from '@/lib/media/news-hunter'
import { generateVoiceover } from '@/lib/media/elevenlabs'
import { uploadAudio, uploadTimingData, uploadSceneImage } from '@/lib/media/storage'
import { generateNewsImages } from '@/lib/media/ideogram'
import { scoreScript, shouldRegenerate } from '@/lib/media/quality'
import { getBackgroundMusicUrl } from '@/lib/media/music'
import { buildVideoInputProps } from '@/lib/media/video-props'
import { startLambdaRender, getLambdaRenderProgress } from '@/lib/media/lambda-render'
import { postReelToInstagram, buildInstagramCaption } from '@/lib/media/instagram'
import { postReelToFacebook } from '@/lib/media/facebook'
import { sendPipelineAlert } from '@/lib/media/alert'
import { Anthropic } from '@anthropic-ai/sdk'
import type { NewsHunterOutput, ScriptWriterOutput } from '@/lib/media/types'
import { toJson } from '@/lib/supabase/json'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function withRetry<T>(fn: () => Promise<T>, attempts = 4, baseDelayMs = 3000): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      const isOverloaded = msg.includes('overloaded') || msg.includes('529')
      if (!isOverloaded || i === attempts - 1) throw err
      await sleep(baseDelayMs * Math.pow(2, i))
    }
  }
  throw new Error('Max retries exceeded')
}

function log(step: string, msg: string) {
  console.log(`[autonomous/${step}] ${msg}`)
}

// ─── Agent prompts (identical to pipeline/full) ───────────────────────────────

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

virality_score: 0–100 (how likely this is to perform well as short-form AI news content)
target_audience: "beginners" | "intermediate" | "advanced"
content_angle: "educational" | "controversial" | "inspiring" | "practical"`

const SCRIPT_SYSTEM = `You are the lead scriptwriter for "The Prompt" — a daily AI insider news channel for developers and tech professionals.

The single test for every script: "Would this interrupt doomscrolling?"
If the answer is no, rewrite it.

Voice: Victoria. Warm, fast, authoritative. A smart friend explaining something important — not a narrator setting atmosphere.

TARGET FORMAT: 18–28 seconds. ~55–70 words. Dense and fast. Every word earns its place.

═══ STRUCTURE ═══

0–3s   HOOK — the only thing that matters in the first 1.5 seconds
       One sentence. Max 12 words. Creates immediate tension, curiosity, or stakes.
       Must feel like: breaking insider information.

3–15s  CORE — rapid-fire facts
       3–4 short sentences. One fact per sentence.
       Name real companies, real models, real benchmarks, real numbers.
       No context-setting. No "here's some background." Start mid-story.

15–25s WHY IT MATTERS — the consequence
       1–2 sentences. Concrete, specific implication.
       Who is affected. What changes. What developers / companies / the industry should do.

TOTAL: 55–70 words max. If over 70 words, cut ruthlessly — remove the weakest sentence entirely.

═══ HOOK SYSTEM — insider energy required ═══

The hook must sound like: information someone in the AI industry already knows but the viewer doesn't yet.

APPROVED patterns:
- "Most developers completely missed what Anthropic released this week."
- "This benchmark result reportedly got OpenAI employees talking."
- "Nvidia may have just become the most important company in AI infrastructure."
- "This single AI update could seriously impact software engineering jobs."
- "The AI race may have shifted again — and most people didn't notice."
- "Google just gave its AI access to something it has never had before."
- "The model everyone dismissed just outperformed GPT-4 on every benchmark."

WHAT MAKES A HOOK WORK:
✓ Specific (company name, model name, benchmark, number)
✓ Implies consequence (something important happened or is about to)
✓ Creates a knowledge gap ("most people missed this")
✓ Sounds timely ("this week", "just", "yesterday")

FORBIDDEN — these hooks will be rejected:
✗ "AI is changing the world."
✗ "Artificial intelligence is evolving rapidly."
✗ "In today's video..."
✗ "You won't believe..."
✗ Anything vague, generic, or over 13 words

═══ SPECIFICITY REQUIREMENTS ═══

Always name real entities when present in the source:
Companies: OpenAI, Anthropic, Google DeepMind, Nvidia, Meta, Apple, Microsoft, Mistral, Cohere, Cursor, Windsurf, Perplexity, xAI
Models: GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro, Llama 3, Mistral Large — use exact names
Numbers: preserve all percentages, latency figures, parameter counts, pricing, benchmark scores exactly

═══ FACTUAL INTEGRITY — non-negotiable ═══
- Rewrite in your own words. Never copy source sentences verbatim.
- OMIT any detail not explicitly in the source. Never extrapolate.
- If the source says "may" or "could", Victoria says "may" or "could."
- No editorializing beyond what the source directly supports.

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

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const db        = createAdminClient()
  const claude    = new Anthropic()

  // ── 0a. Global pauscheck ──────────────────────────────────────────────────────
  const pauseCheck = await checkAutomationPaused(db)
  if (!pauseCheck.allowed) {
    log('safeguard', `PAUSAD — ${pauseCheck.reason}`)
    return NextResponse.json({ status: 'paused', reason: pauseCheck.reason })
  }

  // ── 0b. Daglig render-gräns ───────────────────────────────────────────────────
  const renderCheck = await checkDailyRenderLimit(db)
  if (!renderCheck.allowed) {
    log('safeguard', `RENDER-GRÄNS — ${renderCheck.reason}`)
    return NextResponse.json({ status: 'render_limit_reached', reason: renderCheck.reason })
  }

  // ── 1. Find project ───────────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url)
  const projectIdParam = searchParams.get('project_id')

  let projectQuery = db.from('projects').select('id, name, slug')
  if (projectIdParam) {
    projectQuery = projectQuery.eq('id', projectIdParam)
  }
  const { data: project } = await (projectQuery as ReturnType<typeof db.from>).limit(1).single()

  if (!project) {
    return NextResponse.json({ error: 'No project found' }, { status: 404 })
  }
  log('start', `Project: ${project.slug}`)

  // ── 2. Hunt news ──────────────────────────────────────────────────────────────
  log('hunt', 'Running News Hunter...')
  let hunterResult
  try {
    hunterResult = await runNewsHunter(db, project.id, 5)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    log('hunt', `Failed: ${msg}`)
    await sendPipelineAlert({ cronRoute: 'cron/autonomous', step: 'news_hunt', error: msg })
    return NextResponse.json({ status: 'hunt_failed', error: msg }, { status: 500 })
  }

  if (!hunterResult.candidates.length) {
    log('hunt', 'No new stories found')
    return NextResponse.json({ status: 'no_news', ranAt: new Date().toISOString() })
  }

  const top         = hunterResult.candidates[0]
  const articleText = [
    top.story.title,
    top.story.summary ?? '',
    top.editorialNote ? `Key insight: ${top.editorialNote}` : '',
    `Source: ${top.story.sourceLabel}`,
  ].filter(Boolean).join('\n\n')

  log('hunt', `Top story: "${top.story.title}" (virality: ${top.estimatedViralityScore})`)

  // ── 3. Save news item (auto-approved) ─────────────────────────────────────────
  const { data: newsItem } = await db.from('media_news_items').insert({
    project_id:     project.id,
    title:          top.story.title,
    summary:        top.story.summary ?? null,
    url:            top.story.url,
    source_name:    top.story.sourceLabel,
    virality_score: top.estimatedViralityScore,
    content_angle:  top.suggestedAngle,
    key_insight:    top.editorialNote ?? null,
    status:         'approved',
    raw_output: {
      title:           top.story.title,
      summary:         top.story.summary,
      key_insight:     top.editorialNote,
      virality_score:  top.estimatedViralityScore,
      target_audience: 'intermediate',
      content_angle:   top.suggestedAngle,
      source_url:      top.story.url,
      source_name:     top.story.sourceLabel,
    },
  }).select('id').single()

  // ── 4. Analyze article (Claude Haiku) ─────────────────────────────────────────
  log('analyze', 'Analyzing article...')
  const newsRes = await withRetry(() => claude.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 800,
    system:     NEWS_SYSTEM,
    messages:   [{ role: 'user', content: `Analyze this article for short-form video:\n\n${articleText}` }],
  }))
  const newsRaw   = newsRes.content[0].type === 'text' ? newsRes.content[0].text : ''
  const newsClean = newsRaw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  const news      = JSON.parse(newsClean) as NewsHunterOutput

  // ── 5. Write script (Claude Sonnet) ───────────────────────────────────────────
  log('script', 'Writing script...')
  const scriptRes = await withRetry(() => claude.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2000,
    system:     SCRIPT_SYSTEM,
    messages:   [{
      role:    'user',
      content: `Write a short-form video script for this AI news story:

Title: ${news.title}
Summary: ${news.summary}
Key insight: ${news.key_insight}
Virality score: ${news.virality_score}/100
Audience: ${news.target_audience}
Angle: ${news.content_angle}`,
    }],
  }))
  const scriptRaw   = scriptRes.content[0].type === 'text' ? scriptRes.content[0].text : ''
  const scriptClean = scriptRaw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  let   script      = JSON.parse(scriptClean) as ScriptWriterOutput

  // ── 6. Quality gate ───────────────────────────────────────────────────────────
  log('quality', 'Scoring script...')
  const sourceContext = `${news.title}\n${news.summary}\n${news.key_insight}`
  const qualityScore  = await scoreScript(script.hook, script.script, sourceContext)

  if (shouldRegenerate(qualityScore)) {
    log('quality', `Weak hook (${qualityScore.hook_strength}/10) — regenerating...`)
    const rewriteRes = await withRetry(() => claude.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 2000,
      system:     SCRIPT_SYSTEM,
      messages:   [{
        role:    'user',
        content: `Rewrite this script. The previous version was rejected for being too weak.

ORIGINAL STORY:
Title: ${news.title}
Summary: ${news.summary}
Key insight: ${news.key_insight}

REJECTED HOOK: "${script.hook}"
QUALITY VERDICT: ${qualityScore.verdict}
WEAK SPOTS: ${qualityScore.weak_spots.join(', ')}

Write a significantly stronger version. Fix every weak spot. The hook must score 8+ on insider energy and specificity.`,
      }],
    }))
    const rewriteRaw   = rewriteRes.content[0].type === 'text' ? rewriteRes.content[0].text : ''
    const rewriteClean = rewriteRaw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    script = JSON.parse(rewriteClean) as ScriptWriterOutput
  }

  log('quality', `Quality: ${qualityScore.overall.toFixed(1)}/10 — "${script.hook}"`)

  // ── 7. Save script (auto-approved) ────────────────────────────────────────────
  const { data: scriptRow } = await db.from('media_scripts').insert({
    project_id:         project.id,
    news_item_id:       newsItem?.id ?? null,
    hook:               script.hook,
    script:             script.script,
    captions:           script.captions,
    hashtags:           script.hashtags,
    cta:                script.cta,
    tone:               script.tone,
    estimated_duration: script.estimated_duration,
    raw_output:         toJson(script),
    quality_score:      toJson(qualityScore),
    status:             'approved',
    voice_status:       'none',
    video_status:       'none',
    version:            1,
  }).select('id').single()

  if (!scriptRow) {
    return NextResponse.json({ error: 'Failed to save script' }, { status: 500 })
  }
  const scriptId = scriptRow.id
  log('script', `Saved script ${scriptId}`)

  if (newsItem?.id) {
    await db.from('media_news_items').update({ status: 'scripted' }).eq('id', newsItem.id)
  }

  // ── 8. Generate voice (ElevenLabs Victoria) ───────────────────────────────────
  log('voice', 'Generating voiceover...')
  await db.from('media_scripts').update({ voice_status: 'generating' }).eq('id', scriptId)

  const voiceResult = await generateVoiceover(script.script, 'victoria')

  // ── 9. Upload audio + timing ──────────────────────────────────────────────────
  log('voice', `Voice ready (${(voiceResult.durationMs / 1000).toFixed(1)}s) — uploading...`)
  const [audioUrl, timingUrl] = await Promise.all([
    uploadAudio(project.id, scriptId, voiceResult.audioBuffer),
    uploadTimingData(project.id, scriptId, { words: voiceResult.words, durationMs: voiceResult.durationMs }),
  ])

  await db.from('media_scripts').update({
    audio_url:    audioUrl,
    timing_url:   timingUrl,
    duration_ms:  voiceResult.durationMs,
    voice_status: 'ready',
  }).eq('id', scriptId)

  // ── 10. Generate 5 scene images + background music (parallel) ─────────────────
  log('images', 'Generating scene images + music...')
  const musicMood = qualityScore.hook_strength >= 8 ? 'urgency' : 'neutral'

  const [rawImageUrls, backgroundMusicUrl] = await Promise.all([
    generateNewsImages(news.title, script.script, 5),
    getBackgroundMusicUrl(musicMood),
  ])

  // ── 11. Upload images ─────────────────────────────────────────────────────────
  log('images', 'Uploading images...')
  const storedImageUrls = await Promise.all(
    rawImageUrls.map((url, i) => uploadSceneImage(project.id, scriptId, i, url)),
  )

  await db.from('media_scripts').update({
    images:               storedImageUrls,
    composition:          'SimpleNewsReel',
    background_music_url: backgroundMusicUrl,
  }).eq('id', scriptId)

  // ── 12. Start Lambda render ───────────────────────────────────────────────────
  log('render', 'Starting Remotion Lambda render...')
  const inputProps = await buildVideoInputProps({
    hook:               script.hook,
    audioUrl,
    timingUrl,
    durationMs:         voiceResult.durationMs,
    images:             storedImageUrls,
    accentColor:        '#6366f1',
    backgroundMusicUrl: undefined,  // Pixabay CDN blocked by Lambda — skip for now
  })

  const { renderId, bucketName } = await startLambdaRender(scriptId, inputProps, 'SimpleNewsReel')

  await db.from('media_scripts').update({
    video_status:  'rendering',
    render_id:     renderId,
    render_bucket: bucketName,
  }).eq('id', scriptId)

  log('render', `Lambda render started: ${renderId}`)

  // ── 13. Poll render (use remaining time budget) ───────────────────────────────
  // We have maxDuration=300s; steps above take ~60-80s → ~200s left for polling
  const renderDeadline = startedAt + 270_000  // 270s hard cutoff
  let videoUrl: string | null = null

  while (Date.now() < renderDeadline) {
    await sleep(7_000)

    const prog = await getLambdaRenderProgress(renderId, bucketName)
    log('render', `Progress: ${Math.round(prog.progress * 100)}%`)

    if (prog.done) {
      if (prog.videoUrl) {
        videoUrl = prog.videoUrl
        await db.from('media_scripts').update({
          video_url:    videoUrl,
          video_status: 'ready',
        }).eq('id', scriptId)
        log('render', `Done → ${videoUrl}`)
      } else if (prog.error) {
        await db.from('media_scripts').update({ video_status: 'failed' }).eq('id', scriptId)
        log('render', `Failed: ${prog.error}`)
        await sendPipelineAlert({
          cronRoute: 'cron/autonomous',
          step:      'lambda_render',
          error:     prog.error,
          context:   { scriptId, renderId, hook: script.hook },
        })
        return NextResponse.json({
          status:   'render_failed',
          error:    prog.error,
          scriptId,
        })
      }
      break
    }
  }

  if (!videoUrl) {
    // Render still in progress — Phase-2 cron (/api/media/cron/publish) will pick it up
    log('render', 'Render still in progress — Phase-2 cron will publish')
    return NextResponse.json({
      status:     'render_pending',
      message:    'Render started but not yet complete. The publish cron will auto-publish when ready.',
      scriptId,
      renderId,
      bucketName,
      elapsedMs:  Date.now() - startedAt,
    })
  }

  // ── 14. Publish to Instagram + Facebook ───────────────────────────────────────
  log('publish', 'Publishing to Instagram...')

  const newsItemRow = Array.isArray(newsItem) ? newsItem[0] : newsItem
  const caption = buildInstagramCaption({
    hook:       script.hook,
    cta:        script.cta ?? undefined,
    hashtags:   Array.isArray(script.hashtags) ? script.hashtags as string[] : [],
    sourceUrl:  top.story.url ?? undefined,
    sourceName: top.story.sourceLabel ?? undefined,
  })

  let igResult: { mediaId: string; permalink?: string }
  try {
    igResult = await postReelToInstagram(videoUrl, caption)
    log('publish', `Instagram OK: ${igResult.permalink}`)
  } catch (igErr) {
    const msg = igErr instanceof Error ? igErr.message : String(igErr)
    log('publish', `Instagram failed: ${msg}`)
    await sendPipelineAlert({
      cronRoute: 'cron/autonomous',
      step:      'instagram_publish',
      error:     msg,
      context:   { scriptId, hook: script.hook, videoUrl },
    })
    return NextResponse.json({ status: 'instagram_failed', error: msg, scriptId }, { status: 500 })
  }

  let fbResult: { postId: string; url?: string } | null = null
  const hasFacebook = !!(process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID)

  if (hasFacebook) {
    try {
      fbResult = await postReelToFacebook(videoUrl, caption)
      log('publish', `Facebook OK: ${fbResult.url}`)
    } catch (fbErr) {
      const fbMsg = fbErr instanceof Error ? fbErr.message : String(fbErr)
      log('publish', `Facebook failed (non-fatal): ${fbMsg}`)
      await sendPipelineAlert({
        cronRoute: 'cron/autonomous',
        step:      'facebook_publish',
        error:     fbMsg,
        severity:  'warning',
        context:   { scriptId, note: 'Instagram publicerades OK — enbart Facebook failade' },
      })
    }
  }

  // ── 15. Mark published in DB ──────────────────────────────────────────────────
  await db.from('media_scripts').update({
    status:             'published',
    published_at:       new Date().toISOString(),
    instagram_media_id: igResult.mediaId,
    instagram_url:      igResult.permalink ?? null,
    ...(fbResult ? {
      facebook_post_id: fbResult.postId,
      facebook_url:     fbResult.url ?? null,
    } : {}),
  }).eq('id', scriptId)

  const platforms = ['Instagram', ...(fbResult ? ['Facebook'] : [])].join(' & ')
  log('done', `Published on ${platforms} in ${Math.round((Date.now() - startedAt) / 1000)}s`)

  return NextResponse.json({
    status:      'published',
    platforms,
    scriptId,
    permalink:   igResult.permalink,
    facebookUrl: fbResult?.url ?? null,
    elapsedMs:   Date.now() - startedAt,
    qualityScore: {
      overall:       qualityScore.overall,
      hook_strength: qualityScore.hook_strength,
      passed:        qualityScore.passed,
    },
  })
}
