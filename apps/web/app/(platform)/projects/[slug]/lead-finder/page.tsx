import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProjectBySlug } from '@/lib/project/get-project'
import { isHandlarborsenProject } from '@/lib/os/project-command-center'
import { getReadiness } from '@/lib/handlarborsen/lead-finder/readiness'
import { loadKnownContactsForOwner } from '@/lib/handlarborsen/lead-finder/known-contacts-server'
import { knownContactSummary, reconcileSavedCandidates } from '@/lib/handlarborsen/lead-finder/known-contacts'
import { loadSavedCandidatesForOwner } from '@/lib/handlarborsen/lead-finder/saved-candidates-server'
import { loadLocalReviewForOwner } from '@/lib/handlarborsen/lead-finder/local-review-server'
import type { LocalReviewState } from '@/lib/handlarborsen/lead-finder/local-review'
import { HandlarborsenLeadFinder } from '@/components/platform/vnext/HandlarborsenLeadFinder'
import { loadArchivedLeadResearchForOwner } from '@/lib/handlarborsen/lead-finder/research-archive-server'
import type { ArchiveReview } from '@/lib/handlarborsen/lead-finder/research-archive'

export const dynamic = 'force-dynamic'

/** RLS project, exact Handlarbörsen identity, verified owner for local/upload UI. */
export default async function LeadFinderPage({ params, searchParams }: {
  params: { slug: string }
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const project = await getProjectBySlug(params.slug)
  if (!project || !isHandlarborsenProject(project)) notFound()

  const [contacts, candidates] = await Promise.all([
    loadKnownContactsForOwner(project.id),
    loadSavedCandidatesForOwner(project.id),
  ])

  let localReview: LocalReviewState = { status: 'disabled' }
  let importPreviewEnabled = false
  let importWriteEnabled = false
  let researchEnabled = false
  let researchExtractEnabled = false
  let archivedResearch: ArchiveReview = { status: 'disabled' }
  const localFlag = process.env.NODE_ENV === 'development' && process.platform === 'win32' &&
    process.env.HB_LEADFINDER_LOCAL_REVIEW_ENABLED === 'true'
  const importFlag = process.env.HB_LEADFINDER_IMPORT_PREVIEW_ENABLED === 'true'

  // RLS project visibility alone does not authorize reading personal files
  // or showing import controls. Only the verified project owner is allowed.
  if (localFlag || importFlag) {
    const sessionDb = await createClient()
    const { data: { user }, error: authError } = await sessionDb.auth.getUser()
    if (!authError && user) {
      const { data: ownedProject, error: ownerError } = await sessionDb
        .from('projects')
        .select('id')
        .eq('id', project.id)
        .eq('owner_id', user.id)
        .maybeSingle()
      if (!ownerError && ownedProject) {
        if (localFlag) localReview = await loadLocalReviewForOwner(project.id)
        importPreviewEnabled = importFlag
        importWriteEnabled = importFlag && process.env.HB_LEADFINDER_IMPORT_WRITE_ENABLED === 'true'
        researchEnabled = importFlag && process.env.VERCEL_ENV !== 'production' && process.env.HB_LEADFINDER_RESEARCH_ENABLED === 'true' &&
          !!process.env.TAVILY_API_KEY?.trim()
        researchExtractEnabled = researchEnabled && process.env.HB_LEADFINDER_EXTRACT_ENABLED === 'true'
        if (importFlag && process.env.VERCEL_ENV !== 'production' &&
          process.env.HB_LEADFINDER_RESEARCH_ARCHIVE_ENABLED === 'true')
          archivedResearch = await loadArchivedLeadResearchForOwner(project.id, contacts)
      }
    }
  }

  const first = (value: string | string[] | undefined) =>
    typeof value === 'string' ? value : Array.isArray(value) ? (value[0] ?? '') : ''

  return <HandlarborsenLeadFinder
    slug={project.slug}
    readiness={getReadiness()}
    known={knownContactSummary(contacts)}
    saved={reconcileSavedCandidates(candidates, contacts)}
    search={first(searchParams?.q)}
    filter={first(searchParams?.status) || 'all'}
    localReview={localReview}
    localSearch={first(searchParams?.local_q)}
    localFilter={first(searchParams?.local_filter) || 'all'}
    importPreviewEnabled={importPreviewEnabled}
    importWriteEnabled={importWriteEnabled}
    researchEnabled={researchEnabled}
    researchExtractEnabled={researchExtractEnabled}
    archivedResearch={archivedResearch}
  />
}
