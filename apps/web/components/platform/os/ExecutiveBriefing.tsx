'use client'

/**
 * ExecutiveBriefing — Omniras nya hemvy.
 *
 * Istället för att möta en dashboard möter operatören en chief-of-staff som
 * direkt briefar: vad hände, vad spelar roll, vad bör du göra. Allt grundat i
 * riktig data (se lib/os/briefing.ts).
 */

import { useState } from 'react'
import Link from 'next/link'
import {
  Sparkles, CheckCircle2, AlertTriangle, Circle, ChevronRight,
  ClipboardCheck, CalendarDays, PlayCircle, MessageSquare, ListChecks,
} from 'lucide-react'
import { PulseDot } from './PulseDot'
import type { ExecutiveBriefing as Briefing, BriefingLine } from '@/lib/os/briefing'

function sek(n: number): string {
  if (n <= 0) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',')} k kr`
  return `${Math.round(n)} kr`
}

interface QuickAction {
  label: string
  icon: any
  href?: string
  onClick?: () => void
}

export function ExecutiveBriefing({
  briefing,
  monthlyPackageSlug,
}: {
  briefing: Briefing
  monthlyPackageSlug?: string | null
}) {
  const [showPriorities, setShowPriorities] = useState(briefing.priorities.length > 0)

  const actions: QuickAction[] = [
    { label: 'Visa prioriteringar', icon: ListChecks, onClick: () => setShowPriorities(v => !v) },
    ...(monthlyPackageSlug ? [{ label: 'Kör månadspaket', icon: PlayCircle, href: `/projects/${monthlyPackageSlug}/workflows` }] : []),
    { label: 'Skapa veckoplan', icon: CalendarDays, href: '/planning' },
    { label: 'Granska godkännanden', icon: ClipboardCheck, href: '/approvals' },
    { label: 'Fråga assistenten', icon: MessageSquare, href: '/chat' },
  ]

  return (
    <section className="mb-8">
      {/* Hälsning + lägesmening */}
      <div className="flex items-start gap-3 mb-1">
        <Sparkles className="w-5 h-5 mt-1 shrink-0" style={{ color: '#d4a574' }} />
        <div>
          <p className="caption-mono text-[10px] text-zinc-500 uppercase tracking-[0.2em] mb-1">
            {briefing.dateLabel} · Dagens briefing
          </p>
          <h1 className="display-hero text-gradient-instrument text-[26px] md:text-[30px] leading-tight">
            {briefing.greeting}, {briefing.operatorName}
          </h1>
        </div>
      </div>
      <p className="text-[15px] text-zinc-300 leading-relaxed max-w-[44rem] ml-8 mb-5">
        {briefing.headline}
      </p>

      {/* Briefingrader per verksamhet */}
      <div className="ml-8 space-y-2 mb-6">
        {briefing.lines.map((l) => <BriefingRow key={l.slug} line={l} />)}
        {briefing.lines.length === 0 && (
          <p className="text-[13px] text-zinc-500">Inga verksamheter ännu — skapa en för att börja.</p>
        )}
      </div>

      {/* Inline-kontext: intäkter idag */}
      <div className="ml-8 flex items-center gap-5 mb-6 text-[12px] text-zinc-400">
        <span>Dagens intäkter: <strong className="text-white/90 num">{sek(briefing.revenueTodaySek)}</strong></span>
        <span className="text-zinc-600">·</span>
        <span>{briefing.attentionCount === 0 ? 'Inget kräver dig' : `${briefing.attentionCount} kräver dig`}</span>
      </div>

      {/* Quick actions */}
      <div className="ml-8 flex flex-wrap gap-2 mb-2">
        {actions.map((a) => a.href
          ? (
            <Link key={a.label} href={a.href} className="btn-ghost ease-os press inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-medium">
              <a.icon className="w-3.5 h-3.5" /> {a.label}
            </Link>
          ) : (
            <button key={a.label} onClick={a.onClick} className="btn-ghost ease-os press inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-medium">
              <a.icon className="w-3.5 h-3.5" /> {a.label}
            </button>
          ))}
      </div>

      {/* Prioriteringar (utfällbara) */}
      {showPriorities && briefing.priorities.length > 0 && (
        <div className="ml-8 mt-4 space-y-2 animate-fade-in-up" style={{ animationFillMode: 'both' }}>
          <p className="eyebrow eyebrow-gold !text-[8.5px]">Prioriteringar</p>
          {briefing.priorities.map((p, i) => (
            <Link
              key={i}
              href={p.href}
              className="flex items-center gap-3 px-4 py-3 rounded-xl group transition-colors press"
              style={{
                background: p.tone === 'critical' ? 'rgba(248,113,113,0.06)' : 'rgba(251,191,36,0.05)',
                border: `1px solid ${p.tone === 'critical' ? 'rgba(248,113,113,0.2)' : 'rgba(251,191,36,0.2)'}`,
              }}
            >
              <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: p.tone === 'critical' ? '#f87171' : '#fbbf24' }} />
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-medium text-white/90 truncate">{p.label}</p>
                <p className="text-[11px] text-zinc-500 truncate">{p.detail}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

function BriefingRow({ line }: { line: BriefingLine }) {
  const icon =
    line.status === 'ok'        ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> :
    line.status === 'attention' ? <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" /> :
                                  <Circle className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
  return (
    <Link href={`/projects/${line.slug}`} className="flex items-center gap-3 group press">
      {icon}
      <span className="text-[13.5px]">
        <span className="font-semibold" style={{ color: line.color }}>{line.business}</span>
        <span className="text-zinc-500"> — </span>
        <span className="text-zinc-300">{line.message}</span>
      </span>
      <ChevronRight className="w-3.5 h-3.5 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  )
}
