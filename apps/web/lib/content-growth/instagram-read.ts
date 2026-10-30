/**
 * Authorized, read-only Instagram growth summaries for the Atlas Operations Center.
 *
 * Existing media_insights is refreshed by the pre-existing cron/insights job.
 * This module NEVER fetches directly from Meta or creates another schedule.
 *
 * Privacy boundary: the caller supplies the authenticated user's ALLOWED
 * project IDs; projects and insight rows are each independently scoped.
 */
import 'server-only'
import { scopeProjectFilter } from '@/lib/atlas/isolation'
import {
  summarizeInstagramPerformance,
  type GrowthBrand,
  type InstagramPerformanceSummary,
  type InstagramPostInsights,
} from './instagram-metrics'

type AnyDb = any

export type InstagramGrowthPanel =
  | { status: 'no_access' | 'no_data' | 'unavailable'; brand: GrowthBrand; summary: null; lastFetchedAt: null; skippedUnknownViews: number }
  | { status: 'ready'; brand: GrowthBrand; summary: InstagramPerformanceSummary; lastFetchedAt: string | null; skippedUnknownViews: number }

const BRAND_SLUGS: Record<GrowthBrand, string> = {
  'the-prompt': 'ai-media-automation',
  'familje-stunden': 'familje-stunden',
}

const BRANDS: GrowthBrand[] = ['the-prompt', 'familje-stunden']

function noPanel(brand: GrowthBrand, status: 'no_access' | 'no_data' | 'unavailable'): InstagramGrowthPanel {
  return { brand, status, summary: null, lastFetchedAt: null, skippedUnknownViews: 0 }
}

function optionalCount(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

function validIso(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null
  return value
}

export async function readInstagramGrowthPanels(
  db: AnyDb,
  allowedProjectIds: readonly string[],
  days = 90,
  now = new Date(),
): Promise<Record<GrowthBrand, InstagramGrowthPanel>> {
  const result = {
    'the-prompt': noPanel('the-prompt', 'no_access'),
    'familje-stunden': noPanel('familje-stunden', 'no_access'),
  } as Record<GrowthBrand, InstagramGrowthPanel>

  if (allowedProjectIds.length === 0) return result
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('Invalid Instagram time window')

  // IMPORTANT: an allow-listed project must ALSO match the expected slug,
  // otherwise even an owned unrelated project's insights must never enter here.
  const projectsResult = await db.from('projects')
    .select('id, slug')
    .in('id', scopeProjectFilter([...allowedProjectIds]))
    .in('slug', Object.values(BRAND_SLUGS))
  if (projectsResult.error || !Array.isArray(projectsResult.data)) {
    return { 'the-prompt': noPanel('the-prompt', 'unavailable'), 'familje-stunden': noPanel('familje-stunden', 'unavailable') }
  }

  const matchingProjects: { brand: GrowthBrand; id: string }[] = []
  for (const brand of BRANDS) {
    const row = projectsResult.data.find((p: any) =>
      p.slug === BRAND_SLUGS[brand] && allowedProjectIds.includes(p.id))
    if (row) matchingProjects.push({ brand, id: row.id })
  }

  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
  await Promise.all(matchingProjects.map(async ({ brand, id }) => {
    try {
      const query = await db.from('media_insights')
        .select('id, project_id, platform, views, reach, shares, saved, published_at, fetched_at')
        .eq('project_id', id)
        .eq('platform', 'instagram')
        .gte('published_at', since)
        .order('published_at', { ascending: false })
        .limit(80)

      if (query.error || !Array.isArray(query.data)) {
        result[brand] = noPanel(brand, 'unavailable')
        return
      }

      // A NULL view count is NOT zero. Keep unknown values out of the
      // own-account view baseline; preserve absent engagement counters as null.
      const rows = query.data.filter((row: any) => row.project_id === id && row.platform === 'instagram')
      const measurable = rows.filter((row: any) =>
        Number.isSafeInteger(row.views) && row.views >= 0)
      const posts: InstagramPostInsights[] = measurable.map((row: any) => ({
        id: String(row.id),
        brand,
        views: row.views,
        reach: optionalCount(row.reach),
        shares: optionalCount(row.shares),
        saves: optionalCount(row.saved),
        // Per-post follows are not supplied by the current Graph refresh.
        // Account-level follower gains must never be misattributed to a Reel.
        follows: null,
        publishedAt: validIso(row.published_at) ?? undefined,
      }))

      if (posts.length === 0) {
        result[brand] = { ...noPanel(brand, 'no_data'), skippedUnknownViews: rows.length }
        return
      }

      const fetchedTimes = measurable.map((row: any) => validIso(row.fetched_at))
        .filter((s: string | null): s is string => s !== null)
      result[brand] = {
        brand,
        status: 'ready',
        summary: summarizeInstagramPerformance(brand, posts),
        lastFetchedAt: fetchedTimes.length > 0 ? fetchedTimes.sort().at(-1) ?? null : null,
        skippedUnknownViews: rows.length - measurable.length,
      }
    } catch {
      // Fail closed and do not leak database error text to the UI.
      result[brand] = noPanel(brand, 'unavailable')
    }
  }))

  return result
}
