import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getAllowedProjectIds, scopeProjectFilter } from '@/lib/atlas/isolation'
import { ATLAS_MODES, type AtlasMode } from '@/lib/atlas/lifecycle'
import { OPERATOR_DISPLAY_NAME } from '@/lib/atlas/identity'
import { resolveDestination } from '@/lib/nav/registry'

type AnyDb = any

type ProjectRow = {
  id: string
  name: string
  slug: string
  color: string
  created_at: string
  atlas_mode?: string | null
}

type RunRow = {
  id: string
  project_id: string
  status: string
  created_at: string
  finished_at: string | null
  workflows?: { name?: string | null } | { name?: string | null }[] | null
}

type ApprovalRow = {
  id: string
  project_id: string | null
  status: string
  output_key: string
  created_at: string | null
  reviewed_at: string | null
}

export type AtlasHomeActivityKind = 'run' | 'approval'

export interface AtlasHomeActivityItem {
  id: string
  kind: AtlasHomeActivityKind
  projectId: string
  projectName: string
  projectColor: string
  title: string
  detail?: string
  timestamp: string
  href: string
  requiresAttention: boolean
}

export interface AtlasHomeProjectSummary {
  id: string
  name: string
  slug: string
  color: string
  href: string
  atlasMode?: AtlasMode
  latestActivityAt?: string
  latestActivityTitle?: string
  runningRuns: number | null
  pendingApprovals: number | null
}

export interface AtlasHomeViewModel {
  generatedAt: string
  operatorName?: string
  projects: AtlasHomeProjectSummary[]
  activity: AtlasHomeActivityItem[]
  totals: {
    projects: number
    runningRuns: number | null
    pendingApprovals: number | null
    failedRuns24h: number | null
  }
  availability: {
    projects: boolean
    runs: boolean
    approvals: boolean
  }
}

interface BuildAtlasHomeViewModelOptions {
  db: AnyDb
  userId: string
  operatorName?: string
  now?: Date
}

interface AssembleOptions {
  allowedProjectIds: string[]
  projectRows: ProjectRow[]
  runRows: RunRow[] | null
  approvalRows: ApprovalRow[] | null
  operatorName?: string
  now: Date
  projectsAvailable?: boolean
}

function firstRelation<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined
}

function validAtlasMode(value: string | null | undefined): AtlasMode | undefined {
  return ATLAS_MODES.find((mode) => mode === value)
}

