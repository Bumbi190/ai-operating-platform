/** SDF-1A semantic authorization binding for one exact admission. Pure. */

import { canonicalTargetVersionHash } from '../authorization/build'
import { isEffectiveNow } from '../authorization/derive'
import type {
  AuthorizationEffectivenessResult,
  AuthorizationEvent,
  AuthorizationTarget,
} from '../authorization/types'
import { normalizePathSet } from './path-policy'
import { validateCodeWorkAdmission } from './policy'
import {
  CODE_WORK_AUTHORIZATION_ACTION_KIND,
  CODE_WORK_AUTHORIZATION_TARGET_TYPE,
  CodeWorkContractError,
} from './types'
import type { CodeWorkAdmissionV1 } from './types'

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}

/**
 * Every authority-bearing field is enumerated explicitly. There are no
 * timestamps or annotations in the admission, so there are no unbound fields.
 */
export function codeWorkAdmissionBoundProjection(admission: CodeWorkAdmissionV1): Record<string, unknown> {
  const validation = validateCodeWorkAdmission(admission)
  if (!validation.ok) throw new CodeWorkContractError(validation.violations)

  const readScopes = normalizePathSet(admission.files.readScopes, 'files.readScopes')
  const writeScopes = normalizePathSet(admission.files.writeScopes, 'files.writeScopes')
  const deniedScopes = normalizePathSet(admission.files.deniedScopes, 'files.deniedScopes')
  if (!readScopes.ok || !writeScopes.ok || !deniedScopes.ok) {
    throw new CodeWorkContractError([
      ...(!readScopes.ok ? readScopes.violations : []),
      ...(!writeScopes.ok ? writeScopes.violations : []),
      ...(!deniedScopes.ok ? deniedScopes.violations : []),
    ])
  }

  return {
    schema: admission.schema,
    version: admission.version,
    workId: admission.workId,
    projectId: admission.projectId,
    governance: {
      mission: { ...admission.governance.mission },
      authorizationTarget: { ...admission.governance.authorizationTarget },
      delegation: { ...admission.governance.delegation },
      workPackage: { ...admission.governance.workPackage },
    },
    repository: {
      repositoryId: admission.repository.repositoryId,
      owner: admission.repository.owner,
      name: admission.repository.name,
      expectedRemote: { ...admission.repository.expectedRemote },
      pinnedBaseSha: admission.repository.pinnedBaseSha,
      approvedRemote: admission.repository.approvedRemote,
      approvedBaseRef: admission.repository.approvedBaseRef,
    },
    worktree: { ...admission.worktree },
    worker: { ...admission.worker },
    files: {
      readScopes: readScopes.value,
      writeScopes: writeScopes.value,
      deniedScopes: deniedScopes.value,
      permissions: { ...admission.files.permissions },
    },
    commands: {
      approvedCommandIds: sortedUnique(admission.commands.approvedCommandIds),
      registryVersion: admission.commands.registryVersion,
      registryHash: admission.commands.registryHash,
    },
    limits: { ...admission.limits },
    isolation: { ...admission.isolation },
    evidence: { requiredReceiptClasses: sortedUnique(admission.evidence.requiredReceiptClasses) },
    stopConditions: sortedUnique(admission.stopConditions),
  }
}

export function codeWorkAdmissionHash(admission: CodeWorkAdmissionV1): string {
  return canonicalTargetVersionHash(codeWorkAdmissionBoundProjection(admission))
}

export interface CodeWorkAuthorizationBinding {
  projectId: string
  target: AuthorizationTarget
  actionKind: typeof CODE_WORK_AUTHORIZATION_ACTION_KIND
}

export function bindingForCodeWorkAdmission(admission: CodeWorkAdmissionV1): CodeWorkAuthorizationBinding {
  return {
    projectId: admission.projectId,
    target: {
      targetType: CODE_WORK_AUTHORIZATION_TARGET_TYPE,
      targetId: admission.workId,
      versionHash: codeWorkAdmissionHash(admission),
    },
    actionKind: CODE_WORK_AUTHORIZATION_ACTION_KIND,
  }
}

/** Reuses Authorization V1; conditional grants remain fail-closed. */
export function isCodeWorkAuthorizationEffective(
  events: AuthorizationEvent[],
  admission: CodeWorkAdmissionV1,
  at: string,
): AuthorizationEffectivenessResult {
  const binding = bindingForCodeWorkAdmission(admission)
  return isEffectiveNow(events, { ...binding, at })
}
