/**
 * Website-article FactCheck — deterministic contract (report v2).
 *
 * The reviewer model is untrusted: these tests prove that fabricated evidence,
 * misquoted sentences and contradictions are caught in code, that the headline
 * and lede are fact-checked like the body, and that the publication gate binds
 * a passing report to one exact headline + lede + body.
 */

import { describe, expect, it } from 'vitest'
import {
  assessArticleFactCheck, bodySentences, claimsNeedingRevision, factCheckAllowsPublication, isCheckableSentence,
  normalizeForMatch, quoteFoundIn, sha256, articleContentSha256,
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

const TITLE = 'Acme releases Model X'
const SUMMARY = 'Acme released Model X on Tuesday and priced it at $2 per million input tokens.'
const TEXT = { title: TITLE, summary: SUMMARY, body: BODY }

const supported = (sentence: string, quotes: Array<[string, string]>, importance = 'central') => ({
  sentence, claim: sentence, importance, verdict: 'supported', note: '',
  evidence: quotes.map(([sourceId, exactQuote]) => ({ sourceId, exactQuote })),
})

const NOW = new Date('2026-10-28T09:00:00.000Z')
/** Covers every checkable sentence in BODY (the third sentence carries no fact signal). */
const RELEASE = supported('According to The Verge, Acme released Model X on Tuesday.', [['s1', 'Acme released Model X on Tuesday']])
const COSTS = supported('The model costs $2 per million input tokens.', [['s1', 'costs $2 per million input tokens']])
/** The headline and the lede, verified. Always required: they are published with the body. */
const HEADLINE = supported(TITLE, [['s2', 'Today we are releasing Model X']])
const LEDE = supported(SUMMARY, [['s1', 'Acme released Model X on Tuesday'], ['s2', 'priced at $2 per million input tokens']])
const HEAD = [HEADLINE, LEDE]
const assess = (claims: unknown, sources = [S1, S2], body = BODY, title = TITLE, summary: string | null = SUMMARY) =>
  assessArticleFactCheck({ title, summary, body, sources, modelClaims: claims, reviewerModel: 'm', round: 0, now: NOW })

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
      ...HEAD,
    ])
    expect(r.verdict).toBe('passed')
    expect(r.version).toBe(2)
    expect(r.fieldSha256).toEqual({ title: sha256(TITLE), summary: sha256(SUMMARY), body: sha256(BODY) })
    expect(r.contentSha256).toBe(articleContentSha256(TEXT))
    expect(r.claims.map((c) => c.field)).toEqual(['body', 'body', 'title', 'summary'])
    expect(r.counts.supported).toBe(4)
    expect([...r.claims[1].publisherGroups].sort()).toEqual(['acme', 'voxmedia'])
    expect(r.claims[1].hasPrimarySource).toBe(true)
    // single-publisher central claims (body c1 and the headline) are reported, but not blocking
    expect(r.reasons).toContain('info:central_claims_single_publisher:2')
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
      ...HEAD,
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
    const qualified = { sentence: 'Acme may expand access later this year.', claim: 'x', importance: 'supporting', verdict: 'uncertain', note: '', evidence: [] }
    expect(assess([RELEASE, COSTS, qualified, ...HEAD]).verdict).toBe('passed')
    const bodyFlat = BODY.replace('Acme may expand access later this year.', 'Acme will expand access later this year.')
    const flat = { ...qualified, sentence: 'Acme will expand access later this year.' }
    const flatReport = assess([RELEASE, COSTS, flat, ...HEAD], [S1, S2], bodyFlat)
    expect(flatReport.verdict).toBe('needs_revision')
    expect(flatReport.reasons).toEqual(['c3:supporting:uncertain', 'info:central_claims_single_publisher:3'])
  })

  it('never accepts an uncertain CENTRAL claim, qualified or not', () => {
    const r = assess([{ sentence: 'Acme may expand access later this year.', claim: 'x', importance: 'central', verdict: 'uncertain', note: '', evidence: [] }])
    expect(r.verdict).toBe('needs_revision')
  })

  it('blocks when the review quotes a sentence that is not in the article', () => {
    const r = assess([supported('Acme raised $1bn in funding.', [['s1', 'Acme released Model X on Tuesday']]), ...HEAD])
    expect(r.verdict).toBe('blocked')
    expect(r.reasons).toEqual(['review_sentence_not_in_article'])
  })

  it('a reviewed sentence may not straddle two fields (lede end + body start)', () => {
    const straddle = supported('per million input tokens. Acme ships Model X', [['s1', 'costs $2 per million input tokens']])
    expect(assess([RELEASE, COSTS, ...HEAD, straddle]).reasons).toEqual(['review_sentence_not_in_article'])
  })

  it.each([
    ['no sources', [], [supported('The model costs $2 per million input tokens.', [])], 'no_usable_sources'],
    ['reviewer failed', [S1], null, 'invalid_review_output'],
    ['malformed claims', [S1], [{ sentence: 1 }], 'invalid_review_output'],
    ['no claims', [S1], [], 'no_claims_extracted'],
  ])('blocks: %s', (_label, sources, claims, reason) => {
    const r = assessArticleFactCheck({ ...TEXT, sources: sources as SourceSnapshot[], modelClaims: claims, reviewerModel: null, round: 0, now: NOW })
    expect(r.verdict).toBe('blocked')
    expect(r.reasons).toEqual([reason])
  })

  it('blocks an empty headline before any claim is judged', () => {
    expect(assess([RELEASE, COSTS, ...HEAD], [S1, S2], BODY, '  ').reasons).toEqual(['empty_title'])
  })

  it('does not store source text in the report (snapshots stay in the job checkpoint)', () => {
    const r = assess([supported('The model costs $2 per million input tokens.', [['s1', 'costs $2 per million input tokens']])])
    expect(r.sources[0]).not.toHaveProperty('text')
    expect(r.sources[0].chars).toBe(S1.text.length)
  })
})

