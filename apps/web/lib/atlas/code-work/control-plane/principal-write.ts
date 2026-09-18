/** Authenticated proposal boundary. It persists control state; it executes nothing. */

import 'server-only'

import { randomUUID } from 'node:crypto'
import { assertProjectAllowed } from '@/lib/atlas/isolation'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { resolveWorkPackage } from '@/lib/atlas/workpackage/principal-read'
import type { WorkPackageEvaluation } from '@/lib/atlas/workpackage/types'
import { deriveCodeWorkProposal } from './derive-admission'
import { createCodeWorkControlPlaneStore, type CodeWorkControlPlaneStore } from './store'
import type { StoredCodeWorkRun } from './types'

export type CodeWorkProposalStatus =
  | 'ok' | 'no_principal' | 'project_denied' | 'not_permitted'
  | 'invalid_request' | 'conflict' | 'unavailable'

interface ProposalArgs {
  projectId: string
  admission: unknown
  idempotencyKey: string
  store?: CodeWorkControlPlaneStore
  workPackageResolver?: (id: string) => Promise<{ evaluation: WorkPackageEvaluation | null; status: string }>
}

export async function proposeCodeWork(args: ProposalArgs): Promise<{
  run: StoredCodeWorkRun | null
  status: CodeWorkProposalStatus
  detail?: string
}> {
  const access = await resolveProjectAccess()
  if (!access.ok) return { run: null, status: 'no_principal' }
  if (!assertProjectAllowed(args.projectId, access.allowedProjectIds)) {
    return { run: null, status: 'project_denied' }
  }
  const raw = args.admission as { projectId?: unknown; governance?: { workPackage?: { id?: unknown } } }
  if (raw.projectId !== args.projectId || typeof raw.governance?.workPackage?.id !== 'string') {
    return { run: null, status: 'invalid_request', detail: 'admission_project_or_package' }
  }

  const resolved = await (args.workPackageResolver ?? (id => resolveWorkPackage(id)))(raw.governance.workPackage.id)
  if (resolved.status !== 'ok' || !resolved.evaluation || !resolved.evaluation.usable
    || resolved.evaluation.workPackage.projectId !== args.projectId) {
    return { run: null, status: 'not_permitted' }
  }
  const derived = deriveCodeWorkProposal({
    admission: args.admission,
    workPackage: resolved.evaluation.workPackage,
    requestedBy: access.userId,
    idempotencyKey: args.idempotencyKey,
  })
  if (!derived.ok) {
    return { run: null, status: 'invalid_request', detail: derived.violations.map(v => v.code).join(',') }
  }
  try {
    const run = await (args.store ?? createCodeWorkControlPlaneStore()).propose({
      ...derived.value,
      authorizationId: randomUUID(),
      authorizationEventId: randomUUID(),
    })
    return { run, status: 'ok' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return message.includes('proposal_fingerprint_conflict')
      ? { run: null, status: 'conflict' }
      : { run: null, status: 'unavailable' }
  }
}
