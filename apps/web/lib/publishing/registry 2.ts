/**
 * lib/publishing/registry.ts
 *
 * The destination registry — the reusable Omnira capability.
 *
 * A PublishDestination is destination-TYPE-agnostic: a Supabase-RPC site today,
 * a social/email/other adapter tomorrow (e.g. Familje's Meta publish) all satisfy
 * the same interface. Adding a destination = one registry entry, no core changes.
 */

import { createDestinationClient, type SupabaseDestinationEnv } from './client'
import {
  PublishError,
  isPublishErrorCode,
  type PublishPayload,
  type PublishStatus,
  type PublishSuccess,
  type UnpublishSuccess,
} from './types'

export interface PublishDestination {
  readonly key: string
  publish(payload: PublishPayload): Promise<PublishSuccess>
  unpublish(externalId: string): Promise<UnpublishSuccess>
}

// ── Error normalization (Supabase adapter) ──────────────────────────────────────

interface PostgrestLikeError {
  message?: string
  details?: string
  hint?: string
  code?: string // SQLSTATE
}

function toPublishError(error: PostgrestLikeError): PublishError {
  const raw = (error.message ?? '').trim()

  // A plpgsql RAISE surfaces our contract code as the message → non-retryable.
  if (isPublishErrorCode(raw)) {
    return new PublishError({ code: raw, message: raw, detail: error.details, retryable: false })
  }

  // Otherwise classify by SQLSTATE class: connection/resource/internal = retryable.
  const sqlstate = error.code ?? ''
  const retryable = /^(08|53|57|XX)/.test(sqlstate) || sqlstate === '40001' || sqlstate === '40P01'

  return new PublishError({
    code: 'unknown',
    message: raw || 'publish failed',
    detail: error.details,
    retryable,
    cause: error,
  })
}

// ── Supabase RPC adapter ─────────────────────────────────────────────────────────

export function createSupabaseRpcDestination(
  key: string,
  env: SupabaseDestinationEnv,
): PublishDestination {
  return {
    key,
    async publish(payload: PublishPayload): Promise<PublishSuccess> {
      const db = createDestinationClient(env)
      const { data, error } = await db.rpc('publish_article', { payload })
      if (error) throw toPublishError(error as PostgrestLikeError)
      return data as PublishSuccess
    },
    async unpublish(externalId: string): Promise<UnpublishSuccess> {
      const db = createDestinationClient(env)
      const { data, error } = await db.rpc('unpublish_article', { p_external_id: externalId })
      if (error) throw toPublishError(error as PostgrestLikeError)
      return data as UnpublishSuccess
    },
  }
}

// ── Mock adapter (in-memory) ─────────────────────────────────────────────────────
// Exists to prove the registry abstraction: publishArticle('mock', …) travels the
// exact same code path as a real destination and only diverges at the registry lookup.

export interface MockDestination extends PublishDestination {
  readonly calls: Array<{ method: 'publish' | 'unpublish'; arg: unknown }>
  reset(): void
}

function mockSlug(payload: PublishPayload): string {
  if (payload.slug) return payload.slug
  const base = (payload.title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'article'
}

export function createMockDestination(key = 'mock'): MockDestination {
  const store = new Map<string, PublishSuccess>()
  const calls: MockDestination['calls'] = []

  return {
    key,
    calls,
    reset() {
      store.clear()
      calls.length = 0
    },
    async publish(payload: PublishPayload): Promise<PublishSuccess> {
      calls.push({ method: 'publish', arg: payload })
      const existing = store.get(payload.external_id)
      const pub = payload.published_at ?? null
      const status: PublishStatus =
        pub === null ? 'draft' : new Date(pub) > new Date() ? 'scheduled' : 'published'
      const slug = existing?.slug ?? mockSlug(payload)
      const result: PublishSuccess = {
        ok: true,
        version: 1,
        id: existing?.id ?? `mock_${payload.external_id}`,
        external_id: payload.external_id,
        slug,
        status,
        published_at: pub,
        operation: existing ? 'updated' : 'created',
        created: !existing,
        published_url: `https://mock.local/articles/${slug}`,
      }
      store.set(payload.external_id, result)
      return result
    },
    async unpublish(externalId: string): Promise<UnpublishSuccess> {
      calls.push({ method: 'unpublish', arg: externalId })
      const existing = store.get(externalId)
      if (!existing) return { ok: true, external_id: externalId, found: false }
      store.set(externalId, { ...existing, status: 'draft', published_at: null })
      return { ok: true, external_id: externalId, found: true, status: 'draft' }
    },
  }
}

// ── Registry ──────────────────────────────────────────────────────────────────────

export const mockDestination = createMockDestination('mock')

export const DESTINATIONS: Record<string, PublishDestination> = {
  'the-prompt': createSupabaseRpcDestination('the-prompt', {
    urlEnv: 'THE_PROMPT_SUPABASE_URL',
    keyEnv: 'THE_PROMPT_SERVICE_ROLE_KEY',
  }),
  mock: mockDestination,
}

export function getDestination(key: string): PublishDestination {
  const dest = DESTINATIONS[key]
  if (!dest) {
    throw new Error(`[publishing] Unknown destination "${key}". Known: ${Object.keys(DESTINATIONS).join(', ')}`)
  }
  return dest
}

export function listDestinations(): string[] {
  return Object.keys(DESTINATIONS)
}
