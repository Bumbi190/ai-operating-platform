import 'server-only'
import { createHash } from 'node:crypto'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { getProjectBySlug } from '@/lib/project/get-project'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  HANDLARBORSEN_PROJECT_ID,
  HANDLARBORSEN_PROJECT_SLUG,
} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { isHandlarborsenProject } from '@/lib/os/project-command-center'
import { authorizeOrganizationCompetitorAction } from '@/lib/auth/organization-competitor-access'
import {
  officialHost, reconcileDiscovery, KNOWN_OFFICIAL_HOSTS,
  type OfficialCandidateEvidence,
} from './handlarborsen-competitor-discovery-core'
import { MANUALLY_REVIEWED_DISCOVERY_LEADS } from './handlarborsen-competitor-discovery-leads'

const TABLE = 'handlarborsen_competitor_candidates'
const FIELDS = 'project_id, host, name, official_url, observed_on, relevance, provenance, evidence_digest, first_seen_at'
const MAX_CANDIDATES = 30

export function candidateMemoryEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.HANDLARBORSEN_CANDIDATE_MEMORY_ENABLED === 'true'
}

export interface PersistedCandidate extends OfficialCandidateEvidence {
  host: string
  firstSeenAt: string
  lifecycle: 'candidate_for_review'
  foundedRecently: 'not_verified'
  executable: false
}

type Failure = { status: 'disabled' | 'unauthorized' | 'forbidden' | 'unavailable' | 'invalid' }
export type CandidateMemoryLoad = Failure | {
  status: 'ok'
  candidates: readonly PersistedCandidate[]
  awaitingReview: number
}
export type CandidateMemorySave = Failure
  | { status: 'saved' | 'already_recorded'; count: number }

type Db = ReturnType<typeof createAdminClient>
type Access = Awaited<ReturnType<typeof resolveProjectAccess>>
type Project = Awaited<ReturnType<typeof getProjectBySlug>>
type Auth = { ok: true; db: Db } | { ok: false; status: Failure['status'] }

export interface CandidateMemoryDependencies {
  env: NodeJS.ProcessEnv
  access: () => Promise<Access>
  project: (slug: string) => Promise<Project>
  db: () => Db
  now: () => Date
  leads: readonly OfficialCandidateEvidence[]
}

const live: CandidateMemoryDependencies = {
  env: process.env,
  access: resolveProjectAccess,
  project: getProjectBySlug,
  db: createAdminClient,
  now: () => new Date(),
  leads: MANUALLY_REVIEWED_DISCOVERY_LEADS,
}

export function candidateDigest(source: OfficialCandidateEvidence) {
  return createHash('sha256').update(
    [source.name, source.officialUrl, source.observedOn, source.relevance].join('\n'),
    'utf8',
  ).digest('hex')
}

function decodeRows(input: unknown, now: Date): PersistedCandidate[] | null {
  if (!Array.isArray(input) || input.length > MAX_CANDIDATES || !Number.isFinite(now.getTime())) return null
  const parsed: PersistedCandidate[] = []
  const seen = new Set<string>()
  for (const value of input) {
    if (!value || typeof value !== 'object') return null
    const row = value as Record<string, unknown>
    if (row.project_id !== HANDLARBORSEN_PROJECT_ID || typeof row.host !== 'string'
      || typeof row.name !== 'string' || typeof row.official_url !== 'string'
      || typeof row.relevance !== 'string' || typeof row.observed_on !== 'string'
      || row.provenance !== 'independently_checked_official_website'
      || typeof row.first_seen_at !== 'string') return null
    const source: OfficialCandidateEvidence = {
      name: row.name, officialUrl: row.official_url,
      observedOn: row.observed_on, relevance: row.relevance,
      provenance: 'independently_checked_official_website',
    }
    const validated = reconcileDiscovery([source], [], now)
    if (validated.status !== 'ok' || validated.candidates.length !== 1
      || validated.invalidCount > 0 || validated.candidates[0].host !== row.host
      || KNOWN_OFFICIAL_HOSTS.includes(row.host)
      || row.evidence_digest !== candidateDigest(source)
      || seen.has(row.host)) return null
    const time = Date.parse(row.first_seen_at)
    if (!Number.isFinite(time) || time > now.getTime() + 5 * 60_000) return null
    seen.add(row.host)
    parsed.push({
      ...source,
      host: row.host,
      firstSeenAt: new Date(time).toISOString(),
      lifecycle: 'candidate_for_review',
      foundedRecently: 'not_verified',
      executable: false,
    })
  }
  return parsed.sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt) || a.host.localeCompare(b.host))
}

