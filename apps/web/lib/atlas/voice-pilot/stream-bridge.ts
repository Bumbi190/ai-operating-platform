import type { RawData, WebSocket } from 'ws'
import { openAtlasSwedishRealtime, type AtlasRealtimeContext } from '@/lib/media/elevenlabs-realtime'
import { createVoiceFrameState, parseVoiceControl, type RealtimeTurn, type VoiceServerEvent, type VoiceFailureCode } from './stream-protocol'

/** One browser connection owns one question. No partials, reconnect or batch replay. */
export function serveAtlasVoiceStream(socket: WebSocket, ctx: AtlasRealtimeContext, callerSignal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const canceled = new AbortController(), frames = createVoiceFrameState()
    let turn: RealtimeTurn | undefined, closing = false, terminal = false, finishing = false
    let closeTimer: ReturnType<typeof setTimeout> | undefined
    function abortProvider() {
      canceled.abort(); const owned = turn; turn = undefined; owned?.abort()
    }
    function cleanup() {
      if (terminal) return
      terminal = true; clearTimeout(closeTimer)
      callerSignal.removeEventListener('abort', aborted)
      socket.off('message', message); socket.off('close', closed)
      abortProvider(); resolve()
    }
    function end(event?: VoiceServerEvent) {
      if (closing || terminal) return
      closing = true; socket.off('message', message); abortProvider()
      if (socket.readyState === 3) { cleanup(); return }
      // Await a close frame handshake, including deliberate rejection. Vercel
      // phone proof showed that abrupt terminate alone can hide the close event.
      closeTimer = setTimeout(() => { socket.terminate(); cleanup() }, 250)
      const close = () => { try { socket.close(event?.type === 'failed' ? 1008 : 1000) } catch { socket.terminate(); cleanup() } }
      if (!event) { close(); return }
      const raw = JSON.stringify(event)
      if (socket.readyState !== 1 || socket.bufferedAmount + Buffer.byteLength(raw) > 65536) { socket.terminate(); cleanup(); return }
      try { socket.send(raw, { binary: false }, error => { if (error) { socket.terminate(); cleanup() } else close() }) }
      catch { socket.terminate(); cleanup() }
    }
    function fail(code: VoiceFailureCode) { end({ type: 'failed', code }) }
    function closed() { if (!closing) end(); cleanup() }
    function errored() { end() }
    function aborted() { fail('aborted') }
    function message(data: RawData, binary: boolean) {
      if (closing) return
      try {
        if (!turn) throw new Error('not_ready')
        const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer)
        if (binary) {
          if (finishing) throw new Error('turn_finished')
          turn.send(frames.acceptPcm(bytes)); return
        }
        const control = parseVoiceControl(bytes.toString('utf8'))
        if (control.type === 'cancel') { end(); return }
        if (finishing) throw new Error('duplicate_finish')
        const { reason } = frames.finish(control); finishing = true
        void turn.finish(reason).then(text => {
          if (!closing) end({ type: 'final', text, reason })
        }, () => { if (!closing) fail('unavailable') })
      } catch { fail('invalid_audio') }
    }
    socket.on('message', message); socket.on('close', closed); socket.on('error', errored)
    callerSignal.addEventListener('abort', aborted, { once: true })
    if (callerSignal.aborted) { aborted(); return }
    // Start asynchronously without delaying close/cancel handlers.
    void openAtlasSwedishRealtime(ctx, canceled.signal).then(value => {
      if (closing || terminal) { value.abort(); return }
      turn = value
      try {
        const raw = JSON.stringify({ type: 'ready' })
        if (socket.readyState !== 1 || socket.bufferedAmount + raw.length > 65536) { end(); return }
        socket.send(raw, { binary: false }, error => { if (error) end() })
      } catch { end() }
    }, () => { if (!closing) fail('unavailable') })
  })
}

/** Fixed operator scope; the browser cannot choose billing or execution context. */
export async function serveAtlasVoicePilot(socket: WebSocket, signal: AbortSignal): Promise<void> {
  const [{ PLATFORM_COMPAT_PROJECT }, { GLOBAL_ONLY }] = await Promise.all([
    import('@/lib/cost/governed-spend'), import('@/lib/governance/execution-stop'),
  ])
  return serveAtlasVoiceStream(socket, { project: PLATFORM_COMPAT_PROJECT, operation: 'Atlas Swedish realtime transcription trial',
    execution: { context: 'OPERATOR_INTERACTIVE', scope: GLOBAL_ONLY } }, signal)
}
