/**
 * Atlas workflow authoring — definition validation (no engine changes).
 *
 * A single pure validator used by BOTH the `validate_workflow` (dry-run) and
 * `save_workflow` Atlas tools. It reuses the shipped `WorkflowStep` shape and the
 * same `{{variable}}` convention the runner/list_workflows already rely on, so an
 * authored workflow is structurally identical to a hand-written one.
 *
 * It does NOT touch the database or the execution engine — callers pass in the
 * set of agent ids that exist in the target project, and this module decides
 * whether the draft is safe to persist.
 */

import type { WorkflowStep } from '@/lib/supabase/types'

export const WORKFLOW_TRIGGERS = ['manual', 'cron', 'webhook'] as const
export type WorkflowTrigger = (typeof WORKFLOW_TRIGGERS)[number]

const OUTPUT_KEY_RE = /^[a-z][a-z0-9_]*$/i
const VAR_RE = /\{\{([^}]+)\}\}/g

export interface WorkflowStepDraft {
  order?: number
  name?: string
  agent_id?: string
  input_template?: string
  output_key?: string
}

export interface WorkflowDraft {
  name?: string
  description?: string | null
  steps?: WorkflowStepDraft[]
  trigger?: string
  cron_expr?: string | null
}

export interface WorkflowValidation {
  valid: boolean
  errors: string[]
  warnings: string[]
  /** `{{vars}}` not produced by any step → must be supplied when the run is triggered. */
  requiredInputs: string[]
  /** Clean, ordered steps ready to persist (only when `valid`). */
  normalizedSteps: WorkflowStep[]
  trigger: WorkflowTrigger
}

const varsIn = (tpl: string): string[] => {
  const out: string[] = []
  for (const m of tpl.matchAll(VAR_RE)) out.push(m[1].trim())
  return out
}

/**
 * Validate a workflow draft against the agents that exist in the target project.
 * Pure: no I/O. `knownAgentIds` is the allow-list of agent ids the caller resolved.
 */
export function validateWorkflowDraft(
  draft: WorkflowDraft | null | undefined,
  knownAgentIds: string[],
): WorkflowValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const d = draft ?? {}

  // ── name ──
  const name = (d.name ?? '').trim()
  if (!name) errors.push('name: krävs (icke-tom sträng).')

  // ── trigger / cron ──
  const trigger = (d.trigger ?? 'manual') as WorkflowTrigger
  if (!WORKFLOW_TRIGGERS.includes(trigger)) {
    errors.push(`trigger: måste vara en av ${WORKFLOW_TRIGGERS.join(', ')} (fick "${d.trigger}").`)
  }
  if (trigger === 'cron' && !(d.cron_expr ?? '').trim()) {
    errors.push('cron_expr: krävs när trigger="cron" (t.ex. "0 7 * * *").')
  }
  if (trigger !== 'cron' && (d.cron_expr ?? '').trim()) {
    warnings.push('cron_expr ignoreras eftersom trigger inte är "cron".')
  }

  // ── steps ──
  const rawSteps = Array.isArray(d.steps) ? d.steps : []
  if (rawSteps.length === 0) errors.push('steps: minst ett steg krävs.')

  // Assign orders: use provided numeric orders if ALL present + unique, else index.
  const allHaveOrder = rawSteps.every(s => typeof s.order === 'number' && Number.isFinite(s.order))
  const ordered = rawSteps
    .map((s, i) => ({ s, order: allHaveOrder ? (s.order as number) : i + 1 }))
    .sort((a, b) => a.order - b.order)
  if (!allHaveOrder && rawSteps.length > 0) {
    warnings.push('order saknades på ett eller flera steg — tilldelade ordning efter listposition.')
  }
  const orderSet = new Set<number>()
  for (const { order } of ordered) {
    if (orderSet.has(order)) errors.push(`order: dubblett (${order}). Varje steg måste ha unik ordning.`)
    orderSet.add(order)
  }

  // Per-step structural checks + output-key uniqueness.
  const outputKeys = new Set<string>()
  ordered.forEach(({ s, order }, idx) => {
    const where = `steg ${idx + 1} (order ${order})`
    if (!(s.name ?? '').trim()) errors.push(`${where}: name krävs.`)
    const agentId = (s.agent_id ?? '').trim()
    if (!agentId) errors.push(`${where}: agent_id krävs.`)
    else if (knownAgentIds.length > 0 && !knownAgentIds.includes(agentId)) {
      errors.push(`${where}: agent_id "${agentId}" finns inte i projektets agenter.`)
    }
    const outKey = (s.output_key ?? '').trim()
    if (!outKey) errors.push(`${where}: output_key krävs.`)
    else if (!OUTPUT_KEY_RE.test(outKey)) errors.push(`${where}: output_key "${outKey}" måste vara alfanumeriskt/understreck (t.ex. "draft_text").`)
    else if (outputKeys.has(outKey)) errors.push(`${where}: output_key "${outKey}" är inte unik.`)
    if (outKey) outputKeys.add(outKey)
  })

  // Template variable resolution: a var must be a prior step's output_key or an
  // external input. Referencing a later/own output_key is an ordering error.
  const requiredInputs = new Set<string>()
  const produced = new Set<string>()
  ordered.forEach(({ s }, idx) => {
    const stepNo = idx + 1
    for (const v of varsIn(s.input_template ?? '')) {
      if (produced.has(v)) continue                       // satisfied by an earlier step
      if (outputKeys.has(v)) {
        errors.push(`steg ${stepNo}: refererar {{${v}}} som produceras av ett senare/eget steg — flytta steget eller byt ordning.`)
      } else {
        requiredInputs.add(v)                             // external input supplied at trigger time
      }
    }
    if ((s.output_key ?? '').trim()) produced.add((s.output_key as string).trim())
  })

  const normalizedSteps: WorkflowStep[] = ordered.map(({ s, order }) => ({
    order,
    name: (s.name ?? '').trim(),
    agent_id: (s.agent_id ?? '').trim(),
    input_template: s.input_template ?? '',
    output_key: (s.output_key ?? '').trim(),
  }))

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    requiredInputs: [...requiredInputs],
    normalizedSteps,
    trigger,
  }
}
