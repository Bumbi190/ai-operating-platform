/**
 * /intelligence/graph — Omnira Intelligence Graph.
 *
 * vNext renders the graph in the vNext shell: the same authenticated routes,
 * the same navigation state and the same canvas, with the snapshot named for
 * what it is and every relation worded after its source. `?ui=legacy` renders
 * the previous body, moved verbatim into `IntelligenceGraphLegacy`.
 *
 * Auth: enforced by the (platform) layout (redirects to /login without a
 * session) AND by every /api/intelligence/graph/* route the client calls.
 * The page itself carries no data — everything arrives through the
 * authenticated API, already validated and project-scoped server-side. The UI
 * generation is a presentation choice only; it grants and scopes nothing.
 */

import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { IntelligenceGraphVNext } from '@/components/platform/vnext/IntelligenceGraphVNext'
import { OMNIRA_UI_COOKIE, isVNext, resolveUiGeneration } from '@/lib/ui/generation'
import { IntelligenceGraphLegacy } from './IntelligenceGraphLegacy'

export const metadata: Metadata = {
  title: 'Intelligence Graph · Omnira',
}

export default async function IntelligenceGraphPage() {
  const cookieStore = await cookies()
  const generation = resolveUiGeneration({
    cookie: cookieStore.get(OMNIRA_UI_COOKIE)?.value ?? null,
  })

  if (!isVNext(generation)) return <IntelligenceGraphLegacy />

  return <IntelligenceGraphVNext />
}
