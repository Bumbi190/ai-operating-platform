import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { loadMoney } from '@/lib/os/money'
import { MoneyOverview, MoneyOverviewLoading } from '@/components/platform/vnext/MoneyOverview'
import { OMNIRA_UI_COOKIE, isVNext, resolveUiGeneration } from '@/lib/ui/generation'
import { RevenueLegacy } from './RevenueLegacy'

/**
 * `/revenue` — Pengar.
 *
 * vNext renders the operator's financial surface: what has cost money, what the
 * budget gate's own figures are, and — beside every limit — whether that limit
 * is enforced. `?ui=legacy` renders the previous body, moved verbatim into
 * `RevenueLegacy`.
 *
 * The legacy branch returns before the vNext loader is reached, so a rollback
 * costs nothing and cannot fail on a read it does not use. The legacy body keeps
 * its own session guard and its own service-role reads; the vNext loader
 * resolves the session's scope through `resolveProjectAccess` and answers null
 * when it cannot, and a scope that cannot be resolved is a redirect rather than
 * a page of zeroes that reads like a platform that spent nothing.
 *
 * `?project=<slug>` narrows the view — the shape the nav registry declares for
 * this destination. Narrowing only ever removes ids: a slug the session does not
 * own narrows to nothing.
 */
export const dynamic = 'force-dynamic'

export default async function RevenuePage({
  searchParams,
}: {
  searchParams?: { project?: string | string[] }
}) {
  const cookieStore = await cookies()
  const generation = resolveUiGeneration({
    cookie: cookieStore.get(OMNIRA_UI_COOKIE)?.value ?? null,
  })

  if (!isVNext(generation)) return <RevenueLegacy />

  const raw = searchParams?.project
  const projectSlug = Array.isArray(raw) ? raw[0] ?? null : raw ?? null

  return (
    <Suspense fallback={<MoneyOverviewLoading />}>
      <LoadedMoney projectSlug={projectSlug} />
    </Suspense>
  )
}

// The default is for React's dev-time stack probing, which calls the component
// with no props to build a component frame. The page always passes one.
async function LoadedMoney(
  { projectSlug }: { projectSlug: string | null } = { projectSlug: null },
) {
  const model = await loadMoney({ projectSlug })
  if (!model) redirect('/login')
  return <MoneyOverview model={model} />
}
