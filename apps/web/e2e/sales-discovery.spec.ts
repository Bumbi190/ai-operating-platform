import {test,expect,type Page} from '@playwright/test'

const legacyProject='10000000-0000-4000-8000-000000000001',serviceProject='10000000-0000-4000-8000-000000000002'
const candidateId='31000000-0000-4000-8000-000000000001',batchId='41000000-0000-4000-8000-000000000001',contactId='32000000-0000-4000-8000-000000000001'
const at='2026-10-31T12:00:00.000Z',companyName='Synthetic discovered company'
function candidate(projectId:string){return {id:candidateId,projectId,version:1,sourceId:'node/9999999999991',sourceUrl:'https://www.openstreetmap.org/node/9999999999991',name:companyName,email:'public@discovered.example.com',websiteUrl:'https://discovered.example.com/',status:'needs_review',exclusions:[] as string[],reviewNote:null as string|null,firstSeenAt:at,lastSeenAt:at,promotedContactId:null as string|null,historyCoverage:'partial',outreachReady:false}}
async function mocks(page:Page,projectId:string,options:{rateLimited?:boolean;storeFailure?:boolean;stalePending?:boolean;unsafe?:boolean;sourceConfigured?:boolean|'unknown';saved?:boolean;waitForRead?:Promise<void>}={}){
 const posts:Record<string,unknown>[]=[],otherPosts:string[]=[]
 let contact:Record<string,unknown>|null=null,row=candidate(projectId)
 if(options.unsafe){row={...row,name:'<img src=x onerror=alert(1)>',sourceUrl:'javascript:alert(1)',websiteUrl:'https://localhost.localdomain/'}}
 let batch:null|{id:string;query:Record<string,unknown>;state:string;errorCode:string|null;createdAt:string;completedAt:string|null;candidateCount:number}=options.saved||options.unsafe||options.stalePending?{id:batchId,query:{city:'stockholm',category:'car_dealer',radiusKm:5,limit:20},state:options.stalePending?'pending':'completed',errorCode:null,createdAt:options.stalePending?new Date(Date.now()-60000).toISOString():at,completedAt:options.stalePending?null:at,candidateCount:options.stalePending?0:1}:null
 const report=()=>({projectId,batch,batches:batch?[batch]:[],candidates:batch?.state==='completed'?[row]:[],historyCoverage:'partial',customerSendingEnabled:false,...(options.sourceConfigured==='unknown'?{}:{sourceConfigured:options.sourceConfigured??true})})
 page.on('request',request=>{const path=new URL(request.url()).pathname;if(request.method()==='POST'&&path.startsWith('/api/sales')&&path!=='/api/sales/discovery')otherPosts.push(path)})
 await page.route(url=>url.pathname==='/api/sales/discovery',async route=>{
  const request=route.request()
  if(request.method()==='GET'){expect(new URL(request.url()).searchParams.get('projectId')).toBe(projectId);await options.waitForRead;await route.fulfill({json:report()});return}
  const body=request.postDataJSON() as Record<string,unknown>;posts.push(body);expect(body.projectId).toBe(projectId)
  if(body.operation==='discover'){
   batch={id:batchId,query:body.query as Record<string,unknown>,state:options.rateLimited||options.storeFailure?'failed':'completed',errorCode:options.rateLimited?'DISCOVERY_RATE_LIMITED':options.storeFailure?'DISCOVERY_STORE_UNAVAILABLE':null,createdAt:at,completedAt:at,candidateCount:options.rateLimited||options.storeFailure?0:1}
   await route.fulfill(options.rateLimited?{status:429,json:{code:'DISCOVERY_RATE_LIMITED'}}:options.storeFailure?{status:503,json:{code:'DISCOVERY_STORE_UNAVAILABLE'}}:{json:report()});return
  }
  if(body.operation==='review'){
   row={...row,status:String(body.decision),version:row.version+1,reviewNote:String(body.note)}
   await route.fulfill({json:row});return
  }
  if(body.operation==='promote'){
   contact={id:contactId,projectId,companyName:body.companyName,branchName:body.branchName,email:body.email,websiteUrl:body.websiteUrl,version:1,offerKind:body.offerKind,pilotMonths:body.pilotMonths,history:'unknown',historySource:'Synthetic verified identity; history needs review.',confirmed:true,excluded:false,suppressed:false}
   row={...row,status:'promoted',version:row.version+1,promotedContactId:contactId}
   await route.fulfill({json:{state:'promoted',contactId,history:'unknown'}});return
  }
  await route.fulfill({status:400,json:{code:'INVALID_BODY'}})
 })
 // The entry mounts only after this GET; the Vite harness has no backend database.
 const workspace={projectId,state:'ok',workerState:'not_connected',contacts:[],offers:[],jobs:[],drafts:[],evidence:[],workers:[],emailTemplates:[],workspaceUrl:projectId===serviceProject?'/projects/webbuilder/sales':'/projects/handlarborsen/sales',sendingEnabled:false,timing:{projectId,evaluatedAt:at,historyRevisions:[],rules:null,customerSendingEnabled:false,contacts:[],workspaceUrl:'/sales#contact-timing'}}
 await page.route(url=>url.pathname==='/api/sales',async route=>{
  if(route.request().method()!=='GET'){await route.fulfill({status:400,json:{code:'INVALID_BODY'}});return}
  const connection=new URL(route.request().url()).searchParams.has('connection')
  await route.fulfill({json:connection?{connections:[],sendingEnabled:false}:{...workspace,contacts:contact?[contact]:[]}})
 })
 await page.route(url=>url.pathname==='/api/sales/mailbox',route=>route.fulfill({json:null}))
 return {posts,otherPosts}
}
async function openDiscovery(page:Page,path='/sales'){
 await page.goto(path)
 const panel=page.locator('details').filter({has:page.getByRole('heading',{name:'Hitta företag',exact:true})}).first()
 await panel.locator(':scope > summary').click()
 await expect(panel.getByText('Offentliga uppgifter behöver granskas',{exact:false})).toBeVisible()
 return panel
}

