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
    const noPage=await rpc('page_workspace',token,{p_slug:slug});expect([401,403]).toContain(noPage.status())
    const noEdit=await rpc('page_edit',token,{p_slug:slug,p_version:0,p_action:'publish',p_content:null,p_revision:null})
    expect([401,403]).toContain(noEdit.status())
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

test('a dealer previews, publishes and restores site details independently of vehicle drafts and other dealers',async({browser,request})=>{
  const base=hall(slugA), editor=base+'/admin/sidan', preview=base+'/preview/sidan'
  const page=await browser.newPage({baseURL:origin,javaScriptEnabled:false})
  const visitor=await browser.newPage({baseURL:origin})
  const other=await browser.newPage({baseURL:origin})
  const site={heading:'Välkommen till Björkgläntan',description:'Här visas <em>våra bilar</em> i hallen.',
    hours:'Vardagar 09–18\nLördag 10–14',phone:'+46 (40) 12-34 56',email:'hallen@example.invalid',address:'Skogsvägen 2\nProvestad'}
  try {
    await login(other,'B',slugB);await login(page,'A',slugA)
    await page.setViewportSize({width:390,height:844})
    await page.getByRole('link',{name:'Sidan',exact:true}).click()
    await expect(page).toHaveURL(origin+editor)
    const form=page.locator('#page-form')
    await expect(form.locator('[name=version]')).toHaveValue('0')
    expect(await (await page.request.get(editor+'?klart=publish')).text()).not.toContain('Siduppgifterna är publicerade.')
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    expect((await page.request.get(preview)).status()).toBe(404)
    await visitor.goto(base)
    await expect(visitor.locator('#om-hallen')).toHaveCount(0)
    const pictures=(p:Page)=>p.locator('[data-vehicle-id] img').evaluateAll(imgs=>imgs.map(i=>i.getAttribute('src')))
    const publicPictures=await pictures(visitor)
    expect(publicPictures.length).toBeGreaterThan(0)
    const car=await visitor.locator('[data-vehicle-id]').first().getAttribute('data-vehicle-id')
    const oldTab=await page.context().newPage()
    await oldTab.goto(editor)
    for(const [name,value] of Object.entries(site))await form.locator('[name='+name+']').fill(value)
    await form.locator('button[type=submit]').click()
    await expect(form.locator('[name=version]')).toHaveValue('1')
    const stale=await oldTab.request.post(editor,{headers:{origin},form:{intent:'save',version:'0',...site,heading:'Gammal flik'}})
    expect(stale.status()).toBe(409)
    expect(await stale.text()).toContain('href="'+editor+'"')
    await oldTab.close()
    await page.locator('a[href="'+preview+'"]').first().click()
    const info=page.locator('#om-hallen')
    await expect(info).toContainText(site.heading)
    await expect(info).toContainText(site.description)
    await expect(info.locator('em')).toHaveCount(0)
    expect(await pictures(page)).toEqual(publicPictures)
    expect((await request.get(publicPictures[0]!)).status()).toBe(200)
    await expect(page.locator('[data-preview-banner] a').first()).toHaveAttribute('href',editor)
    expect((await request.get(preview,{maxRedirects:0})).status()).toBe(303)
    expect((await other.request.get(preview)).status()).toBe(403)
    expect((await other.request.post(editor,{headers:{origin},form:{intent:'publish',version:'1'}})).status()).toBe(403)
    expect(await (await request.get(base)).text()).not.toContain(site.email)
    expect(await (await page.request.get(base+'/preview?bil='+car)).text()).not.toContain(site.email)
    await page.goto(editor)
    await page.locator('#page-publish-form button[type=submit]').click()
    await expect(form.locator('[name=version]')).toHaveValue('2')
    await visitor.reload()
    const published=visitor.locator('#om-hallen')
    await expect(published).toContainText('Lördag 10–14')
    await expect(published.getByRole('link',{name:site.phone})).toHaveAttribute('href','tel:+4640123456')
    await expect(published.getByRole('link',{name:site.email})).toHaveAttribute('href','mailto:'+site.email)
    expect(await (await request.get(hall(slugB))).text()).not.toContain(site.email)
    for(const bad of [{email:'hall@example.invalid?bcc=third@example.invalid'},{phone:'12\n34'},{heading:'Rubrik\u0000'}]){
      const result=await page.request.post(editor,{headers:{origin},form:{...site,...bad,intent:'save',version:'2'}})
      expect(result.status()).toBe(422)
    }
    await form.locator('[name=hours]').fill('Söndag 12–16')
    await form.locator('button[type=submit]').click()
    await expect(form.locator('[name=version]')).toHaveValue('3')
    await visitor.reload();await expect(published).not.toContainText('Söndag')
    const carPreview=await page.request.get(base+'/preview?bil='+car)
    expect(await carPreview.text()).toContain('Lördag 10–14')
    await page.locator('#page-publish-form button[type=submit]').click()
    await expect(form.locator('[name=version]')).toHaveValue('4')
    await visitor.reload();await expect(published).toContainText('Söndag 12–16')
    async function restore(revision:string){
      const select=page.locator('#page-restore-version')
      if(!await select.isVisible())await page.locator('details:has(#page-restore-form) summary').click()
      await select.selectOption(revision)
      await page.locator('#page-restore-form button[type=submit]').click()
    }
    await restore('2')
    await visitor.reload();await expect(published).toContainText('Lördag 10–14')
    await restore('0')
    await visitor.reload();await expect(published).toHaveCount(0)
    expect(await pictures(visitor)).toEqual(publicPictures)
    await expect(form.locator('[name=heading]')).toHaveValue(site.heading)
  } finally {await page.close();await visitor.close();await other.close()}
})
