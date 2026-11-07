import {createServer as http} from 'node:http'
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {createServer} from 'vite'
const root=process.cwd(),out=resolve(root,'../../.superpowers/sdd/2026-10-31-web-studio-starter-flow/browser-artifacts')
const vite=await createServer({configFile:false,root,appType:'custom',resolve:{alias:[{find:'server-only',replacement:resolve(root,'lib/qa/__stubs__/server-only.ts')},{find:'@',replacement:root}]},server:{middlewareMode:true,host:'127.0.0.1'}})
let fixture
try{fixture=await vite.ssrLoadModule('/e2e/website-starter/fixture.ts')}finally{await vite.close()}
mkdirSync(out,{recursive:true})
writeFileSync(resolve(out,'index.html'),fixture.original.pages[0].html)
writeFileSync(resolve(out,'edited.html'),fixture.edited.pages[0].html)
writeFileSync(resolve(out,'metrics.json'),JSON.stringify(fixture.metrics,null,2))
const escape=s=>s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')
const host='<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atlas starter pipeline test</title><style>body{margin:0}iframe{width:100%;height:100dvh;border:0;display:block}</style><iframe title="Showroom från sparbar plan" sandbox="allow-scripts" srcdoc="'+escape(fixture.isolated)+'"></iframe></html>'
const server=http((req,res)=>{
 res.setHeader('cache-control','no-store')
 const path=new URL(req.url??'/','http://127.0.0.1:54428').pathname
 if(path==='/metrics'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(fixture.metrics))}
 res.setHeader('content-type','text/html; charset=utf-8')
 if(path==='/')return res.end(fixture.original.pages[0].html)
 if(path==='/edited')return res.end(fixture.edited.pages[0].html)
 if(path==='/preview')return res.end(host)
 res.statusCode=404;res.end('Not found')
})
server.listen(54428,'127.0.0.1',()=>console.log('Starter plan and raster fixture ready on loopback'))
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)))
