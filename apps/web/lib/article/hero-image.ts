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
import { generateNewsImage } from '@/lib/media/ideogram'
import { uploadArticleHeroImage } from '@/lib/media/storage'
import { withRetry } from '@/lib/media/retry'
import { checkAutomationPaused } from '@/lib/media/safeguards'
import { sendPipelineAlert } from '@/lib/media/alert'
import { logImageCost } from '@/lib/cost/track'

export type HeroImageResult =
  | { ok: true;  url: string; status: 'ready' }
  | { ok: false; url: null;   status: 'failed' | 'skipped'; reason: string }

export async function generateHeroImage(articleId: string): Promise<HeroImageResult> {
  const db = createAdminClient()

  // ── Load article row ──────────────────────────────────────────────────────
  const { data: row, error: readError } = await db
    .from('website_content')
    .select('id, project_id, title, summary, hero_image_prompt, hero_image_status')
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

  // ── Generate + upload (with retry, mirroring step2's call pattern) ────────
  try {
    const ideogramUrl = await withRetry(
      () => generateNewsImage(headlineInput, bodyInput),
      { attempts: 2, label: 'Ideogram hero' },
    )

    const publicUrl = await uploadArticleHeroImage(article.project_id, article.id, ideogramUrl)

    void logImageCost(1, 'ideogram', {
      projectId: article.project_id,
      operation: 'Article Hero Image',
      metadata:  { articleId: article.id },
    })

    await db
      .from('website_content')
      .update({
        hero_image_url:    publicUrl,
        hero_image_status: 'ready',
        updated_at:        new Date().toISOString(),
      })
      .eq('id', articleId)

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

    return { ok: false, url: null, status: 'failed', reason: msg }
  }
}
