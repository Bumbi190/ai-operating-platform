'use client'

/**
 * MarketingReviewClient — inbox-UI för Action Center (Fas 4).
 *
 * En ensam operatör (Andre): förstå varje kort < 5 sek, få klick, snabba beslut.
 * Premium, mobilvänligt, inbox-känsla. Tekniska detaljer bakom expanders.
 */
import { useCallback, useMemo, useState } from 'react'
import {
  Instagram, Facebook, CheckCircle2, RotateCcw, Pencil, ChevronDown, ChevronRight,
  ShieldCheck, ShieldAlert, ShieldX, Clock, Megaphone, Loader2, X, Save,
  MoreHorizontal, Eye, Wrench,
} from 'lucide-react'
import type { ReviewData, ReviewCard, ReviewQueue } from '@/lib/marketing/review'

const QUEUE_META: Record<ReviewQueue, { dot: string; label: string }> = {
  approved: { dot: 'bg-emerald-500', label: 'Godkända' },
  pending: { dot: 'bg-amber-500', label: 'Väntar' },
  rejected: { dot: 'bg-rose-500', label: 'Avvisade' },
  needs_input: { dot: 'bg-slate-400', label: 'Behöver underlag' },
}

function rel(iso: string | null): string {
  if (!iso) return '—'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'nyss'; if (m < 60) return `${m} min sedan`
  const h = Math.floor(m / 60); if (h < 24) return `${h} h sedan`
  return `${Math.floor(h / 24)} d sedan`
}

function ScoreBadge({ score, verdict, critical, status }: { score: number | null; verdict: string | null; critical: boolean; status: string }) {
  if (status === 'drafted' || score == null) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Guard körs…</span>
  }
  const isGood = !critical && verdict === 'approved' && score >= 90
  const isWarn = !critical && score >= 70 && score < 90
  const cls = critical || score < 70 ? 'bg-rose-50 text-rose-700' : isGood ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
  const Icon = critical || score < 70 ? ShieldX : isGood ? ShieldCheck : ShieldAlert
  const emoji = critical || score < 70 ? '⛔' : isGood ? '✅' : '⚠️'
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}><Icon className="h-3.5 w-3.5" />{score}/100 {emoji}</span>
}

function ChannelIcon({ channel }: { channel: string }) {
  return channel === 'facebook' ? <Facebook className="h-4 w-4 text-blue-600" /> : <Instagram className="h-4 w-4 text-pink-600" />
}

