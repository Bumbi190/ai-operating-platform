/**
 * Atlas ↔ Dream Cycle bridge.
 *
 * Two layers back this module:
 *   - memories (dream_*)  : the immutable nightly observation log written by the
 *                           Dream engine (lib/ai/dream.ts). Preserved for history.
 *   - dream_issues        : the stable issue ledger — one row per real issue per
 *                           project, keyed by a stable `issue_id` reused across
 *                           nights. Recurring findings update the same row.
 *
 * Atlas reasons over `dream_issues` (stable identity), NOT the dated memory keys,
 * so a recurring problem is one finding with one lifecycle. Lifecycle
 * (open/in_progress/completed) is DERIVED from the linked manager_task status —
 * manager_tasks stays the single source of truth for execution state. Read-only
 * here except delegate/resolve, which go through manager_tasks. Project-scoped.
 */

export type DreamSeverity = 'critical' | 'warning' | 'info'

/** Lifecycle of a finding — DERIVED from its linked manager_task's status. */
export type DreamLifecycle = 'open' | 'in_progress' | 'completed'

/** The manager_task a finding was delegated into, if any. */
export interface DreamLinkedTask {
  id: string
  status: string
  owner: string | null
}

export interface DreamFinding {
  /** Stable identity, reused across nights for the same underlying issue. */
  issueId: string
  severity: DreamSeverity
  /** Latest observed insight. */
  insight: string
  /** Latest recommended action, when present. */
  action: string | null
  /** How many nights this issue has recurred. */
  occurrences: number
  firstSeenAt: string
  lastSeenAt: string
  /** Newest dated memory key for this issue (traceability into the raw log). */
  latestMemoryKey: string | null
  /** open = not yet delegated; in_progress = task pending/working; completed = task done. */
  lifecycle: DreamLifecycle
  /** The delegated task, when one exists. */
  task: DreamLinkedTask | null
}

export interface DreamFindingsResult {
  /** false when the project has never run a dream cycle. */
  hasData: boolean
  findings: DreamFinding[]
  counts: { critical: number; warning: number; info: number; total: number }
  /** How many findings are open / delegated-in-progress / resolved. */
  lifecycle: { open: number; in_progress: number; completed: number }
  /** Most recent dream insight timestamp, or null. */
  lastRunAt: string | null
}

/** Map a manager_task status to a finding lifecycle state. */
function lifecycleFromTaskStatus(status: string | null | undefined): DreamLifecycle {
  if (status === 'done') return 'completed'
  if (status === 'pending' || status === 'in_progress') return 'in_progress'
  // null / failed / cancelled → still actionable
  return 'open'
}

import { applyProjectScope } from './isolation'

type AnyDb = any

/** Parse the stored `[SEVERITY] insight → action` string into parts. */
export function parseDreamValue(value: string): {
  severity: DreamSeverity
  insight: string
  action: string | null
} {
  const raw = (value ?? '').trim()
  const sevMatch = raw.match(/^\[(CRITICAL|WARNING|INFO)\]\s*/i)
  const severity: DreamSeverity = sevMatch
    ? (sevMatch[1].toLowerCase() as DreamSeverity)
    : 'info'
  const body = sevMatch ? raw.slice(sevMatch[0].length) : raw
  // Action follows the arrow (the engine uses " → "); tolerate "->" too.
  const arrowIdx = (() => {
    const i = body.indexOf('→')
    if (i !== -1) return { i, len: 1 }
    const j = body.indexOf('->')
    if (j !== -1) return { i: j, len: 2 }
    return null
  })()
  if (arrowIdx) {
    return {
      severity,
      insight: body.slice(0, arrowIdx.i).trim(),
      action: body.slice(arrowIdx.i + arrowIdx.len).trim() || null,
    }
  }
  return { severity, insight: body.trim(), action: null }
}

const SEVERITY_RANK: Record<DreamSeverity, number> = { critical: 0, warning: 1, info: 2 }

