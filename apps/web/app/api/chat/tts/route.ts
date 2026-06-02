/**
 * POST /api/chat/tts
 *
 * Converts text to speech using OpenAI TTS.
 * OpenAI's nova/shimmer voices handle Swedish naturally and sound
 * much more human than browser TTS or ElevenLabs English voices.
 *
 * Body: { text: string, voice?: 'nova' | 'shimmer' | 'alloy' | 'echo' | 'fable' | 'onyx' }
 * Returns: audio/mpeg binary
 *
 * Voices (all handle Swedish well):
 *   nova    — warm, natural female (default)
 *   shimmer — slightly softer female
 *   alloy   — neutral
 *   onyx    — deep male
 */

export const dynamic     = 'force-dynamic'
export const maxDuration = 20

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'OPENAI_API_KEY saknas' }, { status: 500 })
  }

  const { text, voice = 'nova' } = await request.json() as { text: string; voice?: string }
  if (!text?.trim()) {
    return Response.json({ error: 'text krävs' }, { status: 400 })
  }

  const trimmed = text.trim().slice(0, 600)

  const tTts = Date.now()
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:           'tts-1',       // tts-1-hd for higher quality but slower
      voice,
      input:           trimmed,
      response_format: 'mp3',
      speed:           1.0,
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => 'unknown')
    return Response.json({ error: `OpenAI TTS ${res.status}: ${err}` }, { status: 502 })
  }

  const audio = await res.arrayBuffer()
  const ttsMs = Date.now() - tTts
  return new Response(audio, {
    headers: {
      'Content-Type':   'audio/mpeg',
      'Content-Length': audio.byteLength.toString(),
      'Cache-Control':  'no-store',
      'x-tts-ms':       String(ttsMs),   // latens-mätning per mening
    },
  })
}
