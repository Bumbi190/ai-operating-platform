import {test,expect} from '@playwright/test'
test('real video seeks forward and backward while catalog filtering stays functional',async({page})=>{
 await page.setViewportSize({width:1440,height:1000})
 await page.goto('/build/demo-motors/cinematic')
 const video=page.locator('#cinema-video')
 await expect(page.locator('#cinema-motion')).toHaveAttribute('aria-pressed','true')
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2)
 await expect.poll(()=>decodedFrame(page)).not.toBe('')
 const opening=await decodedFrame(page);expect(opening).not.toBe('')
 await page.screenshot({path:'../../.superpowers/cinematic-pilot/desktop.png',fullPage:false,animations:'disabled'})
 await page.evaluate(()=>window.scrollTo(0,document.getElementById('cinema-scene')!.offsetTop+innerHeight*.8))
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(1)
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true)
 await expect.poll(async()=>{const f=await decodedFrame(page);return f!==''&&f!==opening}).toBe(true)
 const forward=await decodedFrame(page);expect(forward).not.toBe('')
 await page.evaluate(()=>window.scrollTo(0,0))
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeLessThan(.2)
 await expect.poll(async()=>{const f=await decodedFrame(page);return f!==''&&f!==forward}).toBe(true)
 await page.locator('#fuel').selectOption('el')
 await expect(page.locator('.car:visible')).toHaveCount(3)
 await expect(page.locator('#count')).toHaveText('3 av 8 visas')
})
test('reduced motion makes no video request until explicit opt-in',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'})
 const requests:string[]=[]
 page.on('request',r=>{if(r.url().endsWith('.mp4'))requests.push(r.url())})
 await page.goto('/build/demo-motors/cinematic')
 const button=page.locator('#cinema-motion')
 await expect(button).toBeVisible()
 await expect(button).toHaveAttribute('aria-pressed','false')
 expect(requests).toHaveLength(0)
 expect(await page.locator('#cinema-video').getAttribute('src')).toBeNull()
 await button.click()
 await expect.poll(()=>requests.length).toBeGreaterThan(0)
})
test('data-saving connection retains poster without requesting the MP4',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true},configurable:true}))
 const requests:string[]=[]
 page.on('request',r=>{if(r.url().endsWith('.mp4'))requests.push(r.url())})
 await page.goto('/build/demo-motors/cinematic')
 await expect(page.locator('#cinema-motion')).toBeVisible()
 await expect(page.locator('#cinema-motion')).toHaveAttribute('aria-pressed','false')
 expect(requests).toHaveLength(0)
})
test('a failed video request keeps the poster and catalog navigation usable',async({page})=>{
 await page.route('**/cinematic/assets/*.mp4',r=>r.abort())
 await page.goto('/build/demo-motors/cinematic')
 await expect(page.locator('#cinema-motion')).toBeDisabled()
 await expect(page.locator('.cinema-poster')).toBeVisible()
 await expect(page.locator('#cinema-status')).toContainText('Stillbild visas')
 await page.locator('.cinema-actions a').click()
 await expect(page.locator('#inventory-heading')).toBeInViewport()
})
test('mobile starts with a lightweight poster and has no horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844})
 const requests:string[]=[]
 page.on('request',r=>{if(r.url().endsWith('.mp4'))requests.push(r.url())})
 await page.goto('/build/demo-motors/cinematic')
 await expect(page.locator('#cinema-motion')).toBeVisible()
 await expect(page.locator('#cinema-motion')).toHaveAttribute('aria-pressed','false')
 expect(requests).toHaveLength(0)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
 const bounds=await page.evaluate(()=>{
  const scene=document.getElementById('cinema-scene')!.getBoundingClientRect()
  const stage=document.querySelector('.cinema-stage')!.getBoundingClientRect()
  return {sceneBottom:scene.bottom,stageBottom:stage.bottom}
 })
 expect(bounds.stageBottom).toBeLessThanOrEqual(bounds.sceneBottom+1)
 await page.screenshot({path:'../../.superpowers/cinematic-pilot/mobile.png',fullPage:false,animations:'disabled'})
 await page.locator('.cinema-actions a').click()
 await expect(page.locator('#inventory-heading')).toBeInViewport()
})
test('a landscape touch phone also waits for explicit opt-in',async({browser})=>{
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true})
 const page=await context.newPage(),requests:string[]=[]
 page.on('request',r=>{if(r.url().endsWith('.mp4'))requests.push(r.url())})
 await page.goto('/build/demo-motors/cinematic')
 await expect(page.locator('#cinema-motion')).toBeVisible()
 await expect(page.locator('#cinema-motion')).toHaveAttribute('aria-pressed','false')
 expect(requests).toHaveLength(0)
 await context.close()
})
test('without JavaScript the real catalog and poster remain available',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false})
 const page=await context.newPage()
 await page.goto('/build/demo-motors/cinematic')
 await expect(page.locator('.cinema-poster')).toBeVisible()
 await expect(page.locator('#cinema-motion')).toBeHidden()
 await expect(page.locator('.car')).toHaveCount(8)
 await context.close()
})

