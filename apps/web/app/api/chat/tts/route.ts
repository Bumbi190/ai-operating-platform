/**
 * POST /api/chat/tts
 *
 * Converts text to speech using OpenAI's speech API.
 *
 * Body: { text: string, voice?: string, speed?: number }
 * Returns: audio/mpeg binary
 *
 * Atlas speaks with `gpt-4o-mini-tts` and the `onyx` voice. Both were chosen by
 * a latency benchmark followed by an owner listening test, replacing the older
 * tts-1-hd path. Changing either is a product decision, not a tuning knob —
 * hence the named constant below.
 *
 * THE DEFAULT REQUEST SENDS FOUR FIELDS AND NOTHING ELSE: model, voice, input,
 * response_format. That is exactly the payload the approved voice sample was
 * generated from, and keeping it identical is the point. Anything added here by
 * default ships a configuration nobody listened to.
 *
 * So there is no default `speed` — the previous 1.08 was a workaround for the
 * old model sounding sluggish in Swedish and did not survive the change — and
 * no `instructions`, which is this model's real pacing lever and should be
 * benchmarked and listened to before it is used.
 *
 * An EXPLICIT `speed` from a caller is still honoured and clamped, as it always
 * was. Note that the installed SDK's JSDoc claims speed does not work with this
 * model; that is stale, and a direct check against the API disproved it.
 *
 * Speech normalisation of numbers, dates and currency is a SEPARATE slice. The
 * text arriving here is still raw, and that is expected.
 */

import { requireUserSession } from '@/lib/auth/session'
import { getAtlasServiceErrorMessage } from '@/lib/atlas/provider-errors'
import { openAISpeech } from '@/lib/ai/openai-client'
import { PLATFORM_COMPAT_PROJECT } from '@/lib/cost/governed-spend'

export const dynamic     = 'force-dynamic'
export const maxDuration = 20

/** The benchmarked winner. Named so a future change has to be deliberate. */
const ATLAS_TTS_MODEL = 'gpt-4o-mini-tts'

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

  // `hd` is gone. It used to pick tts-1-hd over tts-1; with the model pinned it
  // could only lie about what it does, and a repository search found no caller
  // that ever sent it. `speed` stays optional — see the header.
  const {
    text,
    voice = 'onyx',
    speed,
  } = await request.json() as { text: string; voice?: string; speed?: number }

  if (!text?.trim()) {
    return Response.json({ error: 'text krävs' }, { status: 400 })
  }

  const trimmed = text.trim().slice(0, 600)

  // Exactly the benchmark's winning payload — these four fields and no others.
  const payload: Record<string, unknown> = {
    model:           ATLAS_TTS_MODEL,
    voice,
    input:           trimmed,
    response_format: 'mp3',
  }
  // Added ONLY when a caller asks for it, so the Atlas path stays benchmark-
  // identical. Same clamp the route has always applied to an explicit value.
  if (typeof speed === 'number' && Number.isFinite(speed)) {
    payload.speed = Math.max(0.25, Math.min(4.0, speed))
  }

  const tTts = Date.now()
  // Atlas speech was outside BOTH the budget gate and cost_events. It is now
  // governed and logged; the payload, timeout and error envelope are unchanged.
  let res: Response
  try {
    res = await openAISpeech(
      { project: PLATFORM_COMPAT_PROJECT, agent: 'Atlas', operation: 'Atlas TTS' },
      payload,
      { signal: AbortSignal.timeout(15_000) },
    )
  } catch (e) {
    const code = 'ATLAS_TTS_REQUEST_FAILED' as const
    const status = (e as { status?: number })?.status
    console.error('[atlas-tts] OpenAI request failed', { status: status ?? 'refused' })
    return Response.json(
      { code, error: getAtlasServiceErrorMessage(code) },
      { status: 502 },
    )
  }

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