for(const service of [false,true]){
 test(`bounded discovery and explicit ${service?'service':'pilot'} contact review stay history-blocked`,async({page})=>{
  const projectId=service?serviceProject:legacyProject,{posts,otherPosts}=await mocks(page,projectId)
  const panel=await openDiscovery(page,service?'/sales?project=service':'/sales')
  expect(posts).toHaveLength(0)
  await panel.getByRole('combobox',{name:'Ort',exact:true}).selectOption(service?'goteborg':'stockholm')
  await panel.getByRole('combobox',{name:'Bransch',exact:true}).selectOption(service?'restaurant':'car_dealer')
  await panel.getByLabel('Radie från ortens centrum (km)').fill('5')
  await panel.getByRole('combobox',{name:'Högsta antal uppslag',exact:true}).selectOption('20')
  await panel.getByRole('button',{name:'Hämta företag',exact:true}).click()
  await expect(panel.getByText(companyName,{exact:true})).toBeVisible()
  expect(posts[0]).toMatchObject({operation:'discover',projectId,query:{city:service?'goteborg':'stockholm',category:service?'restaurant':'car_dealer',radiusKm:5,limit:20}})
  expect(typeof posts[0].idempotencyKey).toBe('string')
  await expect(panel.getByText('Offentlig, ännu ej verifierad mejladress: public@discovered.example.com')).toBeVisible()
  await panel.getByRole('button',{name:'Granska företag',exact:true}).click()
  const review=panel.getByRole('region',{name:'Granska hittat företag'})
  await review.getByLabel('Verifierad mejladress',{exact:true}).fill('verified@discovered.example.com')
  await review.getByRole('combobox',{name:'Erbjudandetyp',exact:true}).selectOption(service?'general_service':'pilot')
  if(!service)await review.getByRole('combobox',{name:'Verifierad pilotnivå',exact:true}).selectOption('6')
  await review.getByLabel('Underlag för företags- och adresskontroll').fill('Synthetic operator checked the business website and correct recipient.')
  const save=review.getByRole('button',{name:'Spara verifierad kontakt för historikgranskning'})
  await save.click();expect(posts.filter(p=>p.operation==='promote')).toHaveLength(0)
  await review.getByRole('checkbox',{name:'Jag har verifierat företaget och den valda erbjudandetypen eller pilotnivån.'}).check()
  await save.click();expect(posts.filter(p=>p.operation==='promote')).toHaveLength(0)
  await review.getByRole('checkbox',{name:/Jag har verifierat att mejladressen/}).check();await save.click()
  await expect(panel.getByRole('status')).toContainText('Kontakten är sparad med okänd kontakthistorik')
  const promotion=posts.find(p=>p.operation==='promote')!
  expect(promotion).toMatchObject({projectId,candidateId,expectedVersion:1,email:'verified@discovered.example.com',emailConfirmed:true,businessConfirmed:true,offerKind:service?'general_service':'pilot',pilotMonths:service?null:6})
  expect(promotion).not.toHaveProperty('history');expect(promotion).not.toHaveProperty('confirmed')
  const contacts=page.locator('details').filter({has:page.getByRole('heading',{name:'Kontakter',exact:true})}).first()
  await contacts.locator(':scope > summary').click()
  const contactRow=contacts.getByRole('listitem').filter({hasText:companyName})
  await expect(contactRow.getByRole('checkbox')).toBeDisabled()
  await expect(contactRow).toContainText('Kontakthistorik behöver granskas')
  expect(otherPosts).toEqual([])
 })
}
test('rejection is retained after reload without creating a contact',async({page})=>{
 const {posts,otherPosts}=await mocks(page,serviceProject),panel=await openDiscovery(page,'/sales?project=service')
 await panel.getByRole('combobox',{name:'Ort',exact:true}).selectOption('malmo');await panel.getByRole('combobox',{name:'Bransch',exact:true}).selectOption('cafe')
 await panel.getByRole('button',{name:'Hämta företag',exact:true}).click();await panel.getByRole('button',{name:'Granska företag',exact:true}).click()
 const review=panel.getByRole('region',{name:'Granska hittat företag'})
 await review.locator('summary').filter({hasText:'Avvisa, exkludera eller spärra uppslaget'}).click()
 await review.getByRole('combobox',{name:'Beslut',exact:true}).selectOption('rejected');await review.getByLabel('Orsak',{exact:true}).fill('Synthetic operator rejected this business.')
 await review.getByRole('button',{name:'Spara granskningsbeslut'}).click()
 await expect(panel.getByRole('status')).toContainText('Beslutet är sparat')
 await page.reload();await page.getByRole('heading',{name:'Hitta företag',exact:true}).click()
 await expect(panel.getByText('Avvisad',{exact:false})).toBeVisible()
 await expect(panel.getByRole('button',{name:'Granska företag',exact:true})).toHaveCount(0)
 expect(posts.map(p=>p.operation)).toEqual(['discover','review']);expect(otherPosts).toEqual([])
})
test('provider rate limit is surfaced without contact creation or automatic retry',async({page})=>{
 const {posts,otherPosts}=await mocks(page,serviceProject,{rateLimited:true}),panel=await openDiscovery(page,'/sales?project=service')
 await panel.getByRole('combobox',{name:'Ort',exact:true}).selectOption('uppsala');await panel.getByRole('combobox',{name:'Bransch',exact:true}).selectOption('hairdresser')
 await panel.getByRole('button',{name:'Hämta företag',exact:true}).click()
 await expect(panel.getByRole('status')).toContainText('Sökningen är tillfälligt begränsad')
 await expect(panel.getByRole('button',{name:'Granska företag',exact:true})).toHaveCount(0)
 expect(posts.map(p=>p.operation)).toEqual(['discover']);expect(otherPosts).toEqual([])
})
test('untrusted business fields remain text and cannot introduce unsafe links',async({page})=>{
 const {posts}=await mocks(page,serviceProject,{unsafe:true}),panel=await openDiscovery(page,'/sales?project=service')
 await expect(panel.getByText('<img src=x onerror=alert(1)>',{exact:true})).toBeVisible()
 await expect(panel.locator('img')).toHaveCount(0)
 await expect(panel.locator('a[href^="javascript:"]')).toHaveCount(0)
 await expect(panel.getByRole('link',{name:'Besök angiven webbplats'})).toHaveCount(0)
 await expect(panel.getByRole('link',{name:'Visa källa i OpenStreetMap'})).toHaveAttribute('href','https://www.openstreetmap.org/node/9999999999991')
 expect(posts).toEqual([])
})
test('storage uncertainty is explained without automatically fetching again',async({page})=>{
 const {posts,otherPosts}=await mocks(page,serviceProject,{storeFailure:true}),panel=await openDiscovery(page,'/sales?project=service')
 await panel.getByRole('combobox',{name:'Ort',exact:true}).selectOption('orebro');await panel.getByRole('combobox',{name:'Bransch',exact:true}).selectOption('dentist')
 await panel.getByRole('button',{name:'Hämta företag',exact:true}).click()
 await expect(panel.getByRole('status')).toContainText('Det gick inte att bekräfta att resultatet sparades')
 expect(posts.map(p=>p.operation)).toEqual(['discover']);expect(otherPosts).toEqual([])
})
test('a stale pending record does not claim an indefinitely running search',async({page})=>{
 const {posts}=await mocks(page,serviceProject,{stalePending:true}),panel=await openDiscovery(page,'/sales?project=service')
 await expect(panel.getByRole('status')).toContainText('Sökningen saknar ett sparat slutresultat')
 expect(posts).toEqual([])
})

