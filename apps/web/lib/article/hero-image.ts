/**
 * lib/article/hero-image.ts — MVP Commit 3
 *
 * Operator-triggered hero image generation for The Prompt articles.
 *
 * Reuses the existing social-media image pipeline end-to-end. NO new validation
 * infrastructure, NO parallel image architecture. The integrity audit (see commit
 * message and the comment block in lib/media/storage.ts) confirmed that step2's
 * pipeline has no post-generation byte/MIME/accessibility/moderation checks; we
 * keep the same posture so there is ONE image-pipeline architecture.
 *
 * Reused primitives:
 *   • generateNewsImage()       — lib/media/ideogram.ts (Claude photo direction
 *                                 + Ideogram v3 REALISTIC editorial photo style)
 *   • uploadArticleHeroImage()  — lib/media/storage.ts (sibling of
 *                                 uploadSceneImage; same media-assets bucket)
 *   • withRetry({ attempts: 2 }) — lib/media/retry.ts (same primitive step2 uses)
 *   • checkAutomationPaused()   — lib/media/safeguards.ts (operator's global pause)
 *   • sendPipelineAlert()       — lib/media/alert.ts (Brevo on hard failure)
 *   • logImageCost()            — lib/cost/track.ts
 *
 * Idempotency: if a row is already in 'generating' state we return 'skipped'
 * without re-firing. Best-effort, not atomic. Worst-case under a tight race is
 * one duplicate Ideogram call (~$0.08). For MVP that's acceptable; a stored
 * procedure can land in a later phase if real contention shows up.
 *
 * Never throws. Returns a discriminated result so the operator endpoint
 * (Commit 4) can render the right UI state.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { toJson } from '@/lib/supabase/json'
import {
  generateNewsImage,
  generateArticleHeroImage,
  type ArticleHeroRenderInput,
} from '@/lib/media/ideogram'
import { uploadArticleHeroImage } from '@/lib/media/storage'
import { withRetry } from '@/lib/media/retry'
import { checkAutomationPaused } from '@/lib/media/safeguards'
import { sendPipelineAlert } from '@/lib/media/alert'
import { logImageCost } from '@/lib/cost/track'
import {
  runPhotoEditor,
  PHOTO_EDITOR_MODEL,
  type EditorBrief,
  type PhotoEditorInput,
} from '@/lib/article/photo-editor'

/** Feature flag: when '1', the brief drives image generation (Phase 2). */
function isBriefDrivenEnabled(): boolean {
  return process.env.HERO_V2_BRIEF_DRIVES_IMAGE === '1'
}

/** Pipeline that produced the current hero_image_url (Phase 2 observability). */
type HeroImageSource = 'brief' | 'fallback_writer'

export type HeroImageResult =
  | { ok: true;  url: string; status: 'ready' }
  | { ok: false; url: null;   status: 'failed' | 'skipped'; reason: string }

