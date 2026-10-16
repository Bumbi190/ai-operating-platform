import {createServer} from 'vite'
import {resolve} from 'node:path'
const root=process.cwd()
// Load the real PostCSS/Tailwind configuration and global CSS, without DB or providers.
const server=await createServer({root,configFile:false,appType:'custom',esbuild:{jsx:'automatic'},resolve:{alias:[{find:'next/navigation',replacement:resolve(root,'e2e/activity-sheet-navigation.ts')},{find:'next/link',replacement:resolve(root,'e2e/atlas-entry-next.tsx')},{find:'@',replacement:root}]},server:{host:'127.0.0.1',port:54397}})
server.middlewares.use(async(req,res,next)=>{if(req.method==='GET'&&['/build','/settings','/projects/test-project'].includes(new URL(req.url,'http://localhost').pathname)){res.setHeader('content-type','text/html');res.end(await server.transformIndexHtml(req.url,'<!doctype html><html lang="sv" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;width:100%;height:100%}*{box-sizing:border-box}</style></head><body><div id="root"></div><script type="module" src="/e2e/activity-sheet-entry.tsx"></script></body></html>'));return}next()})
await server.listen()
console.log('Activity sheet fixture on127.0.0.1:54397')
