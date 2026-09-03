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
 *   • admitAssetFromUrl()       — lib/media/asset/admission.ts (Media Runtime
 *                                 Phase 1). REPLACED uploadArticleHeroImage():
 *                                 that helper returned only a public URL, so a
 *                                 hero could exist only AS a URL. Admission
 *                                 validates the bytes (§21.5) and returns an
 *                                 asset identity that outlives the URL. This is
 *                                 the ONE proof path for Phase 1; the other
 *                                 image call sites still use lib/media/storage.ts
 *                                 unchanged (forward-only).
 *   • withRetry({ attempts: 2 }) — lib/media/retry.ts (same primitive step2 uses)
 *   • resolveExecutionEligibility() — lib/governance/execution-preflight.ts
 *                                 (canonical G3 authority; replaced the legacy
 *                                  checkAutomationPaused in G3C-1)
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
  buildArticleHeroRenderInput,
  type ArticleHeroRenderInput,
} from '@/lib/media/ideogram'
import { orchestrateImageGeneration } from '@/lib/media/orchestrator/orchestrate'
import type { MediaSelection } from '@/lib/media/orchestrator/types'
import { admitAssetFromUrl } from '@/lib/media/asset/admission'
import { publicDeliveryUrl } from '@/lib/media/asset/store'
import { withRetry } from '@/lib/media/retry'
import { dispatchedGenerationIsNotRetryable } from '@/lib/media/orchestrator/retry-authority'
import { stopIsNotRetryable } from '@/lib/governance/execution-dispatch'
import { resolveExecutionEligibility } from '@/lib/governance/execution-preflight'
import { sendPipelineAlert } from '@/lib/media/alert'
import { logImageCost } from '@/lib/cost/track'
import {
  runPhotoEditor,
  PHOTO_EDITOR_MODEL,
  type EditorBrief,
  type PhotoEditorInput,
} from '@/lib/article/photo-editor'
import { syncPublishedArticle, type SyncResult } from '@/lib/publishing/sync'
import { projectScope, type ExecutionContract, type ExecutionContext } from '@/lib/governance/execution-stop'

/** Feature flag: when '1', the brief drives image generation (Phase 2). */
function isBriefDrivenEnabled(): boolean {
  return process.env.HERO_V2_BRIEF_DRIVES_IMAGE === '1'
}

/** Pipeline that produced the current hero_image_url (Phase 2 observability). */
type HeroImageSource = 'brief' | 'fallback_writer'

/**
 * Where a hero image's bytes live.
 *
 * Same layout `uploadArticleHeroImage()` used — `images/articles/…` with a
 * timestamp — so heroes stay visually grouped in the bucket and browser caches
 * still break on regeneration. The path is constructed here from ids Omnira
 * owns; no provider-supplied filename reaches it, and `assertPathSafe` in the
 * admission boundary re-checks it regardless.
 *
 * This is a LOCATION, not an identity. Two heroes for the same article at
 * different times are two assets with two paths, and the article points at
 * whichever one is current.
 *
 * Returned WITHOUT an extension: admission appends the one matching the
 * validated bytes, so the path can never claim a format the file is not.
 */
function heroStoragePath(projectId: string, articleId: string): string {
  return `images/articles/${projectId}/${articleId}-hero-${Date.now()}`
}

export type HeroImageResult =
  | { ok: true;  url: string; status: 'ready'; sync: SyncResult }
  | { ok: false; url: null;   status: 'failed' | 'skipped'; reason: string }

