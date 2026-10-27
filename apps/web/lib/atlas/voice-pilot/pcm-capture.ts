import { createPcmResampler, pcm16, PCM_MAX_BYTES, PCM_RATE } from './pcm'
import type { RealtimeTurn } from './stream-protocol'
import { voiceResponseError, isVoiceAccessFailure, VOICE_ACCESS_NOTICE } from './failure'
import { createMicSignalMeter, microphoneConstraints, type MicSignal } from './mic-diagnostics'

function microphoneStartNotice(error: unknown): string {
  if (error instanceof Error && error.message.startsWith('speech_'))
    return 'Talavkänningen kunde inte fortsätta. Starta mikrofonen igen när anslutningen fungerar.'
  if (error instanceof Error && error.message === 'microphone_worklet_unavailable')
    return 'Mikrofonens ljudmodul kunde inte laddas. Starta mikrofonen igen när anslutningen fungerar.'
  if (error instanceof Error && error.name === 'NotAllowedError')
    return 'Mikrofonåtkomst nekades. Tillåt mikrofonen för den här sidan och försök igen.'
  if (error instanceof Error && error.name === 'NotFoundError')
    return 'Ingen mikrofon hittades. Anslut mikrofonen eller hörlurarna och försök igen.'
  if (error instanceof Error && error.name === 'NotReadableError')
    return 'Mikrofonen är upptagen eller kunde inte öppnas. Avsluta andra samtal och försök igen.'
  return 'Mikrofonens ljud kunde inte starta. Försök igen eller ladda om sidan.'
}

type Options = {
  pauseMs: number; playbackMode?: 'speakers' | 'headphones'
  receive(text: string): void; draft(text: string): void; interrupt(): void
  notice(message: string): void; active(value: boolean): void
  listening?(value: boolean): void; processing?(value: boolean): void; endpoint?(quietMs: number): void
  onSignal?(reading: MicSignal): void
}
type Source = { sampleRate: number; stop(): void; reset?(): void }
type EndReason = 'pause' | 'manual' | 'limit'
type Dependencies = {
  open(frame: (samples: Float32Array, speechProbability: number) => void, signal: AbortSignal, failed: (error: Error) => void): Promise<Source>
  transcribe(pcm: Uint8Array, signal: AbortSignal, reason: EndReason): Promise<string>
  streamTurn?(signal: AbortSignal): RealtimeTurn
  now?(): number
}

