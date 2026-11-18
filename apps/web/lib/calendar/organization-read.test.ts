import { describe, expect, it } from 'vitest'
import { sanitizeSharedManualEvents } from './organization-read'
import type { CalendarRange } from './types'

const range: CalendarRange = {
  fromDate: '2026-11-09',
  toDateExclusive: '2026-11-16',
  timeZone: 'Europe/Stockholm',
}
const allowed = '11111111-1111-4111-8111-111111111111'
const outside = '22222222-2222-4222-8222-222222222222'
const time = {
  kind: 'timed' as const,
  startUtc: '2026-11-13T10:00:00.000Z',
  endUtc: '2026-11-13T11:00:00.000Z',
  timeZone: 'Europe/Stockholm' as const,
}
function row(id: string, kind: 'private' | 'work_block', projectId: string | null) {
  return {
    id,
    draft: {
      kind, title: 'HEMLIG TITEL', description: 'HEMLIG ANTECKNING',
      location: 'HEMLIG PLATS', projectId, taskId: outside,
      time, workStatus: kind === 'private' ? null : 'planned',
    },
    version: 1, status: 'scheduled', created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
  }
}
describe('organization work calendar projection', () => {
  it('masks all private title, description, location and task references', () => {
    const events = sanitizeSharedManualEvents([row('private-event', 'private', null)], [allowed], range)
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('Upptagen (privat)')
    expect(events[0].description).toBe('')
    expect(events[0].location).toBe('')
    expect(events[0].taskId).toBeNull()
    expect(events[0].projectId).toBeNull()
    expect(JSON.stringify(events)).not.toContain('HEMLIG')
  })
  it('retains authorized work title, but not sensitive notes or unrelated projects', () => {
    const events = sanitizeSharedManualEvents([
      row('work', 'work_block', allowed),
      row('unauthorized', 'work_block', outside),
    ], [allowed], range)
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('HEMLIG TITEL')
    expect(events[0].description).toBe('')
    expect(events[0].location).toBe('')
    expect(events[0].projectId).toBe(allowed)
  })
  it('excludes events outside the requested week', () => {
    const old = row('old', 'work_block', allowed)
    old.draft.time = { ...time, startUtc: '2026-10-01T10:00:00.000Z', endUtc: '2026-10-01T11:00:00.000Z' }
    expect(sanitizeSharedManualEvents([old], [allowed], range)).toHaveLength(0)
  })
})
