// Run from apps/web: node e2e/atlas-voice-pilot-server.mjs
import { createServer as httpServer } from 'node:http'
import { resolve } from 'node:path'
import { createServer } from 'vite'
const root = process.cwd(), boundary = resolve(root, 'e2e/atlas-voice-pilot-boundaries.ts')
const vite = await createServer({ configFile: false, root, appType: 'custom', esbuild: { jsx: 'automatic' }, resolve: { alias: [
  { find: '@/lib/atlas/runtime', replacement: boundary },
  { find: '@/lib/supabase/client', replacement: boundary },
  { find: 'next/link', replacement: resolve(root, 'e2e/atlas-entry-next.tsx') },
  { find: '@', replacement: root },
] }, server: { middlewareMode: true, host: '127.0.0.1' } })
const server = httpServer((req, res) => vite.middlewares(req, res, async () => {
  res.setHeader('content-type', 'text/html')
  res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html lang="sv" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#070e1a;font-family:system-ui}</style></head><body><div id="root"></div><script type="module" src="/e2e/atlas-voice-pilot-entry.tsx"></script></body></html>'))
}))
server.listen(54397, '127.0.0.1', () => console.log('Voice UI fixture: http://127.0.0.1:54397/atlas/rosttest'))
async function close() { server.close(); await vite.close(); process.exit(0) }
process.on('SIGTERM', close); process.on('SIGINT', close)
