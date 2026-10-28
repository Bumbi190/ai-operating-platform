/**
 * The Prompt: TWO distinct editorial gates, default-off. Pure preview policy.
 *
 * 1. An owner-matched FactCheck decision before paid creative work.
 *    Human-origin identity still requires a verified session-bound writer.
 * 2. A DIFFERENT existing social_content_decisions approval bound to the
 *    final video/post revision, before dispatch/publication.
 *
 * This module has NO route/worker caller and NO capability to generate media,
 * spend, approve a session, schedule, or publish. Inputs MUST eventually be
 * hydrated by a trusted server from authenticated DB reads and reviewed RPCs.
 */
import {contentDigest,needsEnhancedEditorialRiskReview,type ScriptMaterial} from './contract'
import {recognizeSource} from './source-collector'
import {
  verifiedStoredWriterModel,
  type ScriptOutputForProvenance,
} from '../script-writer-provenance'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH=/^[a-f0-9]{64}$/
const MAX_REPORT_AGE_MS=48*60*60*1000
const MAX_DECISION_AGE_MS=48*60*60*1000
const PROJECT_SLUG='ai-media-automation'

export interface EditorialProject {
  readonly id:string
  readonly slug:string
  readonly owner_id:string
  readonly execution_paused:boolean
}
export interface CurrentEditorialScript extends ScriptOutputForProvenance {
  readonly id:string
  readonly project_id:string
  readonly version:number
  readonly raw_output:unknown
}
export interface RecordedFactCheck {
  readonly id:string
  readonly project_id:string
  readonly script_id:string
  readonly script_version:number
  readonly revision_id:string
  readonly content_sha256:string
  readonly source_set_sha256:string|null
  readonly reviewer_model:string
  readonly writer_model:string
  readonly risk_tier:ScriptMaterial['riskTier']
  readonly outcome:'ready_for_editor'|'requires_review'|'rejected'
  readonly framing:'faithful_to_evidence'|'misleading'|'unverified'
  readonly reasons:readonly string[]
  readonly reviewed_at:string
  readonly recorded_at:string
  readonly manuscript_snapshot:unknown
  readonly source_receipts:unknown
  readonly findings:unknown
}
export interface FactCheckOwnerDecision {
  readonly id:string
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
  readonly decided_at:string
}
export interface FinalSocialRevision {
  readonly id:string
  readonly project_id:string
  readonly post_id:string
  readonly sha256:string
  readonly draft:Readonly<{
    title:string
    text:string
    channel:'facebook'|'instagram'|'youtube'
    format:'video'
    mediaIds:readonly string[]
  }>
}
export interface FinalSocialDecision {
  readonly id:string
  readonly project_id:string
  readonly post_id:string
  readonly revision_id:string
  readonly sha256:string
  readonly decision:'approve'|'reject'
  readonly decided_by:string
  readonly decided_at:string
}
export interface FinalMediaEvidence {
  readonly project_id:string
  readonly post_id:string
  readonly revision_id:string
  readonly revision_sha256:string
  readonly script_id:string
  readonly channel:string
  readonly video_asset_id:string
  readonly snapshot_sha256:string
  /** Must be returned by a verified media_news_review_requirements DB read. */
  readonly reasons:readonly string[]
}
export interface FinalEditorialCheck {
  readonly post:Readonly<{id:string;project_id:string;current_revision_id:string}>
  readonly revision:FinalSocialRevision
  readonly decision:FinalSocialDecision
  readonly evidence:FinalMediaEvidence
}

export interface FactCheckEditorialPreviewInput {
  readonly mode:'offline_preview_only'
  readonly featureEnabled:boolean
  readonly project:EditorialProject
  /** From verified auth session; MUST NOT be from request JSON. */
  readonly sessionUserId:string
  readonly script:CurrentEditorialScript
  readonly material:ScriptMaterial
  readonly report:RecordedFactCheck|null
  readonly ownerDecision:FactCheckOwnerDecision|null
  readonly finalSocial?:FinalEditorialCheck|null
  readonly nowMs:number
}
export type FactCheckEditorialPreview = Readonly<{
  phase:'hold'|'ready_for_creative_review'|'ready_for_final_social_review'
  blockers:readonly string[]
  /** There is no live publisher or paid creative authority in this module. */
  canSpend:false
  canRender:false
  canPublish:false
}>

