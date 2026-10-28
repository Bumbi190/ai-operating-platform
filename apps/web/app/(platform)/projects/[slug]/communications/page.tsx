import { notFound } from 'next/navigation'
import { getProjectBySlug } from '@/lib/project/get-project'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { isHandlarborsenProject } from '@/lib/os/project-command-center'
import { createAdminClient } from '@/lib/supabase/admin'
import { readHandlarborsenSalesOverview } from '@/lib/atlas/project-analytics/handlarborsen-sales-overview'
import { readHandlarborsenReplyLifecycle } from '@/lib/atlas/project-analytics/handlarborsen-reply-lifecycle'
import { buildCommunicationsOverview } from '@/lib/handlarborsen/communications-overview'
import { HandlarborsenCommunications } from '@/components/platform/vnext/HandlarborsenCommunications'

export const dynamic = 'force-dynamic'

/**
 * Owner-only, fixed-project status page. No mail text, recipient or internal
 * job ID is loaded. Reuse the verified aggregate and lifecycle readers, and
 * keep their independent observation times visible (non-atomic reads).
 */
export default async function CommunicationsPage({ params }: { params: { slug: string } }) {
  const project = await getProjectBySlug(params.slug)
  if (!project || !isHandlarborsenProject(project)) notFound()

  // Service-role client may be created ONLY after session + owner allowlist
  // checks. Each existing reader repeats its own owner check before any reads.
  const access = await resolveProjectAccess()
  if (!access.ok || !access.allowedProjectIds.includes(project.id)) notFound()

  const db = createAdminClient()
  const context = { db, userId: access.userId, allowedProjectIds: access.allowedProjectIds }
  const [sales, reply] = await Promise.all([
    readHandlarborsenSalesOverview(context),
    readHandlarborsenReplyLifecycle(context),
  ])
  if (sales.status === 'not_permitted' || reply.status === 'not_permitted') notFound()

  return <HandlarborsenCommunications
    projectSlug={project.slug}
    view={buildCommunicationsOverview(sales, reply)}
  />
}
