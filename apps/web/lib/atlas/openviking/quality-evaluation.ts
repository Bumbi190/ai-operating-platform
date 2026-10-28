/**
 * Offline Atlas OpenViking quality / no-go gate.
 *
 * This is NOT a relevance algorithm, corpus publisher, or runtime chat plugin.
 * It compares frozen, labelled, ranked source-ID observations for identical
 * lexical and OpenViking queries. No network, credentials, document text,
 * generation model or private user data. Historical replay is diagnostic only.
 */
export const OPENVIKING_QUALITY_SCHEMA = 'atlas-openviking-quality-v1' as const

export type QuestionKind = 'answerable' | 'unsupported' | 'foreign_project'

export interface RetrievalRun {
  /** Source IDs (not original document paths or source content), in rank order. */
  ids: string[]
  durationMs: number
}

export interface QualityCase {
  id: string
  kind: QuestionKind
  /** One or more correct source IDs for answerable queries. Otherwise []. */
  expectedIds: string[]
  lexical: RetrievalRun[]
  openviking: RetrievalRun[]
}

export interface EvaluationProvenance {
  cohortId: string
  sourceReceipt: string
  sourceApproved: boolean
  sameOriginalDocuments: boolean
  frozenQuestionsBeforeIndexing: boolean
  independentlyAuthoredQuestions: boolean
  heldOutFromTuning: boolean
  currentOpenVikingVersionVerified: boolean
}

export interface QualityEvaluation {
  schemaVersion: typeof OPENVIKING_QUALITY_SCHEMA
  provenance: EvaluationProvenance
  /** Deterministic aliases; never include document body, API keys or absolute paths. */
  sourceIds: string[]
  cases: QualityCase[]
}

export interface QualityMetrics {
  answerable: number
  unsupported: number
  foreignProject: number
  correctFirstSourceAllRuns: number
  correctSourceAnywhereAllRuns: number
  unsupportedCasesReturningAnySource: number
  foreignProjectCasesReturningAnySource: number
  measuredRuns: number
  medianMs: number
  p95Ms: number
  maxMs: number
}

export interface QualityDecision {
  cohortId: string
  qualityEligibleForManualReview: boolean
  /** An eligible report NEVER authorizes runtime activation or publication. */
  runtimeActivationAuthorized: false
  reasons: string[]
  lexical: QualityMetrics
  openviking: QualityMetrics
  comparison: {
    firstSourceDifference: number
    firstSourceRateDifferencePctPoints: number
    openvikingOverLexicalMedianLatencyRatio: number | null
  }
}

const MIN_ANSWERABLE = 30
const MIN_UNSUPPORTED = 10
const MIN_FOREIGN_PROJECT = 8
const MIN_SOURCES = 8
const MAX_RUNS = 3
const MAX_HITS = 8
const P95_LIMIT_MS = 1_200

const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= 120

function validRun(r: RetrievalRun, known: Set<string>): boolean {
  return r !== null && typeof r === 'object'
    && Number.isFinite(r.durationMs) && r.durationMs >= 0 && r.durationMs <= 60_000
    && Array.isArray(r.ids) && r.ids.length <= MAX_HITS
    && new Set(r.ids).size === r.ids.length && r.ids.every(id => nonEmpty(id) && known.has(id))
}

export function validateQualityEvaluation(input: unknown): input is QualityEvaluation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const doc = input as Partial<QualityEvaluation>
  if (doc.schemaVersion !== OPENVIKING_QUALITY_SCHEMA
    || !doc.provenance || typeof doc.provenance !== 'object'
    || !Array.isArray(doc.sourceIds) || !Array.isArray(doc.cases)
    || doc.cases.length > 300 || doc.sourceIds.length > 128
    || new Set(doc.sourceIds).size !== doc.sourceIds.length
    || !doc.sourceIds.every(nonEmpty)) return false

  const prov = doc.provenance
  if (!nonEmpty(prov.cohortId) || !nonEmpty(prov.sourceReceipt)
    || !([
      prov.sourceApproved, prov.sameOriginalDocuments,
      prov.frozenQuestionsBeforeIndexing, prov.independentlyAuthoredQuestions,
      prov.heldOutFromTuning, prov.currentOpenVikingVersionVerified,
    ]).every(value => typeof value === 'boolean')) return false
  const known = new Set(doc.sourceIds)
  const ids = new Set<string>()
  for (const item of doc.cases) {
    if (!item || typeof item !== 'object' || !nonEmpty(item.id) || ids.has(item.id)
      || !(['answerable', 'unsupported', 'foreign_project'] as string[]).includes(item.kind)
      || !Array.isArray(item.expectedIds)
      || new Set(item.expectedIds).size !== item.expectedIds.length
      || !item.expectedIds.every(id => nonEmpty(id) && known.has(id))
      || (item.kind === 'answerable' ? item.expectedIds.length < 1 : item.expectedIds.length !== 0)
      || !Array.isArray(item.lexical) || !Array.isArray(item.openviking)
      || item.lexical.length !== MAX_RUNS || item.openviking.length !== MAX_RUNS
      || !item.lexical.every(r => validRun(r, known))
      || !item.openviking.every(r => validRun(r, known))) return false
    ids.add(item.id)
  }
  return true
}

