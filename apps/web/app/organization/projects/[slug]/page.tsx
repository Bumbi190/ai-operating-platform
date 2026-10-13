import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrganizationReadScope } from '@/lib/auth/organization-project-read'

export const dynamic = 'force-dynamic'
type ProjectParams = { params: { slug: string } }

export default async function ProjectReadPage({ params }: ProjectParams) {
  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) redirect('/login')
  const db = createAdminClient()
  const scope = await resolveOrganizationReadScope(session, db, user.id)
  if (!scope.role.active || scope.projectIds.length === 0) notFound()
  if (!/^[a-z0-9-]{1,80}$/.test(params.slug)) notFound()

  const { data: project, error: projectError } = await db.from('projects')
    .select('id, name, slug')
    .eq('slug', params.slug)
    .in('id', [...scope.projectIds])
    .maybeSingle()
  if (projectError || !project) notFound()

  const [runsResult, tasksResult, revenueResult, costsResult] = await Promise.allSettled([
    db.from('runs').select('id, status, created_at')
      .eq('project_id', project.id).order('created_at', { ascending: false }).limit(15),
    db.from('manager_tasks').select('id, title, status, created_at')
      .eq('project_id', project.id).order('created_at', { ascending: false }).limit(15),
    db.from('revenue_snapshots').select('snapshot_date, mrr_sek, revenue_month_sek, currency')
      .eq('project_id', project.id).order('snapshot_date', { ascending: false }).limit(1),
    db.from('cost_events').select('cost_sek, created_at')
      .eq('project_id', project.id).order('created_at', { ascending: false }).limit(20),
  ])
  const rows = <T,>(r: PromiseSettledResult<{ data: T[] | null; error: unknown }>): T[] =>
    r.status === 'fulfilled' && !r.value.error ? r.value.data ?? [] : []
  const runs = rows(runsResult)
  const tasks = rows(tasksResult)
  const revenue = rows(revenueResult)[0]
  const costEvents = rows(costsResult)
  const sampleCost = costEvents.reduce((total, event) => total + (Number(event.cost_sek) || 0), 0)
  const panel = { border: '1px solid #34455f', background: '#15243b', borderRadius: 15, padding: 22, marginTop: 18 }
  const money = (x: number | null | undefined) =>
    typeof x === 'number' && Number.isFinite(x) ? x.toLocaleString('sv-SE', { maximumFractionDigits: 2 }) + ' kr' : 'Ingen uppgift'

  return <main style={{ background: '#091322', minHeight: '100vh', color: '#f2f5fa', padding: '42px 20px', fontFamily: 'system-ui, sans-serif' }}>
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <Link href="/organization" style={{ color: '#9fc9f7' }}>← Alla projekt</Link>
      <h1 style={{ fontSize: 34, marginTop: 20 }}>{project.name}</h1>
      <p style={{ color: '#a3b6d0' }}>Skrivskyddad projektöversikt · Projekt: {project.slug}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16 }}>
        <section style={panel}><h2>Ekonomi</h2>
          <p>Senast rapporterad MRR: <strong>{money(revenue?.mrr_sek == null ? null : Number(revenue.mrr_sek))}</strong></p>
          <p>Månadsintäkt: <strong>{money(revenue?.revenue_month_sek == null ? null : Number(revenue.revenue_month_sek))}</strong></p>
          <p style={{ color: '#a3b6d0' }}>Rapportdatum: {revenue?.snapshot_date ?? 'saknas'}</p>
        </section>
        <section style={panel}><h2>Aktivitet</h2>
          <p>Senaste körningar i listan: {runs.length}</p>
          <p>Senaste uppgifter i listan: {tasks.length}</p>
        </section>
        <section style={panel}><h2>Kostnadshändelser</h2>
          <p>Summering av senaste {costEvents.length} händelser: <strong>{money(sampleCost)}</strong></p>
          <p style={{ color: '#a3b6d0' }}>Detta är inte hela månadens totalkostnad.</p>
        </section>
      </div>
      <section style={panel}><h2>Senaste uppgifter</h2>
        {tasks.length ? <ul>{tasks.map(t => <li key={t.id}>{t.title} – {t.status}</li>)}</ul> : <p>Inga tillgängliga uppgifter.</p>}
      </section>
      <section style={panel}><h2>Senaste körningar</h2>
        {runs.length ? <ul>{runs.map(r => <li key={r.id}>{r.status} – {r.created_at}</li>)}</ul> : <p>Inga tillgängliga körningar.</p>}
      </section>
    </div>
  </main>
}
