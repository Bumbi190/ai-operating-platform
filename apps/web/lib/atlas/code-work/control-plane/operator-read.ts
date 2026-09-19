/** Principal-safe SDF-1B2 read models for Granskningar and code-work detail. */

import 'server-only'

import { assertProjectAllowed } from '@/lib/atlas/isolation'
import { deriveAuthorizationState } from '@/lib/atlas/authorization/derive'
import { createAuthorizationEventStore, type AuthorizationEventStore } from '@/lib/atlas/authorization/store'
import type { AuthorizationEvent, AuthorizationStatus } from '@/lib/atlas/authorization/types'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { codeWorkAdmissionHash } from '../binding'
import { isTerminalCodeWorkState } from '../lifecycle'
import { createCodeWorkControlPlaneStore, type CodeWorkControlPlaneStore } from './store'
import type { StoredCodeWorkReceipt, StoredCodeWorkRun } from './types'
import { operatorAuthorizationHistoryMatchesRun } from './operator-authorization'
import type {
  CodeWorkDetailModel,
  CodeWorkProjectSummary,
  CodeWorkReceiptView,
  CodeWorkReviewItem,
  CodeWorkReviewQueueModel,
} from './operator-model'

type AnyDb = any

interface ReadDependencies {
  store?: CodeWorkControlPlaneStore
  authorizationStore?: AuthorizationEventStore
  access?: typeof resolveProjectAccess
  projectReader?: (ids: string[]) => Promise<CodeWorkProjectSummary[]>
  now?: string
}

function groupAuthorizationEvents(events: AuthorizationEvent[]): Map<string, AuthorizationEvent[]> {
  const grouped = new Map<string, AuthorizationEvent[]>()
  for (const event of events) grouped.set(event.authorizationId, [...(grouped.get(event.authorizationId) ?? []), event])
  return grouped
}

function authorizationStatus(events: AuthorizationEvent[], at: string): AuthorizationStatus | 'unreadable' {
  try {
    return deriveAuthorizationState(events, { at }).status
  } catch {
    return 'unreadable'
  }
}

async function readProjects(ids: string[]): Promise<CodeWorkProjectSummary[]> {
  if (ids.length === 0) return []
  const { data, error } = await (createAdminClient() as AnyDb).from('projects')
    .select('id, name, slug, color').in('id', ids)
  if (error) throw new Error(`[atlas-code-work] project read failed: ${error.message}`)
  return ((data ?? []) as Array<{ id: string; name: string; slug: string; color: string | null }>).map(row => ({
    id: row.id, name: row.name, slug: row.slug, color: row.color ?? '#64748b',
  }))
}

function reviewItem(
  run: StoredCodeWorkRun,
  project: CodeWorkProjectSummary,
  objective: string,
  events: AuthorizationEvent[],
  at: string,
): CodeWorkReviewItem {
  const authStatus = operatorAuthorizationHistoryMatchesRun(run, events)
    ? authorizationStatus(events, at)
    : 'unreadable'
  return {
    workId: run.workId,
    project,
    objective,
    repository: `${run.admission.repository.owner}/${run.admission.repository.name}`,
    pinnedBaseSha: run.admission.repository.pinnedBaseSha,
    readPathCount: run.admission.files.readScopes.length,
    writePathCount: run.admission.files.writeScopes.length,
    workerLabel: `${run.admission.worker.provider} · ${run.admission.worker.modelId}`,
    commandCount: run.admission.commands.approvedCommandIds.length,
    limitsLabel: `${run.admission.limits.maxChangedFiles} filer · ${Math.round(run.admission.limits.maxDiffBytes / 1024)} KiB`,
    admissionHash: run.admissionHash,
    state: run.state,
    authorizationStatus: authStatus,
    authorizationExpiresAt: run.authorizationExpiresAt,
    createdAt: run.createdAt,
    actionable: run.state === 'proposed' && authStatus === 'pending',
    cancelable: !isTerminalCodeWorkState(run.state),
    detailHref: `/projects/${project.slug}/code-work/${run.workId}`,
  }
}

