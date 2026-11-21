/**
 * Inert Atlas/Nova GitHub operation ROUTING POLICY candidate.
 *
 * Owner rule (29 Oct 2026):
 *   - Nova may propose manual repo deletion, but must NEVER perform it.
 *   - Only the owner can delete an entire GitHub repository, manually at GitHub.
 *   - Nova may pause work/revoke project-level integration authority without
 *     deleting the repository, and may create repositories only through a
 *     separate task-scoped, owner-authorized WRITE-capable workflow.
 *
 * This file does NOT grant capabilities or invoke tools. It is a contract for
 * a future authenticated tool broker. Actual enforcement in every browser,
 * desktop, agent and GitHub write path remains an independent release gate.
 *
 * "Pling" is ONLY a 3D Agent Office avatar, never a workflow principal; the
 * Familje-Stunden story character Pling is entirely unrelated to this policy.
 */
export const NOVA_GITHUB_OPERATION_POLICY_VERSION = 'nova.github.operation.v0' as const
export const NOVA_MAY_DELETE_GITHUB_REPOSITORIES = false as const

export type NovaGithubOperationDisposition =
  | 'read_scope_required'
  | 'separate_scoped_create_broker_required'
  | 'project_scoped_stop_required'
  | 'advice_only'
  | 'manual_owner_only'
  | 'deny'

export interface NovaGithubOperationDecision {
  readonly disposition: NovaGithubOperationDisposition
  /** Never a server authorization; always false for this inert policy. */
  readonly authorizesExecution: false
  /** No Nova route may delete any GitHub repository, now or later. */
  readonly repositoryDeletionAllowed: false
}

function decision(disposition: NovaGithubOperationDisposition): NovaGithubOperationDecision {
  return Object.freeze({
    disposition,
    authorizesExecution: false as const,
    repositoryDeletionAllowed: false as const,
  })
}

const DENY = decision('deny')
const READ = decision('read_scope_required')
const CREATE = decision('separate_scoped_create_broker_required')
const STOP = decision('project_scoped_stop_required')
const ADVICE = decision('advice_only')
const MANUAL = decision('manual_owner_only')

/**
 * Exact, default-deny operation classification. Global Atlas knowledge, an
 * "ownerApproved" flag or a caller's text MUST NOT expand this decision into
 * a tool execution grant. This accepts a single canonical operation name only.
 */
export function classifyNovaGithubOperation(operation: unknown): NovaGithubOperationDecision {
  if (typeof operation !== 'string' || operation.length > 80 ||
    operation.trim() !== operation) return DENY
  switch (operation) {
    case 'discover_repositories':
    case 'inspect_repository_source':
      return READ
    case 'create_repository':
      return CREATE
    case 'pause_project_workflow':
    case 'revoke_project_github_access':
    case 'disconnect_omnira_github_integration':
      return STOP
    case 'recommend_repository_deletion':
      return ADVICE
    case 'delete_repository':
    case 'permanently_delete_repository':
    case 'remove_github_repository':
      return MANUAL
    default:
      return DENY
  }
}
