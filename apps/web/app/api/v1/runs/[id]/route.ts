/**
 * GET /api/v1/runs/:id — Get run status and output
 *
 * Auth: Authorization: Bearer <AIOPS_API_KEY>
 *
 * Response (done):
 * {
 *   "id": "uuid",
 *   "status": "done",
 *   "duration_seconds": 7,
 *   "output": "Den färdiga texten...",
 *   "context": { "steg_1": "...", "sammanfattning": "..." }
 * }
 *
 * Response (running):
 * {
 *   "id": "uuid",
 *   "status": "running",
 *   "output": null,
 *   "context": { "steg_1": "..." }   // partial — whatever is done so far
 * }
 */

import { NextResponse } from 'next/server'
import { requireApiKey } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = requireApiKey(request)
  if (!auth.ok) return auth.response

  const db = createAdminClient()

  const { data: run, error: dbError } = await db
    .from('runs')
    .select('id, status, started_at, finished_at, context, error, input, workflow_id, workflows(name)')
    .eq('id', params.id)
    .single()

  if (dbError || !run) {
    return NextResponse.json({ error: 'Körning hittades inte' }, { status: 404 })
  }

  const workflow = Array.isArray(run.workflows) ? run.workflows[0] : run.workflows
  const duration =
    run.started_at && run.finished_at
      ? Math.round(
          (new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000,
        )
      : null

  // Get the last output from context
  const context = (run.context as Record<string, string>) ?? {}
  const contextKeys = Object.keys(context).filter(
    // exclude raw input keys — output keys come after
    (k) => !Object.keys((run.input as Record<string, string>) ?? {}).includes(k),
  )
  const lastOutput =
    contextKeys.length > 0
      ? context[contextKeys[contextKeys.length - 1]]
      : Object.keys(context).length > 0
        ? context[Object.keys(context)[Object.keys(context).length - 1]]
        : null

  return NextResponse.json({
    id: run.id,
    status: run.status,
    workflow_name: workflow?.name ?? null,
    input: run.input,
    duration_seconds: duration,
    output: run.status === 'done' ? lastOutput : null,
    context,
    error: (run as { error?: string }).error ?? null,
  })
}
