/** Progressive playback for the first Atlas TTS segment only. */

import {
  playTtsElement,
  playTtsUrl,
  type PlaybackDeps,
  type PlaybackHandle,
  type PlaybackResult,
} from './playback'

export const ATLAS_PROGRESSIVE_MIME = 'audio/mpeg'

export type ProgressiveCapability = 'supported' | 'unsupported'
export type TtsBodyEvent = 'first-byte' | 'body-complete' | 'blob-fallback'

interface SourceBufferLike {
  appendBuffer(data: BufferSource): void
  addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions): void
  removeEventListener(type: string, listener: () => void): void
}

interface MediaSourceLike {
  readyState: string
  addSourceBuffer(type: string): SourceBufferLike
  endOfStream(): void
  addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions): void
  removeEventListener(type: string, listener: () => void): void
}

interface ProgressivePlaybackDeps extends PlaybackDeps {
  capability?: () => ProgressiveCapability
  createMediaSource?: () => MediaSourceLike
  createObjectUrl?: (value: Blob | MediaSource) => string
  createAudio?: (url: string) => HTMLAudioElement
  onBodyEvent?: (event: TtsBodyEvent) => void
}

const FAILED: PlaybackResult = {
  status: 'failed',
  code: 'ATLAS_TTS_PLAYBACK_FAILED',
  started: false,
}

export function progressiveMp3Capability(): ProgressiveCapability {
  if (typeof window === 'undefined') return 'unsupported'
  const MediaSourceCtor = window.MediaSource
  if (!MediaSourceCtor || typeof MediaSourceCtor.isTypeSupported !== 'function') return 'unsupported'
  return MediaSourceCtor.isTypeSupported(ATLAS_PROGRESSIVE_MIME) ? 'supported' : 'unsupported'
}

async function readRemaining(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  chunks: ArrayBuffer[],
  onFirstByte: () => void,
): Promise<void> {
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    if (!value?.byteLength) continue
    onFirstByte()
    chunks.push(Uint8Array.from(value).buffer)
  }
}

function waitForSourceOpen(source: MediaSourceLike): Promise<void> {
  if (source.readyState === 'open') return Promise.resolve()
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      source.removeEventListener('sourceopen', opened)
      source.removeEventListener('sourceclose', closed)
    }
    const opened = () => { cleanup(); resolve() }
    const closed = () => { cleanup(); reject(new Error('MediaSource closed before opening')) }
    source.addEventListener('sourceopen', opened, { once: true })
    source.addEventListener('sourceclose', closed, { once: true })
  })
}

function append(sourceBuffer: SourceBufferLike, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      sourceBuffer.removeEventListener('updateend', updated)
      sourceBuffer.removeEventListener('error', failed)
      sourceBuffer.removeEventListener('abort', failed)
    }
    const updated = () => { cleanup(); resolve() }
    const failed = () => { cleanup(); reject(new Error('SourceBuffer append failed')) }
    sourceBuffer.addEventListener('updateend', updated, { once: true })
    sourceBuffer.addEventListener('error', failed, { once: true })
    sourceBuffer.addEventListener('abort', failed, { once: true })
    try {
      sourceBuffer.appendBuffer(bytes)
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}

/**
 * Consume and play one response. MSE is attempted only when the exact MP3
 * capability probe passes. A pre-playing failure drains into one Blob fallback;
 * after `playing`, replay is forbidden because it would duplicate speech.
 */
