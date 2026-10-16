import {test,expect,type Page} from '@playwright/test'
const C='50000000-0000-4000-8000-000000000001',P='10000000-0000-4000-8000-000000000001'
const plan={
 ref:{projectId:P,planId:'30000000-0000-4000-8000-000000000001'},conversationId:C,
 currentRevision:{projectId:P,planId:'30000000-0000-4000-8000-000000000001',revisionId:'40000000-0000-4000-8000-000000000001',sha256:'a'.repeat(64),number:1,brief:'Min plan',createdAt:'2026-10-16',content:{title:'Min sparade arbetsplan',purpose:'Visa',audience:'Svenska hem',pages:[{key:'home',title:'Hem',purpose:'Visa'}],design:{style:'Mörk',reference:null},features:[],architecture:'Statisk',steps:['Granska'],domain:{registrar:'strato',requestedName:null}}},
 approvedDecision:null,activeSessionId:null,budget:{state:'configured',monthlySek:100},
 setting:{projectId:P,builderAgentId:'40000000-0000-4000-8000-000000000001',domainRegistrar:'strato',location:null}
}
async function setup(page:Page,emptyWork=false){
 const requests:{url:string;body:any}[]=[]
 await page.addInitScript(()=>{
  ;(window as any).micStarts=0;(window as any).micStops=0;(window as any).fixtureJobStatus='queued'
  class Recognition{
   onstart?:()=>void;onresult?:(e:any)=>void;onend?:()=>void
   constructor(){(window as any).fixtureRecognition=this}
   start(){(window as any).micStarts++;setTimeout(()=>this.onstart?.(),0)}
   stop(){(window as any).micStops++}
   abort(){(window as any).micStops++}
  }
  ;(window as any).SpeechRecognition=Recognition
 })
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.hostname!=='127.0.0.1')return route.abort()
  if(!url.pathname.startsWith('/api/'))return route.continue()
  requests.push({url:url.pathname,body:req.postDataJSON()})
  if(url.pathname==='/api/conversations')return route.fulfill({json:{id:C}})
  if(url.pathname==='/api/chat'){
   const n=requests.filter(r=>r.url==='/api/chat').length
   if(n===3)await page.evaluate(()=>(window as any).fixtureJobVisible=true)
   const frames=n===1?[{event:'website_plan',conversationId:C,plan},{event:'done',fullText:'Planen är sparad.'}]:
    n===3?[{event:'website_workspace',conversationId:C,session:{projectId:P,sessionId:'60000000-0000-4000-8000-000000000001',conversationId:C,status:'queued',stage:'Köad',stateVersion:1,agentId:P,activePreviewRevisionId:null,currentRunId:null,controlRequested:null,updatedAt:'2026-10-16',revisions:[],feedback:[]}},{event:'done',fullText:'Jobbet är köat.'}]:
    [{event:'done',fullText:'Vi kan fortsätta prata.'}]
   return route.fulfill({contentType:'text/event-stream',body:frames.map(f=>'data: '+JSON.stringify(f)+'\n\n').join('')})
  }
  return route.fulfill({json:{}})
 })
 await page.goto('/dashboard?fixture-growth=1'+(emptyWork?'&fixture-work-empty=1':''))
 return requests
}
async function say(page:Page,text:string){
 await expect(page.getByTestId('fixture-session')).toHaveText('active:listening')
 await page.evaluate(text=>{
  const r=(window as any).fixtureRecognition
  r.onresult({results:[Object.assign([{transcript:text}],{isFinal:true})]})
 },text)
}
for(const width of [390,1280,1920]){
 test('growth overview fits '+width,async({page})=>{
  await page.setViewportSize({width,height:1000});await setup(page)
  await expect(page.getByRole('heading',{name:'Atlas rekommenderar',exact:true})).toBeVisible()
  await expect(page.locator('[data-growth-chart]')).toHaveCount(3)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  await page.locator('main').screenshot({path:'../../.superpowers/sdd/2026-10-16-overview-growth-atlas/growth-'+width+'.png'})
 })
}
test('discussion preserves an existing draft, does not send and does not stop a call',async({page})=>{
 const requests=await setup(page)
 await page.getByRole('button',{name:'Öppna Atlas',exact:true}).click()
 const field=page.getByRole('textbox',{name:'Skriv till Atlas',exact:true})
 await field.fill('Mitt befintliga utkast.')
 await page.getByRole('button',{name:'Starta samtal',exact:true}).click()
 await expect(page.getByTestId('fixture-session')).toHaveText('active:listening')
 const stops=await page.evaluate(()=>(window as any).micStops)
 await page.getByRole('button',{name:'Minimera Atlas',exact:true}).click()
 await page.getByRole('button',{name:'Diskutera med Atlas',exact:false}).first().click()
 await expect(field).toHaveValue(/Mitt befintliga utkast\.[\s\S]*Undersök vilka aktiviteter/)
 await expect(page.getByTestId('fixture-session')).toHaveText('active:listening')
 expect(await page.evaluate(()=>(window as any).micStops)).toBe(stops)
 expect(requests.filter(r=>r.url==='/api/chat')).toHaveLength(0)
})
test('saving a plan during a call preserves the overview and the live session',async({page})=>{
 const requests=await setup(page)
 await page.getByRole('button',{name:'Öppna Atlas',exact:true}).click()
 await page.getByRole('button',{name:'Starta samtal',exact:true}).click()
 await say(page,'Spara ett arbetsupplägg åt mig')
 await expect.poll(()=>requests.filter(r=>r.url==='/api/chat').length).toBe(1)
 await expect(page).toHaveURL(/\/dashboard\?fixture-growth=1$/)
 await expect(page.getByText('Plan sparad · Familje-Stunden',{exact:true})).toBeVisible()
 await expect(page.getByTestId('fixture-session')).toHaveText('active:listening')
})
test('website planning and later voice turns remain conversational without hidden approvals',async({page})=>{
 const requests=await setup(page)
 await page.getByRole('button',{name:'Öppna Atlas',exact:true}).click()
 await page.getByRole('button',{name:'Starta samtal',exact:true}).click()
 await say(page,'Spara planen för hemsidan')
 await expect.poll(()=>requests.filter(r=>r.url==='/api/chat').length).toBe(1)
 await expect(page.getByTestId('fixture-session')).toHaveText('active:listening')
 await say(page,'Jag godkänner')
 await expect.poll(()=>requests.filter(r=>r.url==='/api/chat').length).toBe(2)
 const body=requests.filter(r=>r.url==='/api/chat')[1].body
 expect(body.inputSource).toBe('voice');expect(body.websitePlanRef).toBeUndefined();expect(body.buildContext).toBeUndefined()
 await say(page,'Starta det redan godkända jobbet')
 await expect.poll(()=>requests.filter(r=>r.url==='/api/chat').length).toBe(3)
 await expect(page.getByTestId('fixture-build-status')).toHaveText('queued')
 await say(page,'Vad kan vi göra medan jobbet körs?')
 await expect.poll(()=>requests.filter(r=>r.url==='/api/chat').length).toBe(4)
 await expect(page.getByTestId('fixture-build-status')).toHaveText('queued')
 await expect(page.getByTestId('fixture-session')).toHaveText('active:listening')
})
test('background status refreshes without a page reload or a lost draft',async({page})=>{
 await page.clock.install();await setup(page)
 await page.getByRole('button',{name:'Öppna Atlas',exact:true}).click()
 await page.getByRole('textbox',{name:'Skriv till Atlas',exact:true}).fill('Behåll mitt utkast')
 const token=await page.evaluate(()=>(window as any).fixtureToken)
 await page.evaluate(()=>(window as any).fixtureJobStatus='done')
 await page.clock.runFor(31_000)
 await expect(page.locator('[data-overview-work]')).toContainText('Klart')
 await expect(page.getByRole('textbox',{name:'Skriv till Atlas',exact:true})).toHaveValue('Behåll mitt utkast')
 expect(await page.evaluate(()=>(window as any).fixtureToken)).toBe(token)
 expect(await page.evaluate(()=>(window as any).fixtureRefreshes??0)).toBeGreaterThan(0)
})

