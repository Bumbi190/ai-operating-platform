import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calendarWeekFromParam } from '@/lib/calendar/time'
import { readOrganizationSharedCalendarWeek } from '@/lib/calendar/organization-read'
import { SharedCalendarWorkspace } from '@/components/calendar/SharedCalendarWorkspace'

export const dynamic = 'force-dynamic'

export default async function OrganizationCalendarPage({
  searchParams,
}: { searchParams: { week?: string | string[] } }) {
  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) redirect('/login')
  let range
  try { range = calendarWeekFromParam(searchParams.week, new Date().toISOString()) }
  catch { redirect('/organization/calendar') }

  // Every request, including next/previous week navigation, checks live membership.
  const model = await readOrganizationSharedCalendarWeek(session, createAdminClient(), user.id, range)
  if (!model) notFound()
  return <SharedCalendarWorkspace key={range.fromDate} initialWeek={model} />
}
