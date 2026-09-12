/**
 * Aktivitet — the operator's chronological activity surface.
 *
 * WHAT THIS ANSWERS, and out of which column:
 *   what has run            → `runs`, newest first
 *   in which project        → `runs.project_id` → `projects`
 *   which workflow / run    → `runs.workflow_id` → `workflows`, and `runs.id`
 *   what happened           → the newest `run_logs` row for that run, when one exists
 *   what is still running    → `runs.status = 'running'`
 *   what completed          → `runs.status`
 *   what failed / needs care → `runs.status`, `runs.error`, `runs.cancel_reason`
 *   what needs a human      → `approvals`, classified by `review-queue-shared`
 *   where to look closer    → registry base paths, never a literal route
 *
 * WHAT IT DOES NOT ANSWER, and why that is deliberate: which agent did the
 * work. See `AGENT_ATTRIBUTION_NOTE` — nothing in a run records one, and the
 * surface refuses to borrow today's workflow definition to label an old run.
 *
 * ISOLATION. Every read goes through the RLS client, so the owner boundary is
 * the database's, not this file's: `runs`, `run_logs`, `workflows` and
 * `projects` are all owner-rooted. Approvals are scoped THROUGH THE RUN —
 * `approvals.project_id` is null on 12 of 13 production rows, so gating on it
 * would silently drop almost every review. The service-role client is not used
 * here at all; the legacy body keeps its own admin read and its own suite.
 *
 * A source that cannot be read says so. It is never rendered as "nothing
 * happened", because those are different facts about the platform.
 */

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { destinationBasePath } from '@/lib/nav/registry'
import { classifyStatus } from '@/lib/os/review-queue-shared'
import {
  ACTIVITY_LIMITS,
  type ActivityTone,
  type SectionState,
  type TimeSource,
  runStateTone,
} from '@/lib/os/activity-shared'

// ─────────────────────────────────────────────────────────────────────────────
// The model
// ─────────────────────────────────────────────────────────────────────────────

export interface ActivityProject {
  name: string | null
  slug: string | null
  color: string | null
}

interface ActivityEntryBase {
  id: string
  /** The instant this entry is ordered by, ISO, and the column it came from. */
  occurredAt: string | null
  timeSource: TimeSource | null
  project: ActivityProject
  /** Where to inspect the underlying row. Null when no route owns it. */
  href: string | null
  tone: ActivityTone
}

export interface ActivityRunEntry extends ActivityEntryBase {
  kind: 'run'
  status: string
  workflowName: string | null
  /** The newest recorded log line for this run, truncated. Null when none exists. */
  detail: string | null
  error: string | null
  cancelReason: string | null
  attempts: number | null
  /**
   * Always false today, and a field rather than a constant so the surface can
   * start telling the truth the moment a run records its own definition.
   */
  agentRecorded: boolean
}

export interface ActivityReviewEntry extends ActivityEntryBase {
  kind: 'review'
  status: string
  outputKey: string | null
  reviewKind: string | null
  /** Whether this review is still waiting on a person. */
  actionable: boolean
}

export type ActivityEntry = ActivityRunEntry | ActivityReviewEntry

export interface ActivitySourceState {
  runs: SectionState
  reviews: SectionState
  logs: SectionState
}

export interface ActivityModel {
  /** `error` when NO source could be read — the page is then honestly blank. */
  state: SectionState
  sources: ActivitySourceState
  /** Everything, newest first. */
  entries: ActivityEntry[]
  /** Runs the runtime says are running right now. */
  running: ActivityRunEntry[]
  /** Stored conditions an operator should look at. Never inferred from silence. */
  attention: ActivityEntry[]
  counts: {
    runs: number
    reviews: number
    running: number
    attention: number
    withDetail: number
    withAgent: number
  }
  /** The slug this view was narrowed to, when it was. */
  projectSlug: string | null
  limits: typeof ACTIVITY_LIMITS
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure assembly — every rule that matters is testable without a database
// ─────────────────────────────────────────────────────────────────────────────

export interface AssembleInput {
  runs: { ok: boolean; rows: any[] }
  reviews: { ok: boolean; rows: any[] }
  logs: { ok: boolean; rows: any[] }
  projectSlug: string | null
}

const text = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.length > 0 ? s : null
}

function truncate(s: string | null, n = 160): string | null {
  if (!s) return null
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…'
}

/** Supabase embeds arrive as an object or a one-element array depending on the join. */
const one = (v: any): any => (Array.isArray(v) ? v[0] ?? null : v ?? null)

