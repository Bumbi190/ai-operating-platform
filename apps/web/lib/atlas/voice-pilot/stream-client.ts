import { PCM_MAX_BYTES } from './pcm'
import { encodeVoicePcm, parseVoiceServerEvent, VOICE_PCM_CHUNK_BYTES, VOICE_PCM_QUEUE_BYTES, type RealtimeTurn, type VoiceEndReason } from './stream-protocol'

/** Cookie-authenticated, single-use turn. Owns no microphone and never replays. */
export function beginVoiceStream(signal: AbortSignal): RealtimeTurn {
  let socket: WebSocket | undefined, ended = false, available = false, finishing = false, committed = false
  let failure: Error | undefined, result: string | undefined, reason: VoiceEndReason = 'pause'
  let queued = 0, total = 0, sequence = 0
  const queue: Uint8Array[] = []
  let yes!: (text: string) => void, no!: (error: Error) => void
  const final = new Promise<string>((resolve, reject) => { yes = resolve; no = reject })
  void final.catch(() => {})
  let readyTimer: ReturnType<typeof setTimeout> | undefined, finishTimer: ReturnType<typeof setTimeout> | undefined
  const totalTimer = setTimeout(() => fail('timeout'), 120000)
  // At most ten 200ms frames fit in the two-second PCM window.
  const wireLimit = VOICE_PCM_QUEUE_BYTES + 4 * Math.ceil(VOICE_PCM_QUEUE_BYTES / VOICE_PCM_CHUNK_BYTES)
  function cleanup() {
    clearTimeout(totalTimer); clearTimeout(readyTimer); clearTimeout(finishTimer)
    signal.removeEventListener('abort', aborted)
    queue.length = 0; queued = 0
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null
      if (socket.readyState < 2) { try { socket.close(1000) } catch {} }
    }
  }
  function fail(code: string) {
    if (ended) return
    ended = true; failure = new Error('atlas_voice_stream_' + code); cleanup(); no(failure)
  }
  function aborted() { fail('aborted') }
  function take(length: number): Uint8Array {
    const bytes = new Uint8Array(length); let offset = 0
    while (offset < length) {
      const part = queue.shift()!, count = Math.min(part.length, length - offset)
      bytes.set(part.subarray(0, count), offset); offset += count
      if (count < part.length) queue.unshift(part.subarray(count))
    }
    queued -= length; return bytes
  }
  function flush() {
    if (ended || !available || !socket) return
    try {
      while (queued >= VOICE_PCM_CHUNK_BYTES || (finishing && queued > 0)) {
        const audio = take(Math.min(queued, VOICE_PCM_CHUNK_BYTES)), frame = encodeVoicePcm(sequence, audio)
        if (socket.readyState !== 1 || queued + socket.bufferedAmount + frame.length > wireLimit) throw new Error('capacity')
        socket.send(frame); sequence++
      }
      if (finishing && !committed && queued === 0) {
        if (!sequence) { fail('no_audio'); return }
        const raw = JSON.stringify({ type: 'finish', lastSeq: sequence - 1, reason })
        if (socket.bufferedAmount + raw.length > wireLimit + 512) throw new Error('capacity')
        committed = true; socket.send(raw)
        finishTimer = setTimeout(() => fail('timeout'), 20000)
      }
    } catch { fail('capacity') }
  }
  const turn: RealtimeTurn = {
    send(audio) {
      if (ended || finishing) throw failure ?? new Error('atlas_voice_stream_ended')
      if (!(audio instanceof Uint8Array) || !audio.length || audio.length % 2 || audio.length > VOICE_PCM_CHUNK_BYTES
        || total + audio.length > PCM_MAX_BYTES || queued + audio.length + (socket?.bufferedAmount ?? 0) > VOICE_PCM_QUEUE_BYTES) {
        fail('capacity'); throw failure
      }
      total += audio.length; queued += audio.length; queue.push(new Uint8Array(audio)); flush()
      if (failure) throw failure
    },
    finish(value) {
      if (ended) return final
      if (!finishing) {
        if (!['pause', 'manual', 'limit'].includes(value)) { fail('invalid_finish'); return final }
        finishing = true; reason = value; flush()
      }
      return final
    },
    abort: aborted,
  }
  signal.addEventListener('abort', aborted, { once: true })
  if (signal.aborted) { aborted(); return turn }
  try {
    const url = new URL('/api/atlas/voice-pilot/stream', location.href)
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    socket = new WebSocket(url)
    readyTimer = setTimeout(() => fail('timeout'), 12000)
    socket.onopen = () => { if (ended) return }
    socket.onmessage = event => {
      if (ended) return
      try {
        if (typeof event.data !== 'string') throw new Error('invalid_event')
        const value = parseVoiceServerEvent(event.data)
        if (value.type === 'failed') { fail(value.code); return }
        if (value.type === 'ready') {
          if (available || socket?.readyState !== 1) throw new Error('invalid_ready')
          available = true; clearTimeout(readyTimer); flush(); return
        }
        if (!committed || value.reason !== reason) throw new Error('invalid_final')
        result = value.text; ended = true; cleanup(); yes(result)
      } catch { fail('invalid_event') }
    }
    socket.onerror = () => fail('unavailable')
    socket.onclose = () => fail('unavailable')
  } catch { fail('unavailable') }
  return turn
}
