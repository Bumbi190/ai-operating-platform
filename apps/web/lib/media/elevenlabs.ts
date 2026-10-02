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
import { ELEVENLABS_SOUND_RATE_KEY, logSoundCost, logVoiceCost } from '@/lib/cost/track'
import { estimateVoiceSek } from '@/lib/cost/budget-gate'
import { getRates } from '@/lib/cost/rates'
import { fixedUnitCeiling } from '@/lib/cost/spend-ceiling'
import {
  MEDIA_PIPELINE_PROJECT, ProviderNotDispatchedError, SpendRefusedError, withGovernedSpend, type ProjectRef,
} from '@/lib/cost/governed-spend'
import {
  ProviderDispatchUnknownError,
  classifyTransportFailure,
  statusProvesNotCreated,
} from '@/lib/media/job/dispatch'
import type { ExecutionContract } from '@/lib/governance/execution-stop'

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
  /**
   * REQUIRED execution classification. Positional and non-optional on purpose:
   * this helper is reached from cron pipelines and from operator-triggered
   * regeneration, and only the caller knows which.
   */
  execution: ExecutionContract,
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
  // M0: one rate snapshot prices the fixed-unit ceiling AND the metering.
  const rates = await getRates()
  const estimatedSek = await estimateVoiceSek(text.length, rates)

  return withGovernedSpend(
    { project, execution, provider: 'elevenlabs', operation: 'generateVoiceover', estimatedSek, idempotencyKey,
      ceilingBasis: 'fixed_units', rates },
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
        // THE AMBIGUITY BOUNDARY. This claimed `ProviderNotDispatchedError`
        // for EVERY thrown fetch — a positive claim ("nothing was
        // synthesised") that a reset or a fired deadline cannot support. The
        // 30s `AbortSignal.timeout` on this request makes exactly that case
        // routine: a deadline usually fires because ElevenLabs already has
        // the text and is working. It cost twice over — the reservation was
        // RELEASED for audio that may have been billed, and the failure read
        // as retryable, so the caller synthesised a second time.
        const verdict = classifyTransportFailure(e)
        if (verdict.sent === false) {
          throw new ProviderNotDispatchedError(
            `elevenlabs request never reached the provider (${verdict.code})`, e)
        }
        throw new ProviderDispatchUnknownError({
          provider: 'elevenlabs', observation: 'response_lost',
          detail: verdict.detail, cause: e,
        })
      }

      if (!response.ok) {
        const error = await response.text()
        const failure = new Error(`ElevenLabs API error ${response.status}: ${error}`)
        // A rejected request synthesised nothing. A 5xx may have, and settles.
        // A 4xx is the vendor ANSWERING: it parsed the request and
        // synthesised nothing. A 5xx is not an answer about the work.
        if (statusProvesNotCreated(response.status)) {
          throw new ProviderNotDispatchedError(`elevenlabs refused with ${response.status}`, failure)
        }
        throw new ProviderDispatchUnknownError({
          provider: 'elevenlabs', observation: 'response_lost',
          detail: `${failure.message} — a ${response.status} says nothing about whether it synthesised`,
          cause: failure,
        })
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
 * ── M0: A HARD CEILING OR NO CALL ──────────────────────────────────────────
 * Sound generation is billed per SECOND of audio. This used to reserve
 * `durationSeconds × 200` "character-equivalents" at the VOICE character rate —
 * a proxy for a different billing unit, called generous but proven nothing. A
 * proxy is not a hard ceiling, so it is gone:
 *
 *   ceiling  = ceil(durationSeconds) × cost_rates.elevenlabs_sound_usd_per_second
 *              × usd_sek, at the pinned rate snapshot
 *   metering = the SAME seconds × the SAME pinned rate (`logSoundCost`)
 *
 * With no canonical per-second rate configured — the case today — or no
 * explicit positive duration (auto-duration has no request-fixed bound), the
 * call is REFUSED with `unbounded_spend` and the provider is never called.
 */
export async function generateSoundEffect(
  prompt: string,
  durationSeconds: number,
  /** REQUIRED execution classification — see generateVoiceover. */
  execution: ExecutionContract,
  project: ProjectRef,
  promptInfluence = 0.3,
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set')

  const unbounded = (detail: string) => new SpendRefusedError({
    reason: 'unbounded_spend', provider: 'elevenlabs', operation: 'generateSoundEffect', detail,
  })
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw unbounded('an explicit positive duration_seconds is required: auto-duration has no request-fixed bound')
  }
  // A started second is a billable second: the maximum the request can bill.
  const billableSeconds = Math.ceil(durationSeconds)
  const rates = await getRates()
  const perSecond = rates[ELEVENLABS_SOUND_RATE_KEY]
  if (typeof perSecond !== 'number' || !Number.isFinite(perSecond) || perSecond < 0) {
    throw unbounded(`no canonical per-second rate is configured (cost_rates.${ELEVENLABS_SOUND_RATE_KEY})`)
  }
  const ceiling = fixedUnitCeiling(billableSeconds, perSecond, rates, `sound:${billableSeconds}s`)
  if (!ceiling.ok) throw unbounded(ceiling.reason)
  const estimatedSek = ceiling.sek

  return withGovernedSpend(
    { project, execution, provider: 'elevenlabs', operation: 'generateSoundEffect', estimatedSek,
      ceilingBasis: 'fixed_units', rates },
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
        // THE AMBIGUITY BOUNDARY. This claimed `ProviderNotDispatchedError`
        // for EVERY thrown fetch — a positive claim ("nothing was
        // synthesised") that a reset or a fired deadline cannot support. The
        // 30s `AbortSignal.timeout` on this request makes exactly that case
        // routine: a deadline usually fires because ElevenLabs already has
        // the text and is working. It cost twice over — the reservation was
        // RELEASED for audio that may have been billed, and the failure read
        // as retryable, so the caller synthesised a second time.
        const verdict = classifyTransportFailure(e)
        if (verdict.sent === false) {
          throw new ProviderNotDispatchedError(
            `elevenlabs sound-generation never reached the provider (${verdict.code})`, e)
        }
        throw new ProviderDispatchUnknownError({
          provider: 'elevenlabs', observation: 'response_lost',
          detail: verdict.detail, cause: e,
        })
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText)
        const failure = new Error(`ElevenLabs sound-generation failed (${res.status}): ${errText}`)
        // A 4xx is the vendor ANSWERING: it parsed the request and
        // synthesised nothing. A 5xx is not an answer about the work.
        if (statusProvesNotCreated(res.status)) {
          throw new ProviderNotDispatchedError(`elevenlabs refused with ${res.status}`, failure)
        }
        throw new ProviderDispatchUnknownError({
          provider: 'elevenlabs', observation: 'response_lost',
          detail: `${failure.message} — a ${res.status} says nothing about whether it synthesised`,
          cause: failure,
        })
      }

      const audioBuffer = Buffer.from(await res.arrayBuffer())

      await logSoundCost(billableSeconds, {
        ...('projectId' in project ? { projectId: project.projectId } : { projectSlug: project.projectSlug }),
        metadata: { duration_seconds: durationSeconds, model: 'sound-generation' },
      })

      return audioBuffer
    },
  )
}
