/**
 * POST /api/runs — Start a workflow run
 *
 * Architecture decisions:
 * - Returns 202 immediately with run_id; execution happens async in background.
 * - Background execution uses the admin (service-role) client — NOT the
 *   cookie-bound user client — because the request lifecycle ends before
 *   execution completes. This is the #1 gotcha with async Next.js API routes.
 * - Steps execute sequentially. Context accumulates output_key → value pairs.
 * - Add Inngest/BullMQ queue ONLY when runs consistently exceed 55s
 *   (Vercel serverless function limit).
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { executeWorkflow } from '@/lib/ai/workflow-executor'
import type { WorkflowStep } from '@/lib/supabase/types'

export async function POST(request: Request) {
  // Auth check uses the user's session
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { workflow_id, input = {} } = body as {
    workflow_id: string
    input: Record<string, string>
  }

  if (!workflow_id) {
    return NextResponse.json({ error: 'workflow_id krävs' }, { status: 400 })
  }

  // Supabase saknar genererade DB-typer — castar till any för att undvika 'never'-fel
  const anySupabase = supabase as any

  // Verify workflow exists and belongs to the user
  const { data: workflow } = await anySupabase
    .from('workflows')
    .select('id, project_id, name, steps')
    .eq('id', workflow_id)
    .single()

  if (!workflow) {
    return NextResponse.json({ error: 'Workflow hittades inte' }, { status: 404 })
  }

  // Create run record
  const { data: run, error: runErr } = await anySupabase
    .from('runs')
    .insert({
      workflow_id: workflow.id,
      project_id: workflow.project_id,
      status: 'running',
      input,
      context: {},
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (runErr || !run) {
    console.error('Failed to create run:', runErr)
    return NextResponse.json({ error: 'Kunde inte skapa körning' }, { status: 500 })
  }

  // Starta körning i bakgrunden med admin-klienten (oberoende av request-lifecycle)
  const admin = createAdminClient()
  void executeWorkflow(admin, run.id, workflow.project_id, (workflow.steps as WorkflowStep[]) ?? [], {
    initialInput: input,
  })

  return NextResponse.json({ run_id: run.id }, { status: 202 })
}
