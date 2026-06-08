/**
 * lib/article/store.ts
 *
 * System A persistence — writes generated website content to `website_content`,
 * the authoritative editorial system of record (Atlas-owned). Generation only:
 * this NEVER publishes; the website is reached later, on approval.
 *
 * Strictly System A: references only `projects` and `website_content`. No contact
 * with media_scripts, social tables, or the marketing `approvals` queue.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { GeneratedArticle } from './index'

/** The Prompt's Omnira project. Articles + reels share this project; A/B
 *  separation is enforced at the TABLE level (website_content vs media_scripts). */
const SYSTEM_A_PROJECT_SLUG = 'ai-media-automation'

export type WebsiteContentType = 'article' | 'news' | 'blog' | 'guide' | 'evergreen'

export interface SaveGeneratedArticleArgs {
  generated: GeneratedArticle
  /** Soft provenance ref (no FK) when the content came from a news item. */
  newsItemId?: string | null
  contentType?: WebsiteContentType
  sourceKind?: 'news_item' | 'manual' | 'agent'
  generatedBy?: string
}

export interface SaveGeneratedArticleResult {
  id: string
  externalId: string
  status: 'pending_review'
}

/**
 * Persist a generated article as a pending-review row in website_content.
 * Idempotent on external_id (re-generation upserts the same logical item).
 */
export async function saveGeneratedArticle(
  args: SaveGeneratedArticleArgs,
): Promise<SaveGeneratedArticleResult> {
  const db = createAdminClient()
  const { draft, qa, payload } = args.generated

  // Resolve project_id from slug (dynamic; never hardcode the uuid).
  const { data: project } = await db
    .from('projects')
    .select('id')
    .eq('slug', SYSTEM_A_PROJECT_SLUG)
    .limit(1)
    .maybeSingle()
  const projectId = (project as { id?: string } | null)?.id
  if (!projectId) {
    throw new Error(`[website_content] System A project '${SYSTEM_A_PROJECT_SLUG}' not found`)
  }

  const meta = draft._meta

  const row = {
    project_id:    projectId,
    content_type:  args.contentType ?? 'article',
    source_kind:   args.sourceKind ?? (args.newsItemId ? 'news_item' : 'manual'),
    news_item_id:  args.newsItemId ?? null,
    external_id:   payload.external_id,
    title:         draft.title,
    slug:          payload.slug ?? null,
    summary:       draft.summary || null,
    payload,                                   // jsonb — full publish-contract payload (incl. body)
    qa,                                        // jsonb
    meta,                                      // jsonb
    model:         meta?.model ?? null,        // denormalized for Atlas reporting
    cost_usd:      meta?.estCostUsd ?? null,   // denormalized for Atlas reporting
    generated_by:  args.generatedBy ?? 'omnira-article-pipeline',
    status:        'pending_review' as const,  // never published here
    status_reason: 'Generated; awaiting Atlas review',
    updated_at:    new Date().toISOString(),
  }

  const { data, error } = await db
    .from('website_content')
    .upsert(row, { onConflict: 'external_id' })
    .select('id, external_id')
    .single()

  if (error) throw new Error(`[website_content] persist failed: ${error.message}`)

  const saved = data as { id: string; external_id: string }
  return { id: saved.id, externalId: saved.external_id, status: 'pending_review' }
}
