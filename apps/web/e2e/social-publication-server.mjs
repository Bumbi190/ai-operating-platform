import {createServer} from 'vite'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
const root=process.cwd()
const server=await createServer({root,configFile:false,appType:'custom',esbuild:{jsx:'automatic'},resolve:{alias:{'@':root}},server:{host:'127.0.0.1',port:54405}})
server.middlewares.use(async(req,res,next)=>{
 if(req.method==='GET'&&['/api/social-content/media','/e2e/reconciliation-photo.jpg'].includes(req.url?.split('?')[0])){const base64=readFileSync(resolve(root,'lib/social-launch/publication/fixtures.test-utils.ts'),'utf8').match(/Buffer[.]from\('([^']+)'/)[1];res.setHeader('content-type','image/jpeg');res.end(Buffer.from(base64,'base64'));return}
 if(req.method==='GET'&&req.url?.split('?')[0]==='/publication'){res.setHeader('content-type','text/html');res.end(await server.transformIndexHtml(req.url,'<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#04101a;color:#edf5fa;font-family:system-ui}*{box-sizing:border-box}button,input,select,textarea{font:inherit}</style></head><body><div id="root"></div><script type="module" src="/e2e/social-publication-entry.tsx"></script></body></html>'));return}next()
})
await server.listen()