export function MarketingReviewClient({ initial }: { initial: ReviewData }) {
  const [data, setData] = useState<ReviewData>(initial)
  const [filter, setFilter] = useState<ReviewQueue | 'all'>('pending')
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [editCaption, setEditCaption] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const res = await fetch('/api/marketing/approvals', { cache: 'no-store' })
    if (res.ok) setData(await res.json())
  }, [])

  const act = useCallback(async (draftId: string, action: string, extra: Record<string, unknown> = {}) => {
    setBusy(draftId + action); setError(null)
    try {
      const res = await fetch('/api/marketing/approvals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draftId, action, ...extra }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Något gick fel'); return }
      setEditId(null); await refresh()
    } finally { setBusy(null) }
  }, [refresh])

  const visible = useMemo(
    () => (filter === 'all' ? data.cards : data.cards.filter((c) => c.queue === filter)),
    [data.cards, filter],
  )

  const c = data.counts
  // Köbadges: dölj "Behöver underlag" helt när 0; tona ner övriga med 0.
  const chips: Array<{ key: ReviewQueue; n: number }> = [
    { key: 'pending', n: c.pending }, { key: 'approved', n: c.approved },
    { key: 'rejected', n: c.rejected }, { key: 'needs_input', n: c.needs_input },
  ].filter((ch) => !(ch.key === 'needs_input' && ch.n === 0))

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Header */}
      <div className="mb-5 flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-pink-600" />
        <h1 className="text-xl font-bold tracking-tight">Marknadsgranskning</h1>
      </div>

      {/* Månadskontext */}
      <div className="mb-4 flex flex-wrap gap-2">
        {data.months.map((m) => (
          <span key={m.plan_key} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm">
            <span className="font-semibold">{m.label}</span>
            <span className="text-slate-500">{m.theme_name ?? 'tema ej satt'}</span>
          </span>
        ))}
      </div>

      {/* Köbadges — tonas ner vid 0; "Behöver underlag" döljs vid 0 */}
      <div className="mb-5 flex flex-wrap gap-2">
        {chips.map(({ key, n }) => (
          <button key={key} onClick={() => setFilter(filter === key ? 'all' : key)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${filter === key ? 'border-slate-900 bg-slate-900 text-white' : 'bg-white hover:bg-slate-50'} ${n === 0 && filter !== key ? 'opacity-40' : ''}`}>
            <span className={`h-2 w-2 rounded-full ${QUEUE_META[key].dot}`} />
            {QUEUE_META[key].label}<span className="font-bold">{n}</span>
          </button>
        ))}
      </div>

      {error && <div className="mb-3 flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"><span>{error}</span><button onClick={() => setError(null)}><X className="h-4 w-4" /></button></div>}

      {/* Kort */}
      {visible.length === 0 ? (
        (filter === 'pending' || filter === 'all') ? (
          <div className="rounded-xl border border-dashed bg-white/60 px-6 py-14 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
            <p className="text-base font-semibold text-slate-700">Allt granskat ✓</p>
            <p className="mt-1 text-sm text-slate-500">Inget väntar på beslut just nu.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-white/60 px-6 py-12 text-center text-slate-500">
            Inga utkast i den här kön.
          </div>
        )
      ) : (
        <div className="space-y-3">
          {visible.map((card) => (
            <Card key={card.draft_id} card={card} open={openId === card.draft_id}
              onToggle={() => setOpenId(openId === card.draft_id ? null : card.draft_id)}
              busy={busy} onAct={act}
              menuOpen={menuId === card.draft_id}
              onMenuToggle={() => setMenuId(menuId === card.draft_id ? null : card.draft_id)}
              editing={editId === card.draft_id}
              onEditStart={() => { setEditId(card.draft_id); setOpenId(card.draft_id); setMenuId(null); setEditCaption(card.caption_full); setEditUrl(card.cta.landing_url_slot && !/^<.*>$/.test(card.cta.landing_url_slot) ? card.cta.landing_url_slot : '') }}
              onEditCancel={() => setEditId(null)}
              editCaption={editCaption} setEditCaption={setEditCaption}
              editUrl={editUrl} setEditUrl={setEditUrl}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Card(props: {
  card: ReviewCard; open: boolean; onToggle: () => void; busy: string | null
  onAct: (id: string, action: string, extra?: Record<string, unknown>) => void
  menuOpen: boolean; onMenuToggle: () => void
  editing: boolean; onEditStart: () => void; onEditCancel: () => void
  editCaption: string; setEditCaption: (v: string) => void; editUrl: string; setEditUrl: (v: string) => void
}) {
  const { card, open, onToggle, busy, onAct, menuOpen, onMenuToggle, editing } = props
  const isBusy = (a: string) => busy === card.draft_id + a

  // En primär handling per kort enligt tillstånd.
  const fixable = card.blocking_gaps.length > 0
  const primary: 'approve' | 'fix' | 'return' =
    card.critical ? 'return' : fixable ? 'fix' : card.can_approve ? 'approve' : 'return'

  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm transition hover:shadow-md">
      {/* Korthuvud — komprimerat: ikon · format · månad + score */}
      <button onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3.5 text-left">
        <div className="mt-0.5" title={card.channel_label}><ChannelIcon channel={card.channel} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{card.format_label} · {card.month_label}</span>
            <ScoreBadge score={card.score} verdict={card.verdict} critical={card.critical} status={card.status} />
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{card.caption_preview || <span className="italic text-slate-400">Ingen caption</span>}{card.caption_full.length > 100 ? '…' : ''}</p>
          {card.primary_reason && (
            <p className={`mt-1.5 flex items-center gap-1.5 text-xs font-medium ${card.primary_reason.tone === 'critical' ? 'text-rose-600' : 'text-amber-600'}`}>
              {card.primary_reason.tone === 'critical' ? <ShieldX className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
              {card.primary_reason.text}
            </p>
          )}
        </div>
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
      </button>

      {/* En primär handling + overflow (⋯) */}
      <div className="flex items-center gap-2 border-t bg-slate-50/60 px-4 py-2.5">
        {primary === 'approve' && (
          <button disabled={isBusy('approve')} onClick={() => onAct(card.draft_id, 'approve')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {isBusy('approve') ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Godkänn
          </button>
        )}
        {primary === 'fix' && (
          <button onClick={props.onEditStart}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-slate-800">
            <Wrench className="h-4 w-4" />Åtgärda
          </button>
        )}
        {primary === 'return' && (
          <button disabled={isBusy('return')} onClick={() => onAct(card.draft_id, 'return')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
            {isBusy('return') ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}Skicka tillbaka
          </button>
        )}

        {card.critical && <span className="ml-2 rounded bg-rose-100 px-2 py-1 text-[11px] font-bold text-rose-700">Kan ej godkännas</span>}

        <button onClick={onMenuToggle} aria-label="Fler val" aria-expanded={menuOpen}
          className={`ml-auto inline-flex items-center rounded-lg border px-2 py-1.5 text-slate-600 hover:bg-white ${menuOpen ? 'bg-white' : ''}`}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {/* Overflow — inline rad (ingen clipping), visas vid ⋯ */}
      {menuOpen && (
        <div className="flex flex-wrap gap-1.5 border-t bg-white px-4 py-2">
          <MenuItem icon={<Eye className="h-4 w-4" />} label={open ? 'Dölj detaljer' : 'Visa detaljer'} onClick={() => { onMenuToggle(); onToggle() }} />
          {primary !== 'fix' && <MenuItem icon={<Pencil className="h-4 w-4" />} label="Redigera" onClick={props.onEditStart} />}
          {primary !== 'return' && <MenuItem icon={<RotateCcw className="h-4 w-4" />} label="Skicka tillbaka" onClick={() => { onMenuToggle(); onAct(card.draft_id, 'return') }} />}
          {primary === 'fix' && card.can_approve && <MenuItem icon={<CheckCircle2 className="h-4 w-4" />} label="Godkänn ändå" onClick={() => { onMenuToggle(); onAct(card.draft_id, 'approve') }} />}
        </div>
      )}

      {/* Detalj */}
      {open && (
        <div className="border-t px-4 py-4 text-sm">
          {editing ? (
            <EditPanel {...props} />
          ) : (
            <>
              <Section title="Caption">
                <p className="whitespace-pre-wrap text-slate-700">{card.caption_full || '—'}</p>
              </Section>
              {/* Beslutsrelevant först: problem → CTA → att tänka på */}
              {card.violations.length > 0 && (
                <Section title="Problem">
                  <ul className="space-y-1">
                    {card.violations.map((v, i) => {
                      const sev = v.severity === 'CRITICAL' ? 'Allvarligt' : v.severity === 'HIGH' ? 'Viktigt' : v.severity === 'MEDIUM' ? 'Mindre' : 'Info'
                      return <li key={i} className="flex gap-2"><span className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${v.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{sev}</span><span className="text-slate-700">{v.explanation}</span></li>
                    })}
                  </ul>
                </Section>
              )}
              <Section title="CTA">
                <span className="rounded bg-slate-100 px-2 py-0.5">{card.cta.label ?? '—'}</span>
                {(card.cta.type === 'trial' || card.cta.type === 'subscribe') && (
                  <span className="ml-2 text-xs">{card.cta.landing_url_slot && !/^<.*>$/.test(card.cta.landing_url_slot) ? card.cta.landing_url_slot : <span className="text-rose-600">landningssida saknas</span>}</span>
                )}
              </Section>
              {card.warnings.length > 0 && (
                <Section title="Att tänka på">
                  <ul className="list-disc space-y-0.5 pl-5 text-slate-600">
                    {card.warnings.map((w, i) => <li key={i}>{w.explanation}</li>)}
                  </ul>
                </Section>
              )}

              {/* Ej beslutskritiskt — dolt bakom expander */}
              <details className="mt-1 rounded-lg bg-slate-50 px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-600">Bilder</summary>
                <ul className="mt-2 space-y-0.5">
                  {card.asset_refs.length === 0 ? <li className="text-slate-400">—</li> : card.asset_refs.map((a, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-slate-700">{a.ref ?? '(ingen)'}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${a.status === 'available' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{a.status}</span>
                    </li>
                  ))}
                </ul>
              </details>

              {/* Audit-tidslinje */}
              <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-600">Tidslinje</summary>
                <ol className="mt-2 space-y-2">
                  {card.audit.map((step, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      <span className={`h-2 w-2 rounded-full ${step.at ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <span className="font-medium text-slate-700">{step.label}</span>
                      <Clock className="h-3 w-3 text-slate-400" /><span className="text-slate-500">{rel(step.at)}</span>
                    </li>
                  ))}
                </ol>
              </details>

              {/* Tekniska detaljer */}
              <details className="mt-2 rounded-lg bg-slate-50 px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-600">Tekniska detaljer</summary>
                <dl className="mt-2 space-y-1 text-xs text-slate-500">
                  <div>draft_key: <code>{card.draft_key}</code> (v{card.version})</div>
                  <div>status: <code>{card.status}</code></div>
                  {card.audit.map((s, i) => <div key={i}>{s.label} run_id: <code>{s.run_id ?? '—'}</code></div>)}
                  {card.blocking_gaps.length > 0 && <div>blockerande luckor: {card.blocking_gaps.join(', ')}</div>}
                </dl>
              </details>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
      {icon}{label}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      <div>{children}</div>
    </div>
  )
}

