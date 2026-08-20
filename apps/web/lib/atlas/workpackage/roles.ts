/**
 * lib/atlas/workpackage/roles.ts — §21.34 Workforce role identity.
 *
 * THE REGISTRY IS `public.agents`, AND IT IS NOT INVENTED HERE.
 *
 * The audit for EI-S1.4D looked for a real, shipped source of "who does work"
 * and found exactly one. `agents` is:
 *
 *   • REAL — 35 rows in production, not an empty table waiting for a feature
 *   • PROJECT-SCOPED — `project_id` NOT NULL with an FK to `projects`, which is
 *     what makes §21.158 enforceable at this hop
 *   • THE RUNTIME AUTHORITY — `lib/ai/workflow-executor.ts` and
 *     `lib/ai/workflow-runner.ts` resolve `step.agent_id` against this table and
 *     FAIL when it is absent. Whatever else exists, this is the thing the
 *     system consults when work actually has to be done by someone.
 *
 * `workflows` was the other candidate and was rejected: a workflow is a
 * procedure, not a party. It has no capacity, receives nothing, and cannot
 * accept or refuse. §21.34 assigns work to a ROLE.
 *
 * WHAT THIS CANNOT PROVE, AND DOES NOT PRETEND TO. `agents.skill_ids` is a
 * `string[]` that resolves against nothing — there is no `skills` table, in the
 * repository or in production. So a declared skill is an uninterpreted label,
 * and capability CANNOT be proven from it. §21.35 role fitness is therefore
 * answered only where Stage 1 has real evidence:
 *
 *   role exists            YES — the registry says so
 *   project availability   YES — `agents.project_id` must match the package
 *   data access            YES — via the shipped `DOMAIN_REGISTRY` boundary
 *   capability / skills    NO  — no registry to resolve against; fails closed
 *   tools                  NO  — no tool registry exists (established EI-S1.4C)
 *   capacity / load        NO  — no source exists; not guessed
 *
 * No Trust Score, no Autonomy Licensing, no Damage Boundary, no Performance
 * Intelligence. Their absence is reported as absence, never as a default value
 * that would read like a passing check.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { DOMAIN_REGISTRY } from '../data-registry'
import type { MissionDataScope, MissionToolBound } from '../mission/types'

type AnyDb = any

/** What the registry actually knows about a role. Nothing is inferred. */
export interface WorkforceRole {
  roleId: string
  roleName: string
  projectId: string
  /** Uninterpreted labels. Present for reporting; never used to prove fitness. */
  declaredSkills: string[]
}

/** Reads the sanctioned role registry. Injectable so tests stay offline. */
export interface WorkforceRoleReader {
  (roleId: string): Promise<WorkforceRole | null>
}

export const readWorkforceRole: WorkforceRoleReader = async roleId => {
  const db = createAdminClient() as AnyDb
  const { data, error } = await db
    .from('agents')
    .select('id, name, project_id, skill_ids')
    .eq('id', roleId)
    .maybeSingle()
  if (error || !data) return null
  return {
    roleId: data.id,
    roleName: data.name,
    projectId: data.project_id,
    declaredSkills: Array.isArray(data.skill_ids) ? data.skill_ids : [],
  }
}

/** Why a role cannot receive a given package. */
export type RoleFitnessReason =
  | 'fit'
  | 'role_not_found'
  | 'role_project_mismatch'
  | 'data_access_unprovable'
  | 'tool_access_unprovable'

export interface RoleFitness {
  fit: boolean
  reason: RoleFitnessReason
  /** The specific tools/resources that could not be proven, for reporting. */
  unprovable: string[]
}

const REGISTERED_DOMAINS = new Set(Object.keys(DOMAIN_REGISTRY))

/**
 * §21.35 — can this role receive this package, on the evidence Stage 1 has?
 *
 * Pure over its inputs: the caller supplies the role it already read, so this
 * function performs no I/O and can be exercised directly.
 *
 * Tools fail closed for the same reason they do in the Delegation path: no
 * enumerated tool registry exists in this codebase, so a declared tool cannot
 * be proven reachable by anyone. A package whose tools were already proven by
 * its parent Delegation's acceptance passes them in as `provenTools`, which is
 * the only way this returns fit with tools present — the proof is inherited
 * from the accepted Delegation, never manufactured here.
 */
export function evaluateRoleFitness(input: {
  role: WorkforceRole | null
  projectId: string
  tools: MissionToolBound[]
  dataScope: MissionDataScope[]
  /** Tool keys the parent Delegation's acceptance already proved available. */
  provenTools: ReadonlySet<string>
}): RoleFitness {
  const { role, projectId, tools, dataScope, provenTools } = input

  if (!role) return { fit: false, reason: 'role_not_found', unprovable: [] }
  // §21.158 — a role in another project is not a candidate, whatever else it
  // can do. This is the isolation boundary at the Manager → Workforce hop.
  if (role.projectId !== projectId) {
    return { fit: false, reason: 'role_project_mismatch', unprovable: [role.projectId] }
  }

  const unprovableData = dataScope
    .filter(d => d.access !== 'read' || !REGISTERED_DOMAINS.has(d.resource))
    .map(d => `${d.resource}:${d.access}`)
  if (unprovableData.length > 0) {
    return { fit: false, reason: 'data_access_unprovable', unprovable: unprovableData }
  }

  const unprovableTools = tools
    .map(t => `${t.tool} ${t.restriction ?? ''}`)
    .filter(key => !provenTools.has(key))
  if (unprovableTools.length > 0) {
    return { fit: false, reason: 'tool_access_unprovable', unprovable: unprovableTools }
  }

  return { fit: true, reason: 'fit', unprovable: [] }
}
