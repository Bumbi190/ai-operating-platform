import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrganizationReadScope } from '@/lib/auth/organization-project-read'
import { composeAtlasRailCards } from '@/lib/atlas/first-party-workspaces'
import { ProjectCoverGallery } from '@/components/platform/vnext/ProjectCoverGallery'

export const dynamic = 'force-dynamic'

export default async function OrganizationLandingPage() {
  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) redirect('/login')
  const db = createAdminClient()
  const scope = await resolveOrganizationReadScope(session, db, user.id)
  if (!scope.role.active) {
    return <main className="mx-auto max-w-3xl p-12"><h1>Åtkomst inväntas</h1><p>Inget aktivt organisationsmedlemskap finns för detta konto.</p></main>
  }
  const { data, error } = scope.projectIds.length
    ? await db.from('projects')
      .select('id, slug, name, color')
      .in('id', [...scope.projectIds])
      .order('name', { ascending: true })
    : { data: [], error: null }

  // Compose the same visual rail as the Owner from an independent read-only
  // allowlist. No Atlas model loader or privileged system workspaces.
  const cards = composeAtlasRailCards(
    (data ?? []).map(project => ({
      id: project.id,
      slug: project.slug,
      name: project.name,
      color: project.color ?? '#6366f1',
      href: `/organization/projects/${project.slug}`,
      runningRuns: null,
      pendingApprovals: null,
    })),
    [],
  )

  return <main className="min-h-screen bg-[#0b1424] text-slate-50">
    <div className="mx-auto max-w-6xl px-6 pt-10">
      <p className="text-sm text-slate-400">OMNIRA · ORGANISATION</p>
      <p className="mt-1 text-sm text-slate-300">
        {scope.role.role === 'owner' ? 'Owner' : 'Collaborator'} · Skrivskyddad projektöversikt
      </p>
      {scope.role.role === 'owner' && <Link href="/organization/invite" className="text-sm text-sky-300 underline">Hantera inbjudningar</Link>}
    </div>
    <ProjectCoverGallery cards={cards} projectsAvailable={!error} />
  </main>
}
