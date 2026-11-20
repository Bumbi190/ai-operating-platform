/**
 * POST /api/content/articles/jobs/tick   (System A — Workflow B worker)
 *
 * One queue tick for The Prompt's fact-checked website articles:
 *   1. enqueue news items that the social pipeline selected (read-only scan of media_scripts),
 *   2. claim at most ONE due job (SKIP LOCKED + lease),
 *   3. run it to a checkpointed outcome and release the lease.
 *
 * Never publishes. The result is a website_content row in pending_review that
 * the operator approves through /api/content/articles/[id]/review, which also
 * requires a passed fact-check for these rows.
 *
 * Feature flag: does nothing unless THEPROMPT_ARTICLE_JOBS_ENABLED === 'true'.
 * Not scheduled in vercel.json; activation is a separate, owner-approved step.
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readArticleJobsConfig } from '@/lib/article/jobs/config'
import { runArticleJob } from '@/lib/article/jobs/runner'
import {
  claimArticleJob, createArticleJobDeps, enqueueFromSocialSelections, finishArticleJob, resolveSystemAProjectId,
} from '@/lib/article/jobs/repo'
import type { ArticleJobCheckpoint } from '@/lib/article/jobs/types'

export const dynamic = 'force-dynamic'
// The lease (600s) must outlive this, so a live run is never reclaimed by a second worker.
export const maxDuration = 300

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cfg = readArticleJobsConfig()
  if (!cfg.enabled) {
    // Flag off: no database read, no model call, no write.
    return NextResponse.json({ ok: true, status: 'disabled' })
  }

  const db = createAdminClient()
  const projectId = await resolveSystemAProjectId(db)
  if (!projectId) return NextResponse.json({ error: 'System A project not found' }, { status: 500 })

  const enqueue = await enqueueFromSocialSelections(db, projectId, cfg)

  let job
  try {
    job = await claimArticleJob(db, cfg)
  } catch (e) {
    return NextResponse.json({ ok: false, enqueue, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
  if (!job) return NextResponse.json({ ok: true, status: 'idle', enqueue })

  const latest: { checkpoint: ArticleJobCheckpoint | null } = { checkpoint: job.checkpoint ?? null }
  const outcome = await runArticleJob(job, createArticleJobDeps(db, cfg, latest))
  let released = false
  try {
    released = await finishArticleJob(db, job, outcome, latest.checkpoint, cfg)
  } catch (e) {
    // The lease expires on its own; the next claim resumes from the last checkpoint.
    console.error('[article-job] finish failed:', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({
    ok: true,
    status: 'ran',
    enqueue,
    job: { id: job.id, news_item_id: job.news_item_id, attempt: job.attempts },
    outcome,
    released,
    cost_usd: latest.checkpoint?.costUsd ?? 0,
  })
}
