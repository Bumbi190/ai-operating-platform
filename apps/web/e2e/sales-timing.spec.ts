import {test,expect} from '@playwright/test'
import {mkdirSync} from 'node:fs'
const projectId='10000000-0000-4000-8000-000000000001',contactId='30000000-0000-4000-8000-000000000001'
test('timing review is collapsed, truthful, preserves edits and never sends',async({page})=>{
 const c={id:contactId,projectId,version:1,companyName:'Exempelbil',branchName:'Nord',email:'info@example.se',history:'unknown',pilotMonths:12,confirmed:true,suppressed:true,excluded:false}
 const timing:any={projectId,evaluatedAt:'2026-10-19T08:00:00Z',rules:null,historyRevisions:[],customerSendingEnabled:false,workspaceUrl:'/projects/handlarborsen/sales#contact-timing',contacts:[{contactId,recipient:c.email,contactVersion:1,historyRevisionId:null,ruleRevisionId:null,latestObservedOutboundAt:null,reminderCount:null,intervalFloorAt:null,sourceThrough:null,blockers:['CONTACT_SUPPRESSED','HISTORY_REVIEW_REQUIRED','RULE_REVIEW_REQUIRED'],initialPreparationAllowed:false}]}
 const model={projectId,state:'ok',contacts:[c],offers:[],jobs:[],drafts:[],workers:[],workspaceUrl:'/projects/handlarborsen/sales',sendingEnabled:false,timing}
 const writes:any[]=[]
 await page.route('**/api/sales?*',r=>r.fulfill({json:new URL(r.request().url()).searchParams.has('connection')?{connections:[]}:model}))
 await page.route('**/api/sales/mailbox?*',r=>r.fulfill({json:null}))
 await page.route('**/api/sales/inbox?*',r=>r.fulfill({json:{messages:[],config:null}}))
 await page.route('**/api/sales/timing*',r=>{if(r.request().method()==='GET')return r.fulfill({json:timing});const v=r.request().postDataJSON();writes.push(v);return r.fulfill({status:409,json:{code:'REVISION_CONFLICT'}})})
 await page.goto('/sales');const panel=page.locator('#contact-timing')
 await expect(panel).toHaveJSProperty('open',false);expect(writes).toEqual([])
 await panel.locator('summary').first().click();await expect(panel.getByText('Kontaktspärr',{exact:true}).first()).toBeVisible()
 await expect(panel.getByText('Okänt',{exact:true}).first()).toBeVisible();await expect(panel.getByText('Kan inte bestämmas',{exact:true})).toBeVisible();expect(writes).toEqual([])
 await panel.getByRole('button',{name:'Granska historik'}).click()
 await panel.getByLabel('Granskningsnotering').fill('Behåll min granskning')
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