/**
 * Deterministic fallback for a stable issue identity, derived from a dated dream
 * memory key. MUST match the backfill regex in 20260609_dream_issues_ledger.sql:
 * strip the `dream_<date>_` prefix and any trailing `_dayN` / `_N` counter.
 * Used only when the analyzer doesn't supply an explicit issue_id.
 */
export function deriveIssueId(key: string): string {
  const stem = (key ?? '')
    .replace(/^dream_\d{4}-?\d{2}-?\d{2}_/, '')
    .replace(/_(day)?\d+$/, '')
    .trim()
  return stem || (key ?? '').trim() || 'unknown'
}

function normSeverity(s: string | null | undefined): DreamSeverity {
  const v = (s ?? '').toLowerCase()
  return v === 'critical' || v === 'warning' ? v : 'info'
}

/**
 * Retrieve Dream findings for a project from the stable issue ledger, with
 * lifecycle derived from each issue's linked manager_task. One row per issue
 * (recurring problems are NOT duplicated). Sorted by severity then recency.
 * Defensive: degrades to empty rather than throwing.
 */
export async function getDreamFindings(
  db: AnyDb,
  projectId: string,
  limit = 50,
): Promise<DreamFindingsResult> {
  const empty: DreamFindingsResult = {
    hasData: false,
    findings: [],
    counts: { critical: 0, warning: 0, info: 0, total: 0 },
    lifecycle: { open: 0, in_progress: 0, completed: 0 },
    lastRunAt: null,
  }
  if (!projectId) return empty

  try {
    const { data } = await db
      .from('dream_issues')
      .select('issue_id, severity, latest_insight, latest_action, latest_memory_key, manager_task_id, occurrences, first_seen_at, last_seen_at')
      .eq('project_id', projectId)
      .order('last_seen_at', { ascending: false })
      .limit(limit)

    const rows = (data ?? []) as any[]
    if (rows.length === 0) return empty

    // Resolve linked tasks in one query (lifecycle source of truth).
    const taskIds = rows.map(r => r.manager_task_id).filter(Boolean)
    const taskById = new Map<string, DreamLinkedTask>()
    if (taskIds.length) {
      try {
        const { data: tasks } = await db
          .from('manager_tasks')
          .select('id, status, owner')
          .in('id', taskIds)
        for (const t of (tasks ?? []) as any[]) {
          taskById.set(t.id, { id: t.id, status: t.status, owner: t.owner ?? null })
        }
      } catch { /* degrade to no links */ }
    }

    const findings: DreamFinding[] = rows.map((r) => {
      const task = r.manager_task_id ? (taskById.get(r.manager_task_id) ?? null) : null
      // A cancelled/failed task means the issue is actionable again → treat as open.
      const effectiveTask = task && (task.status === 'cancelled' || task.status === 'failed') ? null : task
      return {
        issueId: r.issue_id,
        severity: normSeverity(r.severity),
        insight: r.latest_insight ?? '',
        action: r.latest_action ?? null,
        occurrences: r.occurrences ?? 1,
        firstSeenAt: r.first_seen_at,
        lastSeenAt: r.last_seen_at,
        latestMemoryKey: r.latest_memory_key ?? null,
        lifecycle: lifecycleFromTaskStatus(effectiveTask?.status),
        task: effectiveTask,
      }
    })

    const counts = findings.reduce(
      (acc, f) => { acc[f.severity]++; acc.total++; return acc },
      { critical: 0, warning: 0, info: 0, total: 0 },
    )
    const lifecycle = findings.reduce(
      (acc, f) => { acc[f.lifecycle]++; return acc },
      { open: 0, in_progress: 0, completed: 0 },
    )
    const lastRunAt = rows.reduce<string | null>(
      (max, r) => (!max || r.last_seen_at > max ? r.last_seen_at : max), null,
    )

    findings.sort((a, b) => {
      const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
      return s !== 0 ? s : (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? '')
    })

    return { hasData: true, findings, counts, lifecycle, lastRunAt }
  } catch {
    return empty
  }
}

