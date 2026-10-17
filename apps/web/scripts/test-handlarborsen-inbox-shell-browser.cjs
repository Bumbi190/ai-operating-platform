// Isolated UI fixture: real components/provider, synthetic HTTP counts, no account or live database access.
// Uses installed @playwright/test and Vite's existing esbuild; downloads and installs nothing.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const web=path.resolve(__dirname,'..'),root=path.resolve(web,'../..');
const esbuild=require(require.resolve('esbuild',{paths:[web]}));
const {chromium}=require(require.resolve('@playwright/test',{paths:[web]}));
(async()=>{
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hb-shell-browser-'));
let browser,server;
try{
const aliases={
'next/link':'import React from "react";export default function Link({children,...props}){return <a {...props}>{children}</a>}',
'next/image':'import React from "react";export default function Image({src,alt,width,height}){return <img src={src} alt={alt} width={width} height={height}/>} ',
'next/navigation':'export const useRouter=()=>({push(){},refresh(){}})',
'@/lib/supabase/client':'export const createClient=()=>({auth:{signOut:async()=>{}}})',
'@/lib/atlas/runtime':'export const useAtlas=()=>({})',
'@/components/platform/os/CommandPaletteHost':'export function openCommandPalette(){}',
};
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import {AtlasInboxProvider} from './components/platform/vnext/AtlasInboxProvider';
import {AtlasInboxNotice} from './components/platform/vnext/AtlasInboxNotice';
import {ShellTopBar} from './components/platform/vnext/ShellTopBar';
import {AtlasMobileNav} from './components/platform/vnext/AtlasMobileNav';
const audience=new URL(location.href).searchParams.get('mode')||'owner';
window.receipt=()=>window.dispatchEvent(new Event('omnira:competitor-inbox-receipt'));
createRoot(document.getElementById('root')).render(<AtlasInboxProvider audience={audience}>
<div className="desktop"><ShellTopBar pendingApprovals={2}/></div><div className="mobile"><AtlasMobileNav/></div>
<button id="outside">Utanför</button></AtlasInboxProvider>);`;
const bundle=await esbuild.build({stdin:{contents:entry,resolveDir:web,sourcefile:'hb-smoke.tsx',loader:'tsx'},bundle:true,write:false,outdir:tmp,entryNames:'app',jsx:'automatic',tsconfig:path.join(web,'tsconfig.json'),plugins:[{name:'test-shims',setup(build){
build.onResolve({filter:new RegExp('^(next/|@/)')},args=>aliases[args.path]?{path:args.path,namespace:'shim'}:undefined);
build.onLoad({filter:/.*/,namespace:'shim'},args=>({contents:aliases[args.path],loader:'tsx',resolveDir:web}));
}}]});
for(const file of bundle.outputFiles)fs.writeFileSync(file.path,file.contents);
const html='<!doctype html><html lang="sv"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><style>body{margin:0;background:#030516;color:white;font-family:Arial}*{box-sizing:border-box}a{color:inherit}button{font:inherit}.mobile{display:none}#outside{margin:340px 20px}@media(max-width:1023px){.desktop{display:none}.mobile{display:block}}</style><div id="root"></div><script src="/app.js"></script></html>';
server=http.createServer((req,res)=>{if(req.url.startsWith('/app.')){const f=path.join(tmp,req.url.slice(1));res.setHeader('content-type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(f));}else if(req.url.startsWith('/atlas/')){res.statusCode=404;res.end();}else{res.setHeader('content-type','text/html');res.end(html);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
browser=await chromium.launch({headless:true});
const page=await browser.newPage();page.setDefaultTimeout(8000);page.on('pageerror',error=>console.error('Fixture page error',error.message));let unread=2,total=3,status=200,calls=0;
await page.route('**/api/**',route=>{calls++;return route.fulfill({status,contentType:'application/json',body:JSON.stringify(status===200?{status:'ok',unreadCount:unread,totalCount:total}:{status:'forbidden'})});});
const results=[];
for(const [width,height,mode]of [[1440,1000,'owner'],[1024,800,'owner'],[390,844,'collaborator'],[360,800,'collaborator'],[320,700,'collaborator']]){
await page.setViewportSize({width,height});await page.goto(url+'/?mode='+mode);
const control=page.locator('summary[aria-label="Atlas inkorg, 2 olästa"]:visible');await control.waitFor();
await control.click();const panel=page.getByRole('region',{name:'Atlas konkurrentinkorg'});await panel.waitFor();
await panel.getByText('2 olästa av 3 sparade notiser.').waitFor();
if(process.env.HB_INBOX_SHELL_SCREENSHOTS)await page.screenshot({path:path.join(process.env.HB_INBOX_SHELL_SCREENSHOTS,'hb-inbox-'+width+'.png')});
const box=await panel.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1,'panel outside viewport '+width);
assert.equal(await panel.getByRole('link').getAttribute('href'),mode==='owner'?'/projects/handlarborsen/competitors#hb-atlas-inbox-title':'/organization/projects/handlarborsen/competitors#hb-atlas-inbox-title');
await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
await control.click();await page.locator('#outside').click();await panel.waitFor({state:'hidden'});
results.push({width,height,mode,openEscapeOutsideLinkAndBounds:'pass'});
}
unread=0;total=0;await page.evaluate(()=>window.receipt());await page.locator('summary[aria-label="Atlas inkorg, 0 olästa"]:visible').waitFor();await page.locator('summary[aria-label="Atlas inkorg, 0 olästa"]:visible').click();await page.getByRole('region',{name:'Atlas konkurrentinkorg'}).getByText('Inga notiser har skapats för ditt konto.').waitFor();results.push({verifiedEmpty:'pass'});
status=503;await page.evaluate(()=>window.receipt());await page.getByRole('region',{name:'Atlas konkurrentinkorg'}).getByText('Inkorgen kunde inte läsas. Antalet olästa är okänt.').waitFor();results.push({failedReadIsUnknown:'pass'});
status=403;await page.evaluate(()=>window.receipt());await page.locator('summary[aria-label^="Atlas inkorg"]:visible').waitFor({state:'hidden'});results.push({revocationHidesNotice:'pass'});
const receipt={kind:'isolated-browser-fixture-not-production-auth',browser:'chromium',results,requests:calls,productionWrites:0};
if(process.env.HB_INBOX_SHELL_RECEIPT)fs.writeFileSync(process.env.HB_INBOX_SHELL_RECEIPT,JSON.stringify(receipt,null,2)+String.fromCharCode(10));
console.log(JSON.stringify(receipt));
}finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
