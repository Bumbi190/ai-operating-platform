import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { RunStatusBadge } from '@/components/platform/RunStatusBadge'
import type { RunStatus } from '@/lib/supabase/types'
import { Play } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'
import { OSPage, OSLayer } from '@/components/platform/os'
import { getProjectBySlug } from '@/lib/project/get-project'

export default async function RunsPage({ params }: { params: { slug: string } }) {
  const project = await getProjectBySlug(params.slug)
  if (!project) notFound()

  const supabase = await createClient()
  const { data: runs } = await supabase
    .from('runs')
    .select('*, workflows(name)')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <OSPage className="animate-fade-in">
      <OSLayer layer="hero">
        <h1 className="text-2xl 2xl:text-3xl font-bold tracking-tight">Körningar</h1>
        <p className="text-sm text-muted-foreground mt-1">{project.name}</p>
      </OSLayer>

      <OSLayer layer="operational">
      {runs && runs.length > 0 ? (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Workflow</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Startad</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Varaktighet</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((run) => {
                const workflow = Array.isArray(run.workflows) ? run.workflows[0] : run.workflows
                const duration =
                  run.started_at && run.finished_at
                    ? Math.round(
                        (new Date(run.finished_at).getTime() -
                          new Date(run.started_at).getTime()) /
                          1000,
                      )
                    : null

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
                    <td className="px-4 py-3 text-muted-foreground">
                      {duration !== null ? `${duration}s` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/projects/${params.slug}/runs/${run.id}`}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Visa logg →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-16 text-center">
          <Play className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium mb-1">Inga körningar ännu</h3>
          <p className="text-sm text-muted-foreground">
            Kör ett workflow för att se körningar här
          </p>
        </div>
      )}
      </OSLayer>
    </OSPage>
  )
}
