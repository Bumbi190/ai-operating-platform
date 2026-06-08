/**
 * lib/article/approval.ts
 *
 * Bridges the article pipeline to the EXISTING `approvals` primitive (no new tables).
 * Uses kind='article_publish' to namespace website-publish approvals so they don't
 * collide with the generic workflow approvals or the marketing (draft_posts) flow.
 *
 * - createPublishApproval(): store a generated article + QA in an approval row.
 *   content is TEXT in the DB → we JSON.stringify the structured payload.
 * - publishApprovedArticle(): on human approval, publish it live (idempotent).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { publishArticle } from '@/lib/publishing/publish'
import type { PublishPayload, PublishSuccess } from '@/lib/publishing/types'
import type { ArticleQa } from './types'

export const ARTICLE_APPROVAL_KIND = 'article_publish'
const MEDIA_PROJECT_SLUG = 'ai-media-automation'

/** Structured body we serialize into approvals.content (which is a TEXT column). */
export interface ArticleApprovalContent {
  kind: typeof ARTICLE_APPROVAL_KIND
  destinationKey: string
  newsItemId: string
  externalId: string
  payload: PublishPayload
  qa: ArticleQa
  draftPreview: {
    title: string
    summary: string
    category: string
    tags: string[]
    bodyWordCount: number
    grounding: string
  }
  generatedBy: string
  generatedAt: string
}

export function serializeApprovalContent(c: ArticleApprovalContent): string {
  return JSON.stringify(c)
}

export function parseApprovalContent(raw: string): ArticleApprovalContent {
  const parsed = JSON.parse(raw) as ArticleApprovalContent
  if (parsed.kind !== ARTICLE_APPROVAL_KIND || !parsed.payload?.external_id) {
    throw new Error('[article] approval content is not a valid article_publish payload')
  }
  return parsed
}

async function getMediaProjectId(db: ReturnType<typeof createAdminClient>): Promise<string | null> {
  const { data } = await db.from('projects').select('id').eq('slug', MEDIA_PROJECT_SLUG).limit(1).maybeSingle()
  return (data as { id?: string } | null)?.id ?? null
}

export interface CreatePublishApprovalArgs {
  content: ArticleApprovalContent
  /** 'pending' (awaits human) or 'approved' (auto, audit trail). */
  status: 'pending' | 'approved'
  runId?: string | null
}

export interface CreatePublishApprovalResult {
  approvalId: string | null
  status: 'pending' | 'approved'
}

/** Insert an article_publish approval row via the admin client (server-side only). */
export async function createPublishApproval(
  args: CreatePublishApprovalArgs,
): Promise<CreatePublishApprovalResult> {
  const db = createAdminClient()
  const projectId = await getMediaProjectId(db)

  const { data, error } = await db
    .from('approvals')
    .insert({
      kind: ARTICLE_APPROVAL_KIND,
      project_id: projectId,
      run_id: args.runId ?? null,
      output_key: args.content.externalId,
      content: serializeApprovalContent(args.content),
      status: args.status,
      reviewed_at: args.status === 'approved' ? new Date().toISOString() : null,
    })
    .select('id')
    .single()

  if (error) throw new Error(`[article] failed to create approval: ${error.message}`)
  return { approvalId: (data as { id?: string } | null)?.id ?? null, status: args.status }
}

/**
 * Publish an already-approved article live. Idempotent via external_id.
 * Sets published_at = now unless the stored payload already carries a future/explicit value.
 */
export async function publishApprovedArticle(approvalContentRaw: string): Promise<PublishSuccess> {
  const content = parseApprovalContent(approvalContentRaw)
  const payload: PublishPayload = {
    ...content.payload,
    // go live now unless a specific schedule was stored
    published_at: content.payload.published_at ?? new Date().toISOString(),
  }
  return publishArticle(content.destinationKey || 'the-prompt', payload)
}
