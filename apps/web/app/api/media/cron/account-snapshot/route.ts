/**
 * GET /api/media/cron/account-snapshot
 *
 * Tar en daglig KONTO-snapshot (följare m.m.) per plattform PER PROJEKT och sparar
 * i account_snapshots — grunden för Atlas tillväxt- & publikanalys (Fas 4).
 * Distinkt från /insights som hämtar per-INLÄGG-mått.
 *
 * Projekt-medveten: loopar över alla projekt som har IG/FB-tokens (platform_tokens)
 * plus The Prompt (env-fallback). Varje projekt mäts med SITT eget token.
 * YouTube kör bara The Prompt (global env refresh-token / API-nyckel).
 *
 * Idempotent: upsert på (project_id, platform, snapshot_date). Degraderar tyst.
 * Schemalägg dagligen via pg_cron. Skyddad med: Authorization: Bearer {CRON_SECRET}
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getToken } from '@/lib/media/token-store'
import { igAccountSnapshot, fbAccountSnapshot, ytAccountSnapshot, type AccountSnapshot } from '@/lib/media/account-insights'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

// The Prompt äger de globala YouTube-/env-tokens.
const DEFAULT_PROJECT_SLUG = 'ai-media-automation'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)  // YYYY-MM-DD (UTC)
  const results: Record<string, unknown>[] = []

  // The Prompt (env-fallback-projektet) + alla projekt med sociala tokens.
  const { data: promptProj } = await db
    .from('projects').select('id').eq('slug', DEFAULT_PROJECT_SLUG).maybeSingle()
  const { data: tokenRows } = await db
    .from('platform_tokens').select('project_id').in('platform', ['instagram', 'facebook'])
  const projectIds = [...new Set([
    promptProj?.id,
    ...((tokenRows as { project_id: string }[] | null)?.map(r => r.project_id) ?? []),
  ].filter(Boolean))] as string[]

  async function capture(projectId: string, platform: 'instagram' | 'facebook' | 'youtube', snap: AccountSnapshot | null) {
    if (!snap) { results.push({ projectId, platform, status: 'no_token' }); return }
    const { error } = await (db.from('account_snapshots') as any).upsert({
      project_id:    projectId,
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
    results.push({ projectId, platform, status: error ? 'db_error' : 'ok', followers: snap.followers, error: error?.message })
  }

  // ── IG + FB per projekt (varje med sitt eget token) ─────────────────────────
  for (const projectId of projectIds) {
    const ig = await getToken('instagram', projectId)
    await capture(projectId, 'instagram', ig ? await igAccountSnapshot(ig.accessToken) : null)

    const fb = await getToken('facebook', projectId)
    await capture(projectId, 'facebook', fb ? await fbAccountSnapshot(fb.accessToken, fb.accountId) : null)
  }

  // ── YouTube — endast The Prompt (global env-token / API-nyckel) ─────────────
  const ytKey = process.env.YOUTUBE_API_KEY
  if (ytKey && promptProj?.id) {
    const { data: lastYt } = await db
      .from('media_scripts')
      .select('youtube_video_id')
      .eq('project_id', promptProj.id)
      .not('youtube_video_id', 'is', null)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const sampleVideoId = (lastYt as { youtube_video_id?: string } | null)?.youtube_video_id ?? null
    await capture(promptProj.id, 'youtube', await ytAccountSnapshot(ytKey, sampleVideoId))
  } else if (!ytKey) {
    results.push({ platform: 'youtube', status: 'no_api_key' })
  }

  return NextResponse.json({ ok: true, date: today, projects: projectIds.length, results })
}
