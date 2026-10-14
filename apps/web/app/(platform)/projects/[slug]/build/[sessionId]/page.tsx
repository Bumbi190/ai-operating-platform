import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProjectBySlug } from '@/lib/project/get-project'
import { readBuildSession, WebsiteBuildError } from '@/lib/website-build/store'
import { BuildWorkspace } from '@/components/website-build/BuildWorkspace'
export default async function WebsiteBuildPage({ params }: { params: { slug: string; sessionId: string } }) {
  const project = await getProjectBySlug(params.slug)
  if (!project) notFound()
  const db = await createClient(), { data: { user } } = await db.auth.getUser()
  if (!user) notFound()
  try {
    const session = await readBuildSession(createAdminClient(), { userId: user.id, allowedProjectIds: [project.id] }, { projectId: project.id, sessionId: params.sessionId })
    const { data, error } = await db.from('website_build_sessions').select('brief').eq('id', session.sessionId).eq('project_id', project.id).maybeSingle()
    if (error || !data) return <p role="alert">Den sparade briefen kunde inte läsas. Försök igen.</p>
    return <BuildWorkspace key={session.sessionId} initialSession={session} projectSlug={project.slug} userId={user.id} brief={data.brief} />
  } catch (error) {
    if (error instanceof WebsiteBuildError && error.status < 500) notFound()
    return <p role="alert">Byggtjänsten kunde inte svara. Försök igen.</p>
  }
}
