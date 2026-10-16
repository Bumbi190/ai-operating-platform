import { createPcmResampler, pcm16, PCM_MAX_BYTES, PCM_RATE } from './pcm'

type Options = {
  pauseMs: number; playbackMode?: 'speakers' | 'headphones'
  receive(text: string): void; draft(text: string): void; interrupt(): void
  notice(message: string): void; active(value: boolean): void
  listening?(value: boolean): void; processing?(value: boolean): void; endpoint?(quietMs: number): void
}
type Source = { sampleRate: number; stop(): void }
type Dependencies = {
  open(frame: (samples: Float32Array) => void, signal: AbortSignal): Promise<Source>
  transcribe(pcm: Uint8Array, signal: AbortSignal): Promise<string>
  now?(): number
}

/** Bounded audio turns. Native SpeechRecognition is deliberately not involved. */
export function createPcmVoiceCapture(options: Options, deps: Dependencies = browserDependencies()) {
  const pause = Math.max(1200, Math.min(5000, options.pauseMs)), maxSamples = PCM_MAX_BYTES / 2
  const now = deps.now ?? (() => performance.now())
  let live = false, generation = 0, revision = 0, source: Source | null = null
  let output = false, recovering = false, recovery: ReturnType<typeof setTimeout> | undefined
  let upload: AbortController | null = null, capped = false
  let device: AbortController | null = null, idleOverflow = false
  let receivedFrame = false, health: ReturnType<typeof setTimeout> | undefined
  let samples: Float32Array[] = [], count = 0, idle: Float32Array[] = [], idleCount = 0
  let voiced = false, candidateMs = 0, quietMs = 0, noise = 0.0003
  const blocked = () => options.playbackMode === 'speakers' && (output || recovering)
  const ready = () => options.listening?.(live && !!source && receivedFrame && !blocked() && !upload && !capped)
  function clearAudio() { samples = []; count = 0; idle = []; idleCount = 0; idleOverflow = false; voiced = false; candidateMs = quietMs = 0; noise = 0.0003 }
  function discard() {
    if (capped && live) { stop(); return }
    revision++; upload?.abort(); upload = null; options.processing?.(false); clearAudio(); ready()
  }
  function stop() {
    generation++; live = false; clearTimeout(recovery); clearTimeout(health); receivedFrame = false; recovering = false
    discard(); device?.abort(); device = null; source?.stop(); source = null; capped = false
    options.listening?.(false); options.active(false)
  }
  async function finish(reviewOnly = false) {
    if (!live || !source || blocked() || upload || capped) return
    if (idleOverflow) reviewOnly = true
    const began = now(), parts = voiced ? samples : idle
    let length = voiced ? count : idleCount
    if (voiced && !reviewOnly) length -= Math.max(0, Math.round((quietMs - 200) * PCM_RATE / 1000))
    length = Math.min(maxSamples, length)
    if (length < 1600) { options.notice('Prata lite till innan du avslutar inspelningen.'); return }
    const audio = new Float32Array(length)
    let offset = 0
    for (const part of parts) { const chunk = part.subarray(0, length - offset); audio.set(chunk, offset); offset += chunk.length; if (offset === length) break }
    const wait = quietMs, token = generation, turn = revision, abort = new AbortController()
    clearAudio(); upload = abort; capped = reviewOnly
    if (reviewOnly) { clearTimeout(health); source.stop(); source = null }
    ready(); options.processing?.(true)
    try {
      const text = (await deps.transcribe(pcm16(audio), abort.signal)).trim()
      if (!live || token !== generation || turn !== revision || abort.signal.aborted) return
      if (!text) options.notice('Jag kunde inte urskilja några ord. Prova igen eller skriv din fråga.')
      else {
        options.draft(text)
        if (reviewOnly) options.notice('Inspelningen nådde 90 sekunder. Granska texten och skicka den själv, så att ingen avklippt fråga skickas automatiskt.')
        else { options.endpoint?.(wait + Math.max(0, now() - began)); options.receive(text) }
      }
    } catch {
      if (live && token === generation && turn === revision && !abort.signal.aborted) options.notice('Talet kunde inte tolkas. Prova att säga frågan igen eller skriv den. Kontrollera åtkomst och budget om felet återkommer.')
    } finally {
      if (upload === abort) {
        upload = null; options.processing?.(false)
        if (reviewOnly) stop()
        else ready()
      }
    }
  }
  async function start() {
    if (live) return
    live = true; const token = ++generation
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
      const opened = await deps.open(frame => {
        if (!live || token !== generation || !resample || !source || !frame.length) return
        watchStream()
        if (!receivedFrame) { receivedFrame = true; ready() }
        if (blocked() || upload || capped) return
        const pcm = resample(frame)
        if (!pcm.length) return
        const ms = pcm.length / PCM_RATE * 1000
        let energy = 0; for (const value of pcm) energy += value * value
        const rms = Math.sqrt(energy / pcm.length)
        // Quiet onset and a lower continuation threshold avoid chopping soft
        // endings. Noise adapts only while idle and below speech onset.
        const onset = Math.max(0.0012, noise * 3), threshold = voiced ? onset * 0.6 : onset
        const speech = rms >= threshold
        if (!voiced) {
          idle.push(pcm); idleCount += pcm.length
          while (idleCount > maxSamples && idle.length > 1) { idleCount -= idle.shift()!.length; idleOverflow = true }
          if (!speech) noise = noise * 0.98 + rms * 0.02
          candidateMs = speech ? candidateMs + ms : 0
          if (candidateMs < 80) return
          voiced = true
          // Keep the entire bounded listening prefix: a quiet first phrase
          // may be audible to Scribe before local VAD confirms louder speech.
          const joined = new Float32Array(idleCount); let i = 0
          for (const part of idle) { joined.set(part, i); i += part.length }
          samples = [joined]; count = idleCount; idle = []; idleCount = 0
          // Speaker mode uses the explicit Avbryt button. Input arriving while
          // a reply is still preparing must not silently cancel its speech epoch.
          if (options.playbackMode === 'headphones') options.interrupt()
        } else { samples.push(pcm); count += pcm.length }
        quietMs = speech ? 0 : quietMs + ms
        if (count >= maxSamples) { void finish(true); return }
        if (quietMs >= pause) void finish()
      }, device.signal)
      if (!live || token !== generation) { opened.stop(); return }
      source = opened; resample = createPcmResampler(opened.sampleRate)
      options.active(true); ready(); watchStream()
    } catch {
      if (live && token === generation) { stop(); options.notice('Mikrofonen kunde inte starta. Kontrollera behörigheten eller skriv din fråga.') }
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

function browserDependencies(): Dependencies {
  return {
    async open(receive, signal) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
      let context: AudioContext | undefined, input: MediaStreamAudioSourceNode | undefined, node: AudioWorkletNode | undefined
      let stopped = false
      const stop = () => {
        if (stopped) return
        stopped = true; signal.removeEventListener('abort', stop)
        stream.getTracks().forEach(track => track.stop()); if (node) { node.port.onmessage = null; node.disconnect() }
        input?.disconnect(); if (context && context.state !== 'closed') void context.close().catch(() => {})
      }
      const wait = async (task: Promise<unknown>) => {
        let timer: ReturnType<typeof setTimeout> | undefined
        let onAbort = () => {}
        try { await Promise.race([task, new Promise((_, reject) => {
          onAbort = () => reject(new Error('microphone_start_aborted'))
          signal.addEventListener('abort', onAbort, { once: true })
          timer = setTimeout(() => reject(new Error('microphone_start_timeout')), 1500)
          if (signal.aborted) onAbort()
        })]) }
        finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort) }
        signal.throwIfAborted()
      }
      try {
        signal.addEventListener('abort', stop, { once: true }); signal.throwIfAborted()
        context = new AudioContext({ sampleRate: PCM_RATE })
        await wait(context.audioWorklet.addModule('/atlas-voice-recorder.js'))
        node = new AudioWorkletNode(context, 'atlas-voice-recorder')
        node.port.onmessage = event => { if (event.data instanceof Float32Array) receive(event.data) }
        input = context.createMediaStreamSource(stream); input.connect(node); node.connect(context.destination)
        await wait(context.resume())
        if (context.state !== 'running') throw new Error('microphone_suspended')
        return { sampleRate: context.sampleRate, stop }
      } catch (error) { stop(); throw error }
    },
    async transcribe(audio, signal) {
      const response = await fetch('/api/atlas/voice-pilot/speech', { method: 'POST', headers: { 'Content-Type': 'audio/pcm' }, body: new Uint8Array(audio), signal })
      if (!response.ok) throw new Error('transcription_failed')
      const result = await response.json()
      if (typeof result.text !== 'string') throw new Error('invalid_transcription')
      return result.text
    },
  }
}
