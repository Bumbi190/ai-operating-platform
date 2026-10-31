import {test,expect} from '@playwright/test'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
for(const width of [390,768,1440])test('catalog filters and resets in real opaque preview at '+width,async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 await page.setViewportSize({width,height:1000});await page.goto('/preview')
 const f=page.frameLocator('iframe')
 await expect(f.locator('.notice')).toContainText('FIKTIV DEMO')
 await expect(f.locator('.car:visible')).toHaveCount(8)
 await expect(f.locator('#count')).toHaveText('8 av 8 visas')
 await expect(f.locator('#count')).toHaveAttribute('aria-live','polite')
 for(const [value,count] of [['el',3],['hybrid',3],['bensin',2],['vatgas',0]] as const){
  await f.getByLabel('Filtrera på drivlina').selectOption(value)
  await expect(f.locator('.car:visible')).toHaveCount(count)
  await expect(f.locator('#count')).toHaveText(count+' av 8 visas')
 }
 await expect(f.locator('#empty')).toBeVisible()
 await f.getByLabel('Filtrera på drivlina').selectOption('*')
 await expect(f.locator('.car:visible')).toHaveCount(8);await expect(f.locator('#empty')).toBeHidden()
 const frame=page.frames().find(f=>f.parentFrame())!
 expect(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 expect(errors).toEqual([])
 await page.goto('/');await page.screenshot({path:info.outputPath('catalog-'+width+'.png'),fullPage:true,animations:'disabled'})
})
test('keyboard selection preserves focus and selected car remains bound to its test form',async({page})=>{
 await page.goto('/')
 const select=page.getByLabel('Filtrera på drivlina')
 await select.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter')
 await expect(select).toHaveValue('el');await expect(select).toBeFocused();await expect(page.locator('.car:visible')).toHaveCount(3)
 await select.selectOption('hybrid')
 const car=page.locator('#concept-02')
 await car.locator('summary').focus();await page.keyboard.press('Enter')
 await car.getByRole('button',{name:'Visa testförfrågan',exact:true}).focus();await page.keyboard.press('Enter')
 await expect(car.getByLabel('Vald bil')).toHaveValue('Aero S · CONCEPT-02')
 await expect(car.getByLabel('Vald bil')).toHaveAttribute('readonly','')
 await expect(car.getByText('Endast demonstration. Inget skickas och inga uppgifter sparas.')).toBeVisible()
 const sent:string[]=[];page.on('request',r=>sent.push(r.url()))
 await car.getByLabel('Ditt testmeddelande').fill('TEST – inga personuppgifter')
 await car.getByRole('button',{name:'Testa knappen – inget skickas'}).click()
 expect(sent).toEqual([]);await expect(car.getByLabel('Vald bil')).toHaveValue('Aero S · CONCEPT-02')
 await select.selectOption('*')
 const other=page.locator('#concept-07');await other.locator('summary').click();await other.getByRole('button',{name:'Visa testförfrågan',exact:true}).click()
 await expect(other.getByLabel('Vald bil')).toHaveValue('Nord City · CONCEPT-07')
 await expect(car.getByLabel('Vald bil')).toHaveValue('Aero S · CONCEPT-02')
})
test('initial selected value and independent collections do not hide unrelated cards',async({page})=>{
 await page.goto('/selected');await expect(page.locator('.car:visible')).toHaveCount(3);await expect(page.locator('#count')).toHaveText('3 av 8 visas')
 await page.goto('/independent');await page.locator('#fuel').selectOption('el')
 await expect(page.locator('.car[id^="concept-"]:visible')).toHaveCount(3)
 await expect(page.locator('.car[id^="second-"]:visible')).toHaveCount(8)
 await page.locator('#second-fuel').selectOption('bensin')
 await expect(page.locator('.car[id^="second-"]:visible')).toHaveCount(2)
 await expect(page.locator('.car[id^="concept-"]:visible')).toHaveCount(3)
})
test('preview retains blocked parent, cookies and network',async({page})=>{
 await page.goto('/preview');const frame=page.frames().find(f=>f.parentFrame())!
 const network:string[]=[];await page.route('**/invalid.example/**',r=>{network.push(r.request().url());return r.abort()})
 expect(await frame.evaluate(async()=>{
  let parentBlocked=false,cookiesBlocked=false,networkBlocked=false
  try{void parent.document.body}catch{parentBlocked=true}
  try{void document.cookie}catch{cookiesBlocked=true}
  try{await fetch('https://invalid.example/private')}catch{networkBlocked=true}
  return {parentBlocked,cookiesBlocked,networkBlocked}
 })).toEqual({parentBlocked:true,cookiesBlocked:true,networkBlocked:true})
 expect(network).toEqual([])
})
test('export works from disk and an accent-only revision retains all catalog content',async({page})=>{
 await page.goto(pathToFileURL(resolve('../../.superpowers/sdd/2026-10-31-web-studio-catalog-preview/preview/index.html')).href)
 await page.getByLabel('Filtrera på drivlina').selectOption('bensin');await expect(page.locator('.car:visible')).toHaveCount(2)
 await page.getByLabel('Filtrera på drivlina').selectOption('*')
 const before=await page.locator('body').innerText()
 await page.goto('/edited');expect(await page.locator('body').innerText()).toBe(before)
 expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#e3aa63')
 await page.getByLabel('Filtrera på drivlina').selectOption('el');await expect(page.locator('.car:visible')).toHaveCount(3)
})

for(const width of [390,768,1440])test('approved amber showroom stays readable and keeps real decoded imagery at '+width,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.goto('/')
 await expect(page.locator('h1')).toContainText('En ny vy')
 await expect(page.locator('.notice')).toContainText('FIKTIV DEMO')
 expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#efb563')
 const imagery=await page.locator('.car-image img').evaluateAll(nodes=>nodes.map(n=>({src:(n as HTMLImageElement).src,valid:(n as HTMLImageElement).complete&&(n as HTMLImageElement).naturalWidth>0})))
 expect(new Set(imagery.map(x=>x.src)).size).toBe(4)
 for(const image of await page.locator('img').all())await image.scrollIntoViewIfNeeded()
 expect(await page.locator('img').evaluateAll(nodes=>nodes.every(n=>(n as HTMLImageElement).complete&&(n as HTMLImageElement).naturalWidth>0))).toBe(true)
 const columns=await page.locator('.catalog').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)
 expect(columns).toBe(width>=1200?4:width>=600?2:1)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await expect(page.getByText(/AI-genererade illustrationer/, {exact:false}).first()).toBeVisible()
 await expect(page.getByRole('button',{name:/360/})).toHaveCount(0)
 await page.emulateMedia({reducedMotion:'reduce'})
 expect(await page.locator('.scene img').evaluate(el=>getComputedStyle(el).animationName)).toBe('none')
})
