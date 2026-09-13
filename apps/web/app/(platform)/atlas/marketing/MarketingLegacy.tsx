/**
 * `/atlas/marketing` — the legacy marketing review body, moved verbatim.
 *
 * This file is the rollback target for `?ui=legacy`. Nothing in it was
 * rewritten: the body below — its own doc comment included — is the previous
 * page byte-for-byte, with exactly two mechanical edits: the segment config
 * moved to `page.tsx`, which owns it for both generations, and the default
 * export became a named one so the branch can render it. The tests pin that
 * with a hash.
 *
 * `MarketingReviewClient.tsx` stays where it is, unchanged; this body imports it.
 *
 * Do not improve anything here — including the "Allt granskat" empty state that
 * Phase 16 found shows while undecided drafts sit outside the month window, and
 * the queue grouping that folds `returned` and `guard_failed` into "Avvisade".
 * A rollback that renders something other than what it replaced is not a
 * rollback.
 */
/**
 * Marketing Review — Action Center för Familje-Stundens Marketing Engine (Fas 4).
 *
 * En inbox för EN operatör: granska utkast (Väntar/Godkända/Avvisade), fatta
 * snabba beslut (Godkänn / Skicka tillbaka / Redigera). Fokus aktiv + nästa månad.
 * Read-only datahämtning här; beslut sker via /api/marketing/approvals.
 *
 * ⛔ Endast Familje-Stunden. Ingen publicering/Meta/scheduling/bildgenerering.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAllowedProjectIds } from '@/lib/atlas/isolation'
import { redirect } from 'next/navigation'
import { OSPage, OSLayer } from '@/components/platform/os'
import { getMarketingReview } from '@/lib/marketing/review'
import { MarketingReviewClient } from './MarketingReviewClient'

export async function MarketingLegacy() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const allowedProjectIds = await getAllowedProjectIds(db, user.id)
  const review = await getMarketingReview(db, allowedProjectIds)

  return (
    <OSPage density="comfortable">
      <OSLayer layer="hero">
        <MarketingReviewClient initial={review} />
      </OSLayer>
    </OSPage>
  )
}
