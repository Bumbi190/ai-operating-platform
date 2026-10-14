import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrganizationReadScope } from '@/lib/auth/organization-project-read'
import { OrganizationReviewBoard } from './ReviewBoard'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/collectors/handlarborsen-marketplace'
export const dynamic = 'force-dynamic'
export default async function ReviewsPage() {
  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) redirect('/login')
  const db = createAdminClient()
  const scope = await resolveOrganizationReadScope(session, db, user.id)
  if (!scope.role.active) redirect('/organization')
  const projects = scope.projectIds.length
    ? await db.from('projects').select('id, name').in('id', [...scope.projectIds])
    : { data: [], error: null }
  if (projects.error) return <main>Projekt kunde inte läsas.</main>
  return <OrganizationReviewBoard owner={scope.role.role === 'owner'} projects={(projects.data ?? []).filter(p => p.id === HANDLARBORSEN_PROJECT_ID).map(p => ({ id: p.id, name: p.name }))} />
}
