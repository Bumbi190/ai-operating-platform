import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { loadOrganisationModel } from '@/lib/os/organisation'
import { OrganisationView } from '@/components/platform/vnext/OrganisationView'
import { OrganisationLegacy } from './OrganisationLegacy'
import { OMNIRA_UI_COOKIE, isVNext, resolveUiGeneration } from '@/lib/ui/generation'

/**
 * `/organisation` — Andre → Atlas → projects → agents.
 *
 * Hierarchy and membership. The Intelligence Graph owns relationships,
 * dependencies and knowledge flow; nothing of that kind is loaded here.
 *
 * The model is scoped the same way every other Atlas surface is —
 * `getAllowedProjectIds` then `scopeProjectFilter`, inside
 * `loadOrganisationModel` — so an empty allow-list resolves to an impossible id
 * and the queries stay fail-closed.
 */
export const dynamic = 'force-dynamic'

export default async function OrganisationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cookieStore = await cookies()
  const generation = resolveUiGeneration({
    cookie: cookieStore.get(OMNIRA_UI_COOKIE)?.value ?? null,
  })

  const model = await loadOrganisationModel()
  if (!model) redirect('/login')

  // The spatial hierarchy is a vNext surface. Legacy gets the same scoped model
  // as a plain nested list in its own chrome — the rollback path has never had
  // this route, and a 404 there would be worse than a plain page.
  if (!isVNext(generation)) return <OrganisationLegacy model={model} />

  return <OrganisationView model={model} />
}
