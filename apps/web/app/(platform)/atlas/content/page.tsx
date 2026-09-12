import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { loadContentCenter } from '@/lib/os/content-center'
import { ContentCenter, ContentCenterLoading } from '@/components/platform/vnext/ContentCenter'
import { OMNIRA_UI_COOKIE, isVNext, resolveUiGeneration } from '@/lib/ui/generation'
import { ContentLegacy } from './ContentLegacy'

/**
 * `/atlas/content` — Content Center, the editorial queue.
 *
 * vNext renders every stored status in its own lane, reports where stored
 * fields contradict each other, and offers the one existing action this page
 * always had — the Generate Article drawer, mounted unchanged. Review, publish
 * and hero images stay on the article's own page. `?ui=legacy` renders the
 * previous body, moved verbatim into `ContentLegacy`.
 *
 * The legacy branch returns before the vNext loader is reached, so a rollback
 * costs nothing and cannot fail on a read it does not use. The legacy body keeps
 * its own session guard and its own scoped reads; the vNext loader resolves the
 * session's scope through `resolveProjectAccess` and answers null when it
 * cannot, and a scope that cannot be resolved is a redirect rather than an empty
 * queue that reads like nothing to review.
 *
 * The registry declares this destination `projectMode: 'none'`, so there is no
 * `?project=` narrowing here.
 */
export const dynamic = 'force-dynamic'

export default async function ContentCenterPage() {
  const cookieStore = await cookies()
  const generation = resolveUiGeneration({
    cookie: cookieStore.get(OMNIRA_UI_COOKIE)?.value ?? null,
  })

  if (!isVNext(generation)) return <ContentLegacy />

  return (
    <Suspense fallback={<ContentCenterLoading />}>
      <LoadedContentCenter />
    </Suspense>
  )
}

async function LoadedContentCenter() {
  const model = await loadContentCenter()
  if (!model) redirect('/login')
  return <ContentCenter model={model} />
}
