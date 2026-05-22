/**
 * POST /api/media/pipeline/intro
 *
 * Generates The Prompt's launch intro video — "What is The Prompt?"
 * Uses a hand-crafted script instead of news analysis.
 * Same SimpleNewsReel pipeline: voice → brand image → DB.
 *
 * Body: { project_id: string }
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateVoiceover } from '@/lib/media/elevenlabs'
import { uploadAudio, uploadTimingData, uploadSceneImage } from '@/lib/media/storage'
import { Anthropic } from '@anthropic-ai/sdk'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

function sseEvent(controller: ReadableStreamDefaultController, payload: Record<string, unknown>) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`))
}

// ─── The Prompt intro script ──────────────────────────────────────────────────
// Written to be read by Victoria in ~55 seconds. Warm, confident, editorial.

const INTRO = {
  hook:    "Every day, AI changes the world. Most people miss it.",
  script: `Every day, breakthroughs in artificial intelligence reshape how we work, think, and create. But the headlines are buried under noise, hype, and technical jargon that leaves most people behind.

That ends here.

The Prompt is your daily briefing on what actually matters in AI — explained clearly, told honestly, without the fluff.

We cover the real stories: the models rewriting entire industries, the research that sounds boring but changes everything, the decisions made in boardrooms and labs that will affect your life whether you pay attention or not.

No hype. No panic. Just the signal.

New video every day. This is The Prompt.`,
  captions:           ['AI news. Daily.', 'No hype. Just the signal.', 'New video every day.'],
  hashtags:           ['#AI', '#ArtificialIntelligence', '#TechNews', '#AINews', '#ThePrompt', '#MachineLearning', '#FutureOfWork', '#Tech'],
  cta:                'Follow for daily AI news 📡',
  tone:               'inspiring' as const,
  estimated_duration: '~55 seconds',
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { project_id } = await request.json() as { project_id: string }
  if (!project_id) return new Response('project_id required', { status: 400 })

  const db      = createAdminClient()
  const claude  = new Anthropic()

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (p: Record<string, unknown>) => sseEvent(controller, p)

      try {
        // ── Save script ──────────────────────────────────────────────────────
        emit({ step: 'saving', label: 'Saving intro script...', progress: 5 })

        const { data: scriptRow } = await db
          .from('media_scripts')
          .insert({
            project_id,
            hook:               INTRO.hook,
            script:             INTRO.script,
            captions:           INTRO.captions,
            hashtags:           INTRO.hashtags,
            cta:                INTRO.cta,
            tone:               INTRO.tone,
            estimated_duration: INTRO.estimated_duration,
            raw_output:         INTRO,
            status:             'approved',
            voice_status:       'none',
            video_status:       'none',
            version:            1,
          })
          .select('id')
          .single()

        if (!scriptRow) throw new Error('Could not save intro script')
        const scriptId = scriptRow.id

        // ── Voice ────────────────────────────────────────────────────────────
        emit({ step: 'voice', label: 'Generating Victoria voiceover...', progress: 20 })
        await db.from('media_scripts').update({ voice_status: 'generating' }).eq('id', scriptId)

        const voiceResult = await generateVoiceover(INTRO.script, 'victoria')

        emit({ step: 'uploading_audio', label: 'Uploading audio...', progress: 45 })
        const [audioUrl, timingUrl] = await Promise.all([
          uploadAudio(project_id, scriptId, voiceResult.audioBuffer),
          uploadTimingData(project_id, scriptId, { words: voiceResult.words, durationMs: voiceResult.durationMs }),
        ])

        await db.from('media_scripts').update({
          audio_url:    audioUrl,
          timing_url:   timingUrl,
          duration_ms:  voiceResult.durationMs,
          voice_status: 'ready',
        }).eq('id', scriptId)

        emit({ step: 'voice_done', label: `Voice ready (${(voiceResult.durationMs / 1000).toFixed(1)}s)`, progress: 55 })

        // ── Brand image ──────────────────────────────────────────────────────
        emit({ step: 'image', label: 'Generating brand launch image...', progress: 60 })

        // Custom prompt for intro: dark, editorial, brand launch feel
        const imgPromptRes = await claude.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: `Write an Ideogram image generation prompt for the launch image of an AI news channel called "The Prompt".

Style: cinematic, dark editorial, Bloomberg/Wired aesthetic. Vertical 9:16.
Subject: something that evokes "the flow of information" — physical, tangible, no abstract AI clichés.
Must include at bottom: Include bold white text at bottom center: "THE PROMPT"

Output ONLY the prompt string.`,
          }],
        })

        const visualPrompt = imgPromptRes.content[0].type === 'text'
          ? imgPromptRes.content[0].text.trim()
          : 'Dark editorial newsroom at night, stacks of newspapers catching morning light through industrial windows, cinematic vertical composition. Include bold white text at bottom center: "THE PROMPT"'

        const apiKey = process.env.IDEOGRAM_API_KEY
        if (!apiKey) throw new Error('IDEOGRAM_API_KEY not set')

        const ideogramRes = await fetch('https://api.ideogram.ai/v1/ideogram-v3/generate', {
          method: 'POST',
          headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt:          visualPrompt,
            aspect_ratio:    '9x16',
            style_type:      'DESIGN',
            rendering_speed: 'DEFAULT',
            negative_prompt: 'blurry, low quality, distorted, watermark, logo, cartoon, anime, people, face, hands',
          }),
        })

        if (!ideogramRes.ok) throw new Error(`Ideogram error: ${await ideogramRes.text()}`)
        const imgData = await ideogramRes.json() as { data: Array<{ url: string }> }
        const imageUrl = imgData.data?.[0]?.url
        if (!imageUrl) throw new Error('Ideogram returned no image')

        emit({ step: 'uploading_image', label: 'Uploading image...', progress: 85 })
        const storedUrl = await uploadSceneImage(project_id, scriptId, 0, imageUrl)

        await db.from('media_scripts').update({
          images:      [storedUrl],
          composition: 'SimpleNewsReel',
        }).eq('id', scriptId)

        emit({
          step:            'done',
          label:           '🎬 Intro video ready for render!',
          progress:        100,
          scriptId,
          hook:            INTRO.hook,
          renderInputUrl:  `/api/media/render-input/${scriptId}`,
          durationMs:      voiceResult.durationMs,
        })

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('[pipeline/intro]', message)
        sseEvent(controller, { step: 'error', message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
