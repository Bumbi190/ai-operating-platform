/**
 * The Prompt's one approved V3 editorial master, locked to exact bytes and
 * source assets. DRY RUN by default. No new AI provider calls and NO publish.
 *
 * This is a separate output from four admitted source clips, not a second
 * generation. Production admission stays in media/asset/admission.ts only.
 */
import {readFile,stat} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

export const APPROVED_V3={
  projectId:'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52',
  scriptId:'b0495f6b-9973-40dc-ae9b-156cc110ab51',
  basename:'ThePrompt_Dynamic_V3_720_Master_TEST_2026-10-28.mp4',
  bytes:6878149,
  sha256:'d23d62737aa04b4203159b0da0f775a88addf50274e16c79d3bfa12e8f092788',
  width:720,height:1280,durationMs:30720,
  sourceAssetIds:[
    '30e4b399-d3f4-4aec-9dc9-4f468c413b69',
    'd806c254-0b22-46be-abb9-a52310eb6af7',
    'dda65355-c200-4a41-a1ff-12f7da10e637',
    '069bac8a-9c88-4f41-b872-7fdcde33a992',
  ],
  storagePath:'the-prompt/approved-v3/20261028/master-d23d62737aa04b4203159b0d',
  approvalScope:'creative_master_and_style_only',
}
export const EXPECTED_HOST='iboepohjwrhtgshrqaol.supabase.co'
export class ApprovedV3Refusal extends Error{
  constructor(code){super('THEPROMPT_V3_MASTER_REFUSED');this.name='ApprovedV3Refusal';this.code=code}
}
export function verifyV3MasterBytes(input){
 if(!Buffer.isBuffer(input))throw new ApprovedV3Refusal('invalid_input')
 if(input.length!==APPROVED_V3.bytes)throw new ApprovedV3Refusal('size_mismatch')
 const sha256=createHash('sha256').update(input).digest('hex')
 if(sha256!==APPROVED_V3.sha256)throw new ApprovedV3Refusal('hash_mismatch')
 if(input.toString('ascii',4,8)!=='ftyp')throw new ApprovedV3Refusal('mp4_invalid')
 return {sha256,bytes:input.length,width:APPROVED_V3.width,height:APPROVED_V3.height,durationMs:APPROVED_V3.durationMs}
}
export function derivedMasterAdmission(bytes){
 verifyV3MasterBytes(bytes)
 return {
  projectId:APPROVED_V3.projectId,kind:'video',visibility:'internal',
  mimeType:'video/mp4',bytes,
  width:APPROVED_V3.width,height:APPROVED_V3.height,durationMs:APPROVED_V3.durationMs,
  storage:{path:APPROVED_V3.storagePath},
  provenance:{
    source:'derived',durationMs:APPROVED_V3.durationMs,simulated:false,
    adapterVersion:'filmcraft-0.9.0',
    referenceAssetIds:[...APPROVED_V3.sourceAssetIds],
    providerMetadata:{
      scriptId:APPROVED_V3.scriptId,
      sourceAssetIds:[...APPROVED_V3.sourceAssetIds],
      creativeProfile:'theprompt-dynamic-editorial-v3',
      creativeApprovalDate:'2026-10-28',
      creativeMasterApproved:true,
      publicationApproved:false,
      automatedPublishingApproved:false,
      reusesPreviouslyPublishedNarration:true,
      disclaimer:'Previously published source story. Asset approval is NOT permission to repost.',
      checksumSha256:APPROVED_V3.sha256,
    },
  },
 }
}
export function verifyExistingMaster(row,provenance){
 return !!row&&row.project_id===APPROVED_V3.projectId&&row.kind==='video'&&
 row.mime_type==='video/mp4'&&row.status==='active'&&row.visibility==='internal'&&
 row.storage_bucket==='media-assets-private'&&
 row.storage_path===APPROVED_V3.storagePath+'.mp4'&&
 row.checksum_sha256===APPROVED_V3.sha256&&Number(row.byte_size)===APPROVED_V3.bytes&&
 row.width===APPROVED_V3.width&&row.height===APPROVED_V3.height&&
 row.duration_ms===APPROVED_V3.durationMs&&
 !!provenance&&provenance.asset_id===row.id&&provenance.source==='derived'&&
 provenance.adapter_version==='filmcraft-0.9.0'&&
 Array.isArray(provenance.reference_asset_ids)&&
 provenance.reference_asset_ids.length===APPROVED_V3.sourceAssetIds.length&&
 APPROVED_V3.sourceAssetIds.every((ref,i)=>provenance.reference_asset_ids[i]===ref)&&
 provenance.provider_metadata?.creativeMasterApproved===true&&
 provenance.provider_metadata?.publicationApproved===false&&
 provenance.provider_metadata?.scriptId===APPROVED_V3.scriptId&&
 provenance.provider_metadata?.checksumSha256===APPROVED_V3.sha256
}

