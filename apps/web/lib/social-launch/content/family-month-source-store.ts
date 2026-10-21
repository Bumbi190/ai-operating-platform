import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {SocialContentPrincipal} from './types'
import {
 prepareFamilyMonthSourceReview,verifyOwnerSourceDecisionShape,
 type FamilyMonthSourceProposal,
} from './family-month-source-review'
import {FAMILY_WEEKLY_PROJECT_ID} from './family-weekly-coverage'
import {readSocialContent} from './store'

type Db=ReturnType<typeof createAdminClient>
type Row={
 id:string;project_id:string;source_month:string;plan_revision_id:string;
 candidate_sha256:string;payload:FamilyMonthSourceProposal;
 created_by:string;created_at:string;
}
type DecisionRow={
 id:string;candidate_id:string;project_id:string;candidate_sha256:string;
 decision:'approve'|'reject';decided_by:string;decided_at:string;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MONTH=/^20\d{2}-(0[1-9]|1[0-2])$/
const SHA=/^[a-f0-9]{64}$/
const PLAN='e745041f-ad3a-493f-bd3b-025525d561b2'
const TABLE='family_month_source_candidates'
const DECISIONS='family_month_source_decisions'

// These tables do NOT have generated Database types yet and are not deployed.
// Every use is a private, server-only service-role query AFTER owner proof.
type Query={from:(table:string)=>any}
function client(db:Db):Query{return db as unknown as Query}
export class FamilySourceStoreError extends Error{
 constructor(public code:'INVALID_INPUT'|'NOT_FOUND'|'REVIEW_REQUIRED'|'CONFLICT'|'UNAVAILABLE'){
  super(code)
 }
 get status(){return this.code==='NOT_FOUND'?404:
  this.code==='INVALID_INPUT'?400:this.code==='UNAVAILABLE'?503:409}
}
function fail(code:FamilySourceStoreError['code']):never{
 throw new FamilySourceStoreError(code)
}
function validateMonth(month:string){if(!MONTH.test(month))fail('INVALID_INPUT')}
function assertActor(actor:SocialContentPrincipal){
 if(!UUID.test(actor.userId)||!actor.allowedProjectIds.includes(FAMILY_WEEKLY_PROJECT_ID))
  fail('NOT_FOUND')
}
async function ownerProof(db:Db,actor:SocialContentPrincipal){
 assertActor(actor)
 const {data,error}=await client(db).from('projects')
  .select('id,slug,owner_id').eq('id',FAMILY_WEEKLY_PROJECT_ID).maybeSingle()
 if(error)fail('UNAVAILABLE')
 if(!data||data.id!==FAMILY_WEEKLY_PROJECT_ID||
  data.slug!=='familje-stunden'||data.owner_id!==actor.userId)
  fail('NOT_FOUND')
}
async function currentPlan(db:Db,actor:SocialContentPrincipal){
 const content=await readSocialContent(db,actor,{projectId:FAMILY_WEEKLY_PROJECT_ID})
 if(!content.planApproved||content.currentPlanRevisionId!==PLAN)
  fail('REVIEW_REQUIRED')
}

/**
 * A source review must not contain references that could never be used.
 * Only existing, registered, active PUBLIC-PREVIEW-ELIGIBLE project images
 * enter the queue. This validates metadata; full media bytes and rights
 * still require owner visual review and later independent SHA verification.
 */
async function registeredPublicProofs(db:Db,proposal:FamilyMonthSourceProposal){
 for(const proof of proposal.proof){
  const {data,error}=await client(db).from('assets')
   .select('id,project_id,status,kind,visibility,mime_type,byte_size,checksum_sha256,storage_bucket,storage_path')
   .eq('id',proof.referenceId).eq('project_id',FAMILY_WEEKLY_PROJECT_ID).maybeSingle()
  if(error)fail('UNAVAILABLE')
  if(!data||data.id!==proof.referenceId||
    data.project_id!==FAMILY_WEEKLY_PROJECT_ID||
    data.status!=='active'||data.kind!=='image'||
    data.visibility!=='internal'||
    !['image/jpeg','image/png','image/webp'].includes(data.mime_type)||
    data.checksum_sha256!==proof.sha256||
    data.storage_bucket!=='media-assets-private'||
    !Number.isSafeInteger(Number(data.byte_size))||
    Number(data.byte_size)<16||Number(data.byte_size)>5*1024*1024||
    typeof data.storage_path!=='string'||
    !data.storage_path.startsWith(FAMILY_WEEKLY_PROJECT_ID+'/social/')||
    data.storage_path.includes('..')||data.storage_path.includes('\\')||
    !/^[A-Za-z0-9_./-]{40,260}$/.test(data.storage_path))
   fail('REVIEW_REQUIRED')
 }
}
async function latestCandidates(db:Db,month:string){
 const {data,error}=await client(db).from(TABLE).select('*')
  .eq('project_id',FAMILY_WEEKLY_PROJECT_ID).eq('source_month',month)
  .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(30)
 if(error||!Array.isArray(data))fail('UNAVAILABLE')
 if(data.length>=30)fail('UNAVAILABLE') // no false latest from truncated history
 return data as Row[]
}
async function decisions(db:Db,candidates:Row[]){
 if(!candidates.length)return [] as DecisionRow[]
 const {data,error}=await client(db).from(DECISIONS).select('*')
  .eq('project_id',FAMILY_WEEKLY_PROJECT_ID)
  .in('candidate_id',candidates.map(x=>x.id)).limit(30)
 if(error||!Array.isArray(data))fail('UNAVAILABLE')
 return data as DecisionRow[]
}
function shape(candidate:Row,decision:DecisionRow|undefined){
 const review=prepareFamilyMonthSourceReview(candidate.payload)
 if(review.candidateSha256!==candidate.candidate_sha256 ||
  candidate.project_id!==FAMILY_WEEKLY_PROJECT_ID ||
  candidate.payload.projectId!==FAMILY_WEEKLY_PROJECT_ID ||
  candidate.source_month!==candidate.payload.month ||
  candidate.plan_revision_id!==candidate.payload.planRevisionId ||
  candidate.plan_revision_id!==PLAN ||
  !UUID.test(candidate.id)||!UUID.test(candidate.created_by)||
  (decision!==undefined&&(
   !UUID.test(decision.id)||
   decision.candidate_id!==candidate.id||
   decision.project_id!==candidate.project_id||
   decision.candidate_sha256!==candidate.candidate_sha256||
   decision.decided_by!==candidate.created_by||
   !['approve','reject'].includes(decision.decision))))
  fail('UNAVAILABLE')
 return {
  candidateId:candidate.id,month:candidate.source_month,
  candidateSha256:candidate.candidate_sha256,
  createdAt:candidate.created_at,
  card:review.card,
  decision:decision?{
   kind:decision.decision,decidedAt:decision.decided_at,
   candidateSha256:decision.candidate_sha256,
  }:null,
  canActivate:false as const,canPublish:false as const,
 }
}
export async function listFamilyMonthSourceReviews(db:Db,actor:SocialContentPrincipal,
 input:{month:string;candidateId?:string}){
 validateMonth(input.month)
 if(input.candidateId!==undefined&&!UUID.test(input.candidateId))fail('INVALID_INPUT')
 await ownerProof(db,actor)
 const candidates=await latestCandidates(db,input.month)
 const allDecisions=await decisions(db,candidates)
 const records=candidates.map(c=>shape(c,
  allDecisions.find(d=>d.candidate_id===c.id)))
 if(input.candidateId){
  const i=candidates.findIndex(c=>c.id===input.candidateId)
  if(i<0)fail('NOT_FOUND')
  // Exact underlying full copy/evidence visible ONLY to the proven owner.
  return {kind:'family-month-source-owner-review-v1',month:input.month,
   candidate:records[i],proposal:candidates[i].payload,
   latest:candidates[0]?.id===candidates[i].id,
   canActivate:false,canPublish:false}
 }
 return {kind:'family-month-source-owner-review-list-v1',month:input.month,
  records,canActivate:false,canPublish:false}
}
export async function proposeFamilyMonthSource(db:Db,actor:SocialContentPrincipal,
 proposal:FamilyMonthSourceProposal){
 await ownerProof(db,actor)
 let review
 try{review=prepareFamilyMonthSourceReview(proposal)}
 catch{fail('INVALID_INPUT')}
 await currentPlan(db,actor)
 await registeredPublicProofs(db,proposal)
 const row={
  project_id:FAMILY_WEEKLY_PROJECT_ID,source_month:proposal.month,
  plan_revision_id:PLAN,candidate_sha256:review.candidateSha256,
  payload:proposal,created_by:actor.userId,
 }
 const {data,error}=await client(db).from(TABLE).insert(row).select('*').single()
 if(error){
  // Retry the *exact same* proposal using the unique immutable hash.
  if(error.code==='23514')fail('CONFLICT')
  if(error.code!=='23505')fail('UNAVAILABLE')
  const {data:old,error:lookupError}=await client(db).from(TABLE).select('*')
   .eq('project_id',FAMILY_WEEKLY_PROJECT_ID)
   .eq('source_month',proposal.month)
   .eq('candidate_sha256',review.candidateSha256).maybeSingle()
  if(lookupError||!old)fail('CONFLICT')
  return {...shape(old as Row,undefined),stored:true,replayed:true,
   canActivate:false,canPublish:false}
 }
 if(!data)fail('UNAVAILABLE')
 return {...shape(data as Row,undefined),stored:true,replayed:false,
  canActivate:false,canPublish:false}
}
export async function decideFamilyMonthSource(db:Db,actor:SocialContentPrincipal,
 input:{month:string;candidateId:string;candidateSha256:string;decision:'approve'|'reject';confirmed:true}){
 validateMonth(input.month)
 if(!UUID.test(input.candidateId)||!SHA.test(input.candidateSha256)||
   !['approve','reject'].includes(input.decision)||input.confirmed!==true)
  fail('INVALID_INPUT')
 await ownerProof(db,actor)
 await currentPlan(db,actor)
 const candidates=await latestCandidates(db,input.month)
 const latest=candidates[0]
 if(!latest||latest.id!==input.candidateId)fail('CONFLICT')
 if(latest.candidate_sha256!==input.candidateSha256)fail('CONFLICT')
 const digest=prepareFamilyMonthSourceReview(latest.payload).candidateSha256
 try{
  verifyOwnerSourceDecisionShape({
   projectId:FAMILY_WEEKLY_PROJECT_ID,
   ownerId:latest.created_by,
   reviewerId:actor.userId,
   reviewedSha256:input.candidateSha256,
   candidateSha256:digest,decision:input.decision,
  })
 }catch{fail('CONFLICT')}
 if(latest.plan_revision_id!==PLAN)fail('CONFLICT')
 // Approving a source requires still-eligible image metadata. Rejecting a
 // broken source must remain possible, even when its image is now missing.
 if(input.decision==='approve')await registeredPublicProofs(db,latest.payload)
 // One atomic INSERT for one candidate, UNIQUE(candidate_id) is the
 // concurrency boundary. A losing simultaneous approve/reject is refused.
 const {data,error}=await client(db).from(DECISIONS).insert({
  candidate_id:latest.id,project_id:FAMILY_WEEKLY_PROJECT_ID,
  candidate_sha256:digest,decision:input.decision,
  decided_by:actor.userId,
 }).select('*').single()
 if(error?.code==='23505'||error?.code==='23514')fail('CONFLICT')
 if(error||!data)fail('UNAVAILABLE')
 return {candidateId:latest.id,candidateSha256:digest,
  decision:input.decision,decidedAt:(data as DecisionRow).decided_at,
  stored:true,activationAllowed:false as const,
  canPublish:false as const}
}


/**
 * Activate-for-draft-read candidate selection only: no mutation. A durable
 * owner decision is necessary but not sufficient (media/source verifier follows).
 * The most recent candidate alone is eligible; a new unapproved revision
 * blocks an earlier approved one rather than silently rolling back.
 */
export async function readLatestOwnerApprovedFamilyMonthSource(
 db:Db,actor:SocialContentPrincipal,month:string,
):Promise<{candidateId:string;candidateSha256:string;month:string;
  proposal:FamilyMonthSourceProposal;decisionId:string;decidedAt:string}>{
 validateMonth(month)
 await ownerProof(db,actor)
 await currentPlan(db,actor)
 const candidates=await latestCandidates(db,month)
 const latest=candidates[0]
 if(!latest)fail('REVIEW_REQUIRED')
 const verified=shape(latest,undefined)
 if(latest.plan_revision_id!==PLAN||latest.created_by!==actor.userId)
  fail('REVIEW_REQUIRED')
 const all=await decisions(db,[latest])
 if(all.length!==1)fail('REVIEW_REQUIRED')
 const decision=all[0]
 if(!decision||decision.decision!=='approve'||
  decision.candidate_id!==latest.id||
  decision.project_id!==FAMILY_WEEKLY_PROJECT_ID||
  decision.decided_by!==actor.userId||
  decision.candidate_sha256!==latest.candidate_sha256||
  !UUID.test(decision.id))
  fail('REVIEW_REQUIRED')
 // A malformed original source or a changed stored SHA must never activate.
 if(verified.candidateSha256!==latest.candidate_sha256)fail('CONFLICT')
 return {
  candidateId:latest.id,candidateSha256:latest.candidate_sha256,
  month:latest.source_month,proposal:latest.payload,
  decisionId:decision.id,decidedAt:decision.decided_at,
 }
}
