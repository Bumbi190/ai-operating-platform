import WebSocket, { type RawData } from 'ws'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRates } from '@/lib/cost/rates'
import { verifiedAtlasRealtimeRate } from '@/lib/cost/atlas-realtime-billing'
import { fixedUnitCeiling } from '@/lib/cost/spend-ceiling'
import { currentSpendMeter } from '@/lib/cost/spend-meter'
import { ProviderNotDispatchedError, resolveGovernedProjectId, withGovernedSpend, type ProjectRef } from '@/lib/cost/governed-spend'
import { ProviderDispatchUnknownError, statusProvesNotCreated } from '@/lib/media/job/dispatch'
import { admitPhysicalRequest, authorityForRequest, composeAbortSignals, watchExecutionAuthority } from '@/lib/governance/execution-signal'
import type { ExecutionContract } from '@/lib/governance/execution-stop'
import { createVoiceSegmentState, VOICE_PCM_CHUNK_BYTES, VOICE_PCM_QUEUE_BYTES, VOICE_SEGMENT_BYTES, VOICE_TRANSCRIPT_CHARS, type RealtimeTurn, type VoiceEndReason } from '@/lib/atlas/voice-pilot/stream-protocol'
import { PCM_MAX_BYTES } from '@/lib/atlas/voice-pilot/pcm'

export type AtlasRealtimeContext = { execution: ExecutionContract; project: ProjectRef; operation: string }
const unknownOutcome = () => new ProviderDispatchUnknownError({
  provider: 'elevenlabs', observation: 'response_lost', detail: 'Atlas realtime transcription outcome unconfirmed',
})

