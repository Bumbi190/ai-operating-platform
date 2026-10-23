import 'server-only'
import {ScheduleError} from './types'

// TEST-ONLY PRESENTATION HANDOFF. The input is the scoped PostgREST
// read-only review RPC result, NOT a claim, provider receipt or publish
// authorization. It contains no executable completion/publish action.
// The actual operator-only Facebook panel is separate and unchanged.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type QueueState='queued'|'claimed'|'waiting'|'published'|'failed'|'uncertain'|'blocked'|'cancelled'|'missed'|'missing'
type PublicationState='requested'|'creating'|'processing'|'publishing'|'published'|'failed'|'uncertain'|'missing'
type Mode='existing_manual_facebook_panel'|'separate_operator_meta_check'
export type ReviewHandoffItemFixture=Readonly<{
  jobId:string
  publicationId:string
  postId:string|null
  reservedAt:string
  reservedLabel:string
  databaseJobState:QueueState
  publicationState:PublicationState
  providerEvidence:'unverified'
  reviewMode:Mode
  operatorInstruction:string
  existingManualPanelEligible:boolean
  manualPanelScope:Readonly<{projectId:string;postId:string;publicationId:string}>|null
  needsOperatorReview:true
  automaticRetryAllowed:false
  canConfirmMetaReceipt:false
}>
export type ReviewHandoffFixture=Readonly<{
  projectId:string
  title:string
  description:string
  entries:readonly ReviewHandoffItemFixture[]
  limitReached:boolean
  automaticRetryAllowed:false
  mayFinalizeReceipt:false
  mayPublish:false
}>
function deny():never{throw new ScheduleError('REVIEW_REQUIRED')}
function record(v:unknown):v is Record<string,unknown>{
 return !!v&&typeof v==='object'&&!Array.isArray(v)
}
function exact(value:unknown,keys:readonly string[]):value is Record<string,unknown>{
 return record(value)&&Object.keys(value).length===keys.length&&
  Object.keys(value).every(k=>keys.includes(k))
}
const states=new Set<string>(['queued','claimed','waiting','published','failed','uncertain','blocked','cancelled','missed','missing'])
const publicationStates=new Set<string>(['requested','creating','processing','publishing','published','failed','uncertain','missing'])
const topFields=['projectId','automaticRetryAllowed','reviewAction','pageLimit','items']
const itemFields=['jobId','publicationId','postId','reservedAt','databaseJobState','publicationState','providerOutcome','reviewStatus','automaticRetryAllowed']

export function prepareScheduledMetaReviewHandoffFixture(input:unknown,expectedProjectId:string):ReviewHandoffFixture{
 if(process.env.NODE_ENV!=='test'||!uuid.test(expectedProjectId)||
   !exact(input,topFields)||input.projectId!==expectedProjectId||
   input.automaticRetryAllowed!==false||
   input.reviewAction!=='operator_review_provider_evidence'||
   input.pageLimit!==25||!Array.isArray(input.items)||input.items.length>25)deny()

 const seenJobs=new Set<string>(),seenPublications=new Set<string>()
 const entries:ReviewHandoffItemFixture[]=[]
 for(const raw of input.items){
  if(!exact(raw,itemFields)||!uuid.test(String(raw.jobId))||
    !uuid.test(String(raw.publicationId))||
    !(raw.postId===null||typeof raw.postId==='string'&&uuid.test(raw.postId))||
    typeof raw.reservedAt!=='string'||raw.reservedAt.length>40||
    !/^\d{4}-\d{2}-\d{2}T/.test(raw.reservedAt)||
    !Number.isFinite(Date.parse(raw.reservedAt))||
    !states.has(String(raw.databaseJobState))||
    !publicationStates.has(String(raw.publicationState))||
    raw.providerOutcome!=='unknown'||
    raw.reviewStatus!=='needs_authenticated_meta_evidence'||
    raw.automaticRetryAllowed!==false||seenJobs.has(String(raw.jobId))||
    seenPublications.has(String(raw.publicationId)))deny()
  const jobId=String(raw.jobId),publicationId=String(raw.publicationId),
   postId=raw.postId as string|null,
   databaseJobState=raw.databaseJobState as QueueState,
   publicationState=raw.publicationState as PublicationState
  seenJobs.add(jobId);seenPublications.add(publicationId)
  const existingManualPanelEligible=publicationState==='uncertain'&&postId!==null
  const mode:Mode=existingManualPanelEligible?
   'existing_manual_facebook_panel':'separate_operator_meta_check'
  const instruction=existingManualPanelEligible?
   'Behörig operatör kan öppna den befintliga Facebook-granskningen, läsa kandidater och jämföra godkänd bild och text. Endast operatören får bekräfta efter separat kontroll.':
   publicationState==='published'?
   'Databasen visar publicerat men Meta-resultatet är inte verifierat. Kontrollera Facebook separat. Den befintliga manuella kopplingen gäller inte detta tillstånd.':
   'Detta försök behöver separat kontroll av Facebook och en operatör. Den befintliga kopplingspanelen är inte tillgänglig för detta tillstånd.'
  const manualPanelScope=existingManualPanelEligible?
   Object.freeze({projectId:expectedProjectId,postId:postId!,publicationId}):null
  const entry:ReviewHandoffItemFixture=Object.freeze({
   jobId,publicationId,postId,reservedAt:raw.reservedAt,
   reservedLabel:new Intl.DateTimeFormat('sv-SE',{
    timeZone:'Europe/Stockholm',dateStyle:'short',timeStyle:'short',
   }).format(new Date(raw.reservedAt)),
   databaseJobState,publicationState,providerEvidence:'unverified',
   reviewMode:mode,operatorInstruction:instruction,
   existingManualPanelEligible,manualPanelScope,needsOperatorReview:true,
   automaticRetryAllowed:false,canConfirmMetaReceipt:false,
  })
  entries.push(entry)
 }
 return Object.freeze({
  projectId:expectedProjectId,
  title:'Facebook-publiceringar som behöver granskas',
  description:'Meta har inte verifierat resultatet. Ingen automatisk ompublicering eller kvittobekräftelse får göras.',
  entries:Object.freeze(entries),limitReached:entries.length===25,
  automaticRetryAllowed:false,mayFinalizeReceipt:false,mayPublish:false,
 })
}
