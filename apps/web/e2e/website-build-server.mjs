import { createServer as httpServer } from 'node:http'
import { resolve } from 'node:path'
import { createServer } from 'vite'
const root = process.cwd()
process.env.ANTHROPIC_API_KEY='fixture-key'
process.env.PLATFORM_OPERATOR_EMAILS='fixture-operator@example.test'
const vite = await createServer({ configFile: false, root, appType: 'custom', esbuild: { jsx: 'automatic' }, css: { postcss: {} }, resolve: { alias: [
  { find: '@anthropic-ai/sdk',replacement:resolve(root,'e2e/atlas-build-chat-provider.ts') },
  { find: '@/lib/supabase/server',replacement:resolve(root,'e2e/atlas-build-chat-auth.ts') },
  { find: '@/lib/cost/governed-spend',replacement:resolve(root,'e2e/atlas-build-chat-spend.ts') },
  { find: '@/lib/ai/runner', replacement: resolve(root, 'e2e/website-build-fixture-provider.ts') },
  { find: 'next/link', replacement: resolve(root,'e2e/atlas-entry-next.tsx') },
  { find: 'next/navigation', replacement: resolve(root, 'e2e/website-build-fixture-navigation.ts') },
  { find: '@/lib/supabase/client', replacement: resolve(root, 'e2e/website-build-fixture-client.ts') },
  { find: '@/lib/supabase/admin', replacement: resolve(root, 'e2e/website-build-fixture-db.ts') },
  { find: '@/lib/auth/project-access', replacement: resolve(root, 'e2e/website-build-fixture-db.ts') },
  { find: 'server-only', replacement: resolve(root, 'lib/qa/__stubs__/server-only.ts') },
  { find: '@', replacement: root },
] }, server: { middlewareMode: true, host: '127.0.0.1' } })
const server = httpServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:54390')
    if (url.pathname.startsWith('/__fixture/')) {
      const fixture = await vite.ssrLoadModule('/e2e/website-build-fixture.ts')
      const parts = url.pathname.split('/')
      const result = parts[2] === 'setup' ? await fixture.setup() : parts[2] === 'session' ? { session: await fixture.snapshot(parts[3]),...await fixture.conversation(await fixture.snapshot(parts[3])), userId: '20000000-0000-4000-8000-000000000001', projectSlug: 'test-project', brief: 'En hemsida för vårt svenska café' } : await fixture.step(parts[3], parts[4])
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(result)); return
    }
    if(url.pathname==='/api/website-build-readiness'){
      const api=await vite.ssrLoadModule('/lib/website-build/connections/api.ts'),response=await api.websiteBuildReadinessApi(new Request(url,{headers:req.headers}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return
    }
    if(url.pathname==='/api/chat'){
      const api=await vite.ssrLoadModule('/app/api/chat/route.ts')
      const chunks=[];for await(const chunk of req){chunks.push(chunk);if(chunks.reduce((sum,c)=>sum+c.length,0)>70000)throw Error('Fixture chat body too large')}
      const response=await api.POST(new Request(url,{method:req.method,headers:req.headers,body:Buffer.concat(chunks)}))
      res.writeHead(response.status,Object.fromEntries(response.headers))
      res.end(Buffer.from(await response.arrayBuffer()));return
    }
    if (url.pathname.startsWith('/api/website-builds')) {
      const api = await vite.ssrLoadModule('/lib/website-build/api.ts'), parts = url.pathname.split('/')
      const chunks = []; for await (const chunk of req) { chunks.push(chunk); if (chunks.reduce((sum, c) => sum + c.length, 0) > 70_000) throw Error('Fixture body too large') }
      const action = !parts[3] ? 'create' : parts[4] === 'feedback' ? 'feedback' : parts[4] === 'control' ? 'control' : parts[4] === 'revisions' ? (parts[6] === 'export' ? 'export' : 'artifact') : 'get'
      const response = await api.websiteBuildApi(action, new Request(url, { method: req.method, headers: req.headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }), { sessionId: parts[3], revisionId: parts[5] })
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return
    }
    vite.middlewares(req, res, async () => { res.setHeader('content-type', 'text/html'); res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html lang="sv" class="dark" data-motion="reduced"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#0c121b;padding:12px;font-family:system-ui}#root{max-width:1600px;margin:auto}</style><div id="root"></div><script type="module" src="/e2e/website-build-entry.tsx"></script></html>')) })
  } catch (error) { console.error(error); res.statusCode = 500; res.end(JSON.stringify({ error: String(error) })) }
})
server.listen(54390, '127.0.0.1')
async function close() { server.close(); await vite.close(); process.exit(0) }
process.on('SIGTERM', close); process.on('SIGINT', close)