/**
 * Only the fixed, independently checked editorial lead may be persisted by P1.
 * No internet discovery, LLM inference, cron, notifications or client-supplied
 * URLs. The active project owner is checked against the LIVE projects row
 * before any privileged DB reads/writes.
 */
export function createCandidateMemoryService(
  deps: CandidateMemoryDependencies = live,
  delegatedAuthorize?: () => ReturnType<typeof authorizeOrganizationCompetitorAction>,
) {
  async function authorize(): Promise<Auth> {
    if (!candidateMemoryEnabled(deps.env)) return { ok: false, status: 'disabled' }
    if (delegatedAuthorize) return delegatedAuthorize()
    const access = await deps.access()
    if (!access.ok) return { ok: false, status: 'unauthorized' }
    const project = await deps.project(HANDLARBORSEN_PROJECT_SLUG)
    if (!project || !isHandlarborsenProject(project)
      || !access.allowedProjectIds.includes(HANDLARBORSEN_PROJECT_ID)) return { ok: false, status: 'forbidden' }
    const db = deps.db()
    const { data: row, error } = await db.from('projects')
      .select('id, owner_id, slug').eq('id', HANDLARBORSEN_PROJECT_ID).maybeSingle()
    if (error || !row) return { ok: false, status: 'unavailable' }
    if (row.id !== HANDLARBORSEN_PROJECT_ID || row.slug !== HANDLARBORSEN_PROJECT_SLUG
      || row.owner_id !== access.userId) return { ok: false, status: 'forbidden' }
    return { ok: true, db }
  }

  async function loadRows(db: Db, now: Date) {
    const { data, error } = await (db as any).from(TABLE)
      .select(FIELDS).eq('project_id', HANDLARBORSEN_PROJECT_ID)
      .order('first_seen_at', { ascending: true }).limit(MAX_CANDIDATES + 1)
    return error ? null : decodeRows(data, now)
  }

  return {
    async load(): Promise<CandidateMemoryLoad> {
      try {
        const authorization = await authorize()
        if (!authorization.ok) return { status: authorization.status }
        const records = await loadRows(authorization.db, deps.now())
        if (records === null) return { status: 'unavailable' }
        return { status: 'ok', candidates: records, awaitingReview: records.length }
      } catch { return { status: 'unavailable' } }
    },
    async saveReviewedLead(): Promise<CandidateMemorySave> {
      try {
        const authorization = await authorize()
        if (!authorization.ok) return { status: authorization.status }
        const now = deps.now()
        const existing = await loadRows(authorization.db, now)
        if (existing === null) return { status: 'unavailable' }
        const analysis = reconcileDiscovery(deps.leads, existing.map(row => row.host), now)
        if (analysis.status !== 'ok' || analysis.invalidCount > 0) return { status: 'invalid' }
        if (analysis.candidates.length === 0)
          return { status: 'already_recorded', count: 0 }

        const rows = analysis.candidates.map(candidate => ({
          project_id: HANDLARBORSEN_PROJECT_ID,
          host: candidate.host,
          name: candidate.name,
          official_url: candidate.officialUrl,
          observed_on: candidate.observedOn,
          relevance: candidate.relevance,
          provenance: candidate.provenance,
          evidence_digest: candidateDigest(candidate),
        }))
        // Unique (project, host) and DO NOTHING forbid overwriting first evidence.
        const { data: inserted, error } = await (authorization.db as any).from(TABLE)
          .upsert(rows, { onConflict: 'project_id,host', ignoreDuplicates: true })
          .select('host')
        if (error || !Array.isArray(inserted) || inserted.length > rows.length
          || inserted.some(item => !item || !rows.some(row => row.host === item.host)))
          return { status: 'unavailable' }
        if (inserted.length > 0 && inserted.length !== rows.length)
          return { status: 'invalid' }
        return inserted.length === 0
          ? { status: 'already_recorded', count: 0 }
          : { status: 'saved', count: inserted.length }
      } catch { return { status: 'unavailable' } }
    },
  }
}

export const loadCandidateMemory = () => createCandidateMemoryService().load()
export const saveReviewedCandidateLead = () => createCandidateMemoryService().saveReviewedLead()

// Isolated organization delegation. Owner-only call paths above are unchanged.
export const loadOrganizationCandidateMemory = () =>
  createCandidateMemoryService(live, () => authorizeOrganizationCompetitorAction('view_competitors')).load()
export const saveOrganizationReviewedCandidate = () =>
  createCandidateMemoryService(live, () => authorizeOrganizationCompetitorAction('record_competitor_evidence')).saveReviewedLead()
