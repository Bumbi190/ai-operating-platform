import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { RunStatusBadge } from '@/components/platform/RunStatusBadge'
import type { RunStatus } from '@/lib/supabase/types'
import {
  Bot,
  GitBranch,
  Play,
  Plus,
  ArrowRight,
  Zap,
  CheckCircle2,
  Activity,
  Layers,
  AlertTriangle,
  Clock,
  ClipboardCheck,
  TrendingUp,
  Cpu,
  Shield,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'

export default async function DashboardPage() {
  const supabase = await createClient()

  const [
    { data: projects },
    { data: recentRuns },
    { data: agents },
    { data: workflows },
    { count: totalRuns },
    { count: doneRuns },
    { count: failedRuns },
    { count: runningRuns },
    { count: pendingApprovals },
  ] = await Promise.all([
    (supabase.from('projects') as any).select('*').order('created_at'),
    (supabase.from('runs') as any)
      .select(
        'id, status, created_at, started_at, finished_at, workflow_id, workflows(name), projects(name, slug, color)',
      )
      .order('created_at', { ascending: false })
      .limit(10),
    (supabase.from('agents') as any).select('id, project_id'),
    (supabase.from('workflows') as any).select('project_id'),
    (supabase.from('runs') as any).select('*', { count: 'exact', head: true }),
    (supabase.from('runs') as any).select('*', { count: 'exact', head: true }).eq('status', 'done'),
    (supabase.from('runs') as any).select('*', { count: 'exact', head: true }).eq('status', 'failed'),
    (supabase.from('runs') as any).select('*', { count: 'exact', head: true }).eq('status', 'running'),
    (supabase.from('approvals') as any).select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  const successRate =
    totalRuns && totalRuns > 0
      ? Math.round(((doneRuns ?? 0) / totalRuns) * 100)
      : 0

  const failRate =
    totalRuns && totalRuns > 0
      ? Math.round(((failedRuns ?? 0) / totalRuns) * 100)
      : 0

  const systemHealthScore = Math.max(0, 100 - failRate * 2)
  const healthColor =
    systemHealthScore >= 90
      ? { text: 'text-emerald-400', bg: 'bg-emerald-500', label: 'OPTIMAL', dim: 'bg-emerald-500/10 border-emerald-500/20' }
      : systemHealthScore >= 70
      ? { text: 'text-amber-400', bg: 'bg-amber-500', label: 'DEGRADED', dim: 'bg-amber-500/10 border-amber-500/20' }
      : { text: 'text-red-400', bg: 'bg-red-500', label: 'CRITICAL', dim: 'bg-red-500/10 border-red-500/20' }

  // Per-project counts
  const agentsByProject: Record<string, number> = (agents ?? []).reduce(
    (acc: Record<string, number>, a: any) => { acc[a.project_id] = (acc[a.project_id] ?? 0) + 1; return acc },
    {},
  )
  const workflowsByProject: Record<string, number> = (workflows ?? []).reduce(
    (acc: Record<string, number>, w: any) => { acc[w.project_id] = (acc[w.project_id] ?? 0) + 1; return acc },
    {},
  )

  const healthMetrics = [
    {
      label: 'System Health',
      value: `${systemHealthScore}%`,
      sub: healthColor.label,
      icon: Shield,
      color: healthColor.text,
      bg: healthColor.dim,
      pulse: systemHealthScore < 90,
    },
    {
      label: 'Success Rate',
      value: `${successRate}%`,
      sub: `${doneRuns ?? 0} av ${totalRuns ?? 0} körningar`,
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
    },
    {
      label: 'Misslyckade',
      value: failedRuns ?? 0,
      sub: failRate > 0 ? `${failRate}% av totalt` : 'Inga fel',
      icon: AlertTriangle,
      color: (failedRuns ?? 0) > 0 ? 'text-red-400' : 'text-zinc-500',
      bg: (failedRuns ?? 0) > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-zinc-500/5 border-zinc-700/30',
    },
    {
      label: 'Aktiva körningar',
      value: runningRuns ?? 0,
      sub: (runningRuns ?? 0) > 0 ? 'Pågår just nu' : 'Ingen aktiv',
      icon: Activity,
      color: (runningRuns ?? 0) > 0 ? 'text-blue-400' : 'text-zinc-500',
      bg: (runningRuns ?? 0) > 0 ? 'bg-blue-500/10 border-blue-500/20' : 'bg-zinc-500/5 border-zinc-700/30',
      pulse: (runningRuns ?? 0) > 0,
    },
    {
      label: 'Approvals väntar',
      value: pendingApprovals ?? 0,
      sub: (pendingApprovals ?? 0) > 0 ? 'Behöver granskning' : 'Allt granskat',
      icon: ClipboardCheck,
      color: (pendingApprovals ?? 0) > 0 ? 'text-amber-400' : 'text-zinc-500',
      bg: (pendingApprovals ?? 0) > 0 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-zinc-500/5 border-zinc-700/30',
    },
    {
      label: 'Totala körningar',
      value: totalRuns ?? 0,
      sub: `${agents?.length ?? 0} agenter · ${workflows?.length ?? 0} workflows`,
      icon: TrendingUp,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10 border-indigo-500/20',
    },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-400" />
            AI Operations Center
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono tracking-wider uppercase">
            System Health · Real-time Status
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(runningRuns ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              {runningRuns} aktiv körning{(runningRuns ?? 0) > 1 ? 'ar' : ''}
            </div>
          )}
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nytt projekt
          </Link>
        </div>
      </div>

      {/* System Health Grid */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${healthColor.bg} animate-pulse`} />
          <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.2em]">
            System Status
          </h2>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {healthMetrics.map((metric) => {
            const Icon = metric.icon
            return (
              <div
                key={metric.label}
                className={`rounded-xl border p-4 flex flex-col gap-2.5 relative overflow-hidden ${metric.bg}`}
              >
                {metric.pulse && (
                  <div className="absolute inset-0 opacity-[0.03]">
                    <div className="absolute inset-0 animate-pulse bg-current" />
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {metric.label}
                  </span>
                  <div className={`w-6 h-6 rounded-md bg-black/20 flex items-center justify-center`}>
                    <Icon className={`w-3 h-3 ${metric.color}`} />
                  </div>
                </div>
                <div>
                  <p className={`text-2xl font-black tracking-tight ${metric.color}`}>
                    {metric.value}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{metric.sub}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Quick links row */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/manager"
          className="inline-flex items-center gap-2 text-xs bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-colors rounded-lg px-3 py-2 font-medium"
        >
          <Cpu className="w-3.5 h-3.5 text-indigo-400" />
          Mission Control
        </Link>
        <Link
          href="/approvals"
          className={`inline-flex items-center gap-2 text-xs border transition-colors rounded-lg px-3 py-2 font-medium ${
            (pendingApprovals ?? 0) > 0
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/15'
              : 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.07]'
          }`}
        >
          <ClipboardCheck className="w-3.5 h-3.5" />
          Approvals
          {(pendingApprovals ?? 0) > 0 && (
            <span className="ml-1 bg-amber-500 text-black text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {pendingApprovals}
            </span>
          )}
        </Link>
        {projects?.map((p: any) => (
          <Link
            key={p.id}
            href={`/projects/${p.slug}/runs`}
            className="inline-flex items-center gap-2 text-xs bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-colors rounded-lg px-3 py-2 font-medium"
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name}
          </Link>
        ))}
      </div>

      {/* Projects grid */}
      <section className="space-y-3">
        <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.2em]">
          Projekt
        </h2>

        {projects && projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((project: any) => (
              <Link
                key={project.id}
                href={`/projects/${project.slug}`}
                className="group rounded-xl border border-white/[0.07] bg-white/[0.02] p-5 hover:border-white/[0.12] hover:bg-white/[0.04] hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: project.color + '1a',
                      border: `1px solid ${project.color}33`,
                    }}
                  >
                    <Zap className="w-3.5 h-3.5" style={{ color: project.color }} />
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all" />
                </div>
                <h3 className="font-semibold text-sm mb-0.5">{project.name}</h3>
                <p className="text-[10px] text-muted-foreground font-mono mb-4">/{project.slug}</p>

                <div className="flex gap-4 text-[10px] text-muted-foreground border-t border-white/[0.06] pt-3">
                  <span className="flex items-center gap-1">
                    <Bot className="w-3 h-3" />
                    <strong className="text-foreground font-semibold">{agentsByProject[project.id] ?? 0}</strong> agenter
                  </span>
                  <span className="flex items-center gap-1">
                    <GitBranch className="w-3 h-3" />
                    <strong className="text-foreground font-semibold">{workflowsByProject[project.id] ?? 0}</strong> workflows
                  </span>
                </div>
              </Link>
            ))}

            <Link
              href="/projects/new"
              className="rounded-xl border border-dashed border-white/[0.07] bg-transparent p-5 flex flex-col items-center justify-center gap-2 hover:border-white/[0.15] hover:bg-white/[0.02] transition-all text-muted-foreground hover:text-foreground min-h-[140px] group"
            >
              <div className="w-8 h-8 rounded-lg border border-dashed border-current flex items-center justify-center group-hover:border-indigo-400 transition-colors">
                <Plus className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-medium">Nytt projekt</span>
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/[0.07] p-16 text-center space-y-4">
            <div className="w-10 h-10 rounded-xl bg-white/[0.03] flex items-center justify-center mx-auto">
              <Layers className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">Inga projekt ännu</p>
              <p className="text-xs text-muted-foreground mt-1">Skapa ditt första projekt för att komma igång</p>
            </div>
            <Link href="/projects/new" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
              <Plus className="w-4 h-4" />
              Skapa ditt första projekt
            </Link>
          </div>
        )}
      </section>

      {/* Recent runs */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.2em]">
            Senaste körningar
          </h2>
          <Clock className="w-3 h-3 text-muted-foreground" />
        </div>

        {recentRuns && recentRuns.length > 0 ? (
          <div className="rounded-xl border border-white/[0.07] overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.02] border-b border-white/[0.07]">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Workflow</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Projekt</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Startad</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-[10px] uppercase tracking-wider">Tid</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {recentRuns.map((run: any) => {
                  const project = Array.isArray(run.projects) ? run.projects[0] : run.projects
                  const workflow = Array.isArray(run.workflows) ? run.workflows[0] : run.workflows
                  const duration =
                    run.started_at && run.finished_at
                      ? Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)
                      : null
                  const isRunning = run.status === 'running'
                  return (
                    <tr key={run.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          {isRunning && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
                          )}
                          {workflow?.name ?? '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {project && (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
                            {project.name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <RunStatusBadge status={run.status as RunStatus} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono">
                        {formatDistanceToNow(new Date(run.created_at), { addSuffix: true, locale: sv })}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono">
                        {duration != null ? `${duration}s` : isRunning ? '…' : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/projects/${project?.slug}/runs/${run.id}`}
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Visa <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/[0.07] p-10 text-center space-y-3">
            <div className="w-10 h-10 rounded-lg bg-white/[0.03] flex items-center justify-center mx-auto">
              <Play className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">Inga körningar ännu — kör ett workflow för att komma igång</p>
          </div>
        )}
      </section>
    </div>
  )
}