/** Bounded audio turns. Native SpeechRecognition is deliberately not involved. */
export function createPcmVoiceCapture(options: Options, deps: Dependencies = browserDependencies()) {
  const pause = Math.max(1200, Math.min(5000, options.pauseMs)), maxSamples = PCM_MAX_BYTES / 2
  const now = deps.now ?? (() => performance.now())
  const signalMeter = createMicSignalMeter(reading => options.onSignal?.(reading), now)
  let live = false, generation = 0, revision = 0, source: Source | null = null
  let output = false, recovering = false, recovery: ReturnType<typeof setTimeout> | undefined
  let stream: { controller: AbortController; turn: RealtimeTurn } | null = null
  let upload: AbortController | null = null, capped = false
  let device: AbortController | null = null, idleOverflow = false
  let receivedFrame = false, health: ReturnType<typeof setTimeout> | undefined
  let samples: Float32Array[] = [], count = 0, idle: Float32Array[] = [], idleCount = 0
  let voiced = false, candidateMs = 0, quietMs = 0
  // A failed realtime turn must never replay its audio or start a second paid
  // request during continuous speech. Allow a fresh turn only after silence.
  let waitForNewSilence = false, freshSilenceMs = 0, consecutiveStreamFailures = 0
  const blocked = () => options.playbackMode === 'speakers' && (output || recovering)
  const ready = () => options.listening?.(live && !!source && receivedFrame && !blocked() && !upload && !capped && !waitForNewSilence)
  function abortStream() { const owned = stream; stream = null; owned?.controller.abort(); owned?.turn.abort() }
  function clearAudio() { samples = []; count = 0; idle = []; idleCount = 0; idleOverflow = false; voiced = false; candidateMs = quietMs = 0; source?.reset?.() }
  function discard() {
    if (capped && live) { stop(); return }
    revision++; upload?.abort(); upload = null; abortStream(); options.processing?.(false); clearAudio(); ready()
  }
  /** Drop just the failed streamed question, not the browser microphone. */
  function failedRealtimeTurn() {
    consecutiveStreamFailures++
    if (consecutiveStreamFailures > 1) {
      stop()
      options.notice('Talanslutningen avbröts flera gånger. Tryck på mikrofonen för att återansluta.')
      return
    }
    abortStream(); clearAudio()
    waitForNewSilence = true; freshSilenceMs = 0
    options.processing?.(false); ready()
    options.notice('Talanslutningen bröts för frågan. Vänta en kort stund och säg frågan igen.')
  }
  function stop() {
    generation++; live = false; clearTimeout(recovery); clearTimeout(health); receivedFrame = false; recovering = false
    waitForNewSilence = false; freshSilenceMs = 0; consecutiveStreamFailures = 0
    signalMeter.reset(); discard(); device?.abort(); device = null; source?.stop(); source = null; capped = false
    options.listening?.(false); options.active(false)
  }
  async function finish(reviewOnly = false, reason: EndReason = 'manual') {
    if (!live || !source || blocked() || upload || capped) return
    const activeStream = stream
    if (deps.streamTurn && (!voiced || !activeStream)) { options.notice('Ingen aktiv fråga har spelats in. Börja prata innan du avslutar.'); return }
    if (idleOverflow) reviewOnly = true
    const began = now(), parts = voiced ? samples : idle
    let length = voiced ? count : idleCount
    if (voiced && !reviewOnly && !activeStream) length -= Math.max(0, Math.round((quietMs - 200) * PCM_RATE / 1000))
    length = Math.min(maxSamples, length)
    if (length < 1600) { options.notice('Prata lite till innan du avslutar inspelningen.'); return }
    const audio = activeStream ? null : new Float32Array(length)
    if (audio) {
      let offset = 0
      for (const part of parts) { const chunk = part.subarray(0, length - offset); audio.set(chunk, offset); offset += chunk.length; if (offset === length) break }
    }
    const wait = quietMs, token = generation, turn = revision, abort = activeStream?.controller ?? new AbortController()
    clearAudio(); upload = abort; capped = reviewOnly
    if (reviewOnly) { clearTimeout(health); source.stop(); source = null }
    ready(); options.processing?.(true)
    try {
      const text = (await (activeStream ? activeStream.turn.finish(reviewOnly ? 'limit' : reason) : deps.transcribe(pcm16(audio!), abort.signal, reviewOnly ? 'limit' : reason))).trim()
      if (!live || token !== generation || turn !== revision || abort.signal.aborted) return
      if (activeStream) consecutiveStreamFailures = 0
      if (!text) options.notice('Jag kunde inte urskilja några ord. Prova igen eller skriv din fråga.')
      else {
        options.draft(text)
        if (reviewOnly) options.notice('Inspelningen nådde 90 sekunder. Granska texten och skicka den själv, så att ingen avklippt fråga skickas automatiskt.')
        else { options.endpoint?.(wait + Math.max(0, now() - began)); options.receive(text) }
      }
    } catch (error) {
      if (live && token === generation && turn === revision && !abort.signal.aborted) {
        if (activeStream) {
          // Security/permission refusals still stop capture. Transient network
          // failures may only restart after a fresh, clearly separated phrase.
          if (isVoiceAccessFailure(error)) { stop(); options.notice(VOICE_ACCESS_NOTICE) }
          else failedRealtimeTurn()
        } else {
          options.notice('Talet kunde inte tolkas. Prova att säga frågan igen eller skriv den. Kontrollera åtkomst och budget om felet återkommer.')
        }
      }
    } finally {
      if (upload === abort) {
        upload = null; if (activeStream && stream === activeStream) abortStream(); options.processing?.(false)
        if (reviewOnly) stop()
        else ready()
      }
    }
  }
  function sendStream(audio: Float32Array) {
    if (!stream) throw new Error('stream_missing')
    const bytes = pcm16(audio)
    for (let offset = 0; offset < bytes.length; offset += 6400) stream.turn.send(bytes.subarray(offset, offset + 6400))
  }
  async function start() {
    if (live) return
    live = true; const token = ++generation
    signalMeter.reset()
    waitForNewSilence = false; freshSilenceMs = 0; consecutiveStreamFailures = 0
    device = new AbortController()
    let resample: ReturnType<typeof createPcmResampler> | undefined
    const watchStream = () => {
      clearTimeout(health)
      health = setTimeout(() => {
        if (!live || token !== generation || !source) return
        stop()
        options.notice('Mikrofonens ljudström har stannat. Starta mikrofonen igen och håll sidan öppen medan du pratar.')
      }, 5000)
    }
    try {
      const opened = await deps.open((frame, probability) => {
        if (!live || token !== generation || !resample || !source || !frame.length) return
        watchStream()
        if (!receivedFrame) { receivedFrame = true; ready() }
        if (blocked() || upload || capped) return
        signalMeter.observe(frame, probability)
        const pcm = resample(frame)
        if (!pcm.length) return
        const ms = pcm.length / PCM_RATE * 1000
        if (waitForNewSilence) {
          freshSilenceMs = probability >= 0.3 ? 0 : freshSilenceMs + ms
          if (freshSilenceMs >= 400) {
            waitForNewSilence = false; freshSilenceMs = 0; clearAudio(); ready()
          }
          return // never replay or reopen a paid stream on uninterrupted speech
        }
        // Silero speech probability, not sound level: room noise must not
        // indefinitely reset the pause after a question.
        // Thresholds from the pinned VAD package's V5 frame defaults.
        const speech = probability >= (voiced ? 0.25 : 0.3)
        if (!voiced) {
          idle.push(pcm); idleCount += pcm.length
          while (idleCount > (deps.streamTurn ? PCM_RATE : maxSamples) && idle.length > 1) { idleCount -= idle.shift()!.length; if (!deps.streamTurn) idleOverflow = true }
          candidateMs = speech ? candidateMs + ms : 0
          if (candidateMs < 80) return
          voiced = true
          // Preserve a second around speech onset, including model confirmation
          // delay. Minutes of waiting/room noise are not part of the question.
          const length = Math.min(idleCount, PCM_RATE), joined = new Float32Array(length)
          let skip = idleCount - length, i = 0
          for (const part of idle) {
            if (skip >= part.length) { skip -= part.length; continue }
            const kept = part.subarray(skip); joined.set(kept, i); i += kept.length; skip = 0
          }
          samples = deps.streamTurn ? [] : [joined]; count = length; idle = []; idleCount = 0; idleOverflow = false
          // Speaker mode uses the explicit Avbryt button. Input arriving while
          // a reply is still preparing must not silently cancel its speech epoch.
          if (options.playbackMode === 'headphones') options.interrupt()
          if (deps.streamTurn) {
            try {
              const controller = new AbortController()
              stream = { controller, turn: deps.streamTurn(controller.signal) }
              sendStream(joined)
            } catch { failedRealtimeTurn(); return }
          }
        } else {
          if (deps.streamTurn) {
            const kept = pcm.subarray(0, Math.max(0, maxSamples - count)); count += kept.length
            try { sendStream(kept) } catch { failedRealtimeTurn(); return }
          } else { samples.push(pcm); count += pcm.length }
        }
        quietMs = speech ? 0 : quietMs + ms
        if (count >= maxSamples) { void finish(true); return }
        if (quietMs >= pause) void finish(false, 'pause')
      }, device.signal, error => {
        if (live && token === generation) { stop(); options.notice(microphoneStartNotice(error)) }
      })
      if (!live || token !== generation) { opened.stop(); return }
      source = opened; resample = createPcmResampler(opened.sampleRate)
      options.active(true); ready(); watchStream()
    } catch (error) {
      if (live && token === generation) { stop(); options.notice(microphoneStartNotice(error)) }
    }
  }
  return { start, stop, discard, hasPendingInput: () => voiced || candidateMs > 0 || !!upload, finish: () => finish(), setOutputActive(value: boolean) {
    if (options.playbackMode !== 'speakers' || value === output) return
    output = value; clearTimeout(recovery); recovering = false; discard()
    if (!value && live) {
      recovering = true; ready()
      const token = generation
      recovery = setTimeout(() => { if (live && token === generation) { recovering = false; ready() } }, 400)
    }
  } }
}

