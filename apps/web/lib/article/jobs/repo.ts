/**
 * lib/article/jobs/repo.ts
 *
 * Supabase-backed side of the website-article queue. Uses the (proposed)
 * `website_article_jobs` table and its SECURITY DEFINER functions
 * (enqueue / claim / save_content / finish). The table is not in database.types until the
 * migration is applied, hence the narrow `AnyDb` casts.
 *
 * Reads media_scripts to learn which news items social selected. Never writes
 * to media_scripts, media_news_items or any social table.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { callHermesRead } from '@/lib/media/hermes'
import { ExecutionStoppedError, projectScope } from '@/lib/governance/execution-stop'
import {
  GovernanceDispatchUnknownError, isGovernanceAbort, isPhysicalAdmissionRefusal,
} from '@/lib/governance/execution-signal'
import { MEDIA_PIPELINE_PROJECT, ProviderNotDispatchedError, SpendRefusedError } from '@/lib/cost/governed-spend'
import { writeArticle } from '../writer'
import { externalIdForNewsItem, toPublishPayload } from '../to-contract'
import { LEASE_LOST, saveGeneratedArticle, SYSTEM_A_PROJECT_SLUG } from '../store'
import { reviewClaims, reviseFlaggedClaims } from '../factcheck/reviewer'
import type { NewsItemInput } from '../types'
import { ARTICLE_TIER, type ArticleJobDeps, type SaveArticleArgs } from './runner'
import { SOCIAL_SELECTED_STATUSES, type ArticleJobsConfig } from './config'
import { LeaseLostError, type ArticleJob, type ArticleJobCheckpoint, type ArticleJobOutcome, type ErrorClass } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

/** The workflow runs AUTONOMOUSLY and is charged to The Prompt's media project. */
export const ARTICLE_JOB_EXECUTION = {
  context: 'AUTONOMOUS' as const,
  scope: projectScope(MEDIA_PIPELINE_PROJECT),
}

export const ARTICLE_JOB_GENERATED_BY = 'omnira-article-job:factcheck-v1'

export function classifyArticleJobError(e: unknown): ErrorClass {
  if (e instanceof LeaseLostError) return 'lease_lost'
  // A model call that may already have been billed is not retried automatically.
  if (e instanceof GovernanceDispatchUnknownError) return 'fatal'
  if (
    e instanceof SpendRefusedError ||
    e instanceof ExecutionStoppedError ||
    e instanceof ProviderNotDispatchedError ||
    isPhysicalAdmissionRefusal(e) ||
    isGovernanceAbort(e)
  ) return 'deferred'
  return 'retryable'
}

export async function resolveSystemAProjectId(db: AnyDb): Promise<string | null> {
  const { data } = await db.from('projects').select('id').eq('slug', SYSTEM_A_PROJECT_SLUG).limit(1).maybeSingle()
  return (data as { id?: string } | null)?.id ?? null
}

export interface EnqueueSummary { scanned: number; enqueued: number; existing: number; capped: number; errors: string[] }

/**
 * Turn recent social selections into article jobs. Idempotent: the enqueue
 * function returns 'exists' for a news item that already has a job, so a
 * duplicate trigger or two overlapping cron runs create at most one job.
 */
export async function enqueueFromSocialSelections(db: AnyDb, projectId: string, cfg: ArticleJobsConfig): Promise<EnqueueSummary> {
  const summary: EnqueueSummary = { scanned: 0, enqueued: 0, existing: 0, capped: 0, errors: [] }
  if (!cfg.since || cfg.dailyMax <= 0) return summary

  const { data, error } = await db
    .from('media_scripts')
    .select('id, news_item_id, created_at')
    .eq('project_id', projectId)
    .in('status', [...SOCIAL_SELECTED_STATUSES])
    .not('news_item_id', 'is', null)
    .gte('created_at', cfg.since)
    .order('created_at', { ascending: true })
    .limit(20)
  if (error) { summary.errors.push(`scan: ${error.message}`); return summary }

  const seen = new Set<string>()
  for (const row of (data ?? []) as Array<{ id: string; news_item_id: string }>) {
    if (seen.has(row.news_item_id)) continue
    seen.add(row.news_item_id)
    summary.scanned++
    const { data: result, error: rpcErr } = await db.rpc('website_article_job_enqueue', {
      p_project_id: projectId,
      p_news_item_id: row.news_item_id,
      p_media_script_id: row.id,
      p_external_id: externalIdForNewsItem(row.news_item_id),
      p_daily_max: cfg.dailyMax,
      p_max_attempts: cfg.maxAttempts,
    })
    if (rpcErr) { summary.errors.push(`enqueue ${row.news_item_id}: ${rpcErr.message}`); continue }
    if (result === 'enqueued') summary.enqueued++
    else if (result === 'daily_cap') { summary.capped++; break }
    else summary.existing++
  }
  return summary
}

export async function claimArticleJob(db: AnyDb, cfg: ArticleJobsConfig): Promise<ArticleJob | null> {
  const { data, error } = await db.rpc('website_article_job_claim', { p_lease_seconds: cfg.leaseSeconds })
  if (error) throw new Error(`[article-job] claim failed: ${error.message}`)
  const rows = (data ?? []) as ArticleJob[]
  return rows[0] ?? null
}