const SOURCE_DIR='C:/Users/Andre/Projects/Theprompt/Nyheter/Provreel-20261022/preview-local/FilmCraft-review/V3-Dynamic'
async function main(){
 const full=resolve(SOURCE_DIR,APPROVED_V3.basename)
 const s=await stat(full).catch(()=>{throw new ApprovedV3Refusal('source_unavailable')})
 if(!s.isFile()||s.size!==APPROVED_V3.bytes)throw new ApprovedV3Refusal('size_mismatch')
 const bytes=await readFile(full).catch(()=>{throw new ApprovedV3Refusal('source_unavailable')})
 const input=derivedMasterAdmission(bytes)
 if(!process.argv.includes('--apply')){
  console.log('APPROVED_V3_READ_ONLY_OK sha256='+APPROVED_V3.sha256.slice(0,16)+'… bytes='+bytes.length+' publication=OFF')
  return
 }
 if(process.env.OMNIRA_THEPROMPT_MASTER_IMPORT_APPROVED!=='1')
  throw new ApprovedV3Refusal('operator_gate_off')
 let uri
 try{uri=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??'')}catch{
  throw new ApprovedV3Refusal('supabase_not_configured')
 }
 if(uri.protocol!=='https:'||uri.hostname!==EXPECTED_HOST||uri.pathname!=='/'||uri.search||uri.hash)
  throw new ApprovedV3Refusal('wrong_supabase_target')
 if(!process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new ApprovedV3Refusal('supabase_not_configured')

 const [{createAdminClient},{admitAssetBytes}]=await Promise.all([
   import('../../lib/supabase/admin.ts'),
   import('../../lib/media/asset/admission.ts'),
 ])
 const db=createAdminClient()
 const {data:p,error:pe}=await db.from('projects').select('id,slug')
  .eq('id',APPROVED_V3.projectId).maybeSingle()
 if(pe||p?.slug!=='ai-media-automation')throw new ApprovedV3Refusal('wrong_project')
 const {data:existing,error:ee}=await db.from('assets').select('*')
  .eq('project_id',APPROVED_V3.projectId)
  .eq('checksum_sha256',APPROVED_V3.sha256)
  .limit(2)
 if(ee||!existing||existing.length>1)throw new ApprovedV3Refusal('existing_lookup_failed')
 if(existing.length===1){
  const {data:prov,error:prErr}=await db.from('asset_provenance').select('*')
   .eq('asset_id',existing[0].id).maybeSingle()
  if(prErr||!verifyExistingMaster(existing[0],prov))throw new ApprovedV3Refusal('existing_record_conflict')
  console.log('APPROVED_V3_ALREADY_CANONICAL asset='+existing[0].id+' published=false')
  return
 }
 // A destination collision with a different hash must not be overwritten.
 const {data:conflict,error:ce}=await db.from('assets').select('id').eq('storage_bucket','media-assets-private')
  .eq('storage_path',APPROVED_V3.storagePath+'.mp4').maybeSingle()
 if(ce||conflict)throw new ApprovedV3Refusal('storage_identity_conflict')
 let result
 try{result=await admitAssetBytes(input)}catch{
  throw new ApprovedV3Refusal('ambiguous_admission_review_required')
 }
 if(result?.asset?.projectId!==APPROVED_V3.projectId||
  result.asset.checksumSha256!==APPROVED_V3.sha256||
  result.asset.storage?.bucket!=='media-assets-private'||
  result.asset.storage.path!==APPROVED_V3.storagePath+'.mp4'||
  result.provenance?.source!=='derived'||
  result.provenance?.assetId!==result.asset.id)
  throw new ApprovedV3Refusal('receipt_mismatch_review_required')
 console.log('APPROVED_V3_PRIVATE_CANONICAL_OK asset='+result.asset.id+' publication=OFF')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(e=>{
  console.error('NO-GO: '+(e instanceof ApprovedV3Refusal?e.code:'unexpected_failure'))
  process.exitCode=1
 })
}
