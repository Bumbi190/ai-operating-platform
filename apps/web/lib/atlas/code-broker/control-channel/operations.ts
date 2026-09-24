/**
 * SDF-1C2 — the four broker control-channel operations, on top of an ALREADY AUTHENTICATED
 * broker principal. Nothing here authenticates; the HTTP handler must have passed the request
 * through `authenticateBrokerRequest` first.
 *
 * Identity ≠ credential ≠ authority. The broker's repository allowlist is an eligibility
 * restriction, not project authority; SQL independently requires an authorized run, live
 * Authorization V1, no cancellation and a live runtime cap. Broker id and host id come only
 * from the principal, never from a request body.
 *
 * This module executes NOTHING: no repository access, no context delivery, no model call.
 */

import 'server-only'

import { brokerClaimTokenHash, isBrokerClaimToken } from '../../code-work/claim-credential/claim-credential'
import { claimCodeWorkRun, recoverCodeWorkClaimCredential } from '../../code-work/claim-credential/claim'
import { createCodeWorkControlPlaneStore, type CodeWorkControlPlaneStore } from '../../code-work/control-plane/store'
import { BROKER_DISCOVERY_MAX_RESULTS, type BrokerDiscoverableWork } from '../../code-work/control-plane/types'
import type { StoredBroker } from '../types'
import type { HeartbeatBody, WorkIdBody } from './dto'

export interface ControlChannelDeps {
  store?: Pick<CodeWorkControlPlaneStore,
    'discoverClaimable' | 'repositoryIdForWork' | 'claim' | 'recoverClaimCredential' | 'heartbeat'>
  random?: (size: number) => Buffer
}

function store(deps?: ControlChannelDeps) { return deps?.store ?? createCodeWorkControlPlaneStore() }

/** Repository eligibility: the run's (immutable) repository must be in THIS broker's allowlist. */
async function eligible(broker: StoredBroker, workId: string, s: NonNullable<ControlChannelDeps['store']>): Promise<boolean> {
  const repositoryId = await s.repositoryIdForWork(workId)
  return repositoryId !== null && broker.allowedRepositoryIds.includes(repositoryId)
}

export async function discoverForBroker(broker: StoredBroker, deps?: ControlChannelDeps): Promise<{ work: BrokerDiscoverableWork[] }> {
  const work = await store(deps).discoverClaimable(broker.allowedRepositoryIds, BROKER_DISCOVERY_MAX_RESULTS)
  // Re-project to the closed shape: whatever a store returns, only these three fields leave.
  return { work: work.slice(0, BROKER_DISCOVERY_MAX_RESULTS).map(item => ({
    workId: item.workId, repositoryId: item.repositoryId, pinnedBaseSha: item.pinnedBaseSha,
  })) }
}

export type ClaimOutcome =
  | { status: 'claimed'; workId: string; claimId: string; fence: number; leaseUntil: string; claimToken: string }
  | { status: 'unavailable' }

/** Unknown work, foreign repository and unclaimable work are all the same `unavailable`. */
export async function claimForBroker(broker: StoredBroker, body: WorkIdBody, deps?: ControlChannelDeps): Promise<ClaimOutcome> {
  const s = store(deps)
  try {
    if (!await eligible(broker, body.workId, s)) return { status: 'unavailable' }
    const result = await claimCodeWorkRun(s, { workId: body.workId, brokerId: broker.brokerId, brokerHostId: broker.hostId }, deps?.random)
    if (result.status !== 'claimed' || !result.run.leaseUntil) return { status: 'unavailable' }
    return { status: 'claimed', workId: result.run.workId, claimId: result.run.claimId!, fence: result.run.fence, leaseUntil: result.run.leaseUntil, claimToken: result.claimToken }
  } catch {
    return { status: 'unavailable' }
  }
}

export type RecoverOutcome = ClaimOutcome

export async function recoverForBroker(broker: StoredBroker, body: WorkIdBody, deps?: ControlChannelDeps): Promise<RecoverOutcome> {
  const s = store(deps)
  try {
    if (!await eligible(broker, body.workId, s)) return { status: 'unavailable' }
    const result = await recoverCodeWorkClaimCredential(s, { workId: body.workId, brokerId: broker.brokerId, brokerHostId: broker.hostId }, deps?.random)
    if (result.status !== 'recovered' || !result.run.leaseUntil) return { status: 'unavailable' }
    return { status: 'claimed', workId: result.run.workId, claimId: result.run.claimId!, fence: result.run.fence, leaseUntil: result.run.leaseUntil, claimToken: result.claimToken }
  } catch {
    return { status: 'unavailable' }
  }
}

export type HeartbeatOutcome =
  | { status: 'renewed'; workId: string; claimId: string; fence: number; leaseUntil: string; state: string }
  | { status: 'not_live' }

/**
 * The raw claim token is validated and hashed here; ONLY the hash goes to SQL, where the claim
 * proof is verified under the same row lock that renews the lease (no read-then-heartbeat window).
 */
export async function heartbeatForBroker(broker: StoredBroker, body: HeartbeatBody, deps?: ControlChannelDeps): Promise<HeartbeatOutcome> {
  if (!isBrokerClaimToken(body.claimToken)) return { status: 'not_live' }
  try {
    const run = await store(deps).heartbeat(
      body.workId, body.claimId, body.fence, broker.brokerId, broker.hostId,
      brokerClaimTokenHash(body.workId, body.claimToken),
    )
    if (run.claimId !== body.claimId || run.fence !== body.fence || !run.leaseUntil || run.cancelRequested) return { status: 'not_live' }
    return { status: 'renewed', workId: run.workId, claimId: run.claimId, fence: run.fence, leaseUntil: run.leaseUntil, state: run.state }
  } catch {
    return { status: 'not_live' }
  }
}
