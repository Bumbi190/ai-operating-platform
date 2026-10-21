import {notFound} from 'next/navigation'
import {getProjectBySlug} from '@/lib/project/get-project'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {isLegacyNewsPipelineProject} from '@/lib/project/legacy-news-pipeline'

// This legacy news/manus UI triggers The Prompt's paid provider pipeline.
// Never mount it for a Familje-Stunden (or unrelated) project.
export default async function NewsProjectScopeLayout({
  children, params,
}: {children: React.ReactNode; params: {slug: string}}) {
  const [project, access] = await Promise.all([
    getProjectBySlug(params.slug),
    resolveProjectAccess(),
  ])
  if (!project || !access.ok || !access.allowedProjectIds.includes(project.id) ||
      !isLegacyNewsPipelineProject(project.slug)) {
    notFound()
  }
  return <>{children}</>
}
