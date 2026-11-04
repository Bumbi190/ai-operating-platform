import { prepareApprovedPosthogRead } from '@/lib/atlas/capability/posthog-approved-read'
import PosthogReview from './review'
export const dynamic = 'force-dynamic'
export default async function PosthogPage() {
  try {
    const proposal = await prepareApprovedPosthogRead({ projectId: process.env.POSTHOG_OMNIRA_PROJECT_ID })
    return <main className="mx-auto max-w-3xl p-6"><PosthogReview proposal={proposal} /><p className="mt-6"><a className="underline" href="/analytics/posthog/traffic">Besöksstatistik för Handlarbörsen</a></p></main>
  } catch {
    return <main className="mx-auto max-w-3xl p-6"><h1 className="text-2xl font-semibold">PostHog</h1><p className="mt-4">Logga in som projektägare för att granska anslutningen. Om du redan är inloggad behöver serverns projektkoppling kontrolleras.</p></main>
  }
}
