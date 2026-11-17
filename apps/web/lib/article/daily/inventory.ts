/**
 * The Prompt daily editorial inventory, strictly READ-ONLY and project-scoped.
 *
 * No provider, publishing or user-supplied project ID. Every SELECT is scoped
 * to the canonical The Prompt slug or the resolved project UUID.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildDailyPromptPlan, DAILY_PROMPT_PROJECT_SLUG,
  type DailyNews, type DailyScript, type DailyWebsiteArticle, type DailyPlan } from './editorial-plan'

export type DailyInventoryResult =
  | { ok: true; plan: DailyPlan }
  | { ok: false; reason: 'project_missing' | 'inventory_unavailable' | 'invalid_project' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function planTodaysPromptArticles(now: string): Promise<DailyInventoryResult> {
  try {
    const db = createAdminClient()
    const { data: project, error: projectError } = await db.from('projects')
      .select('id, slug').eq('slug', DAILY_PROMPT_PROJECT_SLUG)
      .limit(1).maybeSingle()
    if (projectError) return { ok: false, reason: 'inventory_unavailable' }
    if (!project || typeof project.id !== 'string' || !UUID.test(project.id) ||
        project.slug !== DAILY_PROMPT_PROJECT_SLUG) {
      return { ok: false, reason: 'project_missing' }
    }
    const pid = project.id
    // No source-body text is read; only metadata required for deterministic
    // selection. Full source content would need later independent verification.
    const [news, scripts, articles] = await Promise.all([
      db.from('media_news_items')
        .select('id, project_id, title, url, source_name, status, fetched_at, created_at, virality_score')
        .eq('project_id', pid).order('fetched_at', { ascending: false }).limit(250),
      db.from('media_scripts')
        .select('id, project_id, news_item_id, status, generated_at, published_at, instagram_media_id, facebook_post_id, youtube_video_id')
        .eq('project_id', pid).order('generated_at', { ascending: false }).limit(250),
      db.from('website_content')
        .select('news_item_id, external_id, status')
        .eq('project_id', pid).order('created_at', { ascending: false }).limit(500),
    ])
    if (news.error || scripts.error || articles.error || !news.data || !scripts.data || !articles.data) {
      return { ok: false, reason: 'inventory_unavailable' }
    }
    const plan = buildDailyPromptPlan({
      projectId: pid, now,
      news: news.data as DailyNews[],
      scripts: scripts.data as DailyScript[],
      websiteArticles: articles.data as DailyWebsiteArticle[],
    })
    return { ok: true, plan }
  } catch {
    return { ok: false, reason: 'inventory_unavailable' }
  }
}
