import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import EditWorkflowClient from './EditWorkflowClient'
import type { Agent, WorkflowStep } from '@/lib/supabase/types'
import { ViewSelectionSync } from '@/components/platform/os'

export default async function EditWorkflowPage({
  params,
}: {
  params: { slug: string; id: string }
}) {
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, slug')
    .eq('slug', params.slug)
    .single()

  if (!project) notFound()

  const { data: workflow } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', params.id)
    .eq('project_id', project.id)
    .single()

  if (!workflow) notFound()

  const { data: agents } = await supabase
    .from('agents')
    .select('id, name, model')
    .eq('project_id', project.id)
    .order('name')

  return (
    <>
      {/* Atlas selection awareness — the open workflow IS the operator's selection. */}
      <ViewSelectionSync refs={[{ domain: 'workflows', id: workflow.id, label: workflow.name }]} />
      <EditWorkflowClient
        workflow={{
          id: workflow.id,
          name: workflow.name,
          description: workflow.description ?? '',
          steps: (workflow.steps as WorkflowStep[]) ?? [],
        }}
        agents={(agents ?? []) as Agent[]}
        slug={params.slug}
      />
    </>
  )
}
