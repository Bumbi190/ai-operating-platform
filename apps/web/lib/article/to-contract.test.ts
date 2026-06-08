/**
 * M1↔M0 seam — toPublishPayload / externalIdForNewsItem.
 *
 * Locks the contract mapping that every publish depends on: deterministic
 * (idempotent) external_id, required category, tag/source mapping, and the
 * draft-by-default lifecycle. Pure functions — no network, no DB.
 */
import { describe, it, expect } from 'vitest'
import { toPublishPayload, externalIdForNewsItem, EXTERNAL_ID_PREFIX } from './to-contract'
import type { ArticleDraft } from './types'

const draft = (over: Partial<ArticleDraft> = {}): ArticleDraft =>
  ({
    title: 'Anthropic ships X',
    summary: 'A short summary.',
    body: '# Heading\n\nBody text.',
    category: 'news',
    tags: [{ slug: 'ai', name: 'AI' }, { slug: 'anthropic', name: 'Anthropic' }],
    source_url: 'https://example.com/x',
    source_name: 'Example',
    ...over,
  }) as ArticleDraft

describe('externalIdForNewsItem', () => {
  it('is deterministic and prefixed (idempotent re-publish key)', () => {
    expect(externalIdForNewsItem('abc')).toBe(`${EXTERNAL_ID_PREFIX}abc`)
    expect(externalIdForNewsItem('abc')).toBe(externalIdForNewsItem('abc'))
  })
})

describe('toPublishPayload', () => {
  it('produces a v1 payload with deterministic external_id and required fields', () => {
    const p = toPublishPayload(draft(), { newsItemId: 'n1' })
    expect(p.version).toBe(1)
    expect(p.external_id).toBe(externalIdForNewsItem('n1'))
    expect(p.title).toBe('Anthropic ships X')
    expect(p.category).toEqual({ slug: 'news' })
    expect(p.tags).toEqual([{ slug: 'ai', name: 'AI' }, { slug: 'anthropic', name: 'Anthropic' }])
    expect(p.source).toEqual({ url: 'https://example.com/x', name: 'Example' })
  })

  it('defaults to DRAFT lifecycle (published_at null) when not provided', () => {
    expect(toPublishPayload(draft(), { newsItemId: 'n1' }).published_at).toBeNull()
  })

  it('passes through a scheduled/published timestamp', () => {
    const when = '2026-06-08T10:00:00.000Z'
    expect(toPublishPayload(draft(), { newsItemId: 'n1', publishedAt: when }).published_at).toBe(when)
  })

  it('includes hero_image_url only when supplied', () => {
    expect(toPublishPayload(draft(), { newsItemId: 'n1' }).hero_image_url).toBeUndefined()
    const withHero = toPublishPayload(draft(), { newsItemId: 'n1', heroImageUrl: 'https://img/x.png' })
    expect(withHero.hero_image_url).toBe('https://img/x.png')
  })

  it('omits source when the draft has neither url nor name', () => {
    const p = toPublishPayload(draft({ source_url: undefined, source_name: undefined }), { newsItemId: 'n1' })
    expect(p.source).toBeUndefined()
  })

  it('maps empty summary to null', () => {
    const p = toPublishPayload(draft({ summary: '' }), { newsItemId: 'n1' })
    expect(p.summary).toBeNull()
  })
})