for(const [sourceConfigured,label] of [[false,'missing'],['unknown','unknown']] as const){
 test(label+' source configuration blocks discovery while saved review remains usable',async({page})=>{
  const {posts,otherPosts}=await mocks(page,serviceProject,{sourceConfigured,saved:true}),panel=await openDiscovery(page,'/sales?project=service')
  const explanation=sourceConfigured===false?'Sökkällan behöver anslutas innan du kan hämta nya företag.':'Sökkällans status kunde inte bekräftas.'
  await expect(panel.getByText(explanation,{exact:false})).toBeVisible()
  await expect(panel.getByText('Sparade uppslag går fortfarande att granska.',{exact:false})).toBeVisible()
  await expect(panel.getByRole('button',{name:'Hämta företag',exact:true})).toBeDisabled()
  await panel.getByRole('combobox',{name:'Ort',exact:true}).selectOption('malmo')
  await panel.getByRole('combobox',{name:'Bransch',exact:true}).selectOption('restaurant')
  await panel.locator('form').first().dispatchEvent('submit')
  expect(posts).toEqual([])
  await panel.getByRole('button',{name:'Granska företag',exact:true}).click()
  const review=panel.getByRole('region',{name:'Granska hittat företag'})
  await expect(review).toBeVisible()
  await expect(review.getByRole('button',{name:'Spara verifierad kontakt för historikgranskning'})).toBeEnabled()
  await review.locator('summary').filter({hasText:'Avvisa, exkludera eller spärra uppslaget'}).click()
  await review.getByLabel('Orsak',{exact:true}).fill('Synthetic review of a saved business without a configured discovery source.')
  await review.getByRole('button',{name:'Spara granskningsbeslut'}).click()
  await expect(panel.getByRole('status')).toContainText('Beslutet är sparat')
  await page.reload();await page.getByRole('heading',{name:'Hitta företag',exact:true}).click()
  await expect(panel.getByText('Avvisad',{exact:false})).toBeVisible()
  await expect(panel.getByRole('button',{name:'Hämta företag',exact:true})).toBeDisabled()
  expect(posts.map(p=>p.operation)).toEqual(['review']);expect(otherPosts).toEqual([])
 })
}
test('discovery stays unavailable until the initial source status has loaded',async({page})=>{
 let releaseRead!:()=>void
 const waitForRead=new Promise<void>(resolve=>{releaseRead=resolve})
 const {posts,otherPosts}=await mocks(page,serviceProject,{waitForRead})
 const panel=await openDiscovery(page,'/sales?project=service')
 try{
  await expect(panel.getByRole('status')).toHaveText('Kontrollerar sökläget…')
  await expect(panel.getByRole('button',{name:'Hämta företag',exact:true})).toBeDisabled()
  await panel.getByRole('combobox',{name:'Ort',exact:true}).selectOption('malmo')
  await panel.getByRole('combobox',{name:'Bransch',exact:true}).selectOption('restaurant')
  await panel.locator('form').first().dispatchEvent('submit')
  expect(posts).toEqual([])
 }finally{releaseRead()}
 await expect(panel.getByRole('button',{name:'Hämta företag',exact:true})).toBeEnabled()
 await expect(panel.getByText('Kontrollerar sökläget…',{exact:true})).toHaveCount(0)
 expect(posts).toEqual([]);expect(otherPosts).toEqual([])
})
