/**
 * The Prompt: prepare a human-session-bound editorial decision, provider-free.
 *
 * This module is an *input preflight*, not a publication permission or proof
 * that a person clicked. A future server route must invoke getUser() and read
 * project/report/script from the DB, then let the SQL guard enforce atomic
 * version/owner matching at the actual INSERT.
 */
import {randomUUID} from 'node:crypto'
import {contentDigest,type ScriptMaterial} from './contract'
import {
  evaluateFactCheckEditorialPreview,
  type EditorialProject,type CurrentEditorialScript,
  type RecordedFactCheck,type FactCheckOwnerDecision,
} from './editorial-admission'

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const SHA256=/^[a-f0-9]{64}$/
const ONLY_KEYS=[
  'reportId','expectedScriptId','expectedScriptVersion','expectedRevisionId',
  'expectedContentSha256','expectedSourceSetSha256',
  'decision','notes','sensitiveRiskAcknowledged',
] as const

export interface OwnerDecisionRequest {
  readonly reportId:string
  readonly expectedScriptId:string
  readonly expectedScriptVersion:number
  readonly expectedRevisionId:string
  readonly expectedContentSha256:string
  readonly expectedSourceSetSha256:string
  readonly decision:'approve'|'reject'
  readonly notes:string
  readonly sensitiveRiskAcknowledged:boolean
}
export interface OwnerDecisionInsert {
  readonly project_id:string
  readonly report_id:string
  readonly script_id:string
  readonly script_version:number
  readonly revision_id:string
  readonly content_sha256:string
  readonly source_set_sha256:string
  readonly decision:'approve'|'reject'
  readonly notes:string
  readonly sensitive_risk_acknowledged:boolean
  readonly decided_by:string
}
export type PreparedOwnerDecision =
  | Readonly<{ok:true; row:Readonly<OwnerDecisionInsert>}>
  | Readonly<{ok:false; reason:string}>

export function parseOwnerDecisionRequest(raw:unknown):OwnerDecisionRequest|null {
  if (!raw || typeof raw!=='object' || Array.isArray(raw)) return null
  const body=raw as Record<string,unknown>
  const keys=Object.keys(body)
  if (keys.length!==ONLY_KEYS.length ||
      keys.some(k=>!(ONLY_KEYS as readonly string[]).includes(k))) return null
  if (typeof body.reportId!=='string' || !UUID.test(body.reportId) ||
      typeof body.expectedScriptId!=='string' || !UUID.test(body.expectedScriptId) ||
      !Number.isSafeInteger(body.expectedScriptVersion) ||
      (body.expectedScriptVersion as number)<1 ||
      body.expectedRevisionId!=='v'+body.expectedScriptVersion ||
      typeof body.expectedContentSha256!=='string' ||
      !SHA256.test(body.expectedContentSha256) ||
      typeof body.expectedSourceSetSha256!=='string' ||
      !SHA256.test(body.expectedSourceSetSha256) ||
      !['approve','reject'].includes(body.decision as string) ||
      typeof body.notes!=='string' ||
      body.notes.trim().length<8 || body.notes.length>1200 ||
      typeof body.sensitiveRiskAcknowledged!=='boolean') return null
  const notes=body.notes.trim()
  if (body.decision==='approve' && notes.length<30) return null
  return Object.freeze({...body,notes}) as unknown as OwnerDecisionRequest
}

function materialFromSnapshot(value:unknown):ScriptMaterial|null {
  if (!value || typeof value!=='object' || Array.isArray(value)) return null
  const obj=value as Record<string,unknown>
  if (typeof obj.projectId!=='string' ||
      typeof obj.scriptId!=='string' ||
      typeof obj.revisionId!=='string' ||
      typeof obj.hook!=='string' ||
      typeof obj.script!=='string' ||
      !Array.isArray(obj.captions) ||
      !obj.captions.every(x=>typeof x==='string') ||
      typeof obj.socialCaption!=='string' ||
      !['standard','sensitive','unknown'].includes(obj.riskTier as string) ||
      (obj.cta!==undefined && typeof obj.cta!=='string') ||
      (obj.thumbnailText!==undefined && typeof obj.thumbnailText!=='string')) return null
  return obj as unknown as ScriptMaterial
}

