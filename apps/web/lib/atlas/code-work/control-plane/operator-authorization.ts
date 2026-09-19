/** Pure exact-binding check shared by SDF-1B2 reads and decisions. */

import type { AuthorizationEvent } from '@/lib/atlas/authorization/types'
import { bindingForCodeWorkAdmission, codeWorkAdmissionHash } from '../binding'
import type { StoredCodeWorkRun } from './types'

export function operatorAuthorizationHistoryMatchesRun(
  run: StoredCodeWorkRun,
  history: AuthorizationEvent[],
): boolean {
  if (history.length === 0 || codeWorkAdmissionHash(run.admission) !== run.admissionHash) return false
  const binding = bindingForCodeWorkAdmission(run.admission)
  return history.every(event =>
    event.authorizationId === run.authorizationId
    && event.projectId === run.projectId
    && event.target.targetType === binding.target.targetType
    && event.target.targetId === binding.target.targetId
    && event.target.versionHash === binding.target.versionHash
    && event.authority.actionKind === binding.actionKind)
}
