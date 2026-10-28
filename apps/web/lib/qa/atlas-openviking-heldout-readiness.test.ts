import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildKnowledgeSnapshot } from '@/lib/atlas/knowledge/projection/snapshot'
import { parseCorpus, type PublishedCorpus } from '@/lib/atlas/openviking/corpus'
import {
  HELDOUT_PLAN_SCHEMA, checkHeldoutReadiness, heldoutPlanDigest,
  type HeldoutPlan,
} from '@/lib/atlas/openviking/heldout-readiness'

const PROJECT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

function publication(count = 8): PublishedCorpus {
  const snapshot = buildKnowledgeSnapshot(Array.from({ length: count }, (_, i) => ({
    path: '70 References/synthetic-' + (i + 1) + '.md',
    title: 'Synthetic document ' + (i + 1),
    type: 'reference' as const,
    classification: 'internal' as const,
    scope: { kind: 'project' as const, projectId: PROJECT },
    sourceOfTruth: 'vault' as const,
    content: '# Fictional source\nSynthetic example number ' + (i + 1),
  })))
  const corpus = parseCorpus({
    projectId: PROJECT, projectSlug: 'omnira-selftest',
    manifest: snapshot.manifest, documentsJsonl: snapshot.documentsJsonl,
  })
  if (!corpus) throw new Error('Test fixture was not a valid snapshot')
  return corpus
}

function plan(corpus: PublishedCorpus = publication()): HeldoutPlan {
  const ids = corpus.documents.map(doc => doc.id)
  const q = Array.from({ length: 30 }, (_, i) => ({
    id: 'answer-' + String(i + 1).padStart(2, '0'),
    kind: 'answerable' as const,
    question: 'Vad står i den syntetiska källan för fråga nummer ' + (i + 1) + '?',
    expectedIds: [ids[i % ids.length]],
  }))
  const n = Array.from({ length: 10 }, (_, i) => ({
    id: 'unsupported-' + String(i + 1).padStart(2, '0'),
    kind: 'unsupported' as const,
    question: 'Vad står om ett okänt ämne ' + (i + 1) + ' som saknar källa?',
    expectedIds: [],
  }))
  const foreign = Array.from({ length: 8 }, (_, i) => ({
    id: 'foreign-' + String(i + 1).padStart(2, '0'),
    kind: 'foreign_project' as const,
    question: 'Vilka fakta hör enbart till projekt B fall ' + (i + 1) + '?',
    expectedIds: [],
  }))
  const item: HeldoutPlan = {
    schemaVersion: HELDOUT_PLAN_SCHEMA,
    cohortId: 'synthetic-private-cohort-20261028',
    projectId: corpus.projectId, projectSlug: corpus.projectSlug,
    snapshotId: corpus.snapshotId, sourceIds: ids,
    attestations: {
      ownerReviewedSourceApproval: true, independentQuestionAuthor: true,
      heldOutFromTuning: true, expectedSourcesReviewed: true,
      negativeScopeLabelsReviewed: true,
    },
    questions: [...q, ...n, ...foreign],
    lock: { digest: '', lockedBeforeSearch: true },
  }
  item.lock.digest = heldoutPlanDigest(item)!
  return item
}
const reseal = (item: HeldoutPlan) => {
  item.lock.digest = heldoutPlanDigest(item)!
  return item
}
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

