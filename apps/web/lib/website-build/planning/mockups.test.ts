import {describe,it,expect} from 'vitest'
import {createHash} from 'node:crypto'
import {compileWebsiteArtifact} from '../artifact'
import {createWebsiteMockups,validateMockupReference} from './mockups'
import type {PlanContent} from './types'
const brief:PlanContent={title:'Lumvy',purpose:'Varmt ljus för svenska hem',audience:'Familjer',pages:[{key:'home',title:'Hem',purpose:'Visa lampan'},{key:'policy',title:'Policy',purpose:'Villkor'},{key:'order-confirm',title:'Order',purpose:'Exempel på order'}],design:{style:'Mörk, varm och elegant',reference:null},features:[{name:'Ljusval',mode:'preview_demo',provider:null}],architecture:'Statiska sidor',steps:['Granska','Bygg'],domain:{registrar:'strato',requestedName:null}}
describe('website design proposals',()=>{
 it('creates three distinct deterministic responsive drafts from the agreed brief',()=>{
  const options=createWebsiteMockups(brief)
  expect(options).toHaveLength(3);expect(createWebsiteMockups(brief)).toEqual(options)
  expect(new Set(options.map(x=>x.key)).size).toBe(3)
  expect(new Set(options.map(x=>x.draft.css)).size).toBe(3)
  for(const option of options){expect(option.draft.title).toBe('Lumvy');expect(option.draft.css).toContain('@media');expect(option.sha256).toBe(createHash('sha256').update(option.canonicalDraft).digest('hex'));expect(JSON.parse(option.canonicalDraft)).toEqual(option.draft);expect(()=>compileWebsiteArtifact(option.draft)).not.toThrow();for(const page of brief.pages)expect(option.draft.pages[0].bodyHtml).toContain(page.title)}
 })
 it('keeps all agreed pages and supplied facts without fabricated proof, prices or external resources',()=>{
  for(const option of createWebsiteMockups(brief)){const text=JSON.stringify(option.draft);expect(text).toContain('Varmt ljus för svenska hem');expect(text).toContain('Ljusval');expect(text).not.toMatch(/https?:|<svg|<script|onerror=|999|kundrecension|★★★★★/);expect(option.draft.pages).toHaveLength(1);expect(option.draft.pages[0].key).toBe('index')}
 })
 it('escapes hostile content while retaining the agreed plain text',()=>{
  const hostile={...brief,title:'<img src=x onerror=alert(1)>',purpose:'Text & <script>evil()</script>'}
  for(const option of createWebsiteMockups(hostile)){expect(option.draft.pages[0].bodyHtml).toContain('&lt;img');expect(option.draft.pages[0].bodyHtml).not.toContain('<script>');expect(()=>compileWebsiteArtifact(option.draft)).not.toThrow()}
 })
 it('bounds long escaped copy without changing the agreed plan',()=>{
  const long={...brief,title:'<&>'.repeat(1500),purpose:'&'.repeat(1000)}
  const before=JSON.stringify(long)
  expect(()=>createWebsiteMockups(long)).not.toThrow()
  expect(JSON.stringify(long)).toBe(before)
 })
 it('accepts only the exact canonical reference and strict supported draft',()=>{
  const option=createWebsiteMockups(brief)[0]
  expect(validateMockupReference({canonicalDraft:option.canonicalDraft,sha256:option.sha256})).toEqual(option.draft)
  expect(()=>validateMockupReference({canonicalDraft:option.canonicalDraft+' ',sha256:option.sha256})).toThrow('INVALID_DESIGN_REFERENCE')
  const unsupported=JSON.stringify({...option.draft,pages:[{key:'index',title:'Hem',bodyHtml:'<svg></svg>',behaviors:[]}]})
  expect(()=>validateMockupReference({canonicalDraft:unsupported,sha256:createHash('sha256').update(unsupported).digest('hex')})).toThrow()
 })
})