describe('coverage: the reviewer cannot pass an article by omitting a claim', () => {
  const OMITTED = 'Acme raised $5 billion from investors last week.'
  const bodyWithNewClaim = `${BODY}\n\n${OMITTED}`

  it('a new central claim the reviewer leaves out is never passed', () => {
    // The reviewer verifies everything else perfectly and simply does not mention the new claim.
    const r = assess([RELEASE, COSTS, ...HEAD], [S1, S2], bodyWithNewClaim)
    expect(r.verdict).not.toBe('passed')
    expect(r.verdict).toBe('needs_revision')
    const omitted = r.claims.find((c) => c.sentence === OMITTED)!
    expect(omitted).toMatchObject({ importance: 'central', verdict: 'unsupported', downgrades: ['omitted_by_reviewer'] })
    expect(r.reasons).toContain('omitted_checkable_sentences:1')
    expect(claimsNeedingRevision(r).map((c) => c.sentence)).toEqual([OMITTED])
    // …and the report cannot authorise publication of that body.
    expect(factCheckAllowsPublication(r, { ...TEXT, body: bodyWithNewClaim })).toEqual({ ok: false, reason: 'factcheck_needs_revision' })
    expect(publicationGate({ payload: { ...TEXT, body: bodyWithNewClaim }, qa: { pass: true }, meta: { factcheck_required: true, factcheck: r } }).ok).toBe(false)
  })

  it('listing only a harmless FRAGMENT of the sentence does not cover it', () => {
    const fragment = { sentence: 'Acme raised', claim: 'Acme raised money', importance: 'supporting', verdict: 'uncertain', note: '', evidence: [] }
    const r = assess([RELEASE, COSTS, fragment, ...HEAD], [S1, S2], bodyWithNewClaim)
    expect(r.verdict).not.toBe('passed')
    expect(r.claims.some((c) => c.sentence === OMITTED && c.downgrades.includes('omitted_by_reviewer'))).toBe(true)
  })

  it('the same claim, when listed and verified, passes — coverage is the only difference', () => {
    const s3: SourceSnapshot = { ...S2, id: 's3', publisherGroup: 'reuters', kind: 'independent_reporting', host: 'reuters.com',
      url: 'https://www.reuters.com/x', text: 'Acme raised $5 billion from investors last week, two people familiar said.' }
    const listed = supported(OMITTED, [['s3', 'Acme raised $5 billion from investors last week']])
    expect(assess([RELEASE, COSTS, listed, ...HEAD], [S1, S2, s3], bodyWithNewClaim).verdict).toBe('passed')
  })

  it('omission inside a compound paragraph and a bullet list is still detected', () => {
    const body = `${BODY}\n\n- The deal values Acme at $60 billion. Analysts called it aggressive.`
    const r = assess([RELEASE, COSTS, ...HEAD], [S1, S2], body)
    expect(r.claims.filter((c) => c.downgrades.includes('omitted_by_reviewer')).map((c) => c.sentence))
      .toEqual(['The deal values Acme at $60 billion.'])
  })

  it('pure analysis without fact signals does not have to be listed', () => {
    expect(bodySentences('## Why it matters\n\nThis suggests rivals will respond.')).toEqual(['This suggests rivals will respond.'])
    expect(isCheckableSentence('This suggests rivals will respond.')).toBe(false)
    expect(isCheckableSentence(OMITTED)).toBe(true)
  })
})

