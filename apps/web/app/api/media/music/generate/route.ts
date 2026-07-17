/**
 * POST /api/media/music/generate
 *
 * Generates a background music track for a script using ElevenLabs Sound Generation.
 * The track is ~22s, looped in Remotion behind the voice at low volume (0.08).
 *
 * Body: { scriptId: string }
 *
 * Flow:
 *   1. Load script tone from DB
 *   2. Map tone → cinematic music prompt
 *   3. Call ElevenLabs /v1/sound-generation
 *   4. Upload MP3 to Supabase storage
 *   5. Store background_music_url in media_scripts
 *   6. Return { musicUrl }
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadMusic } from '@/lib/media/storage'
import { resolveProjectAccess, assertProjectAllowed } from '@/lib/auth/project-access'
import { assertMediaProductionEligible, eligibilityResponse } from '@/lib/media/eligibility'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

// ── Tone → music prompt mapping ──────────────────────────────────────────────

const TONE_PROMPTS: Record<string, string> = {
  dramatic:      'cinematic dramatic orchestral ambient, building tension, deep pads, subtle strings, no melody, background score',
  inspirational: 'uplifting cinematic ambient, warm synth pads, hopeful and motivational, soft electronic, no vocals',
  educational:   'calm documentary ambient music, clear and focused, soft piano pads, subtle and neutral',
  casual:        'lo-fi chill ambient, relaxed warm tones, easy listening background music, no beats',
  humorous:      'playful light ambient music, cheerful background, warm and friendly, subtle pizzicato',
  serious:       'minimal cinematic ambient, dark atmospheric pads, serious tone, understated, no melody',
}

const DEFAULT_PROMPT =
  'cinematic ambient background music, atmospheric and subtle, documentary style, soft pads, no vocals, no strong melody'

function getMusicPrompt(tone?: string | null): string {
  if (!tone) return DEFAULT_PROMPT
  return TONE_PROMPTS[tone.toLowerCase()] ?? DEFAULT_PROMPT
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const { scriptId } = await request.json() as { scriptId: string }
  if (!scriptId) return NextResponse.json({ error: 'scriptId required' }, { status: 400 })

  const db = createAdminClient()

  // ── Load script to get tone ──────────────────────────────────────────────
  const { data: script, error: scriptError } = await db
    .from('media_scripts')
    .select('id, project_id, tone, background_music_url')
    .eq('id', scriptId)
    .single()

  if (scriptError || !script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  const projectId = script.project_id
  if (!projectId) {
    return NextResponse.json({ error: 'Script is missing project_id' }, { status: 422 })
  }
  // ISOLATION (C-1): the script must belong to one of the caller's projects
  // BEFORE eligibility probing, the paid ElevenLabs generation, and the DB
  // write. Foreign scripts return the same 404 as missing (no existence probing).
  if (!assertProjectAllowed(projectId, access.allowedProjectIds)) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }
  try {
    await assertMediaProductionEligible(db, { projectId, scriptId, stage: 'music' })
  } catch (guardError) {
    const res = eligibilityResponse(guardError)
    return NextResponse.json(res.body, { status: res.status })
  }

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ELEVENLABS_API_KEY not configured' }, { status: 500 })
  }

  const prompt = getMusicPrompt(script.tone)

  try {
    // ── Call ElevenLabs Sound Generation API ──────────────────────────────
    const elevenRes = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: prompt,
        duration_seconds: 22,   // max supported — Remotion loops it
        prompt_influence: 0.3,  // subtle influence keeps it ambient, not literal
      }),
    })

    if (!elevenRes.ok) {
      const errText = await elevenRes.text().catch(() => elevenRes.statusText)
      throw new Error(`ElevenLabs sound-generation failed (${elevenRes.status}): ${errText}`)
    }

    const audioBuffer = Buffer.from(await elevenRes.arrayBuffer())

    // ── Upload to Supabase storage ─────────────────────────────────────────
    const musicUrl = await uploadMusic(projectId, scriptId, audioBuffer)

    // ── Persist URL to DB ──────────────────────────────────────────────────
    await db
      .from('media_scripts')
      .update({ background_music_url: musicUrl })
      .eq('id', scriptId)

    return NextResponse.json({ ok: true, musicUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Music generation failed'
    console.error('[music/generate]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
