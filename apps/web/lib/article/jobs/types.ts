/**
 * lib/article/jobs/types.ts
 *
 * Durable website-article job (Workflow B). One row per (project, news item),
 * keyed on the same external_id the publishing contract uses, so the article
 * identity is stable across retries, restarts and duplicate triggers.
 *
 * The job never touches media_scripts or any social table except to READ which
 * news items were selected for social. Social (Workflow A) and website
 * (Workflow B) succeed and fail independently.
 */

import type { ArticleDraft, ArticleQa } from '../types'
import type { FactCheckReport, SourceSnapshot } from '../factcheck/types'

export type ArticleJobState = 'queued' | 'running' | 'saved' | 'blocked' | 'failed' | 'cancelled'

/**
 * Everything a resumed job needs to continue WITHOUT repeating a paid step.
 * Each paid step writes its result here before the next one starts.
 */
export interface ArticleJobCheckpoint {
  sources?: SourceSnapshot[]
  sourceLog?: string[]
  draft?: ArticleDraft
  qa?: ArticleQa
  /** Fact-check reports in order; index = revision round. */
  reports?: FactCheckReport[]
  /** Set once the single permitted revision has been written. */
  revised?: { title: string; summary: string; body: string } | null
  /** Accumulated model spend for this job, USD (estimate from usage). */
  costUsd?: number
}

export interface ArticleJob {
  id: string
  project_id: string
  news_item_id: string
  media_script_id: string | null
  external_id: string
  state: ArticleJobState
  attempts: number
  max_attempts: number
  lease_token: string | null
  checkpoint: ArticleJobCheckpoint
  website_content_id: string | null
  last_error: string | null
}

export type ArticleJobOutcome =
  | { state: 'saved'; websiteContentId: string; factcheck: FactCheckReport['verdict']; reason: string }
  | { state: 'blocked'; reason: string; websiteContentId?: string | null }
  /** Transient failure; counts as an attempt. */
  | { state: 'retry'; reason: string }
  /** Cost gate / stop / not dispatched; does NOT count as an attempt. */
  | { state: 'deferred'; reason: string }
  | { state: 'failed'; reason: string }
  /** Another worker took the lease; this worker must write nothing further. */
  | { state: 'lease_lost'; reason: string }

/** How the runner should treat an error thrown by a dependency. */
export type ErrorClass = 'deferred' | 'retryable' | 'fatal' | 'lease_lost'

export class LeaseLostError extends Error {
  constructor(jobId: string) {
    super(`[article-job] lease lost for job ${jobId}`)
    this.name = 'LeaseLostError'
  }
}
