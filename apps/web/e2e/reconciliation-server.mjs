import {createServer} from 'vite';
const server=await createServer({root:process.cwd(),configFile:false,appType:'custom',esbuild:{jsx:'automatic'},css:{postcss:{}},resolve:{alias:{'@':process.cwd()}},server:{host:'127.0.0.1',port:54429}});
server.middlewares.use(async(req,res,next)=>{if(req.url.startsWith('/reconciliation')){res.setHeader('content-type','text/html');res.end(await server.transformIndexHtml(req.url,'<!doctype html><html lang="sv"><body><div id="root"></div><script type="module" src="/e2e/reconciliation-entry.tsx"></script></body></html>'));return}next()});
await server.listen();
