/**
 * lib/ai/checkpoint.ts — H1 step checkpointing.
 *
 * Computes where a run should (re)start so retries/resumes never re-run already
 * completed steps. A step counts as completed ONLY when BOTH are true:
 *   1. it logged an `assistant` run_logs row for that step_order, AND
 *   2. its output_key is present in the persisted run.context.
 * The second condition is stricter than the legacy resume logic — it prevents
 * resuming "into a hole" where a later step interpolates a missing variable.
 *
 * Read-only: pure inference from existing run_logs + runs.context.
 */
import 'server-only'
import type { WorkflowStep } from '@/lib/supabase/types'

type AnyDb = any

/**
 * Build the starting context for a run. Initial input is the base; COMPLETED STEP
 * OUTPUTS (existingContext) win on any key collision, so a resume never lets the
 * original input clobber a step's persisted output (Codex review #8). On a first
 * run existingContext is empty, so this is just the input.
 */
export function mergeRunContext(
  initialInput: Record<string, string>,
  existingContext: Record<string, string>,
): Record<string, string> {
  return { ...initialInput, ...existingContext }
}

export interface Checkpoint {
  /** Steps with order >= this run; earlier steps are reused from existingContext. */
  startFromOrder: number
  /** Persisted per-step outputs reused for skipped steps. */
  existingContext: Record<string, string>
}

export async function computeCheckpoint(
  db: AnyDb,
  run: { id: string; context: Record<string, string> | null },
  steps: WorkflowStep[],
): Promise<Checkpoint> {
  const existingContext = (run.context ?? {}) as Record<string, string>
  const sorted = [...steps].sort((a, b) => a.order - b.order)

  const { data: logs } = await db
    .from('run_logs')
    .select('step_order')
    .eq('run_id', run.id)
    .eq('role', 'assistant')
    .not('step_order', 'is', null)

  const loggedOrders = new Set<number>(((logs ?? []) as { step_order: number }[]).map(l => l.step_order))

  // A step is "done" only if it logged AND its output is actually in context.
  const isDone = (s: WorkflowStep) => loggedOrders.has(s.order) && s.output_key in existingContext

  const firstPending = sorted.find(s => !isDone(s))
  if (!firstPending) {
    // Everything already complete — nothing left to run (guards resume-of-done).
    const lastOrder = sorted.length ? sorted[sorted.length - 1].order : 0
    return { startFromOrder: lastOrder + 1, existingContext }
  }
  return { startFromOrder: firstPending.order, existingContext }
}
