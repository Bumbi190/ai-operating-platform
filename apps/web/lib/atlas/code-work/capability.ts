/** SDF-1A static capability declaration. Data only; no dispatcher exists here. */

import {
  CODE_WORK_CAPABILITY_ID,
  CODE_WORK_CAPABILITY_VERSION,
  CODE_WORK_RECEIPT_CLASSES,
} from './types'

export const CODE_WORK_OPERATION_FAMILIES = [
  'repository.inspect_readonly',
  'worktree.prepare_isolated',
  'file.create_bounded',
  'file.update_bounded',
  'file.delete_bounded',
  'file.rename_bounded',
  'command.execute_allowlisted',
] as const

export const CODE_WORK_FORBIDDEN_OPERATION_FAMILIES = [
  'git.commit',
  'git.push',
  'pull_request.mutate',
  'git.merge',
  'deployment.execute',
  'shell.arbitrary',
  'network.arbitrary',
  'credential.access',
  'authority.mutate',
  'policy.mutate',
  'repository.multi_mutate',
] as const

export const CODE_WORK_CAPABILITY = Object.freeze({
  capabilityId: CODE_WORK_CAPABILITY_ID,
  version: CODE_WORK_CAPABILITY_VERSION,
  allowedOperationFamilies: CODE_WORK_OPERATION_FAMILIES,
  forbiddenOperationFamilies: CODE_WORK_FORBIDDEN_OPERATION_FAMILIES,
  workerRequirements: Object.freeze({
    structuredOutputOnly: true,
    directFilesystemAccess: false,
    shellAccess: false,
    gitAccess: false,
    toolAccess: false,
  }),
  isolationRequirements: Object.freeze({
    vmBackedLinux: true,
    executionNetwork: 'denied' as const,
    executionSecrets: 'none' as const,
    worktreeRetention: 'explicit_cleanup_only' as const,
  }),
  evidenceRequirements: CODE_WORK_RECEIPT_CLASSES,
})

export function lookupCodeWorkCapability(id: unknown, version: unknown) {
  return id === CODE_WORK_CAPABILITY.capabilityId && version === CODE_WORK_CAPABILITY.version
    ? CODE_WORK_CAPABILITY
    : null
}
