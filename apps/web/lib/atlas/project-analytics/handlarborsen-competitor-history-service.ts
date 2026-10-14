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
import { scanPublicSources } from './handlarborsen-competitors-scan'
import { scanCompetitorLandscape } from './handlarborsen-competitor-landscape-scan'
import {
  HISTORY_SOURCE_IDS,
  evaluateCompetitorHistory,
  type HistoryAnalysis,
  type HistoryRecord,
} from './handlarborsen-competitor-history-core'

const TABLE = 'handlarborsen_competitor_observations'
const FIELDS = 'project_id, source_id, observed_on, checked_at, status, title, title_digest'
const MAX_ROWS = 180

/** No migration or persistence is activated by deploying this code alone. */
export function competitorHistoryEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.HANDLARBORSEN_COMPETITOR_HISTORY_ENABLED === 'true'
}

export type HistoryServiceResult =
  | { status: 'disabled' | 'unauthorized' | 'forbidden' | 'unavailable' | 'invalid' }
  | { status: 'ok'; history: HistoryAnalysis }
export type SaveHistoryResult =
  | { status: 'disabled' | 'unauthorized' | 'forbidden' | 'unavailable' | 'invalid' }
  | { status: 'saved'; count: number }
  | { status: 'already_saved'; count: number }

type Access = Awaited<ReturnType<typeof resolveProjectAccess>>
type Project = Awaited<ReturnType<typeof getProjectBySlug>>
type HistoryDb = ReturnType<typeof createAdminClient>
type Authorization =
  | { ok: false; status: 'disabled' | 'unauthorized' | 'forbidden' | 'unavailable' }
  | { ok: true; db: HistoryDb }

/** Explicit seams for isolated, mocked tests. No user-input dependencies. */
export interface HistoryDependencies {
  access: () => Promise<Access>
  project: (slug: string) => Promise<Project>
  db: () => HistoryDb
  publicScan: typeof scanPublicSources
  landscapeScan: typeof scanCompetitorLandscape
  clock: () => Date
  env: NodeJS.ProcessEnv
}

const live: HistoryDependencies = {
  access: resolveProjectAccess,
  project: getProjectBySlug,
  db: createAdminClient,
  publicScan: scanPublicSources,
  landscapeScan: scanCompetitorLandscape,
  clock: () => new Date(),
  env: process.env,
}

function digest(title: string | null) {
  return title === null ? null : createHash('sha256').update(title, 'utf8').digest('hex')
}

function decodeRows(data: unknown, now: Date): HistoryAnalysis {
  if (!Array.isArray(data) || data.length > MAX_ROWS) return { status: 'invalid', reason: 'out_of_range' }
  const rows: HistoryRecord[] = []
  for (const row of data) {
    if (!row || typeof row !== 'object') return { status: 'invalid', reason: 'invalid_observation' }
    const record = row as Record<string, unknown>
    if (record.project_id !== HANDLARBORSEN_PROJECT_ID
      || !HISTORY_SOURCE_IDS.includes(record.source_id as string)
      || typeof record.checked_at !== 'string'
      || typeof record.source_id !== 'string'
      || typeof record.status !== 'string') return { status: 'invalid', reason: 'invalid_observation' }
    // PostgREST serializes timestamptz as e.g. 2026-10-14T10:00:00+00:00.
    // Convert explicitly to the canonical Z/millisecond form required by
    // the pure analysis model, but reject non-RFC3339 or timezone-free data.
    const rawTime = record.checked_at
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(rawTime))
      return { status: 'invalid', reason: 'invalid_observation' }
    const parsed = Date.parse(rawTime)
    if (!Number.isFinite(parsed)) return { status: 'invalid', reason: 'invalid_observation' }
    const canonical = new Date(parsed).toISOString()
    if (record.observed_on !== canonical.slice(0, 10)
      || (record.title !== null && typeof record.title !== 'string')
      || record.title_digest !== digest(record.title as string | null)) return { status: 'invalid', reason: 'invalid_observation' }
    rows.push({
      sourceId: record.source_id,
      checkedAt: canonical,
      status: record.status,
      title: record.title as string | null,
    })
  }
  return evaluateCompetitorHistory(rows, now)
}

