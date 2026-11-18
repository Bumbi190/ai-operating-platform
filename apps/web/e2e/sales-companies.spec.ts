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
 await page.getByLabel('Filtrera sparade företag').fill('ingen träff');await expect(page.getByText('Inga företag matchar filtren.')).toBeVisible();expect(writes).toEqual([])
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
test('configured SCB is the first search; municipal results and next page need explicit clicks',async({page})=>{
 const posts:Record<string,unknown>[]=[]
 await page.route('**/fixture-companies',r=>r.fulfill({json:{...initial(),searchProvider:'scb'}}))
 await page.route('**/api/sales/companies',r=>{const body=r.request().postDataJSON();posts.push(body);const offset=Number(body.offset??0);return r.fulfill({json:{...initial(),searchProvider:'scb',rows:[...initial().rows,{...row('public:scb/'+offset,'SCB Dealer '+offset,'Malmö'),city:'Malmö',orgnr:'5568357585',workplaceRef:'65854218',sourceLabel:'SCB:s företagsregister / aktuell sökning'}],searchMeta:{provider:'scb',areaLabel:'Malmö kommun',offset,pageSize:5,nextOffset:offset===0?5:null,matchedWorkplaces:10,scannedRows:7614,pages:2,truncated:false,skippedInPage:0}}})})
 await page.goto('/companies');await expect(page.getByRole('button',{name:'Sök bilhandlare',exact:true})).toBeEnabled();await expect(page.getByLabel('Kommun',{exact:true})).toBeVisible();await expect(page.getByLabel('Radie från ortens centrum (km)')).toHaveCount(0)
 expect(posts).toEqual([]);await page.getByRole('button',{name:'Sök bilhandlare',exact:true}).click();await expect(page.getByText('SCB Dealer 0',{exact:true})).toBeVisible();expect(posts[0]).toMatchObject({query:{municipalityCode:'1280',category:'car_dealer',limit:5}})
 await page.getByRole('button',{name:'Nästa 5 registerträffar'}).click();await expect(page.getByText('SCB Dealer 5',{exact:true})).toBeVisible();expect(posts[1]).toMatchObject({offset:5});await expect(page.getByText('SCB Dealer 0',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Nästa 5 registerträffar'})).toHaveCount(0)
})

test('all municipalities are searchable and saved-name matches never claim area coverage',async({page})=>{
 const posts:unknown[]=[];await page.route('**/fixture-companies',r=>r.fulfill({json:{...initial(),searchProvider:'scb',rows:[row('1','Newman Bil Hässleholm','')]}}));await page.route('**/api/sales/companies',r=>{posts.push(r.request().postDataJSON());return r.fulfill({json:{...initial(),searchProvider:'scb'}})})
 await page.goto('/companies');await page.getByLabel('Filtrera sparade företag').fill('hässleholm');await expect(page.getByText('Detta är bara sparade poster, inte alla företag i Hässleholm.',{exact:true})).toBeVisible();expect(posts).toEqual([])
 const kommun=page.getByLabel('Kommun',{exact:true});await kommun.fill('Hässleholm');await page.screenshot({path:test.info().outputPath('municipality-search.png'),fullPage:true});await page.getByRole('button',{name:'Sök bilhandlare',exact:true}).click();expect(posts[0]).toEqual({projectId,query:{municipalityCode:'1293',category:'car_dealer',limit:5}})
 await kommun.fill('Kristianstad');await page.getByRole('button',{name:'Sök bilhandlare',exact:true}).click();expect(posts[1]).toEqual({projectId,query:{municipalityCode:'1290',category:'car_dealer',limit:5}})
 await kommun.fill('Påhittad kommun');await expect(page.getByRole('button',{name:'Sök bilhandlare',exact:true})).toBeDisabled();expect(posts).toHaveLength(2)
})

test('industry changes reset results and pagination and use the selected SCB category',async({page})=>{
 const posts:Record<string,any>[]=[]
 await page.route('**/fixture-companies',r=>r.fulfill({json:{...initial(),searchProvider:'scb'}}))
 await page.route('**/api/sales/companies',r=>{const body=r.request().postDataJSON();posts.push(body);return r.fulfill({json:{...initial(),searchProvider:'scb',rows:[{...row('public:scb/1','Synthetic '+body.query.category,'Hässleholm'),city:'Hässleholm'}],searchMeta:{provider:'scb',areaLabel:'Hässleholm kommun',category:body.query.category,industryLabel:body.query.category,sniCode:'56.110',offset:body.offset??0,pageSize:5,nextOffset:5,matchedWorkplaces:8,scannedRows:8,pages:1,truncated:false,skippedInPage:0}}})})
 await page.goto('/companies');await page.getByLabel('Kommun',{exact:true}).fill('Hässleholm');await page.getByLabel('Bransch',{exact:true}).selectOption('restaurant');expect(posts).toHaveLength(0)
 await page.getByRole('button',{name:'Sök restauranger',exact:true}).click();await expect(page.getByText('Synthetic restaurant',{exact:true})).toBeVisible();expect(posts[0]).toEqual({projectId,query:{municipalityCode:'1293',category:'restaurant',limit:5}})
 await page.getByLabel('Bransch',{exact:true}).selectOption('hairdresser');await expect(page.getByText('Synthetic restaurant',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Nästa 5 registerträffar'})).toHaveCount(0);expect(posts).toHaveLength(1)
 await page.getByRole('button',{name:'Sök frisörer och barberare',exact:true}).click();await expect(page.getByText('Synthetic hairdresser',{exact:true})).toBeVisible();expect(posts[1].query.category).toBe('hairdresser');expect(posts[1].offset).toBeUndefined()
 await page.getByLabel('Kommun',{exact:true}).fill('Kristianstad');await expect(page.getByText('Synthetic hairdresser',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Nästa 5 registerträffar'})).toHaveCount(0)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
})

test('project choice uses verified routes and displays the missing Webbuilder registration',async({page})=>{
 const other='10000000-0000-4000-8000-000000000002'
 await page.route('**/fixture-companies',r=>r.fulfill({json:{...initial(),searchProvider:'scb',project:{id:projectId,name:'Handlarbörsen',slug:'handlarborsen'},projectOptions:[{id:projectId,name:'Handlarbörsen',slug:'handlarborsen'},{id:other,name:'Synthetic Service',slug:'synthetic-service'}]}}))
 await page.route('**/projects/synthetic-service/companies',r=>r.fulfill({contentType:'text/html',body:'<h1>Synthetic Service directory</h1>'}))
 await page.goto('/companies');await expect(page.getByText(/Webbuilder saknar ännu ett verifierat projekt/)).toBeVisible();await page.screenshot({path:test.info().outputPath('industry-project-search.png'),fullPage:true})
 await page.getByLabel('Projekt för underlaget',{exact:true}).selectOption(other);await expect(page).toHaveURL(/\/projects\/synthetic-service\/companies$/);await expect(page.getByRole('heading',{name:'Synthetic Service directory'})).toBeVisible()
})

test('a successful response for another project never renders its companies',async({page})=>{
 let attempts=0
 await page.route('**/fixture-companies',r=>r.fulfill({json:{...initial(),searchProvider:'scb'}}))
 await page.route('**/api/sales/companies',r=>{attempts++;return r.fulfill({json:{...initial(),projectId:'10000000-0000-4000-8000-000000000099',rows:[row('public:scb/foreign','Foreign private company','')]}})})
 await page.goto('/companies');await page.getByRole('button',{name:'Sök bilhandlare',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Källan kunde inte läsas');await expect(page.getByText('Foreign private company',{exact:true})).toHaveCount(0);expect(attempts).toBe(1)
})


test('same-company workplaces remain visibly distinct and municipal source coverage is explicit',async({page})=>{
 const branches=[{...row('public:scb/10000001','Synthetic Chain AB','Centrum'),city:'Hässleholm',workplaceRef:'10000001'},{...row('public:scb/10000002','Synthetic Chain AB','Stationen'),city:'Hässleholm',workplaceRef:'10000002'}]
 await page.route('**/fixture-companies',r=>r.fulfill({json:{...initial(),searchProvider:'scb'}}));await page.route('**/api/sales/companies',r=>r.fulfill({json:{...initial(),rows:branches,searchProvider:'scb',searchMeta:{provider:'scb',sourceScope:'municipality',municipalityCode:'1293',category:'restaurant',industryLabel:'Restauranger',sniCode:'56.110',areaLabel:'Hässleholm kommun',offset:0,pageSize:5,nextOffset:null,matchedWorkplaces:2,scannedRows:3200,pages:1,truncated:false,skippedInPage:0}}}))
 await page.goto('/companies');await page.getByLabel('Kommun',{exact:true}).fill('Hässleholm');await page.getByLabel('Bransch',{exact:true}).selectOption('restaurant');await page.getByRole('button',{name:'Sök restauranger',exact:true}).click()
 await expect(page.getByText('Arbetsställe: Centrum',{exact:true})).toBeVisible();await expect(page.getByText('Arbetsställe: Stationen',{exact:true})).toBeVisible();await expect(page.getByText('CFAR 10000001',{exact:true})).toBeVisible();await expect(page.getByText('CFAR 10000002',{exact:true})).toBeVisible()
 await expect(page.getByText(/Kommunurval från SCB: Hässleholm kommun/)).toBeVisible();await expect(page.getByText(/Olika arbetsställen kan tillhöra samma bolag/)).toBeVisible();await expect(page.getByText('Registerhämtningen nådde sin gräns.',{exact:false})).toHaveCount(0);await page.screenshot({path:test.info().outputPath('local-workplaces.png'),fullPage:true})
})


test('query state, missing branch names, diagnostics and empty reviewed pages are explicit',async({page})=>{
 let calls=0
 const unnamed={...row('public:scb/10000001','Synthetic Verified Legal AB',''),city:'Hässleholm',workplaceRef:'10000001'}
 const meta={provider:'scb',sourceScope:'municipality',municipalityCode:'1293',category:'car_dealer',industryLabel:'Bilhandlare',sniCodes:['47.811','46.711'],areaLabel:'Hässleholm kommun',offset:0,pageSize:5,nextOffset:5,matchedWorkplaces:15,scannedRows:8849,pages:2,truncated:false,skippedInPage:0,diagnostics:{municipalityRows:8849,industryRows:17,identityExcludedRows:2,missingCfarRows:0,duplicateRows:0,conflictingWorkplaces:0,unnamedWorkplaces:15,eligibleWorkplaces:15,reviewedInPage:1,legalReviewSkipped:0,returnedInPage:1}}
 await page.route('**/fixture-companies',r=>r.fulfill({json:{...initial(),searchProvider:'scb'}}))
 await page.route('**/api/sales/companies',r=>{calls++;return r.fulfill({json:{...initial(),searchProvider:'scb',rows:calls===1?[unnamed]:[],searchMeta:calls===1?meta:{...meta,skippedInPage:1,diagnostics:{...meta.diagnostics,legalReviewSkipped:1,returnedInPage:0}}}})})
 await page.goto('/companies');await page.getByLabel('Kommun',{exact:true}).fill('Hässleholm');await expect(page.getByText(/Ingen sökning har körts för de valda fälten/)).toBeVisible();expect(calls).toBe(0)
 await page.getByRole('button',{name:'Sök bilhandlare',exact:true}).click();await expect(page.getByText('Synthetic Verified Legal AB',{exact:true})).toBeVisible();await expect(page.getByText(/Arbetsställe: Namn saknas eller har utelämnats/)).toBeVisible();await expect(page.getByText('CFAR 10000001',{exact:true})).toBeVisible();await expect(page.getByText(/46.711/).first()).toBeVisible()
 await page.getByText('Så räknades sökresultatet',{exact:true}).click();await expect(page.getByText('17 poster med vald branschkod',{exact:true})).toBeVisible();await expect(page.getByText(/15 granskbara arbetsställen/)).toBeVisible()
 await page.getByRole('button',{name:'Sök bilhandlare',exact:true}).click();await expect(page.getByRole('heading',{name:'Inga granskbara företag på denna sida'})).toBeVisible();await expect(page.getByText('Synthetic Verified Legal AB',{exact:true})).toHaveCount(0);await page.screenshot({path:test.info().outputPath('search-diagnostics.png'),fullPage:true})
})

const websiteFixture=(enabled=true)=>({...initial(),websiteResearchConfigured:enabled,rows:[{...row('website-fixture','Synthetic Flowers AB','Centrum'),orgnr:'5568357585',workplaceRef:'10385441'}]})
const websiteEvidence={projectId,orgnr:'5568357585',workplaceRef:'10385441',legalName:'Synthetic Flowers AB',state:'identity_match',websiteUrl:'https://syntheticflowers.example.com/',sourceUrl:'https://syntheticflowers.example.com/',excerpt:'Företagets egna bolagsuppgifter finns på sidan.',checkedAt:'2026-11-04T11:00:00Z',providerCalls:2,outreachReady:false}
test('website research waits for an explicit per-company click and shows source evidence without contact permission',async({page})=>{
 const posts:unknown[]=[];let release!:()=>void;const gate=new Promise<void>(r=>{release=r})
 await page.route('**/fixture-companies',r=>r.fulfill({json:websiteFixture()}));await page.route('**/api/sales/companies/website',async r=>{posts.push(r.request().postDataJSON());await gate;return r.fulfill({json:websiteEvidence})})
 await page.goto('/companies');await page.getByText('Webbplatsunderlag',{exact:true}).click();expect(posts).toEqual([])
 await page.getByRole('button',{name:'Undersök webbplats',exact:true}).click();await expect(page.getByRole('button',{name:'Undersöker webbplats…',exact:true})).toBeDisabled();expect(posts).toEqual([{projectId,orgnr:'5568357585',workplaceRef:'10385441',confirmation:'UNDERSÖK WEBBPLATS'}]);release()
 await expect(page.getByText('Bolagsnamn och organisationsnummer hittade på sidan.',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Källa till webbplatsuppgifter'})).toHaveAttribute('href','https://syntheticflowers.example.com/');await expect(page.getByText(/Detta bevisar inte webbplatsägande/)).toBeVisible();await expect(page.getByRole('button',{name:/Spara|Skicka|Kontakta/})).toHaveCount(0)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath('website-evidence.png'),fullPage:true})
})
test('website source failures stay distinct from missing evidence and never retry automatically',async({page})=>{
 let calls=0;await page.route('**/fixture-companies',r=>r.fulfill({json:websiteFixture()}));await page.route('**/api/sales/companies/website',r=>{calls++;return calls===1?r.fulfill({status:503,json:{code:'COMPANY_WEBSITE_SOURCE_UNAVAILABLE'}}):r.fulfill({json:{...websiteEvidence,state:'no_match',websiteUrl:null,sourceUrl:null,excerpt:null}})})
 await page.goto('/companies');await page.getByText('Webbplatsunderlag',{exact:true}).click();await page.getByRole('button',{name:'Undersök webbplats',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Webbplatsunderlaget kunde inte läsas');expect(calls).toBe(1)
 await page.getByRole('button',{name:'Undersök webbplats',exact:true}).click();await expect(page.getByText(/Ingen webbplats kunde kopplas till bolaget i denna kontroll/)).toBeVisible();await expect(page.getByRole('link',{name:'Källa till webbplatsuppgifter'})).toHaveCount(0);expect(calls).toBe(2)
})
test('unconfigured website research is visible and cannot spend credits',async({page})=>{
 let calls=0;await page.route('**/fixture-companies',r=>r.fulfill({json:websiteFixture(false)}));await page.route('**/api/sales/companies/website',r=>{calls++;return r.abort()});await page.goto('/companies');await page.getByText('Webbplatsunderlag',{exact:true}).click();await expect(page.getByRole('button',{name:'Undersök webbplats',exact:true})).toBeDisabled();await expect(page.getByText('Webbresearch är inte aktiverad i denna miljö.',{exact:true})).toBeVisible();expect(calls).toBe(0)
})
test('website evidence rejects foreign scope and unsafe successful source links',async({page})=>{
 let response={...websiteEvidence,projectId:'10000000-0000-4000-8000-000000000099'};let calls=0;await page.route('**/fixture-companies',r=>r.fulfill({json:websiteFixture()}));await page.route('**/api/sales/companies/website',r=>{calls++;return r.fulfill({json:response})});await page.goto('/companies');await page.getByText('Webbplatsunderlag',{exact:true}).click();await page.getByRole('button',{name:'Undersök webbplats',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Webbplatsunderlaget kunde inte läsas');await expect(page.getByRole('link',{name:'Källa till webbplatsuppgifter'})).toHaveCount(0)
 response={...websiteEvidence,websiteUrl:'javascript:alert(1)',sourceUrl:'javascript:alert(1)'};await page.getByRole('button',{name:'Undersök webbplats',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Webbplatsunderlaget kunde inte läsas');await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);expect(calls).toBe(2)
})
