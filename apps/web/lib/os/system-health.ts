import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { scopeProjectFilter } from '@/lib/atlas/isolation'
import { executionSafetyFlags, unsafeExecutionFlags } from '@/lib/ai/execution-flags'
import { normSeverity } from '@/lib/atlas/dream'
import { resolveDestination } from '@/lib/nav/registry'
import {
  COMPONENT_LABELS,
  type ComponentId,
  type ComponentState,
  type SectionState,
  type WarningTone,
} from './system-health-shared'

/**
 * Systemhälsa — the read model behind `/system`.
 *
 * NO SCORE. The page this replaces computed `100 - failRate * 2` and printed it
 * as Optimal / Degraded / Critical, so a platform with zero runs reported
 * "Optimal". Nothing stores a health number. This loader reports what each
 * source actually says, and where Omnira cannot observe something — pg_cron's
 * firing history, the M4 event log — it says so instead of counting it as well.
 *
 * SCOPE. `resolveProjectAccess()` resolves the operator's projects server-side
 * before any read, and every project-dimensioned read is handed that list; a
 * scope that cannot be resolved is a redirect, never a global read. Pending
 * approvals are counted THROUGH THE RUN (`runs!inner`), the rule Phase 11
 * settled and the decision route already uses — `approvals.project_id` is null
 * on nearly every stored row, so filtering on it would report zero.
 *
 * READ ONLY. The two controls this surface offers — the global execution stop
 * and a project's stop — are the existing `PauseToggle` / `ProjectPauseToggle`
 * components calling the existing server actions. Nothing here writes, and the
 * platform stop is read directly rather than through `getPlatformConfig`, whose
 * `?? false` fallback would render an unreadable kill switch as "not stopped".
 */

// ── Contract ─────────────────────────────────────────────────────────────────

export interface SystemComponent {
  id: ComponentId
  label: string
  state: ComponentState
  /** One line of stored evidence for that state. Never a guess. */
  detail: string
}

export interface SystemWarning {
  id: string
  tone: WarningTone
  title: string
  detail: string | null
  href: string | null
}

export interface SystemProject {
  id: string
  name: string
  slug: string
  color: string
  href: string | null
  paused: boolean
  pausedAt: string | null
  pausedReason: string | null
  runsRunning: number
  runsFailed24h: number
  pendingApprovals: number
  lastRunAt: string | null
}

export interface SystemAutomation {
  id: string
  name: string
  projectSlug: string | null
  active: boolean
  /** Verbatim `workflows.trigger`. */
  trigger: string | null
  /** Verbatim `workflows.cron_expr`. Configuration, not evidence of a run. */
  cronExpr: string | null
}

export interface SystemDreamIssue {
  id: string
  slug: string
  severity: string
  occurrences: number
  lastSeenAt: string | null
  projectSlug: string | null
  delegated: boolean
}

export interface SystemHealthModel {
  generatedAt: string
  /** The global execution stop. `readable:false` is NOT "not stopped". */
  platform: { readable: boolean; stopped: boolean; pausedAt: string | null; pausedReason: string | null }
  safety: { flags: { id: string; on: boolean }[]; findings: string[] }
  components: SystemComponent[]
  warnings: SystemWarning[]
  execution: {
    state: SectionState
    running: number | null
    awaitingApproval: number | null
    failed24h: number | null
    started24h: number | null
    lastRunAt: string | null
  }
  approvals: { state: SectionState; pending: number | null }
  projects: { state: SectionState; rows: SystemProject[] }
  automation: { state: SectionState; rows: SystemAutomation[]; truncated: boolean }
  dream: { state: SectionState; rows: SystemDreamIssue[]; lastSeenAt: string | null; truncated: boolean }
  memory: { state: SectionState; legacyRows: number | null }
  links: { approvals: string | null; planning: string | null; projects: string | null }
}

export const SYSTEM_HEALTH_LIMITS = { automation: 12, dream: 12, runs: 500 } as const

// ── Raw shapes ───────────────────────────────────────────────────────────────

export type Read<T> = { ok: true; rows: T[]; count: number | null } | { ok: false }
export type Value<T> = { ok: true; value: T } | { ok: false }

