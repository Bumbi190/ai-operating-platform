/**
 * lib/article/jobs/runner.ts
 *
 * Step runner for one claimed website-article job. All I/O is injected so the
 * control flow (resume, budgets, fail-closed) is testable without a database or
 * a model.
 *
 * Order, with a checkpoint after every step:
 *   sources (free) → draft (paid) → QA (free) → fact-check (paid)
 *   → [one revision (paid) → re-check (paid)] → save to website_content.
 *
 * A resumed job skips every step whose result is already in the checkpoint, so
 * a crash or a lost lease never repeats a completed paid call. The single
 * exception is a crash between a provider returning and the checkpoint write;
 * that window is one step wide and is documented, not hidden.
 */

import { reviewArticle } from '../qa'
import type { ArticleDraft, NewsItemInput } from '../types'
import { assessArticleFactCheck, claimsNeedingRevision } from '../factcheck/contract'
import { collectSources, type CorroborationCandidate, type SourceReader } from '../factcheck/sources'
import type { ReviewCallResult, ReviseResult } from '../factcheck/reviewer'
import type { CheckedClaim, FactCheckReport, SourceSnapshot } from '../factcheck/types'
import type { ArticleJob, ArticleJobCheckpoint, ArticleJobOutcome, ErrorClass } from './types'

/** Fact-check rounds are bounded: the first draft plus at most one revision. */
export const MAX_REVISIONS = 1
/** Article length the website workflow aims for (deep tier). */
export const ARTICLE_TIER = 'deep' as const

export interface SaveArticleArgs {
  job: ArticleJob
  newsItem: NewsItemInput
  draft: ArticleDraft
  checkpoint: ArticleJobCheckpoint
  report: FactCheckReport
}

export interface ArticleJobDeps {
  loadNewsItem(job: ArticleJob): Promise<NewsItemInput | null>
  findCorroborating(newsItem: NewsItemInput): Promise<CorroborationCandidate[]>
  readSource: SourceReader
  write(args: { newsItem: NewsItemInput; groundingText: string }): Promise<{ draft: ArticleDraft }>
  review(args: { title: string; body: string; sources: SourceSnapshot[] }): Promise<ReviewCallResult>
  revise(args: {
    title: string; summary: string; body: string; flagged: CheckedClaim[]; sources: SourceSnapshot[]
  }): Promise<ReviseResult>
  /** Persist checkpoint progress; MUST throw LeaseLostError if this worker no longer holds the lease. */
  checkpoint(job: ArticleJob, checkpoint: ArticleJobCheckpoint): Promise<void>
  /** Write the reviewable row. Returns null id + reason when an existing row must not be overwritten. */
  save(args: SaveArticleArgs): Promise<{ id: string | null; skippedReason?: string }>
  classifyError(e: unknown): ErrorClass
  now(): Date
}

function wordCount(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

function applyRevision(draft: ArticleDraft, revised: { title: string; summary: string; body: string }): ArticleDraft {
  return {
    ...draft,
    title: revised.title,
    summary: revised.summary,
    body: revised.body,
    _meta: { ...draft._meta, bodyWordCount: wordCount(revised.body) },
  }
}

function message(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e)
}