export function createCompetitorHistoryService(deps: HistoryDependencies = live) {
  async function authorize(): Promise<Authorization> {
    if (!competitorHistoryEnabled(deps.env)) return { ok: false, status: 'disabled' }
    const access = await deps.access()
    if (!access.ok) return { ok: false, status: 'unauthorized' }
    // The collaborator role is read-only and must not use this Owner write path.
    const project = await deps.project(HANDLARBORSEN_PROJECT_SLUG)
    if (!project || !isHandlarborsenProject(project)
      || !access.allowedProjectIds.includes(project.id)) return { ok: false, status: 'forbidden' }
    const db = deps.db()
    const { data: liveProject, error } = await db.from('projects')
      .select('id, owner_id, slug').eq('id', HANDLARBORSEN_PROJECT_ID).maybeSingle()
    if (error || !liveProject) return { ok: false, status: 'unavailable' }
    if (liveProject.owner_id !== access.userId
      || liveProject.slug !== HANDLARBORSEN_PROJECT_SLUG
      || liveProject.id !== HANDLARBORSEN_PROJECT_ID) return { ok: false, status: 'forbidden' }
    return { ok: true, db }
  }

  async function rows(db: HistoryDb, now: Date) {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29)).toISOString().slice(0, 10)
    const end = now.toISOString().slice(0, 10)
    const { data, error } = await (db as any).from(TABLE).select(FIELDS)
      .eq('project_id', HANDLARBORSEN_PROJECT_ID)
      .gte('observed_on', from).lte('observed_on', end)
      .order('observed_on', { ascending: true })
      .order('source_id', { ascending: true })
      .limit(MAX_ROWS + 1)
    return error ? null : data
  }

  return {
    async load(): Promise<HistoryServiceResult> {
      try {
        const auth = await authorize()
        if (!auth.ok) return { status: auth.status }
        const now = deps.clock()
        const source = await rows(auth.db, now)
        if (source === null) return { status: 'unavailable' }
        const history = decodeRows(source, now)
        return history.status === 'invalid' ? { status: 'invalid' } : { status: 'ok', history }
      } catch { return { status: 'unavailable' } }
    },

    /** Owner-triggered manual check only. No endpoint-supplied source, URLs or clock. */
    async save(): Promise<SaveHistoryResult> {
      try {
        const auth = await authorize()
        if (!auth.ok) return { status: auth.status }
        const now = deps.clock()
        const existing = await rows(auth.db, now)
        if (existing === null) return { status: 'unavailable' }
        const checked = decodeRows(existing, now)
        if (checked.status !== 'ok') return { status: 'invalid' }
        const today = now.toISOString().slice(0, 10)
        const todaysRows = checked.observations.filter(x => x.checkedAt.startsWith(today))
        // A partial same-day batch is inconsistent, not a successful saved day.
        // Stop without rescanning so an operator can investigate and repair it.
        if (todaysRows.length > 0 && todaysRows.length !== HISTORY_SOURCE_IDS.length)
          return { status: 'invalid' }
        // One full owner-initiated persisted batch per UTC day. No rescans on retries.
        if (todaysRows.length === HISTORY_SOURCE_IDS.length)
          return { status: 'already_saved', count: todaysRows.length }

        const [publicScan, landscape] = await Promise.all([deps.publicScan(), deps.landscapeScan()])
        const observations = [
          ...publicScan.sources.map(x => ({
            sourceId: x.id, status: x.status, title: x.title, checkedAt: x.checked_at,
          })),
          ...landscape.observations.map(x => ({
            sourceId: x.id, status: x.status, title: x.title, checkedAt: x.checkedAt,
          })),
        ]
        if (observations.length !== HISTORY_SOURCE_IDS.length
          || new Set(observations.map(x => x.sourceId)).size !== HISTORY_SOURCE_IDS.length
          || observations.some(x => !HISTORY_SOURCE_IDS.includes(x.sourceId))) return { status: 'invalid' }
        // A slow manual scan can cross midnight. Never save two partial days,
        // or silently record yesterday's observations under today's button.
        const finishedAt = deps.clock()
        if (finishedAt.toISOString().slice(0, 10) !== today
          || observations.some(x => x.checkedAt.slice(0, 10) !== today))
          return { status: 'invalid' }
        const validated = evaluateCompetitorHistory([...checked.observations, ...observations], deps.clock())
        if (validated.status !== 'ok') return { status: 'invalid' }

        const payload = observations.map(x => ({
          project_id: HANDLARBORSEN_PROJECT_ID,
          source_id: x.sourceId,
          observed_on: x.checkedAt.slice(0, 10),
          checked_at: x.checkedAt,
          status: x.status,
          title: x.title,
          title_digest: digest(x.title),
        }))
        // INSERT ... ON CONFLICT DO NOTHING prevents overwriting first observation.
        const { data: inserted, error } = await (auth.db as any).from(TABLE).upsert(payload, {
          onConflict: 'project_id,source_id,observed_on',
          ignoreDuplicates: true,
        }).select('source_id')
        if (error || !Array.isArray(inserted) || inserted.length > payload.length)
          return { status: 'unavailable' }
        // Do not claim rows were stored merely because the request returned OK:
        // another simultaneous owner click may have won the unique-day conflict.
        // A partially inserted group cannot be described as a saved day.
        // It must be reconciled by an operator, never auto-retried or silently
        // completed with new evidence for the same source/day.
        if (inserted.length > 0 && inserted.length !== payload.length)
          return { status: 'invalid' }
        return inserted.length === payload.length
          ? { status: 'saved', count: inserted.length }
          : { status: 'already_saved', count: 0 }
      } catch { return { status: 'unavailable' } }
    },
  }
}

export const loadCompetitorHistory = () => createCompetitorHistoryService().load()
export const saveCompetitorHistory = () => createCompetitorHistoryService().save()