export async function finishArticleJob(
  db: AnyDb, job: ArticleJob, outcome: ArticleJobOutcome, checkpoint: ArticleJobCheckpoint | null,
  cfg: ArticleJobsConfig,
): Promise<boolean> {
  if (outcome.state === 'lease_lost') return false
  const delaySeconds =
    outcome.state === 'deferred' ? cfg.deferMinutes * 60
    : outcome.state === 'retry' ? Math.min(3600, 300 * Math.pow(2, Math.max(0, job.attempts - 1)))
    : 0
  const { data, error } = await db.rpc('website_article_job_finish', {
    p_id: job.id,
    p_lease_token: job.lease_token,
    p_outcome: outcome.state,
    p_reason: outcome.reason,
    p_website_content_id: 'websiteContentId' in outcome ? outcome.websiteContentId ?? null : null,
    p_checkpoint: checkpoint,
    p_cost_usd: checkpoint?.costUsd ?? null,
    p_delay_seconds: delaySeconds,
  })
  if (error) throw new Error(`[article-job] finish failed: ${error.message}`)
  return data === true
}

/** Production dependencies for runArticleJob. Every write is fenced on the job's lease token. */
export function createArticleJobDeps(db: AnyDb, cfg: ArticleJobsConfig, latest: { checkpoint: ArticleJobCheckpoint | null }): ArticleJobDeps {
  return {
    async loadNewsItem(job) {
      // Scoped to the job's own project: a job can never read another project's news.
      const { data } = await db.from('media_news_items')
        .select('id, title, summary, key_insight, url, source_name, content_angle')
        .eq('id', job.news_item_id).eq('project_id', job.project_id).maybeSingle()
      return (data as NewsItemInput | null) ?? null
    },
    async findCorroborating(newsItem) {
      const { data: self } = await db.from('media_news_items').select('project_id, created_at')
        .eq('id', newsItem.id).maybeSingle()
      if (!self) return []
      const anchor = Date.parse((self as { created_at?: string }).created_at ?? '') || Date.now()
      const { data } = await db.from('media_news_items').select('id, title, url')
        .eq('project_id', (self as { project_id: string }).project_id)
        .neq('id', newsItem.id)
        .gte('created_at', new Date(anchor - 72 * 3600_000).toISOString())
        .lte('created_at', new Date(anchor + 24 * 3600_000).toISOString())
        .limit(200)
      return (data ?? []) as Array<{ id: string; title: string; url: string | null }>
    },
    async readSource(url) {
      const r = await callHermesRead(url, 30_000)
      return r ? { success: r.success, url: r.url, title: r.title, text: r.text } : null
    },
    async write({ newsItem, groundingText }) {
      const { draft } = await writeArticle({
        execution: ARTICLE_JOB_EXECUTION, newsItem, groundingText, tier: ARTICLE_TIER,
      })
      return { draft }
    },
    review: (args) => reviewClaims({ execution: ARTICLE_JOB_EXECUTION, ...args }),
    revise: (args) => reviseFlaggedClaims({ execution: ARTICLE_JOB_EXECUTION, ...args }),
    async checkpoint(job, checkpoint) {
      latest.checkpoint = checkpoint
      const { data, error } = await db.from('website_article_jobs')
        .update({
          checkpoint,
          cost_usd: checkpoint.costUsd ?? 0,
          lease_expires_at: new Date(Date.now() + cfg.leaseSeconds * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id).eq('lease_token', job.lease_token).eq('state', 'running')
        .select('id')
      if (error) throw new Error(`[article-job] checkpoint failed: ${error.message}`)
      if (!data || data.length === 0) throw new LeaseLostError(job.id)
    },
    async save(args: SaveArticleArgs) {
      const { job, newsItem, draft, checkpoint, report } = args
      const payload = toPublishPayload(draft, { newsItemId: newsItem.id, publishedAt: null })
      if (payload.external_id !== job.external_id) throw new Error('[article-job] external_id drift')
      if (!job.lease_token) throw new LeaseLostError(job.id)
      // Lease check and write are one database transaction: a stale worker cannot write.
      const res = await saveGeneratedArticle({
        generated: { draft, qa: checkpoint.qa!, payload },
        newsItemId: newsItem.id,
        contentType: 'article',
        sourceKind: 'news_item',
        generatedBy: ARTICLE_JOB_GENERATED_BY,
        writeMode: 'reviewable_only',
        leaseFence: { jobId: job.id, leaseToken: job.lease_token },
        extraMeta: {
          factcheck_required: true,
          factcheck: report,
          factcheck_rounds: checkpoint.reports?.length ?? 0,
          article_job_id: job.id,
          source_log: checkpoint.sourceLog ?? [],
          job_cost_usd: checkpoint.costUsd ?? 0,
        },
      })
      if (res.skippedReason === LEASE_LOST) throw new LeaseLostError(job.id)
      return res.skippedReason ? { id: null, skippedReason: res.skippedReason } : { id: res.id }
    },
    classifyError: classifyArticleJobError,
    now: () => new Date(),
  }
}
