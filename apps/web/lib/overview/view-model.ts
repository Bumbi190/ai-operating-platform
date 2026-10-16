import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAllowedProjectIds } from '@/lib/atlas/isolation'
import { projectLifecycleState } from '@/lib/project/lifecycle/list'
import { readOverviewPages } from './read-pages'
import { stockholmDay, stockholmPeriod } from './period'
import type {
  OverviewModel,
  OverviewPeriod,
  DataState,
  ReadResult,
  Metric,
  OverviewProject,
  CostDay,
  ProjectCost,
  RunDay
} from './types'
type Row = {
  id: string
  project_id: string
  created_at: string
  status: string
  cost_sek: unknown
}
type ProjectRow = {
  id: string
  owner_id: string
  name: string
  slug: string
  color?: string
  project_lifecycle?: unknown
}
const metric = <T>(state: DataState, value: T): Metric<T> => ({
  state,
  value: state === 'complete' ? value : null
})
const time = (value: unknown) =>
  typeof value === 'string' ? Date.parse(value) : NaN
function unavailable(
  period: OverviewPeriod,
  now: Date,
  state: DataState
): OverviewModel {
  return {
    period,
    generatedAt: now.toISOString(),
    projects: { state, rows: [] },
    costByDay: metric<CostDay[]>(state, []),
    costByProject: metric<ProjectCost[]>(state, []),
    runsByDay: metric<RunDay[]>(state, []),
    totals: {
      running: metric(state, 0),
      failed24h: metric(state, 0),
      pendingApprovals: metric(state, 0)
    }
  }
}
export async function buildOverviewModel({
  db,
  userId,
  period,
  now
}: {
  db: any
  userId: string
  period: OverviewPeriod
  now: Date
}): Promise<OverviewModel> {
  if (!userId) return unavailable(period, now, 'unavailable')
  const allowed = await getAllowedProjectIds(db, userId)
  const owned = await readOverviewPages<ProjectRow>((from, to) =>
    db
      .from('projects')
      .select('id,owner_id,name,slug,color,project_lifecycle(state)')
      .eq('owner_id', userId)
      .order('id')
      .range(from, to)
  )
  if (owned.state !== 'complete') return unavailable(period, now, owned.state)
  const verified = owned.rows.filter((p) => p.owner_id === userId),
    verifiedIds = new Set(verified.map((p) => p.id)),
    allowedIds = new Set(allowed)
  if (
    verifiedIds.size !== allowedIds.size ||
    [...verifiedIds].some((id) => !allowedIds.has(id))
  )
    return unavailable(period, now, 'partial')
  let projects: ProjectRow[]
  try {
    if (
      verified.some(
        (p) =>
          typeof p.name !== 'string' ||
          !p.name ||
          typeof p.slug !== 'string' ||
          !p.slug
      )
    )
      return unavailable(period, now, 'partial')
    projects = verified.filter((p) => projectLifecycleState(p) === 'active')
  } catch {
    return unavailable(period, now, 'partial')
  }
  const ids = projects.map((p) => p.id),
    visible = new Set(ids),
    range = stockholmPeriod(period, now)
  const start = Date.parse(range.startIso),
    end = Date.parse(range.endIso),
    since24h = now.getTime() - 86400000
  const read = (
    table: string,
    fields: string,
    filter: (q: any) => any = (q) => q
  ): Promise<ReadResult<Row>> =>
    ids.length
      ? readOverviewPages<Row>((from, to) =>
          filter(db.from(table).select(fields).in('project_id', ids))
            .order('id')
            .range(from, to)
        )
      : Promise.resolve({ state: 'complete', rows: [] })
  const [costRaw, runRaw, runningRaw, failedRaw, approvalRaw] =
    await Promise.all([
      read('cost_events', 'id,project_id,cost_sek,created_at', (q) =>
        q.gte('created_at', range.startIso).lt('created_at', range.endIso)
      ),
      read('runs', 'id,project_id,status,created_at', (q) =>
        q.gte('created_at', range.startIso).lt('created_at', range.endIso)
      ),
      read('runs', 'id,project_id,status,created_at', (q) =>
        q.eq('status', 'running')
      ),
      read('runs', 'id,project_id,status,created_at', (q) =>
        q
          .eq('status', 'failed')
          .gte('created_at', new Date(since24h).toISOString())
          .lte('created_at', now.toISOString())
      ),
      read('approvals', 'id,project_id,status', (q) =>
        q.eq('status', 'pending')
      )
    ])
  function checked(
    source: ReadResult<Row>,
    valid: (row: Row) => boolean
  ): ReadResult<Row> {
    const scoped = source.rows.filter((r) => visible.has(r.project_id)),
      rows = scoped.filter(valid)
    return {
      state:
        source.state === 'complete' && rows.length !== scoped.length
          ? 'partial'
          : source.state,
      rows
    }
  }
  const costs = checked(
    costRaw,
    (r) =>
      Number.isFinite(time(r.created_at)) &&
      (typeof r.cost_sek === 'number' ||
        (typeof r.cost_sek === 'string' && r.cost_sek.trim() !== '')) &&
      Number.isFinite(Number(r.cost_sek))
  )
  const validRun = (r: Row) =>
    Number.isFinite(time(r.created_at)) &&
    typeof r.status === 'string' &&
    !!r.status
  const runs = checked(runRaw, validRun),
    running = checked(runningRaw, validRun),
    failed = checked(failedRaw, validRun),
    approvals = checked(approvalRaw, (r) => typeof r.status === 'string')
  const costsInPeriod = costs.rows.filter(
    (r) => time(r.created_at) >= start && time(r.created_at) < end
  )
  const runsInPeriod = runs.rows.filter(
    (r) => time(r.created_at) >= start && time(r.created_at) < end
  )
  const activeRuns = running.rows.filter((r) => r.status === 'running'),
    failedRuns = failed.rows.filter(
      (r) =>
        r.status === 'failed' &&
        time(r.created_at) >= since24h &&
        time(r.created_at) <= now.getTime()
    ),
    pending = approvals.rows.filter((r) => r.status === 'pending')
  const dailyCost = new Map<string, number>(),
    projectCost = new Map<string, number>()
  for (const row of costsInPeriod) {
    const day = stockholmDay(new Date(row.created_at)),
      value = Number(row.cost_sek)
    dailyCost.set(day, (dailyCost.get(day) ?? 0) + value)
    projectCost.set(
      row.project_id,
      (projectCost.get(row.project_id) ?? 0) + value
    )
  }
  const dailyRuns = new Map<string, Record<string, number>>(
    range.dayKeys.map((day) => [day, Object.create(null)])
  )
  for (const row of runsInPeriod) {
    const counts = dailyRuns.get(stockholmDay(new Date(row.created_at)))
    if (counts) counts[row.status] = (counts[row.status] ?? 0) + 1
  }
  const costByDay = range.dayKeys.map((date) => ({
    date,
    costSek: dailyCost.get(date) ?? 0
  }))
  const costByProject = ids
    .map((projectId) => ({
      projectId,
      costSek: projectCost.get(projectId) ?? 0
    }))
    .sort((a, b) => b.costSek - a.costSek)
  const runsByDay: RunDay[] = range.dayKeys.map((date) => ({
    date,
    counts: dailyRuns.get(date)!
  }))
  const summaries: OverviewProject[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    color: p.color ?? null,
    href: '/projects/' + encodeURIComponent(p.slug),
    runningRuns: metric(
      running.state,
      activeRuns.filter((r) => r.project_id === p.id).length
    ),
    failedRuns24h: metric(
      failed.state,
      failedRuns.filter((r) => r.project_id === p.id).length
    ),
    pendingApprovals: metric(
      approvals.state,
      pending.filter((r) => r.project_id === p.id).length
    )
  }))
  return {
    period,
    generatedAt: now.toISOString(),
    projects: { state: 'complete', rows: summaries },
    costByDay: metric(costs.state, costByDay),
    costByProject: metric(costs.state, costByProject),
    runsByDay: metric(runs.state, runsByDay),
    totals: {
      running: metric(running.state, activeRuns.length),
      failed24h: metric(failed.state, failedRuns.length),
      pendingApprovals: metric(approvals.state, pending.length)
    }
  }
}
export async function loadOverviewModel(
  period: OverviewPeriod
): Promise<OverviewModel | null> {
  const session = await createClient(),
    { data, error } = await session.auth.getUser()
  if (error || !data.user) return null
  return buildOverviewModel({
    db: createAdminClient(),
    userId: data.user.id,
    period,
    now: new Date()
  })
}
