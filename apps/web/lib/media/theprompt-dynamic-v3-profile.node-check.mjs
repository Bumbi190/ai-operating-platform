import assert from 'node:assert/strict'
import {describe,it} from 'node:test'
import {readFile} from 'node:fs/promises'
const profile=JSON.parse(await readFile(new URL('./theprompt-dynamic-v3-approved.json',import.meta.url),'utf8'))
describe('The Prompt approved V3 creative style is a non-publishing template',()=>{
 it('pins scope and approved SHA of specific 720x1280 review master',()=>{
  assert.equal(profile.schema,'omnira.theprompt.creative-profile.v3')
  assert.equal(profile.projectSlug,'ai-media-automation')
  assert.equal(profile.approval.referenceSha256,'d23d62737aa04b4203159b0da0f775a88addf50274e16c79d3bfa12e8f092788')
  assert.equal(profile.reference.width,720)
  assert.equal(profile.reference.height,1280)
  assert.equal(profile.reference.fps,30)
 })
 it('does not grant any public distribution or new provider spend',()=>{
  assert.equal(profile.approval.publicPublicationAuthorized,false)
  assert.equal(profile.approval.recurringPublicationsAuthorized,false)
  assert.equal(profile.approval.paidGenerationAuthorized,false)
  assert.equal(profile.operations.automaticPublicationEnabled,false)
  assert.equal(profile.operations.automaticPaidGenerationEnabled,false)
  assert.equal(profile.approval.privateReferenceOnly,true)
 })
 it('keeps the existing still-image publishing fallback and current schedule',()=>{
  assert.equal(profile.operations.existingImageFallbackMustRemain,true)
  assert.equal(profile.operations.existingTenAndTwentyHourPostingPreserved,true)
 })
 it('retains source-story provenance to prevent duplicate publication',()=>{
  assert.equal(profile.approval.sourceScriptId,'b0495f6b-9973-40dc-ae9b-156cc110ab51')
  assert.ok(profile.design.shots.avoid.some(s=>s.includes('duplicate publication')))
 })
 it('preserves approved pacing, overlays, and old logo instead of thin new outro',()=>{
  assert.equal(profile.reference.editedShots,12)
  assert.equal(profile.reference.sourceClips,4)
  assert.equal(profile.design.shots.sourceReuseExplicit,true)
  assert.equal(profile.design.outro.restoredDoubleRules,true)
  assert.equal(profile.design.outro.noCaptionsOverLogo,true)
  assert.ok(profile.design.overlay.verifiedExamples.includes('7,500 RESEARCHERS'))
 })
 it('blocks release without future independently authorized approval',()=>{
  assert.ok(profile.operations.releaseRequires.includes('separate explicit publish authorization'))
  assert.ok(profile.operations.releaseRequires.includes('canonical verified media asset IDs'))
 })
})