/**
 * Compact, cross-project Dream summary for passive injection into Atlas's live
 * context (briefings/recommendations). Atlas is global, so this aggregates the
 * latest dream criticals/warnings across all projects without the operator
 * having to ask. Returns '' when there is nothing noteworthy.
 */
export async function dreamLiveSummary(db: AnyDb, allowedProjectIds?: string[]): Promise<string> {
  try {
    const { data: projects } = await applyProjectScope(db.from('projects').select('id, name'), allowedProjectIds, 'id')
    const list = (projects ?? []) as { id: string; name: string }[]
    if (list.length === 0) return ''

    const perProject = await Promise.all(
      list.map(async (p) => ({ project: p, res: await getDreamFindings(db, p.id, 20) })),
    )

    const noteworthy = perProject.filter(
      ({ res }) => res.hasData && (res.counts.critical > 0 || res.counts.warning > 0),
    )
    if (noteworthy.length === 0) return ''

    let text = `\n\nDREAM CYCLE (nattlig självförbättring — per projekt):`
    for (const { project, res } of noteworthy) {
      text += `\n- ${project.name}: ${res.counts.critical} kritiska · ${res.counts.warning} varningar · ${res.counts.info} info.`
      // Surface up to 2 highest-severity items with their recommended action.
      for (const f of res.findings.filter((x) => x.severity !== 'info').slice(0, 2)) {
        text += `\n    · [${f.severity.toUpperCase()}] ${f.insight}${f.action ? ` → åtgärd: ${f.action}` : ''}`
      }
    }
    text += `\nAnvänd verktyget get_dream_findings för fullständig lista och åtgärdsförslag för ett specifikt projekt.`
    return text
  } catch {
    return ''
  }
}

// ── Dream → Action: convert a finding into a manager_task ─────────────────────

/** manager_tasks.priority is low|medium|high|critical. */
const SEVERITY_TO_PRIORITY: Record<DreamSeverity, string> = {
  critical: 'critical',
  warning: 'high',
  info: 'low',
}

export interface DelegateDreamResult {
  ok: boolean
  error?: string
  /** true when an active task already existed for this issue → no duplicate. */
  alreadyExisted?: boolean
  task?: { id: string; title: string; status: string; owner: string | null; priority: string }
  finding?: { issueId: string; severity: DreamSeverity; insight: string; action: string | null }
}

/**
 * Create a manager_task from a Dream ISSUE (stable identity), reusing the
 * existing delegation infrastructure (manager_tasks + agent_messages).
 *
 * Dedup is on the stable issue, not a dated key: if the issue already links to a
 * non-cancelled/failed task, that task is returned (no duplicate) even if the
 * issue recurred under a new memory key. The new task carries source='dream' and
 * source_key=<issue_id>, and the issue's manager_task_id is linked back so
 * lifecycle derives correctly.
 */
