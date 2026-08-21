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

/** Why a role may not RECEIVE a given package. */
export type RoleEligibilityReason =
  | 'eligible'
  | 'role_not_found'
  | 'role_project_mismatch'
  | 'data_domain_unsanctioned'
  | 'tool_unproven_at_parent'

/**
 * The dimensions §21.35 role fitness could ask about, and what Stage 1 can
 * actually answer. Naming them individually is the point: it is the difference
 * between "this role is fit" and "these three things were checked".
 */
export type RoleDimension =
  /** The role exists in the sanctioned registry. Proven by `agents`. */
  | 'identity'
  /** It belongs to this package's project. Proven by `agents.project_id`. */
  | 'project'
  /** The data domain is sanctioned platform-wide. Proven by DOMAIN_REGISTRY. */
  | 'platform_data_domain'
  /** The tool was proven available when the PARENT Delegation was accepted. */
  | 'parent_tool_availability'
  /** THIS role may personally use those tools. NO SOURCE EXISTS. */
  | 'role_specific_tool_permission'
  /** THIS role may personally read those resources. NO SOURCE EXISTS. */
  | 'role_specific_data_permission'
  /** THIS role has the skills the work needs. NO SOURCE EXISTS. */
  | 'role_specific_capability'
  /** THIS role has room to take the work. NO SOURCE EXISTS. */
  | 'capacity'

/**
 * The result of asking §21.35 with Stage 1's evidence.
 *
 * DELIBERATELY NOT CALLED `fit`. EI-S1.4D-R1 corrected that overclaim. What the
 * available sources establish is that a role is ELIGIBLE TO RECEIVE a package:
 *
 *   `agents`              proves the role exists and belongs to this project
 *   `DOMAIN_REGISTRY`     proves a data domain is sanctioned platform-wide —
 *                         that `leads` is readable through `get_records` at all,
 *                         NOT that this particular role may read it
 *   Delegation acceptance proves a tool was available to the PARENT, not that
 *                         this role personally holds permission to invoke it
 *
 * So `verified` and `unverified` are both reported, and the unverified list is
 * never empty for a package with tools or data. That is honest rather than
 * damaging, because §21.42 ASSIGNMENT IS NOT EXECUTION: the role has received
 * the package and nothing has started. The dimensions that remain unverified
 * are execution-time questions, and Stage 1 builds no execution.
 *
 * Nothing here invents a Trust Score, a skill engine or a permission model to
 * make the unverified list shorter.
 */
export interface RoleEligibility {
  /** May this role RECEIVE the package? Not: may it execute the work. */
  eligible: boolean
  reason: RoleEligibilityReason
  /** Dimensions an actual source answered. */
  verified: RoleDimension[]
  /** Dimensions no source in this repository can answer. Never faked. */
  unverified: RoleDimension[]
  /** The specific tools/resources behind a refusal, for reporting. */
  unprovable: string[]
}

const REGISTERED_DOMAINS = new Set(Object.keys(DOMAIN_REGISTRY))

/**
 * §21.35 — may this role RECEIVE this package, on the evidence Stage 1 has?
 *
 * Pure over its inputs: the caller supplies the role it already read, so this
 * performs no I/O and can be exercised directly.
 */
export function evaluateRoleEligibility(input: {
  role: WorkforceRole | null
  projectId: string
  tools: MissionToolBound[]
  dataScope: MissionDataScope[]
  /** Tool keys the parent Delegation's acceptance already proved available. */
  provenTools: ReadonlySet<string>
}): RoleEligibility {
  const { role, projectId, tools, dataScope, provenTools } = input

  // Every dimension no source can answer. Listed up front so a refusal and a
  // success report the same honest picture of what was never checked.
  const unverified: RoleDimension[] = ['role_specific_capability', 'capacity']
  if (dataScope.length > 0) unverified.push('role_specific_data_permission')
  if (tools.length > 0) unverified.push('role_specific_tool_permission')

  const deny = (reason: RoleEligibilityReason, unprovable: string[] = []): RoleEligibility =>
    ({ eligible: false, reason, verified: [], unverified, unprovable })

  if (!role) return deny('role_not_found')
  // §21.158 — a role in another project is not a candidate, whatever else it
  // can do. This is the isolation boundary at the Manager → Workforce hop.
  if (role.projectId !== projectId) return deny('role_project_mismatch', [role.projectId])

  const verified: RoleDimension[] = ['identity', 'project']

  // What DOMAIN_REGISTRY actually proves: the domain is sanctioned and readable
  // through the platform's own `get_records` boundary. Not that this role is.
  const unsanctioned = dataScope
    .filter(d => d.access !== 'read' || !REGISTERED_DOMAINS.has(d.resource))
    .map(d => `${d.resource}:${d.access}`)
  if (unsanctioned.length > 0) return deny('data_domain_unsanctioned', unsanctioned)
  if (dataScope.length > 0) verified.push('platform_data_domain')

  // What Delegation acceptance actually proves: the tool was available to the
  // parent. Not that this role personally holds permission to invoke it.
  const unproven = tools
    .map(t => `${t.tool} ${t.restriction ?? ''}`)
    .filter(key => !provenTools.has(key))
  if (unproven.length > 0) return deny('tool_unproven_at_parent', unproven)
  if (tools.length > 0) verified.push('parent_tool_availability')

  return { eligible: true, reason: 'eligible', verified, unverified, unprovable: [] }
}