export function playProgressiveTtsResponse(
  response: Response,
  deps: ProgressivePlaybackDeps = {},
): PlaybackHandle {
  let stopped = false
  let settled = false
  let started = false
  let fallbackUsed = false
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let active: PlaybackHandle | null = null
  let resolveResult!: (result: PlaybackResult) => void
  const result = new Promise<PlaybackResult>(resolve => { resolveResult = resolve })

  const settle = (outcome: PlaybackResult) => {
    if (settled) return
    settled = true
    resolveResult(outcome)
  }
  const emitFirstByte = (() => {
    let emitted = false
    return () => {
      if (emitted) return
      emitted = true
      deps.onBodyEvent?.('first-byte')
    }
  })()
  const emitBodyComplete = (() => {
    let emitted = false
    return () => {
      if (emitted) return
      emitted = true
      deps.onBodyEvent?.('body-complete')
    }
  })()
  const playbackDeps: PlaybackDeps = {
    analyser: deps.analyser,
    onEvent: deps.onEvent,
    onStart: () => {
      started = true
      deps.onStart?.()
    },
    createAudio: deps.createAudio,
    revokeObjectUrl: deps.revokeObjectUrl,
  }
  const createObjectUrl = deps.createObjectUrl ?? ((value: Blob | MediaSource) => URL.createObjectURL(value))
  const createAudio = deps.createAudio ?? ((url: string) => new Audio(url))

  void (async () => {
    const chunks: ArrayBuffer[] = []
    try {
      reader = response.body?.getReader() ?? null
      if (!reader) {
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (bytes.byteLength) { emitFirstByte(); chunks.push(Uint8Array.from(bytes).buffer) }
        emitBodyComplete()
        if (stopped) return settle({ status: 'cancelled', code: null, started: false })
        const url = createObjectUrl(new Blob(chunks, { type: response.headers.get('content-type') || ATLAS_PROGRESSIVE_MIME }))
        active = playTtsUrl(url, playbackDeps)
        return settle(await active.result)
      }

      const capability = deps.capability?.() ?? progressiveMp3Capability()
      if (capability !== 'supported') {
        await readRemaining(reader, chunks, emitFirstByte)
        emitBodyComplete()
        if (stopped) return settle({ status: 'cancelled', code: null, started: false })
        const url = createObjectUrl(new Blob(chunks, { type: response.headers.get('content-type') || ATLAS_PROGRESSIVE_MIME }))
        active = playTtsUrl(url, playbackDeps)
        return settle(await active.result)
      }

      let mediaUrl: string | null = null
      try {
        const createMediaSource = deps.createMediaSource ?? (() => new window.MediaSource() as unknown as MediaSourceLike)
        const mediaSource = createMediaSource()
        mediaUrl = createObjectUrl(mediaSource as unknown as MediaSource)
        const audio = createAudio(mediaUrl)
        active = playTtsElement(audio, {
          ...playbackDeps,
          releaseSource: () => {
            const revoke = deps.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url))
            if (mediaUrl) revoke(mediaUrl)
            mediaUrl = null
          },
        })
        await waitForSourceOpen(mediaSource)
        const sourceBuffer = mediaSource.addSourceBuffer(ATLAS_PROGRESSIVE_MIME)
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (!value?.byteLength) continue
          emitFirstByte()
          const copy = Uint8Array.from(value)
          chunks.push(copy.buffer)
          await append(sourceBuffer, copy)
        }
        emitBodyComplete()
        if (mediaSource.readyState === 'open') mediaSource.endOfStream()
        if (stopped) return
        settle(await active.result)
      } catch {
        if (stopped) return
        if (active) {
          active.stop()
          await active.result
        } else if (mediaUrl) {
          const revoke = deps.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url))
          try { revoke(mediaUrl) } catch { /* setup already released it */ }
          mediaUrl = null
        }
        // Once a real `playing` event happened, replaying buffered bytes would
        // overlap or duplicate speech. Fail closed instead.
        if (started || fallbackUsed) return settle({ ...FAILED, started })
        fallbackUsed = true
        deps.onBodyEvent?.('blob-fallback')
        try {
          await readRemaining(reader, chunks, emitFirstByte)
          emitBodyComplete()
        } catch {
          return settle(FAILED)
        }
        if (stopped) return settle({ status: 'cancelled', code: null, started: false })
        const blobUrl = createObjectUrl(new Blob(chunks, { type: response.headers.get('content-type') || ATLAS_PROGRESSIVE_MIME }))
        active = playTtsUrl(blobUrl, playbackDeps)
        settle(await active.result)
      }
    } catch {
      settle(stopped ? { status: 'cancelled', code: null, started } : { ...FAILED, started })
    }
  })()

  return {
    result,
    stop() {
      if (settled || stopped) return
      stopped = true
      void reader?.cancel().catch(() => undefined)
      active?.stop()
      settle({ status: 'cancelled', code: null, started })
    },
    fail() {
      if (settled) return
      stopped = true
      void reader?.cancel().catch(() => undefined)
      active?.fail()
      settle({ ...FAILED, started })
    },
  }
}
