import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeReferenceFormat } from '../content-growth/reference-format-observations.ts'

const capture = () => ({
  projectId: '00000000-0000-4000-8000-000000000001', captureId: '00000000-0000-4000-8000-000000000003', sourceKind: 'synthetic',
  sourceId: '00000000-0000-4000-8000-000000000004', durationMs: 6000, audioEvidence: 'not_captured',
  frames: [{frameId:'00000000-0000-4000-8000-000000000011',atMs:120},{frameId:'00000000-0000-4000-8000-000000000012',atMs:2500},{frameId:'00000000-0000-4000-8000-000000000013',atMs:5900}],
})
const obs = (feature='recognizable_subject', frameId='00000000-0000-4000-8000-000000000011') =>
  ({feature,frameId,evidence:'caller_attested_visual_review'})
const summarize = (c=capture(), rows=[]) => summarizeReferenceFormat('00000000-0000-4000-8000-000000000001', c, rows)

test('no reviewed observations means no hypotheses or absence claims', () => {
  const out=summarize()
  assert.deepEqual(out.features,[])
  assert.equal(out.capturedFrameCount,3)
  assert.equal(out.frameCountWithRecordedObservations,0)
  assert.equal(out.firstCapturedAtMs,120)
  assert.equal(out.audioEvidence,'not_captured')
  assert.equal(out.performanceEvidence,'not_assessed')
  assert.equal(out.rightsStatus,'not_assessed')
})
test('features retain frame evidence in time order without mutating input', () => {
  const c=capture(), rows=[obs('on_screen_text','00000000-0000-4000-8000-000000000012'),obs('on_screen_text','00000000-0000-4000-8000-000000000011'),obs()]
  const before=JSON.stringify({c,rows})
  const out=summarize(c,rows)
  assert.equal(JSON.stringify({c,rows}),before)
  assert.deepEqual(out.features.map(x=>x.feature),['recognizable_subject','on_screen_text'])
  assert.deepEqual(out.features[1].evidence,[{frameId:'00000000-0000-4000-8000-000000000011',atMs:120},{frameId:'00000000-0000-4000-8000-000000000012',atMs:2500}])
  assert.equal(out.features[1].hypothesis,'test_text_hierarchy')
  assert.equal(out.frameCountWithRecordedObservations,2)
})
test('mixed project rejected',()=>assert.throws(()=>summarize({...capture(),projectId:'00000000-0000-4000-8000-000000000002'})))
test('unknown frame or unreviewed assertion rejected',()=>{
  assert.throws(()=>summarize(capture(),[obs('high_contrast','00000000-0000-4000-8000-000000000099')]))
  assert.throws(()=>summarize(capture(),[{...obs(),evidence:'inferred'}]))
})
test('unknown features including inherited names rejected',()=>{
  for(const f of ['spoken_hook','motion','viral','constructor','__proto__','toString'])
    assert.throws(()=>summarize(capture(),[obs(f)]))
})
test('duplicate feature/frame rejected; distinct features on same frame allowed',()=>{
  assert.throws(()=>summarize(capture(),[obs(),obs()]))
  assert.equal(summarize(capture(),[obs(),obs('high_contrast')]).features.length,2)
})
test('invalid or repeated frame identity and timestamps rejected',()=>{
  const c=capture()
  for(const frames of [[{frameId:'00000000-0000-4000-8000-000000000011',atMs:1},{frameId:'00000000-0000-4000-8000-000000000011',atMs:2}],
    [{frameId:'00000000-0000-4000-8000-000000000011',atMs:1},{frameId:'00000000-0000-4000-8000-000000000012',atMs:1}],
    [{frameId:'00000000-0000-4000-8000-000000000011',atMs:-1}],[{frameId:'00000000-0000-4000-8000-000000000011',atMs:6001}],
    [{frameId:'00000000-0000-4000-8000-000000000011',atMs:1.5}],[{frameId:'../x',atMs:1}],[]])
    assert.throws(()=>summarize({...c,frames}))
})
test('zero and exact duration boundaries accepted',()=>{
  const out=summarize({...capture(),frames:[{frameId:'00000000-0000-4000-8000-000000000010',atMs:0},{frameId:'00000000-0000-4000-8000-000000000019',atMs:6000}]})
  assert.equal(out.firstCapturedAtMs,0)
  assert.equal(out.lastCapturedAtMs,6000)
})
test('invalid manifest metadata rejected',()=>{
  for(const fields of [{sourceKind:'unknown'},{sourceId:'https://example.invalid'},{captureId:''},
    {audioEvidence:'transcribed'},{durationMs:0},{durationMs:900001},{durationMs:NaN}])
    assert.throws(()=>summarize({...capture(),...fields}))
})
test('resource limits enforced before classification',()=>{
  assert.throws(()=>summarize({...capture(),frames:Array.from({length:121},(_,i)=>({frameId:'f'+i,atMs:i}))}))
  assert.throws(()=>summarize(capture(),Array.from({length:721},()=>obs())))
})
test('no source text or visual asset returned even when extra input fields present',()=>{
  const out=summarize({...capture(),caption:'example private text',filePath:'example path'},[{...obs(),quote:'example quote'}])
  assert.doesNotMatch(JSON.stringify(out),/example private text|example path|example quote/)
  assert.equal(out.evidenceStatus,'caller_attested_visual_observations_only')
})

test('ordinary source text and identity-like strings are rejected in every echoed ID',()=>{
  for(const id of ['private_caption','Jane-Doe','frame.png','provider123']){
    const c=capture()
    assert.throws(()=>summarizeReferenceFormat(id,{...c,projectId:id},[]))
    assert.throws(()=>summarize({...c,captureId:id}))
    assert.throws(()=>summarize({...c,sourceId:id}))
    assert.throws(()=>summarize({...c,frames:[{frameId:id,atMs:1}]}))
    assert.throws(()=>summarize(c,[obs('on_screen_text',id)]))
  }
})
test('null and undefined capture or entries fail explicit validation',()=>{
  const c=capture()
  for(const value of [null,undefined]){
    assert.throws(()=>summarizeReferenceFormat(c.projectId,value,[]),/Invalid reference capture/)
    assert.throws(()=>summarize({...c,frames:[value]}),/Invalid or duplicate reference frame/)
    assert.throws(()=>summarize(c,[value]),/Invalid or unreviewed visual observation/)
  }
})
