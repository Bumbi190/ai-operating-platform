// Isolated real-component fixture; synthetic state, no live account/database/provider.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const web=path.resolve(__dirname,'..');
const esbuild=require(require.resolve('esbuild',{paths:[web]})),{chromium}=require(require.resolve('@playwright/test',{paths:[web]}));
(async()=>{
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hb-readiness-'));let browser,server;
try{
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import {HandlarborsenWatchReadiness} from './components/platform/vnext/HandlarborsenWatchReadiness';
const unavailable=new URL(location.href).searchParams.has('unavailable');
createRoot(document.getElementById('root')).render(<main><HandlarborsenWatchReadiness result={unavailable?{status:'unavailable'}:{status:'ok',stage:'readiness_only',checkedAt:'2026-10-17T18:00:00Z',globalStop:'clear',projectStop:'clear',budget:'project_missing',enforcement:'advisory',executionAllowed:false,automaticActive:false,pending:[]}}/></main>);`;
const bundle=await esbuild.build({stdin:{contents:entry,resolveDir:web,sourcefile:'readiness-smoke.tsx',loader:'tsx'},bundle:true,write:false,outdir:tmp,entryNames:'app',jsx:'automatic',tsconfig:path.join(web,'tsconfig.json')});
for(const file of bundle.outputFiles)fs.writeFileSync(file.path,file.contents);
const html='<!doctype html><html lang="sv"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><style>body{margin:0;background:#030516;color:white;font-family:Arial}*{box-sizing:border-box}main{max-width:1200px;margin:auto;padding:16px}p,li,dd{line-height:1.55}summary{cursor:pointer}dd{margin:0}ul{padding-left:24px}</style><div id="root"></div><script src="/app.js"></script></html>';
server=http.createServer((req,res)=>{if(req.url.startsWith('/app.')){res.setHeader('content-type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(path.join(tmp,req.url.slice(1))));}else{res.setHeader('content-type','text/html');res.end(html)}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
const url='http://127.0.0.1:'+server.address().port,results=[];
for(const width of [1440,1024,390,360,320]){
await page.setViewportSize({width,height:900});await page.goto(url);
await page.getByRole('heading',{name:'Inför återkommande konkurrentbevakning'}).waitFor();
await page.getByText('Projektbudget saknas',{exact:true}).waitFor();
await page.getByText('Automatisk bevakning är avstängd.',{exact:true}).waitFor();
await page.getByText('Återstår inför aktivering',{exact:true}).click();
await page.getByText('Separat godkännande av körschema och produktionsaktivering.',{exact:true}).waitFor();
assert.equal(await page.locator('button,form,input').count(),0);
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow '+width);
if(process.env.HB_READINESS_SCREENSHOTS)await page.screenshot({path:path.join(process.env.HB_READINESS_SCREENSHOTS,'hb-readiness-'+width+'.png'),fullPage:true});
results.push({width,disabledMissingBudgetDetailsBounds:'pass'});
}
await page.goto(url+'/?unavailable=1');await page.getByRole('status').filter({hasText:'Driftstatus kunde inte verifieras.'}).waitFor();
assert.equal(await page.locator('dl').count(),0);assert.deepEqual(errors,[]);
console.log(JSON.stringify({kind:'isolated-browser-fixture-not-authenticated-production',results,unknownState:'pass',browserErrors:errors,productionWrites:0}));
}finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exit(1)});
