/**
 * SDF-1B2 authenticated operator writes.
 *
 * This is an authorization/control-plane boundary only. It can create an
 * immutable proposal, append one human Authorization V1 decision, synchronize
 * the dormant lifecycle, or request cancellation. It imports no broker,
 * provider, filesystem, command, Git or deployment runtime.
 */

import 'server-only'

import { randomUUID } from 'node:crypto'
import { assertProjectAllowed } from '@/lib/atlas/isolation'
import {
  denyAuthorization,
  grantAuthorization,
  type AuthorizationWriteResult,
} from '@/lib/atlas/authorization/principal-write'
import { deriveAuthorizationState } from '@/lib/atlas/authorization/derive'
import { createAuthorizationEventStore, type AuthorizationEventStore } from '@/lib/atlas/authorization/store'
import type { AuthorizationEvent } from '@/lib/atlas/authorization/types'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { resolveWorkPackage } from '@/lib/atlas/workpackage/principal-read'
import type { WorkPackageEvaluation } from '@/lib/atlas/workpackage/types'
import { isTerminalCodeWorkState } from '../lifecycle'
import { deriveCodeWorkProposal } from './derive-admission'
import {
  buildOperatorCodeWorkBindings,
  OPERATOR_PROPOSAL_MISSION_RISK_LEVEL,
  parseOperatorCodeWorkProposal,
  type OperatorCodeWorkProposalInput,
} from './operator-admission'
import { translateWorkPackageToAdmission } from '../mission-translation/translate'
import type { MissionTranslationRejection } from '../mission-translation/types'
import { createCodeWorkControlPlaneStore, type CodeWorkControlPlaneStore } from './store'
import type { StoredCodeWorkRun } from './types'
import { operatorAuthorizationHistoryMatchesRun } from './operator-authorization'

type Access = Awaited<ReturnType<typeof resolveProjectAccess>>
type WorkPackageResolution = { evaluation: WorkPackageEvaluation | null; status: string }

export type OperatorWriteStatus =
  | 'ok'
  | 'idempotent'
  | 'no_principal'
  | 'not_permitted'
  | 'invalid_request'
  | 'conflict'
  | 'ineligible'
  | 'integrity_violation'
  | 'unavailable'

export interface OperatorWriteResult {
  status: OperatorWriteStatus
  run: StoredCodeWorkRun | null
  detail?: string
}

interface OperatorDependencies {
  access?: () => Promise<Access>
  resolvePackage?: (id: string) => Promise<WorkPackageResolution>
  store?: CodeWorkControlPlaneStore
  authorizationStore?: AuthorizationEventStore
  grant?: typeof grantAuthorization
  deny?: typeof denyAuthorization
  uuid?: () => string
}

const DENY = (status: OperatorWriteStatus, detail?: string): OperatorWriteResult => ({
  status,
  run: null,
  ...(detail ? { detail } : {}),
})

/**
 * Maps a translator rejection to the operator vocabulary. A package that is no
 * longer usable (or an evaluation that contradicts itself) reads as
 * `not_permitted` with no detail — the same non-oracle answer an unusable
 * package already got. Violations from the existing SDF validators are input
 * problems (`invalid_request`). The two remaining kinds cannot be caused by a
 * request — the work id is hash-derived and the risk level is a server
 * constant — so they surface as `integrity_violation`, never as a client fault.
 */
export function translationRejectionToOperatorStatus(
  rejection: MissionTranslationRejection,
): { status: OperatorWriteStatus; detail?: string } {
  switch (rejection.kind) {
    case 'work_package_not_usable':
    case 'work_package_evaluation_inconsistent':
      return { status: 'not_permitted' }
    case 'admission_invalid':
    case 'attenuation_failed':
      return { status: 'invalid_request', detail: rejection.violations.map(item => item.code).join(',') }
    case 'work_id_not_persistable':
    case 'risk_policy_undefined':
      return { status: 'integrity_violation', detail: rejection.kind }
  }
}

function safeProposalError(error: unknown): OperatorWriteStatus {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('proposal_fingerprint_conflict')) return 'conflict'
  if (message.includes('23505') || message.toLowerCase().includes('duplicate key')) return 'conflict'
  return 'unavailable'
}

