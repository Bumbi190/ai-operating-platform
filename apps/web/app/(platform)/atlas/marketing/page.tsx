import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { loadMarketingReview } from '@/lib/os/marketing-review'
import { MarketingReview, MarketingReviewLoading } from '@/components/platform/vnext/MarketingReview'
import { OMNIRA_UI_COOKIE, isVNext, resolveUiGeneration } from '@/lib/ui/generation'
import { MarketingLegacy } from './MarketingLegacy'

/**
 * `/atlas/marketing` — Marknadsgranskning, the review of campaign drafts.
 *
 * vNext shows the month window as it is — including a month with no plan —
 * gives every stored draft status its own lane, counts the drafts outside the
 * window instead of calling the review done, and keeps the controls this page
 * always had, posting to the same decision route. `?ui=legacy` renders the
 * previous body, moved verbatim into `MarketingLegacy`.
 *
 * The legacy branch returns before the vNext loader is reached, so a rollback
 * costs nothing and cannot fail on a read it does not use. The legacy body keeps
 * its own session guard and its own scoped reads; the vNext loader resolves the
 * session's scope through `resolveProjectAccess` and answers null when it
 * cannot, and a scope that cannot be resolved is a redirect rather than an empty
 * review that reads like nothing to decide.
 *
 * The registry declares this destination `projectMode: 'none'`, so there is no
 * `?project=` narrowing here.
 */
export const dynamic = 'force-dynamic'

export default async function MarketingReviewPage() {
  const cookieStore = await cookies()
  const generation = resolveUiGeneration({
    cookie: cookieStore.get(OMNIRA_UI_COOKIE)?.value ?? null,
  })

  if (!isVNext(generation)) return <MarketingLegacy />

  return (
    <Suspense fallback={<MarketingReviewLoading />}>
      <LoadedMarketingReview />
    </Suspense>
  )
}

async function LoadedMarketingReview() {
  const model = await loadMarketingReview()
  if (!model) redirect('/login')
  return <MarketingReview model={model} />
}