export async function loadCodeWorkReviewQueue(
  { projectSlug }: { projectSlug?: string | null } = {},
  dependencies: ReadDependencies = {},
): Promise<CodeWorkReviewQueueModel> {
  const slug = typeof projectSlug === 'string' && projectSlug.trim() ? projectSlug.trim() : null
  const access = await (dependencies.access ?? resolveProjectAccess)()
  if (!access.ok) return { state: 'error', queue: [], archive: [], total: null, filter: slug ? { slug, matched: false } : null }
  if (access.allowedProjectIds.length === 0) {
    return { state: 'ok', queue: [], archive: [], total: 0, filter: slug ? { slug, matched: false } : null }
  }

  try {
    const allowed = new Set(access.allowedProjectIds)
    const projects = (await (dependencies.projectReader ?? readProjects)(access.allowedProjectIds))
      .filter(project => allowed.has(project.id))
    const selected = slug ? projects.filter(project => project.slug === slug) : projects
    const ids = selected.map(project => project.id)
    if (ids.length === 0) {
      return { state: 'ok', queue: [], archive: [], total: 0, filter: slug ? { slug, matched: false } : null }
    }

    const store = dependencies.store ?? createCodeWorkControlPlaneStore()
    const authStore = dependencies.authorizationStore ?? createAuthorizationEventStore()
    const [runs, eventGroups] = await Promise.all([
      store.byProjects(ids, 100),
      Promise.all(ids.map(id => authStore.byProject(id, 500))),
    ])
    const events = groupAuthorizationEvents(eventGroups.flat())
    const objectivesByProject = new Map<string, Map<string, string>>()
    await Promise.all(ids.map(async projectId => {
      const packageIds = runs
        .filter(run => run.projectId === projectId)
        .map(run => run.admission.governance.workPackage.id)
      objectivesByProject.set(projectId, await store.workPackageObjectives(projectId, packageIds))
    }))

    const projectMap = new Map(selected.map(project => [project.id, project]))
    const at = dependencies.now ?? new Date().toISOString()
    const items = runs.flatMap(run => {
      const project = projectMap.get(run.projectId)
      if (!project) return []
      const objective = objectivesByProject.get(run.projectId)?.get(run.admission.governance.workPackage.id)
        ?? 'Avgränsat kodarbetsförslag'
      return [reviewItem(run, project, objective, events.get(run.authorizationId) ?? [], at)]
    })
    return {
      state: 'ok',
      queue: items.filter(item => item.actionable),
      archive: items.filter(item => !item.actionable),
      total: items.length,
      filter: slug ? { slug, matched: selected.length === 1 } : null,
    }
  } catch (error) {
    console.error('[atlas-code-work] review queue read failed:', error instanceof Error ? error.message : String(error))
    return { state: 'error', queue: [], archive: [], total: null, filter: slug ? { slug, matched: false } : null }
  }
}

const SAFE_PAYLOAD_FIELDS: Record<string, readonly string[]> = {
  proposal_created: ['proposalFingerprintHash'],
  authorization_requested: ['authorizationId', 'targetVersionHash'],
  authorization_effective: ['authorizationId', 'expiresAt'],
  authorization_refused: ['authorizationId', 'reason'],
  cancellation: ['reason'],
  transition: ['from', 'to', 'reason'],
  authority_pins: ['missionHash', 'admissionHash', 'delegationHash', 'workPackageHash'],
  cancellation_fencing: ['cancelRequested', 'claimValid', 'outcome'],
  terminal: ['state', 'iterationCount'],
  policy_denial: ['code', 'path'],
}

const RECEIPT_LABELS: Record<string, string> = {
  proposal_created: 'Förslag registrerat',
  authorization_requested: 'Ägarbeslut begärt',
  authorization_effective: 'Behörighet verksam',
  authorization_refused: 'Behörighet ej verksam',
  cancellation: 'Avbrott registrerat',
  transition: 'Livscykel ändrad',
  evidence: 'Evidens registrerad',
}

