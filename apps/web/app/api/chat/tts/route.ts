/**
 * POST /api/chat/tts
 *
 * Converts text to speech using Victoria's voice (ElevenLabs).
 * Used by the Manager Agent voice conversation feature.
 *
 * Body: { text: string }
 * Returns: audio/mpeg binary
 */

import { VICTORIA_VOICE_ID, BRAND_MODEL, BRAND_VOICE_SETTINGS } from '@/lib/voice/config'

export const dynamic    = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'ELEVENLABS_API_KEY saknas' }, { status: 500 })
  }

  const { text } = await request.json() as { text: string }
  if (!text?.trim()) {
    return Response.json({ error: 'text krävs' }, { status: 400 })
  }

  // Truncate to ~500 chars for chat responses — keeps latency low
  const trimmed = text.trim().slice(0, 500)

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VICTORIA_VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key':   apiKey,
        'Content-Type': 'application/json',
        'Accept':       'audio/mpeg',
      },
      body: JSON.stringify({
        text:          trimmed,
        model_id:      BRAND_MODEL,
        voice_settings: BRAND_VOICE_SETTINGS,
      }),
      signal: AbortSignal.timeout(25_000),
    },
  )

  if (!res.ok) {
    const err = await res.text().catch(() => 'unknown')
    return Response.json({ error: `ElevenLabs ${res.status}: ${err}` }, { status: 502 })
  }

  const audio = await res.arrayBuffer()
  return new Response(audio, {
    headers: {
      'Content-Type':   'audio/mpeg',
      'Content-Length': audio.byteLength.toString(),
      'Cache-Control':  'no-store',
    },
  })
}
