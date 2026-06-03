import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { AlertTriangle, Flame, Info, ArrowRight, Clock, CheckCircle2 } from 'lucide-react'

import type { Project } from '@/lib/supabase/types'
import { fetchBusinessSnapshots } from '@/lib/os/business'
import { buildAttentionItems, formatEta, type AttentionItem, type Severity } from '@/lib/os/priority'
import { OSPage, OSLayer, EmptyState, AgenticButton } from '@/components/platform/os'

export const dynamic = 'force-dynamic'

// ─── Action Center — operatörens mission board (V3, Feature 5) ─────────────────

export default async function ActionCenterPage() {
  const supabase = await createClient()
  const db = createAdminClient()

  const { data: projectsRaw } = await supabase
    .from('projects')
    .select('id, owner_id, name, slug, color, settings, created_at')
    .order('created_at', { ascending: true })
  const projects = (projectsRaw ?? []) as Project[]

  const businesses = await fetchBusinessSnapshots(db, projects)

  const [pubCountRes, insCountRes] = await Promise.all([
    (db.from('media_scripts') as any).select('id', { count: 'exact', head: true }).eq('status', 'published'),
    (db.from('media_insights') as any).select('id', { count: 'exact', head: true }),
  ])
  const instagramInsightsMissing = (pubCountRes.count ?? 0) > 0 && (insCountRes.count ?? 0) === 0

  const items = buildAttentionItems(businesses, { instagramInsightsMissing })

  // Token-larm direkt från token_health (samma sanningskälla som Operations Center).
  try {
    const { data: tokens } = await (db.from('token_health') as any)
      .select('platform, status, days_left')
    for (const t of (tokens ?? []) as Array<{ platform: string; status: string; days_left: number | null }>) {
      if (t.status === 'expired' || t.status === 'error') {
        items.unshift({
          id: `token-${t.platform}`, severity: 'urgent',
          title: `${t.platform}-token ${t.status === 'expired' ? 'har gått ut' : 'svarar med fel'}`,
          reason: 'Publicering till den här kanalen kommer att misslyckas tills tokenet förnyas.',
          action: { href: '/atlas/operations', label: 'Visa' },
        } as AttentionItem)
      } else if (t.status === 'warning') {
        items.unshift({
          id: `token-${t.platform}`, severity: 'important',
          title: `${t.platform}-token löper ut${t.days_left != null ? ` om ${t.days_left} dagar` : ' snart'}`,
          reason: 'Förnya innan utgång så att publiceringen inte stoppas.',
          action: { href: '/atlas/operations', label: 'Visa' },
        } as AttentionItem)
      }
    }
  } catch { /* token_health saknas ännu — icke-kritiskt */ }

  // Pipeline-steg som nått max försök (kräver operatör) → brådskande.
  try {
    const { data: stuck } = await (db.from('media_scripts') as any)
      .select('id, hook, voice_status, video_status, voice_attempts, render_attempts, pipeline_failed_reason')
      .or('and(voice_status.eq.failed,voice_attempts.gte.3),and(video_status.eq.failed,render_attempts.gte.3)')
      .limit(10)
    for (const s of (stuck ?? []) as Array<{ id: string; hook: string | null; voice_status: string; pipeline_failed_reason: string | null }>) {
      const step = s.voice_status === 'failed' ? 'voiceover' : 'render'
      items.unshift({
        id: `pipeline-${s.id}`, severity: 'urgent',
        title: `Video fastnade i ${step} — max försök nått`,
        reason: `"${(s.hook ?? 'Video').slice(0, 50)}" — ${s.pipeline_failed_reason ?? 'okänt fel'}. Auto-retry uttömt; behöver din åtgärd.`,
        action: { href: '/atlas/operations', label: 'Visa' },
      } as AttentionItem)
    }
  } catch { /* pipeline-kolumner saknas ännu — icke-kritiskt */ }

  // Cron-heartbeat: jobb som är döda/sena/endpoint-trasiga.
  try {
    const { data: hb } = await (db.from('cron_heartbeat') as any)
      .select('jobname, label, status, detail')
      .in('status', ['late', 'dead', 'endpoint_failing'])
    for (const h of (hb ?? []) as Array<{ jobname: string; label: string; status: string; detail: string | null }>) {
      const urgent = h.status === 'dead' || h.status === 'endpoint_failing'
      items.unshift({
        id: `heartbeat-${h.jobname}`, severity: urgent ? 'urgent' : 'important',
        title: h.status === 'dead' ? `${h.label} verkar dött`
          : h.status === 'endpoint_failing' ? `${h.label} fyrar men gör inget`
          : `${h.label} är sent`,
        reason: `${h.detail ?? ''} — automationen ${urgent ? 'kör inte som den ska' : 'har missat sitt schema'}.`,
        action: { href: '/atlas/operations', label: 'Visa' },
      } as AttentionItem)
    }
  } catch { /* cron_heartbeat saknas ännu — icke-kritiskt */ }

  const urgent    = items.filter(i => i.severity === 'urgent')
  const important = items.filter(i => i.severity === 'important')
  const info      = items.filter(i => i.severity === 'info')
  const actionable = urgent.length + important.length

  return (
    <OSPage className="boot-in">
      <OSLayer layer="hero">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-2xl flex items-center justify-center chrome-edge shrink-0"
            style={{ background: 'rgba(212,165,116,0.14)', border: '1px solid rgba(212,165,116,0.3)' }}>
            <Flame className="w-4 h-4" style={{ color: '#d4a574' }} />
          </div>
          <div>
            <p className="caption-mono text-[10px] text-zinc-500 uppercase tracking-[0.2em] mb-1">Mission board</p>
            <h1 className="display-hero text-gradient-instrument text-[26px] md:text-[30px] leading-tight">Action Center</h1>
            <p className="text-[13px] text-zinc-400 mt-1">
              {actionable === 0
                ? 'Inget kräver åtgärd just nu — allt rullar på.'
                : `${actionable} ${actionable === 1 ? 'sak' : 'saker'} att hantera, prioriterade åt dig.`}
            </p>
          </div>
        </div>
      </OSLayer>

      <OSLayer layer="operational" className="space-y-7">
        <Group title="Brådskande" tone="urgent" icon={<AlertTriangle className="w-4 h-4" />} items={urgent} />
        <Group title="Viktigt" tone="important" icon={<Flame className="w-4 h-4" />} items={important} />
        <Group title="Information" tone="info" icon={<Info className="w-4 h-4" />} items={info} />

        {items.length === 1 && items[0].id === 'all-clear' && (
          <EmptyState
            eyebrow="Allt klart"
            title="Inget på din bricka"
            body="Inga fel, inga väntande godkännanden, och alla aktiva verksamheter mår bra. Assistenten hör av sig om något dyker upp."
            icon={<CheckCircle2 className="w-6 h-6 text-emerald-300" />}
          />
        )}
      </OSLayer>
    </OSPage>
  )
}

