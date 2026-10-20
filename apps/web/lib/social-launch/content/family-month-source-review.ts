import {createHash} from 'node:crypto'
import {FAMILY_WEEKLY_PROJECT_ID} from './family-weekly-coverage'
import {listFamilyEditorialSources} from './family-editorial-packs'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA=/^[a-f0-9]{64}$/
const MONTH=/^20\d{2}-(0[1-9]|1[0-2])$/
const APPROVED_PLAN='e745041f-ad3a-493f-bd3b-025525d561b2'

export type FamilyMonthSourceEvidence={
 kind:'owner-project-public-evidence'
 referenceId:string
 sha256:string
 description:string
 privateSubscriberAsset:false
}

export type FamilyMonthSourceProposal={
 projectId:string
 month:string
 planRevisionId:string
 title:string
 publicSummary:string
 campaignPurpose:string
 proof:FamilyMonthSourceEvidence[]
 proposedCopy:{
   date:string
   variant:string
   title:string
   text:string
 }[]
}

export type FamilyMonthReviewReceipt={
 kind:'familje-stunden-month-source-review-v1'
 projectId:typeof FAMILY_WEEKLY_PROJECT_ID
 month:string
 candidateSha256:string
 card:{
  heading:string
  summary:string
  evidenceCount:number
  dates:string[]
  concerns:string[]
  decisionPrompt:string
 }
 status:'needs_owner_review'
 canActivate:false
 canPublish:false
 canSpend:false
}

/** Exact, versioned review card only. Unknown sources can be proposed for
 * scrutiny but CANNOT be activated by this module. The inputs are evidence
 * claims to review, NOT verified authorizations or executable instructions.
 */
export function prepareFamilyMonthSourceReview(value:FamilyMonthSourceProposal):FamilyMonthReviewReceipt{
 if(!value||typeof value!=='object'||Array.isArray(value)||
   Object.keys(value).sort().join('|')!==
   ['projectId','month','planRevisionId','title','publicSummary','campaignPurpose','proof','proposedCopy'].sort().join('|')||
   value.projectId!==FAMILY_WEEKLY_PROJECT_ID||
   !MONTH.test(value.month)||
   value.planRevisionId!==APPROVED_PLAN||
   typeof value.title!=='string'||value.title.length<3||value.title.length>100||
   typeof value.publicSummary!=='string'||value.publicSummary.length<15||value.publicSummary.length>600||
   typeof value.campaignPurpose!=='string'||value.campaignPurpose.length<5||value.campaignPurpose.length>250||
   !Array.isArray(value.proof)||value.proof.length<1||value.proof.length>8||
   !Array.isArray(value.proposedCopy)||value.proposedCopy.length<1||value.proposedCopy.length>12)
  throw Error('FAMILY_MONTH_SOURCE_INVALID')

 const allDates=new Set<string>()
 const references=new Set<string>()
 for(const p of value.proof){
  if(!p||typeof p!=='object'||Array.isArray(p)||
   Object.keys(p).sort().join('|')!==
    ['kind','referenceId','sha256','description','privateSubscriberAsset'].sort().join('|')||
   p.kind!=='owner-project-public-evidence'||p.privateSubscriberAsset!==false||
   typeof p.referenceId!=='string'||!/^[a-z0-9][a-z0-9_-]{3,95}$/.test(p.referenceId)||
   !SHA.test(p.sha256)||typeof p.description!=='string'||
   p.description.length<8||p.description.length>200||
   references.has(p.referenceId))
   throw Error('FAMILY_MONTH_EVIDENCE_NOT_VERIFIED')
  references.add(p.referenceId)
 }
 const monthStart=Date.parse(value.month+'-01T00:00:00.000Z')
 for(const draft of value.proposedCopy){
  if(!draft||typeof draft!=='object'||Array.isArray(draft)||
   Object.keys(draft).sort().join('|')!==
    ['date','variant','title','text'].sort().join('|')||
   typeof draft.date!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(draft.date)||
   !Number.isFinite(Date.parse(draft.date+'T00:00:00.000Z'))||
   new Date(Date.parse(draft.date+'T00:00:00.000Z')).toISOString().slice(0,10)!==draft.date||
   Date.parse(draft.date+'T00:00:00.000Z')>=monthStart||
   Date.parse(draft.date+'T00:00:00.000Z')<monthStart-45*86400000||
   typeof draft.variant!=='string'||!/^[a-z0-9_-]{2,40}$/.test(draft.variant)||
   typeof draft.title!=='string'||draft.title.length<3||draft.title.length>150||
   typeof draft.text!=='string'||draft.text.length<15||draft.text.length>5000||
   allDates.has(draft.date))
    throw Error('FAMILY_MONTH_COPY_NOT_VALIDATED')
  allDates.add(draft.date)
 }
 const normalized={
  projectId:value.projectId,month:value.month,planRevisionId:value.planRevisionId,
  title:value.title,publicSummary:value.publicSummary,campaignPurpose:value.campaignPurpose,
  proof:value.proof.map(p=>({kind:p.kind,referenceId:p.referenceId,
    sha256:p.sha256,description:p.description,privateSubscriberAsset:p.privateSubscriberAsset})),
  proposedCopy:value.proposedCopy.map(c=>({
    date:c.date,variant:c.variant,title:c.title,text:c.text,
  })),
 }
 const digest=createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
 const existing=listFamilyEditorialSources().find(p=>p.themeMonth===value.month)
 const concerns=[
  'De angivna offentliga k?llorna m?ste kontrolleras mot originalen innan godk?nnande.',
  'Bildr?ttigheter, befintlig kanalplan och upphovsr?tt kr?ver separat kontroll.',
  'Godk?nnande av k?llmaterial ger aldrig tillst?nd att ?ppna abonnentinneh?ll eller publicera.',
 ]
 if(existing)concerns.unshift('M?naden har redan ett k?llpaket: j?mf?r versionen, ers?tt inte automatiskt.')
 return {
  kind:'familje-stunden-month-source-review-v1',
  projectId:FAMILY_WEEKLY_PROJECT_ID,
  month:value.month,candidateSha256:digest,
  card:{
   heading:value.title,
   summary:value.publicSummary,
   evidenceCount:value.proof.length,
   dates:[...allDates].sort(),
   concerns,
   decisionPrompt:'Granska verifierade original, text och villkor. Ett separat ?garbeslut kr?vs f?r just denna kontrollsumma.',
  },
  status:'needs_owner_review',canActivate:false,canPublish:false,canSpend:false,
 }
}

