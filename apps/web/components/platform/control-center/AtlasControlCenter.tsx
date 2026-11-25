'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CircleCheck,
  CircleHelp,
  Clock3,
  Coins,
  FolderKanban,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Workflow,
} from 'lucide-react'
import type { DataState, Metric, OverviewModel } from '@/lib/overview/types'

const currency = new Intl.NumberFormat('sv-SE', {
  style: 'currency', currency: 'SEK', maximumFractionDigits: 2,
})
const formatSek = (value: number): string => currency.format(value)
const dateLabel = (iso: string): string => new Intl.DateTimeFormat('sv-SE', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm',
}).format(new Date(iso))
const shortDay = (day: string): string => day.slice(8) + '/' + day.slice(5, 7)

function stateLabel(state: DataState): string {
  if (state === 'partial') return 'Delvis tillgänglig data'
  if (state === 'unavailable') return 'Data kunde inte hämtas'
  return 'Uppdaterad'
}
function metricText(metric: Metric<number>): string {
  return metric.state === 'complete' && metric.value !== null
    ? String(metric.value)
    : '—'
}

function MetricCard({
  icon, title, value, foot, notice = false,
}: {
  icon: ReactNode; title: string; value: string; foot: string; notice?: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.085] bg-[#0d1628]/90 px-5 py-5 shadow-[0_12px_36px_rgba(0,0,0,.12)]">
      <div className="absolute -right-12 -top-16 h-36 w-36 rounded-full bg-teal-400/[0.035] blur-2xl" aria-hidden="true" />
      <div className="relative flex items-center justify-between gap-3">
        <span className="text-[12px] font-medium text-slate-400">{title}</span>
        <span className={notice ? 'text-amber-300/80' : 'text-teal-200/75'}>{icon}</span>
      </div>
      <div className="relative mt-4 text-[clamp(23px,2.35vw,35px)] font-semibold tracking-tight text-slate-50" title={value}>
        {value}
      </div>
      <p className="relative mt-1.5 text-[11px] text-slate-500">{foot}</p>
    </div>
  )
}

