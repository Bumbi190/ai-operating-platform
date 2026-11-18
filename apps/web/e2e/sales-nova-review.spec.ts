import { test, expect } from '@playwright/test'

const APPROVAL_A = 'b0000000-0000-4000-8000-000000000021'
const APPROVAL_B = 'b0000000-0000-4000-8000-000000000022'
const APPROVAL_C = 'b0000000-0000-4000-8000-000000000023'

test('Nova reminds once, can be dismissed, and only returns for a new review',async({page})=>{
 let approvals = [APPROVAL_A, APPROVAL_B]
 const calls: string[] = []
 await page.route('**/api/sales/replies/review-notices',async route=>{
  calls.push(route.request().method())
  await route.fulfill({status:200,json:{
   state:'ok',pendingCount:approvals.length,approvalIds:approvals,mayHaveMore:false,
  }})
 })
 await page.goto('/sales?nova=1')
 const reminder = page.getByRole('complementary',{name:'Påminnelse från Nova om svarsgranskning'})
 await expect(reminder).toBeVisible()
 await expect(reminder.getByText(/2 svarsförslag väntar/)).toBeVisible()
 await expect(reminder.getByRole('link',{name:'Granska förslag'})).toHaveAttribute('href','/approvals?project=handlarborsen')
 await expect(reminder.getByText(/PRIVATE|sender|email/i)).toHaveCount(0)
 await reminder.getByRole('button',{name:'Dölj Novas påminnelse'}).click()
 await expect(reminder).toHaveCount(0)
 await page.reload()
 await expect(reminder).toHaveCount(0)
 // Resolving A must not resurrect the old notification for still-pending B.
 approvals=[APPROVAL_B]
 await page.reload()
 await expect(reminder).toHaveCount(0)
 approvals=[APPROVAL_B,APPROVAL_C]
 await page.reload()
 await expect(reminder.getByText(/2 svarsförslag väntar/)).toBeVisible()
 expect(calls.length).toBeGreaterThanOrEqual(3)
 expect(calls.every(x=>x==='GET')).toBe(true)
 await page.setViewportSize({width:390,height:844})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})

test('Nova does not invent an empty queue or show a reminder when owner read is unavailable',async({page})=>{
 let authorized=false
 await page.route('**/api/sales/replies/review-notices',r=>r.fulfill({
  status:authorized?503:404,json:{state:'unavailable'},
 }))
 await page.goto('/sales?nova=1')
 await expect(page.getByRole('complementary',{name:'Påminnelse från Nova om svarsgranskning'})).toHaveCount(0)
 authorized=true
 await page.reload()
 await expect(page.getByRole('complementary',{name:'Påminnelse från Nova om svarsgranskning'})).toHaveCount(0)
})

test('Nova browser notification contains no private data and fires once per new approval',async({page})=>{
 let approvals=[APPROVAL_A]
 await page.addInitScript(()=>{
  const notices: Array<{ title: string; body: string }> = []
  ;(window as any).__novaNotices = notices
  Object.defineProperty(window,'Notification',{configurable:true,value:class {
   static permission='granted'
   static requestPermission=async()=> 'granted'
   onclick: (()=>void)|null=null
   constructor(title:string,options?:NotificationOptions){notices.push({title,body:options?.body||''})}
   close(){}
  }})
 })
 await page.route('**/api/sales/replies/review-notices',route=>route.fulfill({json:{
  state:'ok',pendingCount:approvals.length,approvalIds:approvals,mayHaveMore:false,
 }}))
 await page.goto('/sales?nova=1')
 await expect.poll(()=>page.evaluate(()=>(window as any).__novaNotices.length)).toBe(1)
 const first=await page.evaluate(()=>(window as any).__novaNotices[0])
 expect(first).toEqual({title:'Nova · Handlarbörsen',body:expect.stringContaining('1 svarsförslag väntar')})
 expect(JSON.stringify(first)).not.toMatch(/dealer@|PRIVATE|Svar om pilot|subject/i)
 await page.reload()
 await expect.poll(()=>page.evaluate(()=>(window as any).__novaNotices.length)).toBe(0)
 approvals=[APPROVAL_A,APPROVAL_B]
 await page.reload()
 await expect.poll(()=>page.evaluate(()=>(window as any).__novaNotices.length)).toBe(1)
 expect(JSON.stringify(await page.evaluate(()=>(window as any).__novaNotices))).not.toMatch(/dealer@|PRIVATE|subject/i)
})
