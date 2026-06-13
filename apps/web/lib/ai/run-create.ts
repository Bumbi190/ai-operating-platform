/**
 * lib/ai/run-create.ts — shared run-enqueue payload (H1.P3).
 *
 * Single source of truth for creating a durable agent-step run. Captures the
 * workflow's steps as an immutable `steps_snapshot` so the drain/executor never
 * re-read live `workflows.steps` mid-run (durable resume; audit M3/#6). All
 * agent-step enqueue paths (/api/runs, /api/v1/runs, /api/chat trigger_workflow,
 * manager.retryFailedRun) must build their insert through this helper so the
 * snapshot can never be forgotten on one path.
 *
 * Marketing runs (workflow_id null, dispatched by `kind`) do NOT use this — they
 * have no agent steps to snapshot.
 */
import type { Json } from '@/lib/supabase/database.types'

export interface WorkflowForRun {
  id: string
  project_id: string
  steps: Json | null
}

export interface AgentRunInsert {
  workflow_id: string
  project_id: string
  status: 'pending'
  input: Record<string, string>
  context: Record<string, never>
  steps_snapshot: Json | null
}

/**
 * Build the insert payload for a durable agent-step run. Always `pending` (the
 * pg_cron drain claims + executes it under a lease) and always carries the steps
 * snapshot taken from the workflow at creation time.
 */
export function buildAgentRunInsert(
  workflow: WorkflowForRun,
  input: Record<string, string>,
): AgentRunInsert {
  return {
    workflow_id: workflow.id,
    project_id: workflow.project_id,
    status: 'pending',
    input,
    context: {},
    steps_snapshot: workflow.steps ?? null,
  }
}
