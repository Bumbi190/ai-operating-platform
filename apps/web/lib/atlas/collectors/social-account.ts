/**
 * lib/atlas/collectors/social-account.ts — Social Account Collector.
 *
 * Fetches follower counts and account-level metrics from Instagram, Facebook,
 * and YouTube for a given project. Upserts per-platform rows to
 * account_snapshots and emits one "social.account_snapshot" Atlas signal per
 * project containing all platform data.
 *
 * Each project is processed independently. A project with no tokens for any
 * platform returns status = 'skipped'. A project with tokens for ≥1 platform
 * emits a signal even if some platforms returned no data.
 *
 * Signal kind:  social.account_snapshot
 * Version:      social-collector-1.0.0
 * Cadence:      daily 06:50 UTC (pg_cron: omnira_social_account)
 * Projects:     observer + active with platform_tokens
 *
 * Historical note: account_snapshots was the original storage layer but was
 * never scheduled in pg_cron — social account history collection had not
 * started. This collector fixes that gap.
 */

import { BaseCollector, type CollectorContext } from './types'
import { getToken } from '@/lib/media/token-store'
import {
  igAccountSnapshot,
  fbAccountSnapshot,
  ytAccountSnapshot,
  type AccountSnapshot,
} from '@/lib/media/account-insights'

export const SOCIAL_COLLECTOR_VERSION = 'social-collector-1.0.0'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlatformResult {
  snapshot: AccountSnapshot | null
  error:    string | null
}

interface SocialFetchResult {
  instagram: PlatformResult
  facebook:  PlatformResult
  youtube:   PlatformResult
  /** Sample YouTube video ID used for channel stats, or null. */
  ytVideoId: string | null
}

// ── Collector ─────────────────────────────────────────────────────────────────

export class SocialAccountCollector extends BaseCollector {
  readonly id         = 'social.account'
  readonly signalKind = 'social.account_snapshot'
  readonly version    = SOCIAL_COLLECTOR_VERSION
  readonly source     = 'social'

  async fetch(ctx: CollectorContext): Promise<SocialFetchResult> {
    const { db, projectId } = ctx
    if (!projectId) return _empty()

    const [igToken, fbToken] = await Promise.all([
      getToken('instagram', projectId),
      getToken('facebook',  projectId),
    ])

    // YouTube: env-based API key + most recent video for channel stats
    const ytKey = process.env.YOUTUBE_API_KEY ?? null
    let ytVideoId: string | null = null
    if (ytKey) {
      const { data: lastYt } = await db
        .from('media_scripts')
        .select('youtube_video_id')
        .eq('project_id', projectId)
        .not('youtube_video_id', 'is', null)
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      ytVideoId = (lastYt as { youtube_video_id?: string } | null)?.youtube_video_id ?? null
    }

    const [igResult, fbResult, ytResult] = await Promise.allSettled([
      igToken ? igAccountSnapshot(igToken.accessToken) : Promise.resolve(null),
      fbToken ? fbAccountSnapshot(fbToken.accessToken, fbToken.accountId) : Promise.resolve(null),
      // Guard on ytVideoId as well as ytKey: ytAccountSnapshot(key, null) returns a
      // non-null AccountSnapshot with all-null metrics and an error note in .raw —
      // not null. Without the ytVideoId guard, validate() would pass that object as
      // valid YouTube data (false positive) and store() would upsert a null-metric row.
      ytKey && ytVideoId ? ytAccountSnapshot(ytKey, ytVideoId)            : Promise.resolve(null),
    ])

    return {
      instagram: settledToResult(igResult),
      facebook:  settledToResult(fbResult),
      youtube:   settledToResult(ytResult),
      ytVideoId,
    }
  }

  validate(raw: unknown): SocialFetchResult | null {
    const result = raw as SocialFetchResult
    // Skip if no platform returned any data at all
    const hasAny =
      result.instagram.snapshot !== null ||
      result.facebook.snapshot  !== null ||
      result.youtube.snapshot   !== null
    return hasAny ? result : null
  }

  normalize(valid: unknown, ctx: CollectorContext): Record<string, unknown> {
    const r = valid as SocialFetchResult
    return {
      snapshot_date: ctx.snapshotDate,
      project_id:    ctx.projectId,
      platforms: {
        instagram: r.instagram.snapshot ? snapshotToPayload(r.instagram.snapshot) : null,
        facebook:  r.facebook.snapshot  ? snapshotToPayload(r.facebook.snapshot)  : null,
        youtube:   r.youtube.snapshot   ? snapshotToPayload(r.youtube.snapshot)   : null,
      },
      errors: {
        instagram: r.instagram.error,
        facebook:  r.facebook.error,
        youtube:   r.youtube.error,
      },
    }
  }

  async store(payload: Record<string, unknown>, ctx: CollectorContext): Promise<void> {
    if (!ctx.projectId) return
    const platforms = payload.platforms as Record<string, Record<string, unknown> | null>
    const entries = Object.entries(platforms) as [string, Record<string, unknown> | null][]

    // Supabase .upsert() never throws — it resolves to { data, error }.
    // We must explicitly collect and surface errors; otherwise silent failures
    // go undetected and the run is recorded as 'ok' despite missing snapshots.
    const results = await Promise.all(
      entries
        .filter(([, snap]) => snap !== null)
        .map(async ([platform, snap]) => {
          const { error } = await (ctx.db.from('account_snapshots') as any).upsert(
            {
              project_id:    ctx.projectId,
              platform,
              snapshot_date: ctx.snapshotDate,
              captured_at:   new Date().toISOString(),
              followers:     snap!.followers,
              following:     snap!.following,
              media_count:   snap!.media_count,
              reach:         snap!.reach,
              profile_views: snap!.profile_views,
              raw:           snap!.raw,
            },
            { onConflict: 'project_id,platform,snapshot_date' },
          )
          return { platform, error: error as { message: string } | null }
        }),
    )

    const failures = results.filter(r => r.error !== null)
    if (failures.length > 0) {
      const msgs = failures.map(r => `${r.platform}: ${r.error!.message}`).join('; ')
      throw new Error(`account_snapshots upsert failed — ${msgs}`)
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _empty(): SocialFetchResult {
  const none: PlatformResult = { snapshot: null, error: null }
  return { instagram: none, facebook: none, youtube: none, ytVideoId: null }
}

function settledToResult(settled: PromiseSettledResult<AccountSnapshot | null>): PlatformResult {
  if (settled.status === 'fulfilled') return { snapshot: settled.value, error: null }
  return { snapshot: null, error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason) }
}

function snapshotToPayload(s: AccountSnapshot): Record<string, unknown> {
  return {
    followers:     s.followers,
    following:     s.following,
    media_count:   s.mediaCount,
    reach:         s.reach,
    profile_views: s.profileViews,
    raw:           s.raw ?? null,
  }
}
