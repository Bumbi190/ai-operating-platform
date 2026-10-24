import 'server-only'
import { NextResponse } from 'next/server'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { summarizeReconciliation } from './reconciliation-readiness'

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
}
const response = (value: unknown, status: number) => NextResponse.json(value, { status, headers })
const unavailable = () => response({ error: 'LOCAL_TEXT_RECONCILIATION_READ_UNAVAILABLE' }, 503)
const obj = (value: unknown): value is Record<string,unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const isUuid = (value: unknown): value is string => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

type QueryResult = { data: unknown; error: unknown }
type ReadTable = {
  select(columns: string): {
    eq(column: string, value: string): { limit(count: number): PromiseLike<QueryResult> }
  }
}

/**
 * Operator AND project-owner authorized, read-only incident inventory.
 * The status is never authority to resume, retry or enroll a new local worker.
 * It returns only aggregate codes/counts, never IDs, source or model content.
 */
export async function getLocalReconciliationStatus(request: Request) {
  if (request.method !== 'GET') return response({ error: 'METHOD_NOT_ALLOWED' }, 405)
  let projectId: string | null
  try {
    const url = new URL(request.url)
    const keys = [...url.searchParams.keys()]
    if (keys.length !== 1 || keys[0] !== 'projectId') {
      return response({ error: 'INVALID_REQUEST' }, 400)
    }
    projectId = url.searchParams.get('projectId')
  } catch { return response({ error: 'INVALID_REQUEST' }, 400) }
  if (!isUuid(projectId)) return response({ error: 'INVALID_REQUEST' }, 400)

  let principal
  try { principal = await resolvePlatformOperator() } catch { return unavailable() }
  if (!principal.ok) {
    return response({ error: principal.reason === 'unauthenticated' ? 'UNAUTHENTICATED'
      : principal.reason === 'no_operator_configured' ? 'OPERATOR_NOT_CONFIGURED' : 'FORBIDDEN' },
      principal.reason === 'unauthenticated' ? 401 : principal.reason === 'no_operator_configured' ? 503 : 403)
  }

  try {
    const db = createAdminClient()
    // Owner qualification by the existing SECURITY INVOKER RPC. This checks
    // projects.owner_id against verified Supabase-session identity.
    const scopedCall = db.rpc.bind(db) as unknown as (
      name: 'local_text_owner_devices', args: Record<string,unknown>,
    ) => PromiseLike<QueryResult>
    const owned = await scopedCall('local_text_owner_devices', {
      p_owner_id: principal.userId, p_project_id: projectId,
    })
    if (owned.error) return unavailable()
    if (!obj(owned.data) || owned.data.kind !== 'applied' ||
        !Array.isArray(owned.data.value)) return response({ error: 'NOT_FOUND' }, 404)
    const devices = owned.data.value
    if (devices.length > 100 || devices.some(v => !obj(v) || typeof v.status !== 'string' ||
        !['pending','active','paused','revoked','lost','retired'].includes(v.status))) {
      return unavailable()
    }

    // The generated Supabase types lag behind these deployed local-text tables.
    // Keep the untyped adapter READ-ONLY and validate EVERY returned field.
    const from = db.from.bind(db) as unknown as (name: string) => ReadTable
    const readRows = async (name: string, columns: string): Promise<unknown[]> => {
      const query = await from(name).select(columns).eq('project_id', projectId).limit(101)
      if (query.error || !Array.isArray(query.data) || query.data.length > 100) {
        throw new Error('LOCAL_TEXT_READ_UNAVAILABLE')
      }
      return query.data
    }
    const [rawIncidents, rawAdmissions, rawJobs] = await Promise.all([
      readRows('local_text_incidents', 'kind,state,job_id'),
      readRows('local_text_admissions', 'status'),
      readRows('local_text_jobs', 'id'),
    ])
    const incidents = rawIncidents.map(value => {
      if (!obj(value) || typeof value.kind !== 'string' || typeof value.state !== 'string' ||
          !['reconcile','offline','quality','needs_input'].includes(value.kind) ||
          !['open','resolved'].includes(value.state) ||
          !(value.job_id === null || isUuid(value.job_id))) throw new Error('INVALID_INCIDENT')
      return { kind: value.kind, state: value.state, jobId: value.job_id as string | null }
    })
    const admissions = rawAdmissions.map(value => {
      if (!obj(value) || typeof value.status !== 'string' ||
          !['pending','active','paused','revoked'].includes(value.status)) {
        throw new Error('INVALID_ADMISSION')
      }
      return { status: value.status }
    })
    const jobs = rawJobs.map(value => {
      if (!obj(value) || !isUuid(value.id)) throw new Error('INVALID_JOB')
      return value.id
    })
    const jobsLeft = new Set(jobs)
    const open = incidents.filter(item => item.state === 'open')
    const summary = summarizeReconciliation({
      openReconcile: open.filter(i => i.kind === 'reconcile').length,
      openOffline: open.filter(i => i.kind === 'offline').length,
      otherOpen: open.filter(i => i.kind !== 'reconcile' && i.kind !== 'offline').length,
      revokedDevices: devices.filter(i => i.status === 'revoked').length,
      activeDevices: devices.filter(i => i.status === 'active').length,
      activeAdmissions: admissions.filter(i => i.status === 'active').length,
      retainedJobs: jobs.length,
      openIncidentsWithoutRetainedJob: open.filter(i => !i.jobId || !jobsLeft.has(i.jobId)).length,
    })
    return response(summary, 200)
  } catch { return unavailable() }
}
