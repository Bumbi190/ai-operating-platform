import {test,expect} from '@playwright/test'
import {FAMILY_WEEKLY_PROJECT_ID as FAMILY} from '../lib/social-launch/weekly/auto-preparation'

const inactive={
 available:true,runtimeEnabled:false,enabled:false,status:'not_configured',
 canSchedule:false,canPublish:false,reviewNoticesAvailable:true,reviewNotices:[],
}
const active={...inactive,enabled:true,status:'active',validUntil:'2027-03-02T12:00:00.000Z'}
const revoked={...inactive,status:'revoked',validUntil:null}
const url='**/api/social-weekly-automation'

test('flag-off status never offers a consent action or dispatches a write',async({page})=>{
 let posts=0
 await page.route(url,route=>{
  if(route.request().method()==='POST')posts++
  return route.fulfill({json:{...inactive,available:false,status:'not_configured'}})
 })
 await page.goto('/weekly-consent')
 await expect(page.getByText('Funktionen är under säkerhetsgranskning och kan inte aktiveras ännu.')).toBeVisible()
 await expect(page.getByRole('button',{name:'Godkänn automatiska veckoutkast'})).toHaveCount(0)
 expect(posts).toBe(0)
})

test('flag OFF with unreadable consent never claims revoked; allows owner retry',async({page})=>{
 let reads=0,posts=0
 await page.route(url,route=>{
  if(route.request().method()==='POST'){posts++;return route.fulfill({status:503,json:{code:'UNAVAILABLE'}})}
  reads++
  return route.fulfill({json:reads===1
   ? {...inactive,available:false,status:'unavailable',reviewNoticesAvailable:false}
   : {...active,available:false,reviewNoticesAvailable:false,reviewNotices:[]}})
 })
 await page.goto('/weekly-consent')
 await expect(page.getByText('Kunde inte kontrollera inställningen')).toBeVisible()
 await expect(page.getByRole('button',{name:'Godkänn automatiska veckoutkast'})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Återkalla godkännande'})).toHaveCount(0)
 await page.getByRole('button',{name:'Kontrollera sparad status'}).click()
 await expect(page.getByText('Du har godkänt veckoutkast')).toBeVisible()
 await expect(page.getByRole('button',{name:'Återkalla godkännande'})).toBeVisible()
 expect({reads,posts}).toEqual({reads:2,posts:0})
})

test('feature OFF still shows an existing consent and permits revoke, never a new enable',async({page})=>{
 let current:Record<string,unknown>={...active,available:false,
  reviewNoticesAvailable:false,reviewNotices:[]}
 const writes:Record<string,unknown>[]=[]
 await page.route(url,route=>{
  if(route.request().method()==='GET')return route.fulfill({json:current})
  const body=route.request().postDataJSON() as Record<string,unknown>
  writes.push(body)
  current={...revoked,available:false,reviewNoticesAvailable:false,reviewNotices:[]}
  return route.fulfill({json:current})
 })
 await page.goto('/weekly-consent')
 await expect(page.getByText('Du har godkänt veckoutkast')).toBeVisible()
 await expect(page.getByText('Funktionen är under säkerhetsgranskning och kan inte aktiveras ännu.')).toBeVisible()
 await expect(page.getByRole('button',{name:'Godkänn automatiska veckoutkast'})).toHaveCount(0)
 await page.getByRole('button',{name:'Återkalla godkännande'}).click()
 await expect(page.getByText('Ditt tidigare godkännande är återkallat')).toBeVisible()
 await expect(page.getByRole('button',{name:'Återkalla godkännande'})).toHaveCount(0)
 expect(writes).toEqual([{projectId:FAMILY,operation:'revoke'}])
})

test('explicit owner consent, review notice and independently confirmed revoke',async({page})=>{
 let current:Record<string,unknown>={...inactive}
 const writes:Array<Record<string,unknown>>=[]
 await page.route(url,route=>{
  const request=route.request()
  if(request.method()==='GET')return route.fulfill({json:current})
  const body=request.postDataJSON() as Record<string,unknown>
  writes.push(body)
  if(body.operation==='enable')current={...active,reviewNotices:[{
   preparationId:'99999999-9999-4999-8999-999999999999',
   weekStart:'2027-01-04',draftCount:4,
   workspaceUrl:'https://app.omniraos.se/projects/familje-stunden/social#content',
  }]}
  else if(body.operation==='revoke')current={...revoked}
  return route.fulfill({json:current})
 })
 await page.goto('/weekly-consent')
 const grant=page.getByRole('button',{name:'Godkänn automatiska veckoutkast'})
 await expect(grant).toBeDisabled()
 await page.getByRole('checkbox',{name:/Jag godkänner att Atlas får förbereda/}).check()
 await grant.click()
 await expect(page.getByText('Du har godkänt veckoutkast')).toBeVisible()
 await expect(page.getByText('Automatiska körningar är ännu inte påslagna av systemet.')).toBeVisible()
 await expect(page.getByText('Veckan 2027-01-04: 4 utkast.')).toBeVisible()
 await expect(page.getByRole('link',{name:'Granska utkasten'}))
  .toHaveAttribute('href','/projects/familje-stunden/social#content')
 await page.getByRole('button',{name:'Återkalla godkännande'}).click()
 await expect(page.getByText('Ditt tidigare godkännande är återkallat')).toBeVisible()
 expect(writes).toEqual([
  {projectId:FAMILY,operation:'enable',confirmed:true},
  {projectId:FAMILY,operation:'revoke'},
 ])
})

test('ambiguous POST receipt disables decisions until saved state is reread; never retries',async({page})=>{
 let current:Record<string,unknown>={...inactive}
 let postCount=0,getCount=0
 await page.route(url,route=>{
  const req=route.request()
  if(req.method()==='GET'){getCount++;return route.fulfill({json:current})}
  postCount++
  current={...active}
  return route.fulfill({status:503,json:{code:'ENROLLMENT_UNAVAILABLE'}})
 })
 await page.goto('/weekly-consent')
 await page.getByRole('checkbox',{name:/Jag godkänner att Atlas får förbereda/}).check()
 await page.getByRole('button',{name:'Godkänn automatiska veckoutkast'}).click()
 await expect(page.getByRole('alert')).toContainText('Ändringen kan redan ha sparats')
 await expect(page.getByRole('button',{name:'Godkänn automatiska veckoutkast'})).toHaveCount(0)
 expect(postCount).toBe(1)
 await page.getByRole('button',{name:'Kontrollera sparad status'}).click()
 await expect(page.getByText('Du har godkänt veckoutkast')).toBeVisible()
 expect({postCount,getCount}).toEqual({postCount:1,getCount:2})
})

test('revoke remains possible when scheduling panel is disabled',async({page})=>{
 let current:Record<string,unknown>={...active}
 let posts:Record<string,unknown>[]=[]
 await page.route(url,route=>{
  const req=route.request()
  if(req.method()==='GET')return route.fulfill({json:current})
  const body=req.postDataJSON() as Record<string,unknown>
  posts.push(body);current={...revoked}
  return route.fulfill({json:current})
 })
 await page.goto('/weekly-consent?disabled=1')
 const revoke=page.getByRole('button',{name:'Återkalla godkännande'})
 await expect(revoke).toBeEnabled()
 await revoke.click()
 await expect(page.getByText('Ditt tidigare godkännande är återkallat')).toBeVisible()
 await expect(page.getByRole('button',{name:'Godkänn automatiska veckoutkast'})).toBeDisabled()
 expect(posts).toEqual([{projectId:FAMILY,operation:'revoke'}])
})

test('ambiguous revoke requires a fresh owner read before any new action',async({page})=>{
 let current:Record<string,unknown>={...active}, posts=0
 await page.route(url,route=>{
  if(route.request().method()==='GET')return route.fulfill({json:current})
  posts++;current={...revoked}
  return route.fulfill({status:503,json:{code:'ENROLLMENT_UNAVAILABLE'}})
 })
 await page.goto('/weekly-consent')
 await page.getByRole('button',{name:'Återkalla godkännande'}).click()
 await expect(page.getByRole('alert')).toContainText('Ändringen kan redan ha sparats')
 await expect(page.getByRole('button',{name:'Återkalla godkännande'})).toHaveCount(0)
 await page.getByRole('button',{name:'Kontrollera sparad status'}).click()
 await expect(page.getByText('Ditt tidigare godkännande är återkallat')).toBeVisible()
 expect(posts).toBe(1)
})

test('foreign project component performs no owner API call',async({page})=>{
 let requests=0
 await page.route(url,route=>{requests++;return route.fulfill({json:inactive})})
 await page.goto('/weekly-consent?foreign=1')
 await expect(page.getByRole('region',{name:'Atlas automatiska veckoutkast'})).toHaveCount(0)
 expect(requests).toBe(0)
})

test('invalid read does not render unsafe status and permits manual verification',async({page})=>{
 let reads=0
 await page.route(url,route=>{
  reads++
  return route.fulfill({json:reads===1?{...active,canPublish:true}:inactive})
 })
 await page.goto('/weekly-consent')
 await expect(page.getByRole('alert')).toContainText('Kunde inte kontrollera')
 await expect(page.getByRole('button',{name:'Återkalla godkännande'})).toHaveCount(0)
 await page.getByRole('button',{name:'Kontrollera sparad status'}).click()
 await expect(page.getByText('Inte aktiverad',{exact:true})).toBeVisible()
 expect(reads).toBe(2)
})

test('malformed review notices fail closed without showing owner actions',async({page})=>{
 await page.route(url,route=>route.fulfill({json:{...active,reviewNotices:'corrupt'}}))
 await page.goto('/weekly-consent')
 await expect(page.getByRole('alert')).toContainText('Kunde inte kontrollera')
 await expect(page.getByRole('button',{name:'Återkalla godkännande'})).toHaveCount(0)
 await expect(page.getByRole('link',{name:'Granska utkasten'})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Kontrollera sparad status'})).toBeVisible()
})
