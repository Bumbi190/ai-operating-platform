import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadReviewQueue } from '@/lib/os/review-queue'
import { ReviewQueue, ReviewQueueLoading } from '@/components/platform/vnext/ReviewQueue'
import { OMNIRA_UI_COOKIE, isVNext, resolveUiGeneration } from '@/lib/ui/generation'
import { ApprovalsLegacy } from './ApprovalsLegacy'

/**
 * `/approvals` — Granskningar, the global review queue.
 *
 * vNext renders the queue across every project the session owns; `?ui=legacy`
 * renders the previous body, moved verbatim into `ApprovalsLegacy`. Both start
 * from the same guard — a signed-in session — and the legacy branch returns
 * before the queue loader is reached, so a rollback costs nothing and cannot
 * fail on a read it does not use.
 *
 * `?project=<slug>` narrows the queue. That is the shape the nav registry
 * itself produces for this destination, and narrowing only ever removes rows:
 * the read is RLS-bound, so it cannot reach a project the session does not own.
 */
export const dynamic = 'force-dynamic'

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams?: { project?: string | string[] }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cookieStore = await cookies()
  const generation = resolveUiGeneration({
    cookie: cookieStore.get(OMNIRA_UI_COOKIE)?.value ?? null,
  })

  if (!isVNext(generation)) return <ApprovalsLegacy />

  const raw = searchParams?.project
  const projectSlug = Array.isArray(raw) ? raw[0] ?? null : raw ?? null

  return (
    <Suspense fallback={<ReviewQueueLoading />}>
      <LoadedReviewQueue projectSlug={projectSlug} />
    </Suspense>
  )
}

async function LoadedReviewQueue({ projectSlug }: { projectSlug: string | null }) {
  const model = await loadReviewQueue({ projectSlug })
  return <ReviewQueue model={model} />
}
