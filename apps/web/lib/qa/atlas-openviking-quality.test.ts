/**
 * Evaluation-only gate. No real OpenViking connection, private corpus,
 * publication, Atlas chat tools, model-generated answers or credentials.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  evaluateOpenVikingQuality, validateQualityEvaluation, OPENVIKING_QUALITY_SCHEMA,
  type QualityEvaluation,
} from '@/lib/atlas/openviking/quality-evaluation'

const fixture = JSON.parse(readFileSync(
  join(process.cwd(), 'lib/qa/fixtures/atlas-openviking-five-source-history.json'),
  'utf8',
)) as unknown

function sample(): QualityEvaluation {
  const sourceIds = Array.from({ length: 8 }, (_, i) => 'doc-' + String(i + 1).padStart(2, '0'))
  const observations = (ids: string[], durationMs = 50) => Array.from({ length: 3 },
    () => ({ ids: [...ids], durationMs }))
  return {
    schemaVersion: OPENVIKING_QUALITY_SCHEMA,
    provenance: {
      cohortId: 'private-held-out-proof',
      sourceReceipt: 'operator_reviewed_capture_without_document_bodies',
      sourceApproved: true, sameOriginalDocuments: true,
      frozenQuestionsBeforeIndexing: true, independentlyAuthoredQuestions: true,
      heldOutFromTuning: true, currentOpenVikingVersionVerified: true,
    },
    sourceIds,
    cases: [
      ...Array.from({ length: 32 }, (_, i) => {
        const expected = sourceIds[i % sourceIds.length]
        const wrong = sourceIds[(i + 1) % sourceIds.length]
        return {
          id: 'answer-' + i, kind: 'answerable' as const, expectedIds: [expected],
          lexical: observations([i < 26 ? expected : wrong, i < 26 ? wrong : expected], 10),
          openviking: observations([i < 30 ? expected : wrong, i < 30 ? wrong : expected], 40),
        }
      }),
      ...Array.from({ length: 12 }, (_, i) => ({
        id: 'unsupported-' + i, kind: 'unsupported' as const, expectedIds: [],
        lexical: observations([], 10), openviking: observations([], 40),
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        id: 'foreign-' + i, kind: 'foreign_project' as const, expectedIds: [],
        lexical: observations([], 10), openviking: observations([], 40),
      })),
    ],
  }
}

describe('Atlas OpenViking offline source-quality gate', () => {
  it('replays the frozen October 15 receipt without private source bodies or questions', () => {
    expect(validateQualityEvaluation(fixture)).toBe(true)
    const result = evaluateOpenVikingQuality(fixture)
    expect(result.cohortId).toBe('legacy-five-source-2026-10-15')
    expect(result.lexical).toMatchObject({
      answerable: 20, unsupported: 4, foreignProject: 0,
      correctFirstSourceAllRuns: 16, correctSourceAnywhereAllRuns: 20,
      unsupportedCasesReturningAnySource: 4,
      measuredRuns: 72, medianMs: 12, p95Ms: 16,
    })
    expect(result.openviking).toMatchObject({
      answerable: 20, unsupported: 4,
      correctFirstSourceAllRuns: 11, correctSourceAnywhereAllRuns: 20,
      unsupportedCasesReturningAnySource: 4,
      measuredRuns: 72, medianMs: 36, p95Ms: 83,
    })
    expect(result.comparison.firstSourceDifference).toBe(-5)
    expect(result.comparison.firstSourceRateDifferencePctPoints).toBe(-25)
    expect(result.comparison.openvikingOverLexicalMedianLatencyRatio).toBe(3)
    expect(result.qualityEligibleForManualReview).toBe(false)
    expect(result.runtimeActivationAuthorized).toBe(false)
    expect(result.reasons).toContain('first_source_worse_than_lexical')
    expect(result.reasons).toContain('unsupported_queries_returned_sources')
    expect(result.reasons).toContain('independent_held_out_questions_required')
    expect(result.reasons).toContain('insufficient_foreign_project_tests')
    const raw = JSON.stringify(fixture)
    expect(raw).not.toMatch(/Omnira-Vault|omnira-selftest|mailto:|https?:\/\//)
  })

  it('can mark a separate, adequately labelled fictional cohort review-eligible, NEVER auto-enable', () => {
    const result = evaluateOpenVikingQuality(sample())
    expect(result.qualityEligibleForManualReview).toBe(true)
    expect(result.runtimeActivationAuthorized).toBe(false)
    expect(result.reasons).toEqual([])
    expect(result.lexical.correctFirstSourceAllRuns).toBe(26)
    expect(result.openviking.correctFirstSourceAllRuns).toBe(30)
    expect(result.openviking.correctSourceAnywhereAllRuns).toBe(32)
    expect(result.openviking.medianMs).toBe(40)
  })

  it.each([
    ['unapproved corpus', (p: QualityEvaluation) => { p.provenance.sourceApproved = false }, 'source_or_query_integrity_not_verified'],
    ['unfrozen questions', (p: QualityEvaluation) => { p.provenance.frozenQuestionsBeforeIndexing = false }, 'source_or_query_integrity_not_verified'],
    ['different originals', (p: QualityEvaluation) => { p.provenance.sameOriginalDocuments = false }, 'source_or_query_integrity_not_verified'],
    ['non-independent questions', (p: QualityEvaluation) => { p.provenance.independentlyAuthoredQuestions = false }, 'independent_held_out_questions_required'],
    ['previous tuning', (p: QualityEvaluation) => { p.provenance.heldOutFromTuning = false }, 'independent_held_out_questions_required'],
    ['unverified server version', (p: QualityEvaluation) => { p.provenance.currentOpenVikingVersionVerified = false }, 'current_openviking_protocol_unverified'],
    ['too few answerable', (p: QualityEvaluation) => { p.cases = p.cases.filter(x => x.kind !== 'answerable').concat(p.cases.filter(x => x.kind === 'answerable').slice(0, 20)) }, 'insufficient_answerable_questions'],
    ['too few negative', (p: QualityEvaluation) => { p.cases = p.cases.filter(x => x.kind !== 'unsupported').concat(p.cases.filter(x => x.kind === 'unsupported').slice(0, 4)) }, 'insufficient_unsupported_questions'],
    ['too few cross project', (p: QualityEvaluation) => { p.cases = p.cases.filter(x => x.kind !== 'foreign_project').concat(p.cases.filter(x => x.kind === 'foreign_project').slice(0, 2)) }, 'insufficient_foreign_project_tests'],
    ['false positive unsupported', (p: QualityEvaluation) => { const x=p.cases.find(x=>x.kind==='unsupported')!;x.openviking[0].ids=['doc-01'] }, 'unsupported_queries_returned_sources'],
    ['cross-project leak', (p: QualityEvaluation) => { const x=p.cases.find(x=>x.kind==='foreign_project')!;x.openviking[1].ids=['doc-01'] }, 'foreign_project_source_leak'],
    ['worse first source', (p: QualityEvaluation) => { for(const x of p.cases.filter(x=>x.kind==='answerable').slice(0, 12)) for(const run of x.openviking) run.ids=[p.sourceIds[(p.sourceIds.indexOf(x.expectedIds[0])+1)%8],x.expectedIds[0]] }, 'first_source_worse_than_lexical'],
    ['slower than deadline', (p: QualityEvaluation) => { for(const x of p.cases) for(const run of x.openviking) run.durationMs=1500 }, 'latency_above_current_budget'],
  ] as const)('blocks %s', (_description, mutate, reason) => {
    const cohort = sample()
    mutate(cohort)
    const result = evaluateOpenVikingQuality(cohort)
    expect(result.qualityEligibleForManualReview).toBe(false)
    expect(result.reasons).toContain(reason)
    expect(result.runtimeActivationAuthorized).toBe(false)
  })

  it('blocks source-count insufficiency even when every observed rank is correct', () => {
    const data = sample()
    data.sourceIds = data.sourceIds.slice(0, 4)
    for(const r of data.cases) {
      r.expectedIds = r.expectedIds.filter(id => data.sourceIds.includes(id))
      for(const run of [...r.lexical, ...r.openviking]) run.ids = run.ids.filter(id => data.sourceIds.includes(id))
    }
    // Invalid evidence must fail closed rather than silently redefining labels.
    expect(evaluateOpenVikingQuality(data).qualityEligibleForManualReview).toBe(false)
  })

  it.each([
    ['unknown source', (p: QualityEvaluation) => { p.cases[0].openviking[0].ids=['not-in-source-set'] }],
    ['duplicate case ID', (p: QualityEvaluation) => { p.cases[1].id=p.cases[0].id }],
    ['more than eight ranked hits', (p: QualityEvaluation) => { p.cases[0].openviking[0].ids=[...p.sourceIds,'ninth'] }],
    ['missing repetition', (p: QualityEvaluation) => { p.cases[0].openviking.pop() }],
    ['missing expected source', (p: QualityEvaluation) => { p.cases[0].expectedIds=[] }],
    ['negative expected source', (p: QualityEvaluation) => { const x=p.cases.find(x=>x.kind==='unsupported')!;x.expectedIds=['doc-01'] }],
    ['NaN latency', (p: QualityEvaluation) => { p.cases[0].openviking[0].durationMs=Number.NaN }],
  ] as const)('rejects invalid dataset: %s', (_label, mutate) => {
    const data = sample()
    mutate(data)
    expect(validateQualityEvaluation(data)).toBe(false)
    const result = evaluateOpenVikingQuality(data)
    expect(result.qualityEligibleForManualReview).toBe(false)
    expect(result.reasons).toEqual(['evaluation_invalid_or_incomplete'])
  })

  it('quality module does not import runtime, Notion, cost, M4, or model APIs', () => {
    const source = readFileSync(join(process.cwd(), 'lib/atlas/openviking/quality-evaluation.ts'), 'utf8')
    expect(source).not.toMatch(/from ['"]@\/lib\/atlas\/memory|from ['"]@\/lib\/cost|fetch\(|supabase|process\.env|writeFile/)
    const chat = readFileSync(join(process.cwd(), 'app/api/chat/route.ts'), 'utf8')
    expect(chat).not.toContain('openviking/quality-evaluation')
    expect(chat).not.toContain('openviking/retrieve')
  })
})
