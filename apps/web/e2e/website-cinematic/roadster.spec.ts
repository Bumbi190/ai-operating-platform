import {test,expect,type Page} from '@playwright/test'
const view='/build/demo-motors/cinematic?view=roadster'
async function filmTime(page:Page){return page.locator('#screen video').evaluate((v:HTMLVideoElement)=>v.currentTime)}
async function frameFingerprint(page:Page){
 return page.locator('#screen video').evaluate((v:HTMLVideoElement)=>{
  if(v.readyState<2||v.seeking)return ''
  const c=document.createElement('canvas');c.width=24;c.height=14
  c.getContext('2d')!.drawImage(v,0,0,24,14)
  return c.toDataURL()
 })
}
test('Roadster opens from catalog with approved photos and lazy video/3D',async({page})=>{
 const media:string[]=[]
 page.on('request',r=>{if(/\.(glb|mp4)$/.test(r.url()))media.push(r.url())})
 await page.emulateMedia({reducedMotion:'reduce'})
 await page.goto('/build/demo-motors/cinematic')
 await page.getByRole('link',{name:'Utforska Roadster — film och 3D'}).click()
 await expect(page).toHaveURL(/view=roadster/)
 await expect(page.getByRole('heading',{name:'Roadster',exact:true})).toBeVisible()
 expect(media).toEqual([])
 await expect(page.locator('#timeline-label')).toBeHidden()
 await page.getByRole('button',{name:'Kupé',exact:true}).click()
 await expect(page.locator('#screen img')).toHaveAttribute('alt',/Förarplatsen/)
 await page.getByRole('button',{name:'Akter',exact:true}).click()
 await expect(page.locator('#screen img')).toHaveAttribute('alt',/fyra illustrerade/)
 expect(media).toEqual([])
})
test('approved film scrolls through the full launch, reverses and switches to normal playback',async({page})=>{
 await page.goto(view)
 await page.getByRole('button',{name:'Film',exact:true}).click()
 const video=page.locator('#screen video')
 await expect(page.locator('#mode')).toHaveAttribute('aria-pressed','true')
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.duration)).toBeGreaterThan(15)
 await expect.poll(()=>frameFingerprint(page)).not.toBe('')
 const first=await frameFingerprint(page)
 await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight))
 await expect.poll(()=>filmTime(page)).toBeGreaterThan(15)
 await expect(page.locator('#chapter')).toHaveText('04 / Thrusterstart')
 await expect.poll(()=>frameFingerprint(page)).not.toBe('')
 expect(await frameFingerprint(page)).not.toBe(first)
 await page.screenshot({path:'../../.superpowers/cinematic-pilot/roadster-film-end.png'})
 await page.evaluate(()=>scrollTo(0,document.querySelector('#track')!.getBoundingClientRect().top+scrollY))
 await expect.poll(()=>filmTime(page)).toBeLessThan(.1)
 await page.locator('#mode').click()
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.paused)).toBe(false)
 await expect.poll(()=>filmTime(page)).toBeGreaterThan(.2)
 await page.getByRole('button',{name:'Exteriör',exact:true}).click()
 await expect(page.locator('#screen video')).toHaveCount(0)
})
for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
 test('Roadster '+viewport.width+' reduced-motion playback and keyboard controls',async({page})=>{
  await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'})
  await page.goto(view);await page.getByRole('button',{name:'Film',exact:true}).click()
  const video=page.locator('#screen video')
  await expect(page.locator('#mode')).toHaveAttribute('aria-pressed','false')
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2)
  expect(await video.evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true)
  await page.locator('#timeline').focus();await page.keyboard.press('End')
  await expect.poll(()=>filmTime(page)).toBeGreaterThan(15)
  await page.keyboard.press('Home');await expect.poll(()=>filmTime(page)).toBeLessThan(.1)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
  if(viewport.width===390)await page.screenshot({path:'../../.superpowers/cinematic-pilot/roadster-mobile.png',fullPage:true})
 })
}
test('Roadster 3D loads approved model, renders and rotates; no console errors',async({page})=>{
 const errors:string[]=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto(view)
 await page.getByRole('button',{name:'3D-vy',exact:true}).click()
 const frame=page.frameLocator('#screen iframe')
 await expect(frame.locator('#vehicle-stage')).toHaveAttribute('data-model3d-state','ready',{timeout:30000})
 const canvas=frame.locator('canvas')
 const before=await canvas.screenshot()
 const box=(await canvas.boundingBox())!
 // The viewer canvas extends beyond its clipped stage; drag within the visible frame.
 const visible=(await page.locator('#screen').boundingBox())!
 await page.mouse.move(visible.x+visible.width*.45,visible.y+visible.height*.5)
 await page.mouse.down();await page.mouse.move(visible.x+visible.width*.65,visible.y+visible.height*.5,{steps:12});await page.mouse.up()
 await expect.poll(async()=>Buffer.compare(before,await canvas.screenshot())).not.toBe(0)
 expect(box.width).toBeGreaterThan(200)
 await page.screenshot({path:'../../.superpowers/cinematic-pilot/roadster-3d-approved.png'})
 expect(errors).toEqual([])
})
test('Roadster remains usable when WebGL or the film is unavailable',async({page})=>{
 await page.addInitScript(()=>{
  const original=HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){
   if(kind==='webgl'||kind==='webgl2')return null
   return original.apply(this,[kind,...args] as never)
  } as typeof original
 })
 await page.route('**/*.mp4',r=>r.abort())
 await page.goto(view);await page.getByRole('button',{name:'Film',exact:true}).click()
 await expect(page.locator('#caption')).toContainText('Filmen kunde inte laddas')
 await page.getByRole('button',{name:'3D-vy',exact:true}).click()
 const frame=page.frameLocator('#screen iframe')
 await expect(frame.locator('#vehicle-fallback')).toBeVisible()
 await expect.poll(()=>frame.locator('#vehicle-fallback img').evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBeGreaterThan(0)
 await page.getByRole('button',{name:'Akter',exact:true}).click()
 await expect(page.locator('#screen img')).toBeVisible()
})
test('public pilot uses the same approved film and 3D with no private asset URLs',async({page})=>{
 const urls:string[]=[];page.on('request',r=>urls.push(r.url()))
 await page.goto('/bilhandlare/bilhall?view=roadster')
 await page.getByRole('button',{name:'3D-vy',exact:true}).click()
 await expect(page.frameLocator('#screen iframe').locator('#vehicle-stage')).toHaveAttribute('data-model3d-state','ready',{timeout:30000})
 expect(urls.some(url=>url.includes('/build/'))).toBe(false)
 await expect(page.getByRole('link',{name:'Hämta visningspaket'})).toHaveCount(0)
})
test('exported preset resolves its own images, video and 3D from a different URL root',async({page})=>{
 await page.goto('/__roadster-export/index.html')
 await page.getByRole('button',{name:'Film',exact:true}).click()
 await expect.poll(()=>page.locator('#screen video').evaluate((v:HTMLVideoElement)=>v.duration)).toBeGreaterThan(15)
 await page.getByRole('button',{name:'3D-vy',exact:true}).click()
 await expect(page.frameLocator('#screen iframe').locator('#vehicle-stage')).toHaveAttribute('data-model3d-state','ready',{timeout:30000})
})
