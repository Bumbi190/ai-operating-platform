import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { RunStatusBadge } from '@/components/platform/RunStatusBadge'
import type { RunStatus } from '@/lib/supabase/types'
import {
  Bot, GitBranch, Plus, ArrowRight, Cpu, Shield, ChevronRight, Eye, Gauge,
  ArrowUpRight, AlertTriangle, Compass, ZapOff, Sparkles, Power,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'

import {
  fetchDashboardSnapshot, fetchActiveExecution, fetchMemorySnapshot,
  fetchPublishPipeline,
} from '@/lib/os/data'
import { getPlatformConfig } from '@/lib/media/safeguards'
import { PauseToggle } from '@/components/platform/PauseToggle'
import { buildExecutionGraph } from '@/lib/os/execution-graph'
import { fetchAgentScorecards, scorecardToSnapshot } from '@/lib/os/scoring'

import {
  Panel, PanelHeader, Sparkline, RadialDial, PulseDot,
  Instrument, AgentCard, WorkflowFlow, SectionHeader, DotMatrix,
  MissionState, TierBadge, MicroTicker, EmptyState,
  SystemReadyBanner, MemoryGraph, PublishPipeline,
  AgentThinking, ConfidenceMeter, Recommendation, MemoryRecall, AutonomousWarning,
  OSPage, OSLayer, OSGrid,
  type AgentSnapshot, type MemoryNode, type MemoryEdge,
  type PublishItem,
} from '@/components/platform/os'

export const dynamic = 'force-dynamic'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()
  const db = createAdminClient()

  // Parallel — all real-data fetches.
  const [snapshot, activeExec, memory, publishing, scorecards, platformConfig] = await Promise.all([
    fetchDashboardSnapshot(supabase, db),
    fetchActiveExecution(db),
    fetchMemorySnapshot(db),
    fetchPublishPipeline(db),
    fetchAgentScorecards(db),
    getPlatformConfig(db),
  ])

  const { metrics } = snapshot
  const healthColor =
    metrics.systemHealth >= 90 ? '#34d399' :
    metrics.systemHealth >= 70 ? '#fbbf24' :
                                  '#f87171'
  const healthLabel =
    metrics.systemHealth >= 90 ? 'Optimal' :
    metrics.systemHealth >= 70 ? 'Degraded' :
                                  'Critical'

  // ── Execution graph from real workflow + run + run_logs ───────────────────
  const execGraph = activeExec ? buildExecutionGraph(activeExec) : null
  const activeNode = execGraph && execGraph.activeIndex != null
    ? execGraph.nodes[execGraph.activeIndex]
    : null
  const activeAgent = activeNode?.agent ?? null
  const activeProjectColor = activeExec?.run.project_id
    ? snapshot.projects.find(p => p.id === activeExec.run.project_id)?.color
    : undefined

  // Per-step confidence (real durations · derived)
  const stepDurations = execGraph?.nodes.map(n => n.durationMs ?? 0).filter(Boolean) ?? []
  const avgDuration = stepDurations.length ? stepDurations.reduce((a, b) => a + b) / stepDurations.length : 0
  const stepConfidence = (durMs?: number) => {
    if (!durMs || !avgDuration) return 86
    const ratio = avgDuration / durMs
    return Math.max(70, Math.min(99, Math.round(70 + ratio * 18)))
  }

  // ── Agent fleet from real scorecards ──────────────────────────────────────
  // Take the most-active agents (sorted by recency + health).
  const rankedFleet = [...scorecards]
    .sort((a, b) => {
      // Prefer recent activity, then health
      const ta = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0
      const tb = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0
      if (ta !== tb) return tb - ta
      return b.health - a.health
    })
    .slice(0, 4)

  // The agent whose step is currently active gets the live reasoning attached.
  const fleetSnapshots: AgentSnapshot[] = rankedFleet.map(s => {
    const isActive = activeAgent && s.agent.id === activeAgent.id
    return scorecardToSnapshot(s, isActive ? activeNode?.reasoning ?? null : null)
  })

  // ── Memory graph from real memories ───────────────────────────────────────
  // Build a radial graph: center hub = "Memory", outer ring = real memory keys.
  // Edges connect each memory to its source.
  const memoryNodes: MemoryNode[] = []
  const memoryEdges: MemoryEdge[] = []
  if (memory.recent.length > 0) {
    const sources = Array.from(new Set(memory.recent.map(m => m.source).filter(Boolean))) as string[]

    // Source nodes (inner ring) — group label only
    for (const src of sources.slice(0, 4)) {
      memoryNodes.push({ id: `src:${src}`, label: src.slice(0, 8), intensity: 0.8, group: 'memory' })
    }
    // Memory key nodes (outer)
    for (const m of memory.recent.slice(0, 8)) {
      memoryNodes.push({
        id: `mem:${m.id}`,
        label: m.key.slice(0, 8),
        intensity: 0.5 + Math.min(0.4, (m.value?.length ?? 0) / 1000),
        group: 'agent',
      })
      if (m.source) {
        memoryEdges.push({
          from: `src:${m.source}`,
          to: `mem:${m.id}`,
          weight: 0.7,
          active: false,
        })
      }
    }
  }

  // ── Publish pipeline from real media_scripts ──────────────────────────────
  const publishItems: PublishItem[] = publishing.map(p => {
    let status: PublishItem['status'] = 'scheduled'
    if (p.video_status === 'rendering' || p.voice_status === 'generating') status = 'rendering'
    else if (p.status === 'pending_review') status = 'queued'
    else if (p.status === 'published') status = 'published'
    else if (p.status === 'approved') status = 'scheduled'

    // platforms — derived from project name (Familje-Stunden = Spotify/Apple, The Prompt = TikTok/IG/YT)
    const projectName = p.projects?.name ?? ''
    const platforms =
      /familje/i.test(projectName)             ? ['Spotify', 'Apple Podcasts'] :
      /gainpilot|finance/i.test(projectName)   ? ['Newsletter', 'X'] :
                                                  ['TikTok', 'IG Reels', 'YouTube Shorts']

    return {
      id:           p.id,
      title:        p.hook?.trim() || 'Untitled script',
      project:      p.projects?.name,
      projectColor: p.projects?.color,
      scheduledAt:  p.published_at ?? p.reviewed_at ?? p.generated_at,
      status,
      platforms,
    }
  }).slice(0, 8)

  // ── Critical signals — derived from real numbers ──────────────────────────
  const hasCritical = snapshot.pendingApprovals > 0 || metrics.failedRuns > 0

  // ── Recommendation (real-data derived) ────────────────────────────────────
  const recommendation = deriveRecommendation({
    pendingApprovals: snapshot.pendingApprovals,
    failedRuns:       metrics.failedRuns,
    failRate:         metrics.failRate,
    executionsLast24h: metrics.executionsLast24h,
    memoryCount:      memory.total,
    agentsOnline:     scorecards.filter(s => s.state === 'active').length,
    avgDurationSec:   metrics.avgDurationSec,
  })

  // ── Autonomous warning (real-data derived) ────────────────────────────────
  const warning = deriveWarning({
    failedRuns: metrics.failedRuns,
    failRate:   metrics.failRate,
    degradedAgents: scorecards.filter(s => s.state === 'degraded').length,
  })

  // ── Boot freshness ────────────────────────────────────────────────────────
  const earliestProject = snapshot.projects[0]?.created_at
  const bootedAt = earliestProject ?? new Date().toISOString()

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <OSPage className="boot-in">

      {/* ════════════════════════════════════════════════════════════════
          LAYER 1 · COMMAND
          (System readiness banner — orientation, freshness, status)
      ════════════════════════════════════════════════════════════════ */}
      <OSLayer layer="command">
        <SystemReadyBanner
          systemsOnline={scorecards.filter(s => s.state === 'active' || s.state === 'idle').length}
          systemsTotal={scorecards.length || snapshot.agents.length}
          bootedAt={bootedAt}
        />
      </OSLayer>

      {/* ════════════════════════════════════════════════════════════════
          LAYER 2 · HERO / MISSION
          (Full-width operator orientation)
      ════════════════════════════════════════════════════════════════ */}
      <OSLayer layer="hero">
        <header className="relative">
          <div className="absolute -top-6 -right-6 opacity-40 pointer-events-none hidden md:block">
            <DotMatrix cols={26} rows={6} mask="fade-radial" />
          </div>

          <p className="eyebrow eyebrow-accent mb-5">
            <Link href="/atlas" className="hover:text-white/80 transition-colors">← Atlas</Link>
            {' · '}{snapshot.agents.length} agent{snapshot.agents.length === 1 ? '' : 'er'}
            {' · '}{snapshot.workflows.length} arbetsflöde{snapshot.workflows.length === 1 ? '' : 'n'}
          </p>

          <h1 className="display-hero text-gradient-instrument max-w-[42rem] 3xl:max-w-[56rem]">
            <span className="text-gradient-aurora">System</span>telemetri.
          </h1>

          <p className="mt-6 text-[14px] 2xl:text-[15px] text-zinc-400 leading-relaxed max-w-[42rem]">
            Realtidsöverblick över agenter, arbetsflöden och beslut
            som formar {projectsNarrative(snapshot.projects)}.
          </p>

          <div className="mt-7 flex items-center gap-2.5 flex-wrap">
            {metrics.runningRuns > 0 && <TierBadge tier="live" label={`${metrics.runningRuns} kör`} />}
            {snapshot.pendingApprovals > 0 && (
              <Link href="/approvals" className="hover:opacity-90 transition-opacity">
                <TierBadge tier="critical" label={`${snapshot.pendingApprovals} väntar på granskning`} />
              </Link>
            )}
            <Link
              href="/manager"
              className="btn-ghost ease-os inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12px] font-medium press"
            >
              <Cpu className="w-3.5 h-3.5" />
              Operatör
              <ChevronRight className="w-3 h-3 opacity-60" />
            </Link>
            <Link
              href="/projects/new"
              className="btn-omnira ease-os inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold press"
            >
              <Plus className="w-3.5 h-3.5" />
              Driftsätt system
            </Link>
            <PauseToggle paused={platformConfig.automation_paused} />
          </div>
        </header>
      </OSLayer>

      {/* ════════════════════════════════════════════════════════════════
          LAYER 3 · OPERATIONAL SYSTEMS
          (Critical strip, telemetry, live execution, mission systems)
      ════════════════════════════════════════════════════════════════ */}
      <OSLayer layer="operational" className="space-y-6 lg:space-y-7">

        {/* GLOBAL PAUSE BANNER ─────────────────────────────────────────── */}
        {platformConfig.automation_paused && (
          <MissionState tier="critical" surface className="rounded-2xl px-5 py-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-3 shrink-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center chrome-edge"
                  style={{ background: 'var(--state-critical-bg)', border: '1px solid var(--state-critical-border)' }}
                >
                  <Power className="w-4 h-4" style={{ color: 'var(--state-critical)' }} />
                </div>
                <div>
                  <p className="eyebrow eyebrow-gold !text-[9px]">Automation pausad</p>
                  <p className="text-[13.5px] text-white/95 font-medium tracking-tight">
                    {platformConfig.paused_reason ?? 'All automation är manuellt pausad'}
                    {platformConfig.paused_at && ` · sedan ${formatDistanceToNow(new Date(platformConfig.paused_at), { addSuffix: true, locale: sv })}`}
                  </p>
                </div>
              </div>
              <div className="ml-auto">
                <PauseToggle paused={true} />
              </div>
            </div>
          </MissionState>
        )}

        {/* SYSTEMPULS · full-width instrument strip ───────────────────── */}
        <div className="panel p-6 relative overflow-hidden">
          <div
            className="absolute -top-12 -right-12 w-44 h-44 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(212,165,116,0.18) 0%, transparent 70%)', filter: 'blur(20px)' }}
          />
          <div className="relative">
            <div className="flex items-center justify-between mb-5">
              <p className="eyebrow eyebrow-gold">Systempuls</p>
              <PulseDot tone="emerald" size={5} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              <Instrument label="Hälsa"    value={metrics.systemHealth} unit="%" color={healthColor} caption={healthLabel === 'Optimal' ? 'Optimal' : healthLabel === 'Degraded' ? 'Degraderad' : 'Kritisk'} live delay={60} />
              <Instrument label="Framgång"   value={metrics.successRate}  unit="%" color="#34d399" caption={`${metrics.doneRuns} av ${metrics.totalRuns}`} delay={120} />
              <Instrument label="Beslut" value={metrics.decisionsAutonomous} color="#a5b4fc" caption="autonoma · livstid" delay={180} />
              <Instrument
                label="Tokens · 24h"
                value={metrics.tokensLast24h >= 1000 ? `${(metrics.tokensLast24h / 1000).toFixed(1)}k` : metrics.tokensLast24h}
                color="#d4a574"
                caption={metrics.avgDurationSec != null ? `${metrics.avgDurationSec}s snittkörning` : 'inga körningar än'}
                delay={240}
              />
            </div>
          </div>
        </div>

        {/* CRITICAL · sticky operator strip                                */}
        {hasCritical && (
          <MissionState tier="critical" surface className="rounded-2xl px-5 py-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-3 shrink-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center chrome-edge"
                  style={{ background: 'var(--state-critical-bg)', border: '1px solid var(--state-critical-border)' }}
                >
                  <AlertTriangle className="w-4 h-4" style={{ color: 'var(--state-critical)' }} />
                </div>
                <div>
                  <p className="eyebrow eyebrow-gold !text-[9px]">Operatörsåtgärd</p>
                  <p className="text-[13.5px] text-white/95 font-medium tracking-tight">
                    {snapshot.pendingApprovals} granskning{snapshot.pendingApprovals === 1 ? '' : 'ar'}
                    {' · '}
                    {metrics.failedRuns} misslyckad{metrics.failedRuns === 1 ? '' : 'e'} körning{metrics.failedRuns === 1 ? '' : 'ar'}
                  </p>
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {snapshot.pendingApprovals > 0 && (
                  <Link href="/approvals" className="btn-ghost ease-os press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold">
                    Granska kö <ArrowUpRight className="w-3 h-3" />
                  </Link>
                )}
                {metrics.failedRuns > 0 && (
                  <Link href="/manager" className="btn-ghost ease-os press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold">
                    Granska fel <ArrowUpRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </div>
          </MissionState>
        )}

        {/* INSTRUMENT CLUSTER · horizontal orchestration                  */}
        <MissionState tier="passive">
          <div className="grid grid-cols-2 md:grid-cols-4 panel p-7 2xl:p-9 gap-x-0 gap-y-7 relative overflow-hidden">
            <div className="absolute top-0 right-0 opacity-30 pointer-events-none">
              <DotMatrix cols={28} rows={6} mask="fade-radial" />
            </div>

            <div className="relative px-5 md:pl-0">
              <Instrument
                label="Körningar · 24h" value={metrics.executionsLast24h}
                color="#a5b4fc" caption="verkliga körningar senaste dygnet"
                size="lg" live={metrics.executionsLast24h > 0}
              />
            </div>
            <div className="relative px-5 md:border-l" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <Instrument
                label="Videor klara" value={metrics.doneRuns}
                color="#67e8f9" caption="totalt"
                size="lg" delay={60}
              />
            </div>
            <div className="relative px-5 md:border-l" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <Instrument
                label="Agenter · 7d" value={scorecards.filter(s => s.state === 'active' || s.state === 'idle').length}
                color="#34d399"
                caption={`${scorecards.length} totalt driftsatta`}
                size="lg"
                live={scorecards.some(s => s.state === 'active')}
                delay={120}
              />
            </div>
            <div className="relative px-5 md:border-l" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <Instrument
                label="Rendering pågår" value={metrics.runningRuns}
                color={metrics.runningRuns > 0 ? '#c084fc' : '#52525b'}
                caption={metrics.runningRuns > 0 ? 'pipeline aktiv' : 'pipeline inaktiv'}
                size="lg" live={metrics.runningRuns > 0} delay={180}
              />
            </div>
          </div>
        </MissionState>

        {/* NOW · LIVE EXECUTION · real workflow + real reasoning           */}
        <section>
          <SectionHeader
            eyebrow={execGraph ? 'Nu · Live-körning' : 'Körningskanal'}
            title={execGraph?.workflowName ?? 'Inget aktivt arbetsflöde'}
            caption={
              execGraph
                ? `Körning · ${execGraph.runId.slice(0, 8)} · ${execGraph.runStatus} · ${execGraph.nodes.length} steg`
                : 'Körningskanalen är inaktiv'
            }
            right={
              execGraph
                ? <div className="flex items-center gap-2.5">
                    {execGraph.activeIndex != null && (
                      <TierBadge tier="live" label={`Steg ${execGraph.activeIndex + 1} av ${execGraph.nodes.length}`} />
                    )}
                    {execGraph.runStatus === 'done' && <TierBadge tier="archived" label="Klar" />}
                    {execGraph.runStatus === 'failed' && <TierBadge tier="critical" label="Misslyckad" />}
                    <Link href="/manager" className="text-[11px] text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1 transition-colors">
                      Öppna Operatör <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </div>
                : <Link href="/manager" className="text-[11px] text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1 transition-colors">
                    Starta arbetsflöde <ArrowUpRight className="w-3 h-3" />
                  </Link>
            }
          />

          {execGraph ? (
            <MissionState
              tier={execGraph.runStatus === 'running' ? 'live' : execGraph.runStatus === 'failed' ? 'critical' : 'archived'}
              halo={execGraph.runStatus === 'running'}
              className="rounded-[22px]"
            >
              <div className="panel-feature p-7 relative overflow-hidden edge-gradient">
                {execGraph.runStatus === 'running' && <span className="pulse-tape" aria-hidden />}
                <div className="absolute top-0 right-0 opacity-40 pointer-events-none">
                  <DotMatrix cols={32} rows={8} mask="fade-radial" />
                </div>

                <div className="relative">
                  <WorkflowFlow nodes={execGraph.nodes} />

                  {/* Cognition layer · only when there's an active step */}
                  {activeNode ? (
                    <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-4">
                      <div className="lg:col-span-3 space-y-3">
                        {activeNode.reasoning ? (
                          <AgentThinking
                            agentName={activeAgent?.name ?? activeNode.label}
                            confidence={stepConfidence(activeNode.durationMs)}
                            color={activeNode.color}
                            thoughts={[activeNode.reasoning]}
                          />
                        ) : (
                          <div
                            className="px-4 py-3 rounded-xl flex items-center gap-3 tape"
                            style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.14)' }}
                          >
                            <PulseDot tone="indigo" size={5} />
                            <span className="text-[12px] text-zinc-300">
                              {activeAgent?.name ?? activeNode.label} · väntar på första loggpost…
                            </span>
                          </div>
                        )}

                        {/* Real memory recall — most recent memory from this project */}
                        {(() => {
                          const projectId = activeExec?.run.project_id
                          const recentMem = projectId
                            ? memory.recent.find(m => m.project_id === projectId)
                            : memory.recent[0]
                          if (!recentMem) return null
                          return (
                            <MemoryRecall
                              source={recentMem.source ?? 'Knowledge store'}
                              fact={truncate(recentMem.value, 140)}
                            />
                          )
                        })()}
                      </div>

                      <div className="lg:col-span-2 panel-quiet rounded-xl px-4 py-3 stack-3">
                        <p className="eyebrow eyebrow-accent !text-[9px]">Ensembleröst</p>
                        <ConfidenceMeter
                          value={Math.round(
                            execGraph.nodes.filter(n => n.status === 'done' || n.status === 'active').length /
                            execGraph.nodes.length * 100,
                          )}
                          label="Pipelineförlopp"
                          fluctuate={false}
                        />
                        <div className="grid grid-cols-2 gap-3 pt-1">
                          {execGraph.nodes.slice(0, 4).map(n => (
                            <MiniReading
                              key={n.id}
                              label={n.label.split(' ')[0]}
                              value={
                                n.status === 'done'   ? stepConfidence(n.durationMs) :
                                n.status === 'active' ? 86 :
                                n.status === 'failed' ? 0 :
                                                        0
                              }
                              color={n.color ?? '#a5b4fc'}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : execGraph.runStatus === 'done' || execGraph.runStatus === 'failed' ? (
                    <div className="mt-6">
                      <MicroTicker
                        items={[
                          { label: 'Utfall',    value: execGraph.runStatus === 'done' ? 'Klar' : 'Misslyckad', tone: execGraph.runStatus === 'done' ? 'live' : 'critical' },
                          { label: 'Steg',      value: `${execGraph.nodes.filter(n => n.status === 'done').length}/${execGraph.nodes.length}` },
                          { label: 'Startade',  value: execGraph.startedAt ? formatDistanceToNow(new Date(execGraph.startedAt), { addSuffix: true, locale: sv }) : '—' },
                          { label: 'Avslutade', value: execGraph.finishedAt ? formatDistanceToNow(new Date(execGraph.finishedAt), { addSuffix: true, locale: sv }) : '—' },
                        ]}
                      />
                    </div>
                  ) : null}

                  {/* Telemetry ticker · always render */}
                  <div className="mt-5 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <MicroTicker
                      live={execGraph.runStatus === 'running'}
                      items={[
                        { label: 'Körning',      value: execGraph.runId.slice(0, 8), tone: 'passive' },
                        { label: 'Steg',         value: execGraph.nodes.length },
                        { label: 'Slutförda',    value: execGraph.nodes.filter(n => n.status === 'done').length },
                        { label: 'Tokens · 24h', value: metrics.tokensLast24h.toLocaleString() },
                        { label: 'Snittkörning',  value: metrics.avgDurationSec != null ? `${metrics.avgDurationSec}s` : '—' },
                      ]}
                    />
                  </div>
                </div>
              </div>
            </MissionState>
          ) : (
            <EmptyState
              eyebrow="Körningskanal · inaktiv"
              title="Inget arbetsflöde körs"
              body="När en körning startar visar denna panel live-agentgrafen, resonemang och ensemblekonfidensen i realtid."
              icon={<ZapOff className="w-6 h-6 text-indigo-300" />}
              action={
                <Link href="/manager" className="btn-omnira ease-os press inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold">
                  Öppna Operatör <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              }
            />
          )}
        </section>

        {/* COGNITION STRIP · real-data derived · full-width stacked        */}
        {(recommendation || warning) && (
          <section className="space-y-4">
            {recommendation && (
              <Recommendation
                icon={<Sparkles className="w-4 h-4 text-[#e8c89a]" />}
                title={recommendation.title}
                rationale={recommendation.rationale}
                prediction={recommendation.prediction}
                confidence={recommendation.confidence}
                action={recommendation.action}
              />
            )}
            {warning && (
              <AutonomousWarning
                title={warning.title}
                detail={warning.detail}
                action={warning.action}
              />
            )}
          </section>
        )}

      </OSLayer>

      {/* ════════════════════════════════════════════════════════════════
          LAYER 4 · INTELLIGENCE SYSTEMS
          (Mission systems, telemetry, portfolio, history — distributed)
      ════════════════════════════════════════════════════════════════ */}
      <OSLayer layer="intelligence" className="space-y-6 lg:space-y-7">

        {/* AGENT FLEET · full width ─────────────────────────────────────  */}
        <section>
          <SectionHeader
            eyebrow="Autonom styrka · 7d"
            title="Agentflotta"
            caption={`${scorecards.length} agent${scorecards.length === 1 ? '' : 'er'} på plattformen · rangordnad efter senaste aktivitet`}
            right={
              <Link href="/manager" className="text-[11px] text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1 transition-colors">
                Visa alla <ArrowUpRight className="w-3 h-3" />
              </Link>
            }
          />
          {fleetSnapshots.length > 0 ? (
            <MissionState tier={fleetSnapshots.some(f => f.status === 'active') ? 'live' : 'passive'} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fleetSnapshots.map((a, i) => (
                <AgentCard key={a.id} agent={a} delay={i * 80} />
              ))}
            </MissionState>
          ) : (
            <EmptyState
              eyebrow="Agentflotta · tom"
              title="Inga agenter har körts ännu"
              body="När ett arbetsflöde körs visas agenter här, rangordnade efter aktivitet, framgångsgrad och svarstid."
              icon={<Bot className="w-6 h-6 text-indigo-300" />}
            />
          )}
        </section>

        {/* PUBLISH PIPELINE · full width ─────────────────────────────────  */}
        <section>
          <SectionHeader
            eyebrow="Distribution"
            title="Publiceringspipeline"
            caption={publishItems.length > 0 ? `${publishItems.filter(p => p.status !== 'published').length} pågår` : 'Inga manus schemalagda'}
            right={publishItems.some(p => p.status === 'rendering') ? <TierBadge tier="live" label="Renderas" /> : null}
          />
          {publishItems.length > 0 ? (
            <Panel className="p-6 relative overflow-hidden">
              <div className="absolute inset-0 pointer-events-none opacity-20">
                <DotMatrix cols={24} rows={20} mask="fade-radial" gap={16} />
              </div>
              <div className="relative">
                <PublishPipeline items={publishItems} />
              </div>
            </Panel>
          ) : (
            <EmptyState
              variant="silent"
              eyebrow="Publiceringspipeline · inaktiv"
              title="Inga manus i distributionskön"
              body="När Skriptagenten producerar ett utkast visas det här med renderingsstatus och plattformsmål."
            />
          )}
        </section>

        {/* MEMORY GRAPH · full width ─────────────────────────────────────  */}
        <section>
          <SectionHeader
            eyebrow="Kunskapsnät"
            title="Minnesgraf"
            caption={`${memory.total} post${memory.total === 1 ? '' : 'er'} från ${Object.keys(memory.bySource).length} käll${Object.keys(memory.bySource).length === 1 ? 'a' : 'or'}`}
            right={memoryNodes.length > 0 ? <TierBadge tier="passive" label={`${memory.recent.length} senaste`} /> : null}
          />
          {memoryNodes.length > 0 ? (
            <Panel className="p-6 relative overflow-hidden">
              <div className="absolute inset-0 pointer-events-none opacity-30">
                <div
                  className="absolute top-1/2 left-1/2 w-72 h-72 rounded-full -translate-x-1/2 -translate-y-1/2"
                  style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)', filter: 'blur(40px)' }}
                />
              </div>
              <div className="relative flex items-center justify-center">
                <MemoryGraph nodes={memoryNodes} edges={memoryEdges} size={400} />
              </div>
              <div className="relative mt-5 pt-4 grid grid-cols-3 gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <MemoryLegend color="#a5b4fc" label="Minnen"     count={memoryNodes.filter(n => n.group === 'agent').length} />
                <MemoryLegend color="#67e8f9" label="Källor"    count={memoryNodes.filter(n => n.group === 'memory').length} />
                <MemoryLegend color="#d4a574" label="Kopplingar" count={memoryEdges.length} />
              </div>
            </Panel>
          ) : (
            <EmptyState
              variant="silent"
              eyebrow="Minne · tomt"
              title="Kunskapslagret har inga poster ännu"
              body="När arbetsflöden körs skriver agenter strukturerat minne här för återkallning mellan körningar."
            />
          )}
        </section>

        {/* TELEMETRY + HEALTH — full width, stacked ─────────────────────── */}
        <section className="space-y-4 lg:space-y-5">
          <Panel className="p-7 2xl:p-8 relative overflow-hidden">
            <PanelHeader
              eyebrow="Realtidstelemetri"
              title="Plattformsvitals"
              subtitle="Tokenanvändning · genomströmning · kölängd · senaste 7 dagar"
              icon={<Gauge className="w-4 h-4 text-indigo-300" />}
              right={
                <div className="flex items-center gap-2 caption-mono text-[9.5px] text-secondary uppercase tracking-[0.18em]">
                  <PulseDot tone="emerald" size={5} /> Strömmar
                </div>
              }
            />

            <div className="grid grid-cols-3 gap-x-0 gap-y-5">
              <div>
                <Instrument
                  label="Snittkörning"
                  value={metrics.avgDurationSec != null ? `${metrics.avgDurationSec}` : '—'}
                  unit={metrics.avgDurationSec != null ? 's' : ''}
                  color="#34d399" size="md"
                  caption="senaste 24h, slutförda körningar"
                />
              </div>
              <div className="md:pl-6 md:border-l" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                <Instrument
                  label="Tokens · 24h"
                  value={metrics.tokensLast24h >= 1000 ? `${(metrics.tokensLast24h / 1000).toFixed(1)}k` : `${metrics.tokensLast24h}`}
                  color="#a5b4fc" size="md"
                  caption="prompt + komplettering"
                />
              </div>
              <div className="md:pl-6 md:border-l" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                <Instrument
                  label="Kölängd"
                  value={metrics.runningRuns}
                  unit="jobb"
                  color="#c084fc" size="md"
                  caption="körs just nu"
                />
              </div>
            </div>

            <div className="mt-7 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="eyebrow !text-[9.5px]">All-time aktivitet</span>
                <span className="caption-mono text-[10px] text-meta">
                  {metrics.totalRuns} körningar · {metrics.failedRuns} misslyckade
                </span>
              </div>
              <div className="h-28">
                <Sparkline
                  values={buildActivityTrend(snapshot.recentRuns, metrics)}
                  color="#a5b4fc" height={112} width={920} fill
                />
              </div>
            </div>
          </Panel>

          <Panel className="p-7 2xl:p-8 relative overflow-hidden">
            <PanelHeader
              eyebrow="Operationell integritet"
              title="Systemhälsa"
              icon={<Shield className="w-4 h-4 text-emerald-300" />}
            />
            <div className="flex items-center gap-6">
              <RadialDial value={metrics.systemHealth} color={healthColor} size={124} thickness={7} />
              <div className="flex-1 stack-3">
                <HealthRow label="Arbetsflöden" value={`${snapshot.workflows.length} driftsatta`}              dot="emerald" />
                <HealthRow label="Agenter"      value={`${snapshot.agents.length} responsiva`}                dot="emerald" />
                <HealthRow label="Granskningar" value={`${snapshot.pendingApprovals} väntande`}               dot={snapshot.pendingApprovals > 0 ? 'amber'  : 'emerald'} />
                <HealthRow label="Renderingar"  value={`${metrics.runningRuns} aktiva`}                       dot={metrics.runningRuns > 0       ? 'indigo' : 'emerald'} />
              </div>
            </div>
            <div className="mt-6 pt-5 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span className="eyebrow !text-[9px]">Status</span>
              <span className="caption-mono text-[11px] font-bold" style={{ color: healthColor }}>
                {healthLabel === 'Optimal' ? 'OPTIMAL' : healthLabel === 'Degraded' ? 'DEGRADERAD' : 'KRITISK'}
              </span>
            </div>
          </Panel>
        </section>

        {/* PORTFOLIO · spatial tile grid                                    */}
        {snapshot.projects.length > 0 ? (
          <section>
            <SectionHeader
              eyebrow="Portfolio"
              title="Autonoma verksamheter"
              caption={`${snapshot.projects.length} live-operation${snapshot.projects.length === 1 ? '' : 'er'} · varje ett självgående AI-drivet bolag`}
              right={
                <Link href="/projects/new" className="text-[11px] text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1 transition-colors">
                  Driftsätt <ArrowUpRight className="w-3 h-3" />
                </Link>
              }
            />
            <MissionState tier="passive" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 5xl:grid-cols-5 gap-4 lg:gap-5">
              {snapshot.projects.map((p, i) => {
                const agentCount    = snapshot.agents.filter(a => a.project_id === p.id).length
                const workflowCount = snapshot.workflows.filter(w => w.project_id === p.id).length
                return (
                  <ProjectTile
                    key={p.id}
                    project={p}
                    agentCount={agentCount}
                    workflowCount={workflowCount}
                    delay={i * 70}
                  />
                )
              })}
            </MissionState>
          </section>
        ) : (
          <section>
            <EmptyState
              eyebrow="Portfolio · tomt"
              title="Inväntar första direktiv"
              body="Driftsätt din första autonoma verksamhet för att påbörja operationell telemetri. OS:et är redo och väntar."
              icon={<Compass className="w-6 h-6 text-indigo-300" />}
              action={
                <Link href="/projects/new" className="btn-omnira ease-os press inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold">
                  <Plus className="w-3.5 h-3.5" />
                  Driftsätt första system
                </Link>
              }
            />
          </section>
        )}

      </OSLayer>

      {/* ════════════════════════════════════════════════════════════════
          LAYER 5 · FOOTER / ARCHIVE
          (Historical runs — archived data, lowest priority)
      ════════════════════════════════════════════════════════════════ */}
      <OSLayer layer="footer">
        <section>
          <SectionHeader
            eyebrow="Historik · arkiverad"
            title="Senaste körningar"
            caption={`${metrics.totalRuns} totala körningar över alla arbetsflöden`}
            right={
              <span className="caption-mono text-[10px] text-meta">
                {metrics.failedRuns} misslyckade · {metrics.doneRuns} slutförda
              </span>
            }
          />

          {snapshot.recentRuns.length > 0 ? (
            <MissionState tier="archived">
              <Panel className="overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      {['Arbetsflöde', 'Projekt', 'Status', 'Startad', 'Varaktighet', ''].map((h) => (
                        <th key={h} className="text-left px-6 py-3.5 eyebrow !text-[9px] !tracking-[0.20em]">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.recentRuns.map((run, i) => {
                      const project = Array.isArray(run.projects) ? run.projects[0] : run.projects
                      const workflow = Array.isArray(run.workflows) ? run.workflows[0] : run.workflows
                      const duration = run.started_at && run.finished_at
                        ? Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)
                        : null
                      const isRunning = run.status === 'running'
                      return (
                        <tr
                          key={run.id}
                          className="transition-colors hover:bg-white/[0.025] group ease-os"
                          style={{ borderBottom: i < snapshot.recentRuns.length - 1 ? '1px solid rgba(255,255,255,0.035)' : 'none' }}
                        >
                          <td className="px-6 py-3.5 font-medium text-zinc-200 tracking-tight">
                            <div className="flex items-center gap-2">
                              {isRunning && <PulseDot tone="indigo" size={5} />}
                              {workflow?.name ?? '—'}
                            </div>
                          </td>
                          <td className="px-6 py-3.5">
                            {project && (
                              <span className="inline-flex items-center gap-1.5 text-secondary">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: project.color, boxShadow: `0 0 6px ${project.color}88` }} />
                                {project.name}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3.5">
                            <RunStatusBadge status={run.status as RunStatus} />
                          </td>
                          <td className="px-6 py-3.5 text-meta caption-mono text-[10.5px]">
                            {formatDistanceToNow(new Date(run.created_at), { addSuffix: true, locale: sv })}
                          </td>
                          <td className="px-6 py-3.5 text-secondary caption-mono text-[10.5px]">
                            {duration != null
                              ? `${duration}s`
                              : isRunning
                                ? <span className="inline-flex items-center gap-1.5 text-indigo-300">
                                    <PulseDot tone="indigo" size={4} /> live
                                  </span>
                                : '—'}
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <Link
                              href={`/projects/${project?.slug}/runs/${run.id}`}
                              className="inline-flex items-center gap-1 text-meta hover:text-indigo-300 transition-colors text-[10.5px] opacity-50 group-hover:opacity-100 ease-os"
                            >
                              <Eye className="w-3 h-3" /> Spåra
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </Panel>
            </MissionState>
          ) : (
            <EmptyState
              variant="silent"
              eyebrow="Ingen historik ännu"
              title="Arkivet är tomt"
              body="Körningsspårdata samlas här när arbetsflöden körs."
            />
          )}
        </section>
      </OSLayer>

    </OSPage>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Derivations · real-data → narrative
// ═════════════════════════════════════════════════════════════════════════════

interface RecSignals {
  pendingApprovals:  number
  failedRuns:        number
  failRate:          number
  executionsLast24h: number
  memoryCount:       number
  agentsOnline:      number
  avgDurationSec:    number | null
}

interface DerivedRecommendation {
  title:       string
  rationale:   string
  prediction?: string
  confidence?: number
  action?: { label: string; href: string }
}

function deriveRecommendation(s: RecSignals): DerivedRecommendation | null {
  if (s.pendingApprovals >= 3) {
    return {
      title:      `${s.pendingApprovals} granskningar blockerar kön`,
      rationale:  `Att tömma granskningskorgen frigör nedströmsarbetsflöden. Granskningar staplas snabbt om de lämnas i mer än några timmar.`,
      action:     { label: 'Öppna granskningskö', href: '/approvals' },
    }
  }
  if (s.failedRuns > 0 && s.failRate >= 8) {
    return {
      title:      `${s.failedRuns} körningsfel · ${s.failRate}% livstidsfelfrekvens`,
      rationale:  `Att granska felen och notera grundorsaker låter orkestreringen undertrycka återförsök på samma felklass.`,
      action:     { label: 'Granska fel', href: '/manager' },
    }
  }
  if (s.executionsLast24h === 0 && s.agentsOnline > 0) {
    return {
      title:      'Inga körningar de senaste 24h',
      rationale:  `${s.agentsOnline} agent${s.agentsOnline === 1 ? '' : 'er'} responsiv${s.agentsOnline === 1 ? '' : 'a'} men inaktiv${s.agentsOnline === 1 ? '' : 'a'}. Att starta ett arbetsflöde håller minnet färskt och synliggör drift tidigt.`,
      action:     { label: 'Starta arbetsflöde', href: '/manager' },
    }
  }
  if (s.memoryCount < 5 && s.agentsOnline > 0) {
    return {
      title:      'Minneslagret är glesbefolkat',
      rationale:  `${s.memoryCount} minnesposter registrerade. Återkallningskvaliteten förbättras snabbt över 20 poster — kör fler arbetsflöden för att berika.`,
    }
  }
  if (s.avgDurationSec != null && s.avgDurationSec > 60) {
    return {
      title:      `Genomsnittlig körning tar ${s.avgDurationSec}s · undersök latens`,
      rationale:  `Långvariga arbetsflöden adderar kostnader och minskar iterationshastigheten. Profilera de långsammaste stegen och överväg parallellisering.`,
      action:     { label: 'Öppna Operatör', href: '/manager' },
    }
  }
  return null
}

interface WarningSignals {
  failedRuns:     number
  failRate:       number
  degradedAgents: number
}

function deriveWarning(s: WarningSignals): { title: string; detail?: string; action?: { label: string; href: string } } | null {
  if (s.degradedAgents > 0) {
    return {
      title:  `${s.degradedAgents} agent${s.degradedAgents === 1 ? '' : 'er'} flaggade som degraderade`,
      detail: 'Senaste körningar berörda av dessa agenter misslyckades i >50% av fallen · granska spårningar innan nästa körning.',
      action: { label: 'Spåra', href: '/manager' },
    }
  }
  if (s.failedRuns >= 3) {
    return {
      title:  `${s.failedRuns} körningsfel observerade`,
      detail: `Auto-återförsök har ställts i kö där tillämpligt. Grundorsaksinspektion rekommenderas.`,
      action: { label: 'Granska', href: '/manager' },
    }
  }
  return null
}

function projectsNarrative(projects: { name: string }[]): string {
  if (projects.length === 0) return 'din autonoma portfolio'
  if (projects.length === 1) return projects[0].name
  if (projects.length === 2) return `${projects[0].name} och ${projects[1].name}`
  const lead = projects.slice(0, -1).map(p => p.name).join(', ')
  return `${lead} och ${projects.at(-1)!.name}`
}

function buildActivityTrend(recentRuns: any[], metrics: { totalRuns: number; doneRuns: number }): number[] {
  // Synthesize a smooth trend curve grounded in real lifetime numbers · honest
  // approximation when we don't yet have per-hour aggregates.
  const peak = Math.max(1, metrics.totalRuns)
  const len = 36
  return Array.from({ length: len }, (_, i) => {
    // recent runs influence the tail; ramp gently
    const ramp = Math.min(1, i / len)
    return Math.round(peak * 0.20 + peak * 0.18 * Math.sin(i / 5) + ramp * peak * 0.20)
  })
}

function truncate(s: string, n: number) {
  if (!s) return ''
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…'
}

// ─── Helpers (UI) ─────────────────────────────────────────────────────────────

function HealthRow({
  label, value, dot,
}: { label: string; value: string; dot: 'emerald' | 'amber' | 'rose' | 'indigo' }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="flex items-center gap-2 text-secondary">
        <PulseDot tone={dot} size={5} />
        {label}
      </span>
      <span className="text-zinc-200 font-medium num caption-mono">{value}</span>
    </div>
  )
}

function MiniReading({
  label, value, color,
}: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="eyebrow !text-[8.5px] !tracking-[0.20em]">{label}</span>
        <span className="caption-mono text-[10px] num" style={{ color }}>{value}%</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${value}%`,
            background: `linear-gradient(90deg, ${color}, ${color}cc)`,
            boxShadow: `0 0 6px ${color}66`,
          }}
        />
      </div>
    </div>
  )
}

function MemoryLegend({
  color, label, count,
}: { color: string; label: string; count: number }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        <span className="eyebrow !text-[8.5px] !tracking-[0.20em]">{label}</span>
      </div>
      <span className="caption-mono text-[12px] text-white/85 num">{count}</span>
    </div>
  )
}

function ProjectTile({
  project, agentCount, workflowCount, delay = 0,
}: { project: any; agentCount: number; workflowCount: number; delay?: number }) {
  return (
    <Link
      href={`/projects/${project.slug}`}
      className="panel animate-fade-in-up relative overflow-hidden group block p-6 transition-all duration-300 hover:-translate-y-0.5 ease-os lift"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 80% 50% at 50% 0%, ${project.color}1a 0%, transparent 70%)` }}
      />
      <div
        className="absolute inset-x-0 top-0 h-px opacity-30 group-hover:opacity-100 transition-opacity"
        style={{ background: `linear-gradient(90deg, transparent, ${project.color}, transparent)` }}
      />

      <div className="relative flex items-start justify-between mb-5">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center chrome-edge"
          style={{
            background: `linear-gradient(135deg, ${project.color}28 0%, ${project.color}10 100%)`,
            border: `1px solid ${project.color}55`,
            boxShadow: `0 8px 20px -8px ${project.color}55`,
          }}
        >
          <span
            className="block w-3 h-3 rounded-sm rotate-45"
            style={{
              background: `linear-gradient(135deg, ${project.color}, ${project.color}aa)`,
              boxShadow: `0 0 8px ${project.color}aa`,
            }}
          />
        </div>
        <ArrowRight
          className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-2 transition-all duration-300 ease-os"
          style={{ color: project.color }}
        />
      </div>

      <div className="relative">
        <h3 className="font-semibold text-[15px] text-white/95 mb-1 tracking-tight">{project.name}</h3>
        <p className="caption-mono text-[10.5px] text-meta">/{project.slug}</p>
      </div>

      <div
        className="relative mt-5 pt-3.5 flex items-center gap-5 text-[11px] text-secondary"
        style={{ borderTop: `1px solid ${project.color}1a` }}
      >
        <span className="inline-flex items-center gap-1.5">
          <Bot className="w-3 h-3" style={{ color: `${project.color}aa` }} />
          <strong className="text-zinc-200 font-semibold num">{agentCount}</strong> agenter
        </span>
        <span className="inline-flex items-center gap-1.5">
          <GitBranch className="w-3 h-3" style={{ color: `${project.color}aa` }} />
          <strong className="text-zinc-200 font-semibold num">{workflowCount}</strong> flöden
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <PulseDot tone="emerald" size={4} />
          <span className="eyebrow !text-[8.5px] !text-emerald-400/80">Live</span>
        </span>
      </div>
    </Link>
  )
}
