// Attended, local-only real browser capture; no company messages or form submissions.
import {chromium} from '@playwright/test'
import {createHash} from 'node:crypto'
import {existsSync} from 'node:fs'
import {publicTarget, startCaptureProxy} from './website-prospect-network.mjs'

const input=JSON.parse(await new Promise((resolve,reject)=>{let data='';process.stdin.on('data',chunk=>{data+=chunk;if(data.length>8192)reject(Error('INPUT_LIMIT'))});process.stdin.on('end',()=>resolve(data));process.stdin.on('error',reject)}))
const target=publicTarget(input.url)
if (process.env.OMNIRA_PROSPECT_CAPTURE_MODE !== 'isolated-local') throw Error('LOCAL_CAPTURE_REQUIRED')
const proxy=await startCaptureProxy()
let browser
const deadline=setTimeout(()=>{void browser?.close();void proxy.close()},70000)
try {
  const chrome=process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':undefined
  browser=await chromium.launch({headless:true,...(chrome&&existsSync(chrome)?{executablePath:chrome}:{}),proxy:{server:proxy.url,bypass:'<-loopback>'},args:['--disable-quic','--force-webrtc-ip-handling-policy=disable_non_proxied_udp']})
  const images=[],observations=[],warnings=new Set(),pages=[]
  let finalUrl
  for(const [viewport,width,height] of [['desktop',1440,900],['mobile',390,844]]) {
    const context=await browser.newContext({viewport:{width,height},locale:'sv-SE',serviceWorkers:'block',acceptDownloads:false,ignoreHTTPSErrors:false})
    await context.route('**/*',route=>{
      const request=route.request()
      try {
        publicTarget(request.url())
        if(!['GET','HEAD'].includes(request.method()))throw Error('NON_READ_REQUEST')
        return route.continue()
      } catch {if(warnings.size<10)warnings.add('En begäran utanför tillåten offentlig läsning blockerades.');return route.abort()}
    })
    const page=await context.newPage(),scriptErrors=[]
    page.on('pageerror',()=>{if(scriptErrors.length<10)scriptErrors.push('page-error')})
    const response=await page.goto(target.href,{waitUntil:'domcontentloaded',timeout:35000})
    if(!response||response.status()<200||response.status()>=400)throw Error('SITE_HTTP_ERROR')
    const htmlSha256=createHash('sha256').update(await response.body()).digest('hex')
    publicTarget(page.url())
    if(finalUrl&&finalUrl!==page.url())throw Error('VIEWPORT_URL_MISMATCH')
    finalUrl=page.url()
    await page.waitForLoadState('networkidle',{timeout:6000}).catch(()=>warnings.add('Sidan hade fortsatt nätverkstrafik vid skärmbilden.'))
    await page.evaluate(async()=>{await document.fonts.ready})
    const result=await page.evaluate(({viewport,width,height})=>{
      const clean=value=>(value??'').replace(/\s+/g,' ').trim()
      const visible=element=>{const r=element.getBoundingClientRect(),s=getComputedStyle(element);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'}
      const selector=element=>element.id?'#'+CSS.escape(element.id):element.tagName.toLowerCase()+(element.classList.length?'.'+[...element.classList].slice(0,2).map(x=>CSS.escape(x)).join('.'):'')
      const obs=[]
      const add=(kind,description,value,sel='')=>obs.push({id:viewport+'-'+kind,viewport,kind,description,selector:sel,value:clean(value).slice(0,2000)})
      add('title','Sidans title vid besöket.',document.title,'title')
      const headings=[...document.querySelectorAll('h1')].filter(visible)
      add('h1','Antal synliga huvudrubriker (h1): '+headings.length+'.',JSON.stringify(headings.map(e=>clean(e.textContent))),'h1')
      const description=document.querySelector('meta[name="description"]')?.getAttribute('content')??''
      add('description','Metabeskrivning vid besöket'+(description?' finns.':' saknas.'),description,'meta[name="description"]')
      const docWidth=Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)
      add('overflow','Dokumentets bredd är '+docWidth+' px vid en vy på '+width+' px.',String(docWidth),'html')
      const controls=[...document.querySelectorAll('a,button,input,select')].filter(visible)
      const small=controls.filter(e=>{const r=e.getBoundingClientRect();return r.top<height&&r.bottom>0&&(r.width<44||r.height<44)})
      add('small-controls','Synliga kontroller i första vyn med bredd eller höjd under 44 px: '+small.length+'.',JSON.stringify(small.slice(0,8).map(e=>({text:clean(e.textContent).slice(0,60),selector:selector(e),width:Math.round(e.getBoundingClientRect().width),height:Math.round(e.getBoundingClientRect().height)}))))
      const ctas=controls.filter(e=>/bilar|lager|fordon|kontakt|besök|provkör/i.test(clean(e.textContent))&&e.getBoundingClientRect().top<height&&e.getBoundingClientRect().bottom>0)
      add('primary-actions','Synliga länkar/knappar om bilar, lager, kontakt eller besök i första vyn: '+ctas.length+'.',JSON.stringify(ctas.map(e=>clean(e.textContent)).slice(0,10)))
      const missingAlt=[...document.images].filter(e=>visible(e)&&!e.hasAttribute('alt'))
      add('image-alt','Synliga bilder utan alt-attribut: '+missingAlt.length+'.',String(missingAlt.length),'img:not([alt])')
      const text=clean(document.body.innerText)
      add('visible-copy','Utdrag ur sidans synliga text.',text.slice(0,1800),'body')
      return {observations:obs,pageHeight:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight),title:document.title,overflow:docWidth>width+1,imagesLoaded:[...document.images].every(image=>image.complete&&image.naturalWidth>0)}
    },{viewport,width,height})
    const captureHeight=Math.min(6000,Math.max(height,result.pageHeight))
    if(result.pageHeight>6000)warnings.add('Skärmbilden visar de första 6000 px av sidan.')
    const bytes=await page.screenshot({type:'png',clip:{x:0,y:0,width,height:captureHeight},timeout:15000,animations:'disabled'})
    images.push({viewport,width,height:captureHeight,png:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')})
    observations.push(...result.observations)
    pages.push({viewport,width,overflow:result.overflow,title:result.title,htmlSha256,imagesLoaded:result.imagesLoaded,scriptsOk:scriptErrors.length===0})
    await context.close()
  }
  const response={sourceUrl:target.href,finalUrl,capturedAt:new Date().toISOString(),engine:'playwright',images,observations,warnings:[...warnings].slice(0,12),pages}
  process.stdout.write(JSON.stringify(response))
}catch(error){process.stderr.write('CAPTURE_FAILED: '+String(error?.message??'unknown').replace(/https?:\/\/\S+/g,'[site]').slice(0,300));process.exitCode=1}
finally{clearTimeout(deadline);await browser?.close();await proxy.close()}