export async function generateHeroImage(
  /**
   * REQUIRED execution CONTEXT — why this work is running. The caller knows
   * that; only this function knows WHICH project it belongs to.
   *
   * The scope is deliberately not a parameter. Hero-image execution belongs to
   * the article's own project, and that ownership is part of this function's
   * canonical contract rather than something a caller may assert: the row is
   * loaded here, the upload uses `article.project_id`, and the cost is logged
   * against it. Accepting a caller-supplied scope would let a caller name a
   * project the article does not belong to.
   */
  context: ExecutionContext,
  articleId: string,
): Promise<HeroImageResult> {
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

  // The article's project IS the execution authority — established here, from
  // the row itself, not asserted by the caller and not inherited from billing.
  const execution: ExecutionContract =
    { context, scope: projectScope({ projectId: article.project_id }) }

  // ── EARLY canonical eligibility (G3C-1) ───────────────────────────────────
  //
  // Replaces the legacy `checkAutomationPaused`, which read the raw global flag
  // and knew nothing about project scope or execution context — two authorities
  // for one question. This asks the CANONICAL authority with the SAME contract
  // the paid boundary will use.
  //
  // Purely an optimisation: without it this path would claim the row and run the
  // photo-editor brief (itself a paid Anthropic call) before discovering it is
  // stopped. The decision is NOT carried forward — `withGovernedSpend` resolves
  // a fresh one immediately before dispatch, because a pause can commit in the
  // gap between here and there.
  const eligibility = await resolveExecutionEligibility(execution)
  if (!eligibility.allowed) {
    return {
      ok: false, url: null, status: 'skipped',
      reason: eligibility.reason ?? 'stop_state_unavailable',
    }
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
      const input = extractEditorInput(execution, article)
      brief = await runPhotoEditor(input)
      await persistBrief(db, articleId, brief)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[photo-editor] brief failed under flag-on; falling back to writer path for article=${articleId}: ${msg}`)
      brief = null
    }
  } else {
    // Shadow mode (Phase 1): brief runs in parallel, never influences image.
    briefShadowPromise = runEditorBriefShadow(db, article, execution)
  }

  // ── Generate + admit ──────────────────────────────────────────────────────
  try {
    let renderInput: ArticleHeroRenderInput | null = null
    let source: HeroImageSource
    let asset: Awaited<ReturnType<typeof admitAssetFromUrl>>['asset']
    let selection: MediaSelection | null = null

    if (brief) {
      // ── Media Runtime Phase 2: the ORCHESTRATED path ────────────────────
      //
      // This branch no longer names a provider. It states what it needs; the
      // orchestrator decides which eligible candidate serves it, dispatches
      // through that candidate's existing governed adapter, and admits the
      // result as a canonical Asset. Generation and admission are one step, so
      // there is no window in which an image exists but nothing owns it.
      //
      // `allowUnlicensed` is set because this is operator-triggered article
      // work, not an autonomous mission. It waives ONLY the mission capability
      // licence — spend, stop authority, the provider gate, credential presence
      // and reference rules all still apply, and the orchestrator has no way to
      // waive them.
      renderInput = buildArticleHeroRenderInput(brief)
      source = 'brief'

      const result = await withRetry(
        () => orchestrateImageGeneration(
          {
            projectId:   article.project_id,
            execution,
            // NOT a mission: this is an operator-triggered article route, so the
            // Atlas mission capability licence is not the authority that binds
            // it. Stated as a classification, not waived as a permission — and
            // `caller` is a closed union, so a new one is a reviewed type change.
            invocation:  { kind: 'internal-application', caller: 'article-hero' },
            mediaType:   'image',
            operation:   'Article Hero Image',
            agent:       'Image Director',
            brief:       { instruction: renderInput!.prompt, avoid: brief!.avoid },
            aspectRatio: renderInput!.aspect_ratio,
            // Article heroes ARE published — stated, never defaulted.
            visibility:  'public',
            storagePath: heroStoragePath(article.project_id, article.id),
            // Ideogram-specific rendering parameter. Keyed, so it cannot ride
            // along on another candidate's request if ranking picks one.
            providerOptions: { ideogram: { style_type: renderInput!.style_type } },
            // Hashed into provenance; the payload is never stored.
            sourceBrief: brief,
          },
        ),
        {
          attempts: 2,
          label: 'orchestrated brief hero',
          // A RETRY HERE RE-ENTERS THE ORCHESTRATOR FROM THE TOP: it mints a new
          // media job and dispatches again, without ever consulting the job
          // state machine. So the permanence rule has to carry the authority the
          // loop would otherwise bypass — a failure that leaves a provider
          // dispatch possibly or definitely done ends the loop.
          //
          // Composed, not replaced: the existing status-text heuristic still
          // applies to everything this rule has no opinion about.
          //
          // `stopIsNotRetryable` wraps it because an operator's pause is not a
          // failure at all — retrying one sleeps, asks again, and eventually
          // reports the pause as an exhausted external call. No dispatch
          // occurred, so this is about noise rather than duplicate spend, but
          // the composition is the repository's existing answer and costs a word.
          isPermanent: stopIsNotRetryable(dispatchedGenerationIsNotRetryable()),
        },
      )
      asset = result.asset
      selection = result.selection
    } else {
      // Existing writer-prompt path (also used as fallback when flag-on brief
      // fails). Deliberately NOT orchestrated in Phase 2: it derives its prompt
      // inside generateNewsImage via a Claude photo-direction step, so routing
      // it would mean extracting that too. One proof path, not two.
      source = 'fallback_writer'
      const ideogramUrl = await withRetry(
        () => generateNewsImage(headlineInput, bodyInput, execution),
        {
          attempts: 2,
          label: 'Ideogram hero',
          // THE SAME AUTHORITY AS THE ORCHESTRATED PATH ABOVE.
          //
          // `generateNewsImage` writes a prompt with Claude and then renders with
          // Ideogram. Both are billable, and the render is the expensive one — so
          // a retry after a render that MAY have happened buys a second image.
          // Until the adapter gained a structured ambiguity contract there was
          // nothing here to read: every failure looked alike, and an aborted
          // socket was indistinguishable from a refused request.
          //
          // A Claude failure, a missing credential and a vendor 4xx all remain
          // retryable — they are pre-dispatch, and this rule has no opinion on
          // them. Only a possible side effect ends the loop.
          isPermanent: stopIsNotRetryable(dispatchedGenerationIsNotRetryable()),
        },
      )
      const admitted = await admitAssetFromUrl({
        projectId:  article.project_id,
        kind:       'image',
        visibility: 'public',
        sourceUrl:  ideogramUrl,
        storage:    { path: heroStoragePath(article.project_id, article.id) },
        provenance: {
          source:   'generated',
          provider: 'ideogram',
          model:    'ideogram-v3',
          providerMetadata: { heroImageSource: source },
        },
      })
      asset = admitted.asset
    }

    // Delivery URL is DERIVED from the asset's current location, never treated
    // as the identity. hero_image_url stays populated because the publish sync
    // and every existing reader depend on it; hero_asset_id is what is durable.
    const publicUrl = publicDeliveryUrl(asset.storage)

    // Attribution row. The PAID call was already reserved and settled inside the
    // adapter the orchestrator dispatched to; this is the cost_events entry that
    // names which one, so a hero can be traced to the provider that made it.
    void logImageCost(1, (selection?.candidate === 'openai' ? 'openai' : 'ideogram'), {
      projectId: article.project_id,
      operation: 'Article Hero Image',
      // assetId rides in the existing metadata field, so cost_events links to
      // the asset with NO change to lib/cost/track.ts. cost_events remains the
      // only ledger; the asset never carries an amount.
      metadata:  { articleId: article.id, source, assetId: asset.id,
                   candidate: selection?.candidate ?? 'ideogram',
                   model: selection?.model ?? 'ideogram-v3' },
    })

    // `hero_asset_id` is not in database.types.ts until the migration is applied
    // and types are regenerated, so the client is cast here exactly as
    // lib/bugs/report.ts does for bug_reports. Scoped to this one write.
    await db
      .from('website_content')
      .update({
        hero_image_url:          publicUrl,
        hero_asset_id:           asset.id,
        hero_image_status:       'ready',
        hero_image_source:       source,
        hero_image_render_input: renderInput ? toJson(renderInput) : null,
        updated_at:              new Date().toISOString(),
      })
      .eq('id', articleId)

    // Make sure the shadow brief (if any) lands before the response so the
    // operator sees it on /atlas/content/[id] on next reload. Never throws.
    if (briefShadowPromise) await briefShadowPromise

    // Push the new hero URL through to the destination (The Prompt) so
    // articles.hero_image_url stays in sync with website_content.hero_image_url.
    // Defensive try/catch: syncPublishedArticle is *designed* to return a
    // discriminated result rather than throw, but we wrap it anyway so any
    // unexpected exception (e.g. admin client init) cannot reach the outer
    // catch and revert hero_image_status from 'ready' to 'failed'. A
    // successful hero regen must remain successful regardless of sync state.
    let sync: SyncResult
    try {
      sync = await syncPublishedArticle(articleId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      sync = { ok: false, status: 'failed', reason: `sync threw: ${msg}` }
    }
    if (!sync.ok) {
      console.warn(`[publish-sync] hero regen succeeded but sync failed for article=${articleId}: ${sync.reason}`)
    }

    return { ok: true, url: publicUrl, status: 'ready', sync }
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
function extractEditorInput(execution: ExecutionContract, article: {
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
    execution,
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
  execution: ExecutionContract,
): Promise<void> {
  try {
    const brief = await runPhotoEditor(extractEditorInput(execution, article))
    await persistBrief(db, article.id, brief)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[photo-editor] shadow brief failed for article=${article.id}: ${msg}`)
  }
}
