import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { resolveDestination } from '@/lib/nav/registry'
import {
  BLOCKED_REASONS,
  classifyStatus,
  statusLabel,
  type BlockedReason,
  type QueueState,
  type ReviewStatusClass,
} from './review-queue-shared'

/**
 * Granskningar — the global review queue's read model.
 *
 * OWNER SCOPE IS THE DATABASE'S. The read runs on the RLS-bound client, where
 * `approvals_owner` admits a row only when its run belongs to a project the
 * session owns, and `runs_owner` / `projects_owner` / `workflows_owner` scope
 * every embed the same way. There is no service-role read here, no allowed-id
 * list to get wrong, and no first-project fallback: a session that owns nothing
 * sees an empty queue, never someone else's.
 *
 * PROJECT COMES THROUGH THE RUN. `approvals.project_id` is nullable and null on
 * nearly every stored row, so the run is what places an approval in a project —
 * the same rule `/approvals`, the Project Command Center and the decision route
 * already use. `runs!inner(projects!inner(...))` states it once.
 *
 * DECIDABILITY IS RUNTIME TRUTH, NOT STYLING. `resolve_approval` acts only on
 * pending / revised / needs_input, and `PATCH /api/approvals/[id]` refuses an
 * approval with no run. An item that fails either test carries no decision
 * controls and says which fact blocked it.
 *
 * READ ONLY. Decisions go to the existing route; nothing here writes, and
 * nothing here records memory — the route already emits the canonical feedback
 * event for a decision it actually won.
 */

// ── Contract ─────────────────────────────────────────────────────────────────

export interface ReviewProject {
  id: string
  name: string
  slug: string
  /** Verbatim `projects.color`. */
  color: string
  href: string | null
  /** Verbatim `projects.execution_paused` — the project stop, not a queue state. */
  paused: boolean
  pausedReason: string | null
}

export interface ReviewItem {
  id: string
  /** Verbatim `approvals.status`. Unknown values survive as themselves. */
  status: string
  statusClass: ReviewStatusClass
  statusLabel: string
  /** Verbatim `approvals.kind` — `workflow_output`, `article_publish`, … */
  kind: string | null
  outputKey: string | null
  /** Verbatim `approvals.content`. Rendered as text, never as markup. */
  content: string
  reviewerNotes: string | null
  createdAt: string | null
  reviewedAt: string | null
  decidedAt: string | null
  runId: string | null
  runStatus: string | null
  runHref: string | null
  runActionKind: string | null
  workflowName: string | null
  project: ReviewProject | null
  /** True only when the sanctioned route could act on this row. */
  decidable: boolean
  blockedReason: BlockedReason | null
}

export interface ReviewQueueModel {
  state: QueueState
  /** Still open to a decision: pending, revised, needs_input. */
  queue: ReviewItem[]
  /** Decided or unknown — visible, never actionable. */
  archive: ReviewItem[]
  /** Exact row count the read reported. null → not known; never shown as zero. */
  total: number | null
  truncated: boolean
  /** The project filter this queue was narrowed to, if any. */
  filter: { slug: string; matched: boolean } | null
  links: { approvals: string | null }
}

/** One page of the queue. Bounded on purpose; the total says what was not shown. */
export const REVIEW_QUEUE_LIMIT = 100

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawReviewProject {
  id?: string | null
  name?: string | null
  slug?: string | null
  color?: string | null
  execution_paused?: boolean | null
  paused_reason?: string | null
}

export interface RawReviewRun {
  id?: string | null
  status?: string | null
  action_kind?: string | null
  workflows?: { name?: string | null } | { name?: string | null }[] | null
  projects?: RawReviewProject | RawReviewProject[] | null
}

export interface RawReviewApproval {
  id: string
  status?: string | null
  kind?: string | null
  output_key?: string | null
  content?: string | null
  reviewer_notes?: string | null
  created_at?: string | null
  reviewed_at?: string | null
  decided_at?: string | null
  run_id?: string | null
  runs?: RawReviewRun | RawReviewRun[] | null
}

/** A read that either succeeded with rows, or did not succeed at all. */
export type Read<T> = { ok: true; rows: T[]; count: number | null } | { ok: false }

export interface AssembleReviewQueueInput {
  approvals: Read<RawReviewApproval>
  /** The `?project=` slug this request asked for, if any. */
  filterSlug?: string | null
}

// ── Pure assembly ────────────────────────────────────────────────────────────

const one = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null