function safeTime(value: string | null | undefined): number {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function runTitle(status: string, workflowName?: string | null): { title: string; detail?: string } {
  const subject = workflowName?.trim() || 'Arbetsflöde'
  if (status === 'failed') return { title: `${subject} behöver åtgärdas`, detail: 'Körningen misslyckades' }
  if (status === 'running') return { title: `${subject} arbetar`, detail: 'Körning pågår' }
  if (status === 'done') return { title: `${subject} är klart` }
  return { title: `${subject} · ${status}` }
}

function approvalTitle(status: string): { title: string; detail?: string } {
  if (status === 'pending') return { title: 'Godkännande väntar', detail: 'Ett beslut krävs innan arbetet går vidare' }
  if (status === 'approved') return { title: 'Innehåll godkändes' }
  if (status === 'rejected') return { title: 'Innehåll avvisades' }
  return { title: `Godkännande · ${status}` }
}

/**
 * Pure presentation-model assembly. Every row is filtered against the allow-list
 * again, even when the database query was already scoped. This is the final
 * pre-serialization boundary for Atlas Home.
 */
export function assembleAtlasHomeViewModel({
  allowedProjectIds,
  projectRows,
  runRows,
  approvalRows,
  operatorName,
  now,
  projectsAvailable = true,
}: AssembleOptions): AtlasHomeViewModel {
  const allowed = new Set(allowedProjectIds)
  const projects = projectRows.filter((project) => allowed.has(project.id))
  const projectById = new Map(projects.map((project) => [project.id, project]))
  const runs = runRows?.filter((run) => allowed.has(run.project_id) && projectById.has(run.project_id)) ?? []
  const approvals = approvalRows?.filter((approval) => (
    !!approval.project_id && allowed.has(approval.project_id) && projectById.has(approval.project_id)
  )) ?? []

  const activity: AtlasHomeActivityItem[] = []

  for (const run of runs) {
    const project = projectById.get(run.project_id)
    if (!project) continue
    const workflow = firstRelation(run.workflows)
    const copy = runTitle(run.status, workflow?.name)
    const timestamp = run.finished_at || run.created_at
    activity.push({
      id: `run-${run.id}`,
      kind: 'run',
      projectId: project.id,
      projectName: project.name,
      projectColor: project.color,
      title: copy.title,
      detail: copy.detail,
      timestamp,
      href: resolveDestination('activity', {
        project: project.slug,
        filters: run.status ? { status: run.status } : undefined,
      })?.href ?? '/agent-activity',
      requiresAttention: run.status === 'failed',
    })
  }

  for (const approval of approvals) {
    if (!approval.project_id || !approval.created_at) continue
    const project = projectById.get(approval.project_id)
    if (!project) continue
    const copy = approvalTitle(approval.status)
    activity.push({
      id: `approval-${approval.id}`,
      kind: 'approval',
      projectId: project.id,
      projectName: project.name,
      projectColor: project.color,
      title: copy.title,
      detail: copy.detail,
      timestamp: approval.reviewed_at || approval.created_at,
      href: resolveDestination('approvals', {
        project: project.slug,
        filters: { state: approval.status },
      })?.href ?? '/approvals',
      requiresAttention: approval.status === 'pending',
    })
  }

  activity.sort((a, b) => safeTime(b.timestamp) - safeTime(a.timestamp))

  const latestByProject = new Map<string, AtlasHomeActivityItem>()
  for (const item of activity) {
    if (!latestByProject.has(item.projectId)) latestByProject.set(item.projectId, item)
  }

  const projectSummaries = projects.map<AtlasHomeProjectSummary>((project) => ({
    id: project.id,
    name: project.name,
    slug: project.slug,
    color: project.color,
    href: resolveDestination('project_home', { project: project.slug })?.href ?? `/projects/${project.slug}`,
    atlasMode: validAtlasMode(project.atlas_mode),
    latestActivityAt: latestByProject.get(project.id)?.timestamp,
    latestActivityTitle: latestByProject.get(project.id)?.title,
    runningRuns: runRows === null ? null : runs.filter((run) => run.project_id === project.id && run.status === 'running').length,
    pendingApprovals: approvalRows === null
      ? null
      : approvals.filter((approval) => approval.project_id === project.id && approval.status === 'pending').length,
  }))

  const since24h = now.getTime() - 24 * 60 * 60 * 1000

  return {
    generatedAt: now.toISOString(),
    operatorName,
    projects: projectSummaries,
    activity: activity.slice(0, 16),
    totals: {
      projects: projectSummaries.length,
      runningRuns: runRows === null ? null : runs.filter((run) => run.status === 'running').length,
      pendingApprovals: approvalRows === null ? null : approvals.filter((approval) => approval.status === 'pending').length,
      failedRuns24h: runRows === null
        ? null
        : runs.filter((run) => run.status === 'failed' && safeTime(run.created_at) >= since24h).length,
    },
    availability: {
      projects: projectsAvailable,
      runs: runRows !== null,
      approvals: approvalRows !== null,
    },
  }
}

async function fetchProjects(db: AnyDb, allowedProjectIds: string[]): Promise<{ rows: ProjectRow[]; available: boolean }> {
  const scopedIds = scopeProjectFilter(allowedProjectIds)
  const withMode = await (db.from('projects') as any)
    .select('id, name, slug, color, created_at, atlas_mode')
    .in('id', scopedIds)
    .order('created_at', { ascending: true })

  if (!withMode?.error) return { rows: (withMode?.data ?? []) as ProjectRow[], available: true }

  // atlas_mode exists in migration 20260623_150000 but is intentionally not in
  // generated types yet. Older environments get the same safe model without it.
  const fallback = await (db.from('projects') as any)
    .select('id, name, slug, color, created_at')
    .in('id', scopedIds)
    .order('created_at', { ascending: true })

  return fallback?.error
    ? { rows: [], available: false }
    : { rows: (fallback?.data ?? []) as ProjectRow[], available: true }
}

export async function buildAtlasHomeViewModel({
  db,
  userId,
  operatorName,
  now = new Date(),
}: BuildAtlasHomeViewModelOptions): Promise<AtlasHomeViewModel> {
  const allowedProjectIds = await getAllowedProjectIds(db, userId)

  if (allowedProjectIds.length === 0) {
    return assembleAtlasHomeViewModel({
      allowedProjectIds,
      projectRows: [],
      runRows: [],
      approvalRows: [],
      operatorName,
      now,
    })
  }

  const scopedIds = scopeProjectFilter(allowedProjectIds)
  const [projectsSettled, runsSettled, approvalsSettled] = await Promise.allSettled([
    fetchProjects(db, allowedProjectIds),
    (db.from('runs') as any)
      .select('id, project_id, status, created_at, finished_at, workflows(name)')
      .in('project_id', scopedIds)
      .order('created_at', { ascending: false })
      .limit(40),
    (db.from('approvals') as any)
      .select('id, project_id, status, output_key, created_at, reviewed_at')
      .in('project_id', scopedIds)
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  const projectsResult = projectsSettled.status === 'fulfilled'
    ? projectsSettled.value
    : { rows: [], available: false }
  const runsResult = runsSettled.status === 'fulfilled' ? runsSettled.value : null
  const approvalsResult = approvalsSettled.status === 'fulfilled' ? approvalsSettled.value : null
  const projectDataAvailable = projectsResult.available

  return assembleAtlasHomeViewModel({
    allowedProjectIds,
    projectRows: projectsResult.rows,
    runRows: !projectDataAvailable || !runsResult || runsResult.error
      ? null
      : ((runsResult.data ?? []) as RunRow[]),
    approvalRows: !projectDataAvailable || !approvalsResult || approvalsResult.error
      ? null
      : ((approvalsResult.data ?? []) as ApprovalRow[]),
    operatorName,
    now,
    projectsAvailable: projectsResult.available,
  })
}

function operatorNameFromUser(user: { email?: string | null; user_metadata?: Record<string, unknown> }): string | undefined {
  // Presentation identity is deliberately canonical and separate from auth.
  // Never serialize a mutable metadata value or an email handle into vNext.
  void user
  return OPERATOR_DISPLAY_NAME || undefined
}

/** Authenticated server loader used by `/atlas?ui=vnext`. */
export async function loadAtlasHomeViewModel(): Promise<AtlasHomeViewModel | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  return buildAtlasHomeViewModel({
    db: createAdminClient(),
    userId: user.id,
    operatorName: operatorNameFromUser(user),
  })
}
