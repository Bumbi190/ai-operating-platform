import {createServer} from 'vite'
import {resolve} from 'node:path'
import {readFileSync} from 'node:fs'
const root=process.cwd()
const server=await createServer({root,configFile:false,appType:'custom',esbuild:{jsx:'automatic'},resolve:{alias:{'@':root}},css:{postcss:{}},server:{host:'127.0.0.1',port:54406}})
server.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,'http://localhost')
 if(req.method==='GET'&&url.pathname==='/api/social-content/media'){
  if(url.searchParams.get('missing')==='1'||req.headers.referer?.includes('scenario=missing_media')){res.statusCode=404;res.end();return}
  const base64=readFileSync(resolve(root,'lib/social-launch/publication/fixtures.test-utils.ts'),'utf8').match(/Buffer[.]from\('([^']+)'/)[1]
  res.setHeader('content-type','image/jpeg');res.end(Buffer.from(base64,'base64'));return
 }
 if(req.method==='GET'&&url.pathname==='/scheduling'){
  res.setHeader('content-type','text/html');res.end(await server.transformIndexHtml(req.url,'<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#06121d;color:#edf5fa;font-family:system-ui}*{box-sizing:border-box}main{max-width:1120px;margin:40px auto;padding:0 18px}button,input,textarea{font:inherit}h1{font-size:24px}</style></head><body><div id="root"></div><script type="module" src="/e2e/social-scheduling-entry.tsx"></script></body></html>'));return
 }
 next()
})
await server.listen()