async function decodedFrame(page:import('@playwright/test').Page){
 return page.locator('#cinema-video').evaluate((v:HTMLVideoElement)=>{
  if(v.readyState<2||v.seeking)return ''
  const c=document.createElement('canvas');c.width=32;c.height=18
  const x=c.getContext('2d')!;x.drawImage(v,0,0,32,18)
  return Array.from(x.getImageData(0,0,32,18).data).join(',')
 })
}

test('mobile Play visibly advances frames without scroll and Pause holds the film',async({page})=>{
 await page.setViewportSize({width:390,height:844})
 await page.goto('/build/demo-motors/cinematic')
 const play=page.locator('#cinema-play'),video=page.locator('#cinema-video')
 await expect(play).toBeVisible({timeout:1500})
 expect(await video.getAttribute('src')).toBeNull()
 await play.click()
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.paused)).toBe(false)
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.5)
 await expect.poll(()=>decodedFrame(page)).not.toBe('')
 const first=await decodedFrame(page)
 expect(first).not.toBe('')
 await expect.poll(async()=>{const frame=await decodedFrame(page);return frame!==''&&frame!==first}).toBe(true)
 await play.click()
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true)
 const stopped=await video.evaluate((v:HTMLVideoElement)=>v.currentTime)
 await page.waitForTimeout(350)
 expect(Math.abs(await video.evaluate((v:HTMLVideoElement)=>v.currentTime)-stopped)).toBeLessThan(.1)
})

test('chapter buttons and keyboard timeline reveal the actual interior before inventory',async({page})=>{
 await page.setViewportSize({width:1440,height:1000})
 await page.goto('/build/demo-motors/cinematic')
 const video=page.locator('#cinema-video')
 await expect(page.locator('#cinema-chapter-2')).toBeVisible({timeout:1500})
 await page.locator('#cinema-chapter-2').click()
 await expect(page.locator('#cinema-chapter-2')).toHaveAttribute('aria-current','step')
 await expect(page.locator('#cinema-copy-2')).toBeVisible()
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2)
 expect(await video.evaluate((v:HTMLVideoElement)=>v.duration)).toBeGreaterThan(12)
 await expect.poll(()=>decodedFrame(page)).not.toBe('')
 const interior=await decodedFrame(page)
 expect(interior).not.toBe('')
 await page.screenshot({path:'../../.superpowers/premium-showroom/interior-desktop.png',animations:'disabled'})
 await page.locator('#cinema-chapter-1').click()
 await expect(page.locator('#cinema-copy-1')).toBeVisible()
 await expect.poll(()=>decodedFrame(page)).not.toBe('')
 await page.screenshot({path:'../../.superpowers/premium-showroom/car-desktop.png',animations:'disabled'})
 await page.locator('#cinema-chapter-0').click()
 await expect(page.locator('#cinema-chapter-0')).toHaveAttribute('aria-current','step')
 await expect.poll(async()=>{const frame=await decodedFrame(page);return frame!==''&&frame!==interior}).toBe(true)
 await page.locator('#cinema-seek').press('End')
 await expect(page.locator('#cinema-chapter-2')).toHaveAttribute('aria-current','step')
 await page.locator('.cinema-actions a').click()
 await expect(page.locator('#inventory-heading')).toBeInViewport()
})