/** One question, one governed connection. No provider text or errors leave this adapter. */
export async function openAtlasSwedishRealtime(ctx: AtlasRealtimeContext, callerSignal: AbortSignal): Promise<RealtimeTurn> {
  const entered = Date.now(), key = process.env.ELEVENLABS_API_KEY?.trim()
  if (!key) throw new Error('atlas_realtime_unconfigured')
  callerSignal.throwIfAborted()
  const rates = await getRates(), rate = verifiedAtlasRealtimeRate(rates)
  if (rate === null) throw new Error('atlas_realtime_billing_unverified')
  const ceiling = fixedUnitCeiling(2 / 60, rate, rates, 'atlas-scribe-realtime:2minutes')
  if (!ceiling.ok) throw new Error('atlas_realtime_unbounded')
  const authority = authorityForRequest(ctx.execution, async ref => {
    const resolved = await resolveGovernedProjectId(ref); return resolved.ok ? resolved.projectId : null
  })
  return withGovernedSpend({ project: ctx.project, execution: ctx.execution, provider: 'elevenlabs',
    operation: ctx.operation, estimatedSek: ceiling.sek, ceilingBasis: 'fixed_units', rates }, async () => {
    await admitPhysicalRequest(() => createAdminClient(), authority, 'elevenlabs')
    if (callerSignal.aborted) throw new ProviderNotDispatchedError('Atlas realtime stopped before connection')
    const watch = watchExecutionAuthority(() => createAdminClient(), authority)
    const composed = composeAbortSignals([watch.signal, callerSignal])
    let socket: WebSocket | undefined, closing = false, terminal = false, ready = false
    let failure: Error | null = null, result: string | undefined, total = 0, queued = 0, segmentBytes = 0, pending = false, userFinished = false, segmentFinished = false
    const queue: Uint8Array[] = [], segments = createVoiceSegmentState()
    let readyResolve!: (turn: RealtimeTurn) => void, readyReject!: (error: Error) => void
    const opened = new Promise<RealtimeTurn>((resolve, reject) => { readyResolve = resolve; readyReject = reject })
    let endCost!: () => void, failCost!: (error: Error) => void
    const lifetime = new Promise<void>((resolve, reject) => { endCost = resolve; failCost = reject })
    void lifetime.catch(() => {})
    // Register before a handle can escape; withGovernedSpend owns durable waitUntil.
    currentSpendMeter()?.settleAfter(lifetime)
    let finishPromise: Promise<string> | undefined, finishResolve: ((text: string) => void) | undefined, finishReject: ((error: Error) => void) | undefined
    let handshakeTimer: ReturnType<typeof setTimeout> | undefined, commitTimer: ReturnType<typeof setTimeout> | undefined
    let finishTimer: ReturnType<typeof setTimeout> | undefined, closeTimer: ReturnType<typeof setTimeout> | undefined
    const absoluteTimer = setTimeout(() => stop(unknownOutcome()), Math.max(0, 120000 - (Date.now() - entered)))
    const authorityTimer = setInterval(() => { if (watch.authorityUnavailable) stop(unknownOutcome()) }, 250)
    function complete() {
      if (terminal) return
      terminal = true
      clearTimeout(absoluteTimer); clearTimeout(handshakeTimer); clearTimeout(commitTimer); clearTimeout(finishTimer); clearTimeout(closeTimer); clearInterval(authorityTimer)
      composed.signal.removeEventListener('abort', onAbort)
      socket?.off('message', message); socket?.off('close', closed); socket?.off('unexpected-response', rejected)
      // Retain the idempotent error listener for a late terminate() error.
      queue.length = 0; queued = 0; composed.dispose(); watch.dispose()
      if (failure) { failCost(failure); if (!ready) readyReject(failure); finishReject?.(failure) }
      else { endCost(); finishResolve?.(result ?? '') }
    }
    function stop(error?: Error, text?: string) {
      if (closing || terminal) return
      closing = true; failure = error ?? null; result = text
      clearTimeout(handshakeTimer); clearTimeout(commitTimer); clearTimeout(finishTimer); clearInterval(authorityTimer)
      socket?.off('message', message)
      if (!socket || socket.readyState === 3) { complete(); return }
      // A local close never releases possibly billed cost. Only its full ceiling settles.
      closeTimer = setTimeout(() => { socket?.terminate(); complete() }, 250)
      try { socket.close(error ? 1008 : 1000) } catch { socket.terminate(); complete() }
    }
    function onAbort() { stop(unknownOutcome()) }
    function closed() { if (!closing) stop(unknownOutcome()); complete() }
    function errored() { stop(unknownOutcome()) }
    function rejected(_request: unknown, response: { statusCode?: number; resume?: () => void }) {
      response.resume?.()
      stop(typeof response.statusCode === 'number' && statusProvesNotCreated(response.statusCode)
        ? new ProviderNotDispatchedError('Atlas realtime connection rejected before transcription') : unknownOutcome())
    }
    function write(audio: Uint8Array, commit: boolean) {
      if (closing || !socket || socket.readyState !== 1 || watch.authorityUnavailable || composed.signal.aborted) throw unknownOutcome()
      const raw = JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: Buffer.from(audio).toString('base64'), sample_rate: 16000, ...(commit ? { commit: true } : {}) })
      if (socket.bufferedAmount + queued + Buffer.byteLength(raw) > VOICE_PCM_QUEUE_BYTES) throw unknownOutcome()
      socket.send(raw, error => { if (error) stop(unknownOutcome()) })
    }
    function markCommit() {
      segments.commitSent(); pending = true
      commitTimer = setTimeout(() => stop(unknownOutcome()), 20000)
    }
    function pump() {
      if (closing) return
      try {
        while (!pending && queue.length) {
          const source = queue.shift()!, length = Math.min(source.length, VOICE_SEGMENT_BYTES - segmentBytes)
          const audio = source.subarray(0, length)
          if (length < source.length) queue.unshift(source.subarray(length))
          queued -= length; segmentBytes += length
          segments.accepted(length)
          const checkpoint = segments.shouldCommit()
          if (checkpoint) markCommit()
          write(audio, checkpoint)
        }
        if (userFinished && !pending && !queue.length) {
          if (!segmentFinished) { segmentFinished = true; segments.finishRequested() }
          if (segments.shouldCommit()) { markCommit(); write(new Uint8Array(), true) }
          else { const text = segments.result(); if (text !== null) stop(undefined, text) }
        }
      } catch { stop(unknownOutcome()) }
    }
    function message(data: RawData, binary: boolean) {
      if (closing) return
      try {
        const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer)
        if (binary || bytes.length > 65536) throw unknownOutcome()
        const event = JSON.parse(bytes.toString('utf8'))
        if (!event || typeof event !== 'object' || Array.isArray(event)) throw unknownOutcome()
        if (event.message_type === 'session_started') {
          const config = event.config
          if (ready || !config || config.model_id !== 'scribe_v2_realtime' || config.audio_format !== 'pcm_16000'
            || config.sample_rate !== 16000 || !['swe', 'sv'].includes(config.language_code)) throw unknownOutcome()
          ready = true; clearTimeout(handshakeTimer); readyResolve(turn); return
        }
        if (!ready || typeof event.text !== 'string' || event.text.length > VOICE_TRANSCRIPT_CHARS) throw unknownOutcome()
        if (event.message_type === 'partial_transcript') return
        if (event.message_type !== 'committed_transcript' || !pending) throw unknownOutcome()
        segments.committed(event.text); segmentBytes = 0; pending = false; clearTimeout(commitTimer); pump()
      } catch { stop(unknownOutcome()) }
    }
    const turn: RealtimeTurn = {
      send(audio) {
        if (closing || userFinished) throw failure ?? unknownOutcome()
        if (!(audio instanceof Uint8Array) || !audio.length || audio.length % 2 || audio.length > VOICE_PCM_CHUNK_BYTES
          || total + audio.length > PCM_MAX_BYTES || queued + audio.length + (socket?.bufferedAmount ?? 0) > VOICE_PCM_QUEUE_BYTES
          || watch.authorityUnavailable || composed.signal.aborted) { const error = unknownOutcome(); stop(error); throw error }
        total += audio.length; queued += audio.length; queue.push(new Uint8Array(audio)); pump()
        if (failure) throw failure
      },
      finish(reason: VoiceEndReason) {
        if (finishPromise) return finishPromise
        if (closing) return failure ? Promise.reject(failure) : Promise.resolve(result ?? '')
        if (!['pause', 'manual', 'limit'].includes(reason)) { stop(unknownOutcome()); return Promise.reject(unknownOutcome()) }
        userFinished = true
        finishPromise = new Promise<string>((resolve, reject) => { finishResolve = resolve; finishReject = reject })
        void finishPromise.catch(() => {})
        finishTimer = setTimeout(() => stop(unknownOutcome()), 20000)
        pump(); return finishPromise
      },
      abort() { stop(unknownOutcome()) },
    }
    const url = new URL('wss://api.elevenlabs.io/v1/speech-to-text/realtime')
    for (const [name, value] of Object.entries({ model_id: 'scribe_v2_realtime', language_code: 'swe', audio_format: 'pcm_16000', commit_strategy: 'manual' })) url.searchParams.set(name, value)
    for (const term of ['Omnira', 'Atlas', 'Handlarbörsen', 'Familje-Stunden', 'The Prompt', 'GainPilot']) url.searchParams.append('keyterms', term)
    try {
      if (composed.signal.aborted) throw new ProviderNotDispatchedError('Atlas realtime stopped before connection')
      handshakeTimer = setTimeout(() => stop(unknownOutcome()), 5000)
      socket = new WebSocket(url.toString(), { headers: { 'xi-api-key': key }, maxPayload: 65536, handshakeTimeout: 5000, perMessageDeflate: false })
      socket.on('message', message); socket.on('close', closed); socket.on('error', errored); socket.on('unexpected-response', rejected)
      composed.signal.addEventListener('abort', onAbort, { once: true })
      if (composed.signal.aborted) onAbort()
    } catch (error) { stop(error instanceof ProviderNotDispatchedError ? error : unknownOutcome()) }
    return opened
  })
}
