import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { FileOutput } from 'lucide-react'
import Link from 'next/link'
import { OutputCard } from './OutputCard'

export default async function OutputsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ all?: string }>
}) {
  const { slug } = await params
  const { all } = await searchParams

  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, slug')
    .eq('slug', slug)
    .single()

  if (!project) notFound()

  const db = createAdminClient()

  // By default: show last 50 runs. ?today=1 filters to today only.
  const showToday = all === 'today'
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const showAll = !showToday

  let query = db
    .from('runs')
    .select(`
      id, status, context, created_at, finished_at,
      workflows ( name )
    `)
    .eq('project_id', project.id)
    .eq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(50)

  if (showToday) {
    query = query.gte('created_at', todayStart.toISOString())
  }

  const { data: runs } = await query

  const todayLabel = todayStart.toLocaleDateString('sv-SE', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Utdata</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {showAll
              ? `${project.name} — alla körningar`
              : `${project.name} — ${todayLabel}`}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground">
            {runs?.length ?? 0} körning{(runs?.length ?? 0) !== 1 ? 'ar' : ''}
          </span>
          {showToday ? (
            <Link
              href={`/projects/${slug}/outputs`}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
            >
              Visa alla
            </Link>
          ) : (
            <Link
              href={`/projects/${slug}/outputs?all=today`}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
            >
              Visa bara idag
            </Link>
          )}
        </div>
      </div>

      {!runs || runs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-16 text-center">
          <FileOutput className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium mb-1">
            {showToday ? 'Inga körningar idag' : 'Inga utdata ännu'}
          </h3>
          <p className="text-sm text-muted-foreground">
            Kör ett workflow för att generera innehåll
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <OutputCard
              key={run.id}
              run={run}
            />
          ))}
        </div>
      )}
    </div>
  )
}
