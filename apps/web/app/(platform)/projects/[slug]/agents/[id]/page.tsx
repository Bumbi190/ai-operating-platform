import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getProjectBySlug } from '@/lib/project/get-project'
import { loadAgentDetail } from '@/lib/os/agent-detail'
import { AgentDetail } from '@/components/platform/vnext/AgentDetail'
import { ViewSelectionSync } from '@/components/platform/os'
import { OMNIRA_UI_COOKIE, isVNext, resolveUiGeneration } from '@/lib/ui/generation'
import EditAgentClient from './EditAgentClient'

/**
 * `/projects/[slug]/agents/[id]` — Agent Detail.
 *
 * This route used to render the edit form directly. It now renders the
 * inspection surface, and the form moved one level down to `./edit` — the SAME
 * `EditAgentClient`, reached through an explicit action. There is exactly one
 * agent editor in the codebase and this phase did not write a second.
 *
 * The project→agent scoping guard is unchanged: the project is resolved from
 * the slug and the agent lookup is filtered by `project_id`, so an agent from
 * another project cannot be opened under this project's URL.
 *
 * Legacy renders the editor exactly as it did before. The rollback path keeps
 * the functionality it had; the detail shell is a vNext surface.
 */
export default async function AgentDetailPage({
  params,
}: {
  params: { slug: string; id: string }
}) {
  const project = await getProjectBySlug(params.slug)
  if (!project) notFound()

  const cookieStore = await cookies()
  const generation = resolveUiGeneration({
    cookie: cookieStore.get(OMNIRA_UI_COOKIE)?.value ?? null,
  })

  if (!isVNext(generation)) {
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

  const model = await loadAgentDetail(params.id, {
    id: project.id,
    name: project.name,
    slug: params.slug,
    color: (project as { color?: string | null }).color ?? null,
  })
  if (!model) notFound()

  return (
    <>
      {/* Atlas selection awareness — the open agent IS the operator's selection. */}
      <ViewSelectionSync refs={[{ domain: 'agents', id: model.agent.id, label: model.agent.name }]} />
      <AgentDetail
        model={model}
        editHref={`/projects/${params.slug}/agents/${params.id}/edit`}
      />
    </>
  )
}
