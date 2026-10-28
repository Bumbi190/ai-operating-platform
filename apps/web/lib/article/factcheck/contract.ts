/**
 * lib/article/factcheck/contract.ts
 *
 * Deterministic half of the website-article FactCheck gate. Pure: no network,
 * no model, no database.
 *
 * The reviewer model proposes claims, verdicts and evidence quotes. NOTHING it
 * says is trusted here:
 *   - every claim must quote a sentence that actually exists in the body,
 *   - every evidence quote must exist verbatim in the snapshot it cites,
 *   - "supported" without verified evidence becomes "unsupported",
 *   - "contradicted" without verified evidence becomes "uncertain".
 * The verdict is then computed from the validated claims only.
 *
 * Honest limit: this proves the cited text exists in the cited source and that
 * the model's own reading of it was recorded. It does not prove the model
 * understood the quote correctly — that is what the human review is for.
 */

import { createHash } from 'node:crypto'
import type {
  CheckedClaim,
  ClaimEvidence,
  ClaimVerdict,
  FactCheckReport,
  FactCheckVerdict,
  ModelClaim,
  SourceSnapshot,
} from './types'

const MIN_QUOTE_CHARS = 12
const MAX_QUOTE_CHARS = 600
const MAX_CLAIMS = 60

/** Words that make an uncertain supporting statement explicitly qualified. */
const QUALIFIER_RE =
  /\b(reportedly|according to|allegedly|unconfirmed|not (yet )?(been )?(confirmed|verified|disclosed)|did not (say|disclose|confirm)|unclear|may|might|could|appears? to|suggests?|likely|unlikely|expected to|plans? to|claims?|said it)\b/i

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** Normalise for containment checks: markdown, quotes, dashes, whitespace, case. */
export function normalizeForMatch(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // markdown links → anchor text
    .replace(/[*_`#>]/g, '')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function quoteFoundIn(sourceText: string, quote: string): boolean {
  const q = normalizeForMatch(quote)
  if (q.length < MIN_QUOTE_CHARS || q.length > MAX_QUOTE_CHARS) return false
  return normalizeForMatch(sourceText).includes(q)
}

export function isQualified(sentence: string): boolean {
  return QUALIFIER_RE.test(sentence)
}

function isModelClaim(value: unknown): value is ModelClaim {
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  return (
    typeof c.sentence === 'string' &&
    c.sentence.trim().length > 0 &&
    typeof c.claim === 'string' &&
    (c.importance === 'central' || c.importance === 'supporting') &&
    (c.verdict === 'supported' || c.verdict === 'uncertain' ||
      c.verdict === 'contradicted' || c.verdict === 'unsupported') &&
    Array.isArray(c.evidence) &&
    c.evidence.every(
      (e) => e && typeof e === 'object' &&
        typeof (e as ClaimEvidence).sourceId === 'string' &&
        typeof (e as ClaimEvidence).exactQuote === 'string',
    ) &&
    (c.note === undefined || typeof c.note === 'string')
  )
}

function checkClaim(
  raw: ModelClaim,
  index: number,
  sourcesById: Map<string, SourceSnapshot>,
): CheckedClaim {
  const evidence: ClaimEvidence[] = []
  const rejectedEvidence: ClaimEvidence[] = []
  for (const e of raw.evidence) {
    const source = sourcesById.get(e.sourceId)
    if (source && quoteFoundIn(source.text, e.exactQuote)) evidence.push(e)
    else rejectedEvidence.push(e)
  }

  const groups = [...new Set(evidence.map((e) => sourcesById.get(e.sourceId)!.publisherGroup))]
  const hasPrimarySource = evidence.some((e) => sourcesById.get(e.sourceId)!.kind === 'primary')

  const downgrades: string[] = []
  let verdict: ClaimVerdict = raw.verdict
  if (raw.verdict === 'supported' && evidence.length === 0) {
    verdict = 'unsupported'
    downgrades.push('supported_without_verified_evidence')
  }
  if (raw.verdict === 'contradicted' && evidence.length === 0) {
    verdict = 'uncertain'
    downgrades.push('contradiction_without_verified_evidence')
  }
  if (rejectedEvidence.length > 0) downgrades.push(`rejected_evidence:${rejectedEvidence.length}`)

  return {
    id: `c${index + 1}`,
    sentence: raw.sentence.trim(),
    claim: raw.claim.trim(),
    importance: raw.importance,
    modelVerdict: raw.verdict,
    verdict,
    evidence,
    rejectedEvidence,
    publisherGroups: groups,
    hasPrimarySource,
    note: (raw.note ?? '').trim(),
    downgrades,
  }
}

/** True when the claim, as written, may be published. */
export function claimIsPublishable(c: CheckedClaim): boolean {
  if (c.verdict === 'supported') return true
  if (c.verdict === 'contradicted' || c.verdict === 'unsupported') return false
  // uncertain: never acceptable for a central claim; a supporting one must be visibly qualified.
  return c.importance === 'supporting' && isQualified(c.sentence)
}

export interface AssessInput {
  body: string
  sources: readonly SourceSnapshot[]
  /** Raw reviewer output; null when the reviewer failed. Validated here. */
  modelClaims: unknown
  reviewerModel: string | null
  round: number
  now?: Date
}

export function assessArticleFactCheck(input: AssessInput): FactCheckReport {
  const bodySha256 = sha256(input.body)
  const checkedAt = (input.now ?? new Date()).toISOString()
  const sources = input.sources.map(({ text, ...rest }) => ({ ...rest, chars: text.length }))
  const empty = { supported: 0, uncertain: 0, contradicted: 0, unsupported: 0, central: 0, centralSingleGroup: 0 }

  const blocked = (reason: string, claims: CheckedClaim[] = []): FactCheckReport => ({
    version: 1, verdict: 'blocked', reasons: [reason], bodySha256, checkedAt,
    reviewerModel: input.reviewerModel, sources, claims, counts: countClaims(claims) ?? empty,
    round: input.round,
  })

  if (!input.body.trim()) return blocked('empty_body')
  if (input.sources.length === 0) return blocked('no_usable_sources')
  if (!Array.isArray(input.modelClaims)) return blocked('invalid_review_output')
  if (input.modelClaims.length === 0) return blocked('no_claims_extracted')
  if (input.modelClaims.length > MAX_CLAIMS) return blocked('too_many_claims')
  if (!input.modelClaims.every(isModelClaim)) return blocked('invalid_review_output')

  const normalizedBody = normalizeForMatch(input.body)
  const sourcesById = new Map(input.sources.map((s) => [s.id, s]))
  const claims = (input.modelClaims as ModelClaim[]).map((c, i) => checkClaim(c, i, sourcesById))

  // A claim the body does not contain cannot gate the body. One mismatch means the
  // review was not of this text, so the whole review is refused rather than trusted in part.
  if (claims.some((c) => !normalizedBody.includes(normalizeForMatch(c.sentence)))) {
    return blocked('review_sentence_not_in_body', claims)
  }

  const counts = countClaims(claims)
  if (counts.central === 0) return blocked('no_central_claims', claims)

  const reasons: string[] = []
  for (const c of claims) {
    if (!claimIsPublishable(c)) reasons.push(`${c.id}:${c.importance}:${c.verdict}`)
  }
  if (counts.centralSingleGroup > 0) {
    // Informational: not blocking, because independent corroboration is "where possible".
    reasons.push(`info:central_claims_single_publisher:${counts.centralSingleGroup}`)
  }

  const blocking = reasons.filter((r) => !r.startsWith('info:'))
  const verdict: FactCheckVerdict = blocking.length === 0 ? 'passed' : 'needs_revision'

  return {
    version: 1, verdict, reasons, bodySha256, checkedAt,
    reviewerModel: input.reviewerModel, sources, claims, counts, round: input.round,
  }
}

function countClaims(claims: readonly CheckedClaim[]) {
  const counts = { supported: 0, uncertain: 0, contradicted: 0, unsupported: 0, central: 0, centralSingleGroup: 0 }
  for (const c of claims) {
    counts[c.verdict]++
    if (c.importance === 'central') {
      counts.central++
      if (c.verdict === 'supported' && c.publisherGroups.length < 2) counts.centralSingleGroup++
    }
  }
  return counts
}

/** Claims the reviser must correct, qualify or remove. */
export function claimsNeedingRevision(report: FactCheckReport): CheckedClaim[] {
  return report.claims.filter((c) => !claimIsPublishable(c))
}

/**
 * Publication gate used by the review route. A report authorises publication of
 * EXACTLY the body it was computed on, and only when it passed.
 */
export function factCheckAllowsPublication(report: unknown, body: string): { ok: true } | { ok: false; reason: string } {
  if (!report || typeof report !== 'object') return { ok: false, reason: 'factcheck_missing' }
  const r = report as Partial<FactCheckReport>
  if (r.version !== 1) return { ok: false, reason: 'factcheck_unknown_version' }
  if (r.verdict !== 'passed') return { ok: false, reason: `factcheck_${r.verdict ?? 'missing'}` }
  if (typeof r.bodySha256 !== 'string' || r.bodySha256 !== sha256(body)) {
    return { ok: false, reason: 'factcheck_body_mismatch' }
  }
  return { ok: true }
}
