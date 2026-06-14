/**
 * Tests for saveGeneratedArticle — hero image workflow state preservation.
 *
 * Located in lib/qa/ to match the project's vitest.config include pattern
 * (lib/qa/**\/*.test.ts, lib/nav/**\/*.test.ts).
 *
 * Covers the MVP Commit 2 spec:
 *  1. New article (no existing row)                       → INITIALIZE (pending)
 *  2. Existing article with NULL hero_image_status        → INITIALIZE (pending)
 *  3. Existing article with hero_image_status='ready'     → PRESERVE all hero fields
 *  4. Existing article with hero_image_status='failed'    → PRESERVE all hero fields
 *  5. Existing article with hero_image_status='rejected_qa' → PRESERVE all hero fields
 *
 * The Supabase admin client is mocked; the test exercises only the decision
 * logic — what gets passed to .upsert().
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mutable state the mock reads from on each call.
let existingHero:
  | {
      hero_image_url: string | null
      hero_image_prompt: string | null
      hero_image_status: string | null
      hero_image_qa: unknown
    }
  | null = null
let upsertedRow: Record<string, unknown> | null = null

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: { id: 'project-uuid' }, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'website_content') {
        return {
          // Read path — store.ts inspects existing hero workflow state.
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: existingHero, error: null }),
            }),
          }),
          // Write path — capture the row store.ts would have persisted.
          upsert: (row: Record<string, unknown>) => {
            upsertedRow = row
            return {
              select: () => ({
                single: async () => ({
                  data: { id: 'row-uuid', external_id: row.external_id },
                  error: null,
                }),
              }),
            }
          },
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }),
}))

// Must come AFTER vi.mock so the mocked admin client is what store.ts loads.
import { saveGeneratedArticle } from '@/lib/article/store'

const EXTERNAL_ID = 'omnira_test-news-1'
const NEW_PROMPT = 'Editorial photojournalism: server racks at dusk'

function makeArgs(heroPrompt: string | null = NEW_PROMPT) {
  return {
    generated: {
      draft: {
        title: 'Test Article',
        summary: 'Summary',
        body: 'Body',
        category: 'news',
        tags: [],
        hero_image_prompt: heroPrompt,
        source_url: null,
        source_name: null,
        _meta: { model: 'claude-sonnet-4-6', estCostUsd: 0.012 },
      } as never,
      qa: { pass: true, issues: [], confidence: 'high' as const } as never,
      payload: {
        version: 1 as const,
        external_id: EXTERNAL_ID,
        title: 'Test Article',
        summary: 'Summary',
        body: 'Body',
        category: { slug: 'news' },
        tags: [],
        published_at: null,
      } as never,
    },
    newsItemId: 'test-news-1',
  }
}

describe('saveGeneratedArticle — hero workflow state preservation (MVP Commit 2)', () => {
  beforeEach(() => {
    existingHero = null
    upsertedRow = null
  })

  it('1. NEW article: writes pending, fresh prompt, null url/qa', async () => {
    existingHero = null
    await saveGeneratedArticle(makeArgs(NEW_PROMPT))
    expect(upsertedRow).not.toBeNull()
    expect(upsertedRow!.hero_image_status).toBe('pending')
    expect(upsertedRow!.hero_image_prompt).toBe(NEW_PROMPT)
    expect(upsertedRow!.hero_image_url).toBeNull()
    expect(upsertedRow!.hero_image_qa).toBeNull()
  })

  it('2. EXISTING with NULL status: initializes to pending with refreshed prompt', async () => {
    existingHero = {
      hero_image_url: null,
      hero_image_prompt: 'stale prompt from prior draft',
      hero_image_status: null,
      hero_image_qa: null,
    }
    await saveGeneratedArticle(makeArgs(NEW_PROMPT))
    expect(upsertedRow!.hero_image_status).toBe('pending')
    expect(upsertedRow!.hero_image_prompt).toBe(NEW_PROMPT)
    expect(upsertedRow!.hero_image_url).toBeNull()
    expect(upsertedRow!.hero_image_qa).toBeNull()
  })

  it('3. EXISTING with status=ready: ALL hero fields preserved (operator approval is sacred)', async () => {
    existingHero = {
      hero_image_url:
        'https://iboepohjwrhtgshrqaol.supabase.co/storage/v1/object/public/media-assets/images/articles/project-uuid/article-hero-1234567890.jpg',
      hero_image_prompt: 'operator-approved prompt',
      hero_image_status: 'ready',
      hero_image_qa: { passed: true, score: 8.5, mode: 'editorial-article' },
    }
    await saveGeneratedArticle(makeArgs('a completely different new prompt'))
    expect(upsertedRow!.hero_image_status).toBe('ready')
    expect(upsertedRow!.hero_image_url).toBe(existingHero.hero_image_url)
    expect(upsertedRow!.hero_image_prompt).toBe('operator-approved prompt')
    expect(upsertedRow!.hero_image_qa).toEqual({ passed: true, score: 8.5, mode: 'editorial-article' })
  })

  it('4. EXISTING with status=failed: preserves prompt/url/qa so operator can retry from context', async () => {
    existingHero = {
      hero_image_url: null,
      hero_image_prompt: 'prompt that failed Ideogram call',
      hero_image_status: 'failed',
      hero_image_qa: null,
    }
    await saveGeneratedArticle(makeArgs(NEW_PROMPT))
    expect(upsertedRow!.hero_image_status).toBe('failed')
    expect(upsertedRow!.hero_image_prompt).toBe('prompt that failed Ideogram call')
    expect(upsertedRow!.hero_image_url).toBeNull()
    expect(upsertedRow!.hero_image_qa).toBeNull()
  })

  it('5. EXISTING with status=rejected_qa: preserves QA report (diagnostic value)', async () => {
    existingHero = {
      hero_image_url:
        'https://iboepohjwrhtgshrqaol.supabase.co/storage/v1/object/public/media-assets/images/articles/project-uuid/article-hero-9999999999.jpg',
      hero_image_prompt: 'prompt that produced an off-brand image',
      hero_image_status: 'rejected_qa',
      hero_image_qa: { passed: false, score: 4.2, reasons: ['cinematic lighting', 'abstract AI orbs'] },
    }
    await saveGeneratedArticle(makeArgs(NEW_PROMPT))
    expect(upsertedRow!.hero_image_status).toBe('rejected_qa')
    expect(upsertedRow!.hero_image_url).toBe(existingHero.hero_image_url)
    expect(upsertedRow!.hero_image_prompt).toBe('prompt that produced an off-brand image')
    expect(upsertedRow!.hero_image_qa).toEqual({
      passed: false,
      score: 4.2,
      reasons: ['cinematic lighting', 'abstract AI orbs'],
    })
  })
})
