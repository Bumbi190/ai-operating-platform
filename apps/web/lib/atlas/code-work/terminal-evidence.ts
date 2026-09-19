/**
 * Canonical SDF-1 terminal evidence profiles.
 *
 * This is a pure contract. It does not read receipts and never manufactures
 * evidence. Persistence code uses the result to decide whether a requested
 * terminal transition is supportable by the receipts already in the chain.
 */

import type { CodeWorkTerminalState } from './lifecycle'
import type { CodeWorkAdmissionV1, CodeWorkReceiptClass } from './types'

export interface TerminalEvidenceRequirements {
  requiredReceiptClasses: CodeWorkReceiptClass[]
  requiredCommandIds: string[]
  /** A patch receipt is required only when final_diff reports a real change. */
  patchOperation: 'not_required' | 'when_changed'
  /** Classes whose payload must prove the positive form, not mere presence. */
  positiveReceiptClasses: CodeWorkReceiptClass[]
}

const unique = <T extends string>(values: readonly T[]): T[] => [...new Set(values)].sort()

const PROFILES: Record<CodeWorkTerminalState, readonly CodeWorkReceiptClass[]> = {
  ready_for_human_review: [
    'repository_proof', 'base_proof', 'authority_pins', 'worker_identity',
    'worktree_identity', 'file_scope', 'final_git_status', 'final_diff', 'terminal',
  ],
  tests_failed: ['command', 'test_result', 'terminal'],
  scope_violation: ['file_scope', 'terminal'],
  stale_base: ['base_proof', 'terminal'],
  worker_failed: ['worker_identity', 'terminal'],
  cancelled: ['cancellation_fencing', 'terminal'],
  timeout: ['terminal'],
  policy_denied: ['policy_denial', 'terminal'],
}

export function terminalEvidenceRequirements(
  state: CodeWorkTerminalState,
  admission: CodeWorkAdmissionV1,
): TerminalEvidenceRequirements {
  const ready = state === 'ready_for_human_review'
  const testOutcome = state === 'tests_failed'
  return {
    requiredReceiptClasses: unique([
      ...admission.evidence.requiredReceiptClasses,
      ...PROFILES[state],
    ]),
    requiredCommandIds: ready || testOutcome
      ? unique(admission.commands.approvedCommandIds)
      : [],
    patchOperation: ready ? 'when_changed' : 'not_required',
    positiveReceiptClasses: ready
      ? ['repository_proof', 'base_proof', 'authority_pins', 'worker_identity', 'worktree_identity', 'file_scope', 'command', 'test_result', 'final_git_status', 'final_diff', 'terminal']
      : [],
  }
}
