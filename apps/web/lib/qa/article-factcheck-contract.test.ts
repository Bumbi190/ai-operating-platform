/**
 * Website-article FactCheck v1 — deterministic contract.
 *
 * The reviewer model is untrusted: these tests prove that fabricated evidence,
 * misquoted sentences and contradictions are caught in code, and that the
 * publication gate binds a passing report to one exact body.
 */

import { describe, expect, it } from 'vitest'
import {
  assessArticleFactCheck, claimsNeedingRevision, factCheckAllowsPublication, normalizeForMatch, quoteFoundIn, sha256,
} from '@/lib/article/factcheck/contract'
import { publicationGate } from '@/lib/article/factcheck/gate'
import type { SourceSnapshot } from '@/lib/article/factcheck/types'

const S1: SourceSnapshot = {
  id: 's1', url: 'https://www.theverge.com/a', host: 'theverge.com', publisherGroup: 'voxmedia',
  kind: 'originating_report', retrievedAt: '2026-10-28T08:00:00.000Z', title: 'Acme ships Model X',
  text: 'Acme released Model X on Tuesday. The company said the model costs $2 per million input tokens. ' +
    'Acme did not disclose the training data. '.repeat(3),
}
const S2: SourceSnapshot = {
  id: 's2', url: 'https://acme.example/blog', host: 'acme.example', publisherGroup: 'acme',
  kind: 'primary', retrievedAt: '2026-10-28T08:00:00.000Z', title: 'Introducing Model X',
  text: 'Today we are releasing Model X, priced at $2 per million input tokens and $8 per million output tokens.',
}

const BODY = [
  '## Acme ships Model X',
  'According to The Verge, Acme released Model X on Tuesday.',
  'The model costs $2 per million input tokens.',
  'Acme may expand access later this year.',
].join('\n\n')

const supported = (sentence: string, quotes: Array<[string, string]>, importance = 'central') => ({
  sentence, claim: sentence, importance, verdict: 'supported', note: '',
  evidence: quotes.map(([sourceId, exactQuote]) => ({ sourceId, exactQuote })),
})

const NOW = new Date('2026-10-28T09:00:00.000Z')
const assess = (claims: unknown, sources = [S1, S2], body = BODY) =>
  assessArticleFactCheck({ body, sources, modelClaims: claims, reviewerModel: 'm', round: 0, now: NOW })

describe('normalisation and quote matching', () => {
  it('matches across markdown, smart quotes and whitespace', () => {
    expect(normalizeForMatch('**Acme**  said “hi” — ok')).toBe('acme said "hi" - ok')
    expect(quoteFoundIn(S1.text, 'Acme   released Model X on Tuesday')).toBe(true)
  })
  it('rejects quotes that are too short or absent', () => {
    expect(quoteFoundIn(S1.text, 'Acme')).toBe(false)
    expect(quoteFoundIn(S1.text, 'Acme released Model Y on Tuesday')).toBe(false)
  })
})