export interface RawProject {
  id: string; name?: string | null; slug?: string | null; color?: string | null
  execution_paused?: boolean | null; paused_at?: string | null; paused_reason?: string | null
}
export interface RawRunLite { id: string; project_id?: string | null; status?: string | null; created_at?: string | null }
export interface RawWorkflow {
  id: string; name?: string | null; project_id?: string | null
  active?: boolean | null; trigger?: string | null; cron_expr?: string | null
}
export interface RawDreamIssue {
  id: string; project_id?: string | null; issue_id?: string | null; severity?: string | null
  occurrences?: number | null; last_seen_at?: string | null; manager_task_id?: string | null
}
export interface RawPlatformStop {
  automation_paused?: boolean | null; paused_at?: string | null; paused_reason?: string | null
}

export interface AssembleSystemHealthInput {
  now: string
  platform: Value<RawPlatformStop>
  safety: { flags: Record<string, boolean>; findings: string[] }
  projects: Read<RawProject>
  /** Non-terminal runs: running / awaiting_approval / pending. */
  openRuns: Read<RawRunLite>
  /** Runs created in the last 24h — the window every 24h figure below names. */
  recentRuns: Read<RawRunLite>
  lastRunAt: Value<string | null>
  pendingApprovals: Value<number | null>
  approvalsByProject: Read<{ project_id: string | null }>
  workflows: Read<RawWorkflow>
  dreamIssues: Read<RawDreamIssue>
  legacyMemories: Value<number | null>
}

// ── Pure assembly ────────────────────────────────────────────────────────────

const text = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}
const count = <T,>(rows: T[], predicate: (row: T) => boolean) => rows.filter(predicate).length

