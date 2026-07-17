/**
 * POST /api/media/pipeline/full
 *
 * One-shot pipeline: article text → render-ready script.
 * Streams progress as Server-Sent Events so the UI can show live status.
 *
 * Steps (in order):
 *   1. Claude analyzes the article → NewsHunterOutput
 *   2. Saves/reuses news item after novelty review
 *   3. Claude writes short-form video script → ScriptWriterOutput
 *   4. Saves script to media_scripts after approved news + quality gate
 *   5. ElevenLabs generates Victoria voiceover + word timing
 *   6. Uploads audio + timing to Supabase Storage
 *   7. Ideogram generates 5 cinematic scene images
 *   8. Uploads images to Supabase Storage
 *   9. Returns script_id + render_input_url
 *
 * Body: { text: string, project_id: string, news_item_id?: string }
 *
 * SSE event format:
 *   data: {"step":"analyzing","label":"Analyserar artikel...","progress":10}
 *   data: {"step":"done","scriptId":"...","renderInputUrl":"...","progress":100}
 *   data: {"step":"error","message":"..."}
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { generateVoiceover } from '@/lib/media/elevenlabs'
import { uploadAudio, uploadTimingData, uploadSceneImage } from '@/lib/media/storage'
import { generateSceneImages, generateNewsImages } from '@/lib/media/ideogram'
import { scoreScript, shouldRegenerate } from '@/lib/media/quality'
import { getBackgroundMusicUrl } from '@/lib/media/music'
import type { NewsHunterOutput, ScriptWriterOutput } from '@/lib/media/types'
import { toJson } from '@/lib/supabase/json'
import { Anthropic } from '@anthropic-ai/sdk'
import { persistCandidateWithNoveltyReview } from '@/lib/media/novelty'
import { assertMediaProductionEligible } from '@/lib/media/eligibility'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'
import { transitionNewsItemStatus } from '@/lib/media/news-state'

// Pipeline modes:
// 'lite'  — 1 image with headline baked in, SimpleNewsReel composition (~5× cheaper)
// 'full'  — 5 cinematic scenes, ShortFormVideo composition
type PipelineMode = 'lite' | 'full'

export const dynamic = 'force-dynamic'
export const maxDuration = 300  // 5 min — image generation can be slow

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function sseEvent(controller: ReadableStreamDefaultController, payload: Record<string, unknown>) {
  const line = `data: ${JSON.stringify(payload)}\n\n`
  controller.enqueue(new TextEncoder().encode(line))
}

// Retry wrapper for transient Anthropic 529 overloaded errors
async function withRetry<T>(fn: () => Promise<T>, attempts = 4, baseDelayMs = 3000): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      const isOverloaded = msg.includes('overloaded') || msg.includes('529')
      if (!isOverloaded || i === attempts - 1) throw err
      await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, i)))
    }
  }
  throw new Error('Max retries exceeded')
}

// ─── Agent prompts ────────────────────────────────────────────────────────────

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

export async function POST(request: Request) {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const { text, project_id, news_item_id, mode = 'lite' } = await request.json() as {
    text: string
    project_id: string
    news_item_id?: string
    mode?: PipelineMode
  }
  if (!text?.trim() || !project_id) {
    return new Response('text and project_id required', { status: 400 })
  }
  if (!assertProjectAllowed(project_id, access.allowedProjectIds)) return projectForbidden()
  const isLite = mode !== 'full'

  const db = createAdminClient()
  if (news_item_id) {
    const { data: news } = await db
      .from('media_news_items')
      .select('id, project_id')
      .eq('id', news_item_id)
      .single()
    if (!news) return new Response('News item not found', { status: 404 })
    if (news.project_id !== project_id) return new Response('News item does not belong to project', { status: 403 })
  }
  const claude = new Anthropic()

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (payload: Record<string, unknown>) => sseEvent(controller, payload)

      try {
        // ── Step 1: Analyze article ──────────────────────────────────────────
        emit({ step: 'analyzing', label: 'Analyserar artikel...', progress: 5 })

        const newsRes = await withRetry(() => claude.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          system: NEWS_SYSTEM,
          messages: [{ role: 'user', content: `Analyze this article for short-form video:\n\n${text}` }],
        }))
        const newsRaw = newsRes.content[0].type === 'text' ? newsRes.content[0].text : ''
        const newsClean = newsRaw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
        const news = JSON.parse(newsClean) as NewsHunterOutput

        emit({ step: 'news_done', label: `Nyhet: "${news.title}"`, progress: 20 })

        // ── Step 2: Save/reuse news item behind novelty review ───────────────
        let newsItemId = news_item_id ?? null
        if (newsItemId) {
          await assertMediaProductionEligible(db, { projectId: project_id, newsItemId, stage: 'script' })
        } else {
          const novelty = await persistCandidateWithNoveltyReview(db, {
            project_id,
            title: news.title,
            summary: news.summary,
            key_insight: news.key_insight,
            url: news.source_url ?? null,
            source_name: news.source_name ?? null,
            target_audience: news.target_audience,
            content_angle: news.content_angle,
            virality_score: news.virality_score ?? 0,
            raw_output: toJson(news) as Record<string, unknown>,
          })

          emit({
            step: 'blocked',
            label: 'Novelty passed; editorial approval is required before media production',
            progress: 100,
            outcome: novelty.status,
            newsItemId: novelty.newsItemId,
            verdict: novelty.verdict,
          })
          return
        }

        if (!newsItemId) {
            emit({
              step: 'blocked',
              label: 'No approved news item available for media production',
              progress: 100,
            })
            return
        }

        // ── Step 3: Write script ─────────────────────────────────────────────
        emit({ step: 'scripting', label: 'Skriver manus...', progress: 30 })

        const scriptRes = await withRetry(() => claude.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          system: SCRIPT_SYSTEM,
          messages: [{
            role: 'user',
            content: `Write a short-form video script for this AI news story:

Title: ${news.title}
Summary: ${news.summary}
Key insight: ${news.key_insight}
Virality score: ${news.virality_score}/100
Audience: ${news.target_audience}
Angle: ${news.content_angle}`,
          }],
        }))
        const scriptRaw = scriptRes.content[0].type === 'text' ? scriptRes.content[0].text : ''
        const scriptClean = scriptRaw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
        let script = JSON.parse(scriptClean) as ScriptWriterOutput

        // ── Step 3b: Quality gate — score hook + density, regenerate if needed ─
        emit({ step: 'quality_check', label: 'Kvalitetsgranskning...', progress: 38 })

        const sourceContext = `${news.title}\n${news.summary}\n${news.key_insight}`
        const qualityScore = await scoreScript(script.hook, script.script, sourceContext)

        if (shouldRegenerate(qualityScore)) {
          emit({
            step: 'quality_regenerating',
            label: `Svag hook (${qualityScore.hook_strength}/10) — skriver om...`,
            progress: 39,
            qualityScore,
          })

          // One auto-regeneration attempt with explicit weakness feedback
          const rewriteRes = await withRetry(() => claude.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 2000,
            system: SCRIPT_SYSTEM,
            messages: [{
              role: 'user',
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
          const rewriteRaw = rewriteRes.content[0].type === 'text' ? rewriteRes.content[0].text : ''
          const rewriteClean = rewriteRaw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
          script = JSON.parse(rewriteClean) as ScriptWriterOutput
        }

        emit({
          step: 'script_done',
          label: `Manus klar (${qualityScore.overall.toFixed(1)}/10): "${script.hook}"`,
          progress: 42,
          qualityScore,
        })

        // ── Step 4: Save script after editorial-approved news + quality gate ──
        const { data: existingScript } = await db
          .from('media_scripts')
          .select('id')
          .eq('project_id', project_id)
          .eq('news_item_id', newsItemId)
          .in('status', ['pending_review', 'approved', 'publishing', 'published'])
          .limit(1)
          .maybeSingle()

        if (existingScript?.id) {
          emit({
            step: 'done',
            label: 'Existing script reused for this news item',
            progress: 100,
            scriptId: existingScript.id,
            reused: true,
          })
          return
        }

        const { data: scriptRow } = await db
          .from('media_scripts')
          .insert({
            project_id,
            news_item_id: newsItemId,
            hook: script.hook,
            script: script.script,
            captions: script.captions,
            hashtags: script.hashtags,
            cta: script.cta,
            tone: script.tone,
            estimated_duration: script.estimated_duration,
            raw_output: toJson(script),
            quality_score: toJson(qualityScore),
            status: 'approved',
            voice_status: 'none',
            video_status: 'none',
            version: 1,
          })
          .select('id')
          .single()

        if (!scriptRow) throw new Error('Kunde inte spara manus till databasen')
        const scriptId = scriptRow.id
        await assertMediaProductionEligible(db, { projectId: project_id, scriptId, stage: 'voice' })

        // Mark news as scripted
        if (newsItemId) {
          await transitionNewsItemStatus(db, {
            projectId: project_id,
            newsItemId,
            toStatus: 'scripted',
            actor: { id: access.userId, kind: 'user' },
            reason: 'Full media pipeline created an approved script',
          })
        }

        // ── Step 5: Voice generation (Victoria) ──────────────────────────────
        emit({ step: 'voice', label: 'Genererar röst (Victoria)...', progress: 50 })

        await db.from('media_scripts').update({ voice_status: 'generating' }).eq('id', scriptId)

        const voiceResult = await generateVoiceover(script.script, 'victoria')

        // ── Step 6: Upload audio + timing ────────────────────────────────────
        emit({ step: 'uploading_audio', label: 'Laddar upp ljud...', progress: 62 })

        const [audioUrl, timingUrl] = await Promise.all([
          uploadAudio(project_id, scriptId, voiceResult.audioBuffer),
          uploadTimingData(project_id, scriptId, {
            words: voiceResult.words,
            durationMs: voiceResult.durationMs,
          }),
        ])

        await db.from('media_scripts').update({
          audio_url: audioUrl,
          timing_url: timingUrl,
          duration_ms: voiceResult.durationMs,
          voice_status: 'ready',
        }).eq('id', scriptId)

        emit({ step: 'voice_done', label: `Röst klar (${(voiceResult.durationMs / 1000).toFixed(1)}s)`, progress: 70 })

        // ── Step 7: Generate image(s) + fetch background music in parallel ──────
        const musicMood = qualityScore.hook_strength >= 8 ? 'urgency' : 'neutral'

        if (isLite) {
          emit({ step: 'images', label: 'Genererar 5 scenbilder (Ideogram)...', progress: 74 })
          const [imageUrls3, backgroundMusicUrl] = await Promise.all([
            generateNewsImages(news.title, script.script, 5),
            getBackgroundMusicUrl(musicMood),
          ])

          emit({ step: 'uploading_images', label: 'Laddar upp bilder...', progress: 88 })
          const storedUrls3 = await Promise.all(
            imageUrls3.map((url, i) => uploadSceneImage(project_id, scriptId, i, url)),
          )
          await db.from('media_scripts').update({
            images: storedUrls3,
            composition: 'SimpleNewsReel',
            background_music_url: backgroundMusicUrl,
          }).eq('id', scriptId)

          emit({
            step: 'done',
            label: 'Pipeline klar! 🎬',
            progress: 100,
            scriptId,
            hook: script.hook,
            renderInputUrl: `/api/media/render-input/${scriptId}`,
            durationMs: voiceResult.durationMs,
            imageCount: storedUrls3.length,
            mode: 'lite',
            composition: 'SimpleNewsReel',
          })
        } else {
          emit({ step: 'images', label: 'Genererar 5 scener (Ideogram)...', progress: 74 })
          const sceneImages = await generateSceneImages(script.script, script.hook)

          emit({ step: 'uploading_images', label: 'Laddar upp bilder...', progress: 88 })
          const imageUrls = await Promise.all(
            sceneImages.map((img, i) => uploadSceneImage(project_id, scriptId, i, img.url)),
          )
          await db.from('media_scripts').update({
            images: imageUrls,
            composition: 'ShortFormVideo',
          }).eq('id', scriptId)

          emit({
            step: 'done',
            label: 'Pipeline klar! 🎬',
            progress: 100,
            scriptId,
            hook: script.hook,
            renderInputUrl: `/api/media/render-input/${scriptId}`,
            durationMs: voiceResult.durationMs,
            imageCount: imageUrls.length,
            mode: 'full',
            composition: 'ShortFormVideo',
          })
        }

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Okänt fel'
        console.error('[pipeline/full]', message)
        sseEvent(controller, { step: 'error', message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