test('changing reduced motion stops explicit playback and restores the poster',async({page})=>{
 await page.goto('/build/demo-motors/cinematic')
 const play=page.locator('#cinema-play'),video=page.locator('#cinema-video')
 await expect(play).toBeVisible({timeout:1500})
 await play.click()
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.paused)).toBe(false)
 await page.emulateMedia({reducedMotion:'reduce'})
 await expect(video).toBeHidden()
 await expect(page.locator('#cinema-motion')).toHaveAttribute('aria-pressed','false')
 expect(await video.getAttribute('src')).toBeNull()
})

test('denied playback offers a real retry without claiming the tour is playing',async({page})=>{
 await page.addInitScript(()=>{HTMLMediaElement.prototype.play=function(){return Promise.reject(new Error('fixture playback denied'))}})
 await page.setViewportSize({width:390,height:844})
 await page.goto('/build/demo-motors/cinematic')
 await expect(page.locator('#cinema-play')).toBeVisible({timeout:1500})
 await page.locator('#cinema-play').click()
 await expect(page.locator('#cinema-status')).toContainText('kunde inte starta')
 await expect(page.locator('#cinema-play')).toBeEnabled()
 await expect(page.locator('#cinema-play')).toHaveAttribute('aria-pressed','false')
})

test('turning scroll off midway keeps poster and controls in the viewport',async({page})=>{
 await page.goto('/build/demo-motors/cinematic')
 const video=page.locator('#cinema-video')
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2)
 await page.evaluate(()=>{const s=document.getElementById('cinema-scene')!;window.scrollTo(0,s.offsetTop+(s.offsetHeight-innerHeight)*.6)})
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(2)
 await page.locator('#cinema-motion').click()
 await expect(page.locator('#cinema-play')).toBeInViewport()
 const bounds=await page.locator('.cinema-stage').boundingBox()
 expect(bounds!.y).toBeGreaterThanOrEqual(-2)
})

test('keyboard focus on the timeline stays synchronized while the movie plays',async({page})=>{
 await page.setViewportSize({width:390,height:844})
 await page.goto('/build/demo-motors/cinematic')
 await page.locator('#cinema-play').click()
 const video=page.locator('#cinema-video'),slider=page.locator('#cinema-seek')
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.3)
 await slider.focus()
 const initial=Number(await slider.inputValue())
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(1.5)
 expect(Number(await slider.inputValue())).toBeGreaterThan(initial+30)
})

test('landscape touch controls and timeline remain reachable midway through scroll',async({browser})=>{
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true})
 try{
 const page=await context.newPage();await page.goto('/build/demo-motors/cinematic')
 await page.locator('#cinema-motion').click()
 const video=page.locator('#cinema-video')
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2)
 await page.evaluate(()=>{const s=document.getElementById('cinema-scene')!;window.scrollTo(0,s.offsetTop+(s.offsetHeight-innerHeight)*.6)})
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(2)
 for(const id of ['cinema-play','cinema-seek']){
  const rect=await page.locator('#'+id).boundingBox()
  expect(rect!.y).toBeGreaterThanOrEqual(0)
  expect(rect!.y+rect!.height).toBeLessThanOrEqual(390)
 }
 }finally{await context.close()}
})


