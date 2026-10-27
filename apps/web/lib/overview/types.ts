import type {GrowthOverview} from './growth-types'
export type OverviewPeriod = 7 | 30
export type DataState = 'complete' | 'partial' | 'unavailable'
export type ReadResult<T> = { state: DataState; rows: T[] }
export type Metric<T> = { state: DataState; value: T | null }
export type OverviewProject = {
  id: string
  name: string
  slug: string
  color: string | null
  href: string
  runningRuns: Metric<number>
  failedRuns24h: Metric<number>
  pendingApprovals: Metric<number>
}
export type CostDay = { date: string; costSek: number }
export type ProjectCost = { projectId: string; costSek: number }
export type RunDay = { date: string; counts: Record<string, number> }
export type OverviewModel = {
  growth?: GrowthOverview
  period: OverviewPeriod
  generatedAt: string
  projects: ReadResult<OverviewProject>
  costByDay: Metric<CostDay[]>
  costByProject: Metric<ProjectCost[]>
  runsByDay: Metric<RunDay[]>
  totals: {
    running: Metric<number>
    failed24h: Metric<number>
    pendingApprovals: Metric<number>
  }
}