describe('headline and lede are fact-checked like the body', () => {
  const FALSE_TITLE = 'Acme launches Model Y today'
  const FALSE_LEDE = 'Acme raised $5 billion and released Model X on Tuesday.'

  it('a false headline the reviewer leaves out blocks publication, even with a fully verified body', () => {
    const r = assess([RELEASE, COSTS, LEDE], [S1, S2], BODY, FALSE_TITLE)
    expect(r.verdict).toBe('needs_revision')
    expect(r.claims.find((c) => c.sentence === FALSE_TITLE)).toMatchObject({
      field: 'title', importance: 'central', verdict: 'unsupported', downgrades: ['omitted_by_reviewer'],
    })
    expect(r.reasons).toContain('title_not_verified')
    expect(claimsNeedingRevision(r).map((c) => c.field)).toEqual(['title'])
    const text = { ...TEXT, title: FALSE_TITLE }
    expect(factCheckAllowsPublication(r, text)).toEqual({ ok: false, reason: 'factcheck_needs_revision' })
    expect(publicationGate({ payload: text, qa: { pass: true }, meta: { factcheck_required: true, factcheck: r } }).ok).toBe(false)
  })

  it('a false headline the reviewer calls "supported" with a fabricated quote is downgraded and blocks', () => {
    const r = assess([RELEASE, COSTS, LEDE, supported(FALSE_TITLE, [['s2', 'Today we are launching Model Y']])], [S1, S2], BODY, FALSE_TITLE)
    expect(r.claims.find((c) => c.field === 'title')).toMatchObject({ modelVerdict: 'supported', verdict: 'unsupported' })
    expect(r.verdict).toBe('needs_revision')
  })

  it('a headline contradicted by a verified quote blocks', () => {
    const contradicted = { sentence: FALSE_TITLE, claim: 'Model Y launch', importance: 'central', verdict: 'contradicted', note: '',
      evidence: [{ sourceId: 's2', exactQuote: 'Today we are releasing Model X' }] }
    const r = assess([RELEASE, COSTS, LEDE, contradicted], [S1, S2], BODY, FALSE_TITLE)
    expect(r.verdict).toBe('needs_revision')
    expect(r.reasons).toContain('title_not_verified')
  })

  it('a false lede blocks, even when the reviewer lists only the true part and the body is verified', () => {
    // Listing a fragment of the lede does not cover the whole lede sentence.
    const fragment = supported('released Model X on Tuesday', [['s1', 'Acme released Model X on Tuesday']])
    const r = assess([RELEASE, COSTS, HEADLINE, fragment], [S1, S2], BODY, TITLE, FALSE_LEDE)
    expect(r.verdict).toBe('needs_revision')
    expect(r.claims.find((c) => c.sentence === FALSE_LEDE)).toMatchObject({ field: 'summary', verdict: 'unsupported' })
    expect(r.reasons).toContain('summary_not_verified')
    expect(publicationGate({ payload: { ...TEXT, summary: FALSE_LEDE }, qa: { pass: true },
      meta: { factcheck_required: true, factcheck: r } }).ok).toBe(false)
  })

  it('a headline listed as "supporting" is forced central, so a qualified-but-uncertain headline cannot pass', () => {
    const title = 'Acme may launch Model Y'
    const soft = { sentence: title, claim: 'x', importance: 'supporting', verdict: 'uncertain', note: '', evidence: [] }
    const r = assess([RELEASE, COSTS, LEDE, soft], [S1, S2], BODY, title)
    expect(r.claims.find((c) => c.field === 'title')).toMatchObject({ importance: 'central', downgrades: ['title_claim_is_central'] })
    expect(r.verdict).toBe('needs_revision')
  })

  it('every lede sentence is required, with or without fact signals', () => {
    const lede = 'Acme released Model X on Tuesday. It is the company\'s most ambitious bet.'
    const r = assess([RELEASE, COSTS, HEADLINE, supported('Acme released Model X on Tuesday.', [['s1', 'Acme released Model X on Tuesday']])],
      [S1, S2], BODY, TITLE, lede)
    expect(r.claims.filter((c) => c.downgrades.includes('omitted_by_reviewer')).map((c) => c.sentence))
      .toEqual(["It is the company's most ambitious bet."])
  })

  it('an empty lede has nothing to check and does not block on its own', () => {
    expect(assess([RELEASE, COSTS, HEADLINE], [S1, S2], BODY, TITLE, null).verdict).toBe('passed')
  })
})

