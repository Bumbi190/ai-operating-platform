import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import EditAgentClient from './EditAgentClient'
import { getProjectBySlug } from '@/lib/project/get-project'

export default async function EditAgentPage({
  params,
}: {
  params: { slug: string; id: string }
}) {
  // Resolve the project from the slug, then scope the agent lookup to it so an
  // agent from another project can't be opened under this project's URL.
  const project = await getProjectBySlug(params.slug)
  if (!project) notFound()

  const supabase = await createClient()
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('id', params.id)
    .eq('project_id', project.id)
    .single()

  if (!agent) notFound()

  return <EditAgentClient agent={agent} slug={params.slug} />
}
