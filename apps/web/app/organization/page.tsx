import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrganizationReadScope } from '@/lib/auth/organization-project-read'

export const dynamic = 'force-dynamic'

export default async function OrganizationLandingPage() {
  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) redirect('/login')
  const db = createAdminClient()
  const scope = await resolveOrganizationReadScope(session, db, user.id)
  if (!scope.role.active) {
    return <main style={{ padding: 40 }}><h1>Åtkomst inväntas</h1><p>Inget aktivt organisationsmedlemskap finns för detta konto.</p></main>
  }
  const { data, error } = scope.projectIds.length
    ? await db.from('projects').select('id, slug, name').in('id', [...scope.projectIds])
    : { data: [], error: null }
  if (error) return <main style={{ padding: 40 }}><h1>Kan inte visa projekt just nu</h1></main>

  return <main style={{ minHeight: '100vh', background: '#0b1424', color: '#edf3fc', padding: '48px 24px', fontFamily: 'system-ui' }}>
    <div style={{ maxWidth: 960, margin: 'auto' }}>
      <p style={{ color: '#9fb3ce', letterSpacing: 2 }}>OMNIRA · ORGANISATION</p>
      <h1>Projektöversikt</h1>
      <p style={{ color: '#9fb3ce' }}>Inloggad som {scope.role.role === 'owner' ? 'Owner' : 'Collaborator'}. Projektöversikten är skrivskyddad.</p>
      {scope.role.role === 'owner' && <Link href="/organization/invite" style={{ color: '#b8dafe' }}>Hantera inbjudningar</Link>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16, marginTop: 32 }}>
        {(data ?? []).map(project => <div key={project.id} style={{ padding: 24, border: '1px solid #33445e', borderRadius: 16 }}>
          <h2 style={{ fontSize: 20 }}>{project.name}</h2>
          <p style={{ color: '#9fb3ce' }}>{project.slug}</p>
          <Link style={{ color: '#b8dafe' }} href={`/organization/projects/${project.slug}`}>Visa projektöversikt</Link>
        </div>)}
      </div>
      {(!data || data.length === 0) && <p>Inga tillgängliga projekt.</p>}
    </div>
  </main>
}
