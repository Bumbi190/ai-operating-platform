import 'server-only'
import {ScheduleError} from './types'
import {prepareScheduledMetaReviewHandoffFixture} from './review-handoff-fixture'
import {validCandidateFor} from '../publication/reconciliation/provider'
import type {AttemptSnapshot,ReconciliationCandidate} from '../publication/reconciliation/types'
import type {ManualCredential} from '../publication/provider'

// ISOLATED PROOF ONLY: this handler is not mounted in any production route.
// The operator identity, scoped SQL review queue, publication snapshot, and
// account credential MUST be supplied by independent trusted server adapters.
// It never writes DB state, issues a provider POST, or authenticates final proof.
type Operator={verified:true;isPlatformOperator:true;userId:string;allowedProjectIds:string[]}
type Credential=ManualCredential&{projectId:string;bindingId:string}
type Provider={list:(credential:ManualCredential,snapshot:AttemptSnapshot)=>Promise<ReconciliationCandidate[]>}
export type MetaEvidenceFixtureDependencies={
 expectedProjectId:string
 authenticateOperator:(request:Request)=>Promise<Operator|null>
 readScopedQueue:(projectId:string)=>Promise<unknown>
 readAttempt:(projectId:string,publicationId:string)=>Promise<AttemptSnapshot>
 resolveCredential:(projectId:string)=>Promise<Credential>
 provider:Provider
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const numeric=/^[0-9]{1,80}$/
const denied=()=>Response.json({code:'OPERATOR_REVIEW_DENIED'},{status:403,headers:{'cache-control':'no-store'}})
const unavailable=()=>Response.json({code:'OPERATOR_REVIEW_UNAVAILABLE'},{status:503,headers:{'cache-control':'no-store'}})
const inputKeys=['projectId','jobId','publicationId']
function exact(v:unknown,keys:string[]):v is Record<string,unknown>{
 return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k))
}
function safeCandidate(c:ReconciliationCandidate,s:AttemptSnapshot){
 if(!c||!numeric.test(c.photoId)||!new RegExp('^'+s.publication.accountId+'_[0-9]{1,80}$').test(c.providerId)||
   c.id!==c.providerId||c.accountId!==s.publication.accountId||!validCandidateFor(c,s))return false
 try{
  const permalink=new URL(c.permalink),photo=new URL(c.imageUrl)
  return permalink.protocol==='https:'&&permalink.hostname==='www.facebook.com'&&
   !permalink.port&&!permalink.username&&!permalink.password&&!permalink.hash&&
   photo.protocol==='https:'&&/^scontent[.a-z0-9-]*[.]fbcdn[.]net$/.test(photo.hostname)&&
   !photo.port&&!photo.username&&!photo.password&&!photo.hash
 }catch{return false}
}
export type MetaEvidenceFixtureResult={
 projectId:string;jobId:string;publicationId:string
 evidenceState:'candidate_needs_human_comparison'|'no_candidate_observed'
 internalPublicationState:'uncertain'|'published'
 providerOutcome:'unknown'
 source:'operator_requested_meta_get'
 candidates:readonly Pick<ReconciliationCandidate,'providerId'|'createdAt'|'permalink'|'photoId'|'imageUrl'|'text'>[]
 limitedToFirst50:true;truncated:boolean
 manualInstruction:string
 operatorConfirmationRequired:true
 automaticRetryAllowed:false
 canFinalize:false;canPublish:false
}

