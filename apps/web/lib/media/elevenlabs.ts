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
import { estimateVoiceSek } from '@/lib/cost/budget-gate'
import {
  MEDIA_PIPELINE_PROJECT, ProviderNotDispatchedError, withGovernedSpend, type ProjectRef,
} from '@/lib/cost/governed-spend'

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
  project: ProjectRef = MEDIA_PIPELINE_PROJECT,
  /**
   * Stable identity for THIS voiceover, so the caller's retry reserves once.
   * Omit unless the caller has a genuinely unique subject (see spend-identity).
   */
  idempotencyKey?: string,
): Promise<VoiceResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set')

  const voice = getBrandVoice(voiceName)

  // ── Governed pre-spend boundary ──────────────────────────────────────────
  // Character count makes the cost knowable BEFORE the call, so this is the one
  // path that already reserved. It now goes through the shared boundary instead
  // of hand-rolling the lifecycle, which is what closes audit F-002: the old
  // `projectId ? reserve : null` skipped the gate entirely when the project
  // could not be resolved, and a database blip was enough to trigger it.
  const estimatedSek = await estimateVoiceSek(text.length)

  return withGovernedSpend(
    { project, provider: 'elevenlabs', operation: 'generateVoiceover', estimatedSek, idempotencyKey },
    async () => {
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
        throw new ProviderNotDispatchedError('elevenlabs request never reached the provider', e)
      }

      if (!response.ok) {
        const error = await response.text()
        const failure = new Error(`ElevenLabs API error ${response.status}: ${error}`)
        // A rejected request synthesised nothing. A 5xx may have, and settles.
        if (response.status < 500) {
          throw new ProviderNotDispatchedError(`elevenlabs refused with ${response.status}`, failure)
        }
        throw failure
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

      await logVoiceCost(text.length, {
        ...('projectId' in project ? { projectId: project.projectId } : { projectSlug: project.projectSlug }),
        metadata: { voice: voiceName, model: BRAND_MODEL },
      })

      const words = buildWordTimings(data.alignment)
      const durationMs = words.length > 0 ? words[words.length - 1].endMs : 0

      return { audioBuffer, words, durationMs }
    },
  )
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

/**
 * Generate a background music bed via ElevenLabs sound-generation.
 *
 * The audit found this path outside BOTH the budget gate and `cost_events` — it
 * spent real credits and left no record anywhere, so it was invisible even to
 * after-the-fact accounting. It is now governed and logged like every other
 * billable call.
 *
 * Sound generation is billed per second of audio rather than per character, and
 * `cost_rates` has no row for it yet. The estimate reuses the voice rate against
 * the requested duration at a deliberately generous character-equivalent, which
 * over-estimates — the safe direction for a ceiling — until G2 adds a real rate.
 */
export async function generateSoundEffect(
  prompt: string,
  durationSeconds: number,
  project: ProjectRef,
  promptInfluence = 0.3,
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set')

  // ~200 character-equivalents per second of generated audio. Pessimistic on
  // purpose: an over-estimate reserves too much, an under-estimate lets a
  // concurrent caller through.
  const estimatedSek = await estimateVoiceSek(Math.ceil(durationSeconds * 200))

  return withGovernedSpend(
    { project, provider: 'elevenlabs', operation: 'generateSoundEffect', estimatedSek },
    async () => {
      let res: Response
      try {
        res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
          method: 'POST',
          headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: prompt,
            duration_seconds: durationSeconds,
            prompt_influence: promptInfluence,
          }),
        })
      } catch (e) {
        throw new ProviderNotDispatchedError('elevenlabs sound-generation never reached the provider', e)
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText)
        const failure = new Error(`ElevenLabs sound-generation failed (${res.status}): ${errText}`)
        if (res.status < 500) {
          throw new ProviderNotDispatchedError(`elevenlabs refused with ${res.status}`, failure)
        }
        throw failure
      }

      const audioBuffer = Buffer.from(await res.arrayBuffer())

      await logVoiceCost(Math.ceil(durationSeconds * 200), {
        ...('projectId' in project ? { projectId: project.projectId } : { projectSlug: project.projectSlug }),
        agent: 'Music Director',
        operation: 'Generate Background Music',
        metadata: { duration_seconds: durationSeconds, model: 'sound-generation' },
      })

      return audioBuffer
    },
  )
}
