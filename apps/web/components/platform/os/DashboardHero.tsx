/**
 * DashboardHero — Omnira Command Center
 *
 * Kompakt, funktionell hero. Inte marknadsföring. Svarar på tre sekunder:
 * hur många verksamheter är aktiva, vad tjänar pengar idag, vad väntar på mig,
 * vad körs just nu.
 */

import Link from 'next/link'
import { Building2, Banknote, ClipboardCheck, Workflow } from 'lucide-react'
import { PulseDot } from './PulseDot'
import type { HeroSummary } from '@/lib/os/business'

function sek(n: number): string {
  if (n <= 0) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')} M kr`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace('.', ',')} k kr`
  return `${Math.round(n)} kr`
}

export function DashboardHero({ summary }: { summary: HeroSummary }) {
  const stats: {
    label: string
    value: string
    caption: string
    icon: any
    color: string
    href?: string
    live?: boolean
    attention?: boolean
  }[] = [
    {
      label: 'Aktiva företag',
      value: `${summary.activeBusinesses}`,
      caption: `av ${summary.totalBusinesses} verksamheter`,
      icon: Building2,
      color: '#34d399',
    },
    {
      label: 'Dagens intäkter',
      value: sek(summary.revenueTodaySek),
      caption: summary.revenueMonthSek > 0 ? `${sek(summary.revenueMonthSek)} denna månad` : 'ingen intäkt registrerad',
      icon: Banknote,
      color: '#d4a574',
    },
    {
      label: 'Väntar på godkännande',
      value: `${summary.pendingApprovals}`,
      caption: summary.pendingApprovals > 0 ? 'kräver ditt beslut' : 'allt hanterat',
      icon: ClipboardCheck,
      color: summary.pendingApprovals > 0 ? '#fbbf24' : '#34d399',
      href: '/approvals',
      attention: summary.pendingApprovals > 0,
    },
    {
      label: 'Aktiva arbetsflöden',
      value: `${summary.activeWorkflows}`,
      caption: summary.runningRuns > 0 ? `${summary.runningRuns} körs nu` : 'inga körningar just nu',
      icon: Workflow,
      color: '#a5b4fc',
      live: summary.runningRuns > 0,
    },
  ]

  return (
    <header className="mb-7">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="display-hero text-gradient-instrument text-[26px] md:text-[32px] leading-tight">
            Omnira Command Center
          </h1>
          <p className="mt-1.5 text-[13px] text-zinc-400">
            Övervakar och driver autonoma verksamheter
          </p>
        </div>
        <div className="flex items-center gap-2 caption-mono text-[10px] text-zinc-500 uppercase tracking-[0.18em]">
          <PulseDot tone="emerald" size={5} /> Live
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => {
          const inner = (
            <div
              className="panel p-4 h-full relative overflow-hidden transition-all duration-300 ease-os lift"
              style={s.attention ? { border: '1px solid rgba(251,191,36,0.28)' } : undefined}
            >
              <div className="flex items-center justify-between mb-3">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center chrome-edge"
                  style={{ background: `${s.color}18`, border: `1px solid ${s.color}33` }}
                >
                  <s.icon className="w-4 h-4" style={{ color: s.color }} />
                </div>
                {s.live && <PulseDot tone="indigo" size={5} />}
                {s.attention && <PulseDot tone="amber" size={5} />}
              </div>
              <p className="num text-[24px] font-semibold tracking-tight" style={{ color: s.color }}>
                {s.value}
              </p>
              <p className="eyebrow !text-[8.5px] mt-1.5">{s.label}</p>
              <p className="text-[10.5px] text-zinc-500 mt-0.5">{s.caption}</p>
            </div>
          )
          return s.href
            ? <Link key={s.label} href={s.href} className="block press">{inner}</Link>
            : <div key={s.label}>{inner}</div>
        })}
      </div>
    </header>
  )
}
