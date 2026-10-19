import {test,expect} from '@playwright/test'
import {mkdirSync} from 'node:fs'
const projectId='10000000-0000-4000-8000-000000000001',contactId='30000000-0000-4000-8000-000000000001'
test('timing review is collapsed, truthful, preserves edits and never sends',async({page})=>{
 const c={id:contactId,projectId,version:1,companyName:'Exempelbil',branchName:'Nord',email:'info@example.se',history:'unknown',pilotMonths:12,confirmed:true,suppressed:true,excluded:false}
 const timing:any={projectId,evaluatedAt:'2026-10-19T08:00:00Z',rules:null,historyRevisions:[],customerSendingEnabled:false,workspaceUrl:'/projects/handlarborsen/sales#contact-timing',contacts:[{contactId,recipient:c.email,contactVersion:1,historyRevisionId:null,ruleRevisionId:null,latestObservedOutboundAt:null,reminderCount:null,intervalFloorAt:null,sourceThrough:null,blockers:['CONTACT_SUPPRESSED','HISTORY_REVIEW_REQUIRED','RULE_REVIEW_REQUIRED'],initialPreparationAllowed:false}]}
 const model={projectId,state:'ok',contacts:[c],offers:[],jobs:[],drafts:[],workers:[],workspaceUrl:'/projects/handlarborsen/sales',sendingEnabled:false,timing}
 const writes:any[]=[];let loads=0
 await page.route('**/api/sales?*',r=>{const connection=new URL(r.request().url()).searchParams.has('connection');if(!connection&&loads++)timing.evaluatedAt='2026-10-19T08:02:00Z';return r.fulfill({json:connection?{connections:[]}:model})})
 await page.route('**/api/sales/mailbox?*',r=>r.fulfill({json:null}))
 await page.route('**/api/sales/inbox?*',r=>r.fulfill({json:{messages:[],config:null}}))
 await page.route('**/api/sales/timing*',r=>{if(r.request().method()==='GET')return r.fulfill({json:timing});const v=r.request().postDataJSON();writes.push(v);return r.fulfill({status:409,json:{code:'REVISION_CONFLICT'}})})
 await page.goto('/sales');const panel=page.locator('#contact-timing')
 await expect(panel).toHaveJSProperty('open',false);expect(writes).toEqual([])
 await panel.locator('summary').first().click();await expect(panel.getByText('Kontaktspärr',{exact:true}).first()).toBeVisible()
 await expect(panel.getByText('Okänt',{exact:true}).first()).toBeVisible();await expect(panel.getByText('Kan inte bestämmas',{exact:true})).toBeVisible();expect(writes).toEqual([])
 await panel.getByRole('button',{name:'Granska historik'}).click()
 await panel.getByLabel('Granskningsnotering').fill('Behåll min granskning');await page.getByRole('button',{name:'Uppdatera',exact:true}).click();await expect(panel.getByText('Kontrollerat 2026-10-19 10:02:00 UTC+02:00')).toBeVisible();await expect(panel.getByLabel('Granskningsnotering')).toHaveValue('Behåll min granskning')
 await panel.locator('summary').first().click();await panel.locator('summary').first().click();await expect(panel.getByLabel('Granskningsnotering')).toHaveValue('Behåll min granskning')
 await panel.getByRole('button',{name:'Avbryt historikgranskning'}).click();expect(writes).toEqual([])
 await panel.getByRole('button',{name:'Granska regler'}).click()
 await expect(panel.getByText(/14 × 24 timmar/)).toBeVisible()
 await panel.getByLabel('Jag bekräftar dessa regler för förberedelse').check();await panel.getByRole('button',{name:'Spara regelversion'}).click()
 await expect(panel.getByRole('alert')).toContainText('ändrats');await expect(panel.getByLabel('Minsta väntetid i hela dygn')).toHaveValue('14')
 expect(writes.map(x=>x.operation)).toEqual(['save_rules']);expect(model.contacts[0].suppressed).toBe(true);expect(model.jobs).toHaveLength(0)
 const dir=process.env.SALES_BROWSER_ARTIFACT_DIR??'../../.superpowers/sdd/2026-10-19-sales-contact-timing/browser';mkdirSync(dir,{recursive:true});await page.screenshot({path:dir+'/timing-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.screenshot({path:dir+'/timing-mobile.png',fullPage:true})
})

test('old source remains blocked after an explicit history save and failed read stays unknown',async({page})=>{
 const c={id:contactId,projectId,version:1,companyName:'Historikbil',branchName:'Syd',email:'info@history.example',history:'unknown',pilotMonths:12,confirmed:true,suppressed:true,excluded:false}
 const rid='90000000-0000-4000-8000-000000000001',hid='80000000-0000-4000-8000-000000000001'
 const data:any={schemaVersion:1,contactVersions:[{id:contactId,version:1}],history:'owner_confirmed_none',olderHistoryAttestation:'Äldre historik manuellt kontrollerad',sources:['strato_sent','strato_inbox','resend'].map(channel=>({sourceKey:channel,channel,identityRef:'Synthetic fixture account',scopeRef:'Synthetic whole recipient window',since:'2026-09-01T08:00:00Z',through:'2026-10-01T08:00:00Z',observedAt:'2026-10-19T07:59:00Z',state:'complete',reference:'Synthetic metadata evidence'})),events:[],correctionOf:null,reviewNote:'Ursprunglig granskning'}
 const timing:any={projectId,evaluatedAt:'2026-10-19T08:00:00Z',rules:{id:rid,projectId,version:1,previousId:null,minWaitSeconds:1209600,maxReminders:1,maxSourceAgeSeconds:900},historyRevisions:[{id:hid,projectId,recipient:c.email,version:1,previousId:null,data}],customerSendingEnabled:false,workspaceUrl:'/sales#contact-timing',contacts:[{contactId,recipient:c.email,contactVersion:1,historyRevisionId:hid,ruleRevisionId:rid,latestObservedOutboundAt:null,reminderCount:null,intervalFloorAt:null,sourceThrough:'2026-10-01T08:00:00Z',blockers:['CONTACT_SUPPRESSED','SOURCE_STALE'],initialPreparationAllowed:false}]}
 const model={projectId,state:'ok',contacts:[c],offers:[],jobs:[],drafts:[],workers:[],workspaceUrl:'/sales',sendingEnabled:false,timing}
 let fail=false;const writes:any[]=[]
 await page.route('**/api/sales?*',r=>r.fulfill({json:new URL(r.request().url()).searchParams.has('connection')?{connections:[]}:model}))
 await page.route('**/api/sales/mailbox?*',r=>r.fulfill({json:null}))
 await page.route('**/api/sales/inbox?*',r=>r.fulfill({json:{messages:[],config:null}}))
 await page.route('**/api/sales/timing*',r=>{
  if(r.request().method()==='GET')return r.fulfill({status:fail?503:200,json:fail?{code:'UNAVAILABLE'}:timing})
  const value=r.request().postDataJSON();writes.push(value);expect(value.operation).toBe('save_history');expect(value.expectedPreviousId).toBe(hid);expect(value.data.sources[0].through).toBe('2026-10-01T08:00:00Z')
  timing.evaluatedAt='2026-10-19T08:01:00Z';return r.fulfill({json:{revision:timing.historyRevisions[0],timing}})
 })
 await page.goto('/sales');const panel=page.locator('#contact-timing');await panel.locator('summary').first().click()
 await expect(panel.getByText(/2026-10-01 10:00:00 UTC\+02:00/).first()).toBeVisible()
 await panel.getByRole('button',{name:'Granska historik'}).click();await panel.getByLabel('Granskningsnotering').fill('Ny avstämning med samma gamla tidsfönster')
 await panel.getByRole('checkbox',{name:'Jag har granskat historik, källor och faktiskt kontrollerade tidsfönster.'}).check()
 await panel.getByRole('button',{name:'Spara historikversion'}).click()
 await expect(panel.getByText('Källorna behöver uppdateras',{exact:true})).toBeVisible()
 expect(writes).toHaveLength(1);expect(c.suppressed).toBe(true);expect(model.jobs).toHaveLength(0)
 fail=true;await panel.getByRole('button',{name:'Hämta aktuell status'}).click()
 await expect(panel.getByText('Kontrollen är inte tillgänglig. Historik och påminnelseantal är okända.',{exact:true})).toBeVisible()
 await expect(panel.getByRole('button',{name:'Granska historik'})).toHaveCount(0)
 expect(writes).toHaveLength(1)
})
