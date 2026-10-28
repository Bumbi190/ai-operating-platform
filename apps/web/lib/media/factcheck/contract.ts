/**
 * The Prompt FactCheck v1: read-only evidence-bound contract.
 * NOT a source collector, AI reviewer or authorization to publish.
 * Only trusted server-side source snapshots may be passed here.
 */
import {createHash} from 'node:crypto'

export type SourceKind = 'primary' | 'independent_reporting' | 'community'
export type ClaimVerdict = 'supported' | 'unsupported' | 'contradicted' | 'misleading' | 'not_factual'
export type FactCheckOutcome = 'ready_for_editor' | 'requires_review' | 'rejected'
export type FramingVerdict = 'faithful_to_evidence' | 'misleading' | 'unverified'
export type RiskTier = 'standard' | 'sensitive' | 'unknown'

export interface SourceSnapshot {
  readonly id: string
  readonly url: string
  /** Assigned by the trusted collector, NOT by the reviewer model. */
  readonly publisherGroup: string
  readonly kind: SourceKind
  readonly retrievedAt: string
  readonly text: string
}
export interface ScriptMaterial {
  readonly projectId: string
  readonly scriptId: string
  readonly revisionId: string
  readonly hook: string
  readonly script: string
  readonly captions: readonly string[]
  readonly socialCaption: string
  readonly cta?: string
  readonly thumbnailText?: string
  /** Set by an authoritative risk-classification step, not by the model. */
  readonly riskTier: RiskTier
}
export interface SentenceUnit {
  readonly id: string
  readonly text: string
  readonly part: 'hook' | 'script' | 'caption' | 'social' | 'cta' | 'thumbnail'
}
export interface Finding {
  readonly unitId: string
  readonly exactText: string
  readonly verdict: ClaimVerdict
  readonly evidence: readonly { readonly sourceId: string; readonly exactQuote: string }[]
  readonly explanation: string
}
export interface ReviewerAssessment {
  readonly projectId: string
  readonly scriptId: string
  readonly revisionId: string
  readonly contentSha256: string
  readonly reviewerRunId: string
  readonly reviewedAt: string
  readonly framing: FramingVerdict
  readonly framingReason: string
  readonly findings: readonly Finding[]
}
export interface FactCheckDecision {
  readonly outcome: FactCheckOutcome
  readonly reasons: readonly string[]
  readonly contentSha256: string
  readonly unitCount: number
  readonly reviewedSourceCount: number
}