export async function runArticleJob(job: ArticleJob, deps: ArticleJobDeps): Promise<ArticleJobOutcome> {
  const cp: ArticleJobCheckpoint = { ...(job.checkpoint ?? {}) }
  const save = async () => deps.checkpoint(job, cp)
  const addCost = (usd: number) => { cp.costUsd = Math.round(((cp.costUsd ?? 0) + usd) * 1e6) / 1e6 }

  try {
    const newsItem = await deps.loadNewsItem(job)
    if (!newsItem) return { state: 'blocked', reason: 'news_item_not_found_in_project' }

    // 1. Sources — free. Re-read only if never collected.
    if (!cp.sources) {
      const corroborating = await deps.findCorroborating(newsItem)
      const { sources, log } = await collectSources({
        newsItem: { title: newsItem.title, url: newsItem.url ?? null },
        corroborating,
        reader: deps.readSource,
        now: deps.now,
      })
      if (!sources.some((s) => s.id === 's1')) {
        // Without the originating report there is nothing to ground or verify against.
        // Likely transient (Hermes down, site blocking); retry before any model spend.
        return { state: 'retry', reason: `originating_source_unavailable: ${log.join(' | ')}` }
      }
      cp.sources = sources
      cp.sourceLog = log
      await save()
    }
    const sources = cp.sources
    const origin = sources.find((s) => s.id === 's1')!

    // 2. Draft — paid, once.
    if (!cp.draft) {
      const { draft } = await deps.write({ newsItem, groundingText: origin.text })
      cp.draft = draft
      addCost(draft._meta.estCostUsd)
      await save()
    }

    // 3. Article QA — free, deterministic. Recomputed on the current text.
    let draft = cp.revised ? applyRevision(cp.draft, cp.revised) : cp.draft
    const grounding = { text: origin.text, mode: 'strong' as const, wordCount: wordCount(origin.text), source: 'hermes' as const }
    cp.qa = reviewArticle(draft, grounding)

    cp.reports = cp.reports ?? []

    if (!cp.qa.pass && cp.reports.length === 0) {
      // Structural QA failure: fact-checking text that is not fit to run would spend for nothing.
      const report = assessArticleFactCheck({
        body: draft.body, sources, modelClaims: null, reviewerModel: null, round: 0, now: deps.now(),
      })
      const blockedReport: FactCheckReport = { ...report, verdict: 'blocked', reasons: ['article_qa_failed', ...cp.qa.issues] }
      cp.reports.push(blockedReport)
      await save()
    }

    // 4. Fact-check round(s) — paid, each once. The loop bound is structural:
    //    even a wrong revision policy cannot spend beyond review+revise per round.
    for (let step = 0; step < 2 * (MAX_REVISIONS + 1); step++) {
      const round = cp.revised ? 1 : 0
      const existing = cp.reports[round]
      if (!existing) {
        const reviewed = await deps.review({ title: draft.title, body: draft.body, sources })
        addCost(reviewed.costUsd)
        cp.reports.push(assessArticleFactCheck({
          body: draft.body, sources, modelClaims: reviewed.claims,
          reviewerModel: reviewed.model, round, now: deps.now(),
        }))
        await save()
        continue
      }
      if (existing.verdict !== 'needs_revision' || round >= MAX_REVISIONS) break

      // 5. One revision — paid, once.
      const revised = await deps.revise({
        title: draft.title, summary: draft.summary, body: draft.body,
        flagged: claimsNeedingRevision(existing), sources,
      })
      addCost(revised.costUsd)
      cp.revised = { title: revised.title, summary: revised.summary, body: revised.body }
      draft = applyRevision(cp.draft, cp.revised)
      cp.qa = reviewArticle(draft, grounding)
      await save()
    }

    const finalReport = cp.reports[cp.reports.length - 1]
    // A report that still needs revision after the last permitted round is final: blocked.
    const report: FactCheckReport = finalReport.verdict === 'needs_revision'
      ? { ...finalReport, verdict: 'blocked', reasons: ['unresolved_after_revision', ...finalReport.reasons] }
      : finalReport

    // 6. Save the reviewable row. Saved even when blocked so the operator can inspect why;
    //    the review route refuses to publish anything whose fact-check did not pass.
    const saved = await deps.save({ job, newsItem, draft, checkpoint: cp, report })
    if (!saved.id) return { state: 'blocked', reason: saved.skippedReason ?? 'save_skipped' }
    return {
      state: 'saved',
      websiteContentId: saved.id,
      factcheck: report.verdict,
      reason: report.verdict === 'passed' ? 'ready_for_review' : `factcheck_${report.verdict}`,
    }
  } catch (e) {
    const cls = deps.classifyError(e)
    if (cls === 'lease_lost') return { state: 'lease_lost', reason: message(e) }
    // Best effort: keep whatever progress exists so the next attempt resumes from it.
    try { await deps.checkpoint(job, cp) } catch { /* lease may be gone; the claim fence protects the row */ }
    if (cls === 'deferred') return { state: 'deferred', reason: message(e) }
    if (cls === 'fatal') return { state: 'failed', reason: message(e) }
    return { state: 'retry', reason: message(e) }
  }
}