export async function delegateDreamFinding(
  db: AnyDb,
  params: { projectId: string; issueId: string; owner?: string; title?: string },
): Promise<DelegateDreamResult> {
  const { projectId, issueId } = params
  const owner = (params.owner || 'Atlas').trim()
  if (!projectId || !issueId) {
    return { ok: false, error: 'projectId och issueId krävs.' }
  }

  // 1. Load the issue from the ledger.
  const { data: issue } = await db
    .from('dream_issues')
    .select('id, issue_id, severity, latest_insight, latest_action, manager_task_id')
    .eq('project_id', projectId)
    .eq('issue_id', issueId)
    .maybeSingle()
  if (!issue) {
    return { ok: false, error: `Hittade inget Dream-ärende med issue_id ${issueId} i projektet.` }
  }
  const severity = normSeverity((issue as any).severity)
  const insight = (issue as any).latest_insight ?? ''
  const action = (issue as any).latest_action ?? null
  const finding = { issueId, severity, insight, action }

  // 2. Idempotency — if the issue already links to an active/resolved task, reuse it.
  const linkedId = (issue as any).manager_task_id as string | null
  if (linkedId) {
    try {
      const { data: t } = await db
        .from('manager_tasks')
        .select('id, title, status, owner, priority')
        .eq('id', linkedId)
        .maybeSingle()
      if (t && t.status !== 'cancelled' && t.status !== 'failed') {
        return {
          ok: true,
          alreadyExisted: true,
          task: { id: t.id, title: t.title, status: t.status, owner: t.owner ?? null, priority: t.priority },
          finding,
        }
      }
    } catch { /* fall through to create a fresh task */ }
  }

  // 3. Create the task.
  const title = (params.title?.trim()) || action || insight.slice(0, 120) || issueId
  const description =
    `Källa: Dream Cycle (issue ${issueId})\n` +
    `Insikt [${severity.toUpperCase()}]: ${insight}` +
    (action ? `\nRekommenderad åtgärd: ${action}` : '')

  try {
    const { data, error } = await db
      .from('manager_tasks')
      .insert({
        project_id: projectId,
        title,
        description,
        status: 'pending',
        priority: SEVERITY_TO_PRIORITY[severity],
        owner,
        source: 'dream',
        source_key: issueId,
      })
      .select('id, title, status, owner, priority')
      .single()
    if (error || !data) return { ok: false, error: error?.message ?? 'Kunde inte skapa uppgift.' }

    // 4. Link the task back onto the issue so lifecycle derives from it.
    try {
      await db.from('dream_issues')
        .update({ manager_task_id: data.id, updated_at: new Date().toISOString() })
        .eq('id', (issue as any).id)
    } catch { /* non-critical: dedup still works via the next delegate's check */ }

    // 5. Mirror into the agent message stream (same as the delegate tool).
    try {
      await db.from('agent_messages').insert({
        project_id: projectId,
        from_agent: 'Atlas',
        to_agent: owner,
        message_type: 'daily_plan',
        content: `Dream-åtgärd delegerad: "${title}" (${severity}) — issue ${issueId}.`,
        task_id: data.id,
      })
    } catch { /* non-critical */ }

    return {
      ok: true,
      alreadyExisted: false,
      task: { id: data.id, title: data.title, status: data.status, owner: data.owner ?? null, priority: data.priority },
      finding,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export interface ResolveDreamResult {
  ok: boolean
  error?: string
  issueId?: string
  taskId?: string
  status?: string
}

/**
 * Mark a Dream issue resolved by completing its linked manager_task (status
 * 'done' → lifecycle derives to 'completed'). Operator-confirmed: Atlas calls
 * this only when the operator says the work is done. Reuses manager_tasks as the
 * execution source of truth (no separate completion state). Idempotent.
 */
export async function resolveDreamFinding(
  db: AnyDb,
  params: { projectId: string; issueId: string; result?: string },
): Promise<ResolveDreamResult> {
  const { projectId, issueId } = params
  if (!projectId || !issueId) return { ok: false, error: 'projectId och issueId krävs.' }

  const { data: issue } = await db
    .from('dream_issues')
    .select('id, manager_task_id')
    .eq('project_id', projectId)
    .eq('issue_id', issueId)
    .maybeSingle()
  if (!issue) return { ok: false, error: `Hittade inget Dream-ärende med issue_id ${issueId}.` }

  const taskId = (issue as any).manager_task_id as string | null
  if (!taskId) {
    return { ok: false, error: `Ärendet ${issueId} har ingen delegerad uppgift att slutföra — delegera först.` }
  }

  try {
    await db.from('manager_tasks')
      .update({ status: 'done', result: params.result ?? 'Markerad som löst via Atlas.', updated_at: new Date().toISOString() })
      .eq('id', taskId)
      .eq('project_id', projectId) // defensive: never update across projects
    return { ok: true, issueId, taskId, status: 'done' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