function projectOf(row: any): ActivityProject {
  const p = one(row)
  return { name: text(p?.name), slug: text(p?.slug), color: text(p?.color) }
}

/**
 * An entry's instant, and the column it came from. A run that finished is
 * ordered by when it finished; one that never did falls back to when it started
 * and then to when it was created — and the reader is told which, because
 * "avslutad" and "skapad" are not interchangeable.
 */
function runTime(row: any): { at: string | null; source: TimeSource | null } {
  if (text(row?.finished_at)) return { at: row.finished_at, source: 'finished_at' }
  if (text(row?.started_at)) return { at: row.started_at, source: 'started_at' }
  if (text(row?.created_at)) return { at: row.created_at, source: 'created_at' }
  return { at: null, source: null }
}

function reviewTime(row: any): { at: string | null; source: TimeSource | null } {
  if (text(row?.reviewed_at)) return { at: row.reviewed_at, source: 'reviewed_at' }
  if (text(row?.created_at)) return { at: row.created_at, source: 'created_at' }
  return { at: null, source: null }
}

/**
 * The run's own route, built from the registry's base path rather than a
 * literal '/projects'. No slug → no link, rather than a link that 404s.
 */
function runHref(slug: string | null, runId: string): string | null {
  const base = destinationBasePath('project_home')
  if (!base || !slug) return null
  return `${base}/${slug}/runs/${runId}`
}

function reviewHref(slug: string | null): string | null {
  const base = destinationBasePath('approvals')
  if (!base) return null
  return slug ? `${base}?project=${encodeURIComponent(slug)}` : base
}

/**
 * AGENT ATTRIBUTION. A run is credited to an agent only if the run itself
 * recorded the definition it executed — `steps_snapshot` with at least one step
 * carrying an agent id. `workflows.steps` is deliberately NOT consulted: it is
 * the definition as it stands now, and using it would attribute today's agent
 * to work done under an older one. In production `steps_snapshot` is populated
 * on 4 of 1427 runs and empty in all four, so the honest answer today is always
 * "not recorded" — which is exactly what this returns.
 */
export function runRecordsAgent(row: any): boolean {
  const snapshot = row?.steps_snapshot
  if (!Array.isArray(snapshot) || snapshot.length === 0) return false
  return snapshot.some((step: any) => text(step?.agent_id) !== null)
}

