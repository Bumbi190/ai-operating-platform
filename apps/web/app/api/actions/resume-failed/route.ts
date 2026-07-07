/**
 * POST /api/actions/resume-failed  — agentisk åtgärd (inloggad operatör)
 *
 * Återstartar misslyckade körningar i ETT klick, från där de kraschade.
 * Body: { project_id?: string }  — utan project_id åtgärdas alla.
 *
 * Detta är "Fixa nu" som faktiskt utför arbetet, inte bara länkar.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resumeRun } from '@/lib/ai/resume'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_BATCH = 5

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { project_id?: string } = {}
  try { body = await request.json() } catch { /* tomt body ok */ }

  const admin = createAdminClient()
  const since7dISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  let q = (admin.from('runs') as any)
    .select('id')
    .eq('status', 'failed')
    .gte('created_at', since7dISO)
    .order('created_at', { ascending: false })
    .limit(MAX_BATCH)
  if (body.project_id) q = q.eq('project_id', body.project_id)

  const { data: failed, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const runs = (failed ?? []) as { id: string }[]
  if (runs.length === 0) return NextResponse.json({ ok: true, resumed: 0, message: 'Inga misslyckade körningar att återstarta' })

  let resumed = 0
  const failures: string[] = []
  for (const r of runs) {
    const res = await resumeRun(admin, r.id)
    if (res.ok) resumed++
    else failures.push(res.error ?? 'okänt fel')
  }

  return NextResponse.json({ ok: true, resumed, attempted: runs.length, failures })
}
