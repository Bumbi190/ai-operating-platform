// Run from apps/web: node e2e/atlas-voice-pilot-server.mjs
import { createServer as httpServer } from 'node:http'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
const root = process.cwd(), boundary = resolve(root, 'e2e/atlas-voice-pilot-boundaries.ts')
const vite = await createServer({ configFile: false, optimizeDeps: { include: ['onnxruntime-web/wasm'] }, root, appType: 'custom', esbuild: { jsx: 'automatic' }, resolve: { alias: [
  { find: '@/lib/atlas/runtime', replacement: boundary },
  { find: '@/lib/supabase/client', replacement: boundary },
  { find: 'next/link', replacement: resolve(root, 'e2e/atlas-entry-next.tsx') },
  { find: '@', replacement: root },
] }, server: { middlewareMode: true, host: '127.0.0.1' } })
let recorderMode = '', recorderRequests = 0, modelMode = '', modelRequests = 0
const server = httpServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:54397')
  if (url.pathname === '/atlas/rosttest') {
    recorderMode = url.searchParams.get('recorder') ?? ''; recorderRequests = 0
    modelMode = url.searchParams.get('model') ?? ''; modelRequests = 0
  }
  // Serve WASM runtime modules as actual static files, just as Next public assets.
  // Vite otherwise tries to transform an imported public .mjs file and rejects it.
  if (/^\/atlas-vad\/(?:silero_vad_v5\.onnx|ort-wasm-simd-threaded\.(?:wasm|mjs))$/.test(url.pathname)) {
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
server.listen(54397, '127.0.0.1', () => console.log('Voice UI fixture: http://127.0.0.1:54397/atlas/rosttest'))
async function close() { server.close(); await vite.close(); process.exit(0) }
process.on('SIGTERM', close); process.on('SIGINT', close)
