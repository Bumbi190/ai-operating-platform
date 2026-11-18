/** Pure editorial evaluation; no paid model calls or runtime dependencies. */

export interface QualityScore {
  hook_strength: number          // Hook Score — stoppar de första <2s scrollen?
  retention_score: number        // håller storyn kvar tittaren hela klippet?
  visual_relevance: number       // kan storyn representeras av konkreta, story-specifika visuals?
  shareability: number           // skulle någon faktiskt dela detta?
  discussion_potential: number   // triggar det kommentarer/debatt?
  hallucination_risk: number     // 10 = inga påhittade fakta, 0 = mycket riskabelt
  overall: number
  passed: boolean
  verdict: string                // one-sentence explanation
  weak_spots: string[]           // specific things to fix
}


/** Fail closed: unparseable model output is not editorial approval. */
export function failedQualityScore(reason: string): QualityScore {
  return {
    hook_strength: 0, retention_score: 0, visual_relevance: 0,
    shareability: 0, discussion_potential: 0, hallucination_risk: 0,
    overall: 0, passed: false, verdict: reason,
    weak_spots: ['Manual editorial review required.'],
  }
}

/** Validate every score before accepting it; recompute the average server-side. */
export function parseQualityScore(raw: string): QualityScore {
  const clean = raw.replace(/^\x60{3}(?:json)?\s*/i, '').replace(/\x60{3}\s*$/, '').trim()
  try {
    const candidate: unknown = JSON.parse(clean)
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('not an object')
    const value = candidate as Record<string, unknown>
    const keys = ['hook_strength', 'retention_score', 'visual_relevance', 'shareability', 'discussion_potential', 'hallucination_risk'] as const
    if (keys.some(k => typeof value[k] !== 'number' || !Number.isFinite(value[k]) || (value[k] as number) < 0 || (value[k] as number) > 10)
      || typeof value.passed !== 'boolean'
      || typeof value.verdict !== 'string'
      || !Array.isArray(value.weak_spots)
      || !value.weak_spots.every((s: unknown) => typeof s === 'string')) {
      throw new Error('missing or invalid score fields')
    }
    const scores = keys.map(k => value[k] as number)
    const overall = Math.round((scores.slice(0, 5).reduce((sum, n) => sum + n, 0) / 5) * 10) / 10
    const [hook_strength, retention_score, visual_relevance, shareability, discussion_potential, hallucination_risk] = scores
    return {
      hook_strength, retention_score, visual_relevance, shareability,
      discussion_potential, hallucination_risk, overall,
      // The model can reject a script; it cannot override our minimum scores.
      passed: value.passed === true && overall >= 8 && hook_strength >= 8 && hallucination_risk >= 7,
      verdict: value.verdict as string,
      weak_spots: value.weak_spots as string[],
    }
  } catch {
    return failedQualityScore('Quality check invalid or malformed — manual editorial review required.')
  }
}

/** Returns true if the script should be regenerated. Bar: overall ≥ 8, hook ≥ 8, faktasäkert. */
export function shouldRegenerate(score: QualityScore): boolean {
  return !score.passed || score.overall < 8.0 || score.hook_strength < 8 || score.hallucination_risk < 7
}
