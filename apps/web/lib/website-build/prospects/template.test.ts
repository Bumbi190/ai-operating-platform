import {describe,it,expect} from 'vitest'
import {createWebsiteMockups} from '../planning/mockups'
import {validatePlanContent,hashPlanContent} from '../planning/validation'
import {compileWebsiteArtifact} from '../artifact'
import {assertApprovedWebsiteScope} from '../planning/design-reference'
import {approvedProspectDraft} from './template'
import type {PlanContent} from '../planning/types'
export const plan:PlanContent={title:'Syntetisk Testbil AB',purpose:'Ett granskat koncept',audience:'Bilköpare i Hässleholm',pages:[{key:'index',title:'Startsida',purpose:'Introduktion'}],design:{style:'Ljust',reference:'https://dealer.se/',prospect:{version:1,inputSha256:'a'.repeat(64),city:'Hässleholm',websiteUrl:'https://dealer.se/',sections:[{heading:'Tydlig väg',body:'Lätt att hitta rätt.'},{heading:'Mobil först',body:'Stora, begripliga val.'},{heading:'Lär känna oss',body:'Företagsnamn och ort i fokus.'}]}},features:[],architecture:'Statisk startsida',steps:['Granska','Bygg'],domain:{registrar:'strato',requestedName:null}}
describe('company-specific approved concept',()=>{
  it('preserves and hashes the company/evidence binding in a validated plan',()=>{expect(validatePlanContent(plan)).toEqual(plan);expect(hashPlanContent({...plan,design:{...plan.design,prospect:{...plan.design.prospect!,city:'Kristianstad'}}})).not.toBe(hashPlanContent(plan))})
  it('builds three safe responsive directions with company identity and explicit illustration status',()=>{
    const options=createWebsiteMockups(plan);expect(options).toHaveLength(3)
    for(const option of options){
      const artifact=compileWebsiteArtifact(option.draft),html=artifact.pages[0].html
      expect(html).toContain('Syntetisk Testbil AB');expect(html).toContain('Hässleholm');expect(html).toContain('Visar inte företagets lokaler eller lager');expect(html).not.toContain('Nord GT');expect(html).toContain('name="description"');expect(html).toContain('noindex,nofollow');expect(html).toContain('@media(max-width:720px)');expect(artifact.integrationNeeds).toEqual([])
      const reference={mockupId:'id',canonicalDraft:option.canonicalDraft,sha256:option.sha256,approvedPages:plan.pages}
      expect(approvedProspectDraft(reference)).toEqual(option.draft);expect(()=>assertApprovedWebsiteScope(artifact,reference)).not.toThrow()
      const changed=compileWebsiteArtifact({...option.draft,pages:[{...option.draft.pages[0],bodyHtml:option.draft.pages[0].bodyHtml.replace('Din nästa bil börjar här.','Unreviewed claim')}]})
      expect(()=>assertApprovedWebsiteScope(changed,reference)).toThrow('PROSPECT_DESIGN_MISMATCH')
    }
  })
  it('rejects a corrupted approved draft hash',()=>{const option=createWebsiteMockups(plan)[0];expect(()=>approvedProspectDraft({mockupId:'id',sha256:'f'.repeat(64),canonicalDraft:option.canonicalDraft})).toThrow()})
  it('does not permit additional pages, cinematic scope or connected features in a prospect plan',()=>{
    expect(()=>validatePlanContent({...plan,pages:[...plan.pages,{key:'other',title:'Other',purpose:'Other'}]})).toThrow()
    expect(()=>validatePlanContent({...plan,features:[{name:'Send',mode:'live_required',provider:'form_delivery'}]})).toThrow()
  })
})
