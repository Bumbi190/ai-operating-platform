/**
 * lib/article/factcheck/contract.ts
 *
 * Deterministic half of the website-article FactCheck gate. Pure: no network,
 * no model, no database.
 *
 * It covers the WHOLE publishable text: the headline (`title`), the lede
 * (`summary`) and the body. The review route publishes all three, so a report
 * that judged only the body could pass a false headline.
 *
 * The reviewer model proposes claims, verdicts and evidence quotes. NOTHING it
 * says is trusted here:
 *   - every claim must quote a sentence that actually exists in the headline,
 *     lede or body (each field matched on its own, never across a boundary),
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
  ArticleField,
  ArticleText,
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
export const MAX_CLAIMS = 80

/**
 * Deterministic "this sentence asserts something checkable" signals: numbers,
 * money/percent, quotations, calendar words and factual-event verbs. A body
 * sentence carrying any of them MUST appear in the reviewer's claim list; the
 * reviewer cannot exempt it. Pure analysis without these signals may go
 * unlisted. Honest limit: a factual sentence with none of these signals (for
 * example "The company was bought by its rival.") is not caught here and still
 * relies on the reviewer and the owner.
 */
const FACT_SIGNAL_RE = new RegExp([
  String.raw`\d`,
  String.raw`[$€£¥%]`,
  String.raw`["“”]`,
  String.raw`\b(jan(uary)?|feb(ruary)?|march|april|june|july|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b`,
  String.raw`\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|yesterday|today|tomorrow|last (week|month|year)|next (week|month|quarter|year))\b`,
  String.raw`\b(announc\w*|launch\w*|releas\w*|unveil\w*|introduc\w*|acquir\w*|acquisition|merg\w*|rais(e|ed|es|ing)|fund\w*|valu(ed|ation)|invest\w*|fil(ed|es|ing)|sued|sues|lawsuit|ban(ned|s)?|fin(ed|es)|regulat\w*|confirm\w*|reported|reports|according to|said|says|stated|told|hired|fired|laid off|resign\w*|appoint\w*|partner\w*|priced|costs?|revenue|profit|users|customers|outperform\w*|beat|benchmark\w*|available|availability)\b`,
].join('|'), 'i')

