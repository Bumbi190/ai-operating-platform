import assert from 'node:assert/strict'
import {describe,it} from 'node:test'
import {readFile} from 'node:fs/promises'
import {APPROVED_CLIPS,inspectApprovedClipDirectory} from './approved-clips-preflight.mjs'
import {importApprovedClips,ApprovedImportRefusal} from './import-approved-clips.mjs'

const projectId='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const ids=[
 '10000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000002',
 '10000000-0000-4000-8000-000000000003',
 '10000000-0000-4000-8000-000000000004',
]
const clips=APPROVED_CLIPS.map((c,i)=>({
 index:i,name:c.name,sha256:c.sha256,size:c.bytes,
 width:720,height:1280,durationMs:4042,
 storagePath:'the-prompt/provreel-20261022/scene-'+i+'-'+c.sha256.slice(0,24),
 filepath:'placeholder-'+i,
}))
const existing=c=>({
 asset:{
  id:ids[c.index],project_id:projectId,kind:'video',
  mime_type:'video/mp4',status:'active',visibility:'internal',
  storage_bucket:'media-assets-private',storage_path:c.storagePath+'.mp4',
  checksum_sha256:c.sha256,byte_size:c.size,
  width:720,height:1280,duration_ms:4042,
 },
 provenance:{
  asset_id:ids[c.index],source:'imported',provider:'higgsfield',
  model:'grok_video_v15_lite',simulated:false,
 },
})
const refusal=(p,code)=>assert.rejects(p,e=>e instanceof ApprovedImportRefusal&&e.code===code)

describe('Canonical four-clip import (all external effects injected)',()=>{
 it('never reads source or uploads if all four matching assets already exist',async()=>{
  let reads=0,writes=0,lookups=0
  const receipts=await importApprovedClips({
   clips,projectId,findExisting:async c=>{lookups++;return existing(c)},
   readSource:async()=>{reads++;throw Error('not allowed')},
   admit:async()=>{writes++;throw Error('not allowed')},
  })
  assert.equal(lookups,4)
  assert.equal(reads,0)
  assert.equal(writes,0)
  assert.ok(receipts.every(x=>x.status==='already_imported'))
  assert.deepEqual(receipts.map(x=>x.assetId),ids)
 })
 it('refuses an inconsistent fourth stored asset BEFORE any upload',async()=>{
  let writes=0
  await refusal(importApprovedClips({
   clips,projectId,findExisting:async c=>c.index===3?
    {...existing(c),asset:{...existing(c).asset,project_id:'different-project'}}:
    (c.index===0?null:existing(c)),
   readSource:async()=>{throw Error('should not read')},
   admit:async()=>{writes++;},
  }),'existing_record_conflict')
  assert.equal(writes,0)
 })
 it('refuses DB read errors without attempting an admission',async()=>{
  let writes=0
  await refusal(importApprovedClips({
   clips,projectId,findExisting:async()=>{throw Error('db failed')},
   readSource:async()=>{throw Error('should not read')},
   admit:async()=>{writes++;},
  }),'lookup_unavailable')
  assert.equal(writes,0)
 })
 it('rejects wrong project and any substituted manifest before DB reads',async()=>{
  let lookups=0
  const deps={findExisting:async()=>{lookups++;return null},readSource:async()=>null,admit:async()=>null}
  await refusal(importApprovedClips({clips,projectId:'invalid',...deps}),'invalid_plan')
  await refusal(importApprovedClips({
   clips:clips.map((c,i)=>i===2?{...c,sha256:'0'.repeat(64)}:c),
   projectId,...deps,
  }),'invalid_plan')
  assert.equal(lookups,0)
 })
 it('refuses a changed source BEFORE any canonical write',async()=>{
  let writes=0,reads=0
  await refusal(importApprovedClips({
   clips,projectId,findExisting:async()=>null,
   readSource:async c=>{reads++;if(c.index===3)throw Error('missing');return Buffer.alloc(5)},
   admit:async()=>{writes++;},
  }),'source_changed')
  assert.equal(reads,1)
  assert.equal(writes,0)
 })
 it('runs a real local source-to-canonical-admission simulation when files are available',async(t)=>{
  const sourceDir=process.env.THEPROMPT_APPROVED_CLIPS_DIR
  if(!sourceDir){t.skip('Operator source folder unavailable in CI');return}
  const actual=await inspectApprovedClipDirectory(sourceDir)
  const seen=[]
  const receipts=await importApprovedClips({
   clips:actual,projectId,findExisting:async()=>null,
   readSource:async c=>readFile(c.filepath),
   admit:async input=>{
    const i=actual.findIndex(x=>x.storagePath===input.storage.path)
    assert.ok(i>=0)
    assert.equal(input.visibility,'internal')
    assert.equal(input.kind,'video')
    assert.equal(input.mimeType,'video/mp4')
    assert.equal(input.provenance.source,'imported')
    assert.equal(input.provenance.providerMetadata.publicationApproved,false)
    assert.equal(input.bytes.length,APPROVED_CLIPS[i].bytes)
    seen.push(i)
    return {
     asset:{id:ids[i],projectId,kind:'video',visibility:'internal',
      checksumSha256:actual[i].sha256,
      storage:{bucket:'media-assets-private',path:input.storage.path+'.mp4'}},
     provenance:{assetId:ids[i],source:'imported'},
    }
   },
  })
  assert.deepEqual(seen,[0,1,2,3])
  assert.deepEqual(receipts.map(x=>x.status),['imported','imported','imported','imported'])
 })
 it('checks the real fourth file before admitting the valid first three',async(t)=>{
  const sourceDir=process.env.THEPROMPT_APPROVED_CLIPS_DIR
  if(!sourceDir){t.skip('Operator source folder unavailable in CI');return}
  const actual=await inspectApprovedClipDirectory(sourceDir)
  let attemptedAdmissions=0
  await refusal(importApprovedClips({
   clips:actual,projectId,findExisting:async()=>null,
   readSource:async c=>c.index===3?Buffer.alloc(4):readFile(c.filepath),
   admit:async()=>{attemptedAdmissions++;},
  }),'source_changed')
  assert.equal(attemptedAdmissions,0)
 })
})