export function assembleSystemHealth(input: AssembleSystemHealthInput): SystemHealthModel {
  const links = {
    approvals: resolveDestination('approvals')?.href ?? null,
    planning: resolveDestination('planning')?.href ?? null,
    projects: resolveDestination('project_home')?.href ?? null,
  }

  // ── The global stop. An unreadable switch is never rendered as "not stopped".
  const platform = input.platform.ok
    ? {
        readable: true,
        stopped: input.platform.value.automation_paused === true,
        pausedAt: text(input.platform.value.paused_at),
        pausedReason: text(input.platform.value.paused_reason),
      }
    : { readable: false, stopped: false, pausedAt: null, pausedReason: null }

  const safety = {
    flags: Object.entries(input.safety.flags).map(([id, on]) => ({ id, on })),
    findings: input.safety.findings,
  }

  // ── Runs, in the window each number names.
  const openRows = input.openRuns.ok ? input.openRuns.rows : []
  const recentRows = input.recentRuns.ok ? input.recentRuns.rows : []
  const running = input.openRuns.ok ? count(openRows, (r) => r.status === 'running') : null
  const awaitingApproval = input.openRuns.ok ? count(openRows, (r) => r.status === 'awaiting_approval') : null
  const failed24h = input.recentRuns.ok ? count(recentRows, (r) => r.status === 'failed') : null
  const started24h = input.recentRuns.ok ? (input.recentRuns.count ?? recentRows.length) : null
  const execution = {
    state: (input.openRuns.ok && input.recentRuns.ok ? 'ok' : 'error') as SectionState,
    running, awaitingApproval, failed24h, started24h,
    lastRunAt: input.lastRunAt.ok ? input.lastRunAt.value : null,
  }

  const approvals = {
    state: (input.pendingApprovals.ok ? 'ok' : 'error') as SectionState,
    pending: input.pendingApprovals.ok ? input.pendingApprovals.value : null,
  }

  // ── Projects, each with its own stored stop state and its own counts.
  const approvalsPerProject = new Map<string, number>()
  if (input.approvalsByProject.ok) {
    for (const row of input.approvalsByProject.rows) {
      const id = text(row.project_id)
      if (id) approvalsPerProject.set(id, (approvalsPerProject.get(id) ?? 0) + 1)
    }
  }
  const projectRows: SystemProject[] = (input.projects.ok ? input.projects.rows : []).flatMap((row) => {
    const id = text(row.id); const name = text(row.name); const slug = text(row.slug)
    if (!id || !name || !slug) return []
    const mine = (r: RawRunLite) => text(r.project_id) === id
    const lastRun = recentRows.filter(mine).map((r) => r.created_at).filter(Boolean).sort().reverse()[0] ?? null
    return [{
      id, name, slug,
      color: text(row.color) ?? '#64748b',
      href: resolveDestination('project_home', { project: slug })?.href ?? null,
      paused: row.execution_paused === true,
      pausedAt: text(row.paused_at),
      pausedReason: text(row.paused_reason),
      runsRunning: count(openRows.filter(mine), (r) => r.status === 'running'),
      runsFailed24h: count(recentRows.filter(mine), (r) => r.status === 'failed'),
      pendingApprovals: approvalsPerProject.get(id) ?? 0,
      lastRunAt: lastRun ?? null,
    }]
  })
  const projects = { state: (input.projects.ok ? 'ok' : 'error') as SectionState, rows: projectRows }

  // ── Automation: configuration only. Whether a cron fired is not observable here.
  const workflowRows = input.workflows.ok ? input.workflows.rows : []
  const slugById = new Map(projectRows.map((p) => [p.id, p.slug]))
  const automation = {
    state: (input.workflows.ok ? 'ok' : 'error') as SectionState,
    rows: workflowRows.slice(0, SYSTEM_HEALTH_LIMITS.automation).flatMap((row) => {
      const id = text(row.id); const name = text(row.name)
      if (!id || !name) return []
      return [{
        id, name,
        projectSlug: slugById.get(text(row.project_id) ?? '') ?? null,
        active: row.active === true,
        trigger: text(row.trigger),
        cronExpr: text(row.cron_expr),
      }]
    }),
    truncated: workflowRows.length > SYSTEM_HEALTH_LIMITS.automation,
  }

  // ── Dream: the stable issue ledger, read only.
  const dreamRows = input.dreamIssues.ok ? input.dreamIssues.rows : []
  const dreamIssues: SystemDreamIssue[] = dreamRows.slice(0, SYSTEM_HEALTH_LIMITS.dream).flatMap((row) => {
    const id = text(row.id); const slug = text(row.issue_id)
    if (!id || !slug) return []
    return [{
      id, slug,
      severity: normSeverity(row.severity),
      occurrences: typeof row.occurrences === 'number' ? row.occurrences : 1,
      lastSeenAt: text(row.last_seen_at),
      projectSlug: slugById.get(text(row.project_id) ?? '') ?? null,
      delegated: text(row.manager_task_id) !== null,
    }]
  })
  const dream = {
    state: (input.dreamIssues.ok ? 'ok' : 'error') as SectionState,
    rows: dreamIssues,
    lastSeenAt: dreamIssues.map((i) => i.lastSeenAt).filter(Boolean).sort().reverse()[0] ?? null,
    truncated: dreamRows.length > SYSTEM_HEALTH_LIMITS.dream,
  }

  const memory = {
    state: (input.legacyMemories.ok ? 'ok' : 'error') as SectionState,
    legacyRows: input.legacyMemories.ok ? input.legacyMemories.value : null,
  }

  // ── Component states. Every one of these is a stored fact or an absence.
  const pausedProjects = projectRows.filter((p) => p.paused)
  const criticalDream = dreamIssues.filter((i) => i.severity === 'critical')
  const component = (id: ComponentId, state: ComponentState, detail: string): SystemComponent =>
    ({ id, label: COMPONENT_LABELS[id], state, detail })

  const components: SystemComponent[] = [
    !platform.readable
      ? component('execution', 'unavailable', 'Plattformens stoppläge kunde inte läsas')
      : platform.stopped
        ? component('execution', 'stopped', `Global exekvering stoppad${platform.pausedReason ? ` — ${platform.pausedReason}` : ''}`)
        : component('execution', 'idle', 'Ingen global stoppflagga är satt'),

    safety.findings.length > 0
      ? component('safety', 'attention', `${safety.findings.length} säkerhetsflagga(or) av: ${safety.findings.join(', ')}`)
      : component('safety', 'idle', 'Alla säkerhetsflaggor är på'),

    !input.projects.ok
      ? component('projects', 'unavailable', 'Projekten kunde inte läsas')
      : pausedProjects.length > 0
        ? component('projects', 'stopped', `${pausedProjects.length} av ${projectRows.length} projekt är stoppade`)
        : component('projects', 'idle', `${projectRows.length} projekt utan stopp`),

    execution.state === 'error'
      ? component('runs', 'unavailable', 'Körningarna kunde inte läsas')
      : (failed24h ?? 0) > 0
        ? component('runs', 'attention', `${failed24h} misslyckade körningar senaste dygnet`)
        : (running ?? 0) > 0
          ? component('runs', 'active', `${running} körning(ar) pågår`)
          : component('runs', 'idle', `${started24h ?? 0} körningar startade senaste dygnet`),

    approvals.state === 'error'
      ? component('approvals', 'unavailable', 'Granskningarna kunde inte läsas')
      : (approvals.pending ?? 0) > 0
        ? component('approvals', 'attention', `${approvals.pending} granskning(ar) väntar på beslut`)
        : component('approvals', 'idle', 'Inga granskningar väntar'),

    automation.state === 'error'
      ? component('automation', 'unavailable', 'Arbetsflödena kunde inte läsas')
      : component('automation', 'unknown',
          `${automation.rows.filter((w) => w.active).length} aktiva arbetsflöden konfigurerade — körningarna observeras inte här`),

    dream.state === 'error'
      ? component('dream', 'unavailable', 'Dream-registret kunde inte läsas')
      : criticalDream.length > 0
        ? component('dream', 'attention', `${criticalDream.length} kritiska fynd i registret`)
        : component('dream', 'idle', `${dreamIssues.length} fynd i registret`),

    memory.state === 'error'
      ? component('memory', 'unavailable', 'Minnesregistret kunde inte läsas')
      : component('memory', 'unknown',
          `${memory.legacyRows ?? 0} rader i det äldre minnesregistret — M4 läses inte här`),
  ]

  // ── Warnings: every one names the stored condition that produced it.
  const warnings: SystemWarning[] = []
  if (!platform.readable) {
    warnings.push({ id: 'platform-unreadable', tone: 'unreadable',
      title: 'Plattformens stoppläge kunde inte läsas',
      detail: 'Stoppläget är okänt — det betyder inte att exekvering är tillåten.', href: null })
  } else if (platform.stopped) {
    warnings.push({ id: 'platform-stopped', tone: 'stop',
      title: 'Global exekvering är stoppad',
      detail: platform.pausedReason ?? 'Ingen orsak angiven.', href: null })
  }
  for (const project of pausedProjects) {
    warnings.push({ id: `project-stopped:${project.id}`, tone: 'stop',
      title: `${project.name} är stoppat`,
      detail: project.pausedReason ?? 'Ingen orsak angiven.', href: project.href })
  }
  if (safety.findings.length > 0) {
    warnings.push({ id: 'safety-flags', tone: 'attention',
      title: 'Säkerhetsflaggor är avstängda',
      detail: safety.findings.join(', '), href: null })
  }
  if ((failed24h ?? 0) > 0) {
    warnings.push({ id: 'runs-failed', tone: 'attention',
      title: `${failed24h} misslyckade körningar senaste dygnet`, detail: null, href: links.planning })
  }
  if ((approvals.pending ?? 0) > 0) {
    warnings.push({ id: 'approvals-pending', tone: 'attention',
      title: `${approvals.pending} granskning(ar) väntar på beslut`, detail: null, href: links.approvals })
  }
  for (const issue of criticalDream) {
    warnings.push({ id: `dream:${issue.id}`, tone: 'attention',
      title: `Dream: ${issue.slug}`,
      detail: `Kritisk · sedd ${issue.occurrences} gång(er)${issue.projectSlug ? ` · ${issue.projectSlug}` : ''}`,
      href: null })
  }
  for (const [id, label] of [
    [input.projects.ok, 'Projekten'], [execution.state === 'ok', 'Körningarna'],
    [input.pendingApprovals.ok, 'Granskningarna'], [input.workflows.ok, 'Arbetsflödena'],
    [input.dreamIssues.ok, 'Dream-registret'], [input.legacyMemories.ok, 'Minnesregistret'],
  ] as const) {
    if (!id) {
      warnings.push({ id: `unreadable:${label}`, tone: 'unreadable',
        title: `${label} kunde inte läsas`, detail: 'Läsfel — inte ett tomt resultat.', href: null })
    }
  }

  return {
    generatedAt: input.now,
    platform, safety, components, warnings,
    execution, approvals, projects, automation, dream, memory, links,
  }
}

