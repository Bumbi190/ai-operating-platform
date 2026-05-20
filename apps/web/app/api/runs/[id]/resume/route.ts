/**
 * POST /api/runs/[id]/resume
 *
 * Återupptar en misslyckad körning från det steg som kraschade.
 * Bevarar all context från steg som redan körts klart — slösar inga krediter.
 *
 * Logik:
 * 1. Ladda körningen (måste ha status 'failed')
 * 2. Ladda run_logs — hitta alla steg som har en 'assistant'-logg (= klara steg)
 * 3. Sätt status → 'running', rensa error
 * 4. Kör executeWorkflow från första steg som SAKNAR assistant-logg
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { executeWorkflow } from '@/lib/ai/workflow-executor'
import type { WorkflowStep } from '@/lib/supabase/types'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const runId = params.id

  // Auth-kontroll
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Ladda körningen (as any — Supabase saknar genererade typer i detta projekt)
  const { data: runRaw } = await (admin as any)
    .from('runs')
    .select('id, status, context, input, workflow_id, project_id, workflows(steps)')
    .eq('id', runId)
    .single()

  const run = runRaw as {
    id: string
    status: string
    context: Record<string, string> | null
    input: Record<string, string> | null
    workflow_id: string
    project_id: string
    workflows: { steps: WorkflowStep[] } | { steps: WorkflowStep[] }[] | null
  } | null

  if (!run) return NextResponse.json({ error: 'Körning hittades inte' }, { status: 404 })

  if (!['failed', 'done'].includes(run.status)) {
    return NextResponse.json(
      { error: `Kan bara återuppta misslyckade körningar — nuvarande status: ${run.status}` },
      { status: 400 },
    )
  }

  // Ladda loggar — hitta vilka steg som redan har ett assistant-svar (= klara)
  const { data: logs } = await (admin as any)
    .from('run_logs')
    .select('step_order, role')
    .eq('run_id', runId)
    .eq('role', 'assistant')
    .not('step_order', 'is', null)

  const completedOrders = new Set(((logs ?? []) as any[]).map(l => l.step_order as number))

  // Hämta workflow-stegen
  const wf = Array.isArray(run.workflows) ? run.workflows[0] : run.workflows
  const steps = (wf?.steps ?? []) as WorkflowStep[]
  const sortedSteps = [...steps].sort((a, b) => a.order - b.order)

  // Hitta det lägsta steg-order som INTE har en assistant-logg → det är där vi börjar om
  const firstPendingOrder = sortedSteps.find(s => !completedOrders.has(s.order))?.order ?? 0

  console.log(`[resume ${runId}] Klara steg: [${Array.from(completedOrders).sort().join(', ')}] — startar om från steg ${firstPendingOrder}`)

  // Återställ körningsstatus
  await (admin as any).from('runs').update({
    status: 'running',
    error: null,
    finished_at: null,
  }).eq('id', runId)

  // Befintlig context (från steg som redan körts)
  const existingContext = (run.context ?? {}) as Record<string, string>
  const initialInput = (run.input ?? {}) as Record<string, string>

  // Kör i bakgrunden
  void executeWorkflow(admin, runId, run.project_id, sortedSteps, {
    initialInput,
    existingContext,
    startFromOrder: firstPendingOrder,
  })

  return NextResponse.json({
    run_id: runId,
    resuming_from_step: firstPendingOrder,
    completed_steps: Array.from(completedOrders).sort(),
  }, { status: 202 })
}