describe('publication gate', () => {
  const passed = assess([RELEASE, COSTS, ...HEAD])
  it('fixture sanity: the shared report passed', () => expect(passed.verdict).toBe('passed'))

  it('allows only a passed report computed on exactly this headline, lede and body', () => {
    expect(factCheckAllowsPublication(passed, TEXT)).toEqual({ ok: true })
    expect(factCheckAllowsPublication(passed, { ...TEXT, body: BODY + ' Edited.' })).toEqual({ ok: false, reason: 'factcheck_body_mismatch' })
    expect(factCheckAllowsPublication({ ...passed, verdict: 'blocked' }, TEXT)).toEqual({ ok: false, reason: 'factcheck_blocked' })
    expect(factCheckAllowsPublication({ ...passed, verdict: 'needs_revision' }, TEXT).ok).toBe(false)
    expect(factCheckAllowsPublication(null, TEXT)).toEqual({ ok: false, reason: 'factcheck_missing' })
  })

  it('a version-1 (body-only) report is refused, even when its body hash matches', () => {
    const v1 = { version: 1, verdict: 'passed', bodySha256: sha256(BODY), reasons: [], claims: [], sources: [] }
    expect(factCheckAllowsPublication(v1, TEXT)).toEqual({ ok: false, reason: 'factcheck_unknown_version' })
  })

  it('changing ONLY the headline after a passed check refuses publication', () => {
    expect(factCheckAllowsPublication(passed, { ...TEXT, title: 'Acme launches Model Y today' }))
      .toEqual({ ok: false, reason: 'factcheck_title_mismatch' })
    // Whitespace-only edits are edits too: the gate binds exact bytes.
    expect(factCheckAllowsPublication(passed, { ...TEXT, title: TITLE + ' ' }).ok).toBe(false)
  })

  it('changing ONLY the lede after a passed check refuses publication', () => {
    expect(factCheckAllowsPublication(passed, { ...TEXT, summary: 'Acme raised $5 billion.' }))
      .toEqual({ ok: false, reason: 'factcheck_summary_mismatch' })
    expect(factCheckAllowsPublication(passed, { ...TEXT, summary: null })).toEqual({ ok: false, reason: 'factcheck_summary_mismatch' })
  })

  it('a forged per-field hash still fails on the content hash (both are bound)', () => {
    const edited = { ...TEXT, title: 'Acme launches Model Y today' }
    const forged = { ...passed, fieldSha256: { ...passed.fieldSha256, title: sha256(edited.title) } }
    expect(factCheckAllowsPublication(forged, edited)).toEqual({ ok: false, reason: 'factcheck_content_mismatch' })
  })

  it('the edited version becomes publishable only after it has itself been fact-checked', () => {
    const newTitle = 'Acme releases Model X at $2 per million input tokens'
    const recheck = assess([RELEASE, COSTS, LEDE, supported(newTitle, [['s2', 'Today we are releasing Model X'], ['s2', 'priced at $2 per million input tokens']])],
      [S1, S2], BODY, newTitle)
    expect(recheck.verdict).toBe('passed')
    expect(factCheckAllowsPublication(recheck, { ...TEXT, title: newTitle })).toEqual({ ok: true })
    // …and the new report does not authorise the old headline.
    expect(factCheckAllowsPublication(recheck, TEXT)).toEqual({ ok: false, reason: 'factcheck_title_mismatch' })
  })

  it('a null lede and an empty lede are the same published value', () => {
    const noLede = assess([RELEASE, COSTS, HEADLINE], [S1, S2], BODY, TITLE, '')
    expect(factCheckAllowsPublication(noLede, { ...TEXT, summary: null })).toEqual({ ok: true })
    expect(factCheckAllowsPublication(noLede, { ...TEXT, summary: undefined })).toEqual({ ok: true })
  })

  it('requires article QA AND fact-check for marked rows; QA alone is never enough', () => {
    const row = { payload: TEXT, qa: { pass: true }, meta: { factcheck_required: true, factcheck: passed } }
    expect(publicationGate(row)).toEqual({ ok: true })
    expect(publicationGate({ ...row, qa: { pass: false } })).toEqual({ ok: false, reason: 'article_qa_not_passed' })
    expect(publicationGate({ ...row, meta: { factcheck_required: true } })).toEqual({ ok: false, reason: 'factcheck_missing' })
    expect(publicationGate({ ...row, payload: { ...TEXT, body: '' } })).toEqual({ ok: false, reason: 'payload_body_missing' })
    expect(publicationGate({ ...row, payload: { ...TEXT, title: '' } })).toEqual({ ok: false, reason: 'payload_title_missing' })
    expect(publicationGate({ ...row, payload: { ...TEXT, summary: 42 } })).toEqual({ ok: false, reason: 'payload_summary_invalid' })
    expect(publicationGate({ ...row, payload: { ...TEXT, title: 'Acme launches Model Y today' } }))
      .toEqual({ ok: false, reason: 'factcheck_title_mismatch' })
  })

  it('leaves rows from the existing generate paths unchanged', () => {
    expect(publicationGate({ payload: { body: 'x' }, qa: { pass: false }, meta: { model: 'm' } })).toEqual({ ok: true })
    expect(publicationGate({ payload: null, qa: null, meta: null })).toEqual({ ok: true })
  })
})
