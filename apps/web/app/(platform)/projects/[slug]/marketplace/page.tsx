import { notFound } from 'next/navigation'
import { getProjectBySlug } from '@/lib/project/get-project'
import { loadHandlarborsenMarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-read'
import { HandlarborsenMarketplaceReport } from '@/components/platform/vnext/HandlarborsenMarketplaceReport'

export const dynamic = 'force-dynamic'

/**
 * `/projects/handlarborsen/marketplace` — the latest stored marketplace report.
 *
 * The project is resolved through the RLS-bound `getProjectBySlug`, so a slug the
 * session does not own and one that does not exist are the same 404. That resolved
 * project is then the allow-list handed to the reader, which refuses anything that is
 * not the verified Handlarbörsen identity. The snapshots table is service-role only;
 * this page never reads it directly and the browser never reaches it.
 */
export default async function MarketplaceReportPage({ params }: { params: { slug: string } }) {
  const project = await getProjectBySlug(params.slug)
  if (!project) notFound()

  const result = await loadHandlarborsenMarketplaceReport(project, { allowedProjectIds: [project.id] })
  if (result.status === 'not_permitted') notFound()

  return <HandlarborsenMarketplaceReport slug={project.slug} name={project.name} report={result.report} />
}
