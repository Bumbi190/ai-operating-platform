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
  MEDIA_PIPELINE_PROJECT, ProviderNotDispatchedError, resolveGovernedProjectId, SpendRefusedError, withGovernedSpend, type ProjectRef,
} from '@/lib/cost/governed-spend'
import {
  ProviderDispatchUnknownError,
  classifyTransportFailure,
  statusProvesNotCreated,
} from '@/lib/media/job/dispatch'
import type { ExecutionContract } from '@/lib/governance/execution-stop'
import { createAdminClient } from '@/lib/supabase/admin'
import { PCM_MAX_BYTES } from '@/lib/atlas/voice-pilot/pcm'
import { admitPhysicalRequest, authorityForRequest, composeAbortSignals, GovernanceDispatchUnknownError, watchExecutionAuthority } from '@/lib/governance/execution-signal'

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

// Atlas trial: separate streaming capability; existing media/narrator paths above are unchanged.
/** Unbilled lookup, explicitly excluding voices with a custom price multiplier. */
export async function listStandardVoiceIds(voiceIds: readonly string[], signal: AbortSignal): Promise<string[]> {
  const key = process.env.ELEVENLABS_API_KEY?.trim()
  if (!key) return []
  const query = new URLSearchParams({ include_custom_rates: 'false', include_total_count: 'false', page_size: '100' })
  for (const id of voiceIds) query.append('voice_ids', id)
  const response = await fetch('https://api.elevenlabs.io/v2/voices?' + query, {
    headers: { 'xi-api-key': key }, signal, cache: 'no-store',
  })
  if (!response.ok) throw new Error('voice_lookup_failed')
  const data = await response.json() as { voices?: { voice_id?: string }[] }
  if (!Array.isArray(data.voices)) throw new Error('voice_lookup_failed')
  const found = new Set(data.voices.map(v => v.voice_id))
  return voiceIds.filter(id => found.has(id))
}

/** One paid request, bounded by input characters. No sessions or automatic retries. */
export async function streamAtlasSwedishVoice(
  ctx: { execution: ExecutionContract; project: ProjectRef; operation: string },
  text: string, voiceId: string, callerSignal: AbortSignal,
): Promise<Response> {
  const key = process.env.ELEVENLABS_API_KEY?.trim()
  if (!key) throw new Error('voice_not_configured')
  if (!text.trim() || text.length > 600 || !/^[A-Za-z0-9]{20}$/.test(voiceId)) throw new Error('invalid_voice_request')
  // Fresh vendor-side filter: a library owner may have changed a custom rate.
  if (!(await listStandardVoiceIds([voiceId], callerSignal)).includes(voiceId)) throw new Error('voice_unavailable')
  callerSignal.throwIfAborted()
  const rates = await getRates()
  // Existing canonical base character rate; no speculative Flash discount.
  const ceiling = fixedUnitCeiling(text.length / 1000, rates.elevenlabs_usd_per_1k_chars, rates, 'atlas-eleven:' + text.length + 'chars')
  if (!ceiling.ok) throw new Error('unbounded_voice_spend')
  const authority = authorityForRequest(ctx.execution, async ref => {
    const result = await resolveGovernedProjectId(ref); return result.ok ? result.projectId : null
  })
  return withGovernedSpend({ project: ctx.project, execution: ctx.execution, provider: 'elevenlabs',
    operation: ctx.operation, estimatedSek: ceiling.sek, ceilingBasis: 'fixed_units', rates }, async () => {
    await admitPhysicalRequest(() => createAdminClient(), authority, 'elevenlabs')
    const watch = watchExecutionAuthority(() => createAdminClient(), authority)
    const abandon = new AbortController()
    const composed = composeAbortSignals([watch.signal, callerSignal, abandon.signal, AbortSignal.timeout(20_000)])
    let released = false
    const release = () => { if (released) return; released = true; watch.dispose(); composed.dispose() }
    const classify = (error: unknown) => {
      if (watch.abortReason) return new GovernanceDispatchUnknownError('elevenlabs', watch.abortReason, error)
      const verdict = classifyTransportFailure(error)
      return verdict.sent === false
        ? new ProviderNotDispatchedError('elevenlabs did not receive the request', error)
        : new ProviderDispatchUnknownError({ provider: 'elevenlabs', observation: 'response_lost', detail: 'Atlas speech outcome unconfirmed', cause: error })
    }
    let response: Response
    try {
      if (composed.signal.aborted) {
        release()
        throw new ProviderNotDispatchedError('Atlas speech was stopped before the physical request')
      }
      response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId + '/stream?output_format=pcm_24000', {
        method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, signal: composed.signal,
        body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5', language_code: 'sv',
          voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0, use_speaker_boost: false, speed: 1 } }),
      })
    } catch (error) {
      if (error instanceof ProviderNotDispatchedError) throw error
      const classified = classify(error); release(); throw classified
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {})
      release()
      if (statusProvesNotCreated(response.status)) throw new ProviderNotDispatchedError('elevenlabs rejected the request')
      throw new ProviderDispatchUnknownError({ provider: 'elevenlabs', observation: 'response_lost', detail: 'Atlas speech response unconfirmed' })
    }
    const reader = response.body.getReader()
    let terminal = false, output: ReadableStreamDefaultController<Uint8Array>
    const finish = () => {
      composed.signal.removeEventListener('abort', onAbort)
      try { reader.releaseLock() } catch { /* a pending read owns the lock */ }
      release()
    }
    const fail = (error: unknown) => {
      if (terminal) return
      terminal = true
      // After successful headers, every transfer failure may already be billed.
      const failure = watch.abortReason
        ? new GovernanceDispatchUnknownError('elevenlabs', watch.abortReason, error)
        : new ProviderDispatchUnknownError({ provider: 'elevenlabs', observation: 'response_lost', detail: 'Atlas speech body unconfirmed', cause: error })
      output.error(failure)
      void reader.cancel(error).catch(() => {}).finally(finish)
    }
    const onAbort = () => fail(composed.signal.reason)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        output = controller
        composed.signal.addEventListener('abort', onAbort, { once: true })
        if (composed.signal.aborted) onAbort()
        // A backpressured wrapper may never get another pull. Observe upstream
        // termination independently, especially after a native fetch abort.
        void reader.closed.catch(fail)
      },
      async pull(controller) {
        try {
          const chunk = await reader.read()
          if (terminal) return
          if (chunk.done) { terminal = true; controller.close(); finish() }
          else controller.enqueue(chunk.value)
        } catch (error) { fail(error) }
      },
      async cancel(reason) {
        if (terminal) return
        terminal = true
        abandon.abort(reason)
        try { await reader.cancel(reason) } finally { finish() }
      },
    })
    // Fixed characters are already the entire billable quantity, even on a
    // crash or abandoned stream. Settle the full ceiling without inventing a
    // zero-usage row. The authority watcher still follows body termination.
    return new Response(body, { headers: { 'Content-Type': 'audio/pcm', 'Cache-Control': 'no-store',
      'x-atlas-sample-rate': '24000' } })
  })
}