export function createScheduledMetaEvidenceInspectorFixture(deps:MetaEvidenceFixtureDependencies){
 if(process.env.NODE_ENV!=='test'||!uuid.test(deps.expectedProjectId)||
   !deps.authenticateOperator||!deps.readScopedQueue||!deps.readAttempt||
   !deps.resolveCredential||!deps.provider?.list)throw new ScheduleError('DISABLED')
 const handle=async(request:Request):Promise<Response>=>{
  if(request.method!=='POST'||request.url!=='https://review-fixture.invalid/v1/facebook-evidence'||
    request.headers.get('content-type')!=='application/json'||
    request.headers.get('origin')!=='https://review-fixture.invalid')return denied()
  let body:unknown
  try{const raw=await request.text();if(raw.length>2048)return denied();body=JSON.parse(raw)}catch{return denied()}
  if(!exact(body,inputKeys)||typeof body.projectId!=='string'||body.projectId!==deps.expectedProjectId||
    typeof body.jobId!=='string'||!uuid.test(body.jobId)||
    typeof body.publicationId!=='string'||!uuid.test(body.publicationId))return denied()
  const projectId=body.projectId,jobId=body.jobId,publicationId=body.publicationId
  try{
   const identity=await deps.authenticateOperator(request)
   if(!identity?.verified||!identity.isPlatformOperator||!uuid.test(identity.userId)||
     !Array.isArray(identity.allowedProjectIds)||
     !identity.allowedProjectIds.includes(projectId))return denied()
   const review=prepareScheduledMetaReviewHandoffFixture(
    await deps.readScopedQueue(projectId),projectId)
   const entry=review.entries.find(r=>r.jobId===jobId&&r.publicationId===publicationId)
   if(!entry||entry.providerEvidence!=='unverified'||entry.postId===null||
     !['published','uncertain'].includes(entry.publicationState))return denied()
   const snapshot=await deps.readAttempt(projectId,publicationId)
   const pub=snapshot?.publication,revision=snapshot?.revision
   if(!pub||!revision||pub.id!==publicationId||pub.projectId!==projectId||
     pub.jobId!==jobId||pub.postId!==entry.postId||pub.state!==entry.publicationState||
     pub.authoritySource!=='scheduled'||pub.channel!=='facebook'||
     !numeric.test(pub.accountId)||!uuid.test(pub.bindingId)||
     pub.revisionId!==revision.id||pub.sha256!==revision.sha256||
     revision.draft?.channel!=='facebook'||revision.draft?.format!=='image'||
     typeof revision.draft.text!=='string'||!revision.draft.text.length||
     revision.draft.text.length>63206||!Number.isFinite(Date.parse(pub.requestedAt)))return denied()
   const credential=await deps.resolveCredential(projectId)
   if(!credential||credential.projectId!==projectId||credential.channel!=='facebook'||
     credential.bindingId!==pub.bindingId||credential.accountId!==pub.accountId||
     !credential.token)return denied()
   // The Meta Page credential is held ONLY in the private adapter.
   // The existing implementation issues GET published_posts and validates
   // the page/post/media shape; this output is candidate data, never proof.
   const candidates=await deps.provider.list(credential,snapshot)
   if(!Array.isArray(candidates)||candidates.length>50||
     candidates.some(c=>!safeCandidate(c,snapshot)))return denied()
   // A revoked operator session during Meta I/O also invalidates the preview.
   const afterRead=await deps.authenticateOperator(request)
   if(!afterRead?.verified||!afterRead.isPlatformOperator||
     afterRead.userId!==identity.userId||
     !afterRead.allowedProjectIds?.includes(projectId))return denied()
   // A stop/revocation/identity change after Meta I/O must discard
   // the potentially stale candidate list, never write any provider proof.
   const fresh=prepareScheduledMetaReviewHandoffFixture(
    await deps.readScopedQueue(projectId),projectId)
   const match=fresh.entries.find(r=>r.jobId===jobId&&r.publicationId===publicationId)
   if(!match||match.providerEvidence!=='unverified'||
     match.publicationState!==entry.publicationState||
     match.postId!==entry.postId)return denied()
   const shortlisted=candidates.slice(0,10).map(c=>Object.freeze({
    providerId:c.providerId,createdAt:c.createdAt,permalink:c.permalink,
    photoId:c.photoId,imageUrl:c.imageUrl,text:c.text,
   }))
   const result:MetaEvidenceFixtureResult={
    projectId,jobId,publicationId,
    evidenceState:shortlisted.length?'candidate_needs_human_comparison':'no_candidate_observed',
    internalPublicationState:pub.state as 'uncertain'|'published',
    providerOutcome:'unknown',source:'operator_requested_meta_get',
    candidates:Object.freeze(shortlisted),limitedToFirst50:true,
    truncated:candidates.length>10,
    manualInstruction:shortlisted.length?
     'Möjliga Facebook-inlägg hittades. Operatören måste jämföra godkänd bild, text och konto. Ingen träff är ett automatiskt bevis.':
     'Inget matchande inlägg hittades bland de första 50. Det bevisar inte att publicering saknas. Kontrollera Facebook manuellt.',
    operatorConfirmationRequired:true,automaticRetryAllowed:false,
    canFinalize:false,canPublish:false,
   }
   return Response.json(result,{headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}})
  }catch{return unavailable()}
 }
 return Object.freeze({handle})
}
