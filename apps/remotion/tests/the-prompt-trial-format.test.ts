import {test} from 'node:test'
import assert from 'node:assert/strict'
import {assessTrialVisualTreatment,type TrialVisualInput} from '../../web/lib/media/the-prompt-trial-format'
const base=():TrialVisualInput=>({
 variant:'text_motion',verifiedNewsSource:true,
 storyId:'11111111-1111-4111-8111-111111111111',
 scriptId:'22222222-2222-4222-8222-222222222222',
 voiceId:'qSeXEcewz7tA0Q0qk9fH',englishCaptionsVerified:true,
 visuals:[{sourceId:'graphic-1',storySpecific:false,rightsReviewed:true,kind:'illustrative'}],
})
test('text-motion can be tested with original graphic without implying documentary images',()=>{
 const v=assessTrialVisualTreatment(base())
 assert.equal(v.eligibleForPrivateComparison,true)
 assert.equal(v.visualEvidence,'illustrative')
})
test('story-visual must actually have at least two story-specific visuals with rights',()=>{
 const input=base();input.variant='story_visual'
 assert.deepEqual(assessTrialVisualTreatment(input).reasons,['story_visual_needs_two_specific_visuals'])
 input.visuals=[
  {sourceId:'source-a',storySpecific:true,rightsReviewed:true,kind:'source_visual'},
  {sourceId:'source-b',storySpecific:true,rightsReviewed:true,kind:'source_visual'},
 ]
 assert.equal(assessTrialVisualTreatment(input).eligibleForPrivateComparison,true)
 assert.equal(assessTrialVisualTreatment(input).visualEvidence,'source_specific')
})
test('both formats fail closed for unverified story, Victoria or visual rights',()=>{
 const input=base();input.voiceId='Megan';input.verifiedNewsSource=false;input.visuals[0].rightsReviewed=false
 const reasons=assessTrialVisualTreatment(input).reasons
 assert(reasons.includes('audio_or_captions_unverified'))
 assert(reasons.includes('unverified_story'))
 assert(reasons.includes('visual_rights_unverified'))
})
test('format check is a preview eligibility review, never a publish authorization',()=>{
 const r=assessTrialVisualTreatment(base())
 assert.equal(Object.hasOwn(r,'canPublish'),false)
 assert.equal(Object.hasOwn(r,'approved'),false)
})
