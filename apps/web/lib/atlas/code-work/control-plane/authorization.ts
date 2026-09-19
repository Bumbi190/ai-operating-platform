/** Exact Authorization V1 effectiveness for one persisted admission. */

import type { AuthorizationEvent } from '@/lib/atlas/authorization/types'
import { isCodeWorkAuthorizationEffective } from '../binding'
import type { CodeWorkAdmissionV1 } from '../types'

export function effectiveCodeWorkAuthorization(
  events: AuthorizationEvent[],
  admission: CodeWorkAdmissionV1,
  at: string,
) {
  return isCodeWorkAuthorizationEffective(events, admission, at)
}