test('short portrait phone keeps the tour controls above the concept caption',async({browser})=>{
 const context=await browser.newContext({viewport:{width:320,height:568},isMobile:true,hasTouch:true})
 try{
  const page=await context.newPage();await page.goto('/build/demo-motors/cinematic')
  await page.locator('#cinema-motion').click()
  const video=page.locator('#cinema-video')
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2)
  await page.evaluate(()=>{const s=document.getElementById('cinema-scene')!;window.scrollTo(0,s.offsetTop+(s.offsetHeight-innerHeight)*.6)})
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(2)
  const caption=await page.locator('.cinema-caption').boundingBox()
  for(const id of ['cinema-play','cinema-motion','cinema-seek']){
   const r=await page.locator('#'+id).boundingBox()
   expect(r!.y).toBeGreaterThanOrEqual(0)
   expect(r!.y+r!.height).toBeLessThanOrEqual(Math.min(568,caption!.y-4))
  }
 }finally{await context.close()}
})

test('one wheel notch traverses intermediate decoded frames in both directions',async({page})=>{
 await page.goto('/build/demo-motors/cinematic')
 const trace=await page.locator('#cinema-video').evaluate(async(v:HTMLVideoElement)=>{
  const scene=document.getElementById('cinema-scene')!
  if(v.readyState<2)await new Promise(resolve=>v.addEventListener('loadeddata',resolve,{once:true}))
  window.scrollTo({top:0,behavior:'instant'})
  const move=async(top:number,target:number)=>{
   const frames:number[]=[]
   let callback=0
   const observe:VideoFrameRequestCallback=(_,frame)=>{
    frames.push(frame.mediaTime)
    callback=v.requestVideoFrameCallback(observe)
   }
   callback=v.requestVideoFrameCallback(observe)
   window.scrollTo({top,behavior:'instant'})
   const until=performance.now()+3000
   while(performance.now()<until && (!frames.length||Math.abs(frames[frames.length-1]-target)>.07)){
    await new Promise(resolve=>setTimeout(resolve,25))
   }
   v.cancelVideoFrameCallback(callback)
   return frames
  }
  const distance=160
  const position=distance/(scene.offsetTop+scene.offsetHeight-innerHeight)
  const target=position/(.75+.25*position)*(v.duration-.04)
  const forward=await move(distance,target)
  const backward=await move(0,0)
  return {target,forward,backward}
 })
 await test.info().attach('decoded-scroll-trace', {body:JSON.stringify(trace),contentType:'application/json'})
 for(const frames of [trace.forward,trace.backward]){
  expect(frames.filter(t=>t>.055&&t<trace.target-.055).length,JSON.stringify(trace)).toBeGreaterThanOrEqual(3)
 }
 expect(Math.abs(trace.forward.at(-1)!-trace.target)).toBeLessThan(.07)
 expect(trace.backward.at(-1)!).toBeLessThan(.07)
})

test('scroll still presents the requested view when browser playback is denied',async({page})=>{
 await page.addInitScript(()=>{
  HTMLMediaElement.prototype.play=()=>Promise.reject(new DOMException('Playback denied','NotAllowedError'))
 })
 await page.goto('/build/demo-motors/cinematic')
 const video=page.locator('#cinema-video')
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2)
 const target=await video.evaluate((v:HTMLVideoElement)=>{
  const s=document.getElementById('cinema-scene')!
  window.scrollTo({top:(s.offsetTop+s.offsetHeight-innerHeight)*(.75*.25/(1-.25*.25)),behavior:'instant'})
  return (v.duration-.04)*.25
 })
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement,t)=>Math.abs(v.currentTime-t),target)).toBeLessThan(.07)
 await expect.poll(()=>decodedFrame(page)).not.toBe('')
 await expect(page.locator('#cinema-motion')).toHaveAttribute('aria-pressed','true')
})

