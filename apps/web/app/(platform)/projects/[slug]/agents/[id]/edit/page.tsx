import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProjectBySlug } from '@/lib/project/get-project'
import { ViewSelectionSync } from '@/components/platform/os'
import EditAgentClient from '../EditAgentClient'

/**
 * `/projects/[slug]/agents/[id]/edit` — the agent editor.
 *
 * The SAME `EditAgentClient` the route rendered before Agent Detail existed,
 * moved one level down and reached through an explicit action. Nothing about
 * the form, its validation or its mutation changed — this file only gives it a
 * URL of its own so inspection and configuration stop sharing one.
 *
 * The scoping guard is the one the parent route has always had.
 */
export default async function EditAgentPage({
  params,
}: {
  params: { slug: string; id: string }
}) {
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

  return (
    <>
      <ViewSelectionSync refs={[{ domain: 'agents', id: agent.id, label: agent.name }]} />
      <EditAgentClient agent={agent} slug={params.slug} />
    </>
  )
}
