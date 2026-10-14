import { CollaboratorProjectCommandCenter } from '../CollaboratorProjectCommandCenter'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrganizationReadScope } from '@/lib/auth/organization-project-read'

export const dynamic = 'force-dynamic'
type ProjectParams = { params: { slug: string } }

export default async function ProjectReadPage({ params }: ProjectParams) {
  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) redirect('/login')
  const db = createAdminClient()
  const scope = await resolveOrganizationReadScope(session, db, user.id)
  if (!scope.role.active || scope.projectIds.length === 0) notFound()
  if (!/^[a-z0-9-]{1,80}$/.test(params.slug)) notFound()

  const { data: project, error: projectError } = await db.from('projects')
    .select('id, name, slug, color')
    .eq('slug', params.slug)
    .in('id', [...scope.projectIds])
    .maybeSingle()
  if (projectError || !project) notFound()

  const [runsResult, tasksResult, revenueResult, costsResult] = await Promise.allSettled([
    db.from('runs').select('id, status, created_at')
      .eq('project_id', project.id).order('created_at', { ascending: false }).limit(15),
    db.from('manager_tasks').select('id, title, status, created_at')
      .eq('project_id', project.id).order('created_at', { ascending: false }).limit(15),
    db.from('revenue_snapshots').select('snapshot_date, mrr_sek, revenue_month_sek, currency')
      .eq('project_id', project.id).order('snapshot_date', { ascending: false }).limit(1),
    db.from('cost_events').select('cost_sek, created_at')
      .eq('project_id', project.id).order('created_at', { ascending: false }).limit(20),
  ])
  const read = <T,>(result: PromiseSettledResult<{ data: T[] | null; error: unknown }>) => ({
    available: result.status === 'fulfilled' && !result.value.error && Array.isArray(result.value.data),
    rows: result.status === 'fulfilled' && !result.value.error && Array.isArray(result.value.data)
      ? result.value.data : [],
  })
  return <CollaboratorProjectCommandCenter
    project={{ id: project.id, slug: project.slug, name: project.name, color: project.color ?? '#6366f1' }}
    runs={read(runsResult)}
    tasks={read(tasksResult)}
    revenue={read(revenueResult)}
    costs={read(costsResult)}
  />
}
