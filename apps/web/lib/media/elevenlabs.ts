/**
 * ElevenLabs voice generation service.
 *
 * Uses the /with-timestamps endpoint to get both:
 * - Audio (mp3 bytes)
 * - Word-level timing (for subtitle sync in Remotion)
 *
 * Returns a VoiceResult with:
 * - audioBuffer: raw mp3 bytes
 * - words: [{word, startMs, endMs}] for subtitle rendering
 * - durationMs: total audio duration
 *
 * Default voice: Victoria (see lib/voice/config.ts)
 */

import { getBrandVoice, BRAND_MODEL, type BrandVoiceName } from '@/lib/voice/config'
import { logVoiceCost } from '@/lib/cost/track'
import { estimateVoiceSek, reserveSpend, settleSpend, releaseSpend } from '@/lib/cost/budget-gate'
import { resolveCostProjectId } from '@/lib/cost/project'

export interface WordTiming {
  word: string
  startMs: number
  endMs: number
}

export interface VoiceResult {
  audioBuffer: Buffer
  words: WordTiming[]
  durationMs: number
}

// Re-export for backward compatibility
export type { BrandVoiceName as VoiceName }

/**
 * Generate a voiceover with word-level timing.
 * Uses /v1/text-to-speech/{voice_id}/with-timestamps
 * Defaults to the brand voice (Victoria) unless overridden.
 */
export async function generateVoiceover(
  text: string,
  voiceName: BrandVoiceName = 'victoria',
): Promise<VoiceResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set')

  const voice = getBrandVoice(voiceName)

  // ── PR9b pre-spend gate ──────────────────────────────────────────────────
  // TTS credits are exactly what Familje-Stunden's `no_spend_without_approval`
  // hard gate names, and character count makes the cost knowable BEFORE the call
  // rather than only after. Advisory until H1_SPEND_GATE=1: the reservation and
  // the verdict are recorded either way, so the limits can be validated against
  // real traffic before a refusal is ever honoured.
  const estimatedSek = await estimateVoiceSek(text.length)
  const projectId = await resolveCostProjectId()
  const reservation = projectId
    ? await reserveSpend({ projectId, estimatedSek, provider: 'elevenlabs', operation: 'generateVoiceover' })
    : null

  if (reservation && !reservation.allowed) {
    throw new Error(
      `Budget gate refused ElevenLabs spend: ${reservation.reason} `
      + `(estimate ${estimatedSek.toFixed(2)} SEK, headroom ${reservation.headroomSek ?? '?'} SEK)`,
    )
  }

  let response: Response
  try {
    response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}/with-timestamps`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: BRAND_MODEL,
          voice_settings: voice.settings,
        }),
      },
    )
  } catch (e) {
    // Never dispatched, or never answered — free the headroom rather than let it
    // age out, so a burst of failures cannot starve the budget.
    await releaseSpend(reservation?.reservationId ?? null)
    throw e
  }

  if (!response.ok) {
    const error = await response.text()
    // A refused call is not a charge.
    await releaseSpend(reservation?.reservationId ?? null)
    throw new Error(`ElevenLabs API error ${response.status}: ${error}`)
  }

  const data = await response.json() as {
    audio_base64: string
    alignment: {
      characters: string[]
      character_start_times_seconds: number[]
      character_end_times_seconds: number[]
    }
  }

  const audioBuffer = Buffer.from(data.audio_base64, 'base64')

  // Cost Intelligence — log the voiceover spend (best-effort, never blocks).
  await logVoiceCost(text.length, { metadata: { voice: voiceName, model: BRAND_MODEL } })
  // The real cost is now in cost_events; the reservation must stop counting or
  // the same spend is counted twice.
  await settleSpend(reservation?.reservationId ?? null, estimatedSek)

  const words = buildWordTimings(data.alignment)
  const durationMs = words.length > 0 ? words[words.length - 1].endMs : 0

  return { audioBuffer, words, durationMs }
}

/**
 * Convert character-level alignment from ElevenLabs to word-level timing.
 * ElevenLabs returns per-character timing — we merge into words.
 */
function buildWordTimings(alignment: {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}): WordTiming[] {
  const words: WordTiming[] = []
  let currentWord = ''
  let wordStart = 0

  for (let i = 0; i < alignment.characters.length; i++) {
    const char = alignment.characters[i]
    const start = alignment.character_start_times_seconds[i]
    const end = alignment.character_end_times_seconds[i]

    if (char === ' ' || char === '\n') {
      if (currentWord.trim()) {
        words.push({
          word: currentWord.trim(),
          startMs: Math.round(wordStart * 1000),
          endMs: Math.round(alignment.character_end_times_seconds[i - 1] * 1000),
        })
      }
      currentWord = ''
    } else {
      if (!currentWord) wordStart = start
      currentWord += char

      // Last character
      if (i === alignment.characters.length - 1) {
        words.push({
          word: currentWord.trim(),
          startMs: Math.round(wordStart * 1000),
          endMs: Math.round(end * 1000),
        })
      }
    }
  }

  return words.filter(w => w.word.length > 0)
}
