import 'server-only'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import type { AccessResult } from './api'
import { buildExclusionIndex, lookupExclusions } from './exclusions'
import { documentedPilotHistoryEntries } from './documented-pilot-history'
import { normalizeCompanyName, normalizeOrgnr } from './identity'
import type { KnownContacts } from './known-contacts'
import { fetchScbLegalEntityByOrgnr, SCB_LIVE_HOST } from './scb-client'
import { CONTACTABILITY_BLOCKED, evaluateScbCompany, type ScbStatusResult } from './scb-status-policy'
import { runScbPreviewProbe, SCB_PROBE_MUNICIPALITY, SCB_PROBE_SNI, type ScbProbeSearchResult } from './scb-probe'

export const SCB_CANDIDATE_CONFIRMATION = 'LÄGG TILL SCB-KANDIDAT' as const
export const SCB_CANDIDATE_WRITE_FLAG = 'HB_LEADFINDER_SCB_CANDIDATE_WRITE_ENABLED' as const
const MAX_BODY_BYTES = 512
const LIVE_AUDIT = 'hb-scb-live-preview-v1' as const

export type LiveScbCandidateRow = {
  project_id: typeof HANDLARBORSEN_PROJECT_ID
  orgnr: string
  name: string
  city: string
  county_code: '12'
  sni_codes: ['47.811']
  score: null
  status: 'needs_review'|'excluded'|'suppressed'
  exclusions: Array<'historical_register_incomplete'|'scb_inactive'|'scb_marketing_restriction'|'previous_contact_partial_history'|'legal_form_requires_review'>
  scb_status_code: '1'|'9'
  legal_form_code: '49'|'31'|'96'
  reklam_code: '1'|'2'
  epost_code: '1'|'2'
  telefon_code: '1'|'2'|'3'
  prior_contact: boolean
  history_coverage: 'PARTIAL'
  contactability: typeof CONTACTABILITY_BLOCKED
  outreach_ready: false
  provenance: {
    source: 'scb_foretagsregistret'
    retrievedAt: string
    audit: typeof LIVE_AUDIT
    review: 'awaiting_human_review'
    workplaceCfar: string
  }
}

export interface LiveCandidateWriter {
  find(projectId:string,orgnr:string):Promise<{id:string|null;failed:boolean}>
  insert(row:LiveScbCandidateRow):Promise<{id:string|null;failed:boolean}>
}
export interface ScbCandidateDeps {
  env: Record<string,string|undefined>
  resolveAccess:()=>Promise<AccessResult>
  search?:()=>Promise<ScbProbeSearchResult>
  reviewLegalEntity?:(orgnr:string)=>Promise<ScbStatusResult>
  loadKnownContacts:()=>Promise<KnownContacts>
  getWriter:()=>LiveCandidateWriter
  today?:()=>string
}

const headers={'cache-control':'private, no-store'}
const respond=(status:number,value:unknown)=>Response.json(value,{status,headers})
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)

function parseBody(text:string):{cfar:string}|null{
  let raw:unknown
  try{raw=JSON.parse(text)}catch{return null}
  if(!object(raw)||Object.keys(raw).sort().join(',')!=='cfar,confirmation')return null
  if(raw.confirmation!==SCB_CANDIDATE_CONFIRMATION||typeof raw.cfar!=='string'||!/^\d{1,20}$/.test(raw.cfar))return null
  return {cfar:raw.cfar}
}
async function reviewLegalEntity(orgnrRaw:string,env:Record<string,string|undefined>):Promise<ScbStatusResult>{
  const orgnr=normalizeOrgnr(orgnrRaw)
  if(!orgnr)return {ok:false,reason:'bad_expected_orgnr',manualReviewOnly:true,outreachReady:false,contactability:CONTACTABILITY_BLOCKED}
  const je=await fetchScbLegalEntityByOrgnr({orgnr,baseUrl:`https://${SCB_LIVE_HOST}`,apiKey:env.SCB_API_KEY,liveApproved:true})
  return evaluateScbCompany({expectedOrgnr:orgnr,je})
}
function candidateFrom(input:{cfar:string;city:string;review:Extract<ScbStatusResult,{ok:true}>;historyMatches:string[];today:string}):LiveScbCandidateRow|null{
  const {review}=input
  if(!review.legalName||review.status.code!=='1'&&review.status.code!=='9')return null
  if(review.legalForm.code!=='49'&&review.legalForm.code!=='31'&&review.legalForm.code!=='96')return null
  const post=review.marketing.post.code,email=review.marketing.email.code,phone=review.marketing.phone.code
  if(post!==1&&post!==2||email!==1&&email!==2||phone!==1&&phone!==2&&phone!==3)return null
  const restricted=post===2||email===2||phone===2||phone===3
  const prior=input.historyMatches.length>0
  const exclusions:LiveScbCandidateRow['exclusions']=['historical_register_incomplete']
  if(review.status.code==='9')exclusions.push('scb_inactive')
  if(restricted)exclusions.push('scb_marketing_restriction')
  if(prior)exclusions.push('previous_contact_partial_history')
  if(review.legalForm.code!=='49')exclusions.push('legal_form_requires_review')
  return {
    project_id:HANDLARBORSEN_PROJECT_ID,orgnr:review.orgnr,name:review.legalName,city:input.city,
    county_code:'12',sni_codes:['47.811'],score:null,
    status:restricted?'suppressed':review.status.code==='9'||prior?'excluded':'needs_review',
    exclusions,scb_status_code:review.status.code,legal_form_code:review.legalForm.code,
    reklam_code:String(post) as '1'|'2',epost_code:String(email) as '1'|'2',telefon_code:String(phone) as '1'|'2'|'3',
    prior_contact:prior,history_coverage:'PARTIAL',contactability:CONTACTABILITY_BLOCKED,outreach_ready:false,
    provenance:{source:'scb_foretagsregistret',retrievedAt:input.today,audit:LIVE_AUDIT,review:'awaiting_human_review',workplaceCfar:input.cfar},
  }
}

