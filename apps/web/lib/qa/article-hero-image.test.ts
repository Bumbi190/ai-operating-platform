/**
 * Tests for generateHeroImage — MVP Commit 3.
 *
 * Located in lib/qa/ per vitest.config include pattern.
 *
 * Coverage:
 *  1. Happy path: load → generate → upload → status='ready', URL set, cost logged.
 *  2. Idempotency: existing status='generating' returns 'skipped', no Ideogram call.
 *  3. Article not found: returns 'failed' without firing any pipeline call.
 *  4. Automation paused: returns 'skipped' citing the operator pause reason.
 *  5. Ideogram throws: status='failed', alert sent, no URL set.
 *  6. Upload throws after Ideogram succeeds: status='failed', alert sent.
 *  7. Prompt fallback: hero_image_prompt → summary → title, in that order.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mutable mock state ───────────────────────────────────────────────────────
let storedRow: Record<string, unknown> | null = null
let updateCaptures: Array<Record<string, unknown>> = []
let alertCaptures: Array<Record<string, unknown>> = []
let costCaptures: Array<{ count: number; provider: string; ctx: Record<string, unknown> }> = []
let ideogramCalls: Array<{ headline: string; body: string }> = []
let uploadCalls: Array<{ projectId: string; articleId: string; sourceUrl: string }> = []
let ideogramShouldThrow: string | null = null
let uploadShouldThrow: string | null = null
let automationPause: { allowed: boolean; reason?: string } = { allowed: true }

// Hero Image V2 (Commit C) shadow-mode capture surface.
let editorCalls: Array<Record<string, unknown>> = []
let editorShouldThrow: string | null = null
let mockEditorBrief: Record<string, unknown> = {
  story: 'Test story sentence.',
  visual_metaphor: 'Test visual metaphor.',
  shot: 'Test shot description anchored to a real subject.',
  avoid: ['test cliche'],
  editorial_style: 'Wired',
}

// Hero Image V2 Phase 2A — brief-driven renderer capture surface.
let articleHeroCalls: Array<{ brief: Record<string, unknown> }> = []
let articleHeroShouldThrow: string | null = null
const ARTICLE_HERO_URL = 'https://ideogram.example/brief-driven-hero.png'
const ARTICLE_HERO_INPUT = {
  prompt: 'brief.shot — Economist style ref — centered subject',
  negative_prompt: 'server racks, …',
  aspect_ratio: '16x10',
  style_type: 'REALISTIC',
}

// ── Mocks (must come BEFORE the import of the module under test) ─────────────
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'website_content') throw new Error(`unexpected table: ${table}`)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: storedRow, error: null }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async () => {
            updateCaptures.push(patch)
            if (storedRow) storedRow = { ...storedRow, ...patch }
            return { error: null }
          },
        }),
      }
    },
  }),
}))

vi.mock('@/lib/media/ideogram', () => ({
  generateNewsImage: async (headline: string, body: string) => {
    ideogramCalls.push({ headline, body })
    if (ideogramShouldThrow) throw new Error(ideogramShouldThrow)
    return 'https://ideogram.example/temp-hero.jpg'
  },
  generateArticleHeroImage: async (brief: Record<string, unknown>) => {
    articleHeroCalls.push({ brief })
    if (articleHeroShouldThrow) throw new Error(articleHeroShouldThrow)
    return { url: ARTICLE_HERO_URL, input: ARTICLE_HERO_INPUT }
  },
}))

vi.mock('@/lib/media/storage', () => ({
  uploadArticleHeroImage: async (projectId: string, articleId: string, sourceUrl: string) => {
    uploadCalls.push({ projectId, articleId, sourceUrl })
    if (uploadShouldThrow) throw new Error(uploadShouldThrow)
    return `https://supabase.example/storage/v1/object/public/media-assets/images/articles/${projectId}/${articleId}-hero-1234567890.jpg`
  },
}))

vi.mock('@/lib/media/retry', () => ({
  // Pass-through wrapper — exercising the retry logic is retry.ts's own test surface.
  withRetry: async <T,>(fn: () => Promise<T>) => fn(),
}))

vi.mock('@/lib/media/safeguards', () => ({
  checkAutomationPaused: async () => automationPause,
}))

vi.mock('@/lib/media/alert', () => ({
  sendPipelineAlert: async (opts: Record<string, unknown>) => {
    alertCaptures.push(opts)
  },
}))

vi.mock('@/lib/cost/track', () => ({
  logImageCost: async (count: number, provider: string, ctx: Record<string, unknown>) => {
    costCaptures.push({ count, provider, ctx })
  },
  logLlmCost: async () => undefined,
}))

vi.mock('@/lib/article/photo-editor', () => ({
  PHOTO_EDITOR_MODEL: 'claude-sonnet-4-6',
  runPhotoEditor: async (input: Record<string, unknown>) => {
    editorCalls.push(input)
    if (editorShouldThrow) throw new Error(editorShouldThrow)
    return mockEditorBrief
  },
}))

// Post-regen sync to The Prompt — mocked so this suite stays focused on the
// hero pipeline. The sync primitive itself has its own coverage in
// publish-sync.test.ts. Here we only assert the integration: that the sync is
// invoked on success and that its result is surfaced through HeroImageResult
// without rolling back the hero write.
let syncCalls: string[] = []
let mockSyncResult: { ok: boolean; status: string; reason?: string } = { ok: true, status: 'synced' }
vi.mock('@/lib/publishing/sync', () => ({
  syncPublishedArticle: async (articleId: string) => {
    syncCalls.push(articleId)
    return mockSyncResult
  },
}))

// Must come AFTER all vi.mock calls so the mocks are what hero-image.ts loads.
import { generateHeroImage } from '@/lib/article/hero-image'

const ARTICLE_ID = 'article-uuid-1'
const PROJECT_ID = 'project-uuid-1'

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: ARTICLE_ID,
    project_id: PROJECT_ID,
    title: 'AI agents now book your flights',
    summary: 'Travel-agent startups report bookings climbing 4x after agent integration.',
    payload: {
      body: 'Body excerpt for the photo editor agent to reason from.',
      category: 'business',
      tags: [{ slug: 'ai-agents', name: 'AI agents' }],
    },
    hero_image_prompt: 'Editorial photo: empty travel agency office at dusk',
    hero_image_status: null,
    ...overrides,
  }
}

// Hero Image V2 (Commit C): the row receives THREE updates on the happy path
// — claim (generating), image finalize (ready), and the shadow brief. The
// existing length assertions split the brief update out so the existing
// behavior stays unambiguously assertable.
function imageUpdates() {
  return updateCaptures.filter((u) => !('hero_editor_brief' in u))
}
function briefUpdates() {
  return updateCaptures.filter((u) => 'hero_editor_brief' in u)
}

describe('generateHeroImage — MVP Commit 3 + Hero Image V2 shadow', () => {
  beforeEach(() => {
    storedRow = null
    updateCaptures = []
    alertCaptures = []
    costCaptures = []
    ideogramCalls = []
    uploadCalls = []
    ideogramShouldThrow = null
    uploadShouldThrow = null
    automationPause = { allowed: true }
    editorCalls = []
    editorShouldThrow = null
    mockEditorBrief = {
      story: 'Test story sentence.',
      visual_metaphor: 'Test visual metaphor.',
      shot: 'Test shot description anchored to a real subject.',
      avoid: ['test cliche'],
      editorial_style: 'Wired',
    }
    articleHeroCalls = []
    articleHeroShouldThrow = null
    syncCalls = []
    mockSyncResult = { ok: true, status: 'synced' }
    delete process.env.HERO_V2_BRIEF_DRIVES_IMAGE
  })

  it('1. happy path: ready + url set, cost logged with articleId metadata, two updates (generating → ready)', async () => {
    storedRow = row()
    const result = await generateHeroImage(ARTICLE_ID)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe('ready')
      expect(result.url).toContain(`images/articles/${PROJECT_ID}/${ARTICLE_ID}-hero-`)
    }

    expect(ideogramCalls).toHaveLength(1)
    expect(uploadCalls).toHaveLength(1)
    expect(uploadCalls[0].projectId).toBe(PROJECT_ID)
    expect(uploadCalls[0].articleId).toBe(ARTICLE_ID)

    expect(costCaptures).toHaveLength(1)
    expect(costCaptures[0].count).toBe(1)
    expect(costCaptures[0].provider).toBe('ideogram')
    expect(costCaptures[0].ctx.operation).toBe('Article Hero Image')
    expect((costCaptures[0].ctx.metadata as Record<string, unknown>).articleId).toBe(ARTICLE_ID)
    expect(costCaptures[0].ctx.projectId).toBe(PROJECT_ID)

    expect(alertCaptures).toHaveLength(0)

    // Two image updates: claim (generating) then finalize (ready + url)
    const img = imageUpdates()
    expect(img).toHaveLength(2)
    expect(img[0].hero_image_status).toBe('generating')
    expect(img[1].hero_image_status).toBe('ready')
    expect(img[1].hero_image_url).toContain('media-assets/images/articles/')
  })

  it('2. idempotent: existing status=generating returns skipped, no Ideogram/upload/cost/alert', async () => {
    storedRow = row({ hero_image_status: 'generating' })
    const result = await generateHeroImage(ARTICLE_ID)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe('skipped')
      expect(result.reason).toBe('already_generating')
    }
    expect(ideogramCalls).toHaveLength(0)
    expect(uploadCalls).toHaveLength(0)
    expect(costCaptures).toHaveLength(0)
    expect(alertCaptures).toHaveLength(0)
    expect(updateCaptures).toHaveLength(0)
  })

  it('3. article not found: returns failed, no side effects', async () => {
    storedRow = null
    const result = await generateHeroImage(ARTICLE_ID)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe('failed')
      expect(result.reason).toBe('article not found')
    }
    expect(ideogramCalls).toHaveLength(0)
    expect(uploadCalls).toHaveLength(0)
    expect(alertCaptures).toHaveLength(0)
  })

  it('4. automation paused: returns skipped with operator reason, no work claimed', async () => {
    storedRow = row()
    automationPause = { allowed: false, reason: 'Automation pausad: incident pågår' }

    const result = await generateHeroImage(ARTICLE_ID)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe('skipped')
      expect(result.reason).toBe('Automation pausad: incident pågår')
    }
    expect(ideogramCalls).toHaveLength(0)
    expect(updateCaptures).toHaveLength(0)  // no claim when paused
  })

  it('5. Ideogram throws: status=failed, alert sent with context, no URL set', async () => {
    storedRow = row()
    ideogramShouldThrow = 'Ideogram API error 503: upstream timeout'

    const result = await generateHeroImage(ARTICLE_ID)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe('failed')
      expect(result.reason).toContain('Ideogram API error 503')
    }
    expect(uploadCalls).toHaveLength(0)
    expect(costCaptures).toHaveLength(0)

    expect(alertCaptures).toHaveLength(1)
    expect(alertCaptures[0].cronRoute).toBe('articles/hero-image')
    expect(alertCaptures[0].step).toBe('generate_hero')
    expect(alertCaptures[0].severity).toBe('warning')
    expect((alertCaptures[0].context as Record<string, unknown>).articleId).toBe(ARTICLE_ID)

    // Two image updates: claim (generating) then failure (failed)
    const img = imageUpdates()
    expect(img).toHaveLength(2)
    expect(img[1].hero_image_status).toBe('failed')
    expect(img[1]).not.toHaveProperty('hero_image_url')
  })

  it('6. upload throws after Ideogram succeeds: status=failed, alert sent, cost NOT logged', async () => {
    storedRow = row()
    uploadShouldThrow = 'Article hero upload failed: bucket quota exceeded'

    const result = await generateHeroImage(ARTICLE_ID)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe('failed')
    }
    expect(ideogramCalls).toHaveLength(1)
    expect(uploadCalls).toHaveLength(1)
    // Cost is logged AFTER successful upload, so a failed upload should not log spend.
    expect(costCaptures).toHaveLength(0)
    expect(alertCaptures).toHaveLength(1)
    const img = imageUpdates()
    expect(img[1].hero_image_status).toBe('failed')
  })

  it('7. prompt fallback hierarchy: prompt → summary → title', async () => {
    // 7a: hero_image_prompt present → wins
    storedRow = row({
      hero_image_prompt: 'PROMPT_WINS',
      summary: 'SUMMARY_LOSES',
      title: 'TITLE_LOSES',
    })
    await generateHeroImage(ARTICLE_ID)
    expect(ideogramCalls[0].body).toBe('PROMPT_WINS')
    expect(ideogramCalls[0].headline).toBe('TITLE_LOSES')

    // 7b: hero_image_prompt null → falls back to summary
    ideogramCalls = []
    updateCaptures = []
    costCaptures = []
    storedRow = row({
      hero_image_prompt: null,
      summary: 'SUMMARY_WINS',
      title: 'TITLE_HEADLINE',
    })
    await generateHeroImage(ARTICLE_ID)
    expect(ideogramCalls[0].body).toBe('SUMMARY_WINS')
    expect(ideogramCalls[0].headline).toBe('TITLE_HEADLINE')

    // 7c: prompt + summary null → falls back to title for body too
    ideogramCalls = []
    updateCaptures = []
    costCaptures = []
    storedRow = row({
      hero_image_prompt: null,
      summary: null,
      title: 'TITLE_FALLBACK',
    })
    await generateHeroImage(ARTICLE_ID)
    expect(ideogramCalls[0].body).toBe('TITLE_FALLBACK')
    expect(ideogramCalls[0].headline).toBe('TITLE_FALLBACK')

    // 7d: title also missing → safe default headline AND body
    ideogramCalls = []
    updateCaptures = []
    costCaptures = []
    storedRow = row({
      hero_image_prompt: null,
      summary: null,
      title: null,
    })
    await generateHeroImage(ARTICLE_ID)
    expect(ideogramCalls[0].headline).toBe('AI news brief')
    expect(ideogramCalls[0].body).toBe('AI news brief')
  })

  // ── Hero Image V2 — shadow integration tests ──────────────────────────────

  it('8. shadow: runPhotoEditor receives body/category/tags from payload', async () => {
    storedRow = row()
    await generateHeroImage(ARTICLE_ID)

    expect(editorCalls).toHaveLength(1)
    expect(editorCalls[0].title).toBe('AI agents now book your flights')
    expect(editorCalls[0].summary).toContain('Travel-agent startups')
    expect(editorCalls[0].body).toBe('Body excerpt for the photo editor agent to reason from.')
    expect(editorCalls[0].category).toBe('business')
    expect(editorCalls[0].tags).toEqual(['ai-agents'])
  })

  it('9. shadow: brief is persisted into hero_editor_brief with metadata { generated_at, model }', async () => {
    storedRow = row()
    await generateHeroImage(ARTICLE_ID)

    const briefs = briefUpdates()
    expect(briefs).toHaveLength(1)
    const brief = briefs[0].hero_editor_brief as Record<string, unknown>
    expect(brief.story).toBe('Test story sentence.')
    expect(brief.visual_metaphor).toBe('Test visual metaphor.')
    expect(brief.shot).toContain('anchored to a real subject')
    expect(brief.avoid).toEqual(['test cliche'])
    expect(brief.editorial_style).toBe('Wired')
    const meta = brief.metadata as Record<string, unknown>
    expect(typeof meta.generated_at).toBe('string')
    expect(meta.model).toBe('claude-sonnet-4-6')
  })

  it('10. shadow: brief generation failure does NOT block image generation', async () => {
    storedRow = row()
    editorShouldThrow = 'Anthropic 503 on the editor brief'
    const result = await generateHeroImage(ARTICLE_ID)

    // Image flow STILL succeeds end-to-end despite the brief failure.
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe('ready')
      expect(result.url).toContain('media-assets/images/articles/')
    }
    expect(ideogramCalls).toHaveLength(1)
    expect(uploadCalls).toHaveLength(1)

    // No brief update persisted — the only updates are the image flow's two.
    expect(briefUpdates()).toHaveLength(0)
    expect(imageUpdates()).toHaveLength(2)
  })

  it('11. shadow: brief is attempted even when image generation fails', async () => {
    storedRow = row()
    ideogramShouldThrow = 'Ideogram outage'
    await generateHeroImage(ARTICLE_ID)

    expect(editorCalls).toHaveLength(1)
    expect(briefUpdates()).toHaveLength(1) // brief lands even though image failed
    const img = imageUpdates()
    expect(img[1].hero_image_status).toBe('failed')
  })

  it('12. shadow: paused automation skips both image AND editor brief', async () => {
    storedRow = row()
    automationPause = { allowed: false, reason: 'Automation paused' }
    await generateHeroImage(ARTICLE_ID)

    expect(ideogramCalls).toHaveLength(0)
    expect(editorCalls).toHaveLength(0)
    expect(briefUpdates()).toHaveLength(0)
  })

  // ── Hero Image V2 Phase 2A — flag-driven brief→render ─────────────────────

  it('13. Phase 2A: flag OFF preserves Phase 1 shadow behavior — writer path, no brief in render', async () => {
    storedRow = row()
    delete process.env.HERO_V2_BRIEF_DRIVES_IMAGE
    const result = await generateHeroImage(ARTICLE_ID)

    expect(result.ok).toBe(true)
    // writer path used → generateNewsImage, NOT generateArticleHeroImage
    expect(ideogramCalls).toHaveLength(1)
    expect(articleHeroCalls).toHaveLength(0)
    // brief still landed (shadow Phase 1)
    expect(briefUpdates()).toHaveLength(1)
    // image-result update marks source as fallback_writer; no render_input
    const img = imageUpdates()
    expect(img[1].hero_image_source).toBe('fallback_writer')
    expect(img[1].hero_image_render_input).toBeNull()
  })

  it('14. Phase 2A: flag ON + brief OK → generateArticleHeroImage drives, source="brief", render_input persisted', async () => {
    storedRow = row()
    process.env.HERO_V2_BRIEF_DRIVES_IMAGE = '1'
    const result = await generateHeroImage(ARTICLE_ID)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.url).toContain('media-assets/images/articles/')
    }
    // brief-driven path used — old generateNewsImage NEVER called
    expect(articleHeroCalls).toHaveLength(1)
    expect(ideogramCalls).toHaveLength(0)
    // brief was persisted BEFORE the image (so on failure we still have it)
    expect(briefUpdates()).toHaveLength(1)
    // image update carries source='brief' and the render_input from the renderer
    const img = imageUpdates()
    expect(img[1].hero_image_source).toBe('brief')
    expect(img[1].hero_image_render_input).toMatchObject({
      prompt: expect.any(String),
      negative_prompt: expect.any(String),
      aspect_ratio: '16x10',
      style_type: 'REALISTIC',
    })
    // Uploaded URL is the brief-driven Ideogram URL
    expect(uploadCalls[0].sourceUrl).toBe(ARTICLE_HERO_URL)
  })

  it('15. Phase 2A: flag ON + brief throws → falls back to writer path, source="fallback_writer"', async () => {
    storedRow = row()
    process.env.HERO_V2_BRIEF_DRIVES_IMAGE = '1'
    editorShouldThrow = 'Sonnet 503 on brief'
    const result = await generateHeroImage(ARTICLE_ID)

    expect(result.ok).toBe(true)
    // brief failed → writer path used
    expect(ideogramCalls).toHaveLength(1)
    expect(articleHeroCalls).toHaveLength(0)
    // brief was NOT persisted because runPhotoEditor threw before persistBrief
    expect(briefUpdates()).toHaveLength(0)
    const img = imageUpdates()
    expect(img[1].hero_image_source).toBe('fallback_writer')
    expect(img[1].hero_image_render_input).toBeNull()
  })

  it('16. Phase 2A: flag ON + brief OK + Ideogram throws → image fails but brief persists', async () => {
    storedRow = row()
    process.env.HERO_V2_BRIEF_DRIVES_IMAGE = '1'
    articleHeroShouldThrow = 'Ideogram 503 on brief render'
    const result = await generateHeroImage(ARTICLE_ID)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe('failed')
    // Brief was persisted BEFORE the render call (Phase 2A guarantee).
    expect(briefUpdates()).toHaveLength(1)
    // Alert fired for the image failure.
    expect(alertCaptures).toHaveLength(1)
    // No source/render_input recorded because the image failure update path
    // doesn't write those fields.
    const img = imageUpdates()
    expect(img[1].hero_image_status).toBe('failed')
    expect(img[1]).not.toHaveProperty('hero_image_source')
  })

  it('17. Phase 2A: flag toggles are honored per call (env var read at call time)', async () => {
    storedRow = row()
    // First call: flag off → writer path
    delete process.env.HERO_V2_BRIEF_DRIVES_IMAGE
    await generateHeroImage(ARTICLE_ID)
    expect(ideogramCalls).toHaveLength(1)
    expect(articleHeroCalls).toHaveLength(0)

    // Second call: flag on → brief path
    storedRow = row({ hero_image_status: null })  // reset to pending so not skipped
    process.env.HERO_V2_BRIEF_DRIVES_IMAGE = '1'
    await generateHeroImage(ARTICLE_ID)
    expect(ideogramCalls).toHaveLength(1)  // unchanged from before
    expect(articleHeroCalls).toHaveLength(1)
  })

  // ── Post-regen sync to The Prompt ─────────────────────────────────────────
  // These pin the integration with lib/publishing/sync. The primitive itself
  // is covered in publish-sync.test.ts; here we only assert that hero regen
  // invokes it on success and that a sync failure surfaces a warning without
  // rolling back the locally-saved hero.

  it('18. sync: successful regen invokes syncPublishedArticle once, result attached to HeroImageResult', async () => {
    storedRow = row()
    const result = await generateHeroImage(ARTICLE_ID)

    expect(result.ok).toBe(true)
    expect(syncCalls).toEqual([ARTICLE_ID])
    if (result.ok) {
      expect(result.sync.ok).toBe(true)
      expect(result.sync.status).toBe('synced')
    }
  })

  it('19. sync: regen success + sync failure → hero stays saved, warning logged, ok still true', async () => {
    storedRow = row()
    mockSyncResult = { ok: false, status: 'failed', reason: 'PublishError: category_not_found' }

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const result = await generateHeroImage(ARTICLE_ID)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe('ready')
      expect(result.url).toContain('media-assets/images/articles/')
      expect(result.sync.ok).toBe(false)
      if (!result.sync.ok) expect(result.sync.reason).toContain('category_not_found')
    }
    // Hero write was not rolled back — the success-path UPDATE landed.
    const img = imageUpdates()
    expect(img[img.length - 1].hero_image_status).toBe('ready')
    expect(img[img.length - 1].hero_image_url).toContain('media-assets/images/articles/')
    // Warning logged under the [publish-sync] prefix.
    const warned = warn.mock.calls.flat().some((arg) =>
      typeof arg === 'string' && arg.includes('[publish-sync]') && arg.includes(ARTICLE_ID),
    )
    expect(warned).toBe(true)
    warn.mockRestore()
  })

  it('20. sync: NOT invoked on failure paths (Ideogram throws → no sync call)', async () => {
    storedRow = row()
    ideogramShouldThrow = 'Ideogram 503'
    await generateHeroImage(ARTICLE_ID)
    expect(syncCalls).toHaveLength(0)
  })
})
