import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Cpu, Clock, Activity, Zap } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'

import { fetchAgentActivity, type RunningAgent, type RecentRun } from '@/lib/os/agents-activity'
import { OSPage, OSLayer, EmptyState, PulseDot } from '@/components/platform/os'
import { RunStatusBadge } from '@/components/platform/RunStatusBadge'
import type { RunStatus } from '@/lib/supabase/types'
import { LiveRefresh } from './LiveRefresh'

export const dynamic = 'force-dynamic'

function fmtEta(sec: number | null): string {
  if (sec == null) return 'beräknar…'
  if (sec < 60) return `~${sec}s kvar`
  return `~${Math.round(sec / 60)} min kvar`
}

export default async function AgentActivityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const { running, recent } = await fetchAgentActivity(db)

  return (
    <OSPage className="boot-in">
      <LiveRefresh seconds={15} />

      <OSLayer layer="hero">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-2xl flex items-center justify-center chrome-edge shrink-0"
            style={{ background: 'rgba(99,102,241,0.16)', border: '1px solid rgba(99,102,241,0.35)' }}>
            <Cpu className="w-4 h-4 text-indigo-300" />
          </div>
          <div>
            <p className="caption-mono text-[10px] text-zinc-500 uppercase tracking-[0.2em] mb-1">Insyn i realtid</p>
            <h1 className="display-hero text-gradient-instrument text-[26px] md:text-[30px] leading-tight">Agent Activity Center</h1>
            <p className="text-[13px] text-zinc-400 mt-1 inline-flex items-center gap-1.5">
              {running.length > 0
                ? <><PulseDot tone="indigo" size={5} /> {running.length} agent{running.length === 1 ? '' : 'er'} arbetar just nu</>
                : 'Inga agenter arbetar just nu'}
            </p>
          </div>
        </div>
      </OSLayer>

      <OSLayer layer="operational" className="space-y-7">
        {/* Körande agenter */}
        <section>
          <p className="eyebrow !text-[9px] mb-3 inline-flex items-center gap-1.5"><Zap className="w-3 h-3" /> Arbetar nu</p>
          {running.length > 0 ? (
            <div className="space-y-4">
              {running.map(a => <RunningCard key={a.runId} agent={a} />)}
            </div>
          ) : (
            <EmptyState
              variant="silent"
              eyebrow="Inga aktiva körningar"
              title="Alla agenter vilar"
              body="När ett arbetsflöde startar visas varje agents aktuella steg, framsteg och senaste åtgärd här i realtid."
              icon={<Activity className="w-6 h-6 text-indigo-300" />}
            />
          )}
        </section>

        {/* Senaste aktivitet */}
        {recent.length > 0 && (
          <section>
            <p className="eyebrow !text-[9px] mb-3">Senaste körningar</p>
            <div className="panel overflow-hidden">
              <table className="w-full text-[12px]">
                <tbody>
                  {recent.map((r, i) => (
                    <tr key={r.runId} style={{ borderBottom: i < recent.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <td className="px-5 py-3 font-medium text-zinc-200">{r.workflowName}</td>
                      <td className="px-5 py-3">
                        {r.projectName && (
                          <span className="inline-flex items-center gap-1.5 text-zinc-500">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: r.projectColor ?? '#818cf8' }} />
                            {r.projectName}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3"><RunStatusBadge status={r.status as RunStatus} /></td>
                      <td className="px-5 py-3 text-zinc-600 caption-mono text-[10.5px]">
                        {r.finishedAt ? formatDistanceToNow(new Date(r.finishedAt), { addSuffix: true, locale: sv }) : '—'}
                      </td>
                      <td className="px-5 py-3 text-zinc-500 caption-mono text-[10.5px]">{r.durationSec != null ? `${r.durationSec}s` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </OSLayer>
    </OSPage>
  )
}

function RunningCard({ agent }: { agent: RunningAgent }) {
  return (
    <div className="panel p-5 relative overflow-hidden">
      <span className="pulse-tape" aria-hidden />
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PulseDot tone="indigo" size={5} />
            <h3 className="font-semibold text-[15px] text-white/95 tracking-tight truncate">{agent.workflowName}</h3>
          </div>
          {agent.projectName && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 mt-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: agent.projectColor ?? '#818cf8' }} />
              {agent.projectName}
            </span>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="caption-mono text-[10px] text-zinc-500 inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {fmtEta(agent.etaSeconds)}</p>
          {agent.startedAt && (
            <p className="caption-mono text-[10px] text-zinc-600 mt-0.5">startade {formatDistanceToNow(new Date(agent.startedAt), { addSuffix: true, locale: sv })}</p>
          )}
        </div>
      </div>

      {/* Aktuellt steg + framsteg */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] text-zinc-300">Steg {agent.stepIndex} av {agent.totalSteps}: <strong className="text-white/90">{agent.currentStep}</strong></span>
          <span className="caption-mono text-[11px] num text-indigo-300">{agent.progressPct}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full rounded-full" style={{ width: `${agent.progressPct}%`, background: 'linear-gradient(90deg, #6366f1, #818cf8)', boxShadow: '0 0 8px rgba(99,102,241,0.5)' }} />
        </div>
      </div>

      {/* Senaste åtgärd */}
      {agent.lastAction && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="eyebrow !text-[8px] mb-1">Senaste åtgärd</p>
          <p className="text-[11.5px] text-zinc-400 leading-relaxed line-clamp-2">{agent.lastAction}</p>
        </div>
      )}
    </div>
  )
}
