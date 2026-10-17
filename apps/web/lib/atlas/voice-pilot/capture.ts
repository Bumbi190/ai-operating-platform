import { createAcousticTurnGate } from './turn-gate'

type Result = { 0: { transcript: string }; isFinal: boolean }
export interface PilotRecognition {
  lang: string; continuous: boolean; interimResults: boolean
  onresult: ((event: { results: ArrayLike<Result> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  onstart?: (() => void) | null
  onspeechstart?: (() => void) | null
  onspeechend?: (() => void) | null
  start(audioTrack?: MediaStreamTrack): void; stop(): void; abort(): void
}
type Options = {
  pauseMs: number; receive(text: string): void; interrupt(): void
  draft(text: string): void; notice(message: string): void; active(value: boolean): void
  playbackMode?: 'speakers' | 'headphones'
  endpoint?(quietMs: number): void
  listening?(value: boolean): void
}
type Dependencies = {
  getMedia(): Promise<MediaStream>
  recognition(): PilotRecognition | null
  monitor(stream: MediaStream, receive: (rms: number, now: number) => void): Promise<() => void>
  now?(): number
}

/** Owns microphone lifetime; speaker mode suspends ASR during output and its tail. */
export function createPilotVoiceCapture(options: Options, dependencies?: Dependencies) {
  const deps = dependencies ?? browserCaptureDependencies()
  let generation = 0, live = false, media: MediaStream | null = null
  let rec: PilotRecognition | null = null, stopMonitor: (() => void) | null = null
  let restart: ReturnType<typeof setTimeout> | undefined
  let finishTimer: ReturnType<typeof setTimeout> | undefined
  let finalizing = false, pendingDraft = '', drainingDraft = ''
  const now = deps.now ?? (() => performance.now())
  let outputActive = false, recovering = false
  const blocked = () => options.playbackMode === 'speakers' && (outputActive || recovering)
  let carry = '', results: Result[] = [], consumed = 0
  const gate = createAcousticTurnGate({ ...options, receive(text) {
    carry = ''; consumed = results.length
    options.receive(text)
  }, finalize() {
    if (!live || !rec || finalizing || blocked()) return
    const current = rec, token = generation
    finalizing = true; drainingDraft = pendingDraft; options.listening?.(false)
    // stop() drains the recognizer's buffered audio into a final result.
    // abort() would throw that audio away. Bound a missing native completion.
    finishTimer = setTimeout(() => {
      if (live && token === generation && rec === current) {
        if (drainingDraft) options.draft(drainingDraft)
        fail('Taligenkänningen blev inte klar med sista orden. Texten finns kvar; granska och skicka den eller starta mikrofonen igen.')
      }
    }, 4000)
    try { current.stop() } catch { fail('Taligenkänningen kunde inte bekräfta sista orden. Texten finns kvar; granska och skicka den eller starta mikrofonen igen.') }
  } })
  const detach = () => {
    clearTimeout(finishTimer); finishTimer = undefined; finalizing = false
    pendingDraft = drainingDraft = ''
    options.listening?.(false)
    if (!rec) return
    const old = rec; rec = null
    old.onspeechstart = old.onspeechend = old.onstart = old.onend = old.onerror = old.onresult = null
    try { old.abort() } catch { /* already ended */ }
  }
  function stop() {
    generation++; live = false
    outputActive = recovering = false
    clearTimeout(restart); restart = undefined
    detach(); stopMonitor?.(); stopMonitor = null
    media?.getTracks().forEach(track => track.stop()); media = null
    carry = ''; results = []; consumed = 0; gate.discard()
    options.active(false)
  }
  function fail(message: string) { stop(); options.notice(message) }
  function listen(token: number) {
    if (!live || token !== generation || blocked()) return
    try {
      const current = deps.recognition()
      if (!current) throw new Error('unsupported')
      rec = current
      current.lang = 'sv-SE'; current.continuous = true; current.interimResults = true
      current.onstart = () => {
        if (live && token === generation && rec === current && !blocked()) options.listening?.(true)
      }
      current.onspeechstart = () => {
        if (live && token === generation && rec === current && !blocked() && !finalizing) gate.speechStart(now())
      }
      current.onspeechend = () => {
        if (live && token === generation && rec === current && !blocked()) gate.speechEnd(now())
      }
      current.onresult = event => {
        if (!live || token !== generation || rec !== current) return
        const previous = results
        results = Array.from(event.results)
        const fresh = results.slice(consumed)
        const newFinal = fresh.some((result, index) => result.isFinal && result[0].transcript.trim() && !previous[consumed + index]?.isFinal)
        const committed = [carry, ...fresh.filter(r => r.isFinal).map(r => r[0].transcript.trim())].filter(Boolean).join(' ')
        const interim = fresh.filter(r => !r.isFinal).map(r => r[0].transcript).join(' ')
        const full = [committed, interim].filter(Boolean).join(' ')
        if (interim) pendingDraft = full
        else if (newFinal) pendingDraft = ''
        const visible = full || pendingDraft || (finalizing ? drainingDraft : '')
        // While stop() drains, even an all-final event may be followed by
        // another final delta. Only real native end releases that snapshot.
        gate.text(visible, !interim && !pendingDraft && !finalizing)
        if (newFinal && !interim && !finalizing) gate.recognitionFinal(now())
        options.draft(visible)
      }
      current.onerror = event => {
        if (!live || token !== generation || rec !== current) return
        if (event.error === 'no-speech') return
        fail(event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Tillåt mikrofonen i webbläsaren, eller fortsätt skriva.'
          : 'Taligenkänningen tappade anslutningen. Starta mikrofonen igen eller skriv.')
      }
      const finishRecognition = () => {
        if (!live || token !== generation || rec !== current) return
        gate.speechEnd(now())
        if (pendingDraft || results.slice(consumed).some(result => !result.isFinal)
          || (finalizing && drainingDraft && !results.slice(consumed).some(result => result.isFinal && result[0].transcript.trim()))) {
          if (drainingDraft || pendingDraft) options.draft(drainingDraft || pendingDraft)
          fail('Taligenkänningen avslutades innan sista orden var klara. Texten finns kvar för granskning; starta mikrofonen igen när du vill.')
          return
        }
        carry = [carry, ...results.slice(consumed).filter(r => r.isFinal).map(r => r[0].transcript.trim())].filter(Boolean).join(' ')
        results = []; consumed = 0
        gate.text(carry)
        detach()
        restart = setTimeout(() => listen(token), 250)
      }
      current.onend = finishRecognition
      // Desktop Chrome supports start(track). Older implementations may ignore
      // the argument; speaker-mode safety does not depend on that support.
      current.start(media?.getAudioTracks()[0])
    } catch { fail('Röstinmatningen kunde inte starta här. Du kan fortsätta skriva.') }
  }
  async function start() {
    if (live) return
    live = true
    const token = ++generation
    try {
      const stream = await deps.getMedia()
      if (!live || token !== generation) { stream.getTracks().forEach(t => t.stop()); return }
      media = stream
      const cleanup = await deps.monitor(stream, (rms, now) => {
        if (live && token === generation && !blocked()) gate.sample(rms, now)
      })
      if (!live || token !== generation) { cleanup(); return }
      stopMonitor = cleanup
      listen(token)
      if (live && token === generation) options.active(true)
    } catch {
      if (live && token === generation) fail('Mikrofonen kunde inte starta. Kontrollera behörigheten eller skriv.')
    }
  }
  return { start, stop, setOutputActive(value: boolean) {
    if (options.playbackMode !== 'speakers' || value === outputActive) return
    outputActive = value
    clearTimeout(restart); restart = undefined
    detach(); carry = ''; results = []; consumed = 0; gate.discard()
    recovering = false
    if (!value && live) {
      // Do not feed the loudspeaker's acoustic decay or late ASR final into a
      // new user turn. A fresh recognizer owns the next input boundary.
      recovering = true
      const token = generation
      restart = setTimeout(() => { recovering = false; listen(token) }, 400)
    }
  }, discard() {
    carry = ''; pendingDraft = ''; gate.discard()
    if (rec) {
      // Even with no visible interim, native audio may still be buffered.
      // A fresh recognizer rejects every late result from the discarded turn.
      detach(); results = []; consumed = 0
      const token = generation
      clearTimeout(restart)
      if (live) restart = setTimeout(() => listen(token), 250)
    } else { results = []; consumed = 0 }
  } }
}

function browserCaptureDependencies(): Dependencies {
  return {
    getMedia: () => navigator.mediaDevices.getUserMedia({ audio: {
      echoCancellation: true, noiseSuppression: true, autoGainControl: true,
    } }),
    recognition: () => {
      const w = window as typeof window & { SpeechRecognition?: new () => PilotRecognition; webkitSpeechRecognition?: new () => PilotRecognition }
      const Constructor = w.SpeechRecognition ?? w.webkitSpeechRecognition
      return Constructor ? new Constructor() : null
    },
    monitor: async (stream, receive) => {
      const context = new AudioContext()
      const source = context.createMediaStreamSource(stream), analyser = context.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)
      const samples = new Float32Array(analyser.fftSize)
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([context.resume(), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('audio_suspended')), 1200)
        })])
        if (context.state !== 'running') throw new Error('audio_suspended')
      } catch (error) {
        source.disconnect(); analyser.disconnect(); void context.close(); throw error
      } finally { clearTimeout(timer) }
      const interval = setInterval(() => {
        analyser.getFloatTimeDomainData(samples)
        let sum = 0
        for (const value of samples) sum += value * value
        receive(Math.sqrt(sum / samples.length), performance.now())
      }, 50)
      return () => { clearInterval(interval); source.disconnect(); analyser.disconnect(); void context.close() }
    },
  }
}
