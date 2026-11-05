import React from 'react'
import type { RealDealerMetricsV3 } from '@/lib/atlas/project-analytics/handlarborsen-real-dealer-v3'

const formatted = (count: number) => count.toLocaleString('sv-SE')

/** V3 counts are the ONLY certified external-dealer population for this panel.
 * No fallback to legacy marketplace totals, which include test accounts.
 */
export function HandlarborsenRealDealerKpis({ data }: { data: RealDealerMetricsV3 }) {
  const available = data.status === 'available'
  const cards = [
    { label: 'Riktiga externa handlare', value: available ? data.registered : null },
    { label: 'Verifierade externa handlare', value: available ? data.verified : null },
    { label: 'Testorganisationer', value: available ? data.testOrganisations : null },
    { label: 'Interna skyddade bolag', value: available ? data.internalOrganisations : null },
    { label: 'Oklassade organisationer', value: available ? data.unclassifiedOrganisations : null },
  ]
  return (
    <section aria-labelledby="hb-v3-kpi-title" className="my-6 rounded-2xl border border-sky-400/25 bg-slate-950/40 p-5 text-slate-100">
      <p className="text-xs font-semibold uppercase tracking-widest text-sky-300">Handlarbörsen / statistik v3</p>
      <h2 id="hb-v3-kpi-title" className="mt-2 text-xl font-semibold">Riktiga handlare – separat från testdata</h2>
      <p className="mt-2 text-sm text-slate-300">
        Enbart klassificerade externa handlare ingår i handlarantalet.
        Testorganisationer, interna skyddade bolag och oklassade poster redovisas separat.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(card => (
          <div key={card.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-xs font-medium text-slate-300">{card.label}</h3>
            <strong className="mt-2 block text-2xl tabular-nums" data-unavailable={card.value === null}>
              {card.value === null ? '—' : formatted(card.value)}
            </strong>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-400">
        {available
          ? `Källa: Handlarbörsens v3-API · classified_real_external_dealers · observerad ${data.observedAt} · inga gamla v1/v2-siffror inkluderade`
          : 'Källa: Handlarbörsens v3-API · otillgänglig (' + data.reason + '). Inga antal antas vara noll; tidigare snapshots ersätter inte v3.'}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        Ett klassificerat företag är inte automatiskt en aktiv eller betalande handlare. Historiska v1/v2-rapporter har annan definition och får inte användas i jämförelse.
      </p>
    </section>
  )
}
