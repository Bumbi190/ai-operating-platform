import {describe,expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {validatePlanContent,hashPlanContent,compileStaticBrief} from './validation'
import {createWebsiteMockups,validateMockupReference} from './mockups'
import {compileWebsiteArtifact} from '../artifact'
import {websiteUserMessage} from '../prompt'
import type {PlanContent} from './types'
import type {BuildSnapshot} from '../types'

const base:PlanContent={title:'Demo Motors',purpose:'Utforska våra konceptbilar',audience:'Bilintresserade',pages:[{key:'home',title:'Hem',purpose:'Visa konceptbilen'},{key:'lager',title:'Lager',purpose:'Utforska exempelbilar'},{key:'kontakt',title:'Kontakt',purpose:'Boka en demovisning'}],design:{style:'Mörk och varm premium',reference:null},features:[{name:'Provkörning',mode:'preview_demo',provider:null}],architecture:'Statisk demonstration, inga verkliga bokningar',steps:['Granska','Bygg'],domain:{registrar:'strato',requestedName:null}}
const visual={palette:{background:'#101827',foreground:'#f4f1ea',accent:'#62d6bb'},font:'sans' as const}
const withVisual=(value:unknown=visual):PlanContent=>({...base,design:{...base.design,visual:value}} as PlanContent)

describe('reference style survives the website planning pipeline',()=>{
 it('preserves a bounded palette and font in the validated plan',()=>{
  expect(validatePlanContent(withVisual())).toEqual(withVisual())
 })
 it('puts exact visual choices in the approved brief and hashes edits separately',()=>{
  const first=validatePlanContent(withVisual()), changed=validatePlanContent(withVisual({...visual,palette:{...visual.palette,accent:'#e3aa63'}}))
  expect(compileStaticBrief(first)).toContain('#101827')
  expect(compileStaticBrief(first)).toContain('#62d6bb')
  expect(compileStaticBrief(first)).toContain('sans')
  expect(hashPlanContent(changed)).not.toBe(hashPlanContent(first))
  expect(changed.pages).toEqual(first.pages)
 })
 it('does not add visual fields to legacy plans or change their canonical hash',()=>{
  expect(validatePlanContent(base)).toEqual(base)
  expect(hashPlanContent(base)).toBe(createHash('sha256').update(JSON.stringify(base)).digest('hex'))
  expect(compileStaticBrief(base)).not.toContain('Visuella val:')
  // The three old variants keep their established different font choices.
  const legacy=createWebsiteMockups(base)
  expect(legacy[0].draft.css).toContain('Georgia,Times New Roman,serif')
  expect(legacy[1].draft.css).not.toContain('Georgia,Times New Roman,serif')
 })
 it.each([
  null,{},[],{...visual,font:'url(https://invalid.example)'},{...visual,font:'cursive'},
  {...visual,approve:true},{palette:visual.palette},{...visual,palette:{...visual.palette,url:'https://invalid.example'}},
  {...visual,palette:{...visual.palette,accent:'#fff'}},{...visual,palette:{...visual.palette,accent:'red;display:none'}},
  {...visual,palette:{...visual.palette,background:'url(https://invalid.example)'}},{...visual,palette:{...visual.palette,foreground:17}},
 ])('rejects unsafe or incomplete visual input %#',value=>{
  expect(()=>validatePlanContent(withVisual(value))).toThrow('INVALID_PLAN')
 })
 it('uses the selected colors and font in every mockup, overriding keyword defaults',()=>{
  const options=createWebsiteMockups(withVisual())
  expect(options).toHaveLength(3)
  for(const option of options){
   expect(option.draft.css).toContain('--bg:#101827')
   expect(option.draft.css).toContain('--fg:#f4f1ea')
   expect(option.draft.css).toContain('--accent:#62d6bb')
   expect(option.draft.css).toContain('font-family:system-ui,sans-serif')
   expect(()=>compileWebsiteArtifact(option.draft)).not.toThrow()
  }
 })
 it('honors an explicit serif choice in all three layouts',()=>{
  for(const option of createWebsiteMockups(withVisual({...visual,font:'serif'}))){
   expect(option.draft.css).toContain('font-family:Georgia,serif')
  }
 })
 it('also refuses injected colors when a caller bypasses plan validation',()=>{
  expect(()=>createWebsiteMockups(withVisual({...visual,palette:{...visual.palette,accent:'red;}body{display:none'}}))).toThrow()
 })
 it('a color-only update preserves content and previous snapshots and changes the mockup hash',()=>{
  const previous=createWebsiteMockups(withVisual()), saved=JSON.stringify(previous)
  const updated=createWebsiteMockups(withVisual({...visual,palette:{...visual.palette,accent:'#e3aa63'}}))
  for(let i=0;i<previous.length;i++){
   expect(updated[i].draft.pages).toEqual(previous[i].draft.pages)
   expect(updated[i].sha256).not.toBe(previous[i].sha256)
   expect(updated[i].draft.css!.replaceAll('#e3aa63','#62d6bb')).toBe(previous[i].draft.css)
  }
  expect(JSON.stringify(previous)).toBe(saved)
 })
 it('carries the exact reviewed draft into build input with the original full page scope',()=>{
  const plan=validatePlanContent(withVisual()), options=createWebsiteMockups(plan), option=options[1]
  const reference={mockupId:'mockup',sha256:option.sha256,canonicalDraft:option.canonicalDraft,approvedPages:plan.pages}
  const snapshot:BuildSnapshot={writer:{projectId:'project',sessionId:'session',runId:'run',claimId:'claim',generation:1},brief:compileStaticBrief(plan),agentId:'agent',previousArtifact:null,feedback:[],candidate:null,interpretation:null,controlRequested:null,designReference:reference}
  const input=JSON.parse(websiteUserMessage(snapshot,null))
  expect(input.designReference.draft).toEqual(validateMockupReference(reference))
  expect(input.designReference.draft.css).toContain('--accent:#62d6bb')
  expect(input.brief).toContain('lager — Lager')
  expect(input.brief).toContain('kontakt — Kontakt')
  const output=process.env.WEBSITE_VISUAL_TEST_OUTPUT
  if(output){mkdirSync(output,{recursive:true});for(const x of options)writeFileSync(resolve(output,x.key+'.html'),compileWebsiteArtifact(x.draft).pages[0].html);const edited=createWebsiteMockups(withVisual({...visual,palette:{...visual.palette,accent:'#e3aa63'}}))[1];writeFileSync(resolve(output,'visual-edited.html'),compileWebsiteArtifact(edited.draft).pages[0].html)}
 })
})
