/**
 * Website-article job runner: resume, budgets and fail-closed behaviour.
 *
 * Every dependency is a fake that counts calls, so "no repeated paid step" is
 * proven by call counts rather than asserted in prose.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { runArticleJob, type ArticleJobDeps } from '@/lib/article/jobs/runner'
import { LeaseLostError, type ArticleJob, type ArticleJobCheckpoint } from '@/lib/article/jobs/types'
import { publicationGate } from '@/lib/article/factcheck/gate'
import { toPublishPayload } from '@/lib/article/to-contract'
import type { FactCheckReport } from '@/lib/article/factcheck/types'
import type { ArticleDraft } from '@/lib/article/types'

const SOURCE_TEXT =
  'Acme released Model X on Tuesday, according to the company. The model costs $2 per million input tokens. ' +
  'Acme said availability starts in the United States and expands to Europe next quarter. '.repeat(8)

function sentenceBody(extra = ''): string {
  // ~950 words: enough for the deep tier; the claim sentences are the first paragraphs.
  // Analysis prose WITHOUT fact signals (no digits, dates or event verbs), so coverage applies only to the claims.
  const words = ['enterprise', 'consumer', 'developer', 'education', 'research', 'startup', 'cloud', 'mobile', 'hardware']
  const filler = Array.from({ length: 90 }, (_, i) =>
    `This suggests that pricing pressure in the ${words[i % words.length]} segment will shape how rivals respond over time.`).join(' ')
  return [
    'According to The Verge, Acme released Model X on Tuesday.',
    'The model costs $2 per million input tokens.',
    extra,
    filler,
  ].filter(Boolean).join('\n\n')
}

const TITLE = 'Acme releases Model X'
const SUMMARY = 'Acme released Model X on Tuesday.'
const FALSE_TITLE = 'Acme launches Model Y today'

function draftWith(body: string, title = TITLE): ArticleDraft {
  return {
    title, summary: SUMMARY, body, category: 'models',
    tags: [{ slug: 'acme', name: 'Acme' }, { slug: 'models', name: 'Models' }, { slug: 'pricing', name: 'Pricing' }],
    hero_image_prompt: null, source_name: 'The Verge', source_url: 'https://www.theverge.com/acme',
    _meta: { grounding: 'strong', tier: 'deep', model: 'claude-sonnet-4-6', tokensIn: 1, tokensOut: 1, estCostUsd: 0.05,
      bodyWordCount: body.trim().split(/\s+/).length },
  }
}

const ok = (sentence: string, quote: string) => ({
  sentence, claim: sentence, importance: 'central', verdict: 'supported', note: '', evidence: [{ sourceId: 's1', exactQuote: quote }],
})
const PASSING_CLAIMS = [
  ok('According to The Verge, Acme released Model X on Tuesday.', 'Acme released Model X on Tuesday'),
  ok('The model costs $2 per million input tokens.', 'costs $2 per million input tokens'),
  ok(TITLE, 'Acme released Model X on Tuesday'),
  ok(SUMMARY, 'Acme released Model X on Tuesday'),
]
/** The reviewer verifies body and lede but says nothing about the headline. */
const WITHOUT_HEADLINE = PASSING_CLAIMS.filter((c) => c.sentence !== TITLE)
const BAD_SENTENCE = 'Acme raised $5 billion from investors last week.'

/** What the review route would publish for this saved draft, gated exactly as the route gates it. */
function gateForSaved(draft: ArticleDraft, report: FactCheckReport, payloadOverride: Record<string, unknown> = {}) {
  const payload = { ...toPublishPayload(draft, { newsItemId: 'n1', publishedAt: null }), ...payloadOverride }
  return publicationGate({ payload, qa: { pass: true }, meta: { factcheck_required: true, factcheck: report } })
}

interface Fakes {
  deps: ArticleJobDeps
  calls: Record<string, number>
  saved: Array<{ draft: ArticleDraft; verdict: string }>
  reports: FactCheckReport[]
  persisted: ArticleJobCheckpoint[]
}