export async function proposeOperatorCodeWork(
  rawInput: unknown,
  dependencies: OperatorDependencies = {},
): Promise<OperatorWriteResult> {
  // Authenticate first. No Work Package or control-plane read happens before it.
  const access = await (dependencies.access ?? resolveProjectAccess)()
  if (!access.ok) return DENY('no_principal')

  const parsed = parseOperatorCodeWorkProposal(rawInput, (dependencies.uuid ?? randomUUID)())
  if (!parsed.ok) return DENY('invalid_request', parsed.violations.map(item => item.code).join(','))

  const resolved = await (dependencies.resolvePackage ?? (id => resolveWorkPackage(id)))(parsed.value.workPackageId)
  if (resolved.status !== 'ok' || !resolved.evaluation || !resolved.evaluation.usable) {
    return DENY(resolved.status === 'unavailable' ? 'unavailable' : 'not_permitted')
  }
  const workPackage = resolved.evaluation.workPackage
  if (!assertProjectAllowed(workPackage.projectId, access.allowedProjectIds)) return DENY('not_permitted')

  // The live evaluation itself — never the stored package on its own — is what
  // the translator consumes, and the bindings are derived here from the
  // reviewed registries, never from the request.
  const translated = translateWorkPackageToAdmission(
    resolved.evaluation,
    OPERATOR_PROPOSAL_MISSION_RISK_LEVEL,
    buildOperatorCodeWorkBindings({ proposal: parsed.value, workPackage, requestedBy: access.userId }),
  )
  if (!translated.ok) {
    const mapped = translationRejectionToOperatorStatus(translated.rejection)
    return DENY(mapped.status, mapped.detail)
  }
  const derived = deriveCodeWorkProposal({
    admission: translated.admission,
    workPackage,
    requestedBy: access.userId,
    idempotencyKey: parsed.value.idempotencyKey,
  })
  if (!derived.ok) {
    return DENY('invalid_request', derived.violations.map(item => item.code).join(','))
  }

  const store = dependencies.store ?? createCodeWorkControlPlaneStore()
  const authorizationId = (dependencies.uuid ?? randomUUID)()
  const authorizationEventId = (dependencies.uuid ?? randomUUID)()
  try {
    const run = await store.propose({
      ...derived.value,
      authorizationId,
      authorizationEventId,
    })
    return { status: run.authorizationId === authorizationId ? 'ok' : 'idempotent', run }
  } catch (error) {
    // A parallel same-key request may lose the unique insert race after the RPC
    // performed its initial lookup. Resolve the winner and compare the bound
    // fingerprint; equal means idempotent, unequal means deterministic 409.
    try {
      const existing = await store.byProposalKeyHash(workPackage.projectId, derived.value.proposalKeyHash)
      if (existing) {
        if (existing.projectId !== workPackage.projectId || existing.requestedBy !== access.userId) {
          return DENY('integrity_violation')
        }
        return existing.proposalFingerprintHash === derived.value.proposalFingerprintHash
          ? { status: 'idempotent', run: existing }
          : DENY('conflict')
      }
    } catch {
      return DENY('unavailable')
    }
    return DENY(safeProposalError(error))
  }
}

export type OperatorDecision =
  | { action: 'grant'; expiresAt: string }
  | { action: 'deny'; reason?: string }
  | { action: 'cancel'; reason?: string }

function authorizationFailure(result: AuthorizationWriteResult): OperatorWriteStatus {
  if (result.status === 'no_principal') return 'no_principal'
  if (result.status === 'conflict') return 'conflict'
  if (result.status === 'unavailable') return 'unavailable'
  if (result.status === 'invalid_request') return 'invalid_request'
  return 'not_permitted'
}

export async function decideOperatorCodeWork(
  projectId: string,
  workId: string,
  decision: OperatorDecision,
  dependencies: OperatorDependencies = {},
): Promise<OperatorWriteResult> {
  const access = await (dependencies.access ?? resolveProjectAccess)()
  if (!access.ok) return DENY('no_principal')
  if (!assertProjectAllowed(projectId, access.allowedProjectIds)) return DENY('not_permitted')

  const store = dependencies.store ?? createCodeWorkControlPlaneStore()
  let run: StoredCodeWorkRun | null
  try {
    run = await store.byProjectAndWorkId(projectId, workId)
  } catch {
    return DENY('unavailable')
  }
  if (!run) return DENY('not_permitted')

  if (decision.action === 'cancel') {
    if (isTerminalCodeWorkState(run.state) && run.state !== 'cancelled') return DENY('ineligible')
    try {
      return {
        status: run.state === 'cancelled' ? 'idempotent' : 'ok',
        run: await store.cancel(run.workId, run.projectId, access.userId, decision.reason?.trim() || 'operator_cancelled'),
      }
    } catch {
      return DENY('unavailable')
    }
  }

  const authorizationStore = dependencies.authorizationStore ?? createAuthorizationEventStore()
  let history: AuthorizationEvent[]
  try {
    history = await authorizationStore.history(run.authorizationId)
  } catch {
    return DENY('unavailable')
  }
  if (!operatorAuthorizationHistoryMatchesRun(run, history)) return DENY('integrity_violation')

  let state
  try {
    state = deriveAuthorizationState(history, { at: new Date().toISOString() })
  } catch {
    return DENY('integrity_violation')
  }

  // A retry after the authority event landed but before synchronization only
  // performs the missing synchronization. It never appends a duplicate act.
  const alreadyDecided = decision.action === 'grant' ? state.status === 'granted' : state.status === 'denied'
  if (decision.action === 'grant' && alreadyDecided && state.expiresAt !== decision.expiresAt) {
    return DENY('conflict')
  }
  if (!alreadyDecided && state.status !== 'pending') {
    try {
      return { status: 'conflict', run: await store.synchronizeAuthorization(run.workId) }
    } catch {
      return DENY('unavailable')
    }
  }

  if (!alreadyDecided) {
    const act = decision.action === 'grant'
      ? (dependencies.grant ?? grantAuthorization)({
        authorizationId: run.authorizationId,
        expiresAt: decision.expiresAt,
        store: authorizationStore,
      })
      : (dependencies.deny ?? denyAuthorization)({
        authorizationId: run.authorizationId,
        reason: decision.reason?.trim() || 'operator_denied',
        store: authorizationStore,
      })
    const result = await act
    if (result.status !== 'ok') return DENY(authorizationFailure(result))
  }

  try {
    return {
      status: alreadyDecided ? 'idempotent' : 'ok',
      run: await store.synchronizeAuthorization(run.workId),
    }
  } catch {
    return DENY('unavailable')
  }
}

export type { OperatorCodeWorkProposalInput }
