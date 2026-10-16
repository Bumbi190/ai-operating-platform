import { createServer as httpServer } from 'node:http'
import { resolve } from 'node:path'
import { createServer } from 'vite'
const root = process.cwd()
const server = httpServer()
const vite = await createServer({
  configFile: false,
  root,
  appType: 'custom',
  esbuild: { jsx: 'automatic' },
  css: { postcss: {} },
  resolve: {
    alias: [
      {
        find: 'next/navigation',
        replacement: resolve(root, 'e2e/atlas-overview-messenger-navigation.ts')
      },
      {
        find: 'next/link',
        replacement: resolve(root, 'e2e/atlas-overview-messenger-link.tsx')
      },
      {
        find: 'next/image',
        replacement: resolve(root, 'e2e/atlas-entry-image.tsx')
      },
      {
        find: '@/lib/supabase/client',
        replacement: resolve(root, 'e2e/atlas-overview-messenger-auth.ts')
      },
      {
        find: 'server-only',
        replacement: resolve(root, 'lib/qa/__stubs__/server-only.ts')
      },
      { find: '@', replacement: root }
    ]
  },
  server: { middlewareMode: true, host: '127.0.0.1', hmr: { server } }
})
server.on('request', (req, res) =>
  vite.middlewares(req, res, async () => {
    res.setHeader('content-type', 'text/html')
    res.end(
      await vite.transformIndexHtml(
        req.url,
        '<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}body{margin:0;background:#080e18;color:#dce6f3;font:14px system-ui}nav{display:flex;flex-wrap:wrap;gap:8px;padding:16px}nav button{color:#9eb3c8;background:#152235;border:1px solid #334155;padding:8px;border-radius:8px}main{padding:32px}button,textarea{font:inherit}*{box-sizing:border-box}</style><div id="root"></div><script type="module" src="/e2e/atlas-overview-messenger-entry.tsx"></script></html>'
      )
    )
  })
)
server.on('error', (error) => {
  console.error(error)
  process.exit(1)
})
server.listen(59137, '127.0.0.1')
async function close() {
  server.close()
  await vite.close()
  process.exit(0)
}
process.on('SIGTERM', close)
process.on('SIGINT', close)
