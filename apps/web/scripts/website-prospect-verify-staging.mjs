// Static offline smoke verification of the exact Vercel-ready synthetic folder.
import {chromium} from '@playwright/test'
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {createServer} from 'node:http'
import {resolve,join,sep} from 'node:path'

const argv=process.argv.slice(2),p=argv.indexOf('--staging')
if(!argv.includes('--offline-synthetic-only')||p<0||!argv[p+1])throw Error('OFFLINE_SYNTHETIC_PATH_REQUIRED')
const root=resolve(argv[p+1]),receipt=JSON.parse(readFileSync(join(root,'staging-receipt.json'),'utf8'))
if(receipt.mode!=='offline-synthetic-only'||receipt.published!==false||receipt.noindex!==true)throw Error('UNSAFE_STAGING_RECEIPT')
const directory=join(root,'dist'),index=readFileSync(join(directory,'index.html'))
if(!index.toString('utf8').includes('SYNTETISKT TEST')||!index.toString('utf8').includes('noindex'))throw Error('NOT_REVIEWABLE_SYNTHETIC')
const server=createServer((req,res)=>{
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return}
 let pathname
 try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname)}catch{res.writeHead(400);res.end();return}
 const name=pathname==='/'?'index.html':pathname.replace(/^\//,'')
 const file=resolve(directory,name)
 if((file!==join(directory,'index.html')&&!file.startsWith(directory+sep))||!existsSync(file)){res.writeHead(404);res.end();return}
 const data=readFileSync(file),ext=name.split('.').at(-1),types={html:'text/html; charset=utf-8',webp:'image/webp',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',css:'text/css',js:'application/javascript',txt:'text/plain'}
 res.writeHead(200,{'content-type':types[ext]||'application/octet-stream','x-robots-tag':'noindex, nofollow, noarchive'})
 res.end(req.method==='HEAD'?undefined:data)
})
await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done)})
const base='http://127.0.0.1:'+server.address().port
const chrome=process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':undefined
let browser,report={mode:'offline-synthetic-only',published:false,views:[],failedRequests:[],sourceSha256:receipt.sourceArchiveSha256,staticIndexSha256:createHash('sha256').update(index).digest('hex'),completed:false}
try{
 browser=await chromium.launch({headless:true,...(chrome&&existsSync(chrome)?{executablePath:chrome}:{})})
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(String(e).slice(0,100)))
  page.on('requestfailed',r=>report.failedRequests.push({url:new URL(r.url()).pathname,error:r.failure()?.errorText}))
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort())
  const response=await page.goto(base+'/',{waitUntil:'networkidle',timeout:20000})
  const measured=await page.evaluate(()=>({h1:document.querySelectorAll('h1').length,metaDescription:document.querySelectorAll('meta[name="description"]').length,metaNoindex:document.querySelector('meta[name="robots"]')?.content.includes('noindex')||false,bodyWidth:document.body.scrollWidth,viewportWidth:innerWidth,images:[...document.images].map(i=>({loaded:i.complete&&i.naturalWidth>0,url:new URL(i.currentSrc).pathname})),visibleText:document.body.innerText.length}))
  if(response?.status()!==200||!measured.metaNoindex||measured.h1!==1||measured.metaDescription!==1||measured.bodyWidth>width+1||!measured.images.every(i=>i.loaded)||errors.length||measured.visibleText<80)throw Error('STAGING_BROWSER_FAIL_'+width)
  await page.screenshot({path:join(root,'offline-'+width+'.png'),fullPage:true})
  report.views.push({width,status:response.status(),...measured,errors})
  await context.close()
 }
 report.completed=true
}catch(e){report.error=String(e.message).slice(0,250);process.exitCode=1}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));writeFileSync(join(root,'offline-browser-receipt.json'),JSON.stringify(report,null,2)+'\n')}
console.log(JSON.stringify({completed:report.completed,views:report.views.map(v=>({width:v.width,status:v.status,bodyWidth:v.bodyWidth,imagesLoaded:v.images.every(i=>i.loaded),metaNoindex:v.metaNoindex})),error:report.error||null,published:false}))
