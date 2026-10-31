import {test,expect} from '@playwright/test'
const first='10000000-0000-4000-8000-000000000001',second='10000000-0000-4000-8000-000000000002'
const costs=(projectId=first,spentSek=7.788,paused=false)=>({projectId,paused,enforced:true,observedAt:new Date().toISOString(),monthly:{spentSek,heldSek:2,limitSek:100,remainingSek:98-spentSek}})
test('project cost updates without losing the draft and marks failed refreshes as stale',async({page})=>{
 let amount=7.788,fail=false,reads=0
 await page.route('**/api/website-build/studio/costs?*',async route=>{reads++;await route.fulfill({status:fail?503:200,json:fail?{error:'unavailable'}:costs(first,amount)})})
 await page.goto('/build?costs=1')
 const meter=page.getByRole('region',{name:'Projektets kostnad'}),draft=page.getByLabel('Meddelande till Atlas',{exact:true})
 await expect(meter).toContainText('7,79');await expect(meter).toContainText('100,00');await expect(meter).toContainText('2,00')
 await draft.fill('Behåll min idé när kostnaden ändras')
 amount=9.5;await expect.poll(()=>reads,{timeout:10000}).toBeGreaterThan(1);await expect(meter).toContainText('9,50');await expect(draft).toHaveValue('Behåll min idé när kostnaden ändras')
 fail=true;await expect(meter).toContainText('Kostnaden kunde inte uppdateras',{timeout:10000});await expect(meter).toContainText('9,50')
 await expect(meter.getByRole('button',{name:'Stoppa projektet',exact:true})).toBeEnabled()
})
test('stop failures stay visible and successful project stops block further chat without a resume toggle',async({page})=>{
 let fail=true,paused=false;const writes:any[]=[]
 await page.route('**/api/website-build/studio/costs*',async route=>{
  if(route.request().method()==='POST'){writes.push(route.request().postDataJSON());if(!fail)paused=true;await route.fulfill({status:fail?503:200,json:fail?{error:'unavailable'}:{projectId:first,paused:true}})}
  else await route.fulfill({json:costs(first,7.788,paused)})
 })
 await page.goto('/build?costs=1');const meter=page.getByRole('region',{name:'Projektets kostnad'})
 await meter.getByRole('button',{name:'Stoppa projektet',exact:true}).click()
 await expect(meter).toContainText('Stoppet kunde inte bekräftas');expect(paused).toBe(false)
 fail=false;await meter.getByRole('button',{name:'Stoppa projektet',exact:true}).click()
 await expect(meter).toContainText('Projektet är pausat');expect(writes).toEqual([{projectId:first},{projectId:first}])
 await expect(page.getByLabel('Meddelande till Atlas',{exact:true})).toBeDisabled()
 await expect(meter.getByRole('button',{name:/Återuppta/})).toHaveCount(0)
})
test('a delayed cost response cannot cross a project switch',async({page})=>{
 let release!:()=>void;const pending=new Promise<void>(r=>release=r)
 await page.route('**/api/website-build/studio/costs?*',async route=>{const id=new URL(route.request().url()).searchParams.get('projectId')!;if(id===first)await pending;await route.fulfill({json:costs(id,id===first?77:3)})})
 await page.route('**/api/website-build/studio?*',async route=>{const model=await page.evaluate(()=>(window as any).__studioCostModel);await route.fulfill({json:{...model,selected:model.projects.find((p:any)=>p.id===second)}})})
 await page.goto('/build?costs=1');await page.getByLabel('Projekt i byggstudion').selectOption(second)
 const meter=page.getByRole('region',{name:'Projektets kostnad'});await expect(meter).toContainText('3,00');release();await expect(meter).not.toContainText('77,00')
})
test('cost and stop remain visible on a narrow screen',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await page.route('**/api/website-build/studio/costs?*',route=>route.fulfill({json:costs()}));await page.goto('/build?costs=1')
 const meter=page.getByRole('region',{name:'Projektets kostnad'});await expect(meter).toContainText('7,79');await expect(meter.getByRole('button',{name:'Stoppa projektet',exact:true})).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.screenshot({path:info.outputPath('studio-costs-mobile.jpg'),type:'jpeg',quality:65})
})

test('desktop cost control sits directly below Update',async({page},info)=>{
 await page.setViewportSize({width:1440,height:900})
 await page.route('**/api/website-build/studio/costs?*',route=>route.fulfill({json:costs()}))
 await page.goto('/build?costs=1')
 const meter=page.getByRole('region',{name:'Projektets kostnad'});await expect(meter).toContainText('7,79')
 const button=await page.getByRole('button',{name:'Uppdatera',exact:true}).boundingBox(),box=await meter.boundingBox()
 expect(box!.y).toBeGreaterThanOrEqual(button!.y+button!.height)
 expect(Math.abs(box!.x+box!.width-button!.x-button!.width)).toBeLessThanOrEqual(2)
 await page.screenshot({path:info.outputPath('studio-costs-desktop.jpg'),type:'jpeg',quality:65})
})

