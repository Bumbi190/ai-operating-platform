/**
 * POST /api/chat/tts
 *
 * Converts text to speech using OpenAI TTS.
 * OpenAI's nova/shimmer voices handle Swedish naturally and sound
 * much more human than browser TTS or ElevenLabs English voices.
 *
 * Body: { text: string, voice?: 'onyx' | 'echo' | 'nova' | 'shimmer' | 'alloy' | 'fable' }
 * Returns: audio/mpeg binary
 *
 * Voices (all handle Swedish well):
 *   onyx    — deep, calm, authoritative male — ATLAS standard (Executive Chief of Staff)
 *   echo    — neutral, clear male
 *   nova    — warm, natural female
 *   shimmer — slightly softer female
 *   alloy   — neutral
 */

import { requireUserSession } from '@/lib/auth/session'
import { getAtlasServiceErrorMessage } from '@/lib/atlas/provider-errors'

export const dynamic     = 'force-dynamic'
export const maxDuration = 20

export async function POST(request: Request) {
  // SESSION ONLY (4B2). Kräver inloggad användare — den globala AIOPS_API_KEY
  // ger inte längre åtkomst och läses inte här.
  //
  // Auth sker FÖRST, före all body-parsning och före varje OpenAI-anrop. Den
  // ordningen är själva skyddet: routen spenderar pengar hos OpenAI, så en
  // oautentiserad request får aldrig hinna kosta något. Routen är inte
  // projektbunden och har därför medvetet ingen project credential — den
  // saknar projektdimension att scopa mot.
  const auth = await requireUserSession()
  if (!auth.ok) return auth.response

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    const code = 'ATLAS_TTS_NOT_CONFIGURED' as const
    return Response.json(
      { code, error: getAtlasServiceErrorMessage(code) },
      { status: 503 },
    )
  }

  const {
    text,
    voice = 'onyx',
    // hd=true ger bättre uttal för svenska — ~100-150ms extra latens men
    // tydligt bättre prosodi och vokalljud. Standard för Atlas-röst.
    hd    = true,
    // 1.08 ger mer naturlig svenska-rytm. Neutral svenska tenderar annars
    // att låta något segt i OpenAI-röster.
    speed = 1.08,
  } = await request.json() as { text: string; voice?: string; hd?: boolean; speed?: number }

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
      model:           hd ? 'tts-1-hd' : 'tts-1',
      voice,
      input:           trimmed,
      response_format: 'mp3',
      speed:           Math.max(0.25, Math.min(4.0, speed)),
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const code = 'ATLAS_TTS_REQUEST_FAILED' as const
    console.error('[atlas-tts] OpenAI request failed', { status: res.status })
    return Response.json(
      { code, error: getAtlasServiceErrorMessage(code) },
      { status: 502 },
    )
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
