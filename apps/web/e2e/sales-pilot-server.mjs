import {createServer} from 'vite'
const root=process.cwd()
const server=await createServer({root,configFile:false,appType:'custom',define:{'process.env':{}},esbuild:{jsx:'automatic'},resolve:{alias:{'@':root}},server:{host:'127.0.0.1',port:54417}})
server.middlewares.use(async(req,res,next)=>{
 if(req.method==='GET'&&req.url?.split('?')[0]==='/api/sales/replies'){res.setHeader('content-type','application/json');res.end(JSON.stringify({jobs:[],drafts:[],sendingEnabled:false}));return}
 if(req.method==='GET'&&req.url?.split('?')[0]==='/sales'){
  res.setHeader('content-type','text/html');res.end(await server.transformIndexHtml(req.url,'<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#080f19;color:#edf5fa;font-family:system-ui}*{box-sizing:border-box}button,input,select,textarea{font:inherit}</style></head><body><div id="root"></div><script type="module" src="/e2e/sales-pilot-entry.tsx"></script></body></html>'));return
 }next()
})
await server.listen()
