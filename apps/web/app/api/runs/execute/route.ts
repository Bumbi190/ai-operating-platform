/**
 * POST /api/runs/execute  { run_id }
 *
 * LEGACY / MANUELL synkron exekvering av en redan skapad körning. Kör workflowet
 * inline (await) och sätter done/failed innan svar. Används INTE längre av chatten
 * eller av de durabla start-vägarna — dessa skapar 'pending' och låter pg_cron-
 * drainern (/api/runs/drain) claima och köra durabelt. Behålls för manuell
 * felsökning / omkörning av en specifik run.
 *
 * Skyddad med: Authorization: Bearer {CRON_SECRET}
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { executeWorkflow } from '@/lib/ai/workflow-runner'
import type { WorkflowStep } from '@/lib/supabase/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 300   // workflows kan ta tid — egen invocation, blockerar inte chatten

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { run_id } = await request.json() as { run_id?: string }
  if (!run_id) return NextResponse.json({ error: 'run_id krävs' }, { status: 400 })

  const db = createAdminClient()
  const { data: run } = await db
    .from('runs')
    .select('id, project_id, input, workflows(steps)')
    .eq('id', run_id)
    .single()

  if (!run) return NextResponse.json({ error: 'Körning hittades inte' }, { status: 404 })

  const wf = Array.isArray((run as any).workflows) ? (run as any).workflows[0] : (run as any).workflows
  const steps = (wf?.steps as WorkflowStep[]) ?? []

  try {
    await executeWorkflow(db, run.id, (run as any).project_id, steps, ((run as any).input as Record<string, string>) ?? {})
    return NextResponse.json({ ok: true, run_id })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'fel' }, { status: 500 })
  }
}
