import {createServer} from 'vite'
import {resolve} from 'node:path'
const root=process.cwd(),boundary=resolve(root,'e2e/atlas-studio-ui-boundaries.tsx')
const server=await createServer({root,configFile:false,appType:'custom',esbuild:{jsx:'automatic'},css:{postcss:{}},resolve:{alias:[
 {find:'@/lib/atlas/runtime',replacement:boundary},
 {find:'@/lib/supabase/client',replacement:boundary},
 {find:'@/components/platform/vnext/AtlasBuildSurface',replacement:boundary},
 {find:'next/navigation',replacement:boundary},
 {find:'@',replacement:root},
]},server:{host:'127.0.0.1',port:54396}})
server.middlewares.use(async(req,res,next)=>{
 if(req.method==='GET'&&req.url?.startsWith('/build')){res.setHeader('content-type','text/html');res.end(await server.transformIndexHtml(req.url,'<!doctype html><html lang="sv" class="dark" data-motion="reduce"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;width:100%;height:100%;font-family:Inter,system-ui,sans-serif}button,input,select,textarea{font:inherit}*{box-sizing:border-box}</style></head><body><div id="root"></div><script type="module" src="/e2e/atlas-studio-ui-entry.tsx"></script></body></html>'));return}next()
})
await server.listen()
console.log('Atlas UI fixture on 127.0.0.1:54396')
