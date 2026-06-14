/**
 * POST /api/v1/runs — Trigger a workflow run
 * GET  /api/v1/runs — List recent runs
 *
 * Auth: Authorization: Bearer <AIOPS_API_KEY>
 *
 * POST body:
 * {
 *   "workflow_id": "uuid",
 *   "input": { "tema": "havet", "ålder": "6–9 år" }
 * }
 *
 * POST response (202):
 * { "run_id": "uuid", "status": "pending" }
 *
 * DURABLE: körningen skapas som 'pending' och körs av pg_cron-drainern
 * (/api/runs/drain). Inget fire-and-forget — status speglar alltid verkligheten.
 */

import { NextResponse } from 'next/server'
import { requireApiKey } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildAgentRunInsert } from '@/lib/ai/run-create'

export async function GET(request: Request) {
  const auth = requireApiKey(request)
  if (!auth.ok) return auth.response

  const db = createAdminClient()
  const url = new URL(request.url)
  const limit = parseInt(url.searchParams.get('limit') ?? '10')

  const { data: runs, error } = await db
    .from('runs')
    .select('id, status, created_at, started_at, finished_at, input, context, error, workflows(name), projects(name, slug)')
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 50))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(
    (runs ?? []).map((r) => {
      const workflow = Array.isArray(r.workflows) ? r.workflows[0] : r.workflows
      const project = Array.isArray(r.projects) ? r.projects[0] : r.projects
      const duration =
        r.started_at && r.finished_at
          ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000)
          : null
      return {
        id: r.id,
        status: r.status,
        workflow_name: workflow?.name ?? null,
        project_slug: project?.slug ?? null,
        input: r.input,
        duration_seconds: duration,
        created_at: r.created_at,
      }
    }),
  )
}

export async function POST(request: Request) {
  const auth = requireApiKey(request)
  if (!auth.ok) return auth.response

  const db = createAdminClient()
  const body = await request.json()
  const { workflow_id, input = {} } = body as {
    workflow_id: string
    input: Record<string, string>
  }

  if (!workflow_id) {
    return NextResponse.json({ error: 'workflow_id krävs' }, { status: 400 })
  }

  const { data: workflow } = await db
    .from('workflows')
    .select('id, project_id, name, steps, side_effect_class')
    .eq('id', workflow_id)
    .single()

  if (!workflow) {
    return NextResponse.json({ error: 'Workflow hittades inte' }, { status: 404 })
  }

  // DURABLE: skapa som 'pending'. Ingen inline-körning (inget fire-and-forget) —
  // pg_cron-drainern (/api/runs/drain) claimar och kör den durabelt.
  const { data: run, error: runErr } = await db
    .from('runs')
    .insert(buildAgentRunInsert(workflow, input))
    .select('id')
    .single()

  if (runErr || !run) {
    return NextResponse.json({ error: 'Kunde inte skapa körning' }, { status: 500 })
  }

  return NextResponse.json({ run_id: run.id, status: 'pending' }, { status: 202 })
}
