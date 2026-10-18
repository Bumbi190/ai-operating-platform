// Real component with synthetic fixtures only; no account, database or provider.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict')
const web=path.resolve(__dirname,'..')
const esbuild=require(require.resolve('esbuild',{paths:[web]})),{chromium}=require(require.resolve('@playwright/test',{paths:[web]}))
;(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hb-weekly-report-'));let browser,server
 try {
 const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
 import {HandlarborsenWeeklyReport} from './components/platform/vnext/HandlarborsenWeeklyReport';
 import {evaluateCompetitorHistory} from './lib/atlas/project-analytics/handlarborsen-competitor-history-core';
 import common from './components/platform/vnext/HandlarborsenCompetitors.module.css';
 const now=new Date('2026-10-18T03:45:00.000Z'),state=new URL(location.href).searchParams.get('state')||'changed';
 const row=(checkedAt,title,status='metadata_checked')=>({sourceId:'auto1',checkedAt,title,status});
 const rows=state==='empty'?[]:state==='gap'?[row('2026-10-17T10:00:00.000Z',null,'robots_unavailable')]:[row('2026-10-11T10:00:00.000Z','Tidigare sidtitel'),row('2026-10-17T10:00:00.000Z','Observerad titel med långt ord '+ 'x'.repeat(100))];
 const history=state==='unavailable'||state==='disabled'?null:evaluateCompetitorHistory(rows,now);
 createRoot(document.getElementById('root')).render(<main className={common.page}><HandlarborsenWeeklyReport enabled={state!=='disabled'} history={history} asOf={now}/></main>);`
 const bundle=await esbuild.build({stdin:{contents:entry,resolveDir:web,sourcefile:'weekly-report-fixture.tsx',loader:'tsx'},bundle:true,write:false,outdir:tmp,entryNames:'app',jsx:'automatic',tsconfig:path.join(web,'tsconfig.json')})
 for(const file of bundle.outputFiles)fs.writeFileSync(file.path,file.contents)
 const html='<!doctype html><html lang="sv"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>body{margin:0;background:#0b1424;font-family:Arial,system-ui,sans-serif}*{box-sizing:border-box}main{min-height:100vh}summary{cursor:pointer}</style><div id="root"></div><script src="/app.js"></script></html>'
 server=http.createServer((req,res)=>{if(['/app.js','/app.css'].includes(req.url)){res.setHeader('content-type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(path.join(tmp,req.url.slice(1))))}else{res.setHeader('content-type','text/html');res.end(html)}})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[],external=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort()}return route.continue()})
 const base='http://127.0.0.1:'+server.address().port,results=[]
 for(const width of [1440,1024,390,360,320]){
  await page.setViewportSize({width,height:1000});await page.goto(base)
  await page.getByRole('heading',{name:'Veckounderlag',exact:true}).waitFor()
  await page.getByText('Titelskillnader observerade denna vecka',{exact:true}).waitFor()
  await page.getByText('Källor och luckor (6)',{exact:true}).click()
  await page.getByText('Daterat underlag',{exact:true}).click()
  assert(await page.locator('time[datetime="2026-10-11T10:00:00.000Z"]').count()>0)
  assert(await page.locator('a[href="https://www.auto1.com/sv/home"]').count()>0)
  assert.equal(await page.locator('button,form,input').count(),0)
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow '+width)
  if(process.env.HB_WEEKLY_SCREENSHOTS){fs.mkdirSync(process.env.HB_WEEKLY_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.HB_WEEKLY_SCREENSHOTS,'hb-weekly-'+width+'.png'),fullPage:true})}
  results.push({width,datedEvidenceDetailsLinksBounds:'passed'})
 }
 for(const [state,label] of [['empty','Inga sparade kontroller denna vecka.'],['unavailable','Veckounderlaget kunde inte verifieras.'],['disabled','Historikläsning är avstängd.'],['gap','Kunde inte verifieras']]){
  await page.goto(base+'/?state='+state)
  if(state==='gap')await page.getByText('Källor och luckor (6)',{exact:true}).click()
  await page.getByText(label,{exact:false}).first().waitFor()
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'state overflow '+state)
  if(state==='unavailable'||state==='disabled')assert.equal(await page.locator('dl').count(),0)
  results.push({state,status:'passed'})
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[])
 const receipt={kind:'isolated-real-component-fixture-not-authenticated-production',results,browserErrors:errors,externalRequests:external.length,productionWrites:0,status:'passed',finishedAt:new Date().toISOString()}
 if(process.env.HB_WEEKLY_BROWSER_RECEIPT)fs.writeFileSync(process.env.HB_WEEKLY_BROWSER_RECEIPT,JSON.stringify(receipt,null,2)+'\n')
 console.log(JSON.stringify(receipt))
 }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(tmp,{recursive:true,force:true})}
})().catch(error=>{console.error(error.message);process.exitCode=1})
