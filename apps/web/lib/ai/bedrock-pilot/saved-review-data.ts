/**
 * Read-only saved script/source selection for the The Prompt review pilot.
 *
 * Every privileged query is scoped to the OWNED "ai-media-automation" project.
 * The only saved citation in media_news_items is normally its primary URL:
 * summary/key_insight/raw_output are AI-derived and never source excerpts.
 * No billing, no AWS calls, no writes and no publishing.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { resolveManualBedrockOperatorGrant } from './operator-grant'

const THE_PROMPT_SLUG = 'ai-media-automation'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_SCRIPTS = 60

export type SavedReviewOption = Readonly<{
  id: string
  title: string
  status: string
  generatedAt: string | null
  hasPrimarySource: boolean
}>
export type SavedReviewDetail = Readonly<{
  id: string
  projectId: string
  title: string
  script: string
  status: string
  generatedAt: string | null
  primaryUrl: string | null
  primarySourceName: string | null
  sourceExcerpt: null
  secondSourceAvailable: false
  sourcesVerified: false
  /** This summary comes from the news pipeline; never an article quotation. */
  aiNewsSummary: string | null
}>
export type SavedReviewResult =
  | { ok: true; projectId: string; projectName: string; items: SavedReviewOption[] }
  | { ok: true; projectId: string; item: SavedReviewDetail }
  | { ok: false; reason: string }

function isUuid(v: unknown): v is string { return typeof v === 'string' && UUID.test(v) }
function publicSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 1800) return null
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
        !parsed.hostname.includes('.') || parsed.hostname === 'localhost') return null
    return parsed.href
  } catch { return null }
}

export async function ownedPromptProject(): Promise<{ ok: true; projectId: string; projectName: string } | { ok: false; reason: string }> {
  try {
    const operator = await resolvePlatformOperator()
    if (!operator.ok) return { ok: false, reason: 'operator_required' }
    const access = await resolveProjectAccess()
    if (!access.ok || access.userId !== operator.userId ||
        access.allowedProjectIds.length === 0) {
      return { ok: false, reason: 'project_access_denied' }
    }

    const { data, error } = await createAdminClient().from('projects')
      .select('id, name, slug').eq('slug', THE_PROMPT_SLUG)
      .in('id', access.allowedProjectIds).maybeSingle()
    if (error) return { ok: false, reason: 'project_unavailable' }
    if (!data || !isUuid(data.id)) return { ok: false, reason: 'prompt_not_owned' }

    // Reuse exactly the same independently verified, unforgeable authority that
    // protects the later manual preflight and the dormant governed adapter.
    const grant = await resolveManualBedrockOperatorGrant(data.id)
    if (!grant.ok) return { ok: false, reason: 'operator_or_project_denied' }
    return { ok: true, projectId: data.id, projectName: data.name ?? 'The Prompt' }
  } catch {
    return { ok: false, reason: 'project_unavailable' }
  }
}

export async function listSavedPromptReviews(): Promise<SavedReviewResult> {
  const scope = await ownedPromptProject()
  if (!scope.ok) return scope
  try {
    const db = createAdminClient()
    const { data: scripts, error: scriptsError } = await db.from('media_scripts')
      .select('id, project_id, news_item_id, hook, topic, status, generated_at')
      .eq('project_id', scope.projectId)
      .order('generated_at', { ascending: false })
      .limit(MAX_SCRIPTS)
    if (scriptsError || !scripts) return { ok: false, reason: 'scripts_unavailable' }

    const newsIds = [...new Set(scripts.map(s => s.news_item_id).filter(isUuid))]
    const byNewsId = new Map<string, { title: string; url: string | null }>()
    if (newsIds.length) {
      const { data: news, error } = await db.from('media_news_items')
        .select('id, project_id, title, url')
        .eq('project_id', scope.projectId).in('id', newsIds).limit(MAX_SCRIPTS)
      if (error) return { ok: false, reason: 'sources_unavailable' }
      for (const item of news ?? []) {
        byNewsId.set(item.id, { title: item.title ?? '', url: publicSourceUrl(item.url) })
      }
    }
    return {
      ok: true, projectId: scope.projectId, projectName: scope.projectName,
      items: scripts.filter(s => isUuid(s.id)).map(s => {
        const news = s.news_item_id ? byNewsId.get(s.news_item_id) : undefined
        return {
          id: s.id,
          title: (news?.title || s.topic || s.hook || 'Manus utan rubrik').slice(0, 150),
          status: s.status ?? 'unknown',
          generatedAt: s.generated_at ?? null,
          hasPrimarySource: !!news?.url,
        }
      }),
    }
  } catch {
    return { ok: false, reason: 'scripts_unavailable' }
  }
}

export async function getSavedPromptReview(scriptId: string): Promise<SavedReviewResult> {
  if (!isUuid(scriptId)) return { ok: false, reason: 'invalid_script' }
  const scope = await ownedPromptProject()
  if (!scope.ok) return scope
  try {
    const db = createAdminClient()
    const { data: script, error: scriptError } = await db.from('media_scripts')
      .select('id, project_id, news_item_id, script, hook, topic, status, generated_at')
      .eq('project_id', scope.projectId).eq('id', scriptId).maybeSingle()
    if (scriptError) return { ok: false, reason: 'script_unavailable' }
    if (!script) return { ok: false, reason: 'script_not_found' }
    let title = script.topic || script.hook || 'Manus utan rubrik'
    let primaryUrl: string | null = null
    let primarySourceName: string | null = null
    let aiNewsSummary: string | null = null
    if (isUuid(script.news_item_id)) {
      // Protect against a cross-project news_item_id link even if the relation is malformed.
      const { data: news, error } = await db.from('media_news_items')
        .select('id, project_id, title, url, source_name, summary')
        .eq('project_id', scope.projectId).eq('id', script.news_item_id).maybeSingle()
      if (error) return { ok: false, reason: 'sources_unavailable' }
      if (news) {
        title = news.title || title
        primaryUrl = publicSourceUrl(news.url)
        primarySourceName = news.source_name ?? null
        aiNewsSummary = typeof news.summary === 'string' ? news.summary.slice(0, 1200) : null
      }
    }
    return {
      ok: true, projectId: scope.projectId,
      item: {
        id: script.id, projectId: scope.projectId,
        title: title.slice(0, 200),
        script: script.script ?? '',
        status: script.status ?? 'unknown',
        generatedAt: script.generated_at ?? null,
        primaryUrl,
        primarySourceName,
        sourceExcerpt: null,
        secondSourceAvailable: false,
        sourcesVerified: false,
        aiNewsSummary,
      },
    }
  } catch {
    return { ok: false, reason: 'script_unavailable' }
  }
}
