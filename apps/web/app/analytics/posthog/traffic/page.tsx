import { resolveProjectAccess } from '@/lib/auth/project-access'
import { loadHandlarborsenTraffic } from '@/lib/atlas/project-analytics/handlarborsen-posthog-traffic'
import { HANDLARBORSEN_PROJECT_ID, HANDLARBORSEN_PROJECT_SLUG } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { HandlarborsenPosthogTraffic } from '@/components/platform/vnext/HandlarborsenPosthogTraffic'
export const dynamic = 'force-dynamic'
export default async function TrafficPage() {
  const access = await resolveProjectAccess()
  const traffic = access.ok ? await loadHandlarborsenTraffic(
    { id: HANDLARBORSEN_PROJECT_ID, slug: HANDLARBORSEN_PROJECT_SLUG },
    { allowedProjectIds: access.allowedProjectIds },
  ) : null
  return <main className="mx-auto max-w-5xl space-y-5 p-6">
    <a href="/analytics/posthog" className="underline">PostHog-anslutning</a>
    {traffic ? <HandlarborsenPosthogTraffic traffic={traffic} /> : <p>Logga in som projektägare för att se trafikstatistiken.</p>}
    <p>Registreringskonvertering visas inte ännu: någon verifierad registreringshändelse är inte kopplad till rapporten.</p>
  </main>
}
