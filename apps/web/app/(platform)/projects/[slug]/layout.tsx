import { notFound } from 'next/navigation'
import { getProjectBySlug } from '@/lib/project/get-project'
import { ProjectProvider } from '@/lib/project/context'

// ─────────────────────────────────────────────────────────────────────────────
//  Project segment layout
//  ─────────────────────────────────────────────────────────────────────────────
//  Single source of truth for the active project. Resolves the project once per
//  request (getProjectBySlug is React-cached, so child pages that call it again
//  reuse this round-trip) and exposes its identity to client children via
//  ProjectProvider. 404s here when the slug doesn't resolve, so no child route
//  can ever render against a missing/wrong project.
// ─────────────────────────────────────────────────────────────────────────────

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { slug: string }
}) {
  const project = await getProjectBySlug(params.slug)
  if (!project) notFound()

  return (
    <ProjectProvider
      value={{
        projectId: project.id,
        projectSlug: project.slug,
        projectName: project.name,
        projectColor: project.color,
      }}
    >
      {children}
    </ProjectProvider>
  )
}
