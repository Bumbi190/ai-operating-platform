/**
 * lib/article/pipeline.ts
 *
 * M2 orchestrator: validates the full chain
 *   News Hunter (media_news_items) → Writer → QA → Approval → Publish.
 *
 * QA confidence drives routing. autoPublish policy:
 *   'none' (DEFAULT) — everything becomes a PENDING approval for a human; nothing
 *                      is published until a person approves it. Used for validation.
 *   'high'           — high-confidence articles auto-publish live (+ an 'approved'
 *                      audit row); medium/low still go to a human.
 *
 * Reuses generateArticle (M1), publishArticle (M0), the approvals primitive, and logRun.
 */

import { generateArticle } from './index'
import { logRun } from '@/lib/media/run-log'
import { publishArticle } from '@/lib/publishing/publish'
import {
  ARTICLE_APPROVAL_KIND,
  createPublishApproval,
  type ArticleApprovalContent,
} from './approval'
import type { LengthTier, NewsItemInput } from './types'
import type { PublishSuccess } from '@/lib/publishing/types'

export type AutoPublishPolicy = 'none' | 'high'

export function defaultAutoPublishPolicy(): AutoPublishPolicy {
  return process.env.ARTICLE_AUTOPUBLISH === 'high' ? 'high' : 'none'
}

export interface RunPipelineOptions {
  tier?: LengthTier
  trendingTopics?: string[]
  model?: string
  destinationKey?: string
  /** Override the policy; defaults to env (ARTICLE_AUTOPUBLISH) or 'none'. */
  autoPublish?: AutoPublishPolicy
}

export interface PipelineDecision {
  decision: 'auto_published' | 'pending_approval'
  confidence: 'high' | 'medium' | 'low'
  qaPass: boolean
  externalId: string
  approvalId: string | null
  runId: string | null
  published: PublishSuccess | null
  policy: AutoPublishPolicy
  draftPreview: ArticleApprovalContent['draftPreview']
}

export async function runPublishPipeline(
  newsItem: NewsItemInput,
  opts: RunPipelineOptions = {},
): Promise<PipelineDecision> {
  const policy = opts.autoPublish ?? defaultAutoPublishPolicy()
  const destinationKey = opts.destinationKey ?? 'the-prompt'

  // 1. Generate + QA (M1). Payload defaults to draft (published_at = null).
  const { draft, qa, payload } = await generateArticle(newsItem, {
    tier: opts.tier,
    trendingTopics: opts.trendingTopics,
    model: opts.model,
    publishedAt: null,
  })

  // 2. Log the generation run (observability; links the approval to a run_id).
  const runId = await logRun({
    workflow: 'Generate Article',
    status: 'done',
    context: { newsItemId: newsItem.id, confidence: qa.confidence, qaPass: qa.pass },
  })

  const content: ArticleApprovalContent = {
    kind: ARTICLE_APPROVAL_KIND,
    destinationKey,
    newsItemId: newsItem.id,
    externalId: payload.external_id,
    payload,
    qa,
    draftPreview: {
      title: draft.title,
      summary: draft.summary,
      category: draft.category,
      tags: draft.tags.map((t) => t.slug),
      bodyWordCount: draft._meta.bodyWordCount,
      grounding: draft._meta.grounding,
    },
    generatedBy: 'omnira-article-pipeline',
    generatedAt: new Date().toISOString(),
  }

  const shouldAutoPublish = policy === 'high' && qa.confidence === 'high' && qa.pass

  // 3a. Auto-publish path (only when policy='high' AND confidence high).
  if (shouldAutoPublish) {
    const published = await publishArticle(destinationKey, {
      ...payload,
      published_at: new Date().toISOString(),
    })
    // Audit row, non-blocking — the publish is the source of truth.
    let approvalId: string | null = null
    try {
      const res = await createPublishApproval({ content, status: 'approved', runId })
      approvalId = res.approvalId
    } catch (e) {
      console.error('[article] auto-publish audit row failed:', e instanceof Error ? e.message : e)
    }
    await logRun({
      workflow: 'Publish to Website',
      status: 'done',
      context: { externalId: published.external_id, slug: published.slug, mode: 'auto' },
    })
    return {
      decision: 'auto_published',
      confidence: qa.confidence,
      qaPass: qa.pass,
      externalId: payload.external_id,
      approvalId,
      runId,
      published,
      policy,
      draftPreview: content.draftPreview,
    }
  }

  // 3b. Pending-approval path (default). Nothing reaches the website until a human approves.
  const { approvalId } = await createPublishApproval({ content, status: 'pending', runId })
  return {
    decision: 'pending_approval',
    confidence: qa.confidence,
    qaPass: qa.pass,
    externalId: payload.external_id,
    approvalId,
    runId,
    published: null,
    policy,
    draftPreview: content.draftPreview,
  }
}