const text = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function toProject(raw: RawReviewProject | null): ReviewProject | null {
  const id = text(raw?.id)
  const name = text(raw?.name)
  const slug = text(raw?.slug)
  if (!id || !name || !slug) return null
  return {
    id,
    name,
    slug,
    color: text(raw?.color) ?? '#64748b',
    href: resolveDestination('project_home', { project: slug })?.href ?? null,
    paused: raw?.execution_paused === true,
    pausedReason: text(raw?.paused_reason),
  }
}

function toItem(row: RawReviewApproval): ReviewItem {
  const run = one(row.runs)
  const project = toProject(one(run?.projects))
  const status = text(row.status) ?? ''
  const statusClass = classifyStatus(status)
  const runId = text(row.run_id) ?? text(run?.id)

  // The two runtime facts that decide whether this row can be acted on, in the
  // order the route applies them: a row with no run is refused before its
  // status is ever considered.
  const blockedReason: BlockedReason | null =
    !runId ? 'no_run'
      : statusClass === 'terminal' ? 'terminal'
        : statusClass === 'unknown' ? 'unknown'
          : null

  return {
    id: row.id,
    status,
    statusClass,
    statusLabel: statusLabel(status),
    kind: text(row.kind),
    outputKey: text(row.output_key),
    content: typeof row.content === 'string' ? row.content : '',
    reviewerNotes: text(row.reviewer_notes),
    createdAt: row.created_at ?? null,
    reviewedAt: row.reviewed_at ?? null,
    decidedAt: row.decided_at ?? null,
    runId,
    runStatus: text(run?.status),
    runHref: project?.href && runId ? `${project.href}/runs/${runId}` : null,
    runActionKind: text(run?.action_kind),
    workflowName: text(one(run?.workflows)?.name),
    project,
    decidable: blockedReason === null,
    blockedReason,
  }
}

/**
 * Build the model. A failed read is `state: 'error'` with no rows — it must
 * never reach the operator as "inga granskningar".
 */
export function assembleReviewQueue(input: AssembleReviewQueueInput): ReviewQueueModel {
  const links = { approvals: resolveDestination('approvals')?.href ?? null }
  const filterSlug = text(input.filterSlug)

  if (!input.approvals.ok) {
    return {
      state: 'error',
      queue: [],
      archive: [],
      total: null,
      truncated: false,
      filter: filterSlug ? { slug: filterSlug, matched: false } : null,
      links,
    }
  }

  const items = input.approvals.rows.map(toItem)
  const total = input.approvals.count
  return {
    state: 'ok',
    queue: items.filter((item) => item.statusClass === 'actionable'),
    archive: items.filter((item) => item.statusClass !== 'actionable'),
    total,
    truncated: total !== null && total > items.length,
    filter: filterSlug
      ? { slug: filterSlug, matched: items.some((item) => item.project?.slug === filterSlug) }
      : null,
    links,
  }
}

// ── Loader ───────────────────────────────────────────────────────────────────

const SELECT = `
  id, status, kind, output_key, content, reviewer_notes, created_at, reviewed_at, decided_at, run_id,
  runs!inner (
    id, status, action_kind,
    workflows ( name ),
    projects!inner ( id, name, slug, color, execution_paused, paused_reason )
  )
`

/**
 * Read the operator's review queue. `projectSlug` narrows it to one project —
 * the `?project=` shape the nav registry itself produces for this destination.
 * Narrowing intersects with RLS; it can only remove rows, never reach another
 * owner's.
 */
export async function loadReviewQueue(
  { projectSlug }: { projectSlug?: string | null } = {},
): Promise<ReviewQueueModel> {
  const slug = text(projectSlug)
  try {
    const db = await createClient()
    let query = (db.from('approvals') as any)
      .select(SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(REVIEW_QUEUE_LIMIT)
    if (slug) query = query.eq('runs.projects.slug', slug)

    const { data, error, count } = await query
    if (error) {
      console.error('[review-queue] read failed:', error.message)
      return assembleReviewQueue({ approvals: { ok: false }, filterSlug: slug })
    }
    return assembleReviewQueue({
      approvals: { ok: true, rows: (data ?? []) as RawReviewApproval[], count: count ?? null },
      filterSlug: slug,
    })
  } catch (err) {
    console.error('[review-queue] read failed:', err instanceof Error ? err.message : String(err))
    return assembleReviewQueue({ approvals: { ok: false }, filterSlug: slug })
  }
}
