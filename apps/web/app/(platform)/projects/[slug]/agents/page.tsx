import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Bot, Plus, Cpu } from 'lucide-react'
import { OSPage, OSLayer } from '@/components/platform/os'

export default async function AgentsPage({ params }: { params: { slug: string } }) {
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, slug')
    .eq('slug', params.slug)
    .single()

  if (!project) notFound()

  const { data: agents } = await supabase
    .from('agents')
    .select('*')
    .eq('project_id', project.id)
    .order('created_at')

  return (
    <OSPage className="animate-fade-in">
      <OSLayer layer="hero" className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Agenter</h1>
          <p className="text-sm text-muted-foreground mt-1">{project.name}</p>
        </div>
        <Link
          href={`/projects/${params.slug}/agents/new`}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ny agent
        </Link>
      </OSLayer>

      <OSLayer layer="operational">
      {agents && agents.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 3xl:grid-cols-3 gap-4 lg:gap-5">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              href={`/projects/${params.slug}/agents/${agent.id}`}
              className="group flex items-start gap-4 rounded-xl border border-border bg-card p-5 hover:border-border/80 hover:shadow-sm transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5 text-indigo-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{agent.name}</h3>
                  <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                    {agent.model}
                  </span>
                </div>
                {agent.description && (
                  <p className="text-sm text-muted-foreground line-clamp-1">{agent.description}</p>
                )}
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2 font-mono opacity-60">
                  {agent.system_prompt.slice(0, 120)}...
                </p>
              </div>
              <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                Redigera →
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-16 text-center">
          <Bot className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium mb-1">Inga agenter ännu</h3>
          <p className="text-sm text-muted-foreground mb-6">
            En agent är en AI med en specifik roll och systemprompt
          </p>
          <Link
            href={`/projects/${params.slug}/agents/new`}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Skapa första agenten
          </Link>
        </div>
      )}
      </OSLayer>
    </OSPage>
  )
}
