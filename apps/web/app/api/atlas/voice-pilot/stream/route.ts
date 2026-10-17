import { upgradeWebSocket } from '@vercel/functions'
import type { RawData, WebSocket } from 'ws'
import { guardAtlasVoiceAccess } from '@/lib/atlas/voice-pilot/access'

export const dynamic = 'force-dynamic'
export const maxDuration = 150

/** Synthetic transport probe only. No microphone, provider or spend dependencies. */
export async function GET(request: Request): Promise<Response> {
  const entered = Date.now(), mode = process.env.ATLAS_VOICE_STREAM_MODE
  if ((process.env.VERCEL_ENV !== 'preview' && process.env.NODE_ENV !== 'development')
    || (mode !== 'probe' && mode !== 'pilot')) return new Response(null, { status: 404 })
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
    if (mode === 'probe') return await upgradeWebSocket(socket => probe(socket, request.signal), { maxPayload: 6404 })
    const lifetime = new AbortController()
    const onAbort = () => lifetime.abort()
    request.signal.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(onAbort, Math.max(0, 120000 - (Date.now() - entered)))
    if (request.signal.aborted) onAbort()
    try {
      return await upgradeWebSocket(async socket => {
        const { serveAtlasVoicePilot } = await import('@/lib/atlas/voice-pilot/stream-bridge')
        await serveAtlasVoicePilot(socket, lifetime.signal)
      }, { maxPayload: 6404 })
    } finally { clearTimeout(timer); request.signal.removeEventListener('abort', onAbort) }
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
    let closingReason: 'deadline' | 'invalid_frame' | undefined
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
    function deadline() { beginClose('deadline', 1000) }
    function beginClose(reason: 'deadline' | 'invalid_frame', code: 1000 | 1008) {
      if (finished || closingReason) return
      closingReason = reason
      clearTimeout(timer)
      socket.off('message', message)
      // Send a close frame before resolving so an intermediary can forward rejection.
      // Bound the handshake even when the peer never acknowledges it.
      closeTimer = setTimeout(() => finish('close_timeout'), 250)
      try { socket.close(code) } catch { finish('close_error') }
    }
    function message(data: RawData, binary: boolean) {
      if (finished || closingReason) return
      const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer)
      if (!binary || bytes.length > 6404 || socket.bufferedAmount + bytes.length > 64000) { beginClose('invalid_frame', 1008); return }
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