/**
 * Readiness of registry months. Does not open or activate sources.
 * For a month without an exact reviewed pack, Atlas must request owner
 * evidence rather than fabricate source text or silently reuse another month.
 */
export function familyMonthSourceStatus(month:string){
 if(!MONTH.test(month))throw Error('FAMILY_MONTH_SOURCE_INVALID')
 const current=listFamilyEditorialSources().filter(source=>source.themeMonth===month)
 if(current.length>1)throw Error('FAMILY_MONTH_DUPLICATE_SOURCES')
 const source=current[0]
 return {
  projectId:FAMILY_WEEKLY_PROJECT_ID,month,
  sourceStatus:source?'pinned_public_preview':'owner_source_material_needed',
  sourceReference:source?.id??null,
  publicPreviewDates:source?.eligibleDates??[],
  canActivateNewSource:false,canPublish:false,reviewRequired:true,
 }
}

/** An owner approval *contract* is NOT a durable approval. A decision
 * token produced by a client or chat message is never sufficient for the
 * source registry. Activation requires an independently implemented,
 * persisted, authenticated exact-hash owner decision boundary.
 */
export function verifyOwnerSourceDecisionShape(input:{
 projectId:string;ownerId:string;reviewerId:string;
 reviewedSha256:string;candidateSha256:string;
 decision:'approve'|'reject'
}):{decision:'approve'|'reject';exactVersion:boolean;activationAllowed:false}{
 if(input.projectId!==FAMILY_WEEKLY_PROJECT_ID||
  !UUID.test(input.ownerId)||!UUID.test(input.reviewerId)||
  input.reviewerId!==input.ownerId||
  !SHA.test(input.reviewedSha256)||!SHA.test(input.candidateSha256)||
  !['approve','reject'].includes(input.decision)||
  input.reviewedSha256!==input.candidateSha256)
  throw Error('FAMILY_MONTH_OWNER_DECISION_REQUIRED')
 return {decision:input.decision,exactVersion:true,activationAllowed:false}
}
