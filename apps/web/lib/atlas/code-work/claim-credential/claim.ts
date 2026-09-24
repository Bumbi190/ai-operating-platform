/**
 * SDF-1C1B — the internal, credential-bearing claim. Nothing exposes this yet: no
 * route, CLI command or broker call reaches it until Phase 1C2.
 *
 * The control plane issues the credential; only its HASH is handed to the store
 * (and from there to SQL). The RAW token is returned to the direct caller alone and
 * is deliberately NOT part of the returned run, so a run can be surfaced or logged
 * without leaking it. SQL stays authoritative for claim id, fence and lease.
 */

import 'server-only'

import type { CodeWorkControlPlaneStore } from '../control-plane/store'
import type { StoredCodeWorkRun } from '../control-plane/types'
import { issueBrokerClaimCredential } from './claim-credential'

export interface CodeWorkClaimInput {
  workId: string
  brokerId: string
  brokerHostId: string
}

export type CodeWorkClaimResult =
  | {
      status: 'claimed'
      run: StoredCodeWorkRun
      /** RAW claim token — possession evidence for THIS claim only, never authority. */
      claimToken: string
    }
  /**
   * The SQL boundary declined to create a claim and settled the run instead (for
   * example authorization no longer effective, or the runtime cap elapsed). No
   * credential exists for it, so none is returned.
   */
  | { status: 'not_claimed'; run: StoredCodeWorkRun }

export async function claimCodeWorkRun(
  store: Pick<CodeWorkControlPlaneStore, 'claim'>,
  input: CodeWorkClaimInput,
  random?: (size: number) => Buffer,
): Promise<CodeWorkClaimResult> {
  const credential = issueBrokerClaimCredential(input.workId, random)
  const run = await store.claim(input.workId, input.brokerId, input.brokerHostId, credential.tokenHash)
  if (!run.claimId) return { status: 'not_claimed', run }
  return { status: 'claimed', run, claimToken: credential.token }
}
