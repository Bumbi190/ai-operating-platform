/* Isolated Nova campaign-planner approval QA. Zero real Omnira API calls. */
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');

const root=path.resolve(__dirname,'..','..','..','..');
const source=fs.readFileSync(
  path.join(root,'apps','web','app','(platform)','nova-actions','marketing','CampaignLaunch.tsx'),
  'utf8'
);
const deps='C:/Users/Andre/Projects/Handlarborsen';
const nm=path.join(deps,'node_modules');

async function main(){
  let temp=null,server=null,browser=null;
  try {
    temp=fs.mkdtempSync(path.join(os.tmpdir(),'nova-marketing-qa-'));
    fs.writeFileSync(path.join(temp,'index.html'),
      '<html><head><meta charset="UTF-8"></head><body><div id="root"></div>'+
      '<script type="module" src="/main.jsx"></script></body></html>');
    fs.writeFileSync(path.join(temp,'CampaignLaunch.tsx'),source);
    fs.writeFileSync(path.join(temp,'main.jsx'),
      'import React from "react"; import {createRoot} from "react-dom/client";'+
      'import {CampaignLaunch} from "./CampaignLaunch.tsx";'+
      'createRoot(document.getElementById("root")).render(React.createElement(CampaignLaunch));');

    const {createServer}=await import(pathToFileURL(require.resolve('vite',{paths:[deps]})).href);
    server=await createServer({
      root:temp,configFile:false,logLevel:'error',
      resolve:{alias:[
        {find:/^react$/,replacement:path.join(nm,'react/index.js')},
        {find:/^react\/jsx-runtime$/,replacement:path.join(nm,'react/jsx-runtime.js')},
        {find:/^react\/jsx-dev-runtime$/,replacement:path.join(nm,'react/jsx-dev-runtime.js')},
        {find:/^react-dom\/client$/,replacement:path.join(nm,'react-dom/client.js')},
      ]},
      server:{host:'127.0.0.1',port:0,strictPort:false},optimizeDeps:{include:[]},
    });
    await server.listen();
    const origin='http://127.0.0.1:'+server.httpServer.address().port;
    const {chromium}=require(require.resolve('playwright',{paths:[deps]}));
    browser=await chromium.launch({headless:true});
    const month='2026-12';
    const runId='11111111-2222-3333-4444-555555555555';
    let posts=0,checks=0,body=null,unhandled=[];
    const ctx=await browser.newContext({serviceWorkers:'block'});
    const page=await ctx.newPage();
    page.on('pageerror',e=>unhandled.push(e.message));
    page.on('request',r=>{if(r.url().startsWith('https://'))unhandled.push('remote request')});
    await page.route('**/api/marketing/**',async route=>{
      const req=route.request();
      if(req.url().includes('/plans/generate')){
        posts++;
        body=req.postDataJSON();
        assert.equal(req.method(),'POST');
        await route.fulfill({
          status:202,contentType:'application/json',
          body:JSON.stringify({run_id:runId,status:'pending',target_month:month}),
        });
      } else if(req.url().includes('/plans?')){
        checks++;
        await route.fulfill({status:404,contentType:'application/json',body:'{}'});
      } else {unhandled.push('Unexpected API endpoint');await route.abort();}
    });
    await page.goto(origin+'/?month='+month,{waitUntil:'domcontentloaded'});
    await page.getByRole('heading',{name:'Beställ en kampanjplan'}).waitFor();
    await page.getByLabel('Månad').waitFor();
    await page.getByRole('button',{name:'Granska uppdrag'}).click();
    assert.equal(posts,0);
    assert.equal(checks,0);
    assert.ok((await page.locator('body').innerText()).includes('Inga sociala inlägg'));
    console.log('PASS no network writes on GET or first review');

    await page.getByRole('button',{name:'Godkänn och köa Campaign Planner'}).click();
    await page.getByText('Verifierat körnings-ID: '+runId).waitFor({timeout:10000});
    assert.deepEqual(body,{target_month:month});
    assert.equal(posts,1);
    assert.equal(checks,1);
    console.log('PASS human approval, existing-plan check, verified 202 run receipt');

    await page.reload({waitUntil:'domcontentloaded'});
    let duplicatePosts=0;
    await page.unroute('**/api/marketing/**');
    await page.route('**/api/marketing/**',async route=>{
      const req=route.request();
      if(req.url().includes('/plans?')){
        await route.fulfill({status:200,contentType:'application/json',
          body:JSON.stringify({plan:{id:'existing'}})});
      }else{duplicatePosts++;await route.abort();}
    });
    await page.getByRole('button',{name:'Granska uppdrag'}).click();
    await page.getByRole('button',{name:'Godkänn och köa Campaign Planner'}).click();
    await page.getByText('En kampanjplan finns redan').waitFor({timeout:10000});
    assert.equal(duplicatePosts,0);
    console.log('PASS existing plan prevents duplicate run');

    assert.deepEqual(unhandled,[]);
    console.log('PASS synthetic browser test, no production requests');
  } finally {
    if(browser)await browser.close();
    if(server)await server.close();
    if(temp)try{fs.rmSync(temp,{recursive:true,force:true})}catch{}
  }
}
main().catch(err=>{console.error('FAIL marketing UI QA',err.stack||err.message);process.exitCode=1});
