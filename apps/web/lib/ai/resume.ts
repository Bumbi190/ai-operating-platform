/**
 * lib/ai/resume.ts
 *
 * Återuppta en misslyckad körning från det steg som kraschade — utan att köra
 * om redan klara steg (slösar inga krediter). Extraherad så att både
 * /api/runs/[id]/resume och agentiska batch-åtgärder (Action Center "Fixa nu")
 * kan dela exakt samma logik.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { executeWorkflow } from '@/lib/ai/workflow-executor'
import type { WorkflowStep } from '@/lib/supabase/types'

export interface ResumeResult {
  ok: boolean
  runId: string
  resumingFromStep?: number
  error?: string
}

export async function resumeRun(admin: SupabaseClient, runId: string): Promise<ResumeResult> {
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

  if (!run) return { ok: false, runId, error: 'Körning hittades inte' }
  if (!['failed', 'done'].includes(run.status)) {
    return { ok: false, runId, error: `Kan bara återuppta misslyckade körningar (status: ${run.status})` }
  }

  const { data: logs } = await (admin as any)
    .from('run_logs')
    .select('step_order, role')
    .eq('run_id', runId)
    .eq('role', 'assistant')
    .not('step_order', 'is', null)

  const completedOrders = new Set(((logs ?? []) as any[]).map(l => l.step_order as number))

  const wf = Array.isArray(run.workflows) ? run.workflows[0] : run.workflows
  const steps = (wf?.steps ?? []) as WorkflowStep[]
  const sortedSteps = [...steps].sort((a, b) => a.order - b.order)
  const firstPendingOrder = sortedSteps.find(s => !completedOrders.has(s.order))?.order ?? 0

  await (admin as any).from('runs').update({
    status: 'running',
    error: null,
    finished_at: null,
  }).eq('id', runId)

  void executeWorkflow(admin, runId, run.project_id, sortedSteps, {
    initialInput: (run.input ?? {}) as Record<string, string>,
    existingContext: (run.context ?? {}) as Record<string, string>,
    startFromOrder: firstPendingOrder,
  })

  return { ok: true, runId, resumingFromStep: firstPendingOrder }
}
