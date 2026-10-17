import {test} from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateDailyPilotEvidence,prepareDailyPilotPreview,type DailyPilotEvidence,
} from '../../web/lib/media/daily-pilot-contract'

const NOW=Date.parse('2026-10-17T14:00:00Z')
const p='11111111-1111-4111-8111-111111111111'
const id='22222222-2222-4222-8222-222222222222'
const valid=():DailyPilotEvidence=>({
  projectId:p,scriptId:id,language:'en',
  sourceCrossChecked:true,duplicateNewsChecked:true,humanPreviewApproved:true,
  hook:'A new AI agent feature was tested',scriptText:'The developers tested a new coding assistant.',
  story:{title:'OpenAI tests a new Codex agent workflow',summary:'New AI coding assistant experiment',
    url:'https://openai.com/index/agent-update',source:'rss_openai',
    sourceLabel:'OpenAI Blog',publishedAt:new Date(NOW-3*3600000)},
  audio:{url:'https://example.com/media/voice.mp3',durationMs:12000,
    voiceId:'qSeXEcewz7tA0Q0qk9fH',modelId:'eleven_turbo_v2_5',
    words:Array.from({length:18},(_,i)=>({word:'real',startMs:i*600,endMs:i*600+490}))},
  images:[0,1].map(i=>({assetId:i?'44444444-4444-4444-8444-444444444444':'33333333-3333-4333-8333-333333333333',
    projectId:p,url:'https://example.com/private/image'+i+'.png',rightsVerified:true,newsSpecific:true})),
})
test('valid owner-audited fresh new story + Victoria + actual caption timing passes preflight',()=>{
  assert.deepEqual(evaluateDailyPilotEvidence(valid(),NOW),{eligible:true,reasons:[]})
})
test('stale, undated and untrusted stories cannot enter pilot renderer',()=>{
  const old=valid();old.story.publishedAt=new Date(NOW-72*3600000)
  assert.deepEqual(evaluateDailyPilotEvidence(old,NOW).reasons,['stale_or_unverified_news'])
  const unknown=valid();unknown.story.source='reddit_openai'
  assert.ok(evaluateDailyPilotEvidence(unknown,NOW).reasons.includes('stale_or_unverified_news'))
})
test('no unsafe cross-project, missing rights or duplicate illustrative images',()=>{
  const foreign=valid();foreign.images[1].projectId='88888888-8888-4888-8888-888888888888'
  assert.ok(evaluateDailyPilotEvidence(foreign,NOW).reasons.includes('missing_approved_images'))
  const unlicensed=valid();unlicensed.images[0].rightsVerified=false
  assert.ok(evaluateDailyPilotEvidence(unlicensed,NOW).reasons.includes('missing_approved_images'))
  const duplicate=valid();duplicate.images[1].assetId=duplicate.images[0].assetId
  assert.ok(evaluateDailyPilotEvidence(duplicate,NOW).reasons.includes('missing_approved_images'))
})
test('no English-less, unapproved or undocumented story can be called eligible',()=>{
  const nonenglish=valid();nonenglish.language='sv'
  assert.ok(evaluateDailyPilotEvidence(nonenglish,NOW).reasons.includes('non_english'))
  const unapproved=valid();unapproved.humanPreviewApproved=false
  assert.ok(evaluateDailyPilotEvidence(unapproved,NOW).reasons.includes('missing_editorial_approval'))
  const nohistory=valid();nohistory.duplicateNewsChecked=false
  assert.ok(evaluateDailyPilotEvidence(nohistory,NOW).reasons.includes('missing_provenance'))
})
test('private preview can be prepared before owner approval; release stays blocked',()=>{
  const draft=valid();draft.humanPreviewApproved=false
  const prepared=prepareDailyPilotPreview(draft,NOW)
  assert.equal(prepared.ok,true)
  if(prepared.ok){
    assert.equal(prepared.props.audioUrl,draft.audio.url)
    assert.equal(prepared.props.creativeVersion,'the-prompt-editorial-v1')
    assert.equal(prepared.props.sourceUrl,draft.story.url)
    assert.deepEqual(prepared.props.images,draft.images.map(x=>x.url))
    assert.equal(prepared.props.words.length,18)
  }
  assert.ok(evaluateDailyPilotEvidence(draft,NOW,'release').reasons.includes('missing_editorial_approval'))
})
test('untrusted media cannot pass even the private preview preflight',()=>{
  const draft=valid();draft.humanPreviewApproved=false;draft.images[0].rightsVerified=false
  const prepared=prepareDailyPilotPreview(draft,NOW)
  assert.equal(prepared.ok,false)
  if(!prepared.ok)assert.ok(prepared.reasons.includes('missing_approved_images'))
})
test('wrong narrator, broken audio or missing word timing reject entire episode',()=>{
  const megan=valid();megan.audio.voiceId='1FmDfZG0Nx2dCk793S1a'
  assert.ok(evaluateDailyPilotEvidence(megan,NOW).reasons.includes('invalid_voice'))
  const noAudio=valid();noAudio.audio.url=''
  assert.ok(evaluateDailyPilotEvidence(noAudio,NOW).reasons.includes('invalid_audio'))
  const badTiming=valid();badTiming.audio.words=[]
  assert.ok(evaluateDailyPilotEvidence(badTiming,NOW).reasons.includes('missing_captions'))
  const overflow=valid();overflow.audio.words.at(-1)!.endMs=30000
  assert.ok(evaluateDailyPilotEvidence(overflow,NOW).reasons.includes('missing_captions'))
})
