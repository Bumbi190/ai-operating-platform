import {test,expect} from '@playwright/test'

for(const width of [390,1440]){
 test('exported Demo Motors GLB loads, is interactive and stays fictional at '+width,async({page,context},info)=>{
  test.setTimeout(60000)
  const errors:string[]=[],outside:string[]=[],network:string[]=[]
  page.on('pageerror',err=>errors.push(err.message))
  page.on('response',res=>{if(res.url().includes('/assets/3d/'))network.push(res.status()+' '+res.url())})
  await context.route('**/*',route=>{
   const u=new URL(route.request().url())
   if(u.hostname==='127.0.0.1'&&u.port==='19989')return route.continue()
   outside.push(route.request().url());return route.abort()
  })
  await page.setViewportSize({width,height:900})
  await page.goto('/index.html')
  await expect(page.locator('.notice')).toContainText('FIKTIV DEMO')
  await expect(page.locator('.car')).toHaveCount(8)
  await page.locator('#concept-01 summary').click()
  const root=page.locator('#concept-01-model3d')
  await expect(root).toHaveAttribute('data-model3d-state','ready',{timeout:18000})
  await expect(root.locator('canvas')).toBeVisible()
  await expect(page.locator('#concept-01-model3d-fallback')).toBeHidden()
  expect(await root.locator('canvas').evaluate(el=>(el as HTMLCanvasElement).width)).toBeGreaterThan(200)
  await expect(root.getByRole('status')).toContainText('3D-vy redo')
  await expect(page.locator('#concept-01')).toContainText('fiktiv')
  await expect(page.locator('#concept-01')).toContainText('inte en digital tvilling')
  await expect(page.getByText('AI-illustrationer, inte riktiga lagerbilar.')).toBeVisible()
  const canvas=root.locator('canvas'),bounds=await canvas.boundingBox()
  if(!bounds)throw Error('NO_3D_CANVAS')
  await page.mouse.move(bounds.x+bounds.width*.35,bounds.y+bounds.height*.5)
  await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.65,bounds.y+bounds.height*.5,{steps:8});await page.mouse.up()
  await page.mouse.wheel(0,130)
  await page.screenshot({path:info.outputPath('model3d-'+width+'.png'),animations:'disabled'})
  expect(errors).toEqual([])
  expect(outside).toEqual([])
  expect(network.some(url=>url.startsWith('200 ')&&url.endsWith('.glb'))).toBe(true)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 })
}

test('missing GLB returns the customer to a usable 360 sequence',async({page,context})=>{
 test.setTimeout(45000)
 const errors:string[]=[]
 page.on('pageerror',err=>errors.push(err.message))
 await context.route('**/*.glb',route=>route.fulfill({status:404,contentType:'text/plain',body:'Not found'}))
 await page.goto('/index.html')
 await page.locator('#concept-01 summary').click()
 const root=page.locator('#concept-01-model3d')
 await expect(root).toHaveAttribute('data-model3d-state','fallback',{timeout:15000})
 await expect(root).toHaveAttribute('data-model3d-reason','load')
 await expect(root).toBeHidden()
 await expect(page.locator('#concept-01-model3d-fallback')).toBeVisible()
 const spin=page.locator('#concept-01-spin-control')
 await expect(spin).toBeVisible()
 await spin.fill('7')
 await expect(page.locator('#concept-01-spin-7')).toBeVisible()
 expect(errors).toEqual([])
})

test('reduced motion keeps a usable manual 3D view',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'})
 await page.goto('/index.html')
 await page.locator('#concept-01 summary').click()
 await expect(page.locator('#concept-01-model3d')).toHaveAttribute('data-model3d-state','ready',{timeout:18000})
 await expect(page.locator('.model3d-canvas')).toBeVisible()
})

test('the protected Studio srcdoc preview also loads its governed GLB',async({page})=>{
 const diagnostics:string[]=[]
 page.on('console',message=>{if(message.type()==='error')diagnostics.push(message.text())})
 page.on('requestfailed',req=>diagnostics.push(req.url()+' '+(req.failure()?.errorText??'')))
 await page.goto('/preview')
 const frame=page.frameLocator('iframe[title="Skyddad byggpreview"]')
 await expect(frame.locator('.notice')).toContainText('FIKTIV DEMO')
 await frame.locator('#concept-01 summary').click()
 await expect(frame.locator('#concept-01-model3d')).toHaveAttribute('data-model3d-state','ready',{timeout:7000}).catch(err=>{throw Error(String(err)+'\nPreview diagnostics: '+diagnostics.join(' || '))})
 await expect(frame.locator('#concept-01-model3d-fallback')).toBeHidden()
 const previewFrame=page.frames().find(f=>f.parentFrame())!
 expect(await previewFrame.evaluate(()=>{try{void parent.document.body;return false}catch{return true}})).toBe(true)
})
