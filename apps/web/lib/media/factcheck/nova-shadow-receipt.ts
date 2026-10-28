/**
 * The Prompt/Nova: pure shadow-receipt preparation, NOT authority to publish.
 * The agent row, claimed run, script and report MUST originate from trusted
 * project-scoped DB reads in a future worker. This module does not own or sign
 * a broker claim and cannot grant media spending or publisher rights.
 * Evidence is recomputed, never inferred from an LLM's recommendation.
 */
import {
  prepareFactCheckReport,
  type CurrentRunRow,
  type FactCheckReportRow,
} from './report-record'
import {
  planNovaEditorialReview,
  type NovaReviewInput,
} from './nova-autonomy-policy'
import {verifiedStoredWriterModel} from '../script-writer-provenance'

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i

export const NOVA_SHADOW_POLICY_VERSION='nova.shadow.v1' as const

export type NovaShadowReceipt=Readonly<{
  project_id:string
  agent_id:string
  run_id:string
  claim_id:string
  report_id:string
  script_id:string
  script_version:number
  revision_id:string
  content_sha256:string
  source_set_sha256:string
  reviewer_run_id:string
  policy_version:typeof NOVA_SHADOW_POLICY_VERSION
  decision:'editorial_candidate'
  reason:'ordinary_story_independently_supported'
}>

export interface StoredNovaReport extends FactCheckReportRow {
  readonly id:string
}
export interface NovaShadowInput {
  readonly mode:'offline_shadow_only'
  readonly featureEnabled:boolean
  readonly agent:Readonly<{id:string;project_id:string;name:string}>
  readonly claimedRun:CurrentRunRow
  readonly storedReport:StoredNovaReport
  readonly reviewContext:NovaReviewInput
}
export type PreparedNovaShadow =
  | Readonly<{ok:true;receipt:NovaShadowReceipt}>
  | Readonly<{ok:false;reason:string}>

// PostgreSQL JSONB normalizes object-key order. Compare structurally
// without weakening value identity or reordering source/claim ARRAYS.
function canonicalJson(value:unknown):unknown {
  if(Array.isArray(value))return value.map(canonicalJson)
  if(value && typeof value==='object'){
    const obj=value as Record<string,unknown>
    return Object.fromEntries(Object.keys(obj).sort()
      .map(key=>[key,canonicalJson(obj[key])]))
  }
  return value
}
const same=(a:unknown,b:unknown):boolean=>{
  try{return JSON.stringify(canonicalJson(a))===JSON.stringify(canonicalJson(b))}
  catch{return false}
}

/** Only independently corroborated ordinary stories can become candidates. */
export function prepareNovaShadowReceipt(
  input:NovaShadowInput,
):PreparedNovaShadow {
  const hold=(reason:string):PreparedNovaShadow=>({ok:false,reason})
  try{
    if(!input||input.mode!=='offline_shadow_only'||input.featureEnabled!==true){
      return hold('nova_shadow_not_enabled')
    }
    const {agent,claimedRun,storedReport,reviewContext:context}=input
    if(!agent||!claimedRun||!storedReport||!context||
       !UUID.test(agent.id)||!UUID.test(agent.project_id)||
       agent.name.trim().toLowerCase()!=='nova'||
       agent.project_id!==context.project?.id){
      return hold('registered_project_nova_required')
    }
    if(!UUID.test(claimedRun.id)||!UUID.test(claimedRun.claim_id??'')||
       claimedRun.project_id!==agent.project_id||
       claimedRun.status!=='running'||claimedRun.cancel_requested!==false||
       !claimedRun.lease_until||!Number.isFinite(Date.parse(claimedRun.lease_until))||
       Date.parse(claimedRun.lease_until)<=context.nowMs){
      return hold('nova_claim_not_current')
    }
    if(!UUID.test(storedReport.id)||
       storedReport.project_id!==agent.project_id||
       storedReport.run_id!==claimedRun.id||
       storedReport.claim_id!==claimedRun.claim_id||
       storedReport.script_id!==context.script?.id){
      return hold('report_run_project_mismatch')
    }
    const currentWriter=verifiedStoredWriterModel(
      context.script.raw_output,{
        version:context.script.version,hook:context.script.hook,
        script:context.script.script,
        captions:[...context.script.captions],
        hashtags:[...context.script.hashtags],
        cta:context.script.cta,tone:context.script.tone,
        estimated_duration:context.script.estimated_duration,
      })
    if(!currentWriter||!currentWriter.startsWith('claude-')){
      return hold('independent_writer_attribution_required')
    }
    const plan=planNovaEditorialReview(context)
    if(plan.action!=='automatic_editorial_candidate'||
       plan.reason!=='ordinary_story_independently_supported'||
       plan.question!==null){
      return hold('nova_factcheck_not_autonomously_eligible')
    }
    if(!context.review) return hold('no_independent_review')
    const proof=prepareFactCheckReport({
      trustedProjectId:context.project.id,
      currentScript:{
        id:context.script.id,
        project_id:context.script.project_id,
        version:context.script.version,
        hook:context.script.hook,script:context.script.script,
        captions:context.script.captions,
        cta:context.script.cta,
      },
      currentRun:claimedRun,
      material:context.material,
      writerModel:currentWriter,
      sources:context.sources,
      review:context.review,
      nowMs:context.nowMs,
    })
    if(!proof.ok)return hold('stored_evidence_did_not_validate:'+proof.reason)
    const verified=proof.record
    if(verified.outcome!=='ready_for_editor'||
       verified.risk_tier!=='standard'||
       storedReport.outcome!==verified.outcome||
       storedReport.risk_tier!==verified.risk_tier||
       storedReport.framing!==verified.framing||
       !same(storedReport.reasons,verified.reasons)||
       storedReport.run_id!==verified.run_id||
       storedReport.claim_id!==verified.claim_id||
       storedReport.project_id!==verified.project_id||
       storedReport.script_id!==verified.script_id||
       storedReport.script_version!==verified.script_version||
       storedReport.revision_id!==verified.revision_id||
       storedReport.content_sha256!==verified.content_sha256||
       storedReport.source_set_sha256!==verified.source_set_sha256||
       storedReport.reviewer_run_id!==context.review.assessment?.reviewerRunId||
       storedReport.writer_model!==verified.writer_model||
       storedReport.reviewer_model!==verified.reviewer_model||
       !same(storedReport.manuscript_snapshot,verified.manuscript_snapshot)||
       !same(storedReport.source_receipts,verified.source_receipts)||
       !same(storedReport.findings,verified.findings)){
      return hold('stored_factcheck_report_not_exact_match')
    }
    return {ok:true,receipt:Object.freeze({
      project_id:verified.project_id,
      agent_id:agent.id,
      run_id:claimedRun.id,claim_id:claimedRun.claim_id!,
      report_id:storedReport.id,script_id:verified.script_id,
      script_version:verified.script_version,
      revision_id:verified.revision_id,
      content_sha256:verified.content_sha256,
      source_set_sha256:verified.source_set_sha256,
      reviewer_run_id:storedReport.reviewer_run_id,
      policy_version:NOVA_SHADOW_POLICY_VERSION,
      decision:'editorial_candidate',
      reason:'ordinary_story_independently_supported',
    })}
  }catch{
    return hold('nova_shadow_input_invalid')
  }
}
