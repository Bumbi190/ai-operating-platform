import 'server-only'
import {createHash} from 'node:crypto'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {SocialContentPrincipal} from './types'
import {FAMILY_WEEKLY_PROJECT_ID} from './family-weekly-coverage'
import {
 FamilySourceStoreError,readLatestOwnerApprovedFamilyMonthSource,
} from './family-month-source-store'

type Db=ReturnType<typeof createAdminClient>
type DbReader={from:(table:string)=>any;storage:{from:(bucket:string)=>any}}
const MAX_PROOFS=3
const MAX_IMAGE_BYTES=5*1024*1024
const SHA=/^[0-9a-f]{64}$/
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MIME=new Set(['image/png','image/jpeg','image/webp'])
const BUCKET='media-assets-private'
function fail():never{throw new FamilySourceStoreError('REVIEW_REQUIRED')}
function imageHeader(bytes:Buffer,mime:string){
 if(mime==='image/jpeg')return bytes.length>3&&bytes[0]===0xff&&
  bytes[1]===0xd8&&bytes[2]===0xff
 if(mime==='image/png')return bytes.length>8&&
  bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
 if(mime==='image/webp')return bytes.length>12&&
  bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'
 return false
}

export type OwnerApprovedPublicSource={
 kind:'family-owner-approved-public-source-v1'
 projectId:typeof FAMILY_WEEKLY_PROJECT_ID
 sourceMonth:string
 candidateId:string
 candidateSha256:string
 decisionId:string
 approvedAt:string
 sourceIntegrityVerified:true
 verifiedImageCount:number
 verifiedImageAssetIds:string[]
 templateDates:string[]
 templates:Array<{date:string;variant:string;title:string;text:string}>
 canDraftReviewProposals:true
 canGenerateMedia:false
 canOpenMemberContent:false
 canSchedule:false
 canPublish:false
 canSpend:false
}

/**
 * A persisted owner APPROVE is necessary but not sufficient. Verify each
 * project-owned social-media image from the private media-assets bucket by
 * downloading and hashing the actual bytes. Evidence text or user-provided
 * hashes alone never authorize a public content source.
 *
 * Read-only, no external AI generation, no signed URL return or storage copy.
 * Feature-disabled by default even if the review feature was enabled.
 */
export async function resolveFamilyOwnerApprovedPublicSource(
 db:Db,principal:SocialContentPrincipal,month:string,
):Promise<OwnerApprovedPublicSource>{
 if(process.env.FAMILY_PUBLIC_SOURCE_ACTIVATION_ENABLED!=='true')
  fail()
 const source=await readLatestOwnerApprovedFamilyMonthSource(db,principal,month)
 const proof=source.proposal.proof
 if(!Array.isArray(proof)||proof.length<1||proof.length>MAX_PROOFS)
  fail()
 const readDb=db as unknown as DbReader
 const seen=new Set<string>()
 let verifiedImageCount=0
 const verifiedImageAssetIds:string[]=[]
 for(const expected of proof){
  // Only assets already registered under THIS project qualify. External
  // URLs, plain text refs and private subscriber story/audio never do.
  if(expected.kind!=='owner-project-public-evidence'||
    expected.privateSubscriberAsset!==false||
    typeof expected.referenceId!=='string'||!UUID.test(expected.referenceId)||
    !SHA.test(expected.sha256)||seen.has(expected.referenceId))fail()
  seen.add(expected.referenceId)
  let row:any
  try{
   const result=await readDb.from('assets').select(
    'id,project_id,kind,mime_type,byte_size,checksum_sha256,visibility,status,storage_bucket,storage_path'
   ).eq('id',expected.referenceId).eq('project_id',FAMILY_WEEKLY_PROJECT_ID).maybeSingle()
   if(result.error)fail()
   row=result.data
  }catch{fail()}
  if(!row||row.id!==expected.referenceId||
   row.project_id!==FAMILY_WEEKLY_PROJECT_ID||
   row.kind!=='image'||row.status!=='active'||
   row.visibility!=='internal'||!MIME.has(row.mime_type)||
   row.checksum_sha256!==expected.sha256||
   row.storage_bucket!==BUCKET||
   !Number.isSafeInteger(Number(row.byte_size))||
   Number(row.byte_size)<16||Number(row.byte_size)>MAX_IMAGE_BYTES||
   typeof row.storage_path!=='string'||
   !row.storage_path.startsWith(FAMILY_WEEKLY_PROJECT_ID+'/social/')||
   row.storage_path.includes('..')||row.storage_path.includes('\\')||
   !/^[A-Za-z0-9_./-]{40,260}$/.test(row.storage_path))
   fail()
  let blob:Blob|undefined
  try{
   const result=await readDb.storage.from(BUCKET).download(row.storage_path)
   if(result.error||!result.data)fail()
   blob=result.data
  }catch{fail()}
  if(!blob||blob.size!==Number(row.byte_size)||blob.size>MAX_IMAGE_BYTES)
   fail()
  let bytes:Buffer
  try{bytes=Buffer.from(await blob.arrayBuffer())}catch{fail()}
  if(bytes.length!==Number(row.byte_size)||
   !imageHeader(bytes,row.mime_type)||
   createHash('sha256').update(bytes).digest('hex')!==expected.sha256)
   fail()
  verifiedImageCount++
  verifiedImageAssetIds.push(expected.referenceId)
 }
 // Re-check durable owner approval after I/O. Newer source revisions
 // invalidate this candidate; no stale approval can be returned to Atlas.
 const current=await readLatestOwnerApprovedFamilyMonthSource(db,principal,month)
 if(current.candidateId!==source.candidateId||
   current.candidateSha256!==source.candidateSha256||
   current.decisionId!==source.decisionId)fail()
 // Source copies are still UNAPPROVED individual social posts and get
 // their own exact version + media + owner publication review.
 const templates=source.proposal.proposedCopy.map(c=>({
  date:c.date,variant:c.variant,title:c.title,text:c.text,
 }))
 return {
  kind:'family-owner-approved-public-source-v1',
  projectId:FAMILY_WEEKLY_PROJECT_ID,sourceMonth:month,
  candidateId:source.candidateId,candidateSha256:source.candidateSha256,
  decisionId:source.decisionId,approvedAt:source.decidedAt,
  sourceIntegrityVerified:true,verifiedImageCount,verifiedImageAssetIds,
  templateDates:templates.map(c=>c.date),
  templates,canDraftReviewProposals:true,
  canGenerateMedia:false,canOpenMemberContent:false,
  canSchedule:false,canPublish:false,canSpend:false,
 }
}