/** One file, fixed raw-PCM duration. No live session, fallback or paid retry. */
export async function transcribeAtlasSwedishPcm(
  ctx: { execution: ExecutionContract; project: ProjectRef; operation: string },
  audio: Uint8Array, callerSignal: AbortSignal,
): Promise<string> {
  if (audio.length < 3200 || audio.length > PCM_MAX_BYTES || audio.length % 2) throw new Error('invalid_pcm')
  const key = process.env.ELEVENLABS_API_KEY?.trim()
  if (!key) throw new Error('transcription_not_configured')
  callerSignal.throwIfAborted()
  const rates = await getRates(), perHour = rates.elevenlabs_scribe_v2_keyterms_usd_per_hour
  if (!Number.isFinite(perHour) || perHour <= 0) throw new Error('unbounded_transcription_spend')
  // The provider is forced to s16le/16kHz/mono, so bytes determine duration.
  // Reserve a whole started minute, covering rounding/minimums conservatively.
  const minutes = Math.ceil(audio.length / (16000 * 2 * 60))
  const ceiling = fixedUnitCeiling(minutes / 60, perHour, rates, `atlas-scribe:${minutes}minutes`)
  if (!ceiling.ok) throw new Error('unbounded_transcription_spend')
  const authority = authorityForRequest(ctx.execution, async ref => {
    const result = await resolveGovernedProjectId(ref); return result.ok ? result.projectId : null
  })
  return withGovernedSpend({ project: ctx.project, execution: ctx.execution, provider: 'elevenlabs', operation: ctx.operation,
    estimatedSek: ceiling.sek, ceilingBasis: 'fixed_units', rates }, async () => {
    await admitPhysicalRequest(() => createAdminClient(), authority, 'elevenlabs')
    const watch = watchExecutionAuthority(() => createAdminClient(), authority)
    const composed = composeAbortSignals([watch.signal, callerSignal, AbortSignal.timeout(20_000)])
    let dispatched = false
    try {
      const { ElevenLabsClient } = await import('@elevenlabs/elevenlabs-js')
      if (composed.signal.aborted) throw new ProviderNotDispatchedError('Atlas transcription stopped before dispatch')
      const client = new ElevenLabsClient({ apiKey: key, maxRetries: 0, fetch: (input, init) => {
        if (dispatched) throw new Error('duplicate_transcription_dispatch')
        if (composed.signal.aborted) throw new ProviderNotDispatchedError('Atlas transcription stopped before dispatch')
        dispatched = true
        return fetch(input, init)
      } })
      const result = await client.speechToText.convert({
        file: new Blob([new Uint8Array(audio)], { type: 'audio/pcm' }),
        modelId: 'scribe_v2', fileFormat: 'pcm_s16le_16', languageCode: 'swe',
        keyterms: ['Omnira', 'Atlas', 'Handlarbörsen', 'Familje-Stunden', 'The Prompt', 'GainPilot'],
        tagAudioEvents: false, diarize: false, useMultiChannel: false, timestampsGranularity: 'none',
      }, { maxRetries: 0, timeoutInSeconds: 20, abortSignal: composed.signal })
      if (!('text' in result) || typeof result.text !== 'string' || result.text.length > 12000) throw new Error('invalid_transcription_response')
      return result.text
    } catch (error) {
      if (!dispatched) throw new ProviderNotDispatchedError('Atlas transcription was not dispatched', error)
      if (watch.abortReason) throw new GovernanceDispatchUnknownError('elevenlabs', watch.abortReason, error)
      const status = (error as { statusCode?: number })?.statusCode
      if (typeof status === 'number' && statusProvesNotCreated(status)) throw new ProviderNotDispatchedError('elevenlabs rejected transcription', error)
      const verdict = classifyTransportFailure(error)
      if (verdict.sent === false) throw new ProviderNotDispatchedError('elevenlabs did not receive transcription', error)
      throw new ProviderDispatchUnknownError({ provider: 'elevenlabs', observation: 'response_lost', detail: 'Atlas transcription outcome unconfirmed', cause: error })
    } finally { composed.dispose(); watch.dispose() }
    // With no metered usage, settlement retains the full fixed-duration ceiling.
  })
}
