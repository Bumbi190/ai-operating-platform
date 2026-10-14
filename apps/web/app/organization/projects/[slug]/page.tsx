import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getProjectBySlug } from '@/lib/project/get-project'
import { loadOrganizationProjectCommandCenter } from '@/lib/os/organization-command-center-reader'
import { isHandlarborsenProject } from '@/lib/os/project-command-center'
import { loadHandlarborsenMarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-read'
import { loadHandlarborsenTraffic } from '@/lib/atlas/project-analytics/handlarborsen-posthog-traffic'
import { HandlarborsenOverview } from '@/components/platform/vnext/HandlarborsenOverview'
import { ProjectCommandCenter } from '@/components/platform/vnext/ProjectCommandCenter'
import { HandlarborsenCollaboratorWorkflows } from '../HandlarborsenCollaboratorWorkflows'
import { createClient } from '@/lib/supabase/server'
import { resolveOrganizationRole } from '@/lib/auth/organization-role'
import { canCollaborateOnProject } from '@/lib/auth/collaborator-project-permissions'

export const dynamic = 'force-dynamic'

export default async function OrganizationProjectPage({ params }: { params: { slug: string } }) {
  const model = await loadOrganizationProjectCommandCenter(params.slug)
  if (!model) notFound()

  // The UI is shared. Workflow metadata controls are shown only for the
  // independently verified Collaborator and canonical Handlarbörsen identity.
  // Every write endpoint repeats the authorization; this UI is not a gate.
  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
  const memberRole = await resolveOrganizationRole(
    session as unknown as Parameters<typeof resolveOrganizationRole>[0], user?.id,
  )
  // Owners entering via the organization map retain their own project workspace.
  // The session-bound RLS read must confirm this exact project before redirect.
  if (memberRole.active && memberRole.role === 'owner') {
    const ownedProject = await getProjectBySlug(params.slug)
    if (ownedProject?.id === model.project.id) redirect('/projects/' + encodeURIComponent(ownedProject.slug))
  }
  const mayWorkWithHandlarborsen = canCollaborateOnProject(
    memberRole, model.project, 'operate_workflow',
  )

  // Reuse the Owner's visual overview through the SAME project-bound, verified
  // marketplace report reader. Never expose save selectors, report links or
  // the owner-specific leadership shortcuts to a collaborator.
  let overview: React.ReactNode = null
  if (isHandlarborsenProject(model.project)) {
    const report = await loadHandlarborsenMarketplaceReport(model.project, {
      allowedProjectIds: [model.project.id],
    })
    if (report.status === 'ok') {
      const traffic = await loadHandlarborsenTraffic(model.project, {
        allowedProjectIds: [model.project.id],
      })
      overview = <HandlarborsenOverview
        report={report.report}
        reportHref={null}
        traffic={traffic}
      />
    }
  }

  return (
    <main className="min-h-screen bg-[#0b1424] text-slate-50">
      <nav className="px-6 pt-7">
        <Link href="/organization" className="text-sm text-sky-300">← Alla projekt</Link>
      </nav>
      {/* Existing form controls inherit disabled; server-side links and secrets
          are removed by the organization reader BEFORE serialization. */}
      <fieldset disabled className="m-0 min-w-0 border-0 p-0" aria-label="Projekt i bevakningsläge">
        <ProjectCommandCenter model={model} overview={overview} />
      </fieldset>
      {mayWorkWithHandlarborsen && (
        <div className="mx-auto max-w-6xl px-6 pb-16">
          <HandlarborsenCollaboratorWorkflows />
        </div>
      )}
    </main>
  )
}