function EditPanel(props: {
  card: ReviewCard; busy: string | null
  onAct: (id: string, action: string, extra?: Record<string, unknown>) => void
  onEditCancel: () => void
  editCaption: string; setEditCaption: (v: string) => void; editUrl: string; setEditUrl: (v: string) => void
}) {
  const { card, busy, onAct, onEditCancel, editCaption, setEditCaption, editUrl, setEditUrl } = props
  const needsUrl = card.cta.type === 'trial' || card.cta.type === 'subscribe'
  const saving = busy === card.draft_id + 'edit'
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Caption</label>
        <textarea value={editCaption} onChange={(e) => setEditCaption(e.target.value)} rows={5}
          className="w-full rounded-lg border px-3 py-2 text-sm" />
      </div>
      {needsUrl && (
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Landningssida (UTM-URL)</label>
          <input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder="https://familje-stunden.se/…"
            className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
      )}
      <div className="flex gap-2">
        <button disabled={saving} onClick={() => onAct(card.draft_id, 'edit', { caption_rendered: editCaption, landing_url: editUrl })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Spara & validera om
        </button>
        <button onClick={onEditCancel} className="rounded-lg border px-3 py-1.5 text-sm">Avbryt</button>
      </div>
      <p className="text-xs text-slate-400">Sparar ändringen och kör Guard igen så poängen uppdateras.</p>
    </div>
  )
}
