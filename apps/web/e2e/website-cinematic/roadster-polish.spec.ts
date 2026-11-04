import {test,expect} from '@playwright/test'
const view='/build/demo-motors/cinematic?view=roadster'

test('3D stops drawing at rest and keeps the render buffer bounded',async({page},info)=>{
 await page.addInitScript(()=>{
  const counts={draws:0}
  Object.assign(window,{roadsterDraws:counts})
  const proto=WebGL2RenderingContext.prototype
  const original=proto.drawElements
  proto.drawElements=function(...args:Parameters<WebGL2RenderingContext['drawElements']>){counts.draws++;return original.apply(this,args)}
 })
 await page.goto(view);await page.getByRole('button',{name:'3D-vy',exact:true}).click()
 const frame=page.frameLocator('#screen iframe')
 await expect(frame.locator('#vehicle-stage')).toHaveAttribute('data-model3d-state','ready',{timeout:30000})
 const canvas=frame.locator('canvas')
 await page.waitForTimeout(1400)
 const draws=()=>canvas.evaluate(()=> (window as unknown as {roadsterDraws:{draws:number}}).roadsterDraws.draws)
 const idle=await draws();expect(idle).toBeGreaterThan(0)
 await page.waitForTimeout(500);expect(await draws()).toBe(idle)
 expect(await canvas.evaluate((c:HTMLCanvasElement)=>c.width*c.height)).toBeLessThanOrEqual(1810000)
 await page.locator('#screen').screenshot({path:info.outputPath('roadster-front.png')})
 const visible=(await page.locator('#screen').boundingBox())!
 const height=(await canvas.boundingBox())!.height
 // Front three-quarter -> side: inspect how far the nozzle lips protrude.
 const delta=(Math.atan2(1.55,-1.85)-Math.PI)/(2*Math.PI)*height
 await page.mouse.move(visible.x+visible.width*.6,visible.y+visible.height*.5)
 await page.mouse.down()
 await page.mouse.move(visible.x+visible.width*.6+delta,visible.y+visible.height*.5,{steps:20})
 await page.mouse.up()
 await page.waitForTimeout(1400)
 expect(await draws()).toBeGreaterThan(idle)
 await page.locator('#screen').screenshot({path:info.outputPath('roadster-side.png')})
 const settled=await draws()
 await page.waitForTimeout(500);expect(await draws()).toBe(settled)
})

test('scroll presents intermediate film frames and settles after a rapid reversal',async({page})=>{
 await page.goto(view);await page.getByRole('button',{name:'Film',exact:true}).click()
 const video=page.locator('#screen video')
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2)
 await video.evaluate((v:HTMLVideoElement)=>{
  const metrics={frames:0,seeks:0};Object.assign(v,{scrollMetrics:metrics})
  v.addEventListener('seeking',()=>metrics.seeks++)
  const sample=()=>{metrics.frames++;if(v.isConnected)v.requestVideoFrameCallback(sample)}
  v.requestVideoFrameCallback(sample)
 })
 await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight))
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(15)
 const metrics=await video.evaluate(v=>(v as HTMLVideoElement & {scrollMetrics:{frames:number;seeks:number}}).scrollMetrics)
 expect(metrics.frames).toBeGreaterThan(20)
 expect(metrics.seeks).toBeLessThan(3)
 // Keep only the final target when direction changes during a decoder seek.
 await page.evaluate(()=>scrollTo(0,document.querySelector('#track')!.getBoundingClientRect().top+scrollY))
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeLessThan(10)
 await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight))
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(15)
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true)
})
