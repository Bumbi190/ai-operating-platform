/**
 * /api/projects/[slug]/dream
 *
 * GET  — returnerar verifierat ACTIVE Dream-fynd för projektet.
 * POST — kör en dream cycle manuellt ("Kör nu"-knappen). Kräver inloggad användare.
 *
 * Den nattliga automatiska körningen sker via cron-routen /api/media/cron/dream,
 * som delar exakt samma kärnlogik (lib/ai/dream.ts).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runDreamCycleForProject } from '@/lib/ai/dream'
import { getDreamFindings } from '@/lib/atlas/dream'
import { GLOBAL_ONLY, projectScope } from '@/lib/governance/execution-stop'

// ── GET — hämta befintliga dream-insikter ────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug } = await params

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('slug', slug)
    .single()

  if (!project) return NextResponse.json({ error: 'Projekt hittades inte' }, { status: 404 })

  // The project was resolved through the authenticated client/RLS above. The
  // internal ledgers are read with service role only after that ownership proof.
  const findings = await getDreamFindings(createAdminClient(), project.id, 50)
  const active = findings.findings
    .filter(f => f.disposition === 'active')
    .map(f => ({
      key: f.issueId,
      value: `[${f.severity.toUpperCase()}] ${f.insight}${f.action ? ` → ${f.action}` : ''}`,
      updated_at: f.lastSeenAt,
    }))

  return NextResponse.json({
    memories: active,
    dispositions: findings.lifecycle,
    note: 'Only verified ACTIVE findings are returned as current Dream status.',
  })
}

// ── POST — kör dream cycle manuellt ──────────────────────────────────────────

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug } = await params

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('slug', slug)
    .single()

  if (!project) return NextResponse.json({ error: 'Projekt hittades inte' }, { status: 404 })

  try {
    const result = await runDreamCycleForProject(
      // The dream cycle IS this project's work: the route resolved the row and
      // checked ownership, so the project's own execution stop must refuse it.
      // GLOBAL_ONLY here would have been a project-stop bypass.
      { context: 'OPERATOR_EXECUTION' as const, scope: projectScope({ projectId: project.id }) },
      project,
    )
    if (!result.ran) {
      return NextResponse.json({
        message: 'Inga körningar de senaste 24h — dream cycle hoppades över',
        insights_saved: 0,
        summary: result.summary,
      })
    }
    return NextResponse.json({
      insights_saved: result.insights_saved,
      summary: result.summary,
      agent_suggestions: result.agent_suggestions ?? [],
      stats: result.stats,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Dream analysis misslyckades: ${msg}` }, { status: 500 })
  }
}
