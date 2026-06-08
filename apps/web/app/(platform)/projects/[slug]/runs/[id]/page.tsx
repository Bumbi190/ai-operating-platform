import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { RunStatusBadge } from '@/components/platform/RunStatusBadge'
import { LogStream } from '@/components/platform/LogStream'
import type { RunStatus, RunLog } from '@/lib/supabase/types'
import { formatDistanceToNow, format } from 'date-fns'
import { sv } from 'date-fns/locale/sv'
import { ChevronLeft, Clock, Hash, Calendar, Play, AlertTriangle } from 'lucide-react'
import { WorkflowStepGraph } from '@/components/platform/WorkflowStepGraph'
import { ResumeRunButton } from '@/components/platform/ResumeRunButton'
import { OSPage, OSLayer } from '@/components/platform/os'
import { getProjectBySlug } from '@/lib/project/get-project'

export default async function RunDetailPage({
  params,
}: {
  params: { slug: string; id: string }
}) {
  // Scope the run lookup to the project in the URL so a run from another
  // project can't be opened under this project's URL.
  const project = await getProjectBySlug(params.slug)
  if (!project) notFound()

  const supabase = await createClient()

  const { data: run } = await (supabase as any)
    .from('runs')
    .select('*, workflows(name, id), projects(name, slug)')
    .eq('id', params.id)
    .eq('project_id', project.id)
    .single()

  if (!run) notFound()

  const { data: logs } = await (supabase as any)
    .from('run_logs')
    .select('*')
    .eq('run_id', run.id)
    .order('created_at')

  const workflow = Array.isArray(run.workflows) ? run.workflows[0] : run.workflows

  const duration =
    run.started_at && run.finished_at
      ? Math.round(
          (new Date(run.finished_at).getTime() -
            new Date(run.started_at).getTime()) /
            1000,
        )
      : null

  const totalTokens = (logs ?? []).reduce(
    (sum: number, l: any) => sum + (l.tokens_in ?? 0) + (l.tokens_out ?? 0),
    0,
  )

  const stepCount = new Set(
    (logs ?? []).filter((l: any) => l.step_order != null).map((l: any) => l.step_order),
  ).size

  return (
    <OSPage className="animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-meta mb-5">
        <Link
          href={`/projects/${params.slug}/runs`}
          className="hover:text-zinc-400 transition-colors flex items-center gap-1"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Körningar
        </Link>
        <span>/</span>
        <span className="text-secondary font-mono">{run.id.slice(0, 8)}…</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100 truncate">
            {workflow?.name ?? 'Körning'}
          </h1>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <RunStatusBadge status={run.status as RunStatus} />
            <span className="text-xs text-meta flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDistanceToNow(new Date(run.created_at), {
                addSuffix: true,
                locale: sv,
              })}
            </span>
          </div>
        </div>

        {/* Run again button */}
        {workflow?.id && (
          <Link
            href={`/projects/${params.slug}/workflows/${workflow.id}/run`}
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200 transition-colors shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            Kör igen
          </Link>
        )}
      </div>

      {/* Meta cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { icon: Clock, label: 'Varaktighet', value: duration != null ? `${duration}s` : '—' },
          { icon: Hash, label: 'Tokens', value: totalTokens > 0 ? totalTokens.toLocaleString('sv') : '—' },
          { icon: Play, label: 'Steg', value: stepCount > 0 ? stepCount : '—' },
          {
            icon: Calendar,
            label: 'Startad',
            value: run.started_at ? format(new Date(run.started_at), 'HH:mm:ss', { locale: sv }) : '—',
          },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
            <p className="text-[10px] text-meta flex items-center gap-1.5 mb-1.5 uppercase tracking-wider">
              <Icon className="w-3 h-3" /> {label}
            </p>
            <p className="font-semibold text-sm text-zinc-200">{value}</p>
          </div>
        ))}
      </div>

      {/* Workflow Step Graph */}
      <WorkflowStepGraph
        logs={(logs ?? []).map((l: any) => ({
          step_order: l.step_order ?? null,
          step_name:  l.step_name  ?? null,
          role:       l.role,
          tokens_in:  l.tokens_in  ?? null,
          tokens_out: l.tokens_out ?? null,
          duration_ms: l.duration_ms ?? null,
        }))}
        runStatus={run.status}
      />

      {/* Two-column layout: log + sidebar */}
      <div className="flex gap-5 items-start">
        {/* Log stream — main column */}
        <div className="flex-1 min-w-0">
          <h2 className="text-[10px] font-semibold text-meta uppercase tracking-widest mb-2">
            Körningslogg
          </h2>
          <LogStream
            runId={run.id}
            initialLogs={(logs ?? []) as RunLog[]}
            initialStatus={run.status}
          />
        </div>

        {/* Right sidebar: input + output + error */}
        <div className="w-80 shrink-0 space-y-4">
          {/* Error */}
          {run.error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 space-y-3">
              <h2 className="text-[10px] font-semibold text-red-400 uppercase tracking-widest flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" /> Fel
              </h2>
              <p className="text-xs font-mono text-red-400/80 break-words">{run.error}</p>
              {run.status === 'failed' && (
                <ResumeRunButton runId={run.id} />
              )}
            </div>
          )}

          {/* Input */}
          {run.input && Object.keys(run.input).length > 0 && (
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <h2 className="text-[10px] font-semibold text-meta uppercase tracking-widest mb-3">
                Input
              </h2>
              <div className="space-y-2">
                {Object.entries(run.input as Record<string, string>).map(([key, value]) => (
                  <div key={key}>
                    <p className="text-[10px] text-meta font-mono mb-0.5">{key}</p>
                    <p className="text-xs text-zinc-300">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Output / context */}
          {run.context && Object.keys(run.context).length > 0 && (
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
              <div className="px-4 pt-4 pb-2">
                <h2 className="text-[10px] font-semibold text-meta uppercase tracking-widest">
                  Resultat
                </h2>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {Object.entries(run.context as Record<string, string>)
                  .filter(([key]) => key !== 'månad')
                  .map(([key, value]) => {
                    // run.context is typed Record<string,string> but values can be
                    // boolean/number/object at runtime → normalize before string ops.
                    const sval = typeof value === 'string'
                      ? value
                      : value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
                    let preview = sval
                    let isImage = false
                    try {
                      const parsed = JSON.parse(sval)
                      if (parsed?.urls || parsed?.errors) {
                        const urlCount = parsed.urls?.length ?? 0
                        const errCount = parsed.errors?.length ?? 0
                        preview = `${urlCount} bild${urlCount !== 1 ? 'er' : ''} genererade${errCount ? ` · ${errCount} fel` : ''}`
                        isImage = true
                      }
                    } catch { /* not JSON */ }
                    if (sval.startsWith('data:image/')) { preview = 'Bild (base64)'; isImage = true }

                    return (
                      <div key={key} className="p-4">
                        <p className="text-[10px] font-mono text-meta mb-1.5 flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-emerald-500" />
                          {key}
                        </p>
                        {isImage ? (
                          <p className="text-xs text-secondary italic">{preview}</p>
                        ) : (
                          <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-words leading-relaxed max-h-32 overflow-y-auto scrollbar-thin">
                            {sval.length > 500 ? sval.slice(0, 500) + '…' : sval}
                          </pre>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
    </OSPage>
  )
}