describe('assessArticleFactCheck', () => {
  it('passes when every central claim carries verified evidence', () => {
    const r = assess([
      supported('According to The Verge, Acme released Model X on Tuesday.', [['s1', 'Acme released Model X on Tuesday']]),
      supported('The model costs $2 per million input tokens.', [['s1', 'costs $2 per million input tokens'], ['s2', 'priced at $2 per million input tokens']]),
    ])
    expect(r.verdict).toBe('passed')
    expect(r.bodySha256).toBe(sha256(BODY))
    expect(r.counts.supported).toBe(2)
    expect([...r.claims[1].publisherGroups].sort()).toEqual(['acme', 'voxmedia'])
    expect(r.claims[1].hasPrimarySource).toBe(true)
    // single-publisher central claim is reported, but not blocking
    expect(r.reasons).toContain('info:central_claims_single_publisher:1')
  })

  it('downgrades "supported" with a fabricated quote to unsupported → needs_revision', () => {
    const r = assess([
      supported('The model costs $2 per million input tokens.', [['s1', 'Model X costs two dollars and is open source']]),
    ])
    expect(r.claims[0].modelVerdict).toBe('supported')
    expect(r.claims[0].verdict).toBe('unsupported')
    expect(r.claims[0].rejectedEvidence).toHaveLength(1)
    expect(r.claims[0].downgrades).toContain('supported_without_verified_evidence')
    expect(r.verdict).toBe('needs_revision')
  })

  it('rejects evidence that cites a source id that does not exist', () => {
    const r = assess([supported('The model costs $2 per million input tokens.', [['s9', 'costs $2 per million input tokens']])])
    expect(r.claims[0].verdict).toBe('unsupported')
  })

  it('a verified contradiction blocks publication until revised', () => {
    const r = assess([
      supported('According to The Verge, Acme released Model X on Tuesday.', [['s1', 'Acme released Model X on Tuesday']]),
      { sentence: 'The model costs $2 per million input tokens.', claim: 'output price', importance: 'supporting',
        verdict: 'contradicted', note: 'conflicts', evidence: [{ sourceId: 's2', exactQuote: '$8 per million output tokens' }] },
    ])
    expect(r.verdict).toBe('needs_revision')
    expect(claimsNeedingRevision(r).map((c) => c.id)).toEqual(['c2'])
  })

  it('an unverified contradiction becomes uncertain (still not publishable when central)', () => {
    const r = assess([{ sentence: 'The model costs $2 per million input tokens.', claim: 'x', importance: 'central',
      verdict: 'contradicted', note: '', evidence: [{ sourceId: 's1', exactQuote: 'made-up contradicting text here' }] }])
    expect(r.claims[0].verdict).toBe('uncertain')
    expect(r.verdict).toBe('needs_revision')
  })

  it('accepts an uncertain SUPPORTING claim only when the sentence is visibly qualified', () => {
    const base = supported('According to The Verge, Acme released Model X on Tuesday.', [['s1', 'Acme released Model X on Tuesday']])
    const qualified = { sentence: 'Acme may expand access later this year.', claim: 'x', importance: 'supporting', verdict: 'uncertain', note: '', evidence: [] }
    expect(assess([base, qualified]).verdict).toBe('passed')
    const bodyFlat = BODY.replace('Acme may expand access later this year.', 'Acme will expand access later this year.')
    const flat = { ...qualified, sentence: 'Acme will expand access later this year.' }
    expect(assess([base, flat], [S1, S2], bodyFlat).verdict).toBe('needs_revision')
  })

  it('never accepts an uncertain CENTRAL claim, qualified or not', () => {
    const r = assess([{ sentence: 'Acme may expand access later this year.', claim: 'x', importance: 'central', verdict: 'uncertain', note: '', evidence: [] }])
    expect(r.verdict).toBe('needs_revision')
  })

  it('blocks when the review quotes a sentence that is not in the body', () => {
    const r = assess([supported('Acme raised $1bn in funding.', [['s1', 'Acme released Model X on Tuesday']])])
    expect(r.verdict).toBe('blocked')
    expect(r.reasons).toEqual(['review_sentence_not_in_body'])
  })

  it.each([
    ['no sources', [], [supported('The model costs $2 per million input tokens.', [])], 'no_usable_sources'],
    ['reviewer failed', [S1], null, 'invalid_review_output'],
    ['malformed claims', [S1], [{ sentence: 1 }], 'invalid_review_output'],
    ['no claims', [S1], [], 'no_claims_extracted'],
  ])('blocks: %s', (_label, sources, claims, reason) => {
    const r = assessArticleFactCheck({ body: BODY, sources: sources as SourceSnapshot[], modelClaims: claims, reviewerModel: null, round: 0, now: NOW })
    expect(r.verdict).toBe('blocked')
    expect(r.reasons).toEqual([reason])
  })

  it('blocks when only supporting claims were extracted', () => {
    const r = assess([supported('The model costs $2 per million input tokens.', [['s1', 'costs $2 per million input tokens']], 'supporting')])
    expect(r.reasons).toEqual(['no_central_claims'])
  })

  it('does not store source text in the report (snapshots stay in the job checkpoint)', () => {
    const r = assess([supported('The model costs $2 per million input tokens.', [['s1', 'costs $2 per million input tokens']])])
    expect(r.sources[0]).not.toHaveProperty('text')
    expect(r.sources[0].chars).toBe(S1.text.length)
  })
})

describe('publication gate', () => {
  const passed = assess([supported('The model costs $2 per million input tokens.', [['s1', 'costs $2 per million input tokens']])])

  it('allows only a passed report computed on exactly this body', () => {
    expect(factCheckAllowsPublication(passed, BODY)).toEqual({ ok: true })
    expect(factCheckAllowsPublication(passed, BODY + ' Edited.')).toEqual({ ok: false, reason: 'factcheck_body_mismatch' })
    expect(factCheckAllowsPublication({ ...passed, verdict: 'blocked' }, BODY)).toEqual({ ok: false, reason: 'factcheck_blocked' })
    expect(factCheckAllowsPublication({ ...passed, verdict: 'needs_revision' }, BODY).ok).toBe(false)
    expect(factCheckAllowsPublication(null, BODY)).toEqual({ ok: false, reason: 'factcheck_missing' })
    expect(factCheckAllowsPublication({ ...passed, version: 2 }, BODY).ok).toBe(false)
  })

  it('requires article QA AND fact-check for marked rows; QA alone is never enough', () => {
    const row = { payload: { body: BODY }, qa: { pass: true }, meta: { factcheck_required: true, factcheck: passed } }
    expect(publicationGate(row)).toEqual({ ok: true })
    expect(publicationGate({ ...row, qa: { pass: false } })).toEqual({ ok: false, reason: 'article_qa_not_passed' })
    expect(publicationGate({ ...row, meta: { factcheck_required: true } })).toEqual({ ok: false, reason: 'factcheck_missing' })
    expect(publicationGate({ ...row, payload: {} })).toEqual({ ok: false, reason: 'payload_body_missing' })
  })

  it('leaves rows from the existing generate paths unchanged', () => {
    expect(publicationGate({ payload: { body: 'x' }, qa: { pass: false }, meta: { model: 'm' } })).toEqual({ ok: true })
    expect(publicationGate({ payload: null, qa: null, meta: null })).toEqual({ ok: true })
  })
})