function fail(reason:string):FactCheckEditorialPreview {
  return {phase:'hold',blockers:[reason],
    canSpend:false,canRender:false,canPublish:false}
}
function succeed(
  phase:'ready_for_creative_review'|'ready_for_final_social_review',
):FactCheckEditorialPreview {
  return {phase,blockers:[],canSpend:false,canRender:false,canPublish:false}
}
function validTime(value:unknown,nowMs:number,maxAgeMs:number):number|null {
  if (typeof value!=='string') return null
  const n=Date.parse(value)
  return Number.isFinite(n) && n<=nowMs && n>nowMs-maxAgeMs ? n:null
}
function recordMaterial(v:unknown):ScriptMaterial|null {
  if (!v || typeof v!=='object' || Array.isArray(v)) return null
  const m=v as Record<string,unknown>
  if (!['projectId','scriptId','revisionId','hook','script','socialCaption',
    'riskTier'].every(k=>typeof m[k]==='string') ||
      !Array.isArray(m.captions) ||
      !m.captions.every(s=>typeof s==='string') ||
      (m.cta!==undefined && typeof m.cta!=='string') ||
      (m.thumbnailText!==undefined && typeof m.thumbnailText!=='string')) return null
  return m as unknown as ScriptMaterial
}
function safeReasonList(v:unknown):v is readonly string[] {
  return Array.isArray(v) && v.length<=12 && v.every(x=>typeof x==='string')
}
/**
 * Evidence receipts must map each "supported" claim to at least two real,
 * independently attributed publishers. This is structural evidence only:
 * it does NOT prove that a quote entails the claimed fact semantically.
 */
function checkedEvidence(
  sourceReceipts:unknown,findings:unknown,
):boolean {
  if (!Array.isArray(sourceReceipts) || sourceReceipts.length<2 ||
      sourceReceipts.length>4 || !Array.isArray(findings) ||
      findings.length<2 || findings.length>60) return false
  const sources=new Map<string,{group:string;hash:string}>()
  const hashes=new Set<string>()
  for(const value of sourceReceipts){
    if (!value || typeof value!=='object' || Array.isArray(value)) return false
    const r=value as Record<string,unknown>
    const known=recognizeSource(r.url)
    if (!known || known.url!==r.url || known.group!==r.publisherGroup ||
        typeof r.sourceId!=='string' || !r.sourceId ||
        typeof r.textSha256!=='string' || !HASH.test(r.textSha256) ||
        sources.has(r.sourceId) || hashes.has(r.textSha256)) return false
    sources.set(r.sourceId,{group:known.group,hash:r.textSha256})
    hashes.add(r.textSha256)
  }
  if (new Set([...sources.values()].map(s=>s.group)).size<2) return false
  for(const value of findings){
    if (!value || typeof value!=='object' || Array.isArray(value)) return false
    const finding=value as Record<string,unknown>
    if (finding.verdict!=='supported' || !Array.isArray(finding.evidence) ||
        finding.evidence.length<2 || finding.evidence.length>8) return false
    const groups=new Set<string>()
    for(const raw of finding.evidence){
      if(!raw || typeof raw!=='object' || Array.isArray(raw)) return false
      const evidence=raw as Record<string,unknown>
      const source=typeof evidence.sourceId==='string'
        ? sources.get(evidence.sourceId):undefined
      if(!source || typeof evidence.exactQuote!=='string' ||
          evidence.exactQuote.trim().length<12 ||
          evidence.exactQuote.length>500) return false
      groups.add(source.group)
    }
    if(groups.size<2) return false
  }
  return true
}

/**
 * Treat this as an explanation of prerequisites, never an authorization.
 * A runtime adapter must independently enforce project/session ownership,
 * live stop authority, hard spend, RLS, DB current revision, transport and
 * the mandatory final social decision before any external side effect.
 */
