import assert from 'node:assert/strict'
import {describe,it} from 'node:test'
import {
 planThePromptV3PrivateStoryboard,
 V3StoryboardRefusal,
 THEPROMPT_V3_MASTER_SHA256,
} from './theprompt-v3-storyboard.ts'
const project='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const script='b9271d5b-5254-4ad8-a36c-ce7c66e9c63e'
const words=Array.from({length:51},(_,i)=>({
 word:'w'+i,startMs:i*430,endMs:i*430+320,
}))
const valid={
 projectId:project,scriptId:script,status:'approved',durationMs:22152,imageCount:3,
 words,qualityVerdict:'Quality check parse error — proceeding with caution.',
 sourceFactStatus:'conflict',
}
const denied=(args,code)=>assert.throws(
 ()=>planThePromptV3PrivateStoryboard(args),
 e=>e instanceof V3StoryboardRefusal&&e.code===code,
)
describe('Atlas The Prompt V3 private storyboard – source guard and fast montage',()=>{
 it('creates 10 consecutive ~2.2s moving stills and 75-frame branded outro',()=>{
  const plan=planThePromptV3PrivateStoryboard(valid)
  assert.equal(plan.schema,'theprompt.v3.private-storyboard.v1')
  assert.equal(plan.contentFrames,665)
  assert.equal(plan.outroFrames,75)
  assert.equal(plan.totalFrames,740)
  assert.equal(plan.shots.length,10)
  assert.equal(plan.shots[0].startFrame,0)
  assert.equal(plan.shots.at(-1).startFrame+plan.shots.at(-1).durationFrames,665)
  assert.equal(plan.shots.filter(s=>s.transitionInFrames>0).length,4)
  for(let i=0;i<plan.shots.length;i++){
   assert.ok(plan.shots[i].durationFrames>=64)
   assert.ok(plan.shots[i].durationFrames<=68)
   assert.equal(plan.shots[i].imageIndex,i%3)
   assert.ok(plan.shots[i].zoomFrom>=1&&plan.shots[i].zoomFrom<=1.2)
   assert.ok(plan.shots[i].zoomTo>=1&&plan.shots[i].zoomTo<=1.2)
   if(i>0)assert.equal(plan.shots[i].startFrame,plan.shots[i-1].startFrame+plan.shots[i-1].durationFrames)
  }
 })
 it('pins the specific approved V3 visual reference, not this new narration',()=>{
  const plan=planThePromptV3PrivateStoryboard(valid)
  assert.equal(plan.referenceSha256,THEPROMPT_V3_MASTER_SHA256)
  assert.equal(plan.scriptId,script)
  assert.equal(plan.captionWordCount,51)
 })
 it('always stops publication, paid generation, and scheduling independently',()=>{
  const plan=planThePromptV3PrivateStoryboard(valid)
  assert.equal(plan.canPublish,false)
  assert.equal(plan.canGenerate,false)
  assert.equal(plan.canSchedule,false)
  assert.equal(plan.editorialHold.required,true)
  assert.match(plan.editorialHold.overlay,/NOT FOR PUBLICATION/)
 })
 it('carries actual source conflict and failed quality parsing as distinct hold reasons',()=>{
  const plan=planThePromptV3PrivateStoryboard(valid)
  assert.ok(plan.editorialHold.reasons.includes('source_claim_conflict'))
  assert.ok(plan.editorialHold.reasons.includes('quality_report_invalid'))
  assert.ok(plan.editorialHold.reasons.includes('operator_editorial_review_required'))
 })
 it('still requires human editorial review after a source has been independently checked',()=>{
  const plan=planThePromptV3PrivateStoryboard({...valid,sourceFactStatus:'independently_reviewed',qualityVerdict:'Passed'})
  assert.equal(plan.canPublish,false)
  assert.deepEqual(plan.editorialHold.reasons,['operator_editorial_review_required'])
 })
 it('rejects a script from any other project or an invalid script identifier',()=>{
  denied({...valid,projectId:'22222222-2222-4222-8222-222222222222'},'PROJECT_OR_SCRIPT_INVALID')
  denied({...valid,scriptId:'not-a-script'},'PROJECT_OR_SCRIPT_INVALID')
 })
 it('refuses already published source to prevent a duplicate new video',()=>{
  denied({...valid,status:'published'},'ALREADY_PUBLISHED')
  denied({...valid,status:'scheduled'},'SOURCE_STATUS_UNSUPPORTED')
 })
 it('rejects missing or unsupported images and extreme duration',()=>{
  denied({...valid,imageCount:0},'IMAGES_INVALID')
  denied({...valid,imageCount:6},'IMAGES_INVALID')
  denied({...valid,durationMs:0},'DURATION_INVALID')
  denied({...valid,durationMs:90001},'DURATION_INVALID')
 })
 it('rejects broken word timing and refuses a zero-voice montage',()=>{
  denied({...valid,words:[]},'WORD_TIMING_INVALID')
  denied({...valid,words:[...words.slice(0,10),{word:'',startMs:4400,endMs:4600}]},'WORD_TIMING_INVALID')
  denied({...valid,words:[...words.slice(0,10),{word:'extra',startMs:25000,endMs:25500}]},'WORD_TIMING_INVALID')
 })
 it('demands a source-fact QA status, not a green numerical quality score',()=>{
  denied({...valid,sourceFactStatus:'unknown'},'FACT_STATUS_REQUIRED')
 })
})
