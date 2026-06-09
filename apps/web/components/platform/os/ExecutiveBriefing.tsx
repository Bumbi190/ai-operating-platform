'use client'

/**
 * ExecutiveBriefing — Omniras hemvy (V3).
 *
 * En chief-of-staff som briefar: hälsning, prioritetsordnade rader (🔴🟡🟢),
 * en konkret rekommenderad åtgärd med uppskattad tid, och topp-prioriteringar
 * med motivering. Allt grundat i riktig data via Priority Engine + Health Score.
 */

import { useState } from 'react'
import Link from 'next/link'
import {
  Sparkles, CheckCircle2, AlertTriangle, Circle, ChevronRight,
  ClipboardCheck, CalendarDays, PlayCircle, MessageSquare, ListChecks, Clock, ArrowRight,
} from 'lucide-react'
import type { ExecutiveBriefing as Briefing, BriefingLine } from '@/lib/os/briefing'
import type { AttentionItem } from '@/lib/os/priority'
import { resolveDestination } from '@/lib/nav/registry'

function sek(n: number): string {
  if (n <= 0) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',')} k kr`
  return `${Math.round(n)} kr`
}

interface QuickAction { label: string; icon: any; href?: string; onClick?: () => void }

export function ExecutiveBriefing({
  briefing,
  monthlyPackageSlug,
}: {
  briefing: Briefing
  monthlyPackageSlug?: string | null
}) {
  const [showPriorities, setShowPriorities] = useState(briefing.priorities.some(p => p.severity !== 'info'))

  const actions: QuickAction[] = [
    { label: 'Vad behöver min uppmärksamhet?', icon: ListChecks, onClick: () => setShowPriorities(v => !v) },
    ...(monthlyPackageSlug ? [{ label: 'Kör månadspaket', icon: PlayCircle, href: `/projects/${monthlyPackageSlug}/workflows` }] : []),
    { label: 'Skapa veckoplan', icon: CalendarDays, href: resolveDestination('planning')?.href ?? '/planning' },
    { label: 'Granska godkännanden', icon: ClipboardCheck, href: resolveDestination('approvals', { filters: { state: 'pending' } })?.href ?? '/approvals' },
    { label: 'Fråga assistenten', icon: MessageSquare, href: resolveDestination('chat')?.href ?? '/chat' },
  ]

  return (
    <section className="mb-8">
      {/* Hälsning + lägesmening */}
      <div className="flex items-start gap-3 mb-1">
        <Sparkles className="w-5 h-5 mt-1 shrink-0" style={{ color: '#d4a574' }} />
        <div>
          <p className="caption-mono text-[10px] text-secondary uppercase tracking-[0.2em] mb-1">
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
      <div className="ml-8 space-y-2 mb-5">
        {briefing.lines.map((l) => <BriefingRow key={l.slug} line={l} />)}
        {briefing.lines.length === 0 && (
          <p className="text-[13px] text-secondary">Inga verksamheter ännu — skapa en för att börja.</p>
        )}
      </div>

      {/* Rekommenderad åtgärd */}
      {briefing.recommended && briefing.recommended.severity !== 'info' && (
        <div
          className="ml-8 mb-5 max-w-[44rem] rounded-2xl p-4 relative overflow-hidden"
          style={{ background: 'rgba(212,165,116,0.06)', border: '1px solid rgba(212,165,116,0.22)' }}
        >
          <p className="eyebrow eyebrow-gold !text-[8.5px] mb-1.5">Rekommenderad åtgärd</p>
          <p className="text-[14px] text-white/95 font-medium tracking-tight">{briefing.recommended.title}</p>
          <p className="text-[12px] text-zinc-400 mt-1 leading-relaxed">{briefing.recommended.reason}</p>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {briefing.recommended.action && (
              <Link
                href={briefing.recommended.action.href}
                className="btn-omnira ease-os press inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-semibold"
              >
                {briefing.recommended.action.label} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
            {briefing.recommendedEta && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-secondary">
                <Clock className="w-3.5 h-3.5" /> Uppskattad tid: {briefing.recommendedEta}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Inline-kontext */}
      <div className="ml-8 flex items-center gap-5 mb-5 text-[12px] text-zinc-400">
        <span>Dagens intäkter: <strong className="text-white/90 num">{sek(briefing.revenueTodaySek)}</strong></span>
        <span className="text-meta">·</span>
        <span>{briefing.attentionCount === 0 ? 'Inget kräver dig' : `${briefing.attentionCount} kräver dig`}</span>
      </div>

      {/* Quick actions */}
      <div className="ml-8 flex flex-wrap gap-2">
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

      {/* Prioriteringar (utfällbara) — topp-3 med motivering */}
      {showPriorities && briefing.priorities.length > 0 && (
        <div className="ml-8 mt-4 space-y-2 animate-fade-in-up" style={{ animationFillMode: 'both' }}>
          <p className="eyebrow eyebrow-gold !text-[8.5px]">Vad behöver din uppmärksamhet</p>
          {briefing.priorities.map((p, i) => <PriorityRow key={p.id} item={p} index={i + 1} />)}
        </div>
      )}
    </section>
  )
}

function PriorityRow({ item, index }: { item: AttentionItem; index: number }) {
  const color = item.severity === 'urgent' ? '#f87171' : item.severity === 'important' ? '#fbbf24' : '#34d399'
  const inner = (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl group transition-colors press"
      style={{ background: `${color}0f`, border: `1px solid ${color}33` }}
    >
      <span className="num text-[13px] font-bold shrink-0" style={{ color }}>{index}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-medium text-white/90 truncate">{item.title}</p>
        <p className="text-[11px] text-secondary truncate">{item.reason}</p>
      </div>
      {item.action && <ChevronRight className="w-4 h-4 text-meta group-hover:text-zinc-300 transition-colors shrink-0" />}
    </div>
  )
  return item.action ? <Link href={item.action.href}>{inner}</Link> : <div>{inner}</div>
}

function BriefingRow({ line }: { line: BriefingLine }) {
  const icon =
    line.dot === 'green' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> :
    line.dot === 'red'   ? <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" /> :
                           <Circle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
  return (
    <Link href={`/projects/${line.slug}`} className="flex items-center gap-3 group press">
      {icon}
      <span className="text-[13.5px]">
        <span className="font-semibold" style={{ color: line.color }}>{line.business}</span>
        <span className="text-secondary"> — </span>
        <span className="text-zinc-300">{line.message}</span>
      </span>
      <ChevronRight className="w-3.5 h-3.5 text-faint opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  )
}
