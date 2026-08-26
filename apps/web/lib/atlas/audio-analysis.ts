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

/**
 * How an element ended up, and therefore what the caller may safely do with it.
 *
 * A boolean cannot express this. `false` previously meant both "Web Audio never
 * touched your element, play it normally" and "the element is captured and has
 * nowhere to go" — opposite instructions to the caller. Conflating them turned
 * a routine autoplay-policy timeout into a speech failure, which is exactly
 * backwards from the rule that audible speech outranks visualisation.
 */
export type AtlasAudioRoute =
  /** Captured, with a proven path to `destination`. Analyser may be running. */
  | 'routed'
  /** Never captured by this analyser. Ordinary element playback is correct. */
  | 'direct'
  /** Captured, but no usable path to `destination` could be established. */
  | 'unusable'

/**
 * `createMediaElementSource` raises InvalidStateError specifically when the
 * element already belongs to a MediaElementSourceNode. Every other throw leaves
 * the element untouched per spec.
 */
function isInvalidStateError(error: unknown): boolean {
  const candidate = error as { name?: unknown } | null
  return typeof candidate?.name === 'string' && candidate.name === 'InvalidStateError'
}

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
   * Attach the element to the graph and report how it may be played.
   *
   * ORDER IS THE FIX. `createMediaElementSource()` permanently reroutes an
   * element's output into the Web Audio graph, so the original version — which
   * built the analyser first and only reached `destination` on its last line —
   * could capture the element and then throw, leaving it playing into nothing
   * while `onended` still fired on schedule. That is what a silent orb that
   * believes it is speaking looks like.
   *
   * So the audible route is established FIRST, immediately after capture, and
   * the analyser is attached afterwards as a side branch off the same source.
   * An `AnalyserNode` observes whatever is fed to it; it does not need to sit in
   * the signal path, and routing it onward to `destination` as well would only
   * double the signal. Visualisation can therefore fail on its own without
   * taking the speech with it — that case still returns `routed`.
   *
   * Everything that can fail BEFORE capture returns `direct`, because the
   * element is then untouched and a plain `audio.play()` still reaches the
   * speakers. Only a captured element with no working output is `unusable`.
   *
   * Total by contract: this never throws, so a caller can treat its result as
   * the whole truth about the element.
   */
  async prepare(audio: HTMLAudioElement): Promise<AtlasAudioRoute> {
    this.disconnect()

    let context: AudioContextLike
    try {
      this.context ??= this.createContext()
      context = this.context
    } catch {
      // No context was ever built, so nothing captured the element.
      return 'direct'
    }

    if (context.state === 'suspended') {
      try {
        await settleWithin(Promise.resolve(context.resume()), this.resumeTimeoutMs)
      } catch {
        return 'direct'
      }
      // Still suspended means the browser declined to start the graph. The
      // element has not been captured, so HTML media playback is still worth
      // attempting — Web Audio policy and autoplay policy are separate gates,
      // and only the second one gets to silence Atlas.
      if (context.state === 'suspended') return 'direct'
    }

    let source: MediaElementAudioSourceNode
    try {
      source = context.createMediaElementSource(audio)
    } catch (error) {
      // Each spoken segment builds a fresh element, so InvalidStateError here
      // means something already owns this element's output and we cannot claim
      // it reaches the speakers. That is anomalous rather than routine, and
      // reporting it beats playing into a graph we do not control. Any other
      // throw creates no node at all, so the element is untouched.
      return isInvalidStateError(error) ? 'unusable' : 'direct'
    }

    // The element is captured from here on. Output before observation.
    this.source = source
    try {
      source.connect(context.destination)
    } catch {
      this.disconnect()
      return 'unusable'
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

    return 'routed'
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
