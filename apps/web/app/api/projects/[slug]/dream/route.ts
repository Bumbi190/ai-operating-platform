/**
 * /api/projects/[slug]/dream
 *
 * GET  — returnerar befintliga dream-insikter (nyckel-prefix "dream_") för projektet.
 * POST — kör en dream cycle manuellt ("Kör nu"-knappen). Kräver inloggad användare.
 *
 * Den nattliga automatiska körningen sker via cron-routen /api/media/cron/dream,
 * som delar exakt samma kärnlogik (lib/ai/dream.ts).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runDreamCycleForProject } from '@/lib/ai/dream'

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

  const { data: memories } = await supabase
    .from('memories')
    .select('key, value, updated_at')
    .eq('project_id', project.id)
    .like('key', 'dream_%')
    .order('updated_at', { ascending: false })

  return NextResponse.json({ memories: memories ?? [] })
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
    const result = await runDreamCycleForProject(project)
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
