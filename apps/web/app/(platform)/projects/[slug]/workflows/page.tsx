import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { GitBranch, Plus, Play } from 'lucide-react'
import { OSPage, OSLayer } from '@/components/platform/os'
import { getProjectBySlug } from '@/lib/project/get-project'

export default async function WorkflowsPage({ params }: { params: { slug: string } }) {
  const project = await getProjectBySlug(params.slug)
  if (!project) notFound()

  const supabase = await createClient()
  const { data: workflows } = await supabase
    .from('workflows')
    .select('*, runs(id, status, created_at)')
    .eq('project_id', project.id)
    .order('created_at')

  return (
    <OSPage className="animate-fade-in">
      <OSLayer layer="hero" className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Workflows</h1>
          <p className="text-sm text-muted-foreground mt-1">{project.name}</p>
        </div>
        <Link
          href={`/projects/${params.slug}/workflows/new`}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nytt workflow
        </Link>
      </OSLayer>

      <OSLayer layer="operational">
      {workflows && workflows.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 3xl:grid-cols-3 gap-4 lg:gap-5">
          {workflows.map((workflow) => {
            const stepCount = Array.isArray(workflow.steps) ? workflow.steps.length : 0
            const lastRun = workflow.runs?.[0]
            return (
              <div
                key={workflow.id}
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-5"
              >
                <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                  <GitBranch className="w-5 h-5 text-violet-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-semibold">{workflow.name}</h3>
                    <span className="text-xs text-muted-foreground">
                      {stepCount} {stepCount === 1 ? 'steg' : 'steg'}
                    </span>
                  </div>
                  {workflow.description && (
                    <p className="text-sm text-muted-foreground line-clamp-1">{workflow.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/projects/${params.slug}/workflows/${workflow.id}`}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                  >
                    Redigera
                  </Link>
                  <Link
                    href={`/projects/${params.slug}/workflows/${workflow.id}/run`}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    Kör
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-16 text-center">
          <GitBranch className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium mb-1">Inga workflows ännu</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Ett workflow är en sekvens av agentsteg som producerar ett resultat
          </p>
          <Link
            href={`/projects/${params.slug}/workflows/new`}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Skapa första workflow
          </Link>
        </div>
      )}
      </OSLayer>
    </OSPage>
  )
}
