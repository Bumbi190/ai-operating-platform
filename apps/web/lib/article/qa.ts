/**
 * lib/article/qa.ts
 *
 * Layered QA gate (cheap → expensive). Deterministic first:
 *   1. structural validation (fields, category, tags, lengths, attribution)
 *   2. slop detection (reuse lib/ai evaluator)
 *   3. copy-overlap vs source (originality / copyright guard)
 * Then a confidence bucket. LLM evaluation (content-evaluator) can be layered on later.
 */

import { detectSlop } from '@/lib/ai/evaluator/slop-detector'
import {
  TIER_WORD_BANDS,
  isArticleCategory,
  type ArticleDraft,
  type ArticleQa,
  type Confidence,
  type GroundingResult,
} from './types'

const TAG_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const SLOP_HARD_FAIL = 5.0 // heavy_slop
const SLOP_SOFT = 2.5 // minor → medium confidence
const COPY_WINDOW = 12

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** Verbatim-overlap: any window of COPY_WINDOW source words reproduced in the body. */
export function copyOverlap(body: string, source: string, windowSize = COPY_WINDOW) {
  const a = words(body)
  const s = words(source)
  if (a.length < windowSize || s.length < windowSize) {
    return { ratio: 0, violation: false, windowSize }
  }
  const sourceWindows = new Set<string>()
  for (let i = 0; i + windowSize <= s.length; i++) {
    sourceWindows.add(s.slice(i, i + windowSize).join(' '))
  }
  let total = 0
  let hit = 0
  for (let i = 0; i + windowSize <= a.length; i++) {
    total++
    if (sourceWindows.has(a.slice(i, i + windowSize).join(' '))) hit++
  }
  const ratio = total > 0 ? hit / total : 0
  return { ratio: Math.round(ratio * 1000) / 1000, violation: hit > 0, windowSize }
}

function hasAttribution(draft: ArticleDraft): boolean {
  const body = draft.body.toLowerCase()
  if (/\b(according to|reported|reports|reportedly|said|announced|wrote|per)\b/.test(body)) return true
  if (draft.source_name && body.includes(draft.source_name.toLowerCase())) return true
  if (draft.source_url && draft.body.includes(draft.source_url)) return true
  return false
}

function structuralIssues(draft: ArticleDraft, grounding: GroundingResult): string[] {
  const issues: string[] = []
  if (!draft.title) issues.push('missing title')
  if (draft.title.length > 90) issues.push(`title too long (${draft.title.length})`)
  if (!draft.summary) issues.push('missing summary')
  if (draft.summary.length > 200) issues.push(`summary too long (${draft.summary.length})`)
  if (!draft.body) issues.push('missing body')
  if (!isArticleCategory(draft.category)) issues.push(`invalid category "${draft.category}"`)
  if (draft.tags.length < 3) issues.push(`too few tags (${draft.tags.length})`)
  if (draft.tags.length > 6) issues.push(`too many tags (${draft.tags.length})`)
  if (draft.tags.some((t) => !TAG_SLUG_RE.test(t.slug))) issues.push('invalid tag slug')
  if (!draft.source_url) issues.push('missing source_url')
  if (!hasAttribution(draft)) issues.push('no in-prose attribution found')

  const band = TIER_WORD_BANDS[draft._meta.tier]
  const wc = draft._meta.bodyWordCount
  if (wc < band.min * 0.6) issues.push(`body far below tier band (${wc} < ${band.min})`)
  if (wc > band.max * 1.5) issues.push(`body far above tier band (${wc} > ${band.max})`)
  // grounding is informational here; weak grounding tightens confidence below.
  void grounding
  return issues
}

export function reviewArticle(draft: ArticleDraft, grounding: GroundingResult): ArticleQa {
  const issues = structuralIssues(draft, grounding)
  const structuralOk = issues.length === 0

  const slopResult = detectSlop(draft.body)
  const overlap = copyOverlap(draft.body, grounding.text)

  if (overlap.violation) issues.push(`verbatim copy overlap (${COPY_WINDOW}+ words; ratio ${overlap.ratio})`)
  if (slopResult.score > SLOP_HARD_FAIL) issues.push(`heavy AI slop (${slopResult.score})`)

  const pass = structuralOk && !overlap.violation && slopResult.score <= SLOP_HARD_FAIL

  let confidence: Confidence
  if (!pass) {
    confidence = 'low'
  } else if (grounding.mode === 'weak' || slopResult.score > SLOP_SOFT || overlap.ratio > 0) {
    confidence = 'medium'
  } else {
    confidence = 'high'
  }

  return {
    pass,
    confidence,
    issues,
    slop: { score: slopResult.score, verdict: slopResult.verdict },
    copyOverlap: overlap,
    structuralOk,
  }
}