export async function generateHeroImage(articleId: string): Promise<HeroImageResult> {
  const db = createAdminClient()

  // ── Load article row ──────────────────────────────────────────────────────
  // payload jsonb is loaded so the Photo Editor Agent (Hero Image V2 shadow
  // mode) can reach body, category, and tags — none of which are denormalized
  // onto the website_content row.
  const { data: row, error: readError } = await db
    .from('website_content')
    .select('id, project_id, title, summary, hero_image_prompt, hero_image_status, payload')
    .eq('id', articleId)
    .maybeSingle()

  if (readError) {
    return { ok: false, url: null, status: 'failed', reason: `load failed: ${readError.message}` }
  }
  if (!row) {
    return { ok: false, url: null, status: 'failed', reason: 'article not found' }
  }
  const article = row as {
    id: string
    project_id: string
    title: string | null
    summary: string | null
    hero_image_prompt: string | null
    hero_image_status: string | null
    payload: Record<string, unknown> | null
  }

  // ── Idempotency: refuse to re-fire if already in flight ───────────────────
  if (article.hero_image_status === 'generating') {
    return { ok: false, url: null, status: 'skipped', reason: 'already_generating' }
  }

  // ── Reuse: respect the operator's global automation pause ─────────────────
  const pauseCheck = await checkAutomationPaused(db)
  if (!pauseCheck.allowed) {
    return { ok: false, url: null, status: 'skipped', reason: pauseCheck.reason ?? 'automation_paused' }
  }

  // ── Claim the work ────────────────────────────────────────────────────────
  await db
    .from('website_content')
    .update({ hero_image_status: 'generating', updated_at: new Date().toISOString() })
    .eq('id', articleId)

  // ── Build prompt inputs with a fallback hierarchy ─────────────────────────
  // The writer already emits hero_image_prompt; summary is the next-best signal;
  // title is the always-present anchor. generateNewsImage handles the rest of
  // the photo-direction work (Claude → Ideogram).
  const headlineInput = (article.title && article.title.trim()) || 'AI news brief'
  const bodyInput =
    (article.hero_image_prompt && article.hero_image_prompt.trim()) ||
    (article.summary && article.summary.trim()) ||
    headlineInput

  // ── Hero Image V2 — flag-driven brief integration ─────────────────────────
  // Flag ON  → brief drives image (Phase 2). Brief failure → fallback to writer.
  // Flag OFF → brief still runs in shadow (Phase 1), image uses writer path.
  // Either way the brief is generated and persisted; the flag only controls
  // whether the brief reaches the renderer.
  const flagOn = isBriefDrivenEnabled()
  let brief: EditorBrief | null = null
  let briefShadowPromise: Promise<void> | null = null

  if (flagOn) {
    // Brief-first: try synchronously so we can use it for rendering. On any
    // failure we null it and fall through to the writer path.
    try {
      const input = extractEditorInput(article)
      brief = await runPhotoEditor(input)
      await persistBrief(db, articleId, brief)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[photo-editor] brief failed under flag-on; falling back to writer path for article=${articleId}: ${msg}`)
      brief = null
    }
  } else {
    // Shadow mode (Phase 1): brief runs in parallel, never influences image.
    briefShadowPromise = runEditorBriefShadow(db, article)
  }

  // ── Generate + upload (with retry, mirroring step2's call pattern) ────────
  try {
    let ideogramUrl: string
    let renderInput: ArticleHeroRenderInput | null = null
    let source: HeroImageSource

    if (brief) {
      // Phase 2 brief-driven path.
      const result = await withRetry(
        () => generateArticleHeroImage(brief!),
        { attempts: 2, label: 'Ideogram brief hero' },
      )
      ideogramUrl = result.url
      renderInput = result.input
      source = 'brief'
    } else {
      // Existing writer-prompt path (also used as fallback when flag-on brief fails).
      ideogramUrl = await withRetry(
        () => generateNewsImage(headlineInput, bodyInput),
        { attempts: 2, label: 'Ideogram hero' },
      )
      source = 'fallback_writer'
    }

    const publicUrl = await uploadArticleHeroImage(article.project_id, article.id, ideogramUrl)

    void logImageCost(1, 'ideogram', {
      projectId: article.project_id,
      operation: 'Article Hero Image',
      metadata:  { articleId: article.id, source },
    })

    await db
      .from('website_content')
      .update({
        hero_image_url:          publicUrl,
        hero_image_status:       'ready',
        hero_image_source:       source,
        hero_image_render_input: renderInput ? toJson(renderInput) : null,
        updated_at:              new Date().toISOString(),
      })
      .eq('id', articleId)

    // Make sure the shadow brief (if any) lands before the response so the
    // operator sees it on /atlas/content/[id] on next reload. Never throws.
    if (briefShadowPromise) await briefShadowPromise

    return { ok: true, url: publicUrl, status: 'ready' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)

    await db
      .from('website_content')
      .update({
        hero_image_status: 'failed',
        updated_at:        new Date().toISOString(),
      })
      .eq('id', articleId)

    // Reuse the same alert channel the rest of the pipeline uses. Non-blocking.
    void sendPipelineAlert({
      cronRoute: 'articles/hero-image',
      step:      'generate_hero',
      error:     msg,
      severity:  'warning',
      context:   {
        articleId: article.id,
        projectId: article.project_id,
        title:     headlineInput.slice(0, 80),
      },
    })

    // Best-effort shadow brief even on image failure — useful evidence.
    if (briefShadowPromise) await briefShadowPromise

    return { ok: false, url: null, status: 'failed', reason: msg }
  }
}

/**
 * Extract the PhotoEditorInput from a loaded website_content row. Pulls body,
 * category, and tags out of the payload jsonb (which is how the publish
 * contract carries them). Used by both flag-on and flag-off paths.
 */
function extractEditorInput(article: {
  title: string | null
  summary: string | null
  payload: Record<string, unknown> | null
}): PhotoEditorInput {
  const payload = article.payload ?? {}
  const body =
    typeof (payload as { body?: unknown }).body === 'string'
      ? ((payload as { body: string }).body)
      : null
  const category =
    typeof (payload as { category?: unknown }).category === 'string'
      ? ((payload as { category: string }).category)
      : typeof (payload as { category?: { slug?: unknown } }).category === 'object' &&
        typeof (payload as { category: { slug?: unknown } }).category?.slug === 'string'
      ? ((payload as { category: { slug: string } }).category.slug)
      : null
  const rawTags = (payload as { tags?: unknown }).tags
  const tags: string[] = Array.isArray(rawTags)
    ? rawTags
        .map((t) =>
          typeof t === 'string'
            ? t
            : t && typeof t === 'object' && typeof (t as { slug?: unknown }).slug === 'string'
            ? (t as { slug: string }).slug
            : t && typeof t === 'object' && typeof (t as { name?: unknown }).name === 'string'
            ? (t as { name: string }).name
            : '',
        )
        .filter(Boolean)
    : []
  return {
    title: article.title ?? '',
    summary: article.summary,
    body,
    category,
    tags,
  }
}

/**
 * Persist a fresh brief into hero_editor_brief with { generated_at, model }
 * metadata. Used by both flag-on (after success) and flag-off shadow path.
 */
async function persistBrief(
  db: ReturnType<typeof createAdminClient>,
  articleId: string,
  brief: EditorBrief,
): Promise<void> {
  await db
    .from('website_content')
    .update({
      hero_editor_brief: toJson({
        ...brief,
        metadata: {
          generated_at: new Date().toISOString(),
          model: PHOTO_EDITOR_MODEL,
        },
      }),
    })
    .eq('id', articleId)
}

/**
 * Shadow-mode brief generation (Phase 1 path, used when the feature flag is
 * OFF). Never throws — failures are logged under [photo-editor] so shadow eval
 * can quantify brief reliability independently of image generation.
 */
async function runEditorBriefShadow(
  db: ReturnType<typeof createAdminClient>,
  article: {
    id: string
    title: string | null
    summary: string | null
    payload: Record<string, unknown> | null
  },
): Promise<void> {
  try {
    const brief = await runPhotoEditor(extractEditorInput(article))
    await persistBrief(db, article.id, brief)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[photo-editor] shadow brief failed for article=${article.id}: ${msg}`)
  }
}
