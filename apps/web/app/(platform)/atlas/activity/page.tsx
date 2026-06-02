/**
 * Atlas Activity Center — live transparency.
 *
 * Answers "did anything actually happen?": what's running now, what's waiting on
 * the operator, and what just happened across all businesses. Read-only,
 * auto-refreshing. Sources: runs, workflows, projects, agent_messages,
 * approvals, media_scripts.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { OSPage, OSLayer } from '@/components/platform/os'
import { Activity, Loader2, CheckCircle2, XCircle, ShieldCheck, MessageSquare } from 'lucide-react'
import { LiveRefresh } from './LiveRefresh'

export const dynamic = 'force-dynamic'

type AnyDb = any

function rel(iso: string | null): string {
  if (!iso) return '—'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'nyss'
  if (m < 60) return `${m} min sedan`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h sedan`
  return `${Math.floor(h / 24)} d sedan`
}

export default async function AtlasActivity() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db: AnyDb = createAdminClient()
  const safe = async <T,>(p: Promise<{ data: T | null }>, fb: T): Promise<T> => {
    try { const { data } = await p; return data ?? fb } catch { return fb }
  }

  const cutoff = new Date(Date.now() - 2 * 864e5).toISOString()

  const [runs, workflows, projects, messages, pendingApprovals, pendingScripts, managerTasks] = await Promise.all([
    safe<any[]>(db.from('runs').select('id, status, started_at, finished_at, error, project_id, workflow_id').gte('started_at', cutoff).order('started_at', { ascending: false }).limit(40), []),
    safe<any[]>(db.from('workflows').select('id, name'), []),
    safe<any[]>(db.from('projects').select('id, name, color'), []),
    safe<any[]>(db.from('agent_messages').select('id, from_agent, message_type, content, created_at').order('created_at', { ascending: false }).limit(8), []),
    safe<any[]>(db.from('approvals').select('id, output_key, created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(20), []),
    safe<any[]>(db.from('media_scripts').select('id, hook, status').in('status', ['pending_review', 'needs_review']).limit(20), []),
    safe<any[]>(db.from('manager_tasks').select('id, title, status, priority, project_id, created_at').order('created_at', { ascending: false }).limit(15), []),
  ])

  const wfName = new Map(workflows.map(w => [w.id, w.name]))
  const projById = new Map(projects.map(p => [p.id, p]))
  const label = (r: any) => wfName.get(r.workflow_id) || 'Arbetsflöde'
  const projName = (r: any) => projById.get(r.project_id)?.name ?? '—'

  const running = runs.filter(r => ['running', 'pending'].includes(String(r.status)))
  const recent  = runs.filter(r => ['done', 'failed'].includes(String(r.status))).slice(0, 12)
  const pendingTotal = pendingApprovals.length + pendingScripts.length

  return (
    <OSPage className="animate-fade-in">
      <LiveRefresh seconds={12} />

      <OSLayer layer="hero">
        <div>
          <p className="eyebrow eyebrow-accent mb-3">Atlas · Transparens</p>
          <h1 className="text-2xl 2xl:text-3xl font-bold tracking-tight">Activity Center</h1>
          <p className="text-sm text-zinc-400 mt-2">Vad som körs nu, vad som väntar på dig, och vad som nyss hände. Uppdateras live.</p>
        </div>
      </OSLayer>

      {/* ── JUST NU ───────────────────────────────────────────────────────── */}
      <OSLayer layer="operational" className="space-y-3">
        <SectionHeader eyebrow="Just nu" title={running.length > 0 ? `${running.length} körning${running.length === 1 ? '' : 'ar'} aktiva` : 'Inget kör just nu'} />
        {running.length === 0 ? (
          <Empty msg="Alla agenter är inaktiva. Inget pågår." />
        ) : (
          <div className="space-y-2">
            {running.map(r => (
              <div key={r.id} className="rounded-xl border border-indigo-500/25 bg-indigo-500/[0.05] p-4 flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-indigo-300 animate-spin shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{label(r)}</p>
                  <p className="text-[11px] text-muted-foreground">{projName(r)} · startade {rel(r.started_at)}</p>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-indigo-300 border border-indigo-500/30 rounded-full px-2 py-0.5">{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </OSLayer>

      {/* ── VÄNTAR PÅ BESLUT ──────────────────────────────────────────────── */}
      <OSLayer layer="intelligence" className="space-y-3">
        <SectionHeader eyebrow="Väntar på dig" title={pendingTotal > 0 ? `${pendingTotal} beslut väntar` : 'Inga väntande beslut'} />
        {pendingTotal === 0 ? (
          <Empty msg="Inget kräver din granskning just nu." />
        ) : (
          <div className="rounded-xl border border-border bg-card divide-y divide-border/50">
            {pendingScripts.map(s => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-sm truncate flex-1">{s.hook || 'Manus att granska'}</p>
                <Link href="/approvals" className="text-[11px] text-indigo-400 hover:underline shrink-0">Granska →</Link>
              </div>
            ))}
            {pendingApprovals.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-sm truncate flex-1">{a.output_key || 'Godkännande'}</p>
                <Link href="/approvals" className="text-[11px] text-indigo-400 hover:underline shrink-0">Granska →</Link>
              </div>
            ))}
          </div>
        )}
      </OSLayer>

      {/* ── SENASTE BESLUTEN (agent messages) ─────────────────────────────── */}
      {messages.length > 0 && (
        <OSLayer layer="intelligence" className="space-y-3">
          <SectionHeader eyebrow="Senaste besluten" title="Vad Atlas och agenterna tänkt" />
          <div className="rounded-xl border border-border bg-card divide-y divide-border/50">
            {messages.map(m => (
              <div key={m.id} className="flex items-start gap-3 px-4 py-3">
                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-muted-foreground">{m.from_agent || 'Agent'} · {String(m.message_type).replace(/_/g, ' ')} · {rel(m.created_at)}</p>
                  <p className="text-sm truncate">{typeof m.content === 'string' ? m.content.slice(0, 140) : '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </OSLayer>
      )}

      {/* ── DELEGERADE UPPDRAG ────────────────────────────────────────────── */}
      {managerTasks.length > 0 && (
        <OSLayer layer="intelligence" className="space-y-3">
          <SectionHeader eyebrow="Delegering" title="Uppdrag Atlas tilldelat" />
          <div className="rounded-xl border border-border bg-card divide-y divide-border/50">
            {managerTasks.map(t => {
              const s = String(t.status)
              const icon = s === 'done' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                : ['failed', 'cancelled'].includes(s) ? <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                : s === 'in_progress' ? <Loader2 className="w-4 h-4 text-indigo-300 animate-spin shrink-0" />
                : <span className="w-3.5 h-3.5 rounded-full border border-zinc-500 shrink-0" />
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                  {icon}
                  <p className="text-sm truncate flex-1">{t.title}</p>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">{s.replace(/_/g, ' ')}</span>
                </div>
              )
            })}
          </div>
        </OSLayer>
      )}

      {/* ── NYLIGEN KLART ─────────────────────────────────────────────────── */}
      <OSLayer layer="intelligence" className="space-y-3">
        <SectionHeader eyebrow="Nyligen" title="Senaste körningarna" />
        {recent.length === 0 ? (
          <Empty msg="Inga avslutade körningar de senaste 48 timmarna." />
        ) : (
          <div className="rounded-xl border border-border bg-card divide-y divide-border/50">
            {recent.map(r => {
              const ok = String(r.status) === 'done'
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{label(r)}</p>
                    <p className="text-[11px] text-muted-foreground">{projName(r)} · {rel(r.finished_at || r.started_at)}{!ok && r.error ? ` · ${String(r.error).slice(0, 60)}` : ''}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </OSLayer>
    </OSPage>
  )
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="eyebrow eyebrow-accent mb-1">{eyebrow}</p>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
    </div>
  )
}
function Empty({ msg }: { msg: string }) {
  return <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">{msg}</div>
}
