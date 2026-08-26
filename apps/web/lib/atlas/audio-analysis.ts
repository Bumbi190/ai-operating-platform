export type AudioLevelListener = () => void

/** Small external store: the 20–60 Hz audio signal never re-renders AtlasRuntime. */
export class AtlasAudioLevelStore {
  private level = 0
  private listeners = new Set<AudioLevelListener>()

  getSnapshot = () => this.level
  getServerSnapshot = () => 0

  subscribe = (listener: AudioLevelListener) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  set(level: number) {
    const next = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0))
    if (Math.abs(next - this.level) < 0.008) return
    this.level = next
    this.listeners.forEach((listener) => listener())
  }
}

type AudioContextLike = Pick<AudioContext, 'state' | 'destination' | 'resume' | 'close' | 'createAnalyser' | 'createMediaElementSource'>

interface AtlasAudioAnalyserOptions {
  store: AtlasAudioLevelStore
  createContext?: () => AudioContextLike
  requestFrame?: (callback: FrameRequestCallback) => number
  cancelFrame?: (id: number) => void
  /** How long `resume()` may take before the graph is abandoned. */
  resumeTimeoutMs?: number
}

/**
 * Under autoplay policy Chrome's `resume()` on a suspended context does not
 * reject — it simply never settles until a user gesture arrives. Awaiting it
 * unguarded stalled the whole speech queue, which is how the orb reached a
 * permanent `speaking` with no audio. Nothing here polls; one timer decides.
 */
export const ATLAS_AUDIO_RESUME_TIMEOUT_MS = 1_200

async function settleWithin<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<'timeout'>(resolve => { timer = setTimeout(() => resolve('timeout'), ms) }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export function normalizeAudioSamples(samples: Uint8Array): number {
  if (!samples.length) return 0
  let energy = 0
  for (let index = 0; index < samples.length; index += 1) {
    const sample = (samples[index] - 128) / 128
    energy += sample * sample
  }
  const rms = Math.sqrt(energy / samples.length)
  return Math.min(1, Math.max(0, (rms - 0.012) * 5.8))
}

export class AtlasAudioAnalyser {
  private readonly store: AtlasAudioLevelStore
  private readonly createContext: () => AudioContextLike
  private readonly requestFrame: (callback: FrameRequestCallback) => number
  private readonly cancelFrame: (id: number) => void
  private readonly resumeTimeoutMs: number
  private context: AudioContextLike | null = null
  private source: MediaElementAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private frame: number | null = null
  private smoothedLevel = 0

  constructor(options: AtlasAudioAnalyserOptions) {
    this.store = options.store
    this.createContext = options.createContext ?? (() => {
      const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextConstructor) throw new Error('Web Audio is unavailable')
      return new AudioContextConstructor()
    })
    this.requestFrame = options.requestFrame ?? requestAnimationFrame
    this.cancelFrame = options.cancelFrame ?? cancelAnimationFrame
    this.resumeTimeoutMs = options.resumeTimeoutMs ?? ATLAS_AUDIO_RESUME_TIMEOUT_MS
  }

  /**
   * Attach the element to the graph and report whether it is safe to play.
   *
   * ORDER IS THE FIX. `createMediaElementSource()` permanently reroutes an
   * element's output into the Web Audio graph, so the previous version — which
   * built the analyser first and only reached `destination` on the last line —
   * could capture the element and then throw, leaving it playing into nothing.
   * `onended` still fired on schedule, which is exactly what a silent orb that
   * believes it is speaking looks like.
   *
   * So the audible route is established FIRST, immediately after capture, and
   * the analyser is attached afterwards as a side branch off the same source.
   * An `AnalyserNode` observes whatever is fed to it; it does not need to sit
   * in the signal path, and routing it to `destination` as well would only
   * double the signal. Visualisation can therefore fail on its own without
   * taking the speech with it.
   *
   * `false` means the element was never captured, so a plain `audio.play()` by
   * the caller still reaches the speakers normally.
   */
  async connect(audio: HTMLAudioElement): Promise<boolean> {
    this.disconnect()

    let context: AudioContextLike
    try {
      this.context ??= this.createContext()
      context = this.context
    } catch {
      return false
    }

    if (context.state === 'suspended') {
      try {
        await settleWithin(Promise.resolve(context.resume()), this.resumeTimeoutMs)
      } catch {
        return false
      }
      // Still suspended means the browser declined. Capturing the element into
      // a graph that cannot output is the one thing worse than not capturing.
      if (context.state === 'suspended') return false
    }

    let source: MediaElementAudioSourceNode
    try {
      source = context.createMediaElementSource(audio)
    } catch {
      // Never captured — the element is untouched and still plays normally.
      return false
    }

    try {
      // The element is captured from here on. Output before observation.
      source.connect(context.destination)
      this.source = source
    } catch {
      this.source = source
      this.disconnect()
      return false
    }

    try {
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.72
      // A tap off the source, deliberately NOT routed onward to destination.
      source.connect(analyser)
      this.analyser = analyser
      this.sample()
    } catch {
      // Amplitude visualisation is optional; the speech above is already live.
      this.analyser = null
      this.store.set(0)
    }

    return true
  }

  disconnect() {
    if (this.frame !== null) this.cancelFrame(this.frame)
    this.frame = null
    try { this.source?.disconnect() } catch { /* already disconnected */ }
    try { this.analyser?.disconnect() } catch { /* already disconnected */ }
    this.source = null
    this.analyser = null
    this.smoothedLevel = 0
    this.store.set(0)
  }

  async dispose() {
    this.disconnect()
    const context = this.context
    this.context = null
    if (context && context.state !== 'closed') {
      try { await context.close() } catch { /* browser is already tearing down */ }
    }
  }

  private sample = () => {
    const analyser = this.analyser
    if (!analyser) return
    const samples = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteTimeDomainData(samples)
    const raw = normalizeAudioSamples(samples)
    this.smoothedLevel += (raw - this.smoothedLevel) * (raw > this.smoothedLevel ? 0.42 : 0.16)
    this.store.set(this.smoothedLevel)
    this.frame = this.requestFrame(this.sample)
  }
}
