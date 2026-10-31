import { createServer as httpServer } from 'node:http'
import { resolve } from 'node:path'
import { createServer } from 'vite'
const root = process.cwd()
const port=process.env.ATLAS_STUDIO_FIXTURE==='1'?54392:54390
process.env.ANTHROPIC_API_KEY='fixture-key'
process.env.PLATFORM_OPERATOR_EMAILS='fixture-operator@example.test'
const vite = await createServer({ configFile: false, root, appType: 'custom', esbuild: { jsx: 'automatic' }, css: { postcss: {} }, resolve: { alias: [
  { find: '@anthropic-ai/sdk',replacement:resolve(root,'e2e/atlas-build-chat-provider.ts') },
  { find: '@/lib/supabase/server',replacement:resolve(root,'e2e/atlas-build-chat-auth.ts') },
  { find: '@/lib/cost/governed-spend',replacement:resolve(root,'e2e/atlas-build-chat-spend.ts') },
  { find: '@/lib/ai/runner', replacement: resolve(root, 'e2e/website-build-fixture-provider.ts') },
  { find: 'next/image', replacement: resolve(root,'e2e/atlas-entry-image.tsx') },
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
    const url = new URL(req.url, 'http://127.0.0.1:'+port)
    if(url.pathname.startsWith('/__fixture/studio-auth/')){
      const auth=await vite.ssrLoadModule('/e2e/website-build-fixture-db.ts');auth.setFixtureSignedIn(url.pathname.endsWith('/signed-in'));res.end('{}');return
    }
    // Execute the real Next server entries; only Next's redirect/notFound effects
    // are adapted to this localhost HTTP harness. Ownership stays in the loader.
    const legacyEntry=url.pathname.match(/^\/projects\/([^/]+)\/build(?:\/([0-9a-f-]{36}))?$/)
    if(process.env.ATLAS_STUDIO_FIXTURE==='1'&&(url.pathname==='/build'||legacyEntry)){
      const file=legacyEntry?'/app/(platform)/projects/[slug]/build/'+(legacyEntry[2]?'[sessionId]/':'')+'page.tsx':'/app/(platform)/build/page.tsx'
      const entry=await vite.ssrLoadModule(file),query={};for(const key of url.searchParams.keys()){const values=url.searchParams.getAll(key);query[key]=values.length>1?values:values[0]}
      try{await entry.default(legacyEntry?{params:{slug:decodeURIComponent(legacyEntry[1]),sessionId:legacyEntry[2]}}:{searchParams:Promise.resolve(query)})}
      catch(error){if(error.fixtureRedirect){res.writeHead(307,{location:error.fixtureRedirect});res.end();return}if(error.fixtureStatus===404){res.statusCode=404;res.end('Not found');return}throw error}
    }
    if(url.pathname==='/__fixture/studio-metrics'){
      const fixture=await vite.ssrLoadModule('/e2e/website-build-fixture-db.ts');fixture.createAdminClient();
      const sql=await vite.ssrLoadModule('/lib/website-build/test-db.ts');
      res.setHeader('content-type','application/json');res.end(JSON.stringify({projects:Number(sql.testSql("select count(*) from projects where owner_id='"+sql.TEST_PRINCIPAL.userId+"';"))}));return;
    }
    if(url.pathname==='/__fixture/studio-billing'){
      const spend=await vite.ssrLoadModule('/e2e/atlas-build-chat-spend.ts');res.setHeader('content-type','application/json');res.end(JSON.stringify(spend.readFixtureBilling()));return;
    }
    const mockupRoute=url.pathname.match(/^\/api\/website-build-plans\/([0-9a-f-]{36})\/mockups\/(approve|[0-9a-f-]{36})$/)
    if(mockupRoute){const api=await vite.ssrLoadModule('/lib/website-build/planning/mockup-api.ts'),chunks=[];for await(const chunk of req)chunks.push(chunk);const action=mockupRoute[2]==='approve'?'approve':'get',response=await api.websiteMockupApi(action,new Request(url,{method:req.method,headers:req.headers,body:req.method==='POST'?Buffer.concat(chunks):undefined}),{planId:mockupRoute[1],mockupId:action==='get'?mockupRoute[2]:undefined});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return}
    if(url.pathname.startsWith('/api/website-build/studio')){
      const api=await vite.ssrLoadModule('/lib/website-build/studio/api.ts');const chunks=[];for await(const chunk of req){chunks.push(chunk);if(chunks.reduce((n,c)=>n+c.length,0)>70000)throw Error('Fixture body too large')}
      const action=url.pathname.endsWith('/budget')?'budget':url.pathname.endsWith('/workspace-request')?'workspace-request':req.method==='POST'?'ensure':'get';
      const response=await api.studioApi(action,new Request(url,{method:req.method,headers:req.headers,body:req.method==='POST'?Buffer.concat(chunks):undefined}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const lifecycle=url.pathname.match(/^\/api\/projects\/by-id\/([0-9a-f-]{36})\/lifecycle$/)
    if(lifecycle){
      const api=await vite.ssrLoadModule('/lib/project/lifecycle/api.ts'),chunks=[];for await(const chunk of req){chunks.push(chunk);if(chunks.reduce((n,c)=>n+c.length,0)>70000)throw Error('Fixture body too large')}
      const response=await api.lifecycleApi(req.method==='POST'?'change':'get',new Request(url,{method:req.method,headers:req.headers,body:req.method==='POST'?Buffer.concat(chunks):undefined}),lifecycle[1]);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return
    }
    if (url.pathname.startsWith('/__fixture/')) {
      if(url.pathname.startsWith('/__fixture/step/'))console.log('[fixture-step] admitted '+url.pathname)
      const fixture = await vite.ssrLoadModule('/e2e/website-build-fixture.ts')
      const parts = url.pathname.split('/')
      const result = parts[2] === 'setup-conversation' ? await fixture.setupConversation({missingBuilder:url.searchParams.get('builder')==='missing',historical:url.searchParams.get('historical')==='1',multiple:url.searchParams.get('multiple')==='1'}) : parts[2] === 'conversation' ? await fixture.loadConversation(parts[3],url.searchParams.get('viewSession')??undefined) : parts[2] === 'setup' ? await fixture.setup() : parts[2] === 'session' ? { session: await fixture.snapshot(parts[3]),...await fixture.conversation(await fixture.snapshot(parts[3])), userId: '20000000-0000-4000-8000-000000000001', projectSlug: 'test-project', brief: 'En hemsida för vårt svenska café' } : await fixture.step(parts[3], parts[4])
      if(url.pathname.startsWith('/__fixture/step/'))console.log('[fixture-step] completed '+url.pathname)
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
    vite.middlewares(req, res, async () => { res.setHeader('content-type', 'text/html'); res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html lang="sv" class="dark" data-motion="reduce"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#0c121b;font-family:system-ui;'+(process.env.ATLAS_STUDIO_FIXTURE==='1'?'padding:0':'padding:12px')+'}#root{'+(process.env.ATLAS_STUDIO_FIXTURE==='1'?'height:100dvh;width:100%':'max-width:1600px;margin:auto')+'}</style><div id="root"></div><script type="module" src="'+(process.env.ATLAS_STUDIO_FIXTURE==='1'?'/e2e/atlas-builder-studio-entry.tsx':'/e2e/website-build-entry.tsx')+'"></script></html>')) })
  } catch (error) { console.error(error); res.statusCode = 500; res.end(JSON.stringify({ error: String(error) })) }
})
// Prepare the real SQL fixture before the readiness URL reports success.
// Cold module compilation/database bootstrap is server startup, not UI latency.
await vite.ssrLoadModule('/e2e/website-build-fixture.ts')
server.listen(port, '127.0.0.1')
async function close() { server.close(); await vite.close(); process.exit(0) }
process.on('SIGTERM', close); process.on('SIGINT', close)

