import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrganizationReadScope } from '@/lib/auth/organization-project-read'
import { isHandlarborsenProject } from '@/lib/os/project-command-center'
import {
  HANDLARBORSEN_PROJECT_ID, HANDLARBORSEN_PROJECT_SLUG,
} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { candidateMemoryEnabled } from './handlarborsen-competitor-memory-service'
import { officialHost } from './handlarborsen-competitor-discovery-core'

const TABLE = 'handlarborsen_competitor_review_decisions'
const PROCEDURE = 'handlarborsen_decide_candidate_review_v1'
const MAX_CANDIDATES = 30
const MAX_DECISIONS = 300
const uuid4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const validStatuses = ['pending', 'interesting', 'reviewed', 'ignored'] as const

export type CandidateReviewStatus = typeof validStatuses[number]
export type ReviewDecision = Readonly<{ id: number; status: CandidateReviewStatus; at: string }>
export type CandidateReviewEntry = Readonly<{
  host: string
  status: CandidateReviewStatus
  changedAt: string | null
  totalDecisions: number
  history: readonly ReviewDecision[]
}>
export type CandidateReviewLoad =
  | { status: 'disabled' | 'unauthorized' | 'forbidden' | 'unavailable' | 'invalid' }
  | { status: 'ok'; entries: readonly CandidateReviewEntry[]; awaitingReview: number }
export type CandidateReviewSave =
  | { status: 'disabled' | 'unauthorized' | 'forbidden' | 'unavailable' | 'invalid' | 'not_found' | 'conflict' }
  | { status: 'saved' | 'unchanged' | 'already_applied'; decidedStatus: CandidateReviewStatus }
export type CandidateReviewCommand = Readonly<{
  host: string
  status: CandidateReviewStatus
  requestId: string
  expectedRevision: number
}>

type Db = ReturnType<typeof createAdminClient>
type Authorized = { ok: true; db: Db; actorId: string }
  | { ok: false; status: 'unauthorized' | 'forbidden' | 'unavailable' | 'disabled' }

export interface CandidateReviewDependencies {
  env: NodeJS.ProcessEnv
  session: typeof createClient
  admin: typeof createAdminClient
  scope: typeof resolveOrganizationReadScope
  now: () => Date
}

const live: CandidateReviewDependencies = {
  env: process.env,
  session: createClient,
  admin: createAdminClient,
  scope: resolveOrganizationReadScope,
  now: () => new Date(),
}

export function candidateReviewEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.HANDLARBORSEN_CANDIDATE_REVIEW_ENABLED === 'true'
    && candidateMemoryEnabled(env)
}

export function safeCandidateReviewCommand(input: unknown): CandidateReviewCommand | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const row = input as Record<string, unknown>
  if (Object.keys(row).length !== 4 || !Object.hasOwn(row, 'host')
    || !Object.hasOwn(row, 'status') || !Object.hasOwn(row, 'requestId')
    || !Object.hasOwn(row, 'expectedRevision')) return null
  if (typeof row.host !== 'string'
    || officialHost('https://' + row.host + '/') !== row.host
    || typeof row.status !== 'string'
    || !validStatuses.includes(row.status as CandidateReviewStatus)
    || typeof row.requestId !== 'string' || !uuid4.test(row.requestId)
    || typeof row.expectedRevision !== 'number' || !Number.isInteger(row.expectedRevision)
    || row.expectedRevision < 0 || row.expectedRevision > MAX_DECISIONS) return null
  return { host: row.host, status: row.status as CandidateReviewStatus,
    requestId: row.requestId.toLowerCase(), expectedRevision: row.expectedRevision }
}

function parseTime(value: unknown, now: Date): string | null {
  if (typeof value !== 'string') return null
  const t = Date.parse(value)
  return Number.isFinite(t) && t <= now.getTime() + 300_000
    ? new Date(t).toISOString() : null
}

/** A validated read of the full, bounded event ledger; no forged zeroes. */
export function assembleCandidateReviews(
  candidates: readonly string[],
  raw: unknown,
  now: Date,
): CandidateReviewLoad {
  if (!Array.isArray(raw) || raw.length > MAX_DECISIONS
    || !Number.isFinite(now.getTime()) || candidates.length > MAX_CANDIDATES
    || new Set(candidates).size !== candidates.length
    || candidates.some(host => officialHost('https://' + host + '/') !== host))
    return { status: 'invalid' }

  const existing = new Set(candidates)
  const byHost = new Map<string, ReviewDecision[]>()
  const seen = new Set<number>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') return { status: 'invalid' }
    const row = item as Record<string, unknown>
    const at = parseTime(row.occurred_at, now)
    if (row.project_id !== HANDLARBORSEN_PROJECT_ID
      || typeof row.host !== 'string' || !existing.has(row.host)
      || typeof row.id !== 'number' || !Number.isSafeInteger(row.id) || row.id <= 0
      || seen.has(row.id) || !at
      || typeof row.status !== 'string'
      || !validStatuses.includes(row.status as CandidateReviewStatus)
      || typeof row.actor_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(row.actor_id)
      || typeof row.request_id !== 'string' || !uuid4.test(row.request_id)) return { status: 'invalid' }
    seen.add(row.id)
    const actions = byHost.get(row.host) ?? []
    actions.push({ id: row.id, at, status: row.status as CandidateReviewStatus })
    byHost.set(row.host, actions)
  }

  const entries = candidates.map(host => {
    const sorted = [...(byHost.get(host) ?? [])].sort((a,b) => b.id-a.id)
    const latest = sorted[0]
    return {
      host, status: latest?.status ?? 'pending' as CandidateReviewStatus,
      changedAt: latest?.at ?? null, totalDecisions: sorted.length,
      history: sorted.slice(0,5),
    }
  })
  return { status: 'ok', entries,
    awaitingReview: entries.filter(x => x.status === 'pending' || x.status === 'interesting').length }
}

