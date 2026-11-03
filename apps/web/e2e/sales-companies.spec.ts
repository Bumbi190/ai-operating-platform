import {test,expect} from '@playwright/test'
const projectId='8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
const at='2026-11-03T10:00:00Z'
const row=(id:string,name:string,branch:string,status='unknown')=>({id,name,branch,city:null,orgnr:null,email:'public@dealer.example.com',websiteUrl:'https://dealer.example.com',sourceUrl:null,sourceLabel:'Omnira kontaktjournal',sourceObservedAt:at,contactId:null,status,badges:['Kontaktspärr'],matches:[],gaps:['Historiken är ofullständig.'],events:[],lastOutboundAt:null,lastInboundAt:null,earliestReviewAt:null,reviewNote:null,offerLabel:'6 månaders pilot',dialogContext:null})
const initial=()=>({projectId,evaluatedAt:at,rows:[row('1','Synthetic Malmö AB','Malmö','contacted'),row('2','Synthetic Lund AB','Lund')],sources:[{key:'contacts',label:'Omnira kontakter',state:'ready',observedAt:at,note:'Inte komplett mejlhistorik.'},{key:'registration',label:'Registrerade handlare',state:'incomplete',observedAt:'2026-10-29',note:'Ingen livekoppling.'}],uniqueRecipients:1,readOnly:true,sourceConfigured:true})

test('name, area, status and details work without business mutations',async({page})=>{
 const writes:string[]=[];page.on('request',r=>{if(r.method()!=='GET'&&new URL(r.url()).pathname.startsWith('/api/'))writes.push(r.url())})
 await page.route('**/fixture-companies',r=>r.fulfill({json:initial()}));await page.goto('/companies')
 await expect(page.getByRole('heading',{name:'Företag',exact:true})).toBeVisible()
 await page.screenshot({path:test.info().outputPath('company-directory.png'),fullPage:true})
 await page.getByLabel('Område i sparat underlag').fill('malmö');await expect(page.getByText('Synthetic Malmö AB',{exact:true})).toBeVisible();await expect(page.getByText('Synthetic Lund AB',{exact:true})).toHaveCount(0)
 await page.getByRole('button',{name:'Visa historik för Synthetic Malmö AB'}).click();await expect(page.getByText('Historiken är ofullständig.',{exact:true})).toBeVisible();await expect(page.getByText('Senast skickat',{exact:true})).toBeVisible();await expect(page.getByText('Ej verifierat i underlaget',{exact:true}).first()).toBeVisible()
 await page.getByLabel('Område i sparat underlag').fill('');await page.getByLabel('Kontaktstatus').selectOption('unknown');await expect(page.getByText('Synthetic Malmö AB',{exact:true})).toHaveCount(0);await expect(page.getByText('Synthetic Lund AB',{exact:true})).toBeVisible()
 await page.getByLabel('Sök i sparat underlag').fill('ingen träff');await expect(page.getByText('Inga företag matchar filtren.')).toBeVisible();expect(writes).toEqual([])
 await expect(page.getByRole('button',{name:/Skicka|Schemalägg|Godkänn kontakt/})).toHaveCount(0)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
})
test('ephemeral public search is explicit, scoped and has no save or send action',async({page})=>{
 const posts:unknown[]=[];await page.route('**/fixture-companies',r=>r.fulfill({json:initial()}));await page.route('**/api/sales/companies',async r=>{posts.push(r.request().postDataJSON());const d=initial();d.rows.push({...row('public:node/9','Unverified Public Dealer','Malmö'),websiteUrl:'javascript:alert(1)',sourceLabel:'Publik kartkälla / ej verifierad'});await r.fulfill({json:d})})
 await page.goto('/companies');expect(posts).toEqual([]);await page.getByRole('button',{name:'Sök i publik källa'}).click();await expect(page.getByText('Unverified Public Dealer',{exact:true})).toBeVisible();expect(posts).toEqual([{projectId,query:{city:'malmo',category:'car_dealer',radiusKm:5,limit:20}}]);await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);await expect(page.getByText('Urval ur kartkällan, inte alla bilhandlare.')).toBeVisible();await expect(page.getByRole('button',{name:/Spara|Kontakta|Skicka/})).toHaveCount(0)
})
test('unavailable source and provider failure remain visible; no automatic retry',async({page})=>{
 let attempts=0;await page.route('**/fixture-companies',r=>r.fulfill({json:{...initial(),rows:[],uniqueRecipients:null,sources:[{key:'contacts',label:'Omnira kontakter',state:'unavailable',observedAt:null,note:'Källa otillgänglig.'}]}}));await page.route('**/api/sales/companies',r=>{attempts++;return r.fulfill({status:503,json:{code:'DISCOVERY_PROVIDER_UNAVAILABLE'}})})
 await page.goto('/companies');await expect(page.getByRole('status')).toContainText('Källa otillgänglig.');await page.getByRole('button',{name:'Sök i publik källa'}).click();await expect(page.getByRole('alert')).toContainText('Källan kunde inte läsas');expect(attempts).toBe(1)
})
test('zero public results have an explicit completion message and coverage limit',async({page})=>{
 await page.route('**/fixture-companies',r=>r.fulfill({json:initial()}));await page.route('**/api/sales/companies',r=>r.fulfill({json:initial()}));await page.goto('/companies');await page.getByRole('button',{name:'Sök i publik källa'}).click();await expect(page.getByRole('status')).toContainText('0 källposter');await expect(page.getByText('Urval ur kartkällan, inte alla bilhandlare.')).toBeVisible()
})
