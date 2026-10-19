import {it,expect} from 'vitest'
import {resolveNewsEvidence} from './verify'
import {boundaryFixture} from './boundary.test-utils'
import {id} from './fixtures.test-utils'
import {newsEvidenceSha256} from './contract'
it('uploaded_receipt_cannot_impersonate_operator_intake',async()=>{
 for(const change of [{source:'uploaded'},{source:'imported'},{simulated:true},{adapter_version:'other'}]){
  const f=boundaryFixture();Object.assign(f.tables.asset_provenance[0],change)
  await expect(resolveNewsEvidence(f.db,f.principal,f.input,f.now)).rejects.toMatchObject({code:'MISSING_RENDER_EVIDENCE'})
  expect(f.effects).toMatchObject({writes:0,signs:0,reads:0})
 }
})
it('private_placeholder_and_missing_news_refused',async()=>{
 for(const change of [{news_item_id:null},{video_status:'private_preview'},{raw_output:{private_provider_preview:{state:'ready'}}}]){
  const f=boundaryFixture();Object.assign(f.tables.media_scripts[0],change)
  await expect(resolveNewsEvidence(f.db,f.principal,f.input,f.now)).rejects.toBeTruthy()
  expect(f.effects).toMatchObject({writes:0,signs:0})
 }
 const f=boundaryFixture();await expect(resolveNewsEvidence(f.db,{...f.principal,allowedProjectIds:[]},f.input,f.now)).rejects.toMatchObject({code:'NOT_FOUND'});expect(f.effects.reads).toBe(0)
})
it('actual_bytes_voice_source_and_cost_refs_required',async()=>{
 const good=boundaryFixture();const result=await resolveNewsEvidence(good.db,good.principal,good.input,good.now);expect(result.destinations).toEqual([{channel:'instagram',bindingId:null,accountId:null}]);expect(result.provenanceId).toBe(result.video.id);expect(newsEvidenceSha256(result)).toMatch(/^[a-f0-9]{64}$/)
 for(const mode of ['bytes','voice','foreign','cost','source','error','stop','caption','costprovider'] as const){
  const f=boundaryFixture()
  if(mode==='bytes')f.bytes.set(id(7),Buffer.from('tampered'))
  if(mode==='voice')f.tables.media_scripts[0].raw_output.pilot_voice_receipt={...f.snapshot.receipt.voiceReceipt,voiceId:'other'}
  if(mode==='foreign')f.tables.assets[2].project_id=id(999)
  if(mode==='cost')f.tables.cost_events=[]
  if(mode==='costprovider')f.tables.cost_events[0].provider='unrelated'
  if(mode==='source')f.tables.media_news_items[0].raw_output.source_published_at='2026-10-15T00:00:00Z'
  if(mode==='error')f.setFailure()
  if(mode==='stop')f.setStopped()
  if(mode==='caption')f.tables.media_scripts[0].cta='Changed'
  await expect(resolveNewsEvidence(f.db,f.principal,f.input,f.now)).rejects.toBeTruthy()
  expect(f.effects).toMatchObject({writes:0,signs:0})
 }
})
it('approved_plan_video_destinations_only',async()=>{
 const f=boundaryFixture();f.getPlan().decision.decision='reject'
 await expect(resolveNewsEvidence(f.db,f.principal,f.input,f.now)).rejects.toMatchObject({code:'PLAN_REQUIRED'})
 const g=boundaryFixture();g.getPlan().currentRevision.choices=[{channel:'facebook',format:'text'}]
 await expect(resolveNewsEvidence(g.db,g.principal,g.input,g.now)).rejects.toMatchObject({code:'PLAN_REQUIRED'})
})
