import {createServer} from 'vite'
import {resolve} from 'node:path'
const root=process.cwd()
const server=await createServer({root,configFile:false,appType:'custom',esbuild:{jsx:'automatic'},css:{postcss:{}},
 resolve:{alias:[{find:'server-only',replacement:resolve(root,'lib/qa/__stubs__/server-only.ts')},{find:'@/lib/supabase/client',replacement:resolve(root,'e2e/reference-picker/boundary.ts')},{find:'@',replacement:root}]},
 server:{host:'127.0.0.1',port:54406,strictPort:true}})
server.middlewares.use(async(req,res,next)=>{
 if(req.method==='GET'&&req.url==='/fixture/concepts'){
  const {fixtureAnalysis,fixtureConcepts}=await server.ssrLoadModule('/e2e/reference-picker/analysis-fixture.ts')
  res.setHeader('content-type','application/json');res.end(JSON.stringify({analysis:fixtureAnalysis,concepts:fixtureConcepts}));return
 }
 if(req.method==='GET'&&req.url?.startsWith('/picker')){
  res.setHeader('content-type','text/html')
  res.end(await server.transformIndexHtml(req.url,'<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/e2e/reference-picker/entry.tsx"></script></body></html>'));return
 }
 next()
})
await server.listen()
console.log('Reference picker fixture:127.0.0.1:54406')
