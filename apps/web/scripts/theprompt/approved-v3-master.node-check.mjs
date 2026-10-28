import assert from 'node:assert/strict'
import {test,describe} from 'node:test'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {APPROVED_V3,ApprovedV3Refusal,verifyV3MasterBytes,derivedMasterAdmission,verifyExistingMaster} from './approved-v3-master.mjs'

function refuses(f,code){
 assert.throws(f,e=>e instanceof ApprovedV3Refusal && e.code===code)
}
const row={
 id:'11111111-1111-4111-8111-111111111111',
 project_id:APPROVED_V3.projectId,kind:'video',mime_type:'video/mp4',
 status:'active',visibility:'internal',
 storage_bucket:'media-assets-private',storage_path:APPROVED_V3.storagePath+'.mp4',
 checksum_sha256:APPROVED_V3.sha256,byte_size:APPROVED_V3.bytes,
 width:APPROVED_V3.width,height:APPROVED_V3.height,duration_ms:APPROVED_V3.durationMs,
}
const prov={
 asset_id:row.id,source:'derived',adapter_version:'filmcraft-0.9.0',
 reference_asset_ids:[...APPROVED_V3.sourceAssetIds],
 provider_metadata:{creativeMasterApproved:true,publicationApproved:false,scriptId:APPROVED_V3.scriptId,checksumSha256:APPROVED_V3.sha256},
}
describe('Approved The Prompt V3 editorial master cannot publish or substitute content',()=>{
 test('approval asset and four original IDs are project-pinned',()=>{
  assert.equal(APPROVED_V3.projectId,'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52')
  assert.equal(APPROVED_V3.sourceAssetIds.length,4)
  assert.equal(new Set(APPROVED_V3.sourceAssetIds).size,4)
  assert.equal(APPROVED_V3.durationMs,30720)
  assert.equal(APPROVED_V3.width/APPROVED_V3.height,9/16)
 })
 test('rejects tiny or substituted output before store',()=>{
  refuses(()=>verifyV3MasterBytes(Buffer.alloc(10)),'size_mismatch')
  refuses(()=>verifyV3MasterBytes(Buffer.alloc(APPROVED_V3.bytes)),'hash_mismatch')
  refuses(()=>verifyV3MasterBytes(null),'invalid_input')
 })
 test('identical existing master identity is reusable',()=>{
  assert.equal(verifyExistingMaster(row,prov),true)
 })
 test('a foreign master, public asset or changed bytes cannot be used',()=>{
  for(const patch of [{project_id:'foreign'},{visibility:'public'},
   {checksum_sha256:'b'.repeat(64)},{duration_ms:28049},
   {storage_path:'the-prompt/not-our-output.mp4'},{status:'archived'}]){
    assert.equal(verifyExistingMaster({...row,...patch},prov),false)
  }
 })
 test('missing or rewritten creative approval cannot be trusted',()=>{
  assert.equal(verifyExistingMaster(row,null),false)
  assert.equal(verifyExistingMaster(row,{...prov,source:'imported'}),false)
  assert.equal(verifyExistingMaster(row,{...prov,reference_asset_ids:[]}),false)
  assert.equal(verifyExistingMaster(row,{...prov,provider_metadata:{...prov.provider_metadata,scriptId:'foreign'}}),false)
  assert.equal(verifyExistingMaster(row,{...prov,provider_metadata:{creativeMasterApproved:true,publicationApproved:true}}),false)
  assert.equal(verifyExistingMaster(row,{...prov,provider_metadata:{creativeMasterApproved:false,publicationApproved:false}}),false)
 })
 test('real approved master produces a derived private asset with traceable source IDs',async(t)=>{
  if(!process.env.THEPROMPT_V3_MASTER_DIR){t.skip('private editorial master absent in CI');return}
  const bytes=await readFile(join(process.env.THEPROMPT_V3_MASTER_DIR,APPROVED_V3.basename))
  const verified=verifyV3MasterBytes(bytes)
  const v=derivedMasterAdmission(bytes)
  assert.equal(verified.sha256,APPROVED_V3.sha256)
  assert.equal(v.kind,'video')
  assert.equal(v.visibility,'internal')
  assert.equal(v.provenance.source,'derived')
  assert.equal(v.provenance.providerMetadata.creativeMasterApproved,true)
  assert.equal(v.provenance.providerMetadata.publicationApproved,false)
  assert.deepEqual(v.provenance.referenceAssetIds,APPROVED_V3.sourceAssetIds)
 })
})
