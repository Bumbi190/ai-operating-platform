import {test} from 'node:test'
import assert from 'node:assert/strict'
import {
  assessPersistedDailyPilot,type ScriptAuditRow,type NewsAuditRow,
} from '../../web/lib/media/daily-pilot-readiness'

const projectId='11111111-1111-4111-8111-111111111111'
const scriptId='22222222-2222-4222-8222-222222222222'
const storyId='33333333-3333-4333-8333-333333333333'
const now=Date.parse('2026-10-17T15:00:00.000Z')
const script=():ScriptAuditRow=>({
  id:scriptId,project_id:projectId,news_item_id:storyId,
  hook:'A new Codex AI coding feature was tested',script:'Developers are discussing new AI agent tools.',
  status:'approved',voice_status:'ready',audio_url:'https://test.invalid/speech.mp3',
  timing_url:'https://test.invalid/timings.json',duration_ms:18000,
  images:['https://test.invalid/a.png','https://test.invalid/b.png','https://test.invalid/c.png'],
  raw_output:{},
})
const news=():NewsAuditRow=>({
  id:storyId,project_id:projectId,title:'OpenAI tests a Codex AI agent workflow',
  summary:'A new Codex AI agent capability is tested by OpenAI',
  url:'https://openai.com/index/agent-update',
  source_name:'OpenAI Blog',raw_output:{source_published_at:'2026-10-17T13:00:00Z',source_key:'rss_openai'},
})

test('real legacy pipeline: timestamp missing means NOT ready, never use generated_at as news date',()=>{
  const n=news();n.raw_output={}
  const result=assessPersistedDailyPilot(projectId,script(),n,now)
  assert.equal(result.hasVerifiedSourceDate,false)
  assert.equal(result.hasAuditableFreshStory,false)
  assert.equal(result.canPublish,false)
  assert.ok(result.blockers.includes('source_timestamp_missing'))
  assert.equal(result.media.imageCount,3)
  assert.equal(result.media.audioPresent,true)
  assert.equal(result.media.timingUrlPresent,true)
  assert.ok(!JSON.stringify(result).includes('test.invalid'))
})

test('future strict pipeline: date+verified source allow audit, NOT automatic publishing',()=>{
  const a=assessPersistedDailyPilot(projectId,script(),news(),now)
  assert.equal(a.hasVerifiedSourceDate,true)
  assert.equal(a.hasAuditableFreshStory,true)
  assert.equal(a.canPublish,false)
  assert.ok(a.blockers.includes('image_rights_unverified'))
  assert.ok(a.blockers.includes('voice_identity_unproven'))
  assert.ok(a.blockers.includes('timing_unverified'))
  assert.ok(a.blockers.includes('owner_approval_missing'))
  assert.equal(a.sourcePublishedAt,'2026-10-17T13:00:00.000Z')
})
test('missing source key and stale claims must refuse first-stage freshness',()=>{
  const missing=news();missing.raw_output={source_published_at:'2026-10-17T13:00:00Z'}
  assert.ok(assessPersistedDailyPilot(projectId,script(),missing,now).blockers.includes('source_key_missing'))
  const stale=news();stale.raw_output={source_published_at:'2026-10-13T13:00:00Z',source_key:'rss_openai'}
  assert.ok(assessPersistedDailyPilot(projectId,script(),stale,now).blockers.includes('source_not_fresh'))
})
test('different project or nonready audio cannot enter story audit',()=>{
  const s=script();s.project_id='88888888-8888-4888-8888-888888888888'
  assert.equal(assessPersistedDailyPilot(projectId,s,news(),now).hasAuditableFreshStory,false)
  const wrong=script();wrong.voice_status='none';wrong.images=[]
  const audit=assessPersistedDailyPilot(projectId,wrong,news(),now)
  assert.equal(audit.hasAuditableFreshStory,false)
  assert.ok(audit.blockers.includes('not_render_ready'))
  assert.ok(audit.blockers.includes('images_missing'))
})
test('absent script/story are explicit blockers, not falsely green',()=>{
  assert.deepEqual(assessPersistedDailyPilot(projectId,null,null,now).blockers,['missing_script'])
  assert.ok(assessPersistedDailyPilot(projectId,script(),null,now).blockers.includes('missing_story'))
})
