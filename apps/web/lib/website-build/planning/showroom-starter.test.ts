import {describe, expect, it} from 'vitest'
import JSZip from 'jszip'
import {compileWebsiteArtifact} from '../artifact'
import {assembleProjectExport} from '../project-export'
import {WEBSITE_PLANNING_GUIDE, WEBSITE_PLANNING_TOOLS} from './chat-tools'
import {createWebsiteMockups, validateMockupReference} from './mockups'
import {compileStaticBrief, validatePlanContent} from './validation'

const starter = 'premium-dealer-showroom-v2'
const silver = {name:'Kust Touring', year:2024, mileage:1850, price:369000, fuel:'Hybrid', photo:'concept-silver',sold:true}
const plan = {
 title:'Strandvik Motor', purpose:'Visa våra fiktiva visningsbilar', audience:'Bilintresserade',
 pages:[{key:'home',title:'Bilhall',purpose:'Visa aktuell bil och lager'}],
 design:{starter,style:'Mörk bilhall',reference:null,visual:{palette:{background:'#10231b',foreground:'#f4f4ef',accent:'#a9e4bf'},font:'sans'}},
 features:[{name:'Visa fordonsuppgifter',mode:'preview_demo',provider:null}],
 architecture:'Fristående förhandsvisning',steps:['Granska','Bygg'],domain:{registrar:'strato',requestedName:null}
}

describe('brand-specific premium showroom starter',()=>{
 it('is selectable in the real planning tool and uses the same featured-first showroom in all three drafts',()=>{
  const valid=validatePlanContent({...plan,title:'Björkgläntans Demobilar'})
  expect(JSON.stringify(WEBSITE_PLANNING_TOOLS)).toContain(starter)
  expect(WEBSITE_PLANNING_GUIDE).toContain(starter)
  const choices=createWebsiteMockups(valid)
  expect(choices.map(o=>o.key)).toEqual(['editorial','visual','structured'])
  expect(new Set(choices.map(o=>o.sha256)).size).toBe(3)
  for(const option of choices){
   const artifact=compileWebsiteArtifact(validateMockupReference(option))
   const html=artifact.pages[0].html
   expect(html).toContain('Björkgläntans Demobilar')
   expect(html).toContain('--accent:#a9e4bf')
   expect(html).toContain('data-vehicle-id="1"')
   expect(html).toContain('Skog E')
   expect(html).toContain('Filtrera på drivlina')
   expect(html).toContain('data-fuel="Hybrid"')
   expect(html).toContain('Fiktiv bilhall')
   expect(html).not.toMatch(/Nord GT|Nord R|Demo Motors|Handlarbörsen|vehicle3d:|data:image\/svg/i)
   expect(artifact.assets??[]).toHaveLength(0)
  }
 })
 it('pins the specified first vehicle and its own illustration through the ZIP export',async()=>{
  const valid=validatePlanContent({...plan,design:{...plan.design,showroom:{vehicles:[silver]}}})
  expect(compileStaticBrief(valid)).toContain('Kust Touring')
  const draft=createWebsiteMockups(valid)[1]
  const art=compileWebsiteArtifact(validateMockupReference(draft))
  const zip=await JSZip.loadAsync(await assembleProjectExport({projectId:'a',projectName:valid.title,folderName:'strandvik',sessionId:'s',revisionId:'r',revisionNumber:1,brief:compileStaticBrief(valid),location:null,planRevision:null,artifact:art}))
  const html=await zip.file('strandvik/dist/index.html')!.async('string')
  expect(html).toContain('Kust Touring')
  expect(html).toContain('Strandvik Motor')
  expect(html).toContain('data-sold="true"')
  expect(html).toContain('Strandvik Motor · Såld')
  expect(html.match(/data-vehicle-id=/g)).toHaveLength(1)
  const expected='assets/images/f2e174953793b49e93f5a035bc4c06190937f1d27213f9a38f847e77314727b7.webp'
  expect(html).toContain('src="'+expected+'"')
  expect(zip.file('strandvik/dist/'+expected)).toBeTruthy()
  expect(html).not.toMatch(/Nord GT|Nord R|Demo Motors|Skog E|atlas-asset:|src="https?:/i)
 })
 it('uses the same vehicle limits as the customer editor',()=>{
  const withRow=(row:Record<string,unknown>)=>({...plan,design:{...plan.design,showroom:{vehicles:[{...silver,...row}]}}})
  const atLimits={name:'S'.repeat(80),year:1886,price:99999999,mileage:9999999}
  expect(validatePlanContent(withRow(atLimits)).design.showroom?.vehicles[0]).toMatchObject(atLimits)
  for(const row of [{price:100000000},{year:1885},{year:2101},{mileage:10000000},{name:'S'.repeat(81)},{name:'Strand\u0007vik'},{name:'Kust\nTouring'}]){
   expect(()=>validatePlanContent(withRow(row))).toThrow('INVALID_PLAN')
  }
 })
 it('accepts only vetted, scoped static vehicle input and keeps live integrations outside a static starter',()=>{
  for(const vehicles of [[],[{...silver,photo:'https://other.invalid/car.svg'}],[{...silver,price:-1}],[{...silver,year:1}],[{...silver,sold:1}],[silver,silver]]){
   expect(()=>validatePlanContent({...plan,design:{...plan.design,showroom:{vehicles}}})).toThrow('INVALID_PLAN')
  }
  for(const other of [undefined,'premium-dealer-demo-v1']){
   expect(()=>validatePlanContent({...plan,design:{...plan.design,starter:other,showroom:{vehicles:[silver]}}})).toThrow('INVALID_PLAN')
  }
  expect(()=>validatePlanContent({...plan,features:[{name:'Leverera e-post',mode:'live_required',provider:'form_delivery'}]})).toThrow('INVALID_PLAN')
 })
})