export function prepareOwnerEditorialDecision(input:Readonly<{
  request:OwnerDecisionRequest
  project:EditorialProject
  script:CurrentEditorialScript
  report:RecordedFactCheck
  /** MUST be sourced from Supabase auth.getUser(), not from the POST body. */
  authenticatedUserId:string
  nowMs:number
}>):PreparedOwnerDecision {
  const deny=(reason:string):PreparedOwnerDecision=>({ok:false,reason})
  if (!input || !Number.isFinite(input.nowMs) ||
      !input.request || !input.project || !input.script || !input.report ||
      !UUID.test(input.authenticatedUserId) ||
      input.project.slug!=='ai-media-automation' ||
      !UUID.test(input.project.id) ||
      input.project.owner_id!==input.authenticatedUserId ||
      input.project.execution_paused!==false) {
    return deny('owner_or_project_not_authorized')
  }
  const {request,project,script,report}=input
  if (request.reportId!==report.id ||
      request.expectedScriptId!==report.script_id ||
      request.expectedScriptVersion!==report.script_version ||
      request.expectedRevisionId!==report.revision_id ||
      request.expectedContentSha256!==report.content_sha256 ||
      request.expectedSourceSetSha256!==report.source_set_sha256 ||
      script.id!==request.expectedScriptId ||
      script.version!==request.expectedScriptVersion ||
      script.project_id!==project.id ||
      report.project_id!==project.id) {
    return deny('stale_or_swapped_editorial_request')
  }

  const material=materialFromSnapshot(report.manuscript_snapshot)
  if (!material || contentDigest(material)!==report.content_sha256 ||
      material.projectId!==project.id || material.scriptId!==script.id ||
      material.revisionId!==request.expectedRevisionId ||
      script.hook!==material.hook || script.script!==material.script ||
      JSON.stringify(script.captions)!==JSON.stringify(material.captions) ||
      script.cta!==(material.cta??'')) return deny('manuscript_no_longer_matches')

  // A decision is an explicit authenticated action; this synthetic receipt
  // only checks preconditions. It is NOT written or returned as evidence.
  // Database-generated IDs/time and the SQL trigger remain authoritative.
  const candidate:FactCheckOwnerDecision={
    id:randomUUID(),project_id:project.id,report_id:report.id,
    script_id:script.id,script_version:script.version,
    revision_id:report.revision_id,
    content_sha256:report.content_sha256,
    source_set_sha256:request.expectedSourceSetSha256,
    decision:request.decision,notes:request.notes,
    sensitive_risk_acknowledged:request.sensitiveRiskAcknowledged,
    decided_by:input.authenticatedUserId,
    decided_at:new Date(input.nowMs).toISOString(),
  }

  if (request.decision==='approve') {
    const preview=evaluateFactCheckEditorialPreview({
      mode:'offline_preview_only',featureEnabled:true,project,
      sessionUserId:input.authenticatedUserId,script,material,report,
      ownerDecision:candidate,nowMs:input.nowMs,
    })
    if (preview.phase!=='ready_for_creative_review') {
      return deny('factcheck_not_ready_for_owner_approval:'+preview.blockers.join(','))
    }
  } else {
    // A rejected, unverified story may still receive a rejection record. That
    // must not grant any media or publishing permission.
    const reviewed=Date.parse(report.reviewed_at)
    const recorded=Date.parse(report.recorded_at)
    if (!Number.isFinite(reviewed) || !Number.isFinite(recorded) ||
        reviewed>recorded || recorded>input.nowMs ||
        input.nowMs-reviewed>=48*60*60*1000) {
      return deny('report_not_current_for_rejection')
    }
  }
  return {ok:true,row:Object.freeze({
    project_id:project.id,
    report_id:report.id,
    script_id:script.id,
    script_version:script.version,
    revision_id:report.revision_id,
    content_sha256:report.content_sha256,
    source_set_sha256:request.expectedSourceSetSha256,
    decision:request.decision,
    notes:request.notes,
    sensitive_risk_acknowledged:request.sensitiveRiskAcknowledged,
    decided_by:input.authenticatedUserId,
  })}
}