const zeroMetrics = (): QualityMetrics => ({
  answerable: 0, unsupported: 0, foreignProject: 0,
  correctFirstSourceAllRuns: 0, correctSourceAnywhereAllRuns: 0,
  unsupportedCasesReturningAnySource: 0, foreignProjectCasesReturningAnySource: 0,
  measuredRuns: 0, medianMs: 0, p95Ms: 0, maxMs: 0,
})

function nearestRank(data: number[], percentile: number): number {
  if (!data.length) return 0
  const ranked = [...data].sort((a, b) => a - b)
  return ranked[Math.max(0, Math.ceil(ranked.length * percentile) - 1)]
}

function measure(cases: QualityCase[], key: 'lexical' | 'openviking'): QualityMetrics {
  const result = zeroMetrics()
  const durations: number[] = []
  for (const item of cases) {
    const runs = item[key]
    durations.push(...runs.map(run => run.durationMs))
    if (item.kind === 'answerable') {
      result.answerable++
      const expected = new Set(item.expectedIds)
      if (runs.every(run => expected.has(run.ids[0]))) result.correctFirstSourceAllRuns++
      if (runs.every(run => run.ids.some(id => expected.has(id)))) result.correctSourceAnywhereAllRuns++
    } else if (item.kind === 'unsupported') {
      result.unsupported++
      if (runs.some(run => run.ids.length > 0)) result.unsupportedCasesReturningAnySource++
    } else {
      result.foreignProject++
      if (runs.some(run => run.ids.length > 0)) result.foreignProjectCasesReturningAnySource++
    }
  }
  result.measuredRuns = durations.length
  result.medianMs = nearestRank(durations, 0.5)
  result.p95Ms = nearestRank(durations, 0.95)
  result.maxMs = durations.length ? Math.max(...durations) : 0
  return result
}

/**
 * A PASS means only "eligible for separate owner/security review".
 * It never changes Atlas runtime mode or triggers publication.
 * All thresholds are declared before new measurements are collected.
 */
export function evaluateOpenVikingQuality(input: unknown): QualityDecision {
  if (!validateQualityEvaluation(input)) {
    return {
      cohortId: 'invalid',
      qualityEligibleForManualReview: false, runtimeActivationAuthorized: false,
      reasons: ['evaluation_invalid_or_incomplete'],
      lexical: zeroMetrics(), openviking: zeroMetrics(),
      comparison: {
        firstSourceDifference: 0, firstSourceRateDifferencePctPoints: 0,
        openvikingOverLexicalMedianLatencyRatio: null,
      },
    }
  }
  const lexical = measure(input.cases, 'lexical')
  const openviking = measure(input.cases, 'openviking')
  const reasons: string[] = []
  const p = input.provenance
  if (!p.sourceApproved || !p.sameOriginalDocuments || !p.frozenQuestionsBeforeIndexing)
    reasons.push('source_or_query_integrity_not_verified')
  if (!p.independentlyAuthoredQuestions || !p.heldOutFromTuning)
    reasons.push('independent_held_out_questions_required')
  if (!p.currentOpenVikingVersionVerified) reasons.push('current_openviking_protocol_unverified')
  if (input.sourceIds.length < MIN_SOURCES) reasons.push('corpus_too_small')
  if (lexical.answerable < MIN_ANSWERABLE) reasons.push('insufficient_answerable_questions')
  if (lexical.unsupported < MIN_UNSUPPORTED) reasons.push('insufficient_unsupported_questions')
  if (lexical.foreignProject < MIN_FOREIGN_PROJECT) reasons.push('insufficient_foreign_project_tests')
  if (openviking.correctFirstSourceAllRuns < lexical.correctFirstSourceAllRuns)
    reasons.push('first_source_worse_than_lexical')
  if (openviking.answerable > 0
    && openviking.correctFirstSourceAllRuns / openviking.answerable < 0.85)
    reasons.push('first_source_below_minimum')
  if (openviking.correctSourceAnywhereAllRuns < lexical.correctSourceAnywhereAllRuns)
    reasons.push('recall_worse_than_lexical')
  if (openviking.unsupportedCasesReturningAnySource > 0)
    reasons.push('unsupported_queries_returned_sources')
  if (openviking.foreignProjectCasesReturningAnySource > 0)
    reasons.push('foreign_project_source_leak')
  if (openviking.p95Ms > P95_LIMIT_MS)
    reasons.push('latency_above_current_budget')
  return {
    cohortId: p.cohortId,
    qualityEligibleForManualReview: reasons.length === 0,
    runtimeActivationAuthorized: false,
    reasons,
    lexical,
    openviking,
    comparison: {
      firstSourceDifference: openviking.correctFirstSourceAllRuns - lexical.correctFirstSourceAllRuns,
      firstSourceRateDifferencePctPoints: openviking.answerable > 0
        ? Math.round(10000 * (
          openviking.correctFirstSourceAllRuns / openviking.answerable
          - lexical.correctFirstSourceAllRuns / lexical.answerable
        )) / 100 : 0,
      openvikingOverLexicalMedianLatencyRatio: lexical.medianMs > 0
        ? Math.round(100 * openviking.medianMs / lexical.medianMs) / 100 : null,
    },
  }
}
