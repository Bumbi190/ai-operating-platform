/** Local speech classification only. No audio leaves the device here. */
export type SpeechModel = {
  process(frame: Float32Array): Promise<number>
  reset(): void
  release(): Promise<void>
}

/** Serialize recurrent inference and refuse to build up seconds of stale audio. */
export function createSpeechFrameProcessor(model: SpeechModel, receive: (frame: Float32Array, probability: number) => void, failed: (error: Error) => void) {
  let pending: Float32Array[] = [], partial = new Float32Array(512), used = 0
  let running = false, stopped = false, released = false, epoch = 0, resetState = false
  const release = () => { if (!running && !released) { released = true; void model.release().catch(() => {}) } }
  const stop = () => { stopped = true; epoch++; pending = []; used = 0; release() }
  const fail = (error: unknown) => { if (!stopped) { stop(); failed(error instanceof Error ? error : new Error('speech_detector_failed')) } }
  async function drain() {
    if (running || stopped) return
    running = true
    try {
      while (pending.length && !stopped) {
        if (resetState) { model.reset(); resetState = false }
        const frame = pending.shift()!, token = epoch
        const probability = await model.process(frame)
        if (!stopped && token === epoch) {
          if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new Error('speech_detector_invalid_result')
          receive(frame, probability)
        }
      }
    } catch (error) { fail(error) }
    finally { running = false; if (stopped) release() }
  }
  return {
    push(audio: Float32Array) {
      if (stopped) return
      let offset = 0
      while (offset < audio.length) {
        const size = Math.min(512 - used, audio.length - offset)
        partial.set(audio.subarray(offset, offset + size), used); used += size; offset += size
        if (used === 512) {
          pending.push(partial); partial = new Float32Array(512); used = 0
          if (pending.length > 31) { fail(new Error('speech_detector_too_slow')); return }
        }
      }
      void drain()
    },
    reset() { epoch++; pending = []; used = 0; partial = new Float32Array(512); resetState = true },
    stop,
  }
}

/** Pinned Silero V5 graph, shipped with the site; no runtime CDN dependency. */
export async function loadSpeechModel(signal: AbortSignal): Promise<SpeechModel> {
  // Load the pinned browser ESM as a static asset. Next 14's SWC minifier
  // cannot safely re-bundle the vendor's already-bundled module.
  const modulePath = '/atlas-vad/ort.wasm.min.mjs'
  const ort = await import(/* webpackIgnore: true */ /* @vite-ignore */ modulePath) as typeof import('onnxruntime-web/wasm')
  signal.throwIfAborted()
  ort.env.wasm.numThreads = 1
  ort.env.wasm.proxy = false
  ort.env.wasm.wasmPaths = '/atlas-vad/'
  const response = await fetch('/atlas-vad/silero_vad_v5.onnx', { signal })
  if (!response.ok) throw new Error('speech_model_unavailable')
  const bytes = await response.arrayBuffer()
  signal.throwIfAborted()
  const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] })
  if (signal.aborted) { await session.release(); signal.throwIfAborted() }
  const fresh = () => new ort.Tensor('float32', new Float32Array(256), [2, 1, 128])
  const sr = new ort.Tensor('int64', [BigInt(16000)])
  let state: import('onnxruntime-web/wasm').Tensor = fresh()
  return {
    async process(audio) {
      const input = new ort.Tensor('float32', audio, [1, 512])
      try {
        const result = await session.run({ input, state, sr })
        const probability = Number(result.output.data[0])
        state.dispose(); state = result.stateN; result.output.dispose()
        return probability
      } finally { input.dispose() }
    },
    reset() { state.dispose(); state = fresh() },
    async release() { state.dispose(); sr.dispose(); await session.release() },
  }
}