for(const width of [1440,390]){
 test('featured Nord R opens from its card with a real reference-based model and three views '+width,async({page})=>{
  await page.setViewportSize({width,height:width===390?844:1000})
  await page.goto('/build/demo-motors/cinematic')
  const trigger=page.locator('#lot-open'),dialog=page.locator('#lot-dialog')
  await trigger.scrollIntoViewIfNeeded()
  await page.screenshot({path:'../../.superpowers/premium-showroom/lot-card-'+width+'.jpg'})
  await trigger.click()
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('#lot-film')).toBeVisible()
  await expect(dialog.locator('iframe')).toHaveCount(0)
  const slider=dialog.locator('#lot-timeline')
  await slider.focus();await page.keyboard.press('End')
  await expect.poll(()=>dialog.locator('#lot-film').evaluate((v:HTMLVideoElement)=>v.duration-v.currentTime)).toBeLessThan(.12)
  await page.keyboard.press('Home')
  await expect.poll(()=>dialog.locator('#lot-film').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeLessThan(.12)
  await dialog.locator('#lot-stage').hover();await page.mouse.wheel(0,160)
  await expect.poll(()=>dialog.locator('#lot-film').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.3)
  const stage=await dialog.locator('#lot-stage').boundingBox()
  await page.mouse.move(stage!.x+stage!.width*.15,stage!.y+stage!.height*.45)
  await page.mouse.down();await page.mouse.move(stage!.x+stage!.width*.9,stage!.y+stage!.height*.45,{steps:8});await page.mouse.up()
  await expect.poll(()=>dialog.locator('#lot-film').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(5)
  await page.screenshot({path:'../../.superpowers/premium-showroom/entry-cabin-'+width+'.jpg'})
  await dialog.locator('#lot-orbit').click()
  const viewer=dialog.frameLocator('iframe')
  await expect(viewer.locator('#vehicle-stage')).toHaveAttribute('data-model3d-state','ready',{timeout:20000})
  const canvas=viewer.locator('canvas')
  await page.screenshot({path:'../../.superpowers/premium-showroom/lot-initial-'+width+'.jpg'})
  const before=await canvas.screenshot()
  const box=await dialog.locator('#lot-stage').boundingBox()
  await page.mouse.move(box!.x+box!.width*.38,box!.y+box!.height*.5)
  await page.mouse.down();await page.mouse.move(box!.x+box!.width*.62,box!.y+box!.height*.5,{steps:7});await page.mouse.up()
  expect((await canvas.screenshot()).equals(before)).toBe(false)
  await page.screenshot({path:'../../.superpowers/premium-showroom/lot-model-'+width+'.jpg'})
  for(const angle of ['front','rear','cabin']){
   const thumb=dialog.locator('[data-lot-photo="'+angle+'"]')
   await thumb.click();await expect(dialog.locator('#lot-photo')).toHaveAttribute('src',(await thumb.locator('img').getAttribute('src'))!)
   await expect.poll(()=>dialog.locator('#lot-photo').evaluate((im:HTMLImageElement)=>im.naturalWidth)).toBeGreaterThan(1000)
  }
  await expect(dialog.locator('iframe')).toHaveCount(0)
  await dialog.getByRole('button',{name:'Köp direkt'}).click()
  await dialog.getByRole('button',{name:'Bekräfta demoköp'}).click()
  await expect(dialog.locator('#lot-result')).toContainText('549 000 kr')
  await dialog.getByRole('button',{name:'Lägg bud'}).click()
  await dialog.getByLabel('Ditt bud i kronor').fill('500000')
  await dialog.getByRole('button',{name:'Förhandsvisa bud'}).click()
  await expect(dialog.locator('#lot-result')).toContainText('Inget bud har skickats')
  await dialog.getByRole('button',{name:'Kontakta säljaren'}).click()
  await dialog.getByLabel('Meddelande till Demo Motors').fill('Finns bilen för visning?')
  await dialog.getByRole('button',{name:'Förhandsvisa meddelande'}).click()
  await expect(dialog.locator('#lot-result')).toContainText('Finns bilen för visning?')
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true)
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused()
 })
}
test('featured listing keeps the reference photos available if the private model fails',async({page})=>{
 await page.route('**/assets/3d/*.glb',r=>r.abort())
 await page.goto('/build/demo-motors/cinematic');await page.locator('#lot-open').click()
 await page.locator('#lot-orbit').click()
 await expect(page.locator('#lot-load')).toContainText('kunde inte laddas')
 await page.locator('[data-lot-photo="front"]').click();await expect(page.locator('#lot-photo')).toBeVisible()
 await page.locator('#lot-close').click();await expect(page.locator('#lot-open')).toBeFocused()
})

