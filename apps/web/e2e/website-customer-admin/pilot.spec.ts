import {test,expect,type Page} from '@playwright/test'
import {readFileSync} from 'node:fs'
import path from 'node:path'

const origin=process.env.DEALER_PILOT_URL!
const slugA='bjorkglantan',slugB='strandvik'
const hall=(slug:string)=>'/hall/'+slug
const upload=(name:string)=>path.resolve(__dirname,'../website-catalog/assets/premium/'+name+'.webp')
const user=(key:'A'|'B'|'C')=>({
  email:process.env['DEALER_PILOT_'+key+'_EMAIL']!,password:process.env['DEALER_PILOT_'+key+'_PASSWORD']!,
})
async function login(p:Page,key:'A'|'B',slug:string){
  const account=user(key)
  await p.goto(hall(slug)+'/login')
  await p.locator('#login-form [name=email]').fill(account.email)
  await p.locator('#login-form [name=password]').fill(account.password)
  await p.locator('#login-form button[type=submit]').click()
  await expect(p).toHaveURL(origin+hall(slug)+'/admin')
}
const liveCard=(p:Page,id:string)=>p.locator('[data-vehicle-id="'+id+'"]').first()

test('two independent storefronts show their matching fictional inventory; the visitor cannot read drafts',async({page,request})=>{
  for(const [slug,brand,car] of [[slugA,'Björkgläntans Demobilar','Skog E'],[slugB,'Strandvik Motor','Kust Touring']]){
    await page.goto(hall(slug))
    await expect(page.locator('body')).toContainText(brand)
    await expect(page.locator('body')).toContainText(car)
    expect(await page.content()).not.toMatch(/Nord GT|Nord R|Demo Motors|id="vehicle-form"/)
    const image=page.locator('[data-vehicle-id] img').first()
    await image.evaluate((el:HTMLImageElement)=>el.decode())
    expect(await image.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(100)
    const admin=await request.get(hall(slug)+'/admin',{maxRedirects:0})
    expect(admin.status()).toBe(303)
    expect(admin.headers().location).toBe(hall(slug)+'/login')
  }
})

test('a dealer creates a two-photo draft, previews, publishes, changes price, marks sold and restores the public listing',async({browser,page,request})=>{
  const cardName='Skog E • provannons',base=hall(slugA)
  const visitor=await browser.newPage({baseURL:origin})
  const other=await browser.newPage({baseURL:origin})
  try{
    await login(other,'B',slugB); await login(page,'A',slugA)
    await page.getByRole('link',{name:'Ny annons',exact:true}).click()
    const form=page.locator('#vehicle-form')
    const id=await form.locator('[name=vehicleId]').inputValue()
    await form.locator('[name=name]').fill(cardName); await form.locator('[name=price]').fill('274000')
    await form.locator('[name=year]').fill('2025'); await form.locator('[name=mileage]').fill('810')
    await form.locator('[name=fuel]').selectOption('El')
    await form.locator('[name=photos]').setInputFiles([upload('concept-blue'),upload('concept-black')])
    await form.getByRole('button',{name:'Spara utkast'}).click()
    await expect(form.locator('[name=version]')).toHaveValue('1')
    await visitor.goto(base); await expect(liveCard(visitor,id)).toHaveCount(0)
    await page.getByRole('link',{name:'Förhandsgranska utkast'}).click()
    await expect(page.locator('[data-preview-banner]')).toBeVisible()
    await expect(liveCard(page,id)).toContainText(cardName)
    const expectedOrder=await page.locator('[data-vehicle-id]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-vehicle-id')))
    expect(expectedOrder.at(-1)).toBe(id)
    await expect(page.locator('[data-preview-banner] a').first()).toHaveAttribute('href',base+'/admin?bil='+id)
    const picture=await liveCard(page,id).locator('img').first().getAttribute('src')
    expect(picture).toMatch(/\/foto\/[a-f0-9]{64}\?utkast=1$/)
    const publicPicture=picture!.split('?')[0]
    expect((await request.get(publicPicture)).status()).toBe(404)
    expect((await request.get(picture!)).status()).toBe(401)
    expect((await other.request.get(picture!)).status()).toBe(403)
    expect((await other.request.get(base+'/admin?bil='+id)).status()).toBe(403)
    const wrong=await other.request.post(base+'/admin',{headers:{origin},form:{intent:'publish',vehicleId:id,version:'1'}})
    expect(wrong.status()).toBe(403)
    await page.goto(base+'/admin?bil='+id)
    await page.locator('#publish-form button[type=submit]').click()
    await expect(form.locator('[name=version]')).toHaveValue('2')
    await visitor.reload(); await expect(liveCard(visitor,id)).toContainText(cardName)
    await expect(liveCard(visitor,id)).toHaveAttribute('data-sold','false')
    expect(await visitor.locator('[data-vehicle-id]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-vehicle-id')))).toEqual(expectedOrder)
    expect((await request.get(publicPicture)).status()).toBe(200)
    // Replacing photos/price in a draft must not leak to the anonymous showroom.
    await form.locator('[name=price]').fill('269000')
    await form.locator('[name=sold]').check()
    await form.locator('[name=keepPhoto]').first().uncheck()
    await form.getByRole('button',{name:'Spara utkast'}).click()
    await expect(form.locator('[name=version]')).toHaveValue('3')
    await visitor.reload(); await expect(liveCard(visitor,id)).toHaveAttribute('data-sold','false')
    await expect(liveCard(visitor,id)).toContainText(/274\s?000/)
    const stale=await page.request.post(base+'/admin',{headers:{origin},form:{intent:'publish',vehicleId:id,version:'2'}})
    expect(stale.status()).toBe(409)
    await page.locator('#publish-form button[type=submit]').click()
    await expect(form.locator('[name=version]')).toHaveValue('4')
    await visitor.reload();await expect(liveCard(visitor,id)).toHaveAttribute('data-sold','true')
    await expect(liveCard(visitor,id)).toContainText(/269\s?000/)
    expect((await request.get(publicPicture)).status()).toBe(404)
    await page.getByText('Versionshistorik och återställning',{exact:true}).click()
    await page.locator('#restore-version').selectOption('2')
    await page.locator('#restore-form button[type=submit]').click()
    await expect(form.locator('[name=version]')).toHaveValue('5')
    await visitor.reload();await expect(liveCard(visitor,id)).toHaveAttribute('data-sold','false')
    await expect(liveCard(visitor,id)).toContainText(/274\s?000/)
    expect((await request.get(publicPicture)).status()).toBe(200)
    // Restoring the empty state withdraws the first publication and its photos.
    await page.getByText('Versionshistorik och återställning',{exact:true}).click()
    await page.locator('#restore-version').selectOption('0')
    await page.locator('#restore-form button[type=submit]').click()
    await visitor.reload();await expect(liveCard(visitor,id)).toHaveCount(0)
    expect((await request.get(publicPicture)).status()).toBe(404)
    await page.reload()
    await expect(page.locator('#vehicle-form [name=name]')).toHaveValue(cardName)
  }finally{await visitor.close();await other.close()}
})