export async function leadFinderScbCandidateApi(request:Request,deps:ScbCandidateDeps):Promise<Response>{
  if(request.method!=='POST')return respond(405,{status:'method_not_allowed'})
  if(deps.env.VERCEL_ENV==='production'||deps.env.HB_LEADFINDER_SCB_PREVIEW_ENABLED!=='true'||deps.env[SCB_CANDIDATE_WRITE_FLAG]!=='true')
    return respond(404,{status:'disabled'})
  let origin:string
  try{origin=new URL(request.url).origin}catch{return respond(403,{status:'denied'})}
  if(request.headers.get('origin')!==origin)return respond(403,{status:'denied'})
  if((request.headers.get('content-type')??'').split(';')[0].trim().toLowerCase()!=='application/json')return respond(415,{status:'unsupported_media_type'})
  const declared=request.headers.get('content-length')
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>MAX_BODY_BYTES))return respond(413,{status:'body_too_large'})
  const access=await deps.resolveAccess()
  if(!access.ok)return respond(access.status,{status:'denied'})
  if(!access.allowedProjectIds.includes(HANDLARBORSEN_PROJECT_ID))return respond(403,{status:'denied'})
  let text:string
  try{text=await request.text()}catch{return respond(400,{status:'body_invalid'})}
  if(text.length>MAX_BODY_BYTES)return respond(413,{status:'body_too_large'})
  const body=parseBody(text);if(!body)return respond(400,{status:'confirmation_invalid'})

  let search:ScbProbeSearchResult,known:KnownContacts
  try{
    search=await (deps.search??(()=>runScbPreviewProbe(deps.env)))()
    known=await deps.loadKnownContacts()
  }catch{return respond(503,{status:'unavailable'})}
  if(known.status!=='ready')return respond(503,{status:'history_unavailable'})
  const workplace=search.rows.find(row=>row.cfar===body.cfar&&row.municipalityCode===SCB_PROBE_MUNICIPALITY&&row.sniCodes.includes(SCB_PROBE_SNI))
  if(!workplace||typeof workplace.city!=='string'||workplace.city.trim().length<1||workplace.city.length>120)return respond(404,{status:'candidate_not_found'})

  let review:ScbStatusResult
  try{review=await (deps.reviewLegalEntity??((orgnr:string)=>reviewLegalEntity(orgnr,deps.env)))(workplace.orgnr)}
  catch{return respond(503,{status:'unavailable'})}
  if(!review.ok)return respond(422,{status:'legal_review_required'})

  const index=buildExclusionIndex([...known.entries,...documentedPilotHistoryEntries()])
  const historyMatches=lookupExclusions(index,{orgnr:review.orgnr,normalizedName:normalizeCompanyName(review.legalName??'')})
  const today=(deps.today??(()=>new Date().toISOString().slice(0,10)))()
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today))return respond(503,{status:'unavailable'})
  const row=candidateFrom({cfar:body.cfar,city:workplace.city.trim(),review,historyMatches,today})
  if(!row)return respond(422,{status:'legal_review_required'})

  try{
    const writer=deps.getWriter(),existing=await writer.find(HANDLARBORSEN_PROJECT_ID,row.orgnr)
    if(existing.failed)return respond(503,{status:'unavailable'})
    if(existing.id)return respond(200,{status:'exists',candidateId:existing.id,outreachReady:false})
    const inserted=await writer.insert(row)
    if(inserted.failed||!inserted.id)return respond(503,{status:'unavailable'})
    return respond(201,{status:'saved',candidateId:inserted.id,outreachReady:false})
  }catch{return respond(503,{status:'unavailable'})}
}
