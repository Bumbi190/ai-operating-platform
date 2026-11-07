/**
 * The Prompt editorial score contract.
 *
 * Provider JSON, stored JSON and legacy "passed" flags are untrusted.
 * Missing/invalid data and the historical parse-error placeholder are never
 * permission to spend on media or publish a news report.
 */
export type VerifiedQualityScore = {
  hook_strength: number
  retention_score: number
  visual_relevance: number
  shareability: number
  discussion_potential: number
  hallucination_risk: number
  overall: number
  passed: boolean
  verdict: string
  weak_spots: string[]
}

export class QualityReviewRequired extends Error {
  constructor() {
    super('quality_review_required')
    this.name = 'QualityReviewRequired'
  }
}

function score(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10) {
    throw new QualityReviewRequired()
  }
  return value
}

function verified(value: unknown): VerifiedQualityScore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new QualityReviewRequired()
  }
  const record = value as Record<string, unknown>
  const hook_strength = score(record.hook_strength)
  const retention_score = score(record.retention_score)
  const visual_relevance = score(record.visual_relevance)
  const shareability = score(record.shareability)
  const discussion_potential = score(record.discussion_potential)
  const hallucination_risk = score(record.hallucination_risk)
  const reportedOverall = score(record.overall)
  const overall = (hook_strength + retention_score + visual_relevance
    + shareability + discussion_potential) / 5

  // A hallucinated overall can never upgrade weak individual dimensions.
  if (Math.abs(reportedOverall - overall) > 0.51) throw new QualityReviewRequired()
  if (typeof record.passed !== 'boolean') throw new QualityReviewRequired()
  const verdict = typeof record.verdict === 'string' ? record.verdict.trim() : ''
  if (!verdict || verdict.length > 1000
      || /quality check parse error|proceeding with caution/i.test(verdict)) {
    throw new QualityReviewRequired()
  }
  if (!Array.isArray(record.weak_spots)
      || record.weak_spots.length > 20
      || record.weak_spots.some((item: unknown) =>
        typeof item !== 'string' || item.length > 400)) {
    throw new QualityReviewRequired()
  }

  // The provider may REFUSE approval. It cannot override deterministic checks.
  return {
    hook_strength, retention_score, visual_relevance, shareability,
    discussion_potential, hallucination_risk,
    overall: Number(overall.toFixed(2)),
    passed: record.passed === true && overall >= 8
      && hook_strength >= 8 && hallucination_risk >= 7,
    verdict,
    weak_spots: record.weak_spots as string[],
  }
}

/** Parse a single JSON response; never synthesize a passing fallback. */
export function parseQualityScoreResponse(raw: string): VerifiedQualityScore {
  const cleaned = raw.trim()
    .replace(/^\`\`\`(?:json)?[ \t]*\r?\n/i, '')
    .replace(/\r?\n?\`\`\`$/, '').trim()
  let value: unknown
  try {
    value = JSON.parse(cleaned) as unknown
  } catch {
    throw new QualityReviewRequired()
  }
  return verified(value)
}

/** True only for a complete score contract; not an independent source fact-check. */
export function isApprovedQualityScore(value: unknown): boolean {
  try {
    return verified(value).passed
  } catch {
    return false
  }
}
