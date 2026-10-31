import {describe,it,expect} from 'vitest'
import {createHash} from 'node:crypto'
import {validatePlanContent,hashPlanContent,compileStaticBrief} from './validation'
import {createWebsiteMockups,validateMockupReference,MOCKUP_DRAFT_BYTES} from './mockups'
import {compileWebsiteArtifact,makePreviewDocument} from '../artifact'
import {WEBSITE_PLANNING_TOOLS} from './chat-tools'
import type {PlanContent} from './types'
const starter='premium-dealer-demo-v1'
const base:PlanContent={title:'Handlarbörsen',purpose:'Visa en fiktiv bilhandlardemo',audience:'Bilhandlare',pages:[{key:'home',title:'Hem',purpose:'Showroom, lager och testförfrågan'}],design:{style:'Mörk premium med amber',reference:null},features:[{name:'Filtrering',mode:'preview_demo',provider:null}],architecture:'Statisk intern demonstration',steps:['Granska','Bygg'],domain:{registrar:'strato',requestedName:null}}
const plan=(id:unknown=starter)=>({...base,design:{...base.design,starter:id}} as PlanContent)
const hero='atlas-asset:83a78b27b0538fd2e9b3985948973fc00ca62d798fce2df97c989308b6c316a9'
describe('approved dealership starter in normal planning',()=>{
 it('accepts an explicitly selected starter but does not change legacy plans',()=>{
  expect(validatePlanContent(plan())).toEqual(plan())
  expect(validatePlanContent(base)).toEqual(base)
  expect(hashPlanContent(plan())).not.toBe(hashPlanContent(base))
  expect(compileStaticBrief(plan())).toContain(starter)
  expect(JSON.stringify(WEBSITE_PLANNING_TOOLS)).toContain(starter)
 })
 it.each([null,{},'unknown','../premium-dealer-demo-v1','premium-dealer-demo-v2'])('rejects unknown starter %#',id=>{expect(()=>validatePlanContent(plan(id))).toThrow('INVALID_PLAN')})
 it('does not allow a one-page starter to shrink a multi-page or live integration plan',()=>{
  expect(()=>validatePlanContent({...plan(),pages:[...base.pages,{key:'contact',title:'Kontakt',purpose:'Kontakt'}]})).toThrow('INVALID_PLAN')
  expect(()=>validatePlanContent({...plan(),features:[{name:'Verklig bokning',mode:'live_required',provider:'form_delivery'}]})).toThrow('INVALID_PLAN')
 })
 it('creates three reviewable compact real-image drafts within existing SQL limits',()=>{
  const p=validatePlanContent(plan()),options=createWebsiteMockups(p)
  expect(options.map(o=>o.key)).toEqual(['editorial','visual','structured'])
  for(const option of options){
   expect(Buffer.byteLength(option.canonicalDraft)).toBeLessThanOrEqual(MOCKUP_DRAFT_BYTES)
   expect(option.canonicalDraft).not.toContain('base64,')
   expect(option.canonicalDraft).toContain(hero)
   expect(option.sha256).toBe(createHash('sha256').update(option.canonicalDraft).digest('hex'))
   const a=compileWebsiteArtifact(validateMockupReference(option))
   expect(a.pages[0].html).toContain('data:image/webp;base64,')
   expect(a.pages[0].html).not.toContain('atlas-asset:')
   expect(a.pages[0].html).toContain('FIKTIV DEMO')
   expect(a.pages[0].html).toContain('8 av 8 visas')
   expect(a.integrationNeeds).toEqual(['form_delivery'])
   expect(makePreviewDocument(a,'index','token')).toContain('connect-src &#39;none&#39;')
  }
 })
 it('renders the selected accent without changing assets or catalog identities',()=>{
  const a=createWebsiteMockups(validatePlanContent(plan()))[1]
  const p=plan();p.design.visual={palette:{background:'#0b1114',foreground:'#f3f0e8',accent:'#71d7ba'},font:'sans'}
  const b=createWebsiteMockups(validatePlanContent(p))[1]
  expect(b.draft.pages).toEqual(a.draft.pages)
  expect(b.draft.css).toContain('--accent:#71d7ba')
  expect(b.sha256).not.toBe(a.sha256)
 })
 it('compiler resolves only the exact bundled content-addressed raster',()=>{
  const draft=(src:string)=>({format:'static-website.v1',title:'Bildtest',css:'',pages:[{key:'index',title:'Hem',bodyHtml:`<img src="${src}" alt="Fiktiv konceptbil">`,behaviors:[]}]})
  expect(compileWebsiteArtifact(draft(hero)).pages[0].html).toContain('data:image/webp;base64,')
  for(const src of ['atlas-asset:'+'0'.repeat(64),hero+'?url=https://invalid.example','https://invalid.example/pic.webp','file:///C:/Users/Andre/secret','atlas-asset:../x'])expect(()=>compileWebsiteArtifact(draft(src))).toThrow()
 })
})
