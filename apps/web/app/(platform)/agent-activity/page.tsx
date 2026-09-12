import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { loadActivity } from '@/lib/os/activity'
import { ActivityStream, ActivityStreamLoading } from '@/components/platform/vnext/ActivityStream'
import { OMNIRA_UI_COOKIE, isVNext, resolveUiGeneration } from '@/lib/ui/generation'
import { AgentActivityLegacy } from './AgentActivityLegacy'

/**
 * `/agent-activity` — Aktivitet.
 *
 * vNext renders the operator's chronological activity surface: what needs a
 * person, what is running, and what has happened, each entry carrying the way
 * back to the row it came from. `?ui=legacy` renders the previous body, moved
 * verbatim into `AgentActivityLegacy`.
 *
 * The legacy branch returns before the vNext loader is reached, so a rollback
 * costs nothing and cannot fail on a read it does not use. The legacy body
 * keeps its own session guard and its own service-role read; the vNext loader
 * answers null when there is no session, and a scope that cannot be resolved is
 * a redirect rather than a page of zeroes that reads like a quiet platform.
 *
 * `?project=<slug>` narrows the view. That is the shape the nav registry
 * produces for this destination (`projectMode: 'query'`), and narrowing only
 * ever removes rows: the read is RLS-bound, so it cannot reach a project the
 * session does not own.
 */
export const dynamic = 'force-dynamic'

export default async function AgentActivityPage({
  searchParams,
}: {
  searchParams?: { project?: string | string[] }
}) {
  const cookieStore = await cookies()
  const generation = resolveUiGeneration({
    cookie: cookieStore.get(OMNIRA_UI_COOKIE)?.value ?? null,
  })

  if (!isVNext(generation)) return <AgentActivityLegacy />

  const raw = searchParams?.project
  const projectSlug = Array.isArray(raw) ? raw[0] ?? null : raw ?? null

  return (
    <Suspense fallback={<ActivityStreamLoading />}>
      <LoadedActivity projectSlug={projectSlug} />
    </Suspense>
  )
}

// The default is for React's dev-time stack probing, which calls the component
// with no props to build a component frame. The page always passes one.
async function LoadedActivity(
  { projectSlug }: { projectSlug: string | null } = { projectSlug: null },
) {
  const model = await loadActivity({ projectSlug })
  if (!model) redirect('/login')
  return <ActivityStream model={model} />
}
