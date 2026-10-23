import 'server-only'
import {ScheduleError} from './types'

// A human observation is NOT a validated provider receipt. This data
// comes from the project- and signed-operator-scoped SQL history RPC.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const post=/^[0-9]{1,80}_[0-9]{1,80}$/
type Observation='possible_match_observed'|'no_match_observed'|'review_deferred'
export type OperatorHistoryEvent=Readonly<{
 eventId:number;operatorId:string;recordedAt:string;recordedLabel:string
 observation:Observation;observationLabel:string;candidateId:string|null
 evidenceClass:'human_observation_only';providerAttested:false
}>
export type OperatorReviewHistory=Readonly<{
 projectId:string;jobId:string;publicationId:string
 providerOutcome:'unknown';automaticRetryAllowed:false
 mayFinalize:false;mayPublish:false;limitReached:boolean
 entries:readonly OperatorHistoryEvent[]
}>
function record(v:unknown):v is Record<string,unknown>{
 return !!v&&typeof v==='object'&&!Array.isArray(v)
}
function exact(v:unknown,fields:readonly string[]):v is Record<string,unknown>{
 return record(v)&&Object.keys(v).length===fields.length&&
  Object.keys(v).every(k=>fields.includes(k))
}
function deny():never{throw new ScheduleError('REVIEW_REQUIRED')}
const topFields=['projectId','jobId','publicationId','providerOutcome',
 'automaticRetryAllowed','canFinalize','canPublish','limitReached','items']
const eventFields=['eventId','operatorId','recordedAt','observation',
 'candidateId','evidenceClass','providerAttested']
const names:Record<Observation,string>={
 possible_match_observed:'Möjlig matchning noterad',
 no_match_observed:'Ingen matchning hittades',
 review_deferred:'Granskningen skjuts upp',
}
export function prepareOperatorHistoryFixture(input:unknown,
 expected:{projectId:string;jobId:string;publicationId:string}):OperatorReviewHistory{
 if(process.env.NODE_ENV!=='test'||!uuid.test(expected.projectId)||
  !uuid.test(expected.jobId)||!uuid.test(expected.publicationId)||
  !exact(input,topFields)||input.projectId!==expected.projectId||
  input.jobId!==expected.jobId||input.publicationId!==expected.publicationId||
  input.providerOutcome!=='unknown'||input.automaticRetryAllowed!==false||
  input.canFinalize!==false||input.canPublish!==false||
  !Array.isArray(input.items)||input.items.length>25||
  input.limitReached!==(input.items.length===25))deny()
 const seen=new Set<number>()
 const entries:OperatorHistoryEvent[]=[]
 for(const raw of input.items){
  if(!exact(raw,eventFields)||!Number.isSafeInteger(raw.eventId)||
   (raw.eventId as number)<1||seen.has(raw.eventId as number)||
   !uuid.test(String(raw.operatorId))||
   typeof raw.recordedAt!=='string'||raw.recordedAt.length>42||
   !/^\d{4}-\d\d-\d\dT/.test(raw.recordedAt)||
   !Number.isFinite(Date.parse(raw.recordedAt))||
   !(typeof raw.observation==='string'&&raw.observation in names)||
   !(raw.candidateId===null||typeof raw.candidateId==='string'&&post.test(raw.candidateId))||
   (raw.observation==='possible_match_observed')!==(raw.candidateId!==null)||
   raw.evidenceClass!=='human_observation_only'||raw.providerAttested!==false)deny()
  const observation=raw.observation as Observation
  seen.add(raw.eventId as number)
  entries.push(Object.freeze({
   eventId:raw.eventId as number,operatorId:raw.operatorId as string,
   recordedAt:raw.recordedAt as string,
   recordedLabel:new Intl.DateTimeFormat('sv-SE',{
    timeZone:'Europe/Stockholm',dateStyle:'short',timeStyle:'short',
   }).format(new Date(raw.recordedAt as string)),
   observation,observationLabel:names[observation],
   candidateId:raw.candidateId as string|null,
   evidenceClass:'human_observation_only' as const,providerAttested:false as const,
  }))
 }
 return Object.freeze({
  projectId:expected.projectId,jobId:expected.jobId,
  publicationId:expected.publicationId,providerOutcome:'unknown' as const,
  automaticRetryAllowed:false as const,mayFinalize:false as const,
  mayPublish:false as const,limitReached:entries.length===25,
  entries:Object.freeze(entries),
 })
}
