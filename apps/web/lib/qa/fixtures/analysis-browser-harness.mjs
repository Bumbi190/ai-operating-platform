import { createServer as createHttpServer } from 'node:http'
import { createServer } from 'vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const web = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
export async function startAnalysisBrowserHarness(draft) {
  const records = new Map(),
    calls = [],
    view = (d) => ({ draft: d, supersededBy: null, stale: false, applicability: 'current' })
  const root = '/projects/handlarborsen/atlas/analysis-drafts'
  const selector = { ruleId: draft.ruleId, ruleVersion: draft.ruleVersion, expectedEvidenceHash: draft.evidenceHash }
  let url, release
  const entry = `
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {AnalysisDraftSave} from '/components/platform/vnext/AnalysisDraftSave.tsx';
 import {AnalysisDraftHistory} from '/components/platform/vnext/AnalysisDraftHistory.tsx';
 globalThis.React=React;
 const original=window.fetch.bind(window);let scenario='ok';
 window.fetch=(input,init={})=>{const u=new URL(typeof input==='string'?input:input.url,location.href);if(u.origin!==location.origin)return Promise.reject(Error('external egress denied'));if(u.pathname.startsWith('/api/'))init={...init,headers:{...init.headers,'x-fixture-scenario':scenario}};return original(input,init)};
 const data=await(await fetch('/fixture/data?path='+encodeURIComponent(location.pathname+location.search))).json();
 function App(){
 const [wide,setWide]=React.useState(false);
 return React.createElement(React.Fragment,null,
 React.createElement('aside',{'aria-label':'Lokala testkontroller'},React.createElement('label',null,'Testfall ',React.createElement('select',{defaultValue:'ok',onChange:e=>scenario=e.target.value},...Object.entries({ok:'Normalt svar',conflict:'Ändrat underlag',unavailable:'Lagring otillgänglig',lost:'Förlorat svar',pending:'Fördröjt svar'}).map(([v,t])=>React.createElement('option',{key:v,value:v},t)))),React.createElement('button',{onClick:()=>fetch('/fixture/release',{method:'POST'})},'Släpp fördröjt svar'),React.createElement('button',{onClick:async()=>{await fetch('/fixture/seed',{method:'POST'});location.href='${root}'}},'Visa 21 sparade utkast'),React.createElement('button',{onClick:()=>setWide(!wide)},wide?'Smal vy 360 px':'Bred vy 1440 px')),
 React.createElement(Frame))
 }
 function Frame(){return React.createElement('main',{style:{padding:'16px'}},React.createElement('a',{href:'/projects/handlarborsen',target:'_top'},'Till projektet'),React.createElement('h1',null,data.showSave?'Atlas Intelligence':'Sparade analysutkast'),data.showSave?React.createElement(React.Fragment,null,React.createElement('p',null,data.observation),React.createElement(AnalysisDraftSave,{slug:'handlarborsen',selector:data.selector})):null,React.createElement(AnalysisDraftHistory,{slug:'handlarborsen',items:data.items,nextCursor:data.nextCursor}))}
 createRoot(document.getElementById('root')).render(React.createElement(location.pathname==='/fixture/frame'?Frame:App));
 `
  const vite = await createServer({
    root: web,
    configFile: false,
    css: { postcss: {} },
    resolve: { alias: { '@': web } },
    esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true, hmr: false },
    plugins: [
      {
        name: 'analysis-browser-fixture',
        resolveId(id) {
          if (id === 'virtual:analysis-harness') return '\0analysis-harness'
        },
        load(id) {
          if (id === '\0analysis-harness') return entry
        },
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const u = new URL(req.url, 'http://127.0.0.1')
            calls.push(u.pathname)
            const send = (status, data) => {
              res.statusCode = status
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(data))
            }
            if (u.pathname.startsWith('/fixture/') || u.pathname.startsWith('/api/')) {
              if (u.pathname === '/fixture/release') {
                release?.()
                return send(200, { ok: true })
              }
              if (u.pathname === '/fixture/seed') {
                records.clear()
                for (let n = 1; n <= 21; n++) {
                  const id = '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
                  records.set(id, {
                    ...structuredClone(draft),
                    id,
                    createdBy: '00000000-0000-4000-8000-000000000010',
                    createdAt: '2026-10-12T11:00:00.000000Z',
                  })
                }
                return send(200, { ok: true })
              }
              if (u.pathname === '/fixture/data') {
                let path = u.searchParams.get('path') ?? '/projects/handlarborsen'
                if (path.startsWith('/fixture/frame'))
                  path = new URL(path, 'http://local').searchParams.get('path') ?? '/projects/handlarborsen'
                const p = new URL(path, 'http://local'),
                  id = p.pathname.startsWith(root + '/') ? p.pathname.slice(root.length + 1) : null
                const sorted = [...records.values()].sort(
                    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
                  ),
                  cursor = p.searchParams.get('cursor'),
                  items = id
                    ? [records.get(id)].filter(Boolean)
                    : sorted.filter((d) => !cursor || d.id < cursor).slice(0, 20)
                const last = items.at(-1),
                  nextCursor = !id && last && sorted.some((d) => d.id < last.id) ? last.id : null
                return send(200, {
                  items: items.map(view),
                  nextCursor,
                  showSave: p.pathname === '/projects/handlarborsen',
                  selector,
                  observation: draft.insight.observation,
                })
              }
              if (u.pathname.startsWith('/api/') && req.method === 'POST') {
                let body = ''
                for await (const chunk of req) body += chunk
                if (body.length > 4096) return send(400, { error: 'invalid_request' })
                const supplied = JSON.parse(body)
                if (JSON.stringify(supplied) !== JSON.stringify(selector)) return send(409, { error: 'conflict' })
                const scenario = req.headers['x-fixture-scenario'] ?? 'ok'
                if (scenario === 'conflict') return send(409, { error: 'conflict' })
                if (scenario === 'unavailable') return send(503, { error: 'unavailable' })
                const existing = [...records.values()].find((d) => d.evidenceHash === draft.evidenceHash),
                  id = existing?.id ?? '00000000-0000-4000-8000-000000000001'
                if (!existing)
                  records.set(id, {
                    ...structuredClone(draft),
                    id,
                    createdBy: '00000000-0000-4000-8000-000000000010',
                    createdAt: '2026-10-12T11:00:00.000000Z',
                  })
                if (scenario === 'lost') {
                  res.destroy()
                  return
                }
                if (scenario === 'pending') await new Promise((r) => (release = r))
                return send(existing ? 200 : 201, { id, created: !existing, href: root + '/' + id })
              }
              if (u.pathname !== '/fixture/frame') return send(404, { error: 'not_found' })
            }
            if (u.pathname === '/fixture/frame' || u.pathname.startsWith('/projects/')) {
              const html =
                '<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atlas P1 · lokal verifiering</title><style>body{margin:0;background:#09090b;color:#f4f4f5;font:16px/1.6 system-ui}a{color:inherit}button,select{font:inherit;min-height:44px;margin:4px;padding:6px}aside{padding:12px}iframe{display:block}</style></head><body><div id="root"></div><script type="module" src="/@id/virtual:analysis-harness"></script></body></html>'
              res.setHeader('Content-Type', 'text/html')
              res.setHeader(
                'Content-Security-Policy',
                "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self'; img-src 'self' data:",
              )
              res.end(await server.transformIndexHtml(u.pathname, html))
              return
            }
            next()
          })
        },
      },
    ],
  })
  const server=createHttpServer(vite.middlewares)
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  url = 'http://127.0.0.1:' + server.address().port
  return {
    url,
    records,
    calls,
    allows: (target) => new URL(target, url).origin === new URL(url).origin,
    close: async () => { await new Promise(resolve=>server.close(resolve)); await vite.close() },
  }
}
