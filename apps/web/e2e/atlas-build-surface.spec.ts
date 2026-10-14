import {expect,test} from '@playwright/test'
test('a historical build has one Atlas composer and preview controls',async({page})=>{
 await page.goto('/')
 await expect(page.getByRole('region',{name:'Arkitekturplan'})).toBeVisible()
 await expect(page.getByLabel('Meddelande till Atlas')).toBeVisible()
 await expect(page.getByLabel('Feedback till Atlas')).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Dölj preview'})).toBeVisible()
 await page.getByRole('button',{name:'Dölj preview'}).click()
 await expect(page.getByRole('button',{name:'Visa preview'})).toBeVisible()
 await page.getByRole('button',{name:'Visa preview'}).click()
 await expect(page.getByRole('region',{name:'Preview'})).toBeVisible()
})
for(const width of [390,980,1440])test('conversation and preview fit '+width,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/')
 await expect(page.getByLabel('Meddelande till Atlas')).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.screenshot({path:'../../.superpowers/sdd/2026-10-14-atlas-conversation-build/surface-'+width+'.png',fullPage:true})
})
test('feedback follows the actual rendered preview while the new selection loads',async({page,request})=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:'Bygg med Atlas'})).toBeVisible()
 const id=new URL(page.url()).searchParams.get('session')!
 await request.get('/__fixture/step/'+id+'/commit')
 await expect(page.getByTitle('Webbpreview version 1')).toBeVisible()
 const first=await (await request.get('/api/website-builds/'+id+'?projectId=10000000-0000-4000-8000-000000000001')).json()
 const rendered=first.activePreviewRevisionId
 await page.getByLabel('Meddelande till Atlas').fill('Ny rubrik')
 await page.getByRole('button',{name:'Skicka',exact:true}).click()
 await expect(page.getByText('Mottagen',{exact:true})).toBeVisible()
 let release!:()=>void;const hold=new Promise<void>(r=>release=r),bodies:any[]=[]
 await page.route('**/revisions/*?projectId=*',async route=>{if(route.request().url().includes('/'+rendered+'?'))return route.continue();await hold;await route.continue()})
 page.on('request',req=>{if(req.url().endsWith('/api/chat')&&req.method()==='POST')bodies.push(req.postDataJSON())})
 try{
  await request.get('/__fixture/step/'+id+'/commit')
  await expect(page.getByText(/Hämtar vald version/)).toBeVisible()
  await expect(page.getByTitle('Webbpreview version 1')).toBeVisible()
  await page.getByLabel('Meddelande till Atlas').fill('Ändring under laddningen')
  await page.getByRole('button',{name:'Skicka',exact:true}).click()
  await expect.poll(()=>bodies.length).toBe(1)
  expect(bodies[0].buildContext.viewedRevisionId).toBe(rendered)
  const saved=await (await request.get('/api/website-builds/'+id+'?projectId=10000000-0000-4000-8000-000000000001')).json()
  expect(saved.feedback.at(-1).viewedRevisionId).toBe(rendered)
 }finally{release()}
 await expect(page.getByTitle('Webbpreview version 2')).toBeVisible()
})