export function contentDigest(material: ScriptMaterial): string {
  return createHash('sha256').update(JSON.stringify([
    material.projectId, material.scriptId, material.revisionId,
    material.hook, material.script, ...material.captions, material.socialCaption,
    material.cta ?? '', material.thumbnailText ?? '', material.riskTier,
  ])).digest('hex')
}
function splitSentences(input: string): string[] {
  return input.trim().split(/(?<=[.!?])\s+(?=["'“‘]?[A-Z0-9])/u)
    .map(part => part.trim()).filter(Boolean)
}
export function materialUnits(material: ScriptMaterial): SentenceUnit[] {
  const result: SentenceUnit[] = []
  for (const part of ['hook', 'script', 'caption', 'social', 'cta', 'thumbnail'] as const) {
    const texts = part === 'hook' ? [material.hook]
      : part === 'script' ? [material.script]
      : part === 'caption' ? [...material.captions]
      : part === 'social' ? [material.socialCaption]
      : part === 'cta' ? [material.cta ?? ''] : [material.thumbnailText ?? '']
    let index = 0
    for (const text of texts) {
      for (const sentence of splitSentences(text)) {
        result.push({id: part + ':' + index++, text: sentence, part})
      }
    }
  }
  return result
}
function fresh(iso: string, now: number, maxAge: number): boolean {
  const time = Date.parse(iso)
  return Number.isFinite(time) && time <= now && time > now - maxAge
}
function usableSource(source: SourceSnapshot, now: number): boolean {
  try {
    const url = new URL(source.url)
    return url.protocol === 'https:' && !url.username && !url.password
      && Boolean(url.hostname)
      && typeof source.publisherGroup === 'string'
      && /^[a-z0-9._-]{2,100}$/i.test(source.publisherGroup)
      && typeof source.id === 'string'
      && /^[a-z0-9._-]{1,100}$/i.test(source.id)
      && ['primary', 'independent_reporting', 'community'].includes(source.kind)
      && fresh(source.retrievedAt, now, 48 * 60 * 60 * 1000)
      && typeof source.text === 'string' && source.text.length >= 30
      && source.text.length <= 200_000
  } catch { return false }
}
function quotedInSource(source: SourceSnapshot, quote: string): boolean {
  if (quote.trim().length < 12 || quote.length > 500) return false
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase()
  return normalize(source.text).includes(normalize(quote))
}

/**
 * Verifies minimum sentence coverage, source-excerpt presence, distinct
 * publishers, project identity and revision pinning. It does NOT prove semantic
 * truth or that every compound sentence has been split into atomic claims.
 * Passing is readiness for an independent editorial approval, NOT publication.
 */
export function assessFactCheck(
  material: ScriptMaterial,
  sources: readonly SourceSnapshot[],
  assessment: ReviewerAssessment | null,
  nowMs: number,
): FactCheckDecision {
  let contentSha256 = ''
  let units: SentenceUnit[] = []
  try {
    if (!material || typeof material.hook !== 'string' ||
      typeof material.script !== 'string' ||
      !Array.isArray(material.captions) ||
      material.captions.some(item => typeof item !== 'string') ||
      typeof material.socialCaption !== 'string') throw new Error('invalid_script')
    contentSha256 = contentDigest(material)
    units = materialUnits(material)
  } catch {
    return {outcome: 'requires_review', reasons: ['invalid_script'],
      contentSha256: '', unitCount: 0,
      reviewedSourceCount: Array.isArray(sources) ? sources.length : 0}
  }
  const stop = (reason: string, outcome: FactCheckOutcome = 'requires_review'): FactCheckDecision => ({
    outcome, reasons: [reason], contentSha256,
    unitCount: units.length, reviewedSourceCount: sources.length,
  })
  if (typeof material.projectId !== 'string' ||
    typeof material.scriptId !== 'string' ||
    typeof material.revisionId !== 'string' ||
    typeof material.hook !== 'string' ||
    typeof material.script !== 'string' ||
    !material.projectId || !material.scriptId || !material.revisionId ||
    !material.hook.trim() || !material.script.trim() ||
    units.length < 2 || units.length > 60) return stop('invalid_script')
  if (!Number.isFinite(nowMs)) return stop('clock_unavailable')
  if (!assessment) return stop('assessment_missing')
  if (assessment.projectId !== material.projectId ||
      assessment.scriptId !== material.scriptId ||
      assessment.revisionId !== material.revisionId ||
      assessment.contentSha256 !== contentSha256 ||
      typeof assessment.reviewerRunId !== 'string' ||
      !assessment.reviewerRunId.trim()) return stop('wrong_project_or_revision')
  if (typeof assessment.reviewedAt !== 'string' ||
      !fresh(assessment.reviewedAt, nowMs, 24 * 60 * 60 * 1000)) return stop('assessment_stale')
  if (!['faithful_to_evidence','misleading','unverified'].includes(assessment.framing) ||
      typeof assessment.framingReason !== 'string' ||
      !assessment.framingReason.trim()) return stop('framing_missing')
  if (assessment.framing === 'misleading') return stop('misleading_framing', 'rejected')
  if (assessment.framing !== 'faithful_to_evidence') return stop('framing_not_verified')
  if (!Array.isArray(assessment.findings) ||
      assessment.findings.length !== units.length) return stop('missing_claims')
  if (sources.length === 0 || sources.length > 16) return stop('missing_sources')
  const sourceById = new Map(sources.map(source => [source.id, source]))
  if (sourceById.size !== sources.length || sources.some(s => !usableSource(s, nowMs))) {
    return stop('invalid_source_snapshot')
  }
  const required = new Map(units.map(unit => [unit.id, unit]))
  const seen = new Set<string>()
  for (const finding of assessment.findings) {
    if (!finding || typeof finding !== 'object' ||
        typeof finding.unitId !== 'string') return stop('invalid_claim_coverage')
    const unit = required.get(finding.unitId)
    if (!unit || seen.has(finding.unitId) || finding.exactText !== unit.text ||
      typeof finding.explanation !== 'string' ||
      !finding.explanation.trim()) return stop('invalid_claim_coverage')
    seen.add(finding.unitId)
    if (finding.verdict === 'contradicted' || finding.verdict === 'misleading') {
      return stop('material_claim_contradicted_or_misleading', 'rejected')
    }
    // Opinions, predictions and unavailable facts require review, not false approval.
    if (finding.verdict !== 'supported') return stop('claim_unverified')
    if (!Array.isArray(finding.evidence) || finding.evidence.length > 8) {
      return stop('evidence_missing_or_unbounded')
    }
    const independentlyPublished = new Set<string>()
    for (const evidence of finding.evidence) {
      if (!evidence || typeof evidence !== 'object' ||
          typeof evidence.sourceId !== 'string') return stop('evidence_invalid')
      const source = sourceById.get(evidence.sourceId)
      if (!source || typeof evidence.exactQuote !== 'string' ||
          !quotedInSource(source, evidence.exactQuote)) return stop('invented_or_missing_quote')
      if (source.kind !== 'community') independentlyPublished.add(source.publisherGroup)
    }
    if (independentlyPublished.size < 2) return stop('insufficient_independent_sources')
  }
  if (material.riskTier !== 'standard') return stop('sensitive_or_unclassified')
  return {outcome: 'ready_for_editor', reasons: [], contentSha256,
    unitCount: units.length, reviewedSourceCount: sources.length}
}
