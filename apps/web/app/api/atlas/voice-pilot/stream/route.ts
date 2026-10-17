import { upgradeWebSocket } from '@vercel/functions'
import type { RawData, WebSocket } from 'ws'
import { guardAtlasVoiceAccess } from '@/lib/atlas/voice-pilot/access'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

/** Synthetic transport probe only. No microphone, provider or spend dependencies. */
export async function GET(request: Request): Promise<Response> {
  if ((process.env.VERCEL_ENV !== 'preview' && process.env.NODE_ENV !== 'development')
    || process.env.ATLAS_VOICE_STREAM_MODE !== 'probe') return new Response(null, { status: 404 })
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Ogiltigt ursprung.' }, { status: 403 })
  const unavailable = () => Response.json({ error: 'Anslutningen kunde inte starta.' }, { status: 503 })
  if (request.signal.aborted) return unavailable()
  const denial = await guardAtlasVoiceAccess()
  if (denial) return denial
  if (request.signal.aborted) return unavailable()
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
    return new Response(null, { status: 426, headers: { Upgrade: 'websocket', 'Cache-Control': 'no-store' } })
  try {
    return await upgradeWebSocket(socket => probe(socket, request.signal), { maxPayload: 6404 })
  } catch {
    // Never log exception text, headers, cookies or URLs.
    console.info('[atlas-voice-stream-probe]', { event: 'upgrade_failed' })
    return unavailable()
  }
}

function probe(socket: WebSocket, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const started = Date.now()
    let finished = false, frames = 0, sentBytes = 0
    let closeTimer: ReturnType<typeof setTimeout> | undefined
    let closingReason: 'deadline' | undefined
    const timer = setTimeout(deadline, 5000)
    console.info('[atlas-voice-stream-probe]', { event: 'opened' })
    function finish(reason: 'socket_close' | 'socket_error' | 'request_abort' | 'invalid_frame' | 'send_error' | 'close_timeout' | 'close_error', closeCode = 0) {
      if (finished) return
      finished = true
      clearTimeout(timer)
      clearTimeout(closeTimer)
      signal.removeEventListener('abort', aborted)
      socket.off('message', message)
      socket.off('close', closed)
      console.info('[atlas-voice-stream-probe]', {
        event: 'closed', reason: closingReason ?? reason, transport: reason,
        elapsedMs: Date.now() - started, frames, sentBytes, closeCode, signalAborted: signal.aborted,
      })
      // Keep the idempotent error handler for errors emitted by terminate().
      if (socket.readyState !== 3) socket.terminate()
      resolve()
    }
    function closed(code: number) { finish('socket_close', code) }
    function errored() { finish('socket_error') }
    function aborted() { finish('request_abort') }
    function deadline() {
      if (finished) return
      closingReason = 'deadline'
      socket.off('message', message)
      // Send an intentional close frame; await its handshake before the handler resolves.
      // A nonresponsive peer still cannot retain this probe beyond 5.25 seconds.
      closeTimer = setTimeout(() => finish('close_timeout'), 250)
      try { socket.close(1000) } catch { finish('close_error') }
    }
    function message(data: RawData, binary: boolean) {
      if (finished || closingReason) return
      const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer)
      if (!binary || bytes.length > 6404 || socket.bufferedAmount + bytes.length > 64000) { finish('invalid_frame'); return }
      frames++
      if (frames === 1) console.info('[atlas-voice-stream-probe]', { event: 'first_frame', elapsedMs: Date.now() - started, bytes: bytes.length })
      try { socket.send(bytes, { binary: true }, error => { if (error) finish('send_error'); else sentBytes += bytes.length }) }
      catch { finish('send_error') }
    }
    socket.on('message', message)
    socket.on('close', closed)
    socket.on('error', errored)
    signal.addEventListener('abort', aborted, { once: true })
    if (signal.aborted) aborted()
  })
}
