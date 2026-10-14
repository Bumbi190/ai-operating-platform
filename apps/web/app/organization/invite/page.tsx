import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { resolveOrganizationRole } from '@/lib/auth/organization-role'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import InviteForm from './InviteForm'

export const dynamic = 'force-dynamic'

export default async function OrganizationInvitePage() {
  const operator = await resolvePlatformOperator()
  if (!operator.ok) return <main style={{ padding: 48 }}><h1>Åtkomst nekad</h1></main>
  const session = await createClient()
  const role = await resolveOrganizationRole(
    session as unknown as Parameters<typeof resolveOrganizationRole>[0],
    operator.userId,
  )
  if (!role.active || role.role !== 'owner')
    return <main style={{ padding: 48 }}><h1>Owner-behörighet krävs</h1></main>

  return <main style={{ minHeight: '100vh', background: '#0b1424', color: '#edf3fb', padding: 48, fontFamily: 'system-ui' }}>
    <div style={{ maxWidth: 580, margin: '0 auto' }}>
      <Link href="/organization" style={{ color: '#a9d4ff' }}>← Organisation</Link>
      <h1>Bjud in medarbetare</h1>
      <p>Collaborator får se projektens godkända information men kan inte ändra behörigheter eller utföra skyddade åtgärder.</p>
      {process.env.OMNIRA_COLLAB_INVITES_ENABLED === 'true'
        ? <InviteForm />
        : <p>Inbjudningar aktiveras när behörighetskontrollerna och inloggningsflödet är verifierade.</p>}
    </div>
  </main>
}
