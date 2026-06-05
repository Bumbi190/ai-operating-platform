/**
 * GET /api/media/cron/account-snapshot
 *
 * Tar en daglig KONTO-snapshot (följare m.m.) per plattform för The Prompt och
 * sparar i account_snapshots — grunden för Atlas tillväxt- & publikanalys (Fas 4).
 * Distinkt från /insights som hämtar per-INLÄGG-mått.
 *
 * Idempotent: upsert på (project_id, platform, snapshot_date) → en rad/dag/plattform.
 * Degraderar tyst: saknas ett token eller mått sparas det som null, aldrig påhittat.
 *
 * Schemalägg dagligen via pg_cron. Skyddad med: Authorization: Bearer {CRON_SECRET}
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getToken } from '@/lib/media/token-store'
import { igAccountSnapshot, fbAccountSnapshot, ytAccountSnapshot, type AccountSnapshot } from '@/lib/media/account-insights'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

// The Prompt — det enda projektet med sociala konton i nuläget.
const MEDIA_PROJECT_SLUG = 'ai-media-automation'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  const { data: project } = await db
    .from('projects').select('id').eq('slug', MEDIA_PROJECT_SLUG).maybeSingle()
  if (!project) return NextResponse.json({ error: `Projekt ${MEDIA_PROJECT_SLUG} saknas` }, { status: 404 })

  const today = new Date().toISOString().slice(0, 10)  // YYYY-MM-DD (UTC)
  const results: Record<string, unknown>[] = []

  async function capture(platform: 'instagram' | 'facebook' | 'youtube', snap: AccountSnapshot | null) {
    if (!snap) { results.push({ platform, status: 'no_token' }); return }
    const { error } = await (db.from('account_snapshots') as any).upsert({
      project_id:    project!.id,
      platform,
      snapshot_date: today,
      captured_at:   new Date().toISOString(),
      followers:     snap.followers,
      following:     snap.following,
      media_count:   snap.mediaCount,
      reach:         snap.reach,
      profile_views: snap.profileViews,
      raw:           snap.raw ?? null,
    }, { onConflict: 'project_id,platform,snapshot_date' })
    results.push({ platform, status: error ? 'db_error' : 'ok', followers: snap.followers, error: error?.message })
  }

  // Instagram
  const ig = await getToken('instagram')
  await capture('instagram', ig ? await igAccountSnapshot(ig.accessToken) : null)

  // Facebook — kräver page-id för att fråga page-noden direkt (annars #100 fan_count).
  const fb = await getToken('facebook')
  await capture('facebook', fb ? await fbAccountSnapshot(fb.accessToken, fb.accountId) : null)

  // YouTube — kanalstatistik via API-nyckel (publik data). Härled kanal ur senaste videoId.
  const ytKey = process.env.YOUTUBE_API_KEY
  if (ytKey) {
    const { data: lastYt } = await db
      .from('media_scripts')
      .select('youtube_video_id')
      .eq('project_id', project.id)
      .not('youtube_video_id', 'is', null)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const sampleVideoId = (lastYt as { youtube_video_id?: string } | null)?.youtube_video_id ?? null
    await capture('youtube', await ytAccountSnapshot(ytKey, sampleVideoId))
  } else {
    results.push({ platform: 'youtube', status: 'no_api_key' })
  }

  return NextResponse.json({ ok: true, date: today, results })
}
