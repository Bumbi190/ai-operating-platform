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
import { toJson } from '@/lib/supabase/json'
import type { Json } from '@/lib/supabase/database.types'
import type { GeneratedArticle } from './index'

/** The Prompt's Omnira project. Articles + reels share this project; A/B
 *  separation is enforced at the TABLE level (website_content vs media_scripts).
 *
 *  EXPORTED so a caller that must AUTHORISE this destination reads the same
 *  value the write uses. It deliberately is not taken from the spend constants:
 *  `MEDIA_PIPELINE_PROJECT_SLUG` happens to hold the same string today, and
 *  `lib/cost/governed-spend.ts` already records why sharing a value is not a
 *  reason to share a meaning — billing attribution is not authority, and
 *  neither is a content destination. Three separate facts, three named
 *  constants; if this one ever moves, the check moves with it. */
export const SYSTEM_A_PROJECT_SLUG = 'ai-media-automation'

export type WebsiteContentType = 'article' | 'news' | 'blog' | 'guide' | 'evergreen'

export interface SaveGeneratedArticleArgs {
  generated: GeneratedArticle
  /** Soft provenance ref (no FK) when the content came from a news item. */
  newsItemId?: string | null
  contentType?: WebsiteContentType
  sourceKind?: 'news_item' | 'manual' | 'agent'
  generatedBy?: string
  /** Merged over the draft's meta (e.g. the fact-check report). */
  extraMeta?: Record<string, unknown>
  /**
   * 'upsert' (default, existing behaviour): re-generation overwrites the row.
   * 'reviewable_only': never touch a row that has left pending_review — an
   * approved, published, rejected or failed article is the operator's, and an
   * automated re-run must not pull it back into the queue. Enforced in the
   * UPDATE's WHERE clause, so an approval racing this write wins.
   */
  writeMode?: 'upsert' | 'reviewable_only'
}

export interface SaveGeneratedArticleResult {
  id: string
  externalId: string
  status: 'pending_review'
}

export type SaveReviewableResult =
  | (SaveGeneratedArticleResult & { skippedReason?: undefined })
  | { id: string | null; externalId: string; status: null; skippedReason: string }

/**
 * Persist a generated article as a pending-review row in website_content.
 * Idempotent on external_id (re-generation upserts the same logical item).
 */
export async function saveGeneratedArticle(
  args: SaveGeneratedArticleArgs & { writeMode?: 'upsert' },
): Promise<SaveGeneratedArticleResult>
export async function saveGeneratedArticle(
  args: SaveGeneratedArticleArgs & { writeMode: 'reviewable_only' },
): Promise<SaveReviewableResult>
export async function saveGeneratedArticle(
  args: SaveGeneratedArticleArgs,
): Promise<SaveGeneratedArticleResult | SaveReviewableResult> {
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

  // ── Hero image workflow state (MVP Phase 1) ────────────────────────────────
  // Preservation rule: any NON-NULL hero_image_status means an operator workflow
  // is in progress, complete, or has produced artifacts worth keeping (a ready
  // image, a failed-attempt context, a QA report). Re-generation MUST NOT clobber
  // that state, or a regenerated article would wipe a previously approved hero.
  //
  // Otherwise (new article — no existing row — OR existing row with NULL status),
  // we INITIALIZE: clear url/qa, write the freshly generated prompt, and set
  // status='pending' to signal the operator that a hero is now expected.
  //
  // Read-then-write is not atomic w.r.t. concurrent writers, but the only path
  // that writes hero fields today is this function plus the operator endpoint
  // (lands in Commit 4); article re-generation is single-threaded per
  // external_id (gated by cron + manual trigger). Race acceptable for MVP.
  const existingHeroQuery = await db
    .from('website_content')
    .select('id, status, hero_image_url, hero_image_prompt, hero_image_status, hero_image_qa')
    .eq('external_id', payload.external_id)
    .maybeSingle()
  const existingHero = existingHeroQuery.data as
    | {
        id: string
        status: string
        hero_image_url: string | null
        hero_image_prompt: string | null
        hero_image_status: string | null
        hero_image_qa: Json | null
      }
    | null

  const draftHeroPrompt =
    typeof draft.hero_image_prompt === 'string' && draft.hero_image_prompt.trim()
      ? draft.hero_image_prompt
      : null

  const heroFields: {
    hero_image_url: string | null
    hero_image_prompt: string | null
    hero_image_status: string
    hero_image_qa: Json | null
  } =
    existingHero && existingHero.hero_image_status != null
      ? {
          hero_image_url:    existingHero.hero_image_url,
          hero_image_prompt: existingHero.hero_image_prompt,
          hero_image_status: existingHero.hero_image_status,
          hero_image_qa:     existingHero.hero_image_qa,
        }
      : {
          hero_image_url:    null,
          hero_image_prompt: draftHeroPrompt,
          hero_image_status: 'pending',
          hero_image_qa:     null,
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
    payload: toJson(payload),                  // jsonb — full publish-contract payload (incl. body)
    qa: toJson(qa),                            // jsonb
    meta: toJson(args.extraMeta ? { ...meta, ...args.extraMeta } : meta), // jsonb
    model:         meta?.model ?? null,        // denormalized for Atlas reporting
    cost_usd:      meta?.estCostUsd ?? null,   // denormalized for Atlas reporting
    generated_by:  args.generatedBy ?? 'omnira-article-pipeline',
    status:        'pending_review' as const,  // never published here
    status_reason: 'Generated; awaiting Atlas review',
    updated_at:    new Date().toISOString(),
    ...heroFields,
  }

  if (args.writeMode === 'reviewable_only') {
    if (existingHero && existingHero.status !== 'pending_review') {
      return { id: existingHero.id, externalId: payload.external_id, status: null,
        skippedReason: `existing_row_${existingHero.status}` }
    }
    const write = existingHero
      ? db.from('website_content').update(row)
          .eq('external_id', payload.external_id).eq('status', 'pending_review')
          .select('id, external_id').maybeSingle()
      : db.from('website_content').insert(row).select('id, external_id').maybeSingle()
    const { data: written, error: writeErr } = await write
    if (writeErr) {
      // 23505: a concurrent writer created the row between our read and insert.
      if ((writeErr as { code?: string }).code === '23505') {
        return { id: null, externalId: payload.external_id, status: null, skippedReason: 'concurrent_insert' }
      }
      throw new Error(`[website_content] persist failed: ${writeErr.message}`)
    }
    if (!written) {
      return { id: existingHero?.id ?? null, externalId: payload.external_id, status: null,
        skippedReason: 'left_pending_review_concurrently' }
    }
    const w = written as { id: string; external_id: string }
    return { id: w.id, externalId: w.external_id, status: 'pending_review' }
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
