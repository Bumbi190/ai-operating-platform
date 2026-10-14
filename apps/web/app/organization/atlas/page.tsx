import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrganizationReadScope } from '@/lib/auth/organization-project-read'
import { assembleAtlasHomeViewModel } from '@/lib/atlas/home-view-model'
import { AtlasHomeVNext } from '@/components/platform/vnext/AtlasHomeVNext'

export const dynamic = 'force-dynamic'

/**
 * EXACT Atlas vNext composition, with collaborator-scoped data and a tool-free
 * composer. No owner's chat endpoint, system workspaces or execution controls.
 */
export default async function OrganizationAtlasPage() {
  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) redirect('/login')
  const db = createAdminClient()
  const scope = await resolveOrganizationReadScope(session, db, user.id)
  if (!scope.role.active || scope.role.role !== 'collaborator') notFound()

  const ids = [...scope.projectIds]
  if (!ids.length) notFound()
  const [projects, runs, approvals] = await Promise.allSettled([
    db.from('projects').select('id, name, slug, color, created_at').in('id', ids).order('created_at', { ascending: true }),
    (db.from('runs') as any).select('id, project_id, status, created_at, finished_at, workflows(name)')
      .in('project_id', ids).order('created_at', { ascending: false }).limit(40),
    (db.from('approvals') as any).select('id, project_id, status, output_key, created_at, reviewed_at')
      .in('project_id', ids).order('created_at', { ascending: false }).limit(30),
  ])
  const projectResult = projects.status === 'fulfilled' ? projects.value : null
  if (!projectResult || projectResult.error || !projectResult.data) notFound()
  const allowed = new Set(ids)
  const projectRows = projectResult.data.filter(p => allowed.has(p.id)).map(p => ({
    id: p.id, name: p.name, slug: p.slug, color: p.color ?? '#6366f1',
    created_at: p.created_at,
  }))
  const model = assembleAtlasHomeViewModel({
    allowedProjectIds: ids,
    projectRows,
    runRows: runs.status === 'fulfilled' && !runs.value.error ? runs.value.data ?? [] : null,
    approvalRows: approvals.status === 'fulfilled' && !approvals.value.error ? approvals.value.data ?? [] : null,
    operatorName: 'Collaborator',
    now: new Date(),
  })
  const hrefByProject = new Map(projectRows.map(p => [p.id, '/organization/projects/' + p.slug]))
  // Pure presentation rewrite: no link to legacy owner-authorized routes.
  const safeModel = {
    ...model,
    projects: model.projects.map(p => ({ ...p, href: hrefByProject.get(p.id) ?? '/organization' })),
    activity: model.activity.map(item => ({ ...item, href: hrefByProject.get(item.projectId) ?? '/organization' })),
  }
  return <AtlasHomeVNext model={safeModel} collaboratorReadOnly />
}
