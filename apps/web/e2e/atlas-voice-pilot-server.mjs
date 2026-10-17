// Run from apps/web: node e2e/atlas-voice-pilot-server.mjs
import { createServer as httpServer } from 'node:http'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
import { WebSocketServer } from 'ws'
const root = process.cwd(), boundary = resolve(root, 'e2e/atlas-voice-pilot-boundaries.ts')
const vite = await createServer({ configFile: false, root, appType: 'custom', esbuild: { jsx: 'automatic' }, resolve: { alias: [
  { find: '@/lib/supabase/client', replacement: boundary },
  { find: 'next/navigation', replacement: resolve(root, 'e2e/atlas-overview-messenger-navigation.ts') },
  { find: 'next/image', replacement: resolve(root, 'e2e/atlas-entry-image.tsx') },
  { find: 'next/link', replacement: resolve(root, 'e2e/atlas-entry-next.tsx') },
  { find: '@', replacement: root },
] }, server: { middlewareMode: true, host: '127.0.0.1' } })
let recorderMode = '', recorderRequests = 0, modelMode = '', modelRequests = 0
let streamMode = '', streamConnections = 0, streamBytes = 0, streamFinals = 0, streamSegments = 0, streamLimit = 0
let streamText = '', streamDelay = false, streamPending = new Set()
const streams = new WebSocketServer({ noServer: true, maxPayload: 6404 })
const server = httpServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:54397')
  if (url.pathname === '/atlas/rosttest') {
    recorderMode = url.searchParams.get('recorder') ?? ''; recorderRequests = 0
    modelMode = url.searchParams.get('model') ?? ''; modelRequests = 0
    streamMode = url.searchParams.get('stream') ?? ''
    streamConnections = streamBytes = streamFinals = streamSegments = streamLimit = 0
    streamPending.clear(); streamText = ''; streamDelay = false
  }
  if (url.pathname === '/__voice-stream-fixture') {
    if (req.method === 'POST') {
      let body = ''
      for await (const chunk of req) { body += chunk; if (body.length > 2048) { res.writeHead(413); res.end(); return } }
      const value = JSON.parse(body)
      if (typeof value.text === 'string') streamText = value.text
      if (typeof value.delay === 'boolean') streamDelay = value.delay
      if (value.release === true) { for (const deliver of streamPending) deliver(); streamPending.clear() }
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ connections: streamConnections, bytes: streamBytes, finals: streamFinals, segments: streamSegments, limits: streamLimit })); return
  }
  // Serve WASM runtime modules as actual static files, just as Next public assets.
  // Vite otherwise tries to transform an imported public .mjs file and rejects it.
  if (/^\/atlas-vad\/(?:silero_vad_v5\.onnx|ort\.wasm\.min\.mjs|ort-wasm-simd-threaded\.(?:wasm|mjs))$/.test(url.pathname)) {
    if (url.pathname.endsWith('.onnx')) {
      modelRequests++
      if (modelMode === 'fail-once' && modelRequests === 1) { res.writeHead(503); res.end(); return }
      if (modelMode === 'slow') await new Promise(resolve => setTimeout(resolve, 2000))
      if (res.destroyed) return
    }
    res.writeHead(200, { 'content-type': url.pathname.endsWith('.mjs') ? 'application/javascript' : url.pathname.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream' })
    res.end(await readFile(resolve(root, 'public' + url.pathname))); return
  }
  // Worklet fetches are not intercepted by page.route in Chromium. Exercise
  // real HTTP failures/delays here, before Vite's static asset handler.
  if (url.pathname === '/atlas-voice-recorder.js') {
    recorderRequests++
    if (recorderMode === 'fail-once' && recorderRequests === 1) {
      res.writeHead(503, { 'content-type': 'text/plain' }); res.end('temporarily unavailable'); return
    }
    if (recorderMode === 'slow') await new Promise(resolve => setTimeout(resolve, 2000))
    if (res.destroyed) return
    res.writeHead(200, { 'content-type': 'application/javascript', 'cache-control': 'no-store' })
    res.end(await readFile(resolve(root, 'public/atlas-voice-recorder.js'))); return
  }
  vite.middlewares(req, res, async () => {
  res.setHeader('content-type', 'text/html')
  res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html lang="sv" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#070e1a;font-family:system-ui}</style></head><body><div id="root"></div><script type="module" src="/e2e/atlas-voice-pilot-entry.tsx"></script></body></html>'))
}) })
// Local fake STT boundary. Actual browser client, capture, worklet and Silero remain real.
server.on('upgrade', (request, socket, head) => {
  if (new URL(request.url, 'http://127.0.0.1:54397').pathname !== '/api/atlas/voice-pilot/stream') return
  if (request.headers.origin !== 'http://127.0.0.1:54397') { socket.destroy(); return }
  streams.handleUpgrade(request, socket, head, ws => {
    streamConnections++
    if (streamMode === 'fail-once' && streamConnections === 1) { ws.close(1008); return }
    let sequence = 0, bytes = 0, finished = false, pending
    ws.send(JSON.stringify({ type: 'ready' }))
    ws.on('message', (raw, binary) => {
      if (finished) { ws.close(1008); return }
      if (binary) {
        const data = new Uint8Array(raw), seq = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0, false)
        const count = data.length - 4
        if (seq !== sequence++ || count < 2 || count % 2 || count > 6400 || bytes + count > 2880000) { ws.close(1008); return }
        const previous = Math.floor(bytes / 640000)
        bytes += count; streamBytes += count
        streamSegments += Math.floor(bytes / 640000) - previous
        return
      }
      const value = JSON.parse(raw.toString())
      if (value.type !== 'finish' || value.lastSeq !== sequence - 1 || !sequence) { ws.close(1008); return }
      finished = true
      const text = streamText
      pending = () => {
        if (ws.readyState !== 1) return
        streamFinals++; if (value.reason === 'limit') streamLimit++
        ws.send(JSON.stringify({ type: 'final', text, reason: value.reason }))
      }
      if (streamDelay) streamPending.add(pending); else pending()
    })
    ws.on('error', () => {})
    ws.on('close', () => { if (pending) streamPending.delete(pending) })
  })
})
server.listen(54397, '127.0.0.1', () => console.log('Voice UI fixture: http://127.0.0.1:54397/atlas/rosttest'))
async function close() { for (const ws of streams.clients) ws.terminate(); streams.close(); server.close(); await vite.close(); process.exit(0) }
process.on('SIGTERM', close); process.on('SIGINT', close)
