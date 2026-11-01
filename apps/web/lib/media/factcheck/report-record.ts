/**
 * The Prompt FactCheck — verified evidence-record candidate.
 *
 * PURE, READ-ONLY and provider-free. This prepares an append-only report
 * candidate but never persists, approves, generates media or publishes.
 * Callers MUST populate currentScript/currentRun from fresh trusted DB reads.
 * Treat this as a preflight, not as a signature or a production admission.
 */
import {createHash} from 'node:crypto'
import {
  assessFactCheck, contentDigest,
  type FactCheckDecision, type ReviewerAssessment,
  type ScriptMaterial, type SourceSnapshot,
} from './contract'
import {
  FACTCHECK_REVIEW_MODEL, sourceSetDigest,
  type ReviewedFinding,
} from './independent-review'
import {recognizeSource} from './source-collector'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH = /^[a-f0-9]{64}$/
const MAX_AGE = 24 * 60 * 60 * 1000

export interface CurrentScriptRow {
  readonly id: string
  readonly project_id: string
  readonly version: number | null
  readonly hook: string | null
  readonly script: string | null
  readonly captions: unknown
  readonly cta: string | null
}
export interface CurrentRunRow {
  readonly id: string
  readonly project_id: string
  readonly claim_id: string | null
  readonly status: string
  readonly cancel_requested: boolean
  readonly lease_until: string | null
}

export type StoredSourceReceipt = Readonly<{
  sourceId: string
  url: string
  publisherGroup: string
  kind: string
  retrievedAt: string
  textSha256: string
  characterCount: number
}>

export interface FactCheckReportRow {
  readonly project_id: string
  readonly script_id: string
  readonly run_id: string
  readonly claim_id: string
  readonly reviewer_run_id: string
  readonly script_version: number
  readonly revision_id: string
  readonly content_sha256: string
  readonly source_set_sha256: string
  readonly writer_model: string
  readonly reviewer_model: typeof FACTCHECK_REVIEW_MODEL
  readonly risk_tier: ScriptMaterial['riskTier']
  readonly outcome: FactCheckDecision['outcome']
  readonly framing: ReviewerAssessment['framing']
  readonly framing_reason: string
  readonly reasons: string[]
  readonly manuscript_snapshot: {
    readonly projectId: string
    readonly scriptId: string
    readonly revisionId: string
    readonly hook: string
    readonly script: string
    readonly captions: string[]
    readonly cta: string
    readonly socialCaption: string
    readonly thumbnailText: string
    readonly riskTier: string
  }
  readonly source_receipts: StoredSourceReceipt[]
  readonly findings: {
    readonly unitId: string
    readonly exactText: string
    readonly verdict: string
    readonly explanation: string
    readonly evidence: {sourceId:string;exactQuote:string}[]
  }[]
  readonly reviewed_at: string
}
export type RecordPreparation =
  | Readonly<{ok:true; record:Readonly<FactCheckReportRow>}>
  | Readonly<{ok:false; reason:string}>

export interface PrepareReportInput {
  readonly trustedProjectId: string
  readonly currentScript: CurrentScriptRow
  readonly currentRun: CurrentRunRow
  readonly material: ScriptMaterial
  readonly writerModel: string
  readonly sources: readonly SourceSnapshot[]
  readonly review: ReviewedFinding
  readonly nowMs: number
}

function validDate(input: string | null, nowMs: number): boolean {
  if (typeof input !== 'string') return false
  const parsed=Date.parse(input)
  return Number.isFinite(parsed) && parsed > nowMs
}
function jsonEquivalence(a: unknown, b: unknown): boolean {
  try {return JSON.stringify(a)===JSON.stringify(b)}
  catch {return false}
}
function sameDecision(a: FactCheckDecision, b: FactCheckDecision): boolean {
  return a.outcome===b.outcome &&
    a.contentSha256===b.contentSha256 &&
    a.unitCount===b.unitCount &&
    a.reviewedSourceCount===b.reviewedSourceCount &&
    jsonEquivalence(a.reasons,b.reasons)
}
function validModelIdentity(model: string): boolean {
  return typeof model==='string' && model.length>=7 && model.length<=100 &&
    /^(?:claude-|anthropic[:/])/i.test(model)
}

