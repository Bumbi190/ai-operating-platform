import 'server-only'
import { resolveOrganizationReadScope } from '@/lib/auth/organization-project-read'
import { readCalendarWeek } from './read'
import { calendarTimeInRange } from './source-social'
import { projectManualOccurrences } from './occurrences'
import type {
  AdminDb, CalendarDb, CalendarEvent, CalendarEventDraft, CalendarRange, CalendarWeekModel,
} from './types'

type CalendarRow = {
  id: string
  draft: unknown
  version: number
  status: string
  created_at: string
  updated_at: string
}

/**
 * An active collaborator may see the organization's WORK calendar, never the
 * owner's private title, notes, location or decision/write controls.
 * All admin reads happen only after a session-bound membership and project
 * scope check. No collaborator impersonation and no owner JWT is used.
 */
export function sanitizeSharedManualEvents(
  rows: CalendarRow[],
  allowedProjectIds: readonly string[],
  range: CalendarRange,
): CalendarEvent[] {
  const allowed = new Set(allowedProjectIds)
  const safe: CalendarEvent[] = []
  for (const row of rows) {
    const draft = row.draft
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) continue
    const value = draft as Partial<CalendarEventDraft>
    if (value.kind !== 'private' && value.kind !== 'work_block') continue
    if (!value.time || (value.time.kind !== 'all_day' && value.time.kind !== 'timed')) continue
    // An event referencing a project outside the granted organization is denied.
    if (value.projectId && !allowed.has(value.projectId)) continue
    if (typeof value.title !== 'string' || row.status !== 'scheduled' && row.status !== 'cancelled') continue
    const isPrivate = value.kind === 'private'
    safe.push({
      kind: isPrivate ? 'private' : 'work_block',
      title: isPrivate ? 'Upptagen (privat)' : value.title,
      description: '',
      location: '',
      projectId: isPrivate ? null : value.projectId ?? null,
      taskId: null,
      time: value.time,
      workStatus: isPrivate ? null : value.workStatus ?? 'planned',
      repeat: value.repeat ?? null,
      id: row.id,
      version: row.version,
      status: row.status as CalendarEvent['status'],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  }
  // Bound the projection to the requested week, including repeated occurrences.
  return safe.filter(event => projectManualOccurrences([event], range)
    .some(entry => calendarTimeInRange(entry.time, range)))
}

export async function readOrganizationSharedCalendarWeek(
  sessionDb: CalendarDb,
  adminDb: AdminDb,
  viewerUserId: string,
  range: CalendarRange,
): Promise<CalendarWeekModel | null> {
  const scope = await resolveOrganizationReadScope(
    sessionDb as Parameters<typeof resolveOrganizationReadScope>[0],
    adminDb as Parameters<typeof resolveOrganizationReadScope>[1],
    viewerUserId,
  )
  if (!scope.role.active || scope.role.role !== 'collaborator' || !scope.projectIds.length) return null

  // Independently bind the calendar's owner to the organization.
  const { data: owner, error: ownerError } = await (adminDb as any)
    .from('omnira_organization_memberships').select('user_id')
    .eq('role', 'owner').is('revoked_at', null).maybeSingle()
  if (ownerError || !owner?.user_id || owner.user_id === viewerUserId)
    throw new Error('Organization calendar owner unavailable')

  // Admin client is deliberately scoped to this verified owner and a hard row cap.
  // Never return a raw owner draft to a collaborator.
  const { data, error } = await (adminDb as any)
    .from('user_calendar_events')
    .select('id,draft,version,status,created_at,updated_at')
    .eq('owner_user_id', owner.user_id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(501)
  if (error || !Array.isArray(data)) throw new Error('Shared calendar unavailable')
  const rows = data as CalendarRow[]
  const events = sanitizeSharedManualEvents(rows.slice(0, 500), scope.projectIds, range)
  const model = await readCalendarWeek(
    { sessionDb, adminDb },
    { userId: owner.user_id, allowedProjectIds: [...scope.projectIds], projectScopeAvailable: true },
    range,
    { manualEvents: { events, truncated: rows.length > 500 } },
  )
  // Never serialize owner manual metadata or mutation/link destinations.
  return {
    ...model,
    workflowOptions: [],
    entries: model.entries.map(entry => ({
      ...entry,
      editable: false,
      href: null,
      pendingChange: null,
      manualEvent: undefined,
      linkedWorkflow: undefined,
      contentSource: undefined,
    })),
  }
}