export function evaluateFactCheckEditorialPreview(
  input:FactCheckEditorialPreviewInput,
):FactCheckEditorialPreview {
  try {
    if (!input || input.mode!=='offline_preview_only' ||
        input.featureEnabled!==true) return fail('factcheck_editorial_not_enabled')
    const {project,script,material,report,ownerDecision,nowMs}=input
    if (!project || project.slug!==PROJECT_SLUG ||
        !UUID.test(project.id) || !UUID.test(project.owner_id) ||
        project.execution_paused!==false ||
        !UUID.test(input.sessionUserId) ||
        input.sessionUserId!==project.owner_id) return fail('owner_or_project_not_authorized')
    if (!Number.isFinite(nowMs) || !script || !material ||
        script.project_id!==project.id || script.id!==material.scriptId ||
        material.projectId!==project.id || !UUID.test(script.id) ||
        !Number.isSafeInteger(script.version) || script.version<1 ||
        material.revisionId!=='v'+script.version ||
        script.hook!==material.hook || script.script!==material.script ||
        JSON.stringify(script.captions)!==JSON.stringify(material.captions) ||
        script.cta!==(material.cta??'')) return fail('current_script_revision_changed')
    const writerModel=verifiedStoredWriterModel(script.raw_output,script)
    if (!writerModel || !writerModel.startsWith('claude-')) {
      return fail('independent_writer_provenance_missing')
    }
    if (!report || !UUID.test(report.id) ||
        report.project_id!==project.id || report.script_id!==script.id ||
        report.script_version!==script.version ||
        report.revision_id!==material.revisionId ||
        report.risk_tier!==material.riskTier ||
        report.content_sha256!==contentDigest(material) ||
        !HASH.test(report.content_sha256) ||
        !report.source_set_sha256 || !HASH.test(report.source_set_sha256) ||
        report.writer_model!==writerModel ||
        report.reviewer_model!=='gpt-5.4-mini' ||
        report.reviewer_model===writerModel) {
      return fail('factcheck_report_not_bound_to_current_script')
    }
    const snapshot=recordMaterial(report.manuscript_snapshot)
    if (!snapshot || contentDigest(snapshot)!==report.content_sha256) {
      return fail('factcheck_manuscript_snapshot_invalid')
    }
    const reviewed=validTime(report.reviewed_at,nowMs,MAX_REPORT_AGE_MS)
    const recorded=validTime(report.recorded_at,nowMs,MAX_REPORT_AGE_MS)
    if (reviewed===null || recorded===null || recorded<reviewed) {
      return fail('factcheck_report_expired_or_unrecorded')
    }
    if (!safeReasonList(report.reasons) ||
        !checkedEvidence(report.source_receipts,report.findings)) {
      return fail('factcheck_evidence_incomplete')
    }
    // A HOLD may ONLY be manually cleared for the explicit sensitive-risk
    // floor, never for missing sources, contradictions or unknown evidence.
    const requiresEnhancedReview=needsEnhancedEditorialRiskReview(material)
    const standard=
      !requiresEnhancedReview && report.outcome==='ready_for_editor' &&
      report.framing==='faithful_to_evidence' &&
      report.risk_tier==='standard' &&
      report.reasons.length===0
    const sensitiveOnly=
      requiresEnhancedReview && report.outcome==='requires_review' &&
      report.framing==='faithful_to_evidence' &&
      report.reasons.length===1 &&
      report.reasons[0]==='sensitive_or_unclassified' &&
      Array.isArray(report.findings) &&
      report.findings.every(f=>f && typeof f==='object' &&
        !Array.isArray(f) && (f as {verdict?:unknown}).verdict==='supported')
    if (!standard && !sensitiveOnly) {
      return fail('factcheck_not_eligible_for_human_approval')
    }
    if (!ownerDecision || !UUID.test(ownerDecision.id) ||
        ownerDecision.project_id!==project.id ||
        ownerDecision.report_id!==report.id ||
        ownerDecision.script_id!==script.id ||
        ownerDecision.script_version!==script.version ||
        ownerDecision.revision_id!==material.revisionId ||
        ownerDecision.content_sha256!==report.content_sha256 ||
        ownerDecision.source_set_sha256!==report.source_set_sha256 ||
        ownerDecision.decision!=='approve' ||
        ownerDecision.decided_by!==project.owner_id ||
        typeof ownerDecision.notes!=='string' ||
        ownerDecision.notes.trim().length<30 ||
        (sensitiveOnly && (
          !ownerDecision.sensitive_risk_acknowledged ||
          ownerDecision.notes.trim().length<50
        ))) {
      return fail('human_editorial_decision_required')
    }
    const decided=validTime(ownerDecision.decided_at,nowMs,MAX_DECISION_AGE_MS)
    if (decided===null || decided<recorded) {
      return fail('human_editorial_decision_stale')
    }
    const final=input.finalSocial
    if (!final) return succeed('ready_for_creative_review')
    const {post,revision,decision,evidence}=final
    if (!post || !revision || !decision || !evidence ||
        post.project_id!==project.id || !UUID.test(post.id) ||
        post.current_revision_id!==revision.id ||
        revision.post_id!==post.id || revision.project_id!==project.id ||
        !UUID.test(revision.id) || !HASH.test(revision.sha256) ||
        !revision.draft || revision.draft.format!=='video' ||
        revision.draft.title!==material.hook ||
        revision.draft.text!==material.socialCaption ||
        !['instagram','facebook','youtube'].includes(revision.draft.channel) ||
        !Array.isArray(revision.draft.mediaIds) ||
        revision.draft.mediaIds.length!==1 ||
        !UUID.test(revision.draft.mediaIds[0])) {
      return fail('current_social_revision_changed')
    }
    if (!UUID.test(decision.id) || decision.project_id!==project.id ||
        decision.post_id!==post.id || decision.revision_id!==revision.id ||
        decision.sha256!==revision.sha256 ||
        decision.decision!=='approve' ||
        decision.decided_by!==project.owner_id) {
      return fail('final_human_social_approval_required')
    }
    const socialTime=validTime(decision.decided_at,nowMs,MAX_DECISION_AGE_MS)
    if (socialTime===null || socialTime<decided) {
      return fail('final_social_decision_stale')
    }
    if (evidence.project_id!==project.id || evidence.post_id!==post.id ||
        evidence.revision_id!==revision.id ||
        evidence.revision_sha256!==revision.sha256 ||
        evidence.script_id!==script.id ||
        evidence.channel!==revision.draft.channel ||
        evidence.video_asset_id!==revision.draft.mediaIds[0] ||
        !HASH.test(evidence.snapshot_sha256) ||
        !Array.isArray(evidence.reasons) || evidence.reasons.length!==0) {
      return fail('final_video_review_evidence_invalid')
    }
    return succeed('ready_for_final_social_review')
  } catch {
    return fail('editorial_admission_invalid_input')
  }
}