/**
 * Rebuilds the evidence receipt from trusted *original* source bytes and fresh
 * DB state. Never stores third-party articles wholesale.
 */
export function prepareFactCheckReport(input: PrepareReportInput): RecordPreparation {
  const hold=(reason: string):RecordPreparation=>({ok:false,reason})
  try {
    if (!input || !Number.isFinite(input.nowMs)) return hold('clock_invalid')
    const {trustedProjectId,currentScript,currentRun,material,writerModel,sources,review,nowMs}=input
    if (!UUID.test(trustedProjectId) || !material ||
        !currentScript || !currentRun ||
        !UUID.test(material.scriptId) ||
        !UUID.test(material.projectId) ||
        !UUID.test(currentRun.id) || !UUID.test(currentRun.claim_id??'') ||
        !UUID.test(currentScript.id) ||
        !UUID.test(review?.assessment?.reviewerRunId??'')) {
      return hold('identity_missing_or_invalid')
    }
    if (material.projectId !== trustedProjectId ||
        currentScript.project_id !== trustedProjectId ||
        currentScript.id !== material.scriptId ||
        currentRun.project_id !== trustedProjectId ||
        currentRun.status !== 'running' ||
        currentRun.cancel_requested !== false ||
        !validDate(currentRun.lease_until, nowMs)) {
      return hold('run_or_project_not_owned')
    }
    if (!Number.isInteger(currentScript.version) || Number(currentScript.version)<1 ||
        // A semantically identical new version is STILL a different revision.
        // Only a fresh database-derived vN identity may be reported.
        material.revisionId !== 'v'+currentScript.version ||
        currentScript.hook !== material.hook ||
        currentScript.script !== material.script ||
        !Array.isArray(currentScript.captions) ||
        !jsonEquivalence(currentScript.captions,material.captions) ||
        (currentScript.cta??'') !== (material.cta??'')) {
      return hold('current_script_content_changed')
    }
    if (!validModelIdentity(writerModel) ||
        review.model !== FACTCHECK_REVIEW_MODEL ||
        !review.assessment ||
        !HASH.test(review.sourceSetSha256) ||
        !HASH.test(review.decision.contentSha256) ||
        !review.assessment.framingReason?.trim()) {
      return hold('independent_review_missing')
    }
    const a=review.assessment
    const digest=contentDigest(material)
    const srcDigest=sourceSetDigest(sources)
    if (a.projectId !== trustedProjectId ||
        a.scriptId !== material.scriptId ||
        a.revisionId !== material.revisionId ||
        a.contentSha256 !== digest ||
        review.sourceSetSha256 !== srcDigest ||
        review.decision.contentSha256 !== digest ||
        !Array.isArray(sources) ||
        sources.length<2 || sources.length>4) {
      return hold('review_revision_or_sources_changed')
    }
    const reviewedAtMs=Date.parse(a.reviewedAt)
    if (!Number.isFinite(reviewedAtMs) ||
        reviewedAtMs>nowMs || reviewedAtMs<=nowMs-MAX_AGE) {
      return hold('review_outside_valid_window')
    }
    const ids=new Set<string>()
    const groups=new Set<string>()
    const hashes=new Set<string>()
    const receipts:StoredSourceReceipt[]=[]
    for (const s of sources) {
      if (!s || typeof s.id!=='string' || ids.has(s.id) ||
          typeof s.text!=='string' || s.text.length<70 || s.text.length>12000 ||
          typeof s.retrievedAt!=='string' ||
          !Number.isFinite(Date.parse(s.retrievedAt)) ||
          Date.parse(s.retrievedAt)>nowMs ||
          Date.parse(s.retrievedAt)<=nowMs-48*60*60*1000) {
        return hold('invalid_source_snapshot')
      }
      const known=recognizeSource(s.url)
      if (!known || known.url!==s.url ||
          known.group!==s.publisherGroup || known.kind!==s.kind) {
        return hold('untrusted_source_identity')
      }
      ids.add(s.id)
      groups.add(s.publisherGroup)
      const textSha256=createHash('sha256').update(s.text).digest('hex')
      if (hashes.has(textSha256)) return hold('duplicate_source_content')
      hashes.add(textSha256)
      receipts.push({
        sourceId:s.id, url:s.url, publisherGroup:s.publisherGroup,
        kind:s.kind, retrievedAt:s.retrievedAt, textSha256,
        characterCount:s.text.length,
      })
    }
    if (groups.size<2) return hold('insufficient_distinct_publishers')
    // A model's "passed" flag is never trusted. Re-run the deterministic
    // reviewer contract against these exact stored-receipt source bytes.
    const expected=assessFactCheck(material,sources,a,nowMs)
    if (!sameDecision(expected,review.decision)) {
      return hold('assessment_and_decision_mismatch')
    }
    const record:FactCheckReportRow = {
      project_id:trustedProjectId, script_id:material.scriptId,
      run_id:currentRun.id, claim_id:currentRun.claim_id!,
      reviewer_run_id:a.reviewerRunId,
      script_version:Number(currentScript.version),
      revision_id:material.revisionId,
      content_sha256:digest,source_set_sha256:srcDigest,
      writer_model:writerModel,reviewer_model:FACTCHECK_REVIEW_MODEL,
      risk_tier:material.riskTier,
      outcome:expected.outcome,framing:a.framing,
      framing_reason:a.framingReason,
      reasons:[...expected.reasons],
      manuscript_snapshot:{
        projectId:material.projectId,scriptId:material.scriptId,
        revisionId:material.revisionId,hook:material.hook,
        script:material.script,captions:[...material.captions],
        cta:material.cta??'',socialCaption:material.socialCaption,
        thumbnailText:material.thumbnailText??'',
        riskTier:material.riskTier,
      },
      source_receipts:receipts,
      findings:a.findings.map(f=>({
        unitId:f.unitId,exactText:f.exactText,verdict:f.verdict,
        explanation:f.explanation,
        evidence:f.evidence.map(e=>({sourceId:e.sourceId,exactQuote:e.exactQuote})),
      })),
      reviewed_at:a.reviewedAt,
    }
    // Draft schema has explicit byte caps. Refuse rather than truncate evidence.
    if (Buffer.byteLength(JSON.stringify(record.manuscript_snapshot),'utf8')>24000 ||
        Buffer.byteLength(JSON.stringify(record.source_receipts),'utf8')>12000 ||
        Buffer.byteLength(JSON.stringify(record.findings),'utf8')>36000) {
      return hold('database_evidence_cap_exceeded')
    }
    // Prevent follow-up mutation of an already vetted candidate.
    return {ok:true,record:Object.freeze({
      ...record,
      reasons:Object.freeze([...record.reasons]) as unknown as string[],
      manuscript_snapshot:Object.freeze({
        ...record.manuscript_snapshot,
        captions:Object.freeze([...record.manuscript_snapshot.captions]) as unknown as string[],
      }),
      source_receipts:Object.freeze(receipts.map(x=>Object.freeze({...x}))) as unknown as StoredSourceReceipt[],
      findings:Object.freeze(record.findings.map(f=>Object.freeze({
        ...f,evidence:Object.freeze(f.evidence.map(e=>Object.freeze({...e}))) as unknown as {sourceId:string;exactQuote:string}[],
      }))) as unknown as FactCheckReportRow['findings'],
    })}
  } catch {
    return hold('evidence_preparation_failed')
  }
}