test('mobile layout, invalid photo and session/logout keep the workspace private',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  await login(page,'B',slugB)
  await page.getByRole('link',{name:'Ny annons',exact:true}).click()
  const form=page.locator('#vehicle-form'), id=await form.locator('[name=vehicleId]').inputValue()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await form.locator('[name=name]').fill('Opublicerad provbil')
  await form.locator('[name=price]').fill('360000');await form.locator('[name=year]').fill('2025')
  await form.locator('[name=mileage]').fill('400')
  await form.locator('[name=photos]').setInputFiles({name:'bil.webp',mimeType:'image/webp',buffer:Buffer.from('<svg><script>alert(1)</script></svg>')})
  const [failed]=await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'),form.getByRole('button',{name:'Spara utkast'}).click()])
  expect(failed.status()).toBe(422)
  expect((await page.request.get(hall(slugB)+'/admin?bil='+id)).status()).toBe(404)
  const badOrigin=await page.request.post(hall(slugB)+'/admin',{headers:{origin:'http://other.invalid'},form:{intent:'publish',vehicleId:id,version:'0'}})
  expect(badOrigin.status()).toBe(403)
  await page.goto(hall(slugB)+'/admin')
  const oldCookies=(await page.context().cookies()).map(c=>c.name+'='+c.value).join('; ')
  await page.getByRole('button',{name:'Logga ut'}).click()
  const old=await page.request.get(hall(slugB)+'/admin',{headers:{cookie:oldCookies},maxRedirects:0})
  expect(old.status()).toBe(303)
})

test('real GoTrue identities, addon entitlement and storage grants also hold for direct REST clients',async({request})=>{
  const api=process.env.DEALER_PILOT_SUPABASE_URL!, anon=process.env.DEALER_PILOT_ANON_KEY!
  expect(api).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  const keys={apikey:anon,authorization:'Bearer '+anon}
  async function access(who:'A'|'B'|'C'){
    const r=await request.post(api+'/auth/v1/token?grant_type=password',{headers:keys,data:user(who)})
    expect(r.status()).toBe(200);return (await r.json()).access_token as string
  }
  const a=await access('A'),b=await access('B'),c=await access('C')
  async function rpc(name:string,token:string,data:unknown){
    return request.post(api+'/rest/v1/rpc/dealer_pilot_'+name,{headers:{apikey:anon,authorization:'Bearer '+token},data})
  }
  const own=await rpc('workspace',a,{p_slug:slugA});expect(own.status()).toBe(200)
  const first=(await own.json()).vehicles[0]
  for(const [token,slug] of [[b,slugA],[c,'ekbacken'],[a,slugB],[anon,slugA]]){
    const denied=await rpc('workspace',token,{p_slug:slug});expect([401,403]).toContain(denied.status())
  }
  const blob=readFileSync(upload('concept-silver')).toString('base64')
  for(const [name,args] of [
    ['edit',{p_vehicle:first.id,p_version:first.version,p_action:'publish',p_content:null,p_revision:null}],
    ['put_photo',{p_bytes:blob}],
  ] as const){
    const denied=await rpc(name,b,{p_slug:slugA,...args});expect(denied.status()).toBe(403)
  }
  const disabled=await request.post(hall('ekbacken')+'/login',{headers:{origin},form:user('C'),maxRedirects:0})
  expect(disabled.status()).toBe(403);expect(disabled.headers()['set-cookie']).toBeUndefined()
})
