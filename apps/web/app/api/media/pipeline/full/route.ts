/**
 * POST /api/media/pipeline/full
 *
 * One-shot pipeline: article text → render-ready script.
 * Streams progress as Server-Sent Events so the UI can show live status.
 *
 * Steps (in order):
 *   1. Claude analyzes the article → NewsHunterOutput
 *   2. Saves news item to media_news_items (auto-approved)
 *   3. Claude writes short-form video script → ScriptWriterOutput
 *   4. Saves script to media_scripts (auto-approved)
 *   5. ElevenLabs generates Victoria voiceover + word timing
 *   6. Uploads audio + timing to Supabase Storage
 *   7. Ideogram generates 5 cinematic scene images
 *   8. Uploads images to Supabase Storage
 *   9. Returns script_id + render_input_url
 *
 * Body: { text: string, project_id: string }
 *
 * SSE event format:
 *   data: {"step":"analyzing","label":"Analyserar artikel...","progress":10}
 *   data: {"step":"done","scriptId":"...","renderInputUrl":"...","progress":100}
 *   data: {"step":"error","message":"..."}
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateVoiceover } from '@/lib/media/elevenlabs'
import { uploadAudio, uploadTimingData, uploadSceneImage } from '@/lib/media/storage'
import { generateSceneImages, generateNewsImage } from '@/lib/media/ideogram'
import type { NewsHunterOutput, ScriptWriterOutput } from '@/lib/media/types'
import { Anthropic } from '@anthropic-ai/sdk'

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

const SCRIPT_SYSTEM = `You are a short-form video scriptwriter for "The Prompt" — a premium daily AI news channel.

Style: Bloomberg QuickTake meets Wired Magazine. Factual, fast, trustworthy. Zero hype, zero fluff.
Voice: Victoria (warm, authoritative, conversational). Write for how she speaks — punchy sentences, natural rhythm.

═══ HOOK — the most critical line ═══
The hook is the FIRST sentence Victoria speaks. It becomes the first caption on screen.
It must create immediate tension, curiosity, or industry-impact framing within 15 words.

STRONG hooks (use these patterns):
- Tension: "OpenAI just made a move that could seriously affect software engineers."
- Surprise: "Most developers missed what Anthropic quietly released this week."
- Stakes: "This AI update may render an entire category of dev tools obsolete."
- Specificity: "Google just gave its AI access to something it never had before."
- Consequence: "A major AI lab just laid off its safety team. Here's what that means."

WEAK hooks (never write these):
- "AI is changing the world." — too vague
- "Artificial intelligence continues to..." — too generic
- "In today's video..." — forbidden
- "You won't believe..." — clickbait

═══ SCRIPT BODY ═══
- 3–5 short paragraphs, each landing ONE clear idea
- Total: 45–70 seconds at natural speaking pace (≈120 words per minute)
- Short sentences. Maximum 2 clauses per sentence.
- No jargon without immediate plain-English explanation
- End on an insight or open question — never a CTA

═══ FACTUAL INTEGRITY — non-negotiable ═══
- Rewrite in your own words. Never copy source sentences.
- Preserve ALL specifics: numbers, percentages, names, dates, model names.
- OMIT any detail not in the source — never guess or extrapolate.
- If the source says "may" or "could", you say "may" or "could".
- No editorializing beyond what the source supports.

Return ONLY valid JSON (no markdown fences):
{
  "hook": "...",
  "script": "Full voiceover script...",
  "captions": ["Short display caption 1", "Short display caption 2"],
  "hashtags": ["#AI", "#Tech"],
  "cta": "One-line CTA for caption",
  "tone": "educational",
  "estimated_duration": "~60 seconds",
  "difficulty": "intermediate"
}`

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { text, project_id, mode = 'lite' } = await request.json() as {
    text: string
    project_id: string
    mode?: PipelineMode
  }
  if (!text?.trim() || !project_id) {
    return new Response('text and project_id required', { status: 400 })
  }
  const isLite = mode !== 'full'

  const db = createAdminClient()
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

        // ── Step 2: Save news item (auto-approved) ───────────────────────────
        const { data: newsItem } = await db
          .from('media_news_items')
          .insert({
            project_id,
            title: news.title,
            summary: news.summary,
            key_insight: news.key_insight,
            url: news.source_url ?? null,
            source_name: news.source_name ?? null,
            target_audience: news.target_audience,
            content_angle: news.content_angle,
            virality_score: news.virality_score ?? 0,
            status: 'approved',  // skip manual approval
            raw_output: news,
          })
          .select('id')
          .single()

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
        const script = JSON.parse(scriptClean) as ScriptWriterOutput

        emit({ step: 'script_done', label: `Manus: "${script.hook}"`, progress: 42 })

        // ── Step 4: Save script (auto-approved) ──────────────────────────────
        const { data: scriptRow } = await db
          .from('media_scripts')
          .insert({
            project_id,
            news_item_id: newsItem?.id ?? null,
            hook: script.hook,
            script: script.script,
            captions: script.captions,
            hashtags: script.hashtags,
            cta: script.cta,
            tone: script.tone,
            estimated_duration: script.estimated_duration,
            raw_output: script,
            status: 'approved',   // skip manual approval
            voice_status: 'none',
            video_status: 'none',
            version: 1,
          })
          .select('id')
          .single()

        if (!scriptRow) throw new Error('Kunde inte spara manus till databasen')
        const scriptId = scriptRow.id

        // Mark news as scripted
        if (newsItem?.id) {
          await db.from('media_news_items').update({ status: 'scripted' }).eq('id', newsItem.id)
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

        // ── Step 7: Generate image(s) ─────────────────────────────────────────
        if (isLite) {
          emit({ step: 'images', label: 'Genererar nyhetsbild med rubrik (Ideogram)...', progress: 74 })
          const imageUrl = await generateNewsImage(news.title, script.script)

          emit({ step: 'uploading_images', label: 'Laddar upp bild...', progress: 88 })
          const storedUrl = await uploadSceneImage(project_id, scriptId, 0, imageUrl)
          await db.from('media_scripts').update({
            images: [storedUrl],
            composition: 'SimpleNewsReel',
          }).eq('id', scriptId)

          emit({
            step: 'done',
            label: 'Pipeline klar! 🎬',
            progress: 100,
            scriptId,
            hook: script.hook,
            renderInputUrl: `/api/media/render-input/${scriptId}`,
            durationMs: voiceResult.durationMs,
            imageCount: 1,
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