export function assembleActivity(input: AssembleInput): ActivityModel {
  const sources: ActivitySourceState = {
    runs: input.runs.ok ? 'ok' : 'error',
    reviews: input.reviews.ok ? 'ok' : 'error',
    logs: input.logs.ok ? 'ok' : 'error',
  }

  // Newest log line per run. Only ever used to describe a run that has one;
  // a run with no logs keeps `detail: null` and the surface shows nothing.
  const newestLog = new Map<string, any>()
  if (input.logs.ok) {
    for (const log of input.logs.rows ?? []) {
      const runId = text(log?.run_id)
      if (!runId) continue
      const prev = newestLog.get(runId)
      if (!prev || String(log?.created_at ?? '') > String(prev?.created_at ?? '')) {
        newestLog.set(runId, log)
      }
    }
  }

  const runEntries: ActivityRunEntry[] = []
  if (input.runs.ok) {
    for (const row of input.runs.rows ?? []) {
      const id = text(row?.id)
      if (!id) continue
      const status = text(row?.status) ?? ''
      const { at, source } = runTime(row)
      const project = projectOf(row?.projects)
      const wf = one(row?.workflows)
      runEntries.push({
        kind: 'run',
        id,
        occurredAt: at,
        timeSource: source,
        project,
        href: runHref(project.slug, id),
        tone: runStateTone(status),
        status,
        workflowName: text(wf?.name),
        detail: truncate(text(newestLog.get(id)?.content)),
        error: truncate(text(row?.error) ?? text(row?.last_error)),
        cancelReason: truncate(text(row?.cancel_reason)),
        attempts: typeof row?.attempts === 'number' ? row.attempts : null,
        agentRecorded: runRecordsAgent(row),
      })
    }
  }

  const reviewEntries: ActivityReviewEntry[] = []
  if (input.reviews.ok) {
    for (const row of input.reviews.rows ?? []) {
      const id = text(row?.id)
      if (!id) continue
      const status = text(row?.status) ?? ''
      const { at, source } = reviewTime(row)
      // The project comes through the run, never from `approvals.project_id`.
      const project = projectOf(one(row?.runs)?.projects)
      const actionable = classifyStatus(status) === 'actionable'
      reviewEntries.push({
        kind: 'review',
        id,
        occurredAt: at,
        timeSource: source,
        project,
        href: reviewHref(project.slug),
        tone: actionable ? 'attention' : 'neutral',
        status,
        outputKey: text(row?.output_key),
        reviewKind: text(row?.kind),
        actionable,
      })
    }
  }

  // Newest first. An entry with no timestamp sorts last rather than first: an
  // unknown instant must not be allowed to claim the top of a chronology.
  const entries: ActivityEntry[] = [...runEntries, ...reviewEntries].sort((a, b) => {
    if (!a.occurredAt && !b.occurredAt) return 0
    if (!a.occurredAt) return 1
    if (!b.occurredAt) return -1
    return a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0
  })

  const running = runEntries.filter((e) => e.status === 'running')
  const attention: ActivityEntry[] = entries.filter((e) =>
    e.kind === 'run'
      ? e.status === 'failed' || e.status === 'stalled' || e.cancelReason !== null
      : e.actionable,
  )

  return {
    // Blank only when nothing at all could be read.
    state: sources.runs === 'error' && sources.reviews === 'error' ? 'error' : 'ok',
    sources,
    entries,
    running,
    attention,
    counts: {
      runs: runEntries.length,
      reviews: reviewEntries.length,
      running: running.length,
      attention: attention.length,
      withDetail: runEntries.filter((e) => e.detail !== null).length,
      withAgent: runEntries.filter((e) => e.agentRecorded).length,
    },
    projectSlug: input.projectSlug,
    limits: ACTIVITY_LIMITS,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The read
// ─────────────────────────────────────────────────────────────────────────────

const RUN_SELECT =
  'id, status, created_at, started_at, finished_at, error, last_error, attempts, cancel_reason, steps_snapshot, workflows(name), projects!inner(name, slug, color)'

// Scoped through the run: `approvals.project_id` is unreliable, `runs` is not.
const REVIEW_SELECT =
  'id, status, kind, output_key, created_at, reviewed_at, runs!inner(id, projects!inner(name, slug, color))'

const LOG_SELECT = 'run_id, content, created_at, runs!inner(id)'

/**
 * Loads the surface for the signed-in session. Returns null when there is no
 * session — a scope that cannot be resolved is a redirect, never a page of
 * zeroes that looks like a quiet platform.
 */
export async function loadActivity(
  { projectSlug }: { projectSlug?: string | null } = {},
): Promise<ActivityModel | null> {
  const slug = text(projectSlug)

  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return null

  let runQuery = (db.from('runs') as any)
    .select(RUN_SELECT)
    .order('created_at', { ascending: false })
    .limit(ACTIVITY_LIMITS.runs)
  if (slug) runQuery = runQuery.eq('projects.slug', slug)

  let reviewQuery = (db.from('approvals') as any)
    .select(REVIEW_SELECT)
    .order('created_at', { ascending: false })
    .limit(ACTIVITY_LIMITS.reviews)
  if (slug) reviewQuery = reviewQuery.eq('runs.projects.slug', slug)

  const [runRes, reviewRes] = await Promise.allSettled([runQuery, reviewQuery])

  const runOk = runRes.status === 'fulfilled' && !(runRes.value as any)?.error
  const runRows: any[] = runOk ? ((runRes.value as any).data ?? []) : []
  const reviewOk = reviewRes.status === 'fulfilled' && !(reviewRes.value as any)?.error
  const reviewRows: any[] = reviewOk ? ((reviewRes.value as any).data ?? []) : []

  // One batched fan-out for step detail, over run ids that already came out of
  // the scoped read. `runs!inner` keeps the join filtering rather than nulling.
  const runIds = runRows.map((r) => text(r?.id)).filter((v): v is string => v !== null)
  let logOk = true
  let logRows: any[] = []
  if (runIds.length > 0) {
    const [res] = await Promise.allSettled([
      (db.from('run_logs') as any)
        .select(LOG_SELECT)
        .in('run_id', runIds)
        .order('created_at', { ascending: false })
        .limit(ACTIVITY_LIMITS.logs),
    ])
    if (res.status === 'fulfilled' && !(res.value as any)?.error) {
      logRows = (res.value as any).data ?? []
    } else {
      logOk = false
    }
  }

  return assembleActivity({
    runs: { ok: runOk, rows: runRows },
    reviews: { ok: reviewOk, rows: reviewRows },
    logs: { ok: logOk, rows: logRows },
    projectSlug: slug,
  })
}