export function browserDependencies(selectedMicDeviceId = ''): Dependencies {
  return {
    async open(receive, signal, failed) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints(selectedMicDeviceId) })
      let context: AudioContext | undefined, input: MediaStreamAudioSourceNode | undefined, node: AudioWorkletNode | undefined
      let detector: ReturnType<typeof import('./speech-detector')['createSpeechFrameProcessor']> | undefined
      let stopped = false
      const stop = () => {
        if (stopped) return
        stopped = true; signal.removeEventListener('abort', stop)
        detector?.stop(); stream.getTracks().forEach(track => track.stop()); if (node) { node.port.onmessage = null; node.disconnect() }
        input?.disconnect(); if (context && context.state !== 'closed') void context.close().catch(() => {})
      }
      const wait = async (task: Promise<unknown>, limitMs = 1500) => {
        let timer: ReturnType<typeof setTimeout> | undefined
        let onAbort = () => {}
        try { await Promise.race([task, new Promise((_, reject) => {
          onAbort = () => reject(new Error('microphone_start_aborted'))
          signal.addEventListener('abort', onAbort, { once: true })
          timer = setTimeout(() => reject(new Error('microphone_start_timeout')), limitMs)
          if (signal.aborted) onAbort()
        })]) }
        finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort) }
        signal.throwIfAborted()
      }
      try {
        signal.addEventListener('abort', stop, { once: true }); signal.throwIfAborted()
        context = new AudioContext({ sampleRate: PCM_RATE })
        try { await wait(context.audioWorklet.addModule('/atlas-voice-recorder.js'), 5000) }
        catch { throw new Error('microphone_worklet_unavailable') }
        node = new AudioWorkletNode(context, 'atlas-voice-recorder')
        // Drain startup frames while the model loads. A MessagePort otherwise
        // replays pre-listening audio once its first handler is attached.
        node.port.onmessage = () => {}
        input = context.createMediaStreamSource(stream); input.connect(node); node.connect(context.destination)
        await wait(context.resume())
        if (context.state !== 'running') throw new Error('microphone_suspended')
        try {
          await wait((async () => {
            const { loadSpeechModel, createSpeechFrameProcessor } = await import('./speech-detector')
            const model = await loadSpeechModel(signal)
            if (stopped || signal.aborted) { await model.release(); return }
            detector = createSpeechFrameProcessor(model, receive, error => { stop(); failed(error) })
          })(), 15000)
        } catch { throw new Error('speech_detector_unavailable') }
        const resample = createPcmResampler(context.sampleRate)
        node.port.onmessage = event => { if (event.data instanceof Float32Array) detector?.push(resample(event.data)) }
        return { sampleRate: PCM_RATE, stop, reset: () => detector?.reset() }
      } catch (error) { stop(); throw error }
    },
    async transcribe(audio, signal, reason) {
      const response = await fetch('/api/atlas/voice-pilot/speech', { method: 'POST', headers: { 'Content-Type': 'audio/pcm', 'x-atlas-voice-end': reason }, body: new Uint8Array(audio), signal })
      if (!response.ok) throw await voiceResponseError(response, 'transcription_failed')
      const result = await response.json()
      if (typeof result.text !== 'string') throw new Error('invalid_transcription')
      return result.text
    },
  }
}
