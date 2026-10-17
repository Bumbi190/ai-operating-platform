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
    return unavailable()
  }
}

function probe(socket: WebSocket, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    let finished = false
    const timer = setTimeout(finish, 5000)
    function finish() {
      if (finished) return
      finished = true
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      socket.off('message', message)
      socket.off('close', finish)
      // Keep the idempotent error handler for errors emitted by terminate().
      if (socket.readyState !== 3) socket.terminate()
      resolve()
    }
    function message(data: RawData, binary: boolean) {
      if (finished) return
      const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer)
      if (!binary || bytes.length > 6404 || socket.bufferedAmount + bytes.length > 64000) { finish(); return }
      try { socket.send(bytes, { binary: true }, error => { if (error) finish() }) }
      catch { finish() }
    }
    socket.on('message', message)
    socket.on('close', finish)
    socket.on('error', finish)
    signal.addEventListener('abort', finish, { once: true })
    if (signal.aborted) finish()
  })
}
