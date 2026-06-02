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

  const response = await fetch(
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

  if (!response.ok) {
    const error = await response.text()
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