test('polling confirms a stop whose response was lost and clears the temporary error',async({page})=>{
 let paused=false,writes=0
 await page.route('**/api/website-build/studio/costs*',async route=>{
  if(route.request().method()==='POST'){writes++;paused=true;await route.abort('failed')}
  else await route.fulfill({json:costs(first,7.788,paused)})
 })
 await page.goto('/build?costs=1');const meter=page.getByRole('region',{name:'Projektets kostnad'})
 await meter.getByRole('button',{name:'Stoppa projektet',exact:true}).click()
 await expect(meter).toContainText('Stoppet kunde inte bekräftas')
 await expect(meter).toContainText('Projektet är pausat',{timeout:10000})
 await expect(meter.getByRole('alert')).toHaveCount(0)
 expect(writes).toBe(1)
})

test('an Update response started before stop cannot re-enable the project',async({page})=>{
 let paused=false,started!:()=>void,release!:()=>void,served!:()=>void
 const reading=new Promise<void>(r=>started=r),pending=new Promise<void>(r=>release=r),finished=new Promise<void>(r=>served=r)
 await page.route('**/api/website-build/studio/costs*',async route=>{if(route.request().method()==='POST'){paused=true;await route.fulfill({json:{projectId:first,paused:true}})}else await route.fulfill({status:paused?503:200,json:paused?{error:'offline after stop'}:costs(first)})})
 await page.route('**/api/website-build/studio?*',async route=>{const model=await page.evaluate(()=>(window as any).__studioCostModel);started();await pending;await route.fulfill({json:model});served()})
 await page.goto('/build?costs=1')
 const meter=page.getByRole('region',{name:'Projektets kostnad'});await expect(meter).toContainText('7,79')
 await page.getByRole('button',{name:'Uppdatera',exact:true}).click();await reading
 await meter.getByRole('button',{name:'Stoppa projektet',exact:true}).click();await expect(meter).toContainText('Projektet är pausat')
 release();await finished;await expect(page.getByText('Läser projektet…',{exact:true})).toHaveCount(0)
 await expect(page.getByLabel('Meddelande till Atlas',{exact:true})).toBeDisabled()
})

test('a pause detected during project navigation preserves the selected project and URL',async({page})=>{
 let release!:()=>void,reads=0;const pending=new Promise<void>(r=>release=r)
 await page.route('**/api/website-build/studio/costs?*',async route=>{
  const id=new URL(route.request().url()).searchParams.get('projectId')!;if(id===second)reads++
  await route.fulfill({status:id===second&&reads>1?503:200,json:costs(id,3,id===second)})
 })
 await page.route('**/api/website-build/studio?*',async route=>{const model=await page.evaluate(()=>(window as any).__studioCostModel);await pending;await route.fulfill({json:{...model,selected:model.projects.find((p:any)=>p.id===second)}})})
 await page.goto('/build?costs=1');await page.getByLabel('Projekt i byggstudion').selectOption(second)
 await expect(page.getByRole('region',{name:'Projektets kostnad'})).toContainText('Projektet är pausat');release()
 await expect(page).toHaveURL(/project=cost-project-2/);await expect(page.getByText('Läser projektet…',{exact:true})).toHaveCount(0)
 await expect(page.getByLabel('Meddelande till Atlas',{exact:true})).toBeDisabled()
})

for(const width of [1280,1440,1920])test('desktop header keeps controls in one row with long project options at '+width,async({page},info)=>{
 await page.setViewportSize({width,height:900})
 await page.route('**/api/website-build/studio/costs?*',route=>route.fulfill({status:503,json:{error:'fixture unavailable'}}))
 await page.goto('/build?costs=1')
 const picker=page.getByLabel('Projekt i byggstudion'),meter=page.getByRole('region',{name:'Projektets kostnad'})
 await expect(meter).toContainText('Kostnaden kunde inte uppdateras')
 // Native select intrinsic width depends on every option, not only the selected label.
 await picker.evaluate(el=>{const option=document.createElement('option');option.value='unselected-long-name';option.textContent='W'.repeat(120);el.appendChild(option)})
 await page.addStyleTag({content:'body{font-family:Arial,sans-serif}'})
 const header=page.getByRole('region',{name:'Bygg med Atlas',exact:true}).locator(':scope > header')
 const h=await header.boundingBox(),p=await picker.boundingBox(),button=await page.getByRole('button',{name:'Uppdatera',exact:true}).boundingBox()
 expect(button!.y).toBeLessThan(p!.y+p!.height)
 expect(h!.height).toBeLessThanOrEqual(160)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
 await expect(meter.getByRole('button',{name:'Stoppa projektet',exact:true})).toBeInViewport()
 await page.screenshot({path:info.outputPath('bounded-header-'+width+'.png')})
})
