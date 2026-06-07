/**
 * lib/article/to-contract.ts
 *
 * Map a generated ArticleDraft → v1 publish contract payload.
 * external_id is derived deterministically from the source news item so re-publish
 * is an idempotent PATCH (never a duplicate).
 */

import type { PublishPayload } from '@/lib/publishing/types'
import type { ArticleDraft } from './types'

export const EXTERNAL_ID_PREFIX = 'omnira_'

export function externalIdForNewsItem(newsItemId: string): string {
  return `${EXTERNAL_ID_PREFIX}${newsItemId}`
}

export interface ToPayloadOptions {
  /** The source news item id → external_id. */
  newsItemId: string
  /** Lifecycle: null = draft, ISO future = scheduled, ISO past/now = published. Default draft. */
  publishedAt?: string | null
  /** Optional resolved hero image URL (https) if the image step already ran. */
  heroImageUrl?: string | null
}

export function toPublishPayload(draft: ArticleDraft, opts: ToPayloadOptions): PublishPayload {
  const payload: PublishPayload = {
    version: 1,
    external_id: externalIdForNewsItem(opts.newsItemId),
    title: draft.title,
    summary: draft.summary || null,
    body: draft.body,
    category: { slug: draft.category },
    tags: draft.tags.map((t) => ({ slug: t.slug, name: t.name })),
    published_at: opts.publishedAt ?? null,
  }

  if (opts.heroImageUrl) payload.hero_image_url = opts.heroImageUrl

  if (draft.source_url || draft.source_name) {
    payload.source = { url: draft.source_url ?? null, name: draft.source_name ?? null }
  }

  return payload
}