function makeFakes(over: Partial<ArticleJobDeps> & {
  reviews?: unknown[]; reviseBody?: string; draftTitle?: string; reviseTitle?: string
} = {}): Fakes {
  const calls: Record<string, number> = { read: 0, write: 0, review: 0, revise: 0, save: 0, checkpoint: 0 }
  const saved: Fakes['saved'] = []
  const reports: FactCheckReport[] = []
  const persisted: ArticleJobCheckpoint[] = []
  const reviews = over.reviews ?? [PASSING_CLAIMS]
  const deps: ArticleJobDeps = {
    loadNewsItem: async () => ({ id: 'n1', title: 'Acme ships Model X', url: 'https://www.theverge.com/acme', source_name: 'The Verge' }),
    findCorroborating: async () => [],
    readSource: async (url) => { calls.read++; return { success: true, url, title: 'Origin', text: SOURCE_TEXT } },
    write: async () => {
      calls.write++
      return { draft: draftWith(sentenceBody(over.reviews && !over.draftTitle ? BAD_SENTENCE : ''), over.draftTitle) }
    },
    review: async () => { const r = reviews[Math.min(calls.review, reviews.length - 1)]; calls.review++; return { claims: r, model: 'm', costUsd: 0.1 } },
    revise: async (a) => {
      calls.revise++
      return { title: over.reviseTitle ?? a.title, summary: a.summary, body: over.reviseBody ?? sentenceBody(), model: 'm', costUsd: 0.05 }
    },
    checkpoint: async (_job, cp) => { calls.checkpoint++; persisted.push(JSON.parse(JSON.stringify(cp))) },
    save: async ({ draft, report }) => { calls.save++; reports.push(report); saved.push({ draft, verdict: report.verdict }); return { id: 'wc-1' } },
    classifyError: (e) => (e instanceof LeaseLostError ? 'lease_lost' : (e as { kind?: string })?.kind === 'spend' ? 'deferred' : 'retryable'),
    now: () => new Date('2026-10-28T09:00:00.000Z'),
    ...over,
  }
  return { deps, calls, saved, reports, persisted }
}

let job: ArticleJob
beforeEach(() => {
  job = {
    id: 'job-1', project_id: 'p1', news_item_id: 'n1', media_script_id: 'ms1', external_id: 'omnira_n1',
    state: 'running', attempts: 1, max_attempts: 3, lease_token: 'lease-1', checkpoint: {}, website_content_id: null, last_error: null,
  }
})

