import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { RunStatusBadge } from '@/components/platform/RunStatusBadge'
import { DreamStatus } from '@/components/platform/DreamStatus'
import type { RunStatus } from '@/lib/supabase/types'
import { Bot, GitBranch, Play, FileOutput, ArrowRight, Plus, Radio } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'
import { OSPage, OSLayer } from '@/components/platform/os'

export default async function ProjectPage({
  params,
}: {
  params: { slug: string }
}) {
  const supabase = await createClient()
  const { slug } = params

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!project) notFound()

  const [
    { data: agents, count: agentCount },
    { data: workflows, count: workflowCount },
    { data: recentRuns },
    { data: outputs, count: outputCount },
  ] = await Promise.all([
    supabase.from('agents').select('id', { count: 'exact' }).eq('project_id', project.id),
    supabase.from('workflows').select('id', { count: 'exact' }).eq('project_id', project.id),
    supabase
      .from('runs')
      .select('id, status, created_at, workflows(name)')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('outputs').select('id', { count: 'exact' }).eq('project_id', project.id),
  ])

  const stats = [
    { label: 'Agenter', value: agentCount ?? 0, icon: Bot, href: 'agents' },
    { label: 'Workflows', value: workflowCount ?? 0, icon: GitBranch, href: 'workflows' },
    { label: 'Utdata', value: outputCount ?? 0, icon: FileOutput, href: 'outputs' },
  ]

  return (
    <OSPage className="animate-fade-in">
      {/* HERO */}
      <OSLayer layer="hero" className="flex items-center gap-3">
        <span
          className="w-4 h-4 rounded-full shrink-0 mt-0.5"
          style={{ backgroundColor: project.color }}
        />
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="text-sm text-muted-foreground font-mono">{project.slug}</p>
        </div>
      </OSLayer>

      {/* OPERATIONAL · quick stats + actions */}
      <OSLayer layer="operational" className="space-y-5 lg:space-y-6">
      <div className="grid grid-cols-3 lg:grid-cols-3 3xl:grid-cols-4 gap-4 lg:gap-5">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Link
              key={stat.label}
              href={`/projects/${slug}/${stat.href}`}
              className="group rounded-xl border border-border bg-card p-5 hover:border-border/80 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <Icon className="w-5 h-5 text-muted-foreground" />
                <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="text-3xl font-bold">{stat.value}</div>
              <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
            </Link>
          )
        })}
      </div>

      {/* Quick actions */}
      <div className="flex gap-3">
        <Link
          href={`/projects/${slug}/agents/new`}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ny agent
        </Link>
        <Link
          href={`/projects/${slug}/workflows/new`}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nytt workflow
        </Link>
        <Link
          href={`/projects/${slug}/runs`}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Play className="w-4 h-4" />
          Kör workflow
        </Link>
        <Link
          href={`/projects/${slug}/media`}
          className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10 transition-colors"
        >
          <Radio className="w-4 h-4" />
          Media Pipeline
        </Link>
      </div>
      </OSLayer>

      {/* INTELLIGENCE · recent runs + dream cycle */}
      <OSLayer layer="intelligence" className="space-y-5 lg:space-y-6">
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Senaste körningar
          </h2>
          <Link
            href={`/projects/${slug}/runs`}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Visa alla →
          </Link>
        </div>

        {recentRuns && recentRuns.length > 0 ? (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Workflow</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Startad</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentRuns.map((run) => {
                  const workflow = Array.isArray(run.workflows) ? run.workflows[0] : run.workflows
                  return (
                    <tr key={run.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{workflow?.name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <RunStatusBadge status={run.status as RunStatus} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDistanceToNow(new Date(run.created_at), {
                          addSuffix: true,
                          locale: sv,
                        })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/projects/${slug}/runs/${run.id}`}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Visa →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Play className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Inga körningar ännu</p>
          </div>
        )}
      </section>

      {/* Dream Cycle */}
      <DreamStatus slug={slug} />
      </OSLayer>
    </OSPage>
  )
}