for(const hidden of [false,true]){
 test('first queued receipt catches up with empty rows after '+(hidden?'a hidden turn':'the refresh throttle'),async({page})=>{
  await page.clock.install({time:new Date('2026-10-16T12:00:00Z')})
  await page.clock.pauseAt(new Date('2026-10-16T12:00:01Z'))
  const requests=await setup(page,true)
  await expect(page.locator('[data-overview-work]')).toContainText('Inga pågående jobb')
  await page.getByRole('button',{name:'Öppna Atlas',exact:true}).click()
  const field=page.getByRole('textbox',{name:'Skriv till Atlas',exact:true}),send=page.getByRole('button',{name:'Skicka',exact:true})
  const turn=async(text:string,n:number)=>{
   await field.fill(text);await send.click()
   await expect.poll(()=>requests.filter(r=>r.url==='/api/chat').length).toBe(n)
   await expect(send).toBeDisabled()
   await expect(page.getByRole('button',{name:'Starta samtal',exact:true})).toBeEnabled()
  }
  await turn('Spara en plan',1)
  await expect.poll(()=>page.evaluate(()=>(window as any).fixtureRefreshes??0)).toBeGreaterThan(0)
  await turn('Berätta mer',2)
  if(hidden)await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'}))
  await turn('Starta det redan godkända jobbet',3)
  await expect(page.getByTestId('fixture-build-status')).toHaveText('queued')
  await expect(page.getByTestId('fixture-turn-status')).toHaveText('idle')
  await field.fill('Behåll detta utkast')
  if(hidden)await page.evaluate(()=>{
   Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'visible'})
   document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.clock.runFor(6000)
  await expect(page.locator('[data-overview-work]')).toContainText('I kö')
  await expect(field).toHaveValue('Behåll detta utkast')
 })
}
