import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProjectBySlug } from '@/lib/project/get-project'
import { BuildStart } from '@/components/website-build/BuildStart'
export default async function WebsiteBuildStartPage({ params }: { params: { slug: string } }) {
  const project = await getProjectBySlug(params.slug)
  if (!project) notFound()
  const db = await createClient()
  const [agents, builds] = await Promise.all([
    db.from('agents').select('id,name,model').eq('project_id', project.id).order('name'),
    db.from('website_build_sessions').select('id,status,updated_at').eq('project_id', project.id).order('updated_at', { ascending: false }).limit(10),
  ])
  if (agents.error || builds.error) return <p role="alert">Byggvyn kunde inte läsas. Kontrollera att byggtjänsten har installerats och försök igen.</p>
  return <><BuildStart projectId={project.id} projectSlug={project.slug} agents={(agents.data ?? []).filter(agent => !/image|dall-e|flux|ideogram/i.test(agent.model || ''))} /><nav aria-label="Tidigare byggen"><h2>Tidigare byggen</h2>{builds.data?.map(build => <p key={build.id}><a href={`/projects/${encodeURIComponent(project.slug)}/build/${build.id}`}>Öppna bygge · {new Date(build.updated_at).toLocaleString('sv-SE')}</a></p>)}</nav></>
}