test('missing viewer module keeps the front photo and can retry into interactive 3D',async({page})=>{
 const script='**/assets/runtime/*.js'
 await page.route(script,r=>r.fulfill({status:500,body:''}))
 await page.goto('/build/demo-motors/cinematic')
 await page.locator('#lot-open').click()
 await page.locator('#lot-orbit').click()
 await expect(page.locator('#lot-load')).toContainText('kunde inte laddas')
 await expect(page.locator('#lot-photo')).toBeVisible()
 await page.unroute(script)
 await page.locator('#lot-orbit').click()
 await expect(page.frameLocator('#lot-stage iframe').locator('#vehicle-stage')).toHaveAttribute('data-model3d-state','ready',{timeout:20000})
 await expect(page.locator('#lot-stage iframe')).toBeVisible()
 await expect(page.locator('#lot-load')).toBeHidden()
})
test('the first wheel gesture advances the hero before the header has left the screen',async({page})=>{
 await page.goto('/build/demo-motors/cinematic')
 const video=page.locator('#cinema-video')
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2)
 const distance=await page.locator('#cinema-scene').evaluate(el=>Math.floor(el.getBoundingClientRect().top/2))
 expect(distance).toBeGreaterThan(10)
 await page.mouse.wheel(0,distance)
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.07)
 expect(await page.locator('#cinema-scene').evaluate(el=>el.getBoundingClientRect().top)).toBeGreaterThan(0)
})
test('listing tour waits on data saver and keeps photos if video fails',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true},configurable:true}))
 await page.route('**/cinematic/assets/nord-r.*.mp4',r=>r.abort())
 await page.goto('/build/demo-motors/cinematic');await page.locator('#lot-open').click()
 await expect(page.locator('#lot-film')).not.toHaveAttribute('src',/.+/)
 await page.locator('#lot-tour').click()
 await expect(page.locator('#lot-load')).toContainText('Filmen kunde inte laddas')
 await expect(page.locator('#lot-photo')).toBeVisible()
 await page.locator('[data-lot-photo="cabin"]').click()
 await expect(page.locator('#lot-photo')).toHaveAttribute('alt',/Kupén/)
})
test('Nord R warms at the card and reuses the decoded film across views and reopen',async({page})=>{
 await page.goto('/build/demo-motors/cinematic')
 const film=page.locator('#lot-film'),open=page.locator('#lot-open')
 await expect(film).not.toHaveAttribute('src',/.+/)
 await open.scrollIntoViewIfNeeded()
 await expect.poll(()=>film.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2)
 const loads=await film.evaluateHandle(v=>{
  const counter={value:0};v.addEventListener('loadstart',()=>counter.value++);return counter
 })
 await open.click();await expect(film).toBeVisible()
 await page.locator('#lot-timeline').press('End')
 await expect.poll(()=>film.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(7)
 await page.locator('[data-lot-photo="front"]').click()
 await page.locator('#lot-tour').click();await expect(film).toBeVisible()
 await page.locator('#lot-close').click();await open.click()
 await expect.poll(()=>film.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeLessThan(.07)
 expect(await loads.evaluate(counter=>counter.value)).toBe(0)
})
test('desktop advertising reel follows document scroll forward and backward',async({page})=>{
 await page.goto('/build/demo-motors/cinematic?view=visning')
 const film=page.locator('#reel')
 await expect(page.locator('#story')).toHaveClass('scroll')
 await expect.poll(()=>film.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2)
 await page.evaluate(()=>{const s=document.querySelector('#story')!;scrollTo(0,(s.clientHeight-innerHeight)*.72)})
 await expect.poll(()=>film.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(12)
 await expect(page.locator('#chapter')).toContainText('Fri 3D-vy')
 await page.evaluate(()=>scrollTo(0,0))
 await expect.poll(()=>film.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeLessThan(.12)
 await expect(page.getByRole('link',{name:'Prova Nord R själv'})).toHaveAttribute('href',/cinematic#lager$/)
})
test('mobile advertising reel waits for tap, plays the portrait edit and pauses',async({page})=>{
 await page.setViewportSize({width:390,height:844})
 const mp4:string[]=[];page.on('request',r=>{if(r.url().endsWith('.mp4'))mp4.push(r.url())})
 await page.goto('/build/demo-motors/cinematic?view=visning')
 const film=page.locator('#reel')
 await expect(page.getByRole('button',{name:'Spela filmen'})).toBeVisible()
 expect(mp4).toEqual([])
 await page.getByRole('button',{name:'Spela filmen'}).click()
 await expect.poll(()=>film.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.15)
 expect(await film.evaluate((v:HTMLVideoElement)=>v.videoHeight>v.videoWidth)).toBe(true)
 await page.getByRole('button',{name:'Pausa filmen'}).click()
 await expect.poll(()=>film.evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true)
 await expect(page.locator('#story')).not.toHaveClass('scroll')
})

test('desktop can switch to uninterrupted playback at the current chapter',async({page})=>{
 await page.goto('/build/demo-motors/cinematic?view=visning')
 const film=page.locator('#reel')
 await page.evaluate(()=>scrollTo(0,(document.querySelector('#story')!.clientHeight-innerHeight)*.5))
 await expect.poll(()=>film.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(8)
 await page.getByRole('button',{name:'Spela utan scroll'}).click()
 await expect(page.getByRole('button',{name:'Pausa filmen'})).toBeVisible()
 await expect.poll(()=>film.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(9.1)
 await page.getByRole('button',{name:'Styr med scroll'}).click()
 await expect(page.locator('#story')).toHaveClass('scroll')
 await expect.poll(()=>film.evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true)
 await expect.poll(()=>film.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(9)
})

test('dealer preview exposes key figures and a planning contact separately from the demo sale',async({page})=>{
 await page.setViewportSize({width:1280,height:800})
 await page.goto('/build/demo-motors/cinematic?view=visning')
 const contact=page.getByRole('link',{name:'Planera vår hemsida'})
 await expect(contact).toHaveCount(2)
 for(const link of await contact.all()){
  const url=new URL((await link.getAttribute('href'))!)
  expect(url.protocol).toBe('mailto:')
  expect(url.pathname).toBe('info@handlarborsen.se')
  expect(url.searchParams.get('subject')).toContain('hemsida')
 }
 await expect(page.locator('.factline')).toContainText('480 mil')
 await page.getByRole('link',{name:'Prova Nord R själv'}).click()
 await page.locator('#lot-open').click()
 const fits=await page.locator('#lot-dialog').evaluate(dialog=>{
  const bounds=dialog.getBoundingClientRect()
  return Array.from(dialog.querySelectorAll('.lot-header,.lot-info,.lot-sheet footer')).every(el=>{
   const r=el.getBoundingClientRect();return r.top>=bounds.top&&r.bottom<=bounds.bottom
  })
 })
 expect(fits).toBe(true)
 await page.setViewportSize({width:390,height:844})
 await expect(page.locator('.lot-keyfacts')).toBeInViewport()
})
