import type {
  DataState,
  OverviewModel,
  RunDay,
  OverviewPeriod
} from '../lib/overview/types'
export function overviewFixture(
  period: OverviewPeriod = 7,
  state: DataState = 'complete',
  empty = false
): OverviewModel {
  const metric = <T>(value: T) => ({
    state,
    value: state === 'complete' ? value : null
  })
  const days = Array.from({ length: period }, (_, i) =>
    new Date(Date.UTC(2026, 9, 16 - period + i)).toISOString().slice(0, 10)
  )
  return {
    period,
    generatedAt: '2026-10-15T12:00:00Z',
    projects: {
      state,
      rows: empty
        ? []
        : [
            {
              id: '10000000-0000-4000-8000-000000000001',
              name: 'Testprojekt',
              slug: 'test-project',
              color: '#67e8f9',
              href: '/projects/test-project',
              runningRuns: metric(1),
              failedRuns24h: metric(0),
              pendingApprovals: metric(2)
            }
          ]
    },
    costByDay: metric(
      days.map((date, i) => ({
        date,
        costSek: empty ? 0 : [2, 4, 3, 0, 6, 2, 5][i % 7]
      }))
    ),
    costByProject: metric(
      empty
        ? []
        : [{ projectId: '10000000-0000-4000-8000-000000000001', costSek: 22 }]
    ),
    runsByDay: metric(
      days.map<RunDay>((date, i) => ({
        date,
        counts: empty
          ? ({} as Record<string, number>)
          : {
              done: i % 4,
              running: i === period - 1 ? 1 : 0,
              failed: i === 2 ? 1 : 0
            }
      }))
    ),
    totals: {
      running: metric(empty ? 0 : 1),
      failed24h: metric(0),
      pendingApprovals: metric(empty ? 0 : 2)
    }
  }
}
