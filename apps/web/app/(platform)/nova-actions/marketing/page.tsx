import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CampaignLaunch } from './CampaignLaunch'

/**
 * Nova hands off an operator request to an authenticated review surface.
 * No GET request, query string or desktop token creates a marketing run.
 * Only a second, explicit UI action may invoke the existing protected API.
 */
export const dynamic = 'force-dynamic'

export default async function NovaMarketingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <CampaignLaunch />
}
