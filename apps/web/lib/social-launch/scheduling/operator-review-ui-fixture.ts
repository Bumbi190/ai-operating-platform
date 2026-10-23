import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {prepareScheduledMetaReviewHandoffFixture} from './review-handoff-fixture'
import {prepareOperatorHistoryFixture} from './operator-review-history-fixture'
import type {OperatorReviewHistory} from './operator-review-history-fixture'
import {ScheduleError} from './types'

// TEST ONLY: never mounted in a production Next route. Real application
// session/project/operator resolvers are invoked, but a separate signed
// operator JWT-to-PostgREST adapter remains a prerequisite for deployment.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const candidate=/^[0-9]{1,80}_[0-9]{1,80}$/
type Observation='possible_match_observed'|'no_match_observed'|'review_deferred'
export type OperatorReviewNote={
 projectId:string;jobId:string;publicationId:string;requestId:string
 observation:Observation;candidateId:string|null
}
export type OperatorReviewUiDependencies={
 expectedProjectId:string
 readQueue:(projectId:string,operatorId:string)=>Promise<unknown>
 readHistory:(scope:{projectId:string;jobId:string;publicationId:string},operatorId:string)=>Promise<unknown>
 appendNote:(input:OperatorReviewNote,operatorId:string)=>Promise<unknown>
}
function strict(v:unknown,fields:string[]):v is Record<string,unknown>{
 return v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 Object.keys(v).length===fields.length&&Object.keys(v).every(k=>fields.includes(k))
}
const denied=()=>Response.json({code:'OPERATOR_REVIEW_DENIED'},{status:403,headers:{'cache-control':'private, no-store'}})
const unavailable=()=>Response.json({code:'OPERATOR_REVIEW_UNAVAILABLE'},{status:503,headers:{'cache-control':'private, no-store'}})
export function createScheduledOperatorReviewUiFixture(deps:OperatorReviewUiDependencies){
 if(process.env.NODE_ENV!=='test'||!uuid.test(deps.expectedProjectId)||
  !deps.readQueue||!deps.readHistory||!deps.appendNote)throw new ScheduleError('DISABLED')
 async function activeOperator(projectId:string,expectedUserId?:string){
  const access=await resolveProjectAccess()
  if(!access.ok)return null
  if(!uuid.test(access.userId)||!access.allowedProjectIds.includes(projectId))return null
  const operator=await resolvePlatformOperator()
  if(!operator.ok||operator.userId!==access.userId||
   expectedUserId&&operator.userId!==expectedUserId)return null
  return access.userId
 }
 const handle=async(request:Request):Promise<Response>=>{
  if(request.method!=='POST'||
   request.url!=='https://review-fixture.invalid/v1/operator-observation'||
   request.headers.get('content-type')!=='application/json'||assertSameOrigin(request))
   return denied()
  let body:unknown
  try{const raw=await request.text();if(raw.length>2048)return denied();body=JSON.parse(raw)}
  catch{return denied()}
  if(!strict(body,['operation','projectId','jobId','publicationId'])&&
     !strict(body,['operation','projectId','jobId','publicationId',
      'requestId','observation','candidateId','confirmHumanObservation']))return denied()
  const op=body.operation,projectId=body.projectId,jobId=body.jobId,
   publicationId=body.publicationId
  if(!['read','record'].includes(String(op))||projectId!==deps.expectedProjectId||
    typeof jobId!=='string'||!uuid.test(jobId)||
    typeof publicationId!=='string'||!uuid.test(publicationId)||
    op==='read'&&Object.keys(body).length!==4||
    op==='record'&&Object.keys(body).length!==8)return denied()
  let note:OperatorReviewNote|null=null
  if(op==='record'){
   if(body.confirmHumanObservation!==true||
      typeof body.requestId!=='string'||!uuid.test(body.requestId)||
      !['possible_match_observed','no_match_observed','review_deferred'].includes(String(body.observation))||
      !(body.candidateId===null||typeof body.candidateId==='string'&&candidate.test(body.candidateId))||
      (body.observation==='possible_match_observed')!==(body.candidateId!==null))return denied()
   note={projectId:projectId as string,jobId,publicationId,
    requestId:body.requestId,observation:body.observation as Observation,
    candidateId:body.candidateId as string|null}
  }
  try{
   const subject=await activeOperator(projectId as string)
   if(!subject)return denied()
   const scope={projectId:projectId as string,jobId,publicationId}
   const queue=prepareScheduledMetaReviewHandoffFixture(
    await deps.readQueue(scope.projectId,subject),scope.projectId)
   const entry=queue.entries.find(x=>x.jobId===jobId&&x.publicationId===publicationId)
   if(!entry||entry.providerEvidence!=='unverified'||entry.postId===null||
     !['uncertain','published'].includes(entry.publicationState))return denied()
   let recordedEventId:number|null=null
   if(note){
    // Security invariant: the session is freshly resolved immediately
    // before the privileged RPC. SQL also checks an active operator mapping.
    if(!await activeOperator(scope.projectId,subject))return denied()
    const response=await deps.appendNote(note,subject)
    if(!strict(response,['eventId','observation','evidenceClass','providerOutcome',
      'providerAttested','automaticRetryAllowed','canFinalize','canPublish'])||
      typeof response.eventId!=='number'||!Number.isSafeInteger(response.eventId)||response.eventId<1||
      response.observation!==note.observation||
      response.evidenceClass!=='human_observation_only'||
      response.providerOutcome!=='unknown'||response.providerAttested!==false||
      response.automaticRetryAllowed!==false||response.canFinalize!==false||
      response.canPublish!==false)return unavailable()
    recordedEventId=response.eventId as number
   }
   const history:OperatorReviewHistory=prepareOperatorHistoryFixture(
    await deps.readHistory(scope,subject),scope)
   const last=note?history.entries.find(x=>
    x.eventId===recordedEventId&&x.operatorId===subject&&
    x.observation===note!.observation&&x.candidateId===note!.candidateId):null
   if(note&&!last)return unavailable()
   if(!await activeOperator(scope.projectId,subject))return denied()
   return Response.json({
    projectId:scope.projectId,jobId,publicationId,
    publicationState:entry.publicationState,
    providerOutcome:'unknown',operatorRequired:true,
    automaticRetryAllowed:false,canFinalize:false,canPublish:false,
    observationSaved:note!==null,
    history:history.entries,limitReached:history.limitReached,
    instruction:'Noteringar är mänskliga observationer, inte bekräftade Meta-kvitton. Publicera inte igen.',
   },{headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}})
  }catch{return unavailable()}
 }
 return Object.freeze({handle})
}