/** Split a Markdown body into prose sentences; headings and blank lines are skipped. */
export function bodySentences(body: string): string[] {
  const out: string[] = []
  for (const rawLine of body.split(/\n+/)) {
    const line = rawLine.trim()
    if (!line || /^#{1,6}\s/.test(line)) continue
    const prose = line.replace(/^([-*+]|\d+[.)])\s+/, '').replace(/^>\s*/, '')
    for (const s of prose.split(/(?<=[.!?])\s+(?=["'“‘(]?[A-Z0-9])/u)) {
      const t = s.trim()
      if (t) out.push(t)
    }
  }
  return out
}

export function isCheckableSentence(sentence: string): boolean {
  return FACT_SIGNAL_RE.test(sentence)
}

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

const FIELDS: readonly ArticleField[] = ['title', 'summary', 'body']

/** Canonical field values: exactly what the review route publishes (`summary || null` => ''). */
export function canonicalArticleText(text: ArticleText): { title: string; summary: string; body: string } {
  return { title: text.title ?? '', summary: text.summary ?? '', body: text.body ?? '' }
}

export function articleFieldHashes(text: ArticleText): { title: string; summary: string; body: string } {
  const t = canonicalArticleText(text)
  return { title: sha256(t.title), summary: sha256(t.summary), body: sha256(t.body) }
}

/** One binding hash over all three fields; JSON array encoding keeps field boundaries unambiguous. */
export function articleContentSha256(text: ArticleText): string {
  const t = canonicalArticleText(text)
  return sha256(JSON.stringify([t.title, t.summary, t.body]))
}

/** Sentences of one field. The headline and lede are plain text, so a leading '#' is content. */
function fieldSentences(field: ArticleField, value: string): string[] {
  return bodySentences(field === 'body' ? value : value.replace(/^\s*#+\s*/, ''))
}

function checkClaim(
  raw: ModelClaim,
  index: number,
  field: ArticleField,
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
  // The headline and lede are what most readers take away; they can never be "supporting".
  let importance = raw.importance
  if (field !== 'body' && importance !== 'central') {
    importance = 'central'
    downgrades.push(`${field}_claim_is_central`)
  }

  return {
    id: `c${index + 1}`,
    field,
    sentence: raw.sentence.trim(),
    claim: raw.claim.trim(),
    importance,
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
  /** The publishable headline. */
  title: string
  /** The publishable lede; null/undefined => ''. */
  summary?: string | null
  body: string
  sources: readonly SourceSnapshot[]
  /** Raw reviewer output; null when the reviewer failed. Validated here. */
  modelClaims: unknown
  reviewerModel: string | null
  round: number
  now?: Date
}

export function assessArticleFactCheck(input: AssessInput): FactCheckReport {
  const text = canonicalArticleText(input)
  const fieldSha256 = articleFieldHashes(text)
  const contentSha256 = articleContentSha256(text)
  const checkedAt = (input.now ?? new Date()).toISOString()
  const sources = input.sources.map(({ text, ...rest }) => ({ ...rest, chars: text.length }))
  const empty = { supported: 0, uncertain: 0, contradicted: 0, unsupported: 0, central: 0, centralSingleGroup: 0 }

  const blocked = (reason: string, claims: CheckedClaim[] = []): FactCheckReport => ({
    version: 2, verdict: 'blocked', reasons: [reason], fieldSha256, contentSha256, checkedAt,
    reviewerModel: input.reviewerModel, sources, claims, counts: countClaims(claims) ?? empty,
    round: input.round,
  })

  if (!text.title.trim()) return blocked('empty_title')
  if (!text.body.trim()) return blocked('empty_body')
  if (input.sources.length === 0) return blocked('no_usable_sources')
  if (!Array.isArray(input.modelClaims)) return blocked('invalid_review_output')
  if (input.modelClaims.length === 0) return blocked('no_claims_extracted')
  if (input.modelClaims.length > MAX_CLAIMS) return blocked('too_many_claims')
  if (!input.modelClaims.every(isModelClaim)) return blocked('invalid_review_output')

  const normalizedFields = FIELDS.map((f) => [f, normalizeForMatch(text[f])] as const)
  const fieldOf = (sentence: string): ArticleField | null => {
    const n = normalizeForMatch(sentence)
    if (!n) return null
    // Headline first, then lede: a sentence the body repeats is still a headline/lede claim.
    return normalizedFields.find(([, v]) => v.includes(n))?.[0] ?? null
  }
  const sourcesById = new Map(input.sources.map((s) => [s.id, s]))
  const modelClaims = input.modelClaims as ModelClaim[]
  const located = modelClaims.map((c) => fieldOf(c.sentence))

  // A claim the article does not contain cannot gate the article. One mismatch means the
  // review was not of this text, so the whole review is refused rather than trusted in part.
  if (located.some((f) => f === null)) {
    return blocked('review_sentence_not_in_article',
      modelClaims.map((c, i) => checkClaim(c, i, located[i] ?? 'body', sourcesById)))
  }
  const claims = modelClaims.map((c, i) => checkClaim(c, i, located[i]!, sourcesById))

  // COVERAGE. The reviewer decides what it lists, so an omitted claim would
  // otherwise never be judged. Every headline and lede sentence (always: they are
  // the most prominent assertions) and every checkable body sentence must be
  // contained in some listed claim sentence (a listed fragment does not cover
  // the whole sentence). Anything omitted becomes an UNSUPPORTED CENTRAL claim —
  // fail closed — which forces a revision and, if still omitted, blocks.
  const listed = claims.map((c) => normalizeForMatch(c.sentence))
  const required = FIELDS.flatMap((field) =>
    fieldSentences(field, text[field])
      .filter((s) => field !== 'body' || isCheckableSentence(s))
      .map((sentence) => ({ field, sentence })))
  const omitted = required.filter(({ sentence }) => {
    const n = normalizeForMatch(sentence)
    return n.length > 0 && !listed.some((l) => l.includes(n))
  })
  omitted.forEach(({ field, sentence }, i) => claims.push({
    id: `u${i + 1}`,
    field,
    sentence,
    claim: sentence,
    importance: 'central',
    modelVerdict: 'unsupported',
    verdict: 'unsupported',
    evidence: [],
    rejectedEvidence: [],
    publisherGroups: [],
    hasPrimarySource: false,
    note: field === 'body'
      ? 'Checkable sentence was not listed by the reviewer; treated as an unsupported central claim.'
      : `The ${field === 'title' ? 'headline' : 'lede'} was not listed by the reviewer; treated as an unsupported central claim.`,
    downgrades: ['omitted_by_reviewer'],
  }))

  const counts = countClaims(claims)
  if (counts.central === 0) return blocked('no_central_claims', claims)

  const reasons: string[] = []
  if (omitted.length > 0) reasons.push(`omitted_checkable_sentences:${omitted.length}`)
  for (const f of ['title', 'summary'] as const) {
    if (claims.some((c) => c.field === f && !claimIsPublishable(c))) reasons.push(`${f}_not_verified`)
  }
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
    version: 2, verdict, reasons, fieldSha256, contentSha256, checkedAt,
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
 * EXACTLY the headline, lede and body it was computed on, and only when it passed.
 * Editing any one of them (even only the headline) refuses publication until the
 * new version has been fact-checked. Version-1 (body-only) reports are refused.
 */
export function factCheckAllowsPublication(report: unknown, text: ArticleText): { ok: true } | { ok: false; reason: string } {
  if (!report || typeof report !== 'object') return { ok: false, reason: 'factcheck_missing' }
  const r = report as Partial<FactCheckReport>
  if (r.version !== 2) return { ok: false, reason: 'factcheck_unknown_version' }
  if (r.verdict !== 'passed') return { ok: false, reason: `factcheck_${r.verdict ?? 'missing'}` }
  const current = articleFieldHashes(text)
  const reviewed = (r.fieldSha256 ?? {}) as Partial<Record<ArticleField, unknown>>
  for (const f of FIELDS) {
    if (typeof reviewed[f] !== 'string' || reviewed[f] !== current[f]) {
      return { ok: false, reason: `factcheck_${f}_mismatch` }
    }
  }
  if (typeof r.contentSha256 !== 'string' || r.contentSha256 !== articleContentSha256(text)) {
    return { ok: false, reason: 'factcheck_content_mismatch' }
  }
  return { ok: true }
}
