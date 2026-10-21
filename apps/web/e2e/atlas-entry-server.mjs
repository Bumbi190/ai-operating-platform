import { createServer as httpServer } from 'node:http'
import { resolve } from 'node:path'
import { createServer } from 'vite'
const root = process.cwd()
const vite = await createServer({ configFile: false, root, appType: 'custom', esbuild: { jsx: 'automatic' }, css: { postcss: {} }, resolve: { alias: [
{ find: 'next/navigation', replacement: resolve(root, 'e2e/atlas-entry-navigation.ts') },
{ find: 'next/link', replacement: resolve(root, 'e2e/atlas-entry-next.tsx') },
{ find: 'next/image', replacement: resolve(root, 'e2e/atlas-entry-image.tsx') },
{ find: '@/lib/supabase/client', replacement: resolve(root, 'e2e/website-build-fixture-client.ts') },
{ find: 'server-only', replacement: resolve(root, 'lib/qa/__stubs__/server-only.ts') },
{ find: '@', replacement: root },
] }, server: { middlewareMode: true, host: '127.0.0.1' } })
const server = httpServer((req,res) => vite.middlewares(req,res,async()=> { res.setHeader('content-type','text/html'); res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}</style><div id="root"></div><script type="module" src="/e2e/atlas-entry.tsx"></script></html>')) }))
server.listen(54391,'127.0.0.1')
async function close() { server.close(); await vite.close(); process.exit(0) }
process.on('SIGTERM',close); process.on('SIGINT',close)