export function createCandidateReviewService(deps: CandidateReviewDependencies = live) {
  async function authorize(): Promise<Authorized> {
    if (!candidateReviewEnabled(deps.env)) return { ok: false, status: 'disabled' }
    try {
      const session = await deps.session()
      const { data: { user }, error: authError } = await session.auth.getUser()
      if (authError || !user) return { ok: false, status: 'unauthorized' }
      const db = deps.admin()
      const scope = await deps.scope(session, db, user.id)
      if (!scope.role.active || !['owner','collaborator'].includes(scope.role.role)
        || !scope.projectIds.includes(HANDLARBORSEN_PROJECT_ID))
        return { ok: false, status: 'forbidden' }

      const { data: project, error } = await db.from('projects')
        .select('id, slug, name, owner_id')
        .eq('id', HANDLARBORSEN_PROJECT_ID).eq('slug', HANDLARBORSEN_PROJECT_SLUG).maybeSingle()
      if (error || !project || !isHandlarborsenProject(project)
        || (scope.role.role === 'owner' && project.owner_id !== user.id))
        return { ok: false, status: 'forbidden' }
      return { ok: true, db, actorId: user.id }
    } catch { return { ok: false, status: 'unavailable' } }
  }

  async function readCandidateHosts(db: Db): Promise<string[] | null> {
    const { data, error } = await (db as any).from('handlarborsen_competitor_candidates')
      .select('project_id,host').eq('project_id', HANDLARBORSEN_PROJECT_ID)
      .order('host', { ascending: true }).limit(MAX_CANDIDATES+1)
    if (error || !Array.isArray(data) || data.length > MAX_CANDIDATES) return null
    const hosts: string[] = []
    for (const row of data) {
      if (row?.project_id !== HANDLARBORSEN_PROJECT_ID
        || typeof row.host !== 'string'
        || officialHost('https://' + row.host + '/') !== row.host
        || hosts.includes(row.host)) return null
      hosts.push(row.host)
    }
    return hosts
  }

  return {
    async load(): Promise<CandidateReviewLoad> {
      const auth = await authorize()
      if (!auth.ok) return { status: auth.status }
      try {
        const hosts = await readCandidateHosts(auth.db)
        if (!hosts) return { status: 'unavailable' }
        const { data, error } = await (auth.db as any).from(TABLE)
          .select('id, project_id, host, actor_id, request_id, status, occurred_at')
          .eq('project_id', HANDLARBORSEN_PROJECT_ID)
          .order('id', { ascending: false }).limit(MAX_DECISIONS+1)
        if (error || !Array.isArray(data)) return { status: 'unavailable' }
        return assembleCandidateReviews(hosts, data, deps.now())
      } catch { return { status: 'unavailable' } }
    },
    async decide(input: unknown): Promise<CandidateReviewSave> {
      const request = safeCandidateReviewCommand(input)
      if (!request) return { status: 'invalid' }
      const auth = await authorize()
      if (!auth.ok) return { status: auth.status }
      try {
        // No client-selected URLs, project IDs or actor identifiers. Atomic
        // function rechecks active membership before any audit insertion.
        const { data, error } = await (auth.db as any).rpc(PROCEDURE, {
          p_project_id: HANDLARBORSEN_PROJECT_ID,
          p_host: request.host, p_actor_id: auth.actorId,
          p_status: request.status, p_request_id: request.requestId,
          p_expected_revision: request.expectedRevision,
        })
        if (error || !Array.isArray(data) || data.length !== 1) return { status: 'unavailable' }
        const row = data[0] as Record<string, unknown>
        if (row.outcome === 'invalid' || row.outcome === 'forbidden'
          || row.outcome === 'not_found' || row.outcome === 'conflict')
          return { status: row.outcome }
        if (!['saved','unchanged','already_applied'].includes(String(row.outcome))
          || row.current_status !== request.status) return { status: 'unavailable' }
        return { status: row.outcome as 'saved'|'unchanged'|'already_applied',
          decidedStatus: request.status }
      } catch { return { status: 'unavailable' } }
    },
  }
}

export const loadCandidateReviews = () => createCandidateReviewService().load()
export const decideCandidateReview = (input: unknown) => createCandidateReviewService().decide(input)
