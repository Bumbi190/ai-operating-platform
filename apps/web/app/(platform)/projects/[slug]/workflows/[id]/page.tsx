import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import EditWorkflowClient from './EditWorkflowClient'
import type { Agent } from '@/lib/supabase/types'
import { parseWorkflowSteps } from '@/lib/supabase/json'
import { ViewSelectionSync } from '@/components/platform/os'
import { getProjectBySlug } from '@/lib/project/get-project'
import { loadWorkflowDetail } from '@/lib/os/project-workspace'
import { WorkflowDetail, WorkspaceReadError } from '@/components/platform/vnext/project-workspace/ProjectWorkspaceViews'
import { OMNIRA_UI_COOKIE, isVNext, resolveUiGeneration } from '@/lib/ui/generation'

export default async function WorkflowPage({
  params: paramsPromise,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const params = await paramsPromise
  const project = await getProjectBySlug(params.slug)
  if (!project) notFound()

  const cookieStore = await cookies()
  const generation = resolveUiGeneration({ cookie: cookieStore.get(OMNIRA_UI_COOKIE)?.value ?? null })
  if (!isVNext(generation)) return <WorkflowLegacy params={params} />

  const result = await loadWorkflowDetail(params.id, project)
  if (result.kind === 'not_found') notFound()
  if (result.kind === 'error') {
    return <WorkspaceReadError project={{ ...project, href: `/projects/${project.slug}` }} section="Workflow" />
  }

  return (
    <>
      <ViewSelectionSync refs={[{ domain: 'workflows', id: result.model.workflow.id, label: result.model.workflow.name }]} />
      <WorkflowDetail model={result.model} />
    </>
  )
}

async function WorkflowLegacy({
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
          steps: parseWorkflowSteps(workflow.steps),
        }}
        agents={(agents ?? []) as Agent[]}
        slug={params.slug}
      />
    </>
  )
}
