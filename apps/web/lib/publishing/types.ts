/**
 * lib/publishing/types.ts
 *
 * Omnira publishing contract v1 — shared TypeScript types.
 * Destination-agnostic: these describe the *contract*, not any one site.
 * Mirrors docs/omnira-publish-contract-v1.md + the two approved adjustments
 * (category must-exist → category_not_found; response carries operation + published_url).
 */

// ── Payload (input) ───────────────────────────────────────────────────────────

export interface ArticleCategoryInput {
  slug: string
  name?: string
}

export interface ArticleTagInput {
  slug: string
  name?: string
}

export interface ArticleSourceInput {
  url?: string | null
  name?: string | null
}

/**
 * The single payload accepted by publish_article(jsonb).
 * PATCH semantics on update: only present keys change; explicit null clears.
 *
 * `atlas_signals` (added in v1.1 — Atlas Phase 2) uses REPLACE-on-write
 * semantics on the destination side instead of field-by-field PATCH: when
 * present, the full object replaces the destination column; when absent,
 * the column is preserved untouched. It is a denormalized latest-per-kind
 * cache for fast frontend rendering — NOT the authoritative signal history.
 * Authoritative history lives in Omnira's public.atlas_signals table.
 */
export interface PublishPayload {
  version: 1
  external_id: string
  title?: string
  slug?: string | null
  summary?: string | null
  body?: string | null
  hero_image_url?: string | null
  category?: ArticleCategoryInput | null
  tags?: ArticleTagInput[] | null
  source?: ArticleSourceInput | null
  published_at?: string | null
  atlas_signals?: Record<string, unknown> | null
}

// ── Responses (output) ─────────────────────────────────────────────────────────

export type PublishStatus = 'draft' | 'scheduled' | 'published'
export type PublishOperation = 'created' | 'updated'

export interface PublishSuccess {
  ok: true
  version: number
  id: string
  external_id: string
  slug: string
  status: PublishStatus
  published_at: string | null
  operation: PublishOperation
  created: boolean
  published_url: string
}

export interface UnpublishSuccess {
  ok: true
  external_id: string
  found: boolean
  status?: 'draft'
}

// ── Errors ──────────────────────────────────────────────────────────────────────

/** Stable contract error codes raised by the RPC (returned as the exception message). */
export const PUBLISH_ERROR_CODES = [
  'invalid_payload',
  'unsupported_version',
  'missing_external_id',
  'missing_title',
  'invalid_category',
  'category_not_found',
  'invalid_url',
  'invalid_published_at',
  'invalid_tags',
  'invalid_slug',
  'slug_conflict',
] as const

export type PublishErrorCode = (typeof PUBLISH_ERROR_CODES)[number]

export function isPublishErrorCode(value: string): value is PublishErrorCode {
  return (PUBLISH_ERROR_CODES as readonly string[]).includes(value)
}

/**
 * Normalized error for every publishing failure.
 * `retryable=false` for contract validation errors (fix and resend);
 * `retryable=true` for transient transport/DB faults (safe to retry — RPC is idempotent).
 */
export class PublishError extends Error {
  readonly code: PublishErrorCode | 'unknown'
  readonly detail?: string
  readonly retryable: boolean
  readonly cause?: unknown

  constructor(args: {
    code: PublishErrorCode | 'unknown'
    message: string
    detail?: string
    retryable: boolean
    cause?: unknown
  }) {
    super(args.message)
    this.name = 'PublishError'
    this.code = args.code
    this.detail = args.detail
    this.retryable = args.retryable
    this.cause = args.cause
  }
}