// ── Loader ───────────────────────────────────────────────────────────────────

type Settled<T> = PromiseSettledResult<T>

function toRead<T>(res: Settled<{ data: unknown; error: unknown; count?: number | null }>): Read<T> {
  if (res.status !== 'fulfilled' || res.value.error) return { ok: false }
  return { ok: true, rows: (res.value.data ?? []) as T[], count: res.value.count ?? null }
}
function toCount(res: Settled<{ error: unknown; count?: number | null }>): Value<number | null> {
  if (res.status !== 'fulfilled' || res.value.error) return { ok: false }
  return { ok: true, value: res.value.count ?? null }
}

/**
 * Read the system's state for the operator's own projects. Returns `null` when
 * the scope cannot be resolved, which the page turns into the same redirect the
 * legacy body takes — an authorization failure must never render as zeroes.
 */
export async function loadSystemHealth(): Promise<SystemHealthModel | null> {
  const access = await resolveProjectAccess()
  if (!access.ok) return null

  const db = createAdminClient()
  const scoped = scopeProjectFilter(access.allowedProjectIds)
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  const [
    platformRes, projectsRes, openRunsRes, recentRunsRes, lastRunRes,
    approvalsCountRes, approvalsRowsRes, workflowsRes, dreamRes, memoriesRes,
  ] = await Promise.allSettled([
    (db.from('platform_config') as any)
      .select('automation_paused, paused_at, paused_reason').eq('id', 1).single(),
    (db.from('projects') as any)
      .select('id, name, slug, color, execution_paused, paused_at, paused_reason')
      .in('id', scoped).order('name'),
    (db.from('runs') as any)
      .select('id, project_id, status, created_at')
      .in('project_id', scoped).in('status', ['running', 'awaiting_approval', 'pending'])
      .limit(SYSTEM_HEALTH_LIMITS.runs),
    (db.from('runs') as any)
      .select('id, project_id, status, created_at', { count: 'exact' })
      .in('project_id', scoped).gte('created_at', since24h)
      .order('created_at', { ascending: false }).limit(SYSTEM_HEALTH_LIMITS.runs),
    (db.from('runs') as any)
      .select('created_at').in('project_id', scoped)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    // Pending approvals are placed by their RUN, never by the nullable column.
    (db.from('approvals') as any)
      .select('id, runs!inner(project_id)', { count: 'exact', head: true })
      .eq('status', 'pending').in('runs.project_id', scoped),
    (db.from('approvals') as any)
      .select('runs!inner(project_id)')
      .eq('status', 'pending').in('runs.project_id', scoped).limit(200),
    (db.from('workflows') as any)
      .select('id, name, project_id, active, trigger, cron_expr')
      .in('project_id', scoped).order('name').limit(SYSTEM_HEALTH_LIMITS.automation + 1),
    (db.from('dream_issues') as any)
      .select('id, project_id, issue_id, severity, occurrences, last_seen_at, manager_task_id')
      .in('project_id', scoped).order('last_seen_at', { ascending: false })
      .limit(SYSTEM_HEALTH_LIMITS.dream + 1),
    (db.from('memories') as any)
      .select('id', { count: 'exact', head: true }).in('project_id', scoped),
  ])

  const platform: Value<RawPlatformStop> =
    platformRes.status === 'fulfilled' && !platformRes.value.error
      ? { ok: true, value: (platformRes.value.data ?? {}) as RawPlatformStop }
      : { ok: false }

  const lastRunAt: Value<string | null> =
    lastRunRes.status === 'fulfilled' && !lastRunRes.value.error
      ? { ok: true, value: ((lastRunRes.value.data as { created_at?: string } | null)?.created_at) ?? null }
      : { ok: false }

  // The per-project approval rows arrive as `{ runs: { project_id } }`.
  const approvalsByProject: Read<{ project_id: string | null }> =
    approvalsRowsRes.status === 'fulfilled' && !approvalsRowsRes.value.error
      ? {
          ok: true,
          count: null,
          rows: ((approvalsRowsRes.value.data ?? []) as { runs?: { project_id?: string | null } | { project_id?: string | null }[] }[])
            .map((row) => {
              const run = Array.isArray(row.runs) ? row.runs[0] : row.runs
              return { project_id: run?.project_id ?? null }
            }),
        }
      : { ok: false }

  const flags = executionSafetyFlags()
  return assembleSystemHealth({
    now,
    platform,
    safety: { flags: flags as unknown as Record<string, boolean>, findings: unsafeExecutionFlags(flags) },
    projects: toRead<RawProject>(projectsRes),
    openRuns: toRead<RawRunLite>(openRunsRes),
    recentRuns: toRead<RawRunLite>(recentRunsRes),
    lastRunAt,
    pendingApprovals: toCount(approvalsCountRes),
    approvalsByProject,
    workflows: toRead<RawWorkflow>(workflowsRes),
    dreamIssues: toRead<RawDreamIssue>(dreamRes),
    legacyMemories: toCount(memoriesRes),
  })
}
