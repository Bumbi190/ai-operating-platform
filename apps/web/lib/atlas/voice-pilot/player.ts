import type { AtlasSwedishVoice } from './voices'

/** Network chunks may split a signed 16-bit PCM sample at either byte. */
export function createPcmDecoder() {
  let pending: number | null = null
  return {
    push(bytes: Uint8Array): Float32Array {
      const data = new Uint8Array(bytes.length + (pending === null ? 0 : 1))
      if (pending !== null) data[0] = pending
      data.set(bytes, pending === null ? 0 : 1)
      const length = data.length - data.length % 2
      pending = length < data.length ? data[length] : null
      const samples = new Float32Array(length / 2), view = new DataView(data.buffer)
      for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768
      return samples
    },
    finish() { if (pending !== null) throw new Error('incomplete_pcm_sample') },
  }
}
type Sink = { prepare(): Promise<void>; push(samples: Float32Array): void; stop(): void; dispose(): void }
type RequestSpeech = (text: string, voice: AtlasSwedishVoice, signal: AbortSignal) => Promise<Response>

/** Serial paid requests with immediate chunk playback and generation-safe stop. */
export function createPcmSpeechPlayer(options: { notice(message: string): void; playing?(value: boolean): void }, dependencies?: { request: RequestSpeech; sink: Sink }) {
  const sink = dependencies?.sink ?? browserPcmSink(value => options.playing?.(value))
  const request: RequestSpeech = dependencies?.request ?? ((text, voice, signal) => fetch('/api/atlas/voice-pilot/speech', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice }), signal,
  }))
  let generation = 0, disposed = false, running = false, abort: AbortController | null = null
  let queue: { text: string; voice: AtlasSwedishVoice }[] = []
  function stop() { generation++; queue = []; running = false; abort?.abort(); abort = null; sink.stop() }
  async function drain(token: number) {
    running = true
    try {
      await sink.prepare()
      while (token === generation && !disposed && queue.length) {
        const item = queue.shift()!
        const controller = new AbortController(); abort = controller
        const response = await request(item.text, item.voice, controller.signal)
        if (token !== generation || disposed) { await response.body?.cancel().catch(() => {}); return }
        if (!response.ok || !response.body) { await response.body?.cancel().catch(() => {}); throw new Error('speech_failed') }
        const reader = response.body.getReader(), decoder = createPcmDecoder()
        let size = 0
        try {
          for (;;) {
            const chunk = await reader.read()
            if (token !== generation || disposed) { await reader.cancel(); return }
            if (chunk.done) break
            size += chunk.value.length
            if (size > 24_000 * 2 * 60) throw new Error('speech_too_long')
            const samples = decoder.push(chunk.value)
            if (samples.length) sink.push(samples)
          }
          decoder.finish()
          if (!size) throw new Error('empty_speech')
        } catch (error) {
          controller.abort(); await reader.cancel().catch(() => {}); throw error
        } finally { reader.releaseLock() }
      }
    } catch {
      if (token === generation && !disposed) {
        stop()
        options.notice('Rösten kunde inte spelas. Klicka på provlyssna och försök igen; svaret finns kvar i text.')
      }
    } finally { if (token === generation) { running = false; abort = null } }
  }
  return {
    prepare: () => sink.prepare(),
    enqueue(text: string, voice: AtlasSwedishVoice) {
      if (disposed || !text.trim()) return
      // No silent truncation: the route accepts at most 600 characters.
      for (let i = 0; i < text.length; i += 600) queue.push({ text: text.slice(i, i + 600), voice })
      if (!running) void drain(generation)
    },
    stop,
    dispose() { if (disposed) return; disposed = true; stop(); sink.dispose() },
  }
}

function browserPcmSink(playing: (value: boolean) => void): Sink {
  let context: AudioContext | null = null, end = 0, generation = 0
  let startTimer: ReturnType<typeof setTimeout> | undefined
  const sources = new Set<AudioBufferSourceNode>()
  function stop() {
    generation++; clearTimeout(startTimer); startTimer = undefined
    for (const source of sources) { source.onended = null; try { source.stop() } catch {} source.disconnect() }
    sources.clear(); end = context?.currentTime ?? 0; playing(false)
  }
  return {
    async prepare() {
      context ??= new AudioContext({ sampleRate: 24_000 })
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([context.resume(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('audio_blocked')), 1200) })])
        if (context.state !== 'running') throw new Error('audio_blocked')
      } finally { clearTimeout(timeout) }
    },
    push(samples) {
      if (!context || context.state !== 'running') throw new Error('audio_suspended')
      const buffer = context.createBuffer(1, samples.length, 24_000)
      buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
      const source = context.createBufferSource(), token = generation
      source.buffer = buffer; source.connect(context.destination)
      const start = Math.max(context.currentTime + 0.02, end)
      end = start + buffer.duration
      const wasEmpty = sources.size === 0
      sources.add(source)
      source.onended = () => {
        source.disconnect(); sources.delete(source)
        if (token === generation && sources.size === 0) { clearTimeout(startTimer); startTimer = undefined; playing(false) }
      }
      source.start(start)
      if (wasEmpty) startTimer = setTimeout(() => {
        startTimer = undefined
        if (token === generation && sources.size && context?.state === 'running') playing(true)
      }, Math.max(0, (start - context.currentTime) * 1000))
    },
    stop,
    dispose() { stop(); if (context) { void context.close(); context = null } },
  }
}