describe('runArticleJob', () => {
  it('happy path: one read, one write, one review, saved as passed and bound to the published payload', async () => {
    const f = makeFakes()
    const out = await runArticleJob(job, f.deps)
    expect(out).toMatchObject({ state: 'saved', factcheck: 'passed', websiteContentId: 'wc-1' })
    expect(f.calls).toMatchObject({ read: 1, write: 1, review: 1, revise: 0, save: 1 })
    // End to end: the saved report authorises exactly the title/summary/body toPublishPayload sends…
    expect(gateForSaved(f.saved[0].draft, f.reports[0])).toEqual({ ok: true })
    // …and nothing else: editing only the headline or only the lede afterwards is refused.
    expect(gateForSaved(f.saved[0].draft, f.reports[0], { title: FALSE_TITLE })).toEqual({ ok: false, reason: 'factcheck_title_mismatch' })
    expect(gateForSaved(f.saved[0].draft, f.reports[0], { summary: 'Acme raised $5 billion.' }))
      .toEqual({ ok: false, reason: 'factcheck_summary_mismatch' })
  })

  it('the reviewer is shown the headline and lede, not only the body', async () => {
    const seen: Array<{ title: string; summary: string }> = []
    const f = makeFakes()
    const review = f.deps.review
    f.deps.review = async (a) => { seen.push({ title: a.title, summary: a.summary }); return review(a) }
    await runArticleJob(job, f.deps)
    expect(seen).toEqual([{ title: TITLE, summary: SUMMARY }])
  })

  it('false headline over a verified body, omitted by the reviewer in every round → saved blocked', async () => {
    const f = makeFakes({ draftTitle: FALSE_TITLE, reviews: [WITHOUT_HEADLINE, WITHOUT_HEADLINE] })
    const out = await runArticleJob(job, f.deps)
    expect(out).toMatchObject({ state: 'saved', factcheck: 'blocked' })
    expect(f.calls).toMatchObject({ review: 2, revise: 1 })
    const report = f.reports[0]
    expect(report.claims.find((c) => c.sentence === FALSE_TITLE)).toMatchObject({ field: 'title', verdict: 'unsupported' })
    expect(report.reasons).toContain('title_not_verified')
    expect(gateForSaved(f.saved[0].draft, report)).toEqual({ ok: false, reason: 'factcheck_blocked' })
  })

  it('false headline → the one revision corrects it → passes on the corrected headline only', async () => {
    const f = makeFakes({ draftTitle: FALSE_TITLE, reviseTitle: TITLE, reviews: [WITHOUT_HEADLINE, PASSING_CLAIMS] })
    const out = await runArticleJob(job, f.deps)
    expect(out).toMatchObject({ state: 'saved', factcheck: 'passed' })
    expect(f.saved[0].draft.title).toBe(TITLE)
    expect(gateForSaved(f.saved[0].draft, f.reports[0])).toEqual({ ok: true })
    expect(gateForSaved(f.saved[0].draft, f.reports[0], { title: FALSE_TITLE }).ok).toBe(false)
  })

  it('a resumed job keeps the revised headline from its checkpoint (no repeated paid step)', async () => {
    const first = makeFakes({ draftTitle: FALSE_TITLE, reviseTitle: TITLE, reviews: [WITHOUT_HEADLINE] })
    first.deps.review = (() => {
      const orig = first.deps.review
      return async (a) => { if (first.calls.revise > 0) throw new Error('process killed'); return orig(a) }
    })()
    expect((await runArticleJob(job, first.deps)).state).toBe('retry')
    const cp = first.persisted[first.persisted.length - 1]
    expect(cp.revised?.title).toBe(TITLE)

    const second = makeFakes({ draftTitle: FALSE_TITLE })
    const out = await runArticleJob({ ...job, attempts: 2, checkpoint: cp }, second.deps)
    expect(out).toMatchObject({ state: 'saved', factcheck: 'passed' })
    expect(second.calls).toMatchObject({ write: 0, revise: 0, review: 1 })
    expect(second.saved[0].draft.title).toBe(TITLE)
  })

  it('resumes after a crash without repeating any completed paid step', async () => {
    // Crash right after the draft checkpoint (simulates process kill during review).
    const first = makeFakes({ review: async () => { throw new Error('process killed') } })
    const out1 = await runArticleJob(job, first.deps)
    expect(out1.state).toBe('retry')
    const cp = first.persisted[first.persisted.length - 1]
    expect(cp.draft).toBeDefined()
    expect(cp.sources).toHaveLength(1)

    const second = makeFakes()
    const out2 = await runArticleJob({ ...job, attempts: 2, checkpoint: cp }, second.deps)
    expect(out2).toMatchObject({ state: 'saved', factcheck: 'passed' })
    expect(second.calls.read).toBe(0)   // sources reused
    expect(second.calls.write).toBe(0)  // draft reused: no second writer spend
    expect(second.calls.review).toBe(1)
  })

  it('a completed job re-run from its checkpoint makes zero model calls and saves the same identity', async () => {
    const f1 = makeFakes()
    await runArticleJob(job, f1.deps)
    const cp = f1.persisted[f1.persisted.length - 1]
    const f2 = makeFakes()
    const out = await runArticleJob({ ...job, checkpoint: cp }, f2.deps)
    expect(out.state).toBe('saved')
    expect(f2.calls).toMatchObject({ read: 0, write: 0, review: 0, revise: 0 })
  })

  it('unverifiable claim → exactly one revision → re-check passes', async () => {
    const unsupported = [...PASSING_CLAIMS, { sentence: BAD_SENTENCE, claim: 'funding', importance: 'central', verdict: 'unsupported', note: 'not in sources', evidence: [] }]
    const f = makeFakes({ reviews: [unsupported, PASSING_CLAIMS] })
    const out = await runArticleJob(job, f.deps)
    expect(out).toMatchObject({ state: 'saved', factcheck: 'passed' })
    expect(f.calls).toMatchObject({ write: 1, review: 2, revise: 1 })
    expect(f.saved[0].draft.body).not.toContain(BAD_SENTENCE)
  })

  it('contradiction that survives the revision is saved BLOCKED, never passed, and not revised twice', async () => {
    const contradicted = [...PASSING_CLAIMS, { sentence: BAD_SENTENCE, claim: 'funding', importance: 'central', verdict: 'contradicted', note: '',
      evidence: [{ sourceId: 's1', exactQuote: 'Acme released Model X on Tuesday' }] }]
    const f = makeFakes({ reviews: [contradicted, contradicted], reviseBody: sentenceBody(BAD_SENTENCE) })
    const out = await runArticleJob(job, f.deps)
    expect(out).toMatchObject({ state: 'saved', factcheck: 'blocked' })
    expect(f.calls.revise).toBe(1)
    expect(f.calls.review).toBe(2)
    expect(f.saved[0].verdict).toBe('blocked')
  })

  it('reviewer OMITS a new central claim in every round → saved blocked, never publishable', async () => {
    // Draft contains BAD_SENTENCE; the reviewer verifies the rest and never mentions it, and the
    // reviser leaves it in. Coverage must catch it in both rounds.
    const f = makeFakes({ reviews: [PASSING_CLAIMS, PASSING_CLAIMS], reviseBody: sentenceBody(BAD_SENTENCE) })
    const out = await runArticleJob(job, f.deps)
    expect(out).toMatchObject({ state: 'saved', factcheck: 'blocked' })
    expect(f.calls).toMatchObject({ review: 2, revise: 1 })
    const savedReport = f.reports[0]
    expect(savedReport.verdict).toBe('blocked')
    expect(savedReport.claims.find((c) => c.sentence === BAD_SENTENCE)?.downgrades).toEqual(['omitted_by_reviewer'])
    expect(gateForSaved(f.saved[0].draft, savedReport).ok).toBe(false)
  })

  it('reviewer omits it, the revision removes the unverified sentence → passes on the corrected text only', async () => {
    const f = makeFakes({ reviews: [PASSING_CLAIMS, PASSING_CLAIMS] })
    const out = await runArticleJob(job, f.deps)
    expect(out).toMatchObject({ state: 'saved', factcheck: 'passed' })
    expect(f.calls.revise).toBe(1)
    expect(f.saved[0].draft.body).not.toContain(BAD_SENTENCE)
  })

  it('unavailable originating source → retry with zero model spend', async () => {
    const f = makeFakes({ readSource: async () => null })
    const out = await runArticleJob(job, f.deps)
    expect(out.state).toBe('retry')
    expect(out.reason).toMatch(/originating_source_unavailable/)
    expect(f.calls).toMatchObject({ write: 0, review: 0, save: 0 })
  })

  it('cost gate refusal → deferred (attempt not consumed), progress kept', async () => {
    const f = makeFakes({ review: async () => { throw Object.assign(new Error('Spend refused'), { kind: 'spend' }) } })
    const out = await runArticleJob(job, f.deps)
    expect(out.state).toBe('deferred')
    expect(f.persisted[f.persisted.length - 1].draft).toBeDefined()
    expect(f.calls.save).toBe(0)
  })

  it('AI error → retry, nothing saved', async () => {
    const f = makeFakes({ write: async () => { throw new Error('529 overloaded') } })
    const out = await runArticleJob(job, f.deps)
    expect(out).toMatchObject({ state: 'retry' })
    expect(f.calls.save).toBe(0)
  })

  it('lost lease (another worker took over) → stops without saving', async () => {
    let n = 0
    const f = makeFakes({ checkpoint: async () => { if (++n >= 2) throw new LeaseLostError('job-1') } })
    const out = await runArticleJob(job, f.deps)
    expect(out.state).toBe('lease_lost')
    expect(f.calls.save).toBe(0)
    expect(f.calls.review).toBe(0)
  })

  it('article QA failure skips the paid fact-check and saves blocked', async () => {
    const f = makeFakes({ write: async () => ({ draft: { ...draftWith('Too short.'), tags: [] } }) })
    const out = await runArticleJob(job, f.deps)
    expect(out).toMatchObject({ state: 'saved', factcheck: 'blocked' })
    expect(f.calls.review).toBe(0)
  })

  it('existing published/approved row is not overwritten → blocked with reason', async () => {
    const f = makeFakes({ save: async () => ({ id: null, skippedReason: 'existing_row_published' }) })
    const out = await runArticleJob(job, f.deps)
    expect(out).toEqual({ state: 'blocked', reason: 'existing_row_published' })
  })

  it('news item outside the job project → blocked before any read', async () => {
    const f = makeFakes({ loadNewsItem: async () => null })
    expect((await runArticleJob(job, f.deps)).state).toBe('blocked')
    expect(f.calls.read).toBe(0)
  })
})
