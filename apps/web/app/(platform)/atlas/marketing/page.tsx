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
import { redirect } from 'next/navigation'
import { OSPage, OSLayer } from '@/components/platform/os'
import { getMarketingReview } from '@/lib/marketing/review'
import { MarketingReviewClient } from './MarketingReviewClient'

export const dynamic = 'force-dynamic'

export default async function MarketingReviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const review = await getMarketingReview(db)

  return (
    <OSPage density="comfortable">
      <OSLayer layer="hero">
        <MarketingReviewClient initial={review} />
      </OSLayer>
    </OSPage>
  )
}
