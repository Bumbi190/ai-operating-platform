/**
 * Atlas ↔ Dream Cycle bridge.
 *
 * Dream Cycle (lib/ai/dream.ts) writes its findings into the `memories` table:
 *   - key:    `dream_<YYYYMMDD>_<category>`
 *   - value:  `[SEVERITY] <insight> → <action>`   (severity ∈ CRITICAL|WARNING|INFO)
 *   - source: 'dream'
 *   - scoped by project_id, UNIQUE(project_id, key)
 *
 * Atlas's context brain (lib/atlas/context.ts) and the chat route never read this
 * table, so Atlas had no path to Dream findings. This module is the single read
 * surface that turns those rows into structured, severity-typed intelligence Atlas
 * can summarize and act on. Read-only; project-scoped.
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
  key: string
  severity: DreamSeverity
  /** The observation (left of the arrow). */
  insight: string
  /** The recommended action (right of the arrow), when present. */
  action: string | null
  updatedAt: string
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
 * Retrieve Dream Cycle findings for a single project, parsed and sorted by
 * severity (critical first) then recency. Defensive: degrades to empty rather
 * than throwing, so it can be embedded in context assembly safely.
 */
export async function getDreamFindings(
  db: AnyDb,
  projectId: string,
  limit = 20,
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
      .from('memories')
      .select('key, value, updated_at')
      .eq('project_id', projectId)
      .like('key', 'dream_%')
      .order('updated_at', { ascending: false })
      .limit(limit)

    const rows = (data ?? []) as { key: string; value: string; updated_at: string }[]
    if (rows.length === 0) return empty

    // Linked tasks (source='dream') so each finding's lifecycle can be derived
    // from its task status. Keep only the newest task per source_key.
    const taskByKey = new Map<string, DreamLinkedTask>()
    try {
      const { data: tasks } = await db
        .from('manager_tasks')
        .select('id, status, owner, source_key, created_at')
        .eq('project_id', projectId)
        .eq('source', 'dream')
        .order('created_at', { ascending: false })
      // Ordered created_at desc. Pick the newest task that isn't cancelled/failed
      // (those don't represent active/resolved work) — matches delegate's dedup
      // logic so the read-side lifecycle and write-side idempotency never disagree.
      for (const t of (tasks ?? []) as any[]) {
        if (!t.source_key) continue
        if (t.status === 'cancelled' || t.status === 'failed') continue
        if (!taskByKey.has(t.source_key)) {
          taskByKey.set(t.source_key, { id: t.id, status: t.status, owner: t.owner ?? null })
        }
      }
    } catch { /* columns may not exist pre-migration — degrade to no links */ }

    const findings: DreamFinding[] = rows.map((r) => {
      const { severity, insight, action } = parseDreamValue(r.value)
      const task = taskByKey.get(r.key) ?? null
      return {
        key: r.key,
        severity,
        insight,
        action,
        updatedAt: r.updated_at,
        lifecycle: lifecycleFromTaskStatus(task?.status),
        task,
      }
    })

    const counts = findings.reduce(
      (acc, f) => {
        acc[f.severity]++
        acc.total++
        return acc
      },
      { critical: 0, warning: 0, info: 0, total: 0 },
    )

    const lifecycle = findings.reduce(
      (acc, f) => {
        acc[f.lifecycle]++
        return acc
      },
      { open: 0, in_progress: 0, completed: 0 },
    )

    const lastRunAt = rows.reduce<string | null>(
      (max, r) => (!max || r.updated_at > max ? r.updated_at : max),
      null,
    )

    findings.sort((a, b) => {
      const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
      return s !== 0 ? s : b.updatedAt.localeCompare(a.updatedAt)
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
export async function dreamLiveSummary(db: AnyDb): Promise<string> {
  try {
    const { data: projects } = await db.from('projects').select('id, name')
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
  /** true when an open/active task already existed → no duplicate created. */
  alreadyExisted?: boolean
  task?: { id: string; title: string; status: string; owner: string | null; priority: string }
  finding?: { key: string; severity: DreamSeverity; insight: string; action: string | null }
}

/**
 * Create a manager_task from a Dream finding, reusing the existing delegation
 * infrastructure (manager_tasks + agent_messages). Idempotent: if a non-
 * cancelled/failed task already references this finding, returns that task
 * instead of creating a duplicate. The task carries source='dream' and
 * source_key=<finding key>, which is how lifecycle is later derived.
 */
export async function delegateDreamFinding(
  db: AnyDb,
  params: { projectId: string; findingKey: string; owner?: string; title?: string },
): Promise<DelegateDreamResult> {
  const { projectId, findingKey } = params
  const owner = (params.owner || 'Atlas').trim()
  if (!projectId || !findingKey) {
    return { ok: false, error: 'projectId och findingKey krävs.' }
  }

  // 1. Load the originating finding.
  const { data: mem } = await db
    .from('memories')
    .select('key, value')
    .eq('project_id', projectId)
    .eq('key', findingKey)
    .maybeSingle()
  if (!mem) {
    return { ok: false, error: `Hittade ingen Dream-insikt med nyckel ${findingKey} i projektet.` }
  }
  const parsed = parseDreamValue((mem as { value: string }).value)
  const finding = { key: findingKey, severity: parsed.severity, insight: parsed.insight, action: parsed.action }

  // 2. Idempotency — reuse an existing active/resolved task for this finding.
  //    Fetch this finding's dream tasks and filter in JS (deterministic; avoids
  //    depending on PostgREST not-in encoding). A cancelled/failed task does not
  //    block re-delegation; any pending/in_progress/done task does.
  try {
    const { data: existing } = await db
      .from('manager_tasks')
      .select('id, title, status, owner, priority, created_at')
      .eq('project_id', projectId)
      .eq('source', 'dream')
      .eq('source_key', findingKey)
      .order('created_at', { ascending: false })
    const row = ((existing ?? []) as any[]).find(
      (t) => t.status !== 'cancelled' && t.status !== 'failed',
    )
    if (row) {
      return {
        ok: true,
        alreadyExisted: true,
        task: { id: row.id, title: row.title, status: row.status, owner: row.owner ?? null, priority: row.priority },
        finding,
      }
    }
  } catch { /* pre-migration safety — fall through to insert */ }

  // 3. Create the task.
  const title = (params.title?.trim()) || parsed.action || parsed.insight.slice(0, 120)
  const description =
    `Källa: Dream Cycle (${findingKey})\n` +
    `Insikt [${parsed.severity.toUpperCase()}]: ${parsed.insight}` +
    (parsed.action ? `\nRekommenderad åtgärd: ${parsed.action}` : '')

  try {
    const { data, error } = await db
      .from('manager_tasks')
      .insert({
        project_id: projectId,
        title,
        description,
        status: 'pending',
        priority: SEVERITY_TO_PRIORITY[parsed.severity],
        owner,
        source: 'dream',
        source_key: findingKey,
      })
      .select('id, title, status, owner, priority')
      .single()
    if (error || !data) return { ok: false, error: error?.message ?? 'Kunde inte skapa uppgift.' }

    // 4. Mirror into the agent message stream (same as the delegate tool).
    try {
      await db.from('agent_messages').insert({
        project_id: projectId,
        from_agent: 'Atlas',
        to_agent: owner,
        message_type: 'daily_plan',
        content: `Dream-åtgärd delegerad: "${title}" (${parsed.severity}) — källa ${findingKey}.`,
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
