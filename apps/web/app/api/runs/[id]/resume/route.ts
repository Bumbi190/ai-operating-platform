/**
 * POST /api/runs/[id]/resume
 *
 * Återupptar en misslyckad körning från det steg som kraschade.
 * Delar logik med agentiska batch-åtgärder via lib/ai/resume.ts.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { resumeRun } from '@/lib/ai/resume'
import { resolveProjectAccess, assertProjectAllowed } from '@/lib/auth/project-access'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const admin = createAdminClient()

  // ISOLATION (C-1): the run must belong to one of the caller's projects. This
  // route uses the service-role client (RLS-bypassing), so it must enforce the
  // project boundary itself. Missing and foreign runs both return 404 so an
  // authenticated caller cannot probe whether another user's run id exists.
  const { data: ownerRow } = await admin.from('runs').select('project_id').eq('id', params.id).single()
  if (!ownerRow || !assertProjectAllowed(ownerRow.project_id, access.allowedProjectIds)) {
    return NextResponse.json({ error: 'Inte hittad' }, { status: 404 })
  }

  const result = await resumeRun(admin, params.id)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error?.includes('hittades') ? 404 : 400 })
  }
  return NextResponse.json({ run_id: result.runId, status: result.status ?? 'queued' }, { status: 202 })
}