export function toSafeCodeWorkReceipt(receipt: StoredCodeWorkReceipt): CodeWorkReceiptView {
  const fields = SAFE_PAYLOAD_FIELDS[receipt.eventType] ?? SAFE_PAYLOAD_FIELDS[receipt.receiptClass] ?? []
  const payload: CodeWorkReceiptView['payload'] = {}
  for (const key of fields) {
    const value = receipt.payload[key]
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      payload[key] = value as string | number | boolean | null
    }
  }
  return {
    receiptId: receipt.receiptId,
    sequence: receipt.sequence,
    eventType: receipt.eventType,
    eventLabel: RECEIPT_LABELS[receipt.eventType] ?? 'Okänd kvittotyp',
    receiptClass: receipt.receiptClass,
    producerType: receipt.producerType,
    producerId: receipt.producerId,
    observedAt: receipt.observedAt,
    recordedAt: receipt.recordedAt,
    payload,
    payloadHash: receipt.payloadHash,
    previousReceiptHash: receipt.previousReceiptHash,
    receiptHash: receipt.receiptHash,
  }
}

export type CodeWorkDetailReadStatus = 'ok' | 'no_principal' | 'not_permitted' | 'integrity_violation' | 'unavailable'

export async function readOperatorCodeWorkDetail(
  project: CodeWorkProjectSummary,
  workId: string,
  dependencies: ReadDependencies = {},
): Promise<{ status: CodeWorkDetailReadStatus; model: CodeWorkDetailModel | null }> {
  const access = await (dependencies.access ?? resolveProjectAccess)()
  if (!access.ok) return { status: 'no_principal', model: null }
  if (!assertProjectAllowed(project.id, access.allowedProjectIds)) return { status: 'not_permitted', model: null }

  const store = dependencies.store ?? createCodeWorkControlPlaneStore()
  const authStore = dependencies.authorizationStore ?? createAuthorizationEventStore()
  try {
    const run = await store.byProjectAndWorkId(project.id, workId)
    if (!run) return { status: 'not_permitted', model: null }
    if (codeWorkAdmissionHash(run.admission) !== run.admissionHash) {
      return { status: 'integrity_violation', model: null }
    }
    const [receipts, events, objectives] = await Promise.all([
      store.receiptsByWorkId(run.workId, 200),
      authStore.history(run.authorizationId),
      store.workPackageObjectives(project.id, [run.admission.governance.workPackage.id]),
    ])
    if (!operatorAuthorizationHistoryMatchesRun(run, events)) {
      return { status: 'integrity_violation', model: null }
    }
    const at = dependencies.now ?? new Date().toISOString()
    const item = reviewItem(
      run,
      project,
      objectives.get(run.admission.governance.workPackage.id) ?? 'Avgränsat kodarbetsförslag',
      events,
      at,
    )
    return {
      status: 'ok',
      model: {
        ...item,
        workPackageId: run.admission.governance.workPackage.id,
        authorizationId: run.authorizationId,
        authorizationEventCount: events.length,
        authorizedAt: run.authorizedAt,
        terminalAt: run.terminalAt,
        terminalReasonCode: run.terminalReasonCode,
        readPaths: run.admission.files.readScopes,
        writePaths: run.admission.files.writeScopes,
        deniedPaths: run.admission.files.deniedScopes,
        commandIds: run.admission.commands.approvedCommandIds,
        limits: {
          maxWorkerIterations: run.admission.limits.maxWorkerIterations,
          maxChangedFiles: run.admission.limits.maxChangedFiles,
          maxDiffBytes: run.admission.limits.maxDiffBytes,
          maxTotalRuntimeSeconds: run.admission.limits.maxTotalRuntimeSeconds,
          maxCommandRuntimeSeconds: run.admission.limits.maxCommandRuntimeSeconds,
        },
        lifecycle: [
          { label: 'Föreslagen', at: run.createdAt },
          { label: 'Behörighet beviljad', at: run.authorizedAt },
          { label: 'Terminal', at: run.terminalAt },
        ],
        receipts: receipts.map(toSafeCodeWorkReceipt),
      },
    }
  } catch (error) {
    console.error('[atlas-code-work] detail read failed:', error instanceof Error ? error.message : String(error))
    return { status: 'unavailable', model: null }
  }
}
