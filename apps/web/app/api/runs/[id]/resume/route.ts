/**
 * POST /api/runs/[id]/resume
 *
 * Återupptar en misslyckad körning från det steg som kraschade.
 * Delar logik med agentiska batch-åtgärder via lib/ai/resume.ts.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { resumeRun } from '@/lib/ai/resume'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const result = await resumeRun(admin, params.id)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error?.includes('hittades') ? 404 : 400 })
  }
  return NextResponse.json({ run_id: result.runId, resuming_from_step: result.resumingFromStep }, { status: 202 })
}
