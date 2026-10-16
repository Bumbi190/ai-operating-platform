import { createAcousticTurnGate } from './turn-gate'

type Result = { 0: { transcript: string }; isFinal: boolean }
export interface PilotRecognition {
  lang: string; continuous: boolean; interimResults: boolean
  onresult: ((event: { results: ArrayLike<Result> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void; abort(): void
}
type Options = {
  pauseMs: number; receive(text: string): void; interrupt(): void
  draft(text: string): void; notice(message: string): void; active(value: boolean): void
}
type Dependencies = {
  getMedia(): Promise<MediaStream>
  recognition(): PilotRecognition | null
  monitor(stream: MediaStream, receive: (rms: number, now: number) => void): Promise<() => void>
}

/** Owns one full-duplex microphone lifetime. It never sends a backend request. */
export function createPilotVoiceCapture(options: Options, dependencies?: Dependencies) {
  const deps = dependencies ?? browserCaptureDependencies()
  let generation = 0, live = false, media: MediaStream | null = null
  let rec: PilotRecognition | null = null, stopMonitor: (() => void) | null = null
  let restart: ReturnType<typeof setTimeout> | undefined
  let carry = '', results: Result[] = [], consumed = 0
  const gate = createAcousticTurnGate({ ...options, receive(text) {
    carry = ''; consumed = results.length
    options.receive(text)
  } })
  const detach = () => {
    if (!rec) return
    const old = rec; rec = null
    old.onend = old.onerror = old.onresult = null
    try { old.abort() } catch { /* already ended */ }
  }
  function stop() {
    generation++; live = false
    clearTimeout(restart); restart = undefined
    detach(); stopMonitor?.(); stopMonitor = null
    media?.getTracks().forEach(track => track.stop()); media = null
    carry = ''; results = []; consumed = 0; gate.discard()
    options.active(false)
  }
  function fail(message: string) { stop(); options.notice(message) }
  function listen(token: number) {
    if (!live || token !== generation) return
    try {
      const current = deps.recognition()
      if (!current) throw new Error('unsupported')
      rec = current
      current.lang = 'sv-SE'; current.continuous = true; current.interimResults = true
      current.onresult = event => {
        if (!live || token !== generation || rec !== current) return
        results = Array.from(event.results)
        const fresh = results.slice(consumed)
        const committed = [carry, ...fresh.filter(r => r.isFinal).map(r => r[0].transcript.trim())].filter(Boolean).join(' ')
        const interim = fresh.filter(r => !r.isFinal).map(r => r[0].transcript).join(' ')
        // A lagging ASR hypothesis must not split off the end of the thought.
        gate.text(interim ? '' : committed)
        options.draft([committed, interim].filter(Boolean).join(' '))
      }
      current.onerror = event => {
        if (!live || token !== generation || rec !== current) return
        if (event.error === 'no-speech') return
        fail(event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Tillåt mikrofonen i webbläsaren, eller fortsätt skriva.'
          : 'Taligenkänningen tappade anslutningen. Starta mikrofonen igen eller skriv.')
      }
      current.onend = () => {
        if (!live || token !== generation || rec !== current) return
        if (results.slice(consumed).some(result => !result.isFinal)) {
          fail('Taligenkänningen avslutades innan sista orden var klara. Texten finns kvar för granskning; starta mikrofonen igen när du vill.')
          return
        }
        carry = [carry, ...results.slice(consumed).filter(r => r.isFinal).map(r => r[0].transcript.trim())].filter(Boolean).join(' ')
        results = []; consumed = 0
        gate.text(carry)
        detach()
        restart = setTimeout(() => listen(token), 250)
      }
      current.start()
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
        if (live && token === generation) gate.sample(rms, now)
      })
      if (!live || token !== generation) { cleanup(); return }
      stopMonitor = cleanup
      listen(token)
      if (live && token === generation) options.active(true)
    } catch {
      if (live && token === generation) fail('Mikrofonen kunde inte starta. Kontrollera behörigheten eller skriv.')
    }
  }
  return { start, stop, discard() {
    carry = ''; gate.discard()
    if (results.some(result => !result.isFinal)) {
      // Interim slots can disappear or be replaced in place. A new native
      // recognition boundary makes late discarded hypotheses unambiguous.
      detach(); results = []; consumed = 0
      const token = generation
      clearTimeout(restart)
      if (live) restart = setTimeout(() => listen(token), 250)
    } else consumed = results.length
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
