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

export interface DreamFinding {
  key: string
  severity: DreamSeverity
  /** The observation (left of the arrow). */
  insight: string
  /** The recommended action (right of the arrow), when present. */
  action: string | null
  updatedAt: string
}

export interface DreamFindingsResult {
  /** false when the project has never run a dream cycle. */
  hasData: boolean
  findings: DreamFinding[]
  counts: { critical: number; warning: number; info: number; total: number }
  /** Most recent dream insight timestamp, or null. */
  lastRunAt: string | null
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

    const findings: DreamFinding[] = rows.map((r) => {
      const { severity, insight, action } = parseDreamValue(r.value)
      return { key: r.key, severity, insight, action, updatedAt: r.updated_at }
    })

    const counts = findings.reduce(
      (acc, f) => {
        acc[f.severity]++
        acc.total++
        return acc
      },
      { critical: 0, warning: 0, info: 0, total: 0 },
    )

    const lastRunAt = rows.reduce<string | null>(
      (max, r) => (!max || r.updated_at > max ? r.updated_at : max),
      null,
    )

    findings.sort((a, b) => {
      const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
      return s !== 0 ? s : b.updatedAt.localeCompare(a.updatedAt)
    })

    return { hasData: true, findings, counts, lastRunAt }
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
