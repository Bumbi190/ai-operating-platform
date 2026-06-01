/**
 * GET /api/briefing/cron
 *
 * Bygger dagens Executive Briefing och mejlar den till operatören.
 * Skyddad med: Authorization: Bearer {CRON_SECRET}
 * Schemaläggs via Supabase pg_cron (se 20260601_briefing_cron.sql).
 *
 * Detta gör assistenten proaktiv även när appen är stängd.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Project } from '@/lib/supabase/types'
import { fetchBusinessSnapshots, fetchHeroSummary } from '@/lib/os/business'
import { buildExecutiveBriefing, deriveOperatorName } from '@/lib/os/briefing'
import { buildBriefingEmail } from '@/lib/email/briefingEmail'
import { sendEmail } from '@/lib/email/brevo'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  const { data: projectsRaw } = await (db.from('projects') as any)
    .select('id, owner_id, name, slug, color, settings, created_at')
    .order('created_at', { ascending: true })
  const projects = (projectsRaw ?? []) as Project[]

  const businesses = await fetchBusinessSnapshots(db, projects)
  const hero = await fetchHeroSummary(db, projects, businesses)

  const [pubCountRes, insCountRes] = await Promise.all([
    (db.from('media_scripts') as any).select('id', { count: 'exact', head: true }).eq('status', 'published'),
    (db.from('media_insights') as any).select('id', { count: 'exact', head: true }),
  ])
  const instagramInsightsMissing = (pubCountRes.count ?? 0) > 0 && (insCountRes.count ?? 0) === 0

  const operatorName = process.env.OPERATOR_NAME
    ?? deriveOperatorName(undefined, process.env.BREVO_ADMIN_EMAIL)

  const briefing = buildExecutiveBriefing(businesses, hero, operatorName, { instagramInsightsMissing })
  const { subject, html } = buildBriefingEmail(briefing)

  // Mottagare: BREVO_ADMIN_EMAIL om satt, annars projektägarens riktiga e-post.
  let recipient = process.env.BREVO_ADMIN_EMAIL ?? null
  if (!recipient && projects[0]?.owner_id) {
    try {
      const { data } = await (db as any).auth.admin.getUserById(projects[0].owner_id)
      recipient = data?.user?.email ?? null
    } catch { /* faller igenom */ }
  }

  if (!recipient) {
    return NextResponse.json({ ok: false, sent: false, error: 'Ingen mottagaradress hittad (sätt BREVO_ADMIN_EMAIL)' })
  }

  const result = await sendEmail({ to: recipient, subject, html, project: 'platform' })

  return NextResponse.json({
    ok: true,
    sent: result.success,
    to: recipient.replace(/(.{2}).*(@.*)/, '$1***$2'),
    error: result.success ? undefined : result.error,
    attentionCount: briefing.attentionCount,
  })
}
