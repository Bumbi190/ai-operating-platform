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
import { NextResponse } from 'next/server'
import { buildAgentRunInsert } from '@/lib/ai/run-create'

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
    .select('id, project_id, name, steps, side_effect_class')
    .eq('id', workflow_id)
    .single()

  if (!workflow) {
    return NextResponse.json({ error: 'Workflow hittades inte' }, { status: 404 })
  }

  // Create run record
  // DURABLE: skapa körningen som 'pending'. Ingen inline-körning (inget fire-and-forget).
  // pg_cron-drainern (/api/runs/drain) claimar och kör den durabelt.
  const { data: run, error: runErr } = await anySupabase
    .from('runs')
    .insert(buildAgentRunInsert(workflow, input))
    .select('id')
    .single()

  if (runErr || !run) {
    console.error('Failed to create run:', runErr)
    return NextResponse.json({ error: 'Kunde inte skapa körning' }, { status: 500 })
  }

  return NextResponse.json({ run_id: run.id, status: 'pending' }, { status: 202 })
}
