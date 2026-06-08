/**
 * BusinessCard — ett levande verksamhetskort.
 *
 * Ska kännas som en verksamhet, inte en teknisk modul. Visar status, vad som
 * hänt denna månad, senaste publicering och agentaktivitet — och viktigast:
 * vad som behöver operatörens uppmärksamhet. Allt grundat i riktig data.
 */

import Link from 'next/link'
import { ArrowRight, AlertTriangle, ClipboardCheck, Moon, Send } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'
import { PulseDot } from './PulseDot'
import type { BusinessSnapshot } from '@/lib/os/business'
import { businessHealth } from '@/lib/os/health'

const STATUS_META: Record<BusinessSnapshot['status'], { label: string; color: string; tone: 'emerald' | 'amber' | 'zinc' }> = {
  active:    { label: 'Aktiv',                 color: '#34d399', tone: 'emerald' },
  attention: { label: 'Behöver uppmärksamhet', color: '#fbbf24', tone: 'amber' },
  idle:      { label: 'Vilande',               color: '#71717a', tone: 'zinc' },
}

function fmt(m: { value: number; kind?: string }): string {
  if (m.kind === 'currency') {
    const n = m.value
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',')} k kr`
    return `${n} kr`
  }
  return `${m.value}`
}

function ago(iso: string | null): string | null {
  if (!iso) return null
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: sv }) } catch { return null }
}

export function BusinessCard({ business, delay = 0 }: { business: BusinessSnapshot; delay?: number }) {
  const meta = STATUS_META[business.status]
  const health = businessHealth(business)
  const hasAttention = business.pendingApprovals > 0 || business.failedRuns > 0
  const lastActive = ago(business.lastActivityAt)
  const pubAgo = ago(business.latestPublication?.at ?? null)

  return (
    <div
      className="panel animate-fade-in-up relative overflow-hidden group flex flex-col p-6 transition-all duration-300 ease-os lift"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px opacity-50 group-hover:opacity-100 transition-opacity"
        style={{ background: `linear-gradient(90deg, transparent, ${business.color}, transparent)` }}
      />
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 80% 45% at 50% 0%, ${business.color}14 0%, transparent 70%)` }}
      />

      {/* Header */}
      <div className="relative flex items-start justify-between mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center chrome-edge shrink-0"
            style={{ background: `linear-gradient(135deg, ${business.color}28 0%, ${business.color}0e 100%)`, border: `1px solid ${business.color}55` }}
          >
            <span className="block w-3 h-3 rounded-sm rotate-45" style={{ background: `linear-gradient(135deg, ${business.color}, ${business.color}aa)`, boxShadow: `0 0 8px ${business.color}aa` }} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-[16px] text-white/95 tracking-tight truncate">{business.name}</h3>
            <span className="inline-flex items-center gap-1.5 mt-0.5">
              <PulseDot tone={meta.tone === 'zinc' ? 'indigo' : meta.tone} size={4} />
              <span className="text-[10.5px] font-medium" style={{ color: meta.color }}>{meta.label}</span>
              {lastActive && <span className="text-[10px] text-meta">· aktiv {lastActive}</span>}
            </span>
          </div>
        </div>
        {/* Health Score */}
        <div className="flex flex-col items-end shrink-0" title={health.factors.join(' · ')}>
          <span className="num text-[20px] font-semibold tracking-tight leading-none" style={{ color: health.color }}>{health.score}</span>
          <span className="text-[9px] font-medium mt-0.5" style={{ color: health.color }}>{health.label}</span>
        </div>
      </div>

      {/* Denna månad */}
      <div className="relative flex-1">
        <p className="eyebrow !text-[8.5px] mb-3">Denna månad</p>
        {business.metrics.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {business.metrics.slice(0, 4).map((m) => (
              <div key={m.label} className="min-w-0">
                <p className="num text-[19px] font-semibold text-white/90 tracking-tight">{fmt(m)}</p>
                <p className="text-[10.5px] text-secondary leading-tight mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[12px] text-secondary py-2">
            <Moon className="w-3.5 h-3.5 text-meta" />
            Ingen aktivitet registrerad denna månad
          </div>
        )}

        {/* Senaste publicering */}
        {business.latestPublication && (
          <div className="mt-4 flex items-start gap-2 text-[11.5px]">
            <Send className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: `${business.color}cc` }} />
            <span className="min-w-0">
              <span className="text-secondary">Senast publicerat{pubAgo ? ` ${pubAgo}` : ''}: </span>
              <span className="text-zinc-300">"{business.latestPublication.title.slice(0, 64)}{business.latestPublication.title.length > 64 ? '…' : ''}"</span>
            </span>
          </div>
        )}
      </div>

      {/* Drift-strip: agentaktivitet + beslut */}
      <div
        className="relative mt-5 pt-4 flex items-center gap-5 text-[11px] text-secondary"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <span><strong className="text-zinc-300 font-semibold num">{business.runs7d}</strong> körningar · 7d</span>
        <span><strong className="text-zinc-300 font-semibold num">{business.contentThisMonth}</strong> producerat</span>
        <span><strong className="text-zinc-300 font-semibold num">{business.decisions30d}</strong> beslut · 30d</span>
      </div>

      {/* Behöver uppmärksamhet */}
      {hasAttention && (
        <div className="relative mt-4 pt-4 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="eyebrow eyebrow-gold !text-[8.5px]">Behöver uppmärksamhet</p>
          {business.pendingApprovals > 0 && (
            <Link href="/approvals" className="flex items-center gap-2 text-[12px] text-amber-200/90 hover:text-amber-100 transition-colors press">
              <ClipboardCheck className="w-3.5 h-3.5 shrink-0" />
              {business.pendingApprovals} objekt väntar på godkännande
            </Link>
          )}
          {business.failedRuns > 0 && (
            <Link href="/system" className="flex items-center gap-2 text-[12px] text-rose-200/90 hover:text-rose-100 transition-colors press">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {business.failedRuns} {business.failedRuns === 1 ? 'körning' : 'körningar'} att åtgärda
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
