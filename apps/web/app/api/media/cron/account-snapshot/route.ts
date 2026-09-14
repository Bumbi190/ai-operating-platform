/**
 * GET /api/media/cron/account-snapshot
 *
 * Tar en daglig KONTO-snapshot (följare m.m.) per plattform PER PROJEKT och sparar
 * i account_snapshots — grunden för Atlas tillväxt- & publikanalys (Fas 4).
 * Distinkt från /insights som hämtar per-INLÄGG-mått.
 *
 * Projekt-medveten (project-scoped social credentials, 2026-09-14): mäter exakt de
 * konton projekten har verifierade bindningar för, varje projekt med SIN egen
 * verifierade credential (lib/media/social-credentials.ts). Inget standardprojekt,
 * ingen env-token. YouTube mäts för projekt med en kanalbindning, som publik data
 * (API-nyckel) för en video projektet självt har laddat upp.
 *
 * Idempotent: upsert på (project_id, platform, snapshot_date). Degraderar tyst.
 * Schemalägg dagligen via pg_cron. Skyddad med: Authorization: Bearer {CRON_SECRET}
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listActiveBindings, type SocialPlatform } from '@/lib/media/social-bindings'
import { createCredentialResolver } from '@/lib/media/social-credentials'
import { igAccountSnapshot, fbAccountSnapshot, ytAccountSnapshot, type AccountSnapshot } from '@/lib/media/account-insights'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)  // YYYY-MM-DD (UTC)
  const results: Record<string, unknown>[] = []

  // The accounts to measure are the verified bindings — nothing else.
  const bindings = await listActiveBindings()
  if (!bindings.ok) {
    return NextResponse.json({ ok: false, date: today, error: 'bindings_unreadable' }, { status: 500 })
  }
  const projectIds = [...new Set(bindings.bindings.map(b => b.projectId))]
  const credentials = createCredentialResolver()

  async function capture(projectId: string, platform: SocialPlatform, snap: AccountSnapshot | null, refusal?: string) {
    if (!snap) { results.push({ projectId, platform, status: refusal ? `refused:${refusal}` : 'no_data' }); return }
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

  const ytKey = process.env.YOUTUBE_API_KEY

  for (const binding of bindings.bindings) {
    const { projectId } = binding

    if (binding.platform === 'instagram') {
      // The project's own verified Instagram account.
      const ig = await credentials.instagram(projectId)
      await capture(projectId, 'instagram', ig.ok ? await igAccountSnapshot(ig.credential) : null, ig.ok ? undefined : ig.refusal)
    } else if (binding.platform === 'facebook') {
      // The project's own verified Facebook page.
      const fb = await credentials.facebook(projectId)
      await capture(projectId, 'facebook', fb.ok ? await fbAccountSnapshot(fb.credential) : null, fb.ok ? undefined : fb.refusal)
    } else {
      // YouTube: public channel data for a video this project uploaded.
      if (!ytKey) { results.push({ projectId, platform: 'youtube', status: 'no_api_key' }); continue }
      const { data: lastYt } = await db
        .from('media_scripts')
        .select('youtube_video_id')
        .eq('project_id', projectId)
        .not('youtube_video_id', 'is', null)
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const sampleVideoId = (lastYt as { youtube_video_id?: string } | null)?.youtube_video_id ?? null
      await capture(projectId, 'youtube', await ytAccountSnapshot(ytKey, sampleVideoId))
    }
  }

  return NextResponse.json({ ok: true, date: today, projects: projectIds.length, results })
}
