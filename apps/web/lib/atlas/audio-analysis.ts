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
  }

  async connect(audio: HTMLAudioElement): Promise<boolean> {
    this.disconnect()
    try {
      this.context ??= this.createContext()
      if (this.context.state === 'suspended') await this.context.resume()
      const analyser = this.context.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.72
      const source = this.context.createMediaElementSource(audio)
      source.connect(analyser)
      analyser.connect(this.context.destination)
      this.source = source
      this.analyser = analyser
      this.sample()
      return true
    } catch {
      this.disconnect()
      return false
    }
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