export function AtlasControlCenter({ model }: { model: OverviewModel }): JSX.Element {
  const [focusedId, setFocusedId] = useState<string>('all')
  const projectsReady = model.projects.state === 'complete'
  const projects = projectsReady ? model.projects.rows : []
  const selected = projects.find((p) => p.id === focusedId)
  const costsReady = model.costByDay.state === 'complete' && model.costByDay.value !== null
  const costRows = costsReady ? model.costByDay.value! : []
  const costTotal = costsReady ? costRows.reduce((sum, d) => sum + d.costSek, 0) : null
  const breakdownReady = model.costByProject.state === 'complete' && model.costByProject.value !== null
  const breakdown = breakdownReady ? model.costByProject.value! : []
  const byId = new Map(breakdown.map((item) => [item.projectId, item.costSek]))
  const maxProjectCost = Math.max(1, ...breakdown.map((p) => Math.abs(p.costSek)))
  const maxDayCost = Math.max(1, ...costRows.map((d) => Math.abs(d.costSek)))
  const focusCost = selected && breakdownReady ? (byId.get(selected.id) ?? 0) : null
  const currentPeriod = model.period
  const totalRuns = model.runsByDay.state === 'complete' && model.runsByDay.value !== null
    ? model.runsByDay.value.reduce((sum, d) =>
        sum + Object.values(d.counts).reduce((s, n) => s + n, 0), 0)
    : null

  return (
    <main className="relative isolate mx-auto min-h-screen w-full max-w-[1580px] overflow-hidden px-4 pb-24 pt-6 text-slate-100 sm:px-7 lg:px-9 lg:pt-8">
      <div className="pointer-events-none absolute -right-40 -top-60 -z-10 h-[600px] w-[800px] rounded-full bg-cyan-500/[0.065] blur-[110px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-44 top-64 -z-10 h-[580px] w-[700px] rounded-full bg-indigo-500/[0.055] blur-[110px]" aria-hidden="true" />

      <div className="mb-7 flex flex-wrap items-center justify-between gap-3 text-[11px]">
        <Link href="/atlas" className="inline-flex items-center gap-2 text-slate-400 transition hover:text-teal-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">
          <ArrowLeft size={14} /> Till Atlas
        </Link>
        <span className="inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/[0.06] px-3 py-1.5 font-medium text-teal-200">
          <LockKeyhole size={12} /> Privat förhandsvisning · Endast läsning
        </span>
      </div>

      <header className="mb-7 flex flex-col gap-6 border-b border-white/[0.07] pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.26em] text-teal-200/75">OMNIRA / ATLAS / OPERATIONS</p>
          <div className="flex items-start gap-4">
            <div className="hidden h-[54px] w-[54px] shrink-0 items-center justify-center rounded-[18px] border border-teal-200/20 bg-gradient-to-br from-teal-200/10 to-indigo-400/10 text-teal-200 sm:flex">
              <Activity size={24} strokeWidth={1.6} />
            </div>
            <div>
              <h1 className="text-[clamp(29px,3vw,42px)] font-semibold tracking-[-.045em] text-white">
                Atlas Control Center
              </h1>
              <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-slate-400">
                Ett sammanhang för dina projekt, arbetsflöden och registrerade AI-kostnader.
                Verifiera nuläget innan Atlas får utföra fler uppgifter autonomt.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 lg:items-end">
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#121b2b] p-1">
            {([7, 30] as const).map((days) => (
              <Link
                key={days}
                href={'/atlas/control-center?period=' + days}
                aria-current={currentPeriod === days ? 'page' : undefined}
                className={
                  'rounded-lg px-4 py-2 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 ' +
                  (currentPeriod === days
                    ? 'bg-[#23484e] text-teal-100 shadow-sm'
                    : 'text-slate-400 hover:text-white')
                }
              >
                {days} dagar
              </Link>
            ))}
          </div>
          <span className="text-[11px] text-slate-500">Datamodell uppdaterad {dateLabel(model.generatedAt)} · svensk tid</span>
        </div>
      </header>

      <section aria-label="Nyckeltal" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <MetricCard
          icon={<Coins size={18} />} title="Registrerad AI-kostnad"
          value={costTotal === null ? '—' : formatSek(costTotal)}
          foot={costsReady ? 'Senaste ' + currentPeriod + ' dagarna · inte total faktura' : stateLabel(model.costByDay.state)}
        />
        <MetricCard
          icon={<Workflow size={18} />} title="Aktiva arbetsflöden"
          value={metricText(model.totals.running)}
          foot={model.totals.running.state === 'complete' ? 'Pågår just nu' : stateLabel(model.totals.running.state)}
        />
        <MetricCard
          icon={<ShieldCheck size={18} />} title="Väntar på granskning"
          value={metricText(model.totals.pendingApprovals)}
          foot={model.totals.pendingApprovals.state === 'complete' ? 'Inga beslut tas automatiskt här' : stateLabel(model.totals.pendingApprovals.state)}
        />
        <MetricCard
          icon={<TriangleAlert size={18} />} title="Fel senaste dygnet"
          value={metricText(model.totals.failed24h)}
          notice={model.totals.failed24h.state === 'complete' && (model.totals.failed24h.value ?? 0) > 0}
          foot={model.totals.failed24h.state === 'complete' ? 'Misslyckade körningar · 24h' : stateLabel(model.totals.failed24h.state)}
        />
      </section>

      <section className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)]" aria-label="Kostnad och kontroll">
        <div className="min-w-0 rounded-2xl border border-white/[0.085] bg-[#0c1424]/95 p-5 sm:p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-teal-300/70">EKONOMISK SIGNAL</p>
              <h2 className="mt-2 text-lg font-semibold tracking-tight">Registrerad AI-förbrukning</h2>
              <p className="mt-1 text-xs text-slate-500">Kostnadsposter som Omnira redan känner till, dag för dag.</p>
            </div>
            <span className="rounded-lg bg-white/[0.045] px-3 py-2 text-[11px] text-slate-400">
              {costsReady ? 'Underlag tillgängligt' : stateLabel(model.costByDay.state)}
            </span>
          </div>
          {!costsReady ? (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-slate-400">
              Kostnadsgrafen kan inte visas med nuvarande datakvalitet.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto" aria-label="Diagram över registrerade dagskostnader">
                <div className="flex h-44 min-w-[480px] items-end gap-[5px] border-b border-white/10 pb-4">
                  {costRows.map((day, index) => {
                    const height = day.costSek === 0 ? 2 : Math.max(5, Math.round(Math.abs(day.costSek) / maxDayCost * 98))
                    return (
                      <div key={day.date} className="group relative flex h-full min-w-0 flex-1 items-end" title={day.date + ': ' + formatSek(day.costSek)}>
                        <div
                          className={'w-full rounded-t-[3px] transition-colors ' +
                            (day.costSek < 0 ? 'bg-amber-300/70' : day.costSek === 0 ? 'bg-slate-500/30' : 'bg-teal-300/70 group-hover:bg-teal-200')}
                          style={{ height: height + '%' }}
                        />
                        {(index % Math.max(1, Math.floor(costRows.length / 6)) === 0) && (
                          <span className="absolute -bottom-9 left-0 whitespace-nowrap font-mono text-[9px] text-slate-500">{shortDay(day.date)}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="mt-10 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-sm bg-teal-300/70" /> Registrerade kostnader (SEK)</span>
                <span>Negativa poster visas i guld · {costRows.length} dygn</span>
              </div>
              <details className="mt-5 text-[11px] text-slate-400">
                <summary className="w-fit cursor-pointer rounded-md py-1 text-teal-200 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">Visa alla dagsvärden</summary>
                <div className="mt-3 max-h-52 overflow-auto rounded-xl border border-white/10">
                  <table className="w-full text-left">
                    <caption className="sr-only">Dagskostnader i kronor, svensk tid</caption>
                    <thead><tr><th className="px-3 py-2">Datum</th><th className="px-3 py-2 text-right">Kostnad</th></tr></thead>
                    <tbody>{costRows.map((d) => (
                      <tr key={d.date} className="border-t border-white/5"><td className="px-3 py-2">{d.date}</td><td className="px-3 py-2 text-right">{formatSek(d.costSek)}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </details>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.085] bg-[#0c1424]/95 p-5 sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-teal-300/70">KOSTNADSKONTROLL</p>
          <h2 className="mt-2 text-lg font-semibold">Vad siffrorna täcker</h2>
          <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
            Den här första versionen visar endast registrerade AI-kostnadshändelser i Omniras databas.
            Den visar inte en avstämd total från AWS, Vercel eller andra leverantörsfakturor.
          </p>
          <div className="mt-6 space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-teal-300/15 bg-teal-300/[0.055] p-3">
              <CircleCheck size={17} className="mt-0.5 shrink-0 text-teal-200" />
              <div>
                <p className="text-[12px] font-semibold text-slate-100">Projektavgränsad datamodell</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Samma ägar- och projektfiltrering som Omniras befintliga översikt.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-white/[0.075] bg-white/[0.025] p-3">
              <CircleHelp size={17} className="mt-0.5 shrink-0 text-amber-200/80" />
              <div>
                <p className="text-[12px] font-semibold text-slate-100">Extern leverantörsavstämning</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Bedrock-modeller, AWS-krediter, Vercel och övriga fakturor: nästa integrationsetapp.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-white/[0.075] bg-white/[0.025] p-3">
              <LockKeyhole size={17} className="mt-0.5 shrink-0 text-slate-400" />
              <div>
                <p className="text-[12px] font-semibold text-slate-100">Budgetspärrar</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Inte aktiverade av denna vy. AI-anrop och workflow-start kräver separata kontroller.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]" aria-label="Projektstyrning">
        <div className="rounded-2xl border border-white/[0.085] bg-[#0c1424]/95 p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-teal-300/70">PROJEKTFOKUS</p>
              <h2 className="mt-2 text-lg font-semibold">Dina projekt</h2>
              <p className="mt-1 text-[12px] text-slate-500">Välj ett projekt för att se dess registrerade aktivitet.</p>
            </div>
            {projectsReady && <span className="rounded-full bg-white/[0.04] px-3 py-1.5 text-xs text-slate-400">{projects.length} projekt</span>}
          </div>
          {!projectsReady ? (
            <p role="status" className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-slate-400">{stateLabel(model.projects.state)}</p>
          ) : projects.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-slate-400">Inga aktiva projekt finns i den behöriga översikten.</p>
          ) : (
            <div className="space-y-2" role="group" aria-label="Välj projekt">
              <button type="button" onClick={() => setFocusedId('all')} aria-pressed={focusedId === 'all'}
                className={'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 ' +
                  (focusedId === 'all' ? 'border-teal-300/35 bg-teal-200/[0.07]' : 'border-white/[0.07] bg-white/[0.018] hover:bg-white/[0.045]')}>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-200/[0.09] text-teal-200"><FolderKanban size={17} /></span>
                <span className="flex-1 font-medium">Alla projekt</span>
                <span className="text-xs text-slate-400">Helhetsvy</span>
                <ArrowRight size={15} className="text-slate-500" />
              </button>
              {projects.map((project) => (
                <button key={project.id} type="button" onClick={() => setFocusedId(project.id)} aria-pressed={focusedId === project.id}
                  className={'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 ' +
                    (focusedId === project.id ? 'border-teal-300/35 bg-teal-200/[0.07]' : 'border-white/[0.07] bg-white/[0.018] hover:bg-white/[0.045]')}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-[#121f30]">
                    <span className="h-[10px] w-[10px] rounded-full" style={{ backgroundColor: /^#[0-9a-f]{3,8}$/i.test(project.color ?? '') ? project.color! : '#5eead4' }} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{project.name}</span>
                  <span className="hidden text-[11px] text-slate-400 sm:inline">
                    {project.runningRuns.state === 'complete' ? String(project.runningRuns.value) + ' körs' : 'Status okänd'}
                  </span>
                  <ArrowRight size={15} className="shrink-0 text-slate-500" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.085] bg-gradient-to-b from-[#122335] to-[#0a1423] p-5 sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-teal-300/70">DETALJVY</p>
          <h2 className="mt-2 text-xl font-semibold">{selected ? selected.name : 'Hela Omnira'}</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
            {selected ? 'Nyckeltal för valt projekt, enligt befintliga registreringar.' : 'Samlad status för alla dina behöriga projekt.'}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-black/10 p-4">
              <span className="block text-[11px] text-slate-400">AI-kostnad · {currentPeriod}d</span>
              <strong className="mt-3 block text-[19px] font-semibold tracking-tight">
                {selected ? (focusCost !== null ? formatSek(focusCost) : '—') : (costTotal !== null ? formatSek(costTotal) : '—')}
              </strong>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/10 p-4">
              <span className="block text-[11px] text-slate-400">Pågående</span>
              <strong className="mt-3 block text-[22px] font-semibold">
                {selected ? metricText(selected.runningRuns) : metricText(model.totals.running)}
              </strong>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/10 p-4">
              <span className="block text-[11px] text-slate-400">Att granska</span>
              <strong className="mt-3 block text-[22px] font-semibold">
                {selected ? metricText(selected.pendingApprovals) : metricText(model.totals.pendingApprovals)}
              </strong>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/10 p-4">
              <span className="block text-[11px] text-slate-400">Fel · 24h</span>
              <strong className="mt-3 block text-[22px] font-semibold">
                {selected ? metricText(selected.failedRuns24h) : metricText(model.totals.failed24h)}
              </strong>
            </div>
          </div>
          <div className="mt-6">
            <Link href={selected ? selected.href : '/dashboard'}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-teal-200/30 bg-teal-200/[0.08] px-4 py-3 text-[12px] font-semibold text-teal-100 transition hover:bg-teal-200/[0.14] focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">
              {selected ? 'Öppna projektet' : 'Öppna befintlig översikt'} <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      <section aria-label="Kostnadsfördelning och automationsplan" className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.085] bg-[#0c1424]/95 p-5 sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <Coins className="mt-0.5 shrink-0 text-teal-200/70" size={18} />
            <div>
              <h2 className="text-[15px] font-semibold">Kostnad per projekt</h2>
              <p className="mt-1 text-[11px] text-slate-500">Registrerad AI-kostnad, inte leverantörernas totalfakturor.</p>
            </div>
          </div>
          {!breakdownReady || !projectsReady ? (
            <p className="text-sm text-slate-400">{!breakdownReady ? stateLabel(model.costByProject.state) : stateLabel(model.projects.state)}</p>
          ) : breakdown.length === 0 ? (
            <p className="text-sm text-slate-400">Inga registrerade projektkostnader under perioden.</p>
          ) : (
            <div className="space-y-5">
              {breakdown.map((item) => {
                const project = projects.find((p) => p.id === item.projectId)
                return (
                  <div key={item.projectId}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-[12px]">
                      <span className="truncate text-slate-300">{project?.name ?? 'Projekt'}</span>
                      <span className="font-medium text-slate-200">{formatSek(item.costSek)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                      <div className={item.costSek < 0 ? 'h-full rounded-full bg-amber-300/70' : 'h-full rounded-full bg-teal-300/70'}
                        style={{ width: Math.abs(item.costSek) / maxProjectCost * 100 + '%' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-white/[0.085] bg-[#0c1424]/95 p-5 sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <Bot className="mt-0.5 shrink-0 text-teal-200/70" size={18} />
            <div>
              <h2 className="text-[15px] font-semibold">Atlas · nästa automationslager</h2>
              <p className="mt-1 text-[11px] text-slate-500">Planerat arbetssätt – inga nya autonoma körningar har aktiverats.</p>
            </div>
          </div>
          <ol className="space-y-4">
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-teal-200/25 bg-teal-200/[0.06] text-xs font-semibold text-teal-200">1</span>
              <span><strong className="block text-[12px] font-semibold">Analysera projektet</strong><span className="mt-1 block text-[11px] text-slate-400">Identifiera uppgifter, data och tillgängliga modeller.</span></span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-teal-200/25 bg-teal-200/[0.06] text-xs font-semibold text-teal-200">2</span>
              <span><strong className="block text-[12px] font-semibold">Utföra inom uppdragsgränser</strong><span className="mt-1 block text-[11px] text-slate-400">Kontrollera databehörighet, modellåtkomst och kostnadstak.</span></span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-teal-200/25 bg-teal-200/[0.06] text-xs font-semibold text-teal-200">3</span>
              <span><strong className="block text-[12px] font-semibold">Verifiera och godkänna</strong><span className="mt-1 block text-[11px] text-slate-400">Publicering, kundutskick och produktionsändringar granskas först.</span></span>
            </li>
          </ol>
          <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl bg-amber-300/[0.045] px-3 py-3 text-[11px] text-amber-100/75">
            <Clock3 size={15} /> Läsbar plan – ingen körknapp eller automatisk start i denna version.
          </div>
        </div>
      </section>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5 text-[11px] text-slate-500">
        <span className="flex items-center gap-2"><Sparkles size={13} /> Atlas Control Center · v0.1 · Förhandsvisning</span>
        <span className="flex items-center gap-2"><LockKeyhole size={13} /> Inga nya API-anrop, schemaläggningar eller ändringar i AWS</span>
      </footer>
    </main>
  )
}
