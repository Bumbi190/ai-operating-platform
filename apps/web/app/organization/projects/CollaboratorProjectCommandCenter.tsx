import Link from 'next/link'
import styles from '@/components/platform/vnext/ProjectCommandCenter.module.css'

type Run = { id: string; status: string; created_at: string | null }
type Task = { id: string; title: string; status: string }
type Revenue = { snapshot_date: string; mrr_sek: number | null; revenue_month_sek: number | null }
type Cost = { cost_sek: number | null }

type ReadResult<T> = { available: boolean; rows: readonly T[] }

function money(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('sv-SE', { maximumFractionDigits: 2 }) + ' kr'
    : 'Ingen uppgift'
}

export function CollaboratorProjectCommandCenter({
  project, runs, tasks, revenue, costs,
}: {
  project: { id: string; name: string; slug: string; color: string }
  runs: ReadResult<Run>
  tasks: ReadResult<Task>
  revenue: ReadResult<Revenue>
  costs: ReadResult<Cost>
}) {
  const snapshot = revenue.rows[0]
  const costSum = costs.rows.reduce((total, item) => total + (Number(item.cost_sek) || 0), 0)
  return <main className={styles.field} data-collaborator-readonly="true">
    <div className={styles.ambient} aria-hidden="true" />
    <header className={styles.header}>
      <div className={styles.headerMain}>
        <p className={styles.kicker}>Projekt · Command Center · Läsbehörighet</p>
        <div className={styles.identity}>
          <span className={styles.swatch} style={{ backgroundColor: project.color }} aria-hidden="true" />
          <h1 className={styles.title}>{project.name}</h1>
          <span className={styles.slug}>{project.slug}</span>
        </div>
        <p className="mt-3 text-sm text-slate-400">Projektdata kan granskas här. Skyddade ändringar kräver Owner.</p>
      </div>
      <nav className={styles.actions} aria-label="Projektets läsvyer">
        <Link className={styles.action} href="/organization">Alla projekt</Link>
      </nav>
    </header>
    <div className={styles.workspace}>
      <div className={styles.primary}>
        <section className={styles.panel}>
          <h2>Ekonomi</h2>
          {revenue.available ? (
            <dl className="mt-4 grid gap-3 text-sm">
              <div><dt>Senast rapporterad MRR</dt><dd className="font-semibold">{money(snapshot?.mrr_sek)}</dd></div>
              <div><dt>Månadsintäkt</dt><dd className="font-semibold">{money(snapshot?.revenue_month_sek)}</dd></div>
              <div><dt>Rapportdatum</dt><dd>{snapshot?.snapshot_date ?? 'Inget snapshot'}</dd></div>
            </dl>
          ) : <p>Ekonomidata kunde inte läsas.</p>}
        </section>
        <section className={styles.panel}>
          <h2>Senaste uppgifter</h2>
          {!tasks.available ? <p>Uppgifter kunde inte läsas.</p> :
            tasks.rows.length === 0 ? <p>Inga tillgängliga uppgifter.</p> :
            <ul className="mt-4 space-y-3">{tasks.rows.map(t =>
              <li key={t.id} className="border-b border-white/10 pb-2"><strong>{t.title}</strong><span className="ml-2 text-slate-400">{t.status}</span></li>)}</ul>}
        </section>
      </div>
      <div className={styles.secondary}>
        <section className={styles.panel}>
          <h2>Senaste körningar</h2>
          {!runs.available ? <p>Körningar kunde inte läsas.</p> :
            runs.rows.length === 0 ? <p>Inga tillgängliga körningar.</p> :
            <ul className="mt-4 space-y-3">{runs.rows.map(r =>
              <li key={r.id} className="border-b border-white/10 pb-2">{r.status}<span className="ml-2 text-slate-400">{r.created_at?.slice(0, 16).replace('T', ' ') ?? ''}</span></li>)}</ul>}
        </section>
        <section className={styles.panel}>
          <h2>Kostnadshändelser</h2>
          {!costs.available ? <p>Kostnadsdata kunde inte läsas.</p> : <>
            <p className="mt-4">{money(costSum)}</p>
            <p className="text-xs text-slate-400">Summa för de senaste {costs.rows.length} händelserna – inte full månadskostnad.</p>
          </>}
        </section>
      </div>
    </div>
  </main>
}