describe('Private OpenViking independent held-out cohort preflight', () => {
  it('accepts a complete fictional, labelled, exact-project snapshot only for operator CAPTURE review', () => {
    const corpus = publication()
    const item = plan(corpus)
    const report = checkHeldoutReadiness(item, corpus)
    expect(report).toMatchObject({
      readyForOperatorCaptureReview: true,
      runtimeActivationAuthorized: false,
      reasonCodes: [],
      counts: {
        sourceDocuments: 8, answerable: 30, unsupported: 10,
        foreignProject: 8, duplicateQuestions: 0, invalidQuestions: 0,
      },
    })
    expect(report.expectedDigest).toBe(item.lock.digest)
    expect(report.expectedDigest).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(report)).not.toContain('Vilka fakta')
  })

  it('blocks the real readiness gap: only five approved project documents', () => {
    const corpus = publication(5)
    const report = checkHeldoutReadiness(plan(corpus), corpus)
    expect(report.readyForOperatorCaptureReview).toBe(false)
    expect(report.counts.sourceDocuments).toBe(5)
    expect(report.reasonCodes).toContain('insufficient_approved_project_sources')
  })

  it('refuses a platform / mixed source regardless of other attestations', () => {
    const corpus = publication()
    const input = plan(corpus)
    input.projectId = OTHER
    reseal(input)
    const result = checkHeldoutReadiness(input, corpus)
    expect(result.reasonCodes).toContain('snapshot_scope_mismatch')
    expect(result.runtimeActivationAuthorized).toBe(false)
  })

  it('refuses stale snapshot hashes after even a single changed source', () => {
    const old = publication()
    const newSnapshot = buildKnowledgeSnapshot(Array.from({ length: 8 }, (_, i) => ({
      path: '70 References/synthetic-' + (i + 1) + '.md',
      title: 'Synthetic document ' + (i + 1),
      type: 'reference' as const, classification: 'internal' as const,
      scope: { kind: 'project' as const, projectId: PROJECT },
      sourceOfTruth: 'vault' as const, content: '# Changed source ' + (i + 1),
    })))
    const changed = parseCorpus({
      projectId: PROJECT, projectSlug: old.projectSlug,
      manifest: newSnapshot.manifest, documentsJsonl: newSnapshot.documentsJsonl,
    })!
    expect(checkHeldoutReadiness(plan(old), changed).reasonCodes)
      .toContain('snapshot_scope_mismatch')
  })

  it('requires the exact same source-ID set, never a subset or extra document', () => {
    const corpus = publication()
    const item = plan(corpus)
    item.sourceIds.pop()
    reseal(item)
    expect(checkHeldoutReadiness(item, corpus).reasonCodes).toContain('source_set_mismatch')
  })

  it('needs validated source evidence, not merely a self-asserted approval', () => {
    const input = plan()
    expect(checkHeldoutReadiness(input, null).reasonCodes)
      .toContain('validated_corpus_missing')
  })

  it.each([
    ['owner', 'ownerReviewedSourceApproval', 'source_approval_requires_owner_review'],
    ['independent', 'independentQuestionAuthor', 'independent_held_out_questions_not_attested'],
    ['held-out', 'heldOutFromTuning', 'independent_held_out_questions_not_attested'],
    ['labels', 'expectedSourcesReviewed', 'answer_source_labels_not_reviewed'],
    ['negative', 'negativeScopeLabelsReviewed', 'negative_scope_labels_not_reviewed'],
  ] as const)('blocks missing %s declaration without inferring approval', (_title, key, reason) => {
    const item = plan()
    item.attestations[key] = false
    reseal(item)
    expect(checkHeldoutReadiness(item, publication()).reasonCodes).toContain(reason)
  })

  it('detects an edited locked question without printing source text', () => {
    const item = plan()
    const before = item.lock.digest
    item.questions[0].question = 'En efterhandsändrad sökfråga från ett annat ämne?'
    const report = checkHeldoutReadiness(item, publication())
    expect(report.expectedDigest).not.toBe(before)
    expect(report.reasonCodes).toContain('question_set_not_immutably_locked')
    expect(JSON.stringify(report)).not.toContain('efterhandsändrad')
  })

  it('a digest alone cannot stand in for pre-search locking', () => {
    const item = plan()
    item.lock.lockedBeforeSearch = false
    expect(checkHeldoutReadiness(item, publication()).reasonCodes)
      .toContain('question_set_not_immutably_locked')
  })

  it('blocks duplicated questions even when IDs are different', () => {
    const item = plan()
    item.questions[1].question = '  ' + item.questions[0].question.toUpperCase() + '  '
    reseal(item)
    expect(checkHeldoutReadiness(item, publication()).reasonCodes).toContain('duplicate_questions')
  })

  it('rejects unexpected IDs and invalid expected-source labels', () => {
    const item = plan()
    item.questions[0].expectedIds = ['fictional-source-not-published']
    reseal(item)
    expect(checkHeldoutReadiness(item, publication()).reasonCodes)
      .toContain('question_or_source_label_invalid')
  })

  it('rejects unsupported questions with a labelled source', () => {
    const item = plan()
    item.questions[30].expectedIds = [item.sourceIds[0]]
    reseal(item)
    expect(checkHeldoutReadiness(item, publication()).reasonCodes)
      .toContain('question_or_source_label_invalid')
  })

  it('rejects unexpected credential-shaped text in a private question', () => {
    const item = plan()
    item.questions[0].question = 'Är token ' + 'sk-' + 'X'.repeat(28) + ' tillåten?'
    reseal(item)
    const report = checkHeldoutReadiness(item, publication())
    expect(report.reasonCodes).toContain('question_or_source_label_invalid')
    expect(JSON.stringify(report)).not.toContain('sk-')
  })

  it('requires all answerable, unsupported and foreign project cohorts', () => {
    const item = plan()
    item.questions = item.questions.filter(q => q.kind === 'answerable').slice(0, 22)
    reseal(item)
    const result = checkHeldoutReadiness(item, publication())
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      'too_few_answerable_questions', 'too_few_unsupported_questions',
      'too_few_foreign_project_cases',
    ]))
  })

  it('fails closed on a malformed extra field rather than silently ignoring it', () => {
    const item = { ...plan(), unexpectedKey: 'an unreviewed operator bypass' }
    const result = checkHeldoutReadiness(item, publication())
    expect(result).toMatchObject({
      readyForOperatorCaptureReview: false,
      runtimeActivationAuthorized: false,
      expectedDigest: null, reasonCodes: ['plan_schema_invalid'],
    })
  })

  it('keeps private question bodies out of the public runtime and output paths', () => {
    const check = readFileSync(join(process.cwd(), 'scripts/openviking-heldout-readiness.ts'), 'utf8')
    const chat = readFileSync(join(process.cwd(), 'app/api/chat/route.ts'), 'utf8')
    expect(check).not.toMatch(/console\.log\(\s*raw|console\.log\(\s*input/)
    expect(chat).not.toContain('openviking/heldout-readiness')
    expect(chat).not.toContain('scripts/openviking-heldout-readiness')
    expect(check).not.toMatch(/fetch\(|\.post\(|writeFileSync|execSync|createAdminClient/)
  })

  it('never returns source text, canonical paths, personal information, keys or execution authority', () => {
    const item = clone(plan())
    item.questions[0].question = 'Vilken syntetisk sekretessregel gäller?'
    reseal(item)
    const result = checkHeldoutReadiness(item, publication())
    const rendered = JSON.stringify(result)
    expect(rendered).not.toMatch(/syntetisk sekretessregel|70 References|Owner-approved|Bearer |sk-/)
    expect(result.runtimeActivationAuthorized).toBe(false)
  })
})