const TONE: Record<Severity, { color: string }> = {
  urgent:    { color: '#f87171' },
  important: { color: '#fbbf24' },
  info:      { color: '#34d399' },
}

function Group({ title, tone, icon, items }: { title: string; tone: Severity; icon: React.ReactNode; items: AttentionItem[] }) {
  if (items.length === 0) return null
  const color = TONE[tone].color
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color }}>{icon}</span>
        <p className="eyebrow !text-[9px]" style={{ color }}>{title}</p>
        <span className="caption-mono text-[10px] text-zinc-600">{items.length}</span>
      </div>
      <div className="space-y-3">
        {items.map((item) => <ActionRow key={item.id} item={item} color={color} />)}
      </div>
    </section>
  )
}

function ActionRow({ item, color }: { item: AttentionItem; color: string }) {
  return (
    <div className="panel p-5 relative overflow-hidden flex items-start gap-4">
      <div className="absolute inset-y-0 left-0 w-0.5" style={{ background: color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {item.business && (
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium" style={{ color: item.color ?? color }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: item.color ?? color }} />
              {item.business}
            </span>
          )}
          {item.etaMin != null && (
            <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500">
              <Clock className="w-3 h-3" /> {formatEta(item.etaMin)}
            </span>
          )}
        </div>
        <p className="text-[14px] font-medium text-white/95 tracking-tight mt-1.5">{item.title}</p>
        <p className="text-[12px] text-zinc-400 mt-1 leading-relaxed">{item.reason}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0 self-center">
        {item.agentic && (
          <AgenticButton endpoint={item.agentic.endpoint} body={item.agentic.body} label={item.agentic.label} />
        )}
        {item.action && (
          <Link
            href={item.action.href}
            className={`ease-os press inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold ${item.agentic ? 'btn-ghost' : 'btn-omnira'}`}
          >
            {item.action.label} <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
    </div>
  )
}
