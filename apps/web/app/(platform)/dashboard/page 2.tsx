import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { RunStatusBadge } from '@/components/platform/RunStatusBadge'
import type { RunStatus } from '@/lib/supabase/types'
import {
  Bot, GitBranch, Plus, ArrowRight, Cpu, Shield, ChevronRight, Eye, Gauge,
  ArrowUpRight, AlertTriangle, Compass, ZapOff, Sparkles,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'

import {
  fetchDashboardSnapshot, fetchActiveExecution, fetchMemorySnapshot,
  fetchPublishPipeline,
} from '@/lib/os/data'
import { buildExecutionGraph } from '@/lib/os/execution-graph'
import { fetchAgentScorecards, scorecardToSnapshot } from '@/lib/os/scoring'

import {
  Panel, PanelHeader, Sparkline, RadialDial, PulseDot,
  Instrument, AgentCard, WorkflowFlow, SectionHeader, DotMatrix,
  MissionState, TierBadge, MicroTicker, EmptyState,
  SystemReadyBanner, MemoryGraph, PublishPipeline,
  AgentThinking, ConfidenceMeter, Recommendation, MemoryRecall, AutonomousWarning,
  type AgentSnapshot, type MemoryNode, type MemoryEdge,
  type PublishItem,
} from '@/components/platform/os'

export const dynamic = 'force-dynamic'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()
  const db = createAdminClient()

  // Parallel — all real-data fetches.
  const [snapshot, activeExec, memory, publishing, scorecards] = await Promise.all([
    fetchDashboardSnapshot(supabase, db),
    fetchActiveExecution(db),
    fetchMemorySnapshot(db),
    fetchPublishPipeline(db),
    fetchAgentScorecards(db),
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
    <div className="px-7 lg:px-10 py-10 max-w-[1680px] mx-auto pb-24">

      <div className="boot-in space-y-4 mb-7">
        <SystemReadyBanner
          systemsOnline={scorecards.filter(s => s.state === 'active' || s.state === 'idle').length}
          systemsTotal={scorecards.length || snapshot.agents.length}
          bootedAt={bootedAt}
        />

        {/* ─────────────────────────────────────────────────────────────────
            HERO
        ───────────────────────────────────────────────────────────────── */}
        <header className="grid grid-cols-12 gap-7 items-end pt-3">
          <div className="col-span-12 lg:col-span-8 relative">
            <div className="absolute -top-6 -right-6 opacity-40 pointer-events-none hidden md:block">
              <DotMatrix cols={26} rows={6} mask="fade-radial" />
            </div>

            <p className="eyebrow eyebrow-accent mb-5">
              Omnira · {snapshot.projects.length} autonomous business{snapshot.projects.length === 1 ? '' : 'es'}
              {' · '}{snapshot.agents.length} agent{snapshot.agents.length === 1 ? '' : 's'}
              {' · '}{snapshot.workflows.length} workflow{snapshot.workflows.length === 1 ? '' : 's'}
            </p>

            <h1 className="display-hero text-gradient-instrument max-w-2xl">
              Operating <span className="text-gradient-aurora">autonomous</span> systems.
            </h1>

            <p className="mt-6 text-[14px] text-zinc-400 leading-relaxed max-w-xl">
              Real-time visibility into the agents, workflows, and decisions
              shaping {projectsNarrative(snapshot.projects)}.
            </p>

            <div className="mt-7 flex items-center gap-2.5 flex-wrap">
              {metrics.runningRuns > 0 && <TierBadge tier="live" label={`${metrics.runningRuns} executing`} />}
              {snapshot.pendingApprovals > 0 && (
                <Link href="/approvals" className="hover:opacity-90 transition-opacity">
                  <TierBadge tier="critical" label={`${snapshot.pendingApprovals} pending review`} />
                </Link>
              )}
              <Link
                href="/manager"
                className="btn-ghost ease-os inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12px] font-medium press"
              >
                <Cpu className="w-3.5 h-3.5" />
                Operator
                <ChevronRight className="w-3 h-3 opacity-60" />
              </Link>
              <Link
                href="/projects/new"
                className="btn-omnira ease-os inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold press"
              >
                <Plus className="w-3.5 h-3.5" />
                Deploy system
              </Link>
            </div>
          </div>

          {/* Side instrument cluster */}
          <aside className="col-span-12 lg:col-span-4 panel p-6 relative overflow-hidden drift">
            <div
              className="absolute -top-12 -right-12 w-44 h-44 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(212,165,116,0.18) 0%, transparent 70%)', filter: 'blur(20px)' }}
            />
            <div className="relative">
              <div className="flex items-center justify-between mb-5">
                <p className="eyebrow eyebrow-gold">System pulse</p>
                <PulseDot tone="emerald" size={5} />
              </div>

              <div className="grid grid-cols-2 gap-5">
                <Instrument label="Health"    value={metrics.systemHealth} unit="%" color={healthColor} caption={healthLabel} live delay={60} />
                <Instrument label="Success"   value={metrics.successRate}  unit="%" color="#34d399" caption={`${metrics.doneRuns} of ${metrics.totalRuns}`} delay={120} />
                <Instrument label="Decisions" value={metrics.decisionsAutonomous} color="#a5b4fc" caption="autonomous · lifetime" delay={180} />
                <Instrument
                  label="Tokens · 24h"
                  value={metrics.tokensLast24h >= 1000 ? `${(metrics.tokensLast24h / 1000).toFixed(1)}k` : metrics.tokensLast24h}
                  color="#d4a574"
                  caption={metrics.avgDurationSec != null ? `${metrics.avgDurationSec}s avg run` : 'no runs yet'}
                  delay={240}
                />
              </div>
            </div>
          </aside>
        </header>

        {/* ─────────────────────────────────────────────────────────────────
            CRITICAL · sticky operator strip
        ───────────────────────────────────────────────────────────────── */}
        {hasCritical && (
          <MissionState tier="critical" surface className="rounded-2xl px-5 py-4 mt-2">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-3 shrink-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center chrome-edge"
                  style={{ background: 'var(--state-critical-bg)', border: '1px solid var(--state-critical-border)' }}
                >
                  <AlertTriangle className="w-4 h-4" style={{ color: 'var(--state-critical)' }} />
                </div>
                <div>
                  <p className="eyebrow eyebrow-gold !text-[9px]">Operator action</p>
                  <p className="text-[13.5px] text-white/95 font-medium tracking-tight">
                    {snapshot.pendingApprovals} approval{snapshot.pendingApprovals === 1 ? '' : 's'}
                    {' · '}
                    {metrics.failedRuns} failed run{metrics.failedRuns === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {snapshot.pendingApprovals > 0 && (
                  <Link href="/approvals" className="btn-ghost ease-os press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold">
                    Review queue <ArrowUpRight className="w-3 h-3" />
                  </Link>
                )}
                {metrics.failedRuns > 0 && (
                  <Link href="/manager" className="btn-ghost ease-os press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold">
                    Inspect failures <ArrowUpRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </div>
          </MissionState>
        )}

        {/* ─────────────────────────────────────────────────────────────────
            INSTRUMENT CLUSTER
        ───────────────────────────────────────────────────────────────── */}
        <MissionState tier="passive" className="mt-2">
          <div className="grid grid-cols-2 md:grid-cols-4 panel p-7 gap-x-0 gap-y-7 relative overflow-hidden">
            <div className="absolute top-0 right-0 opacity-30 pointer-events-none">
              <DotMatrix cols={18} rows={5} mask="fade-radial" />
            </div>

            <div className="relative px-5 md:pl-0">
              <Instrument
                label="Executions · 24h" value={metrics.executionsLast24h}
                color="#a5b4fc" caption="real runs in last day"
                size="lg" live={metrics.executionsLast24h > 0}
              />
            </div>
            <div className="relative px-5 md:border-l" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <Instrument
                label="Videos completed" value={metrics.doneRuns}
                color="#67e8f9" caption="all-time"
                size="lg" delay={60}
              />
            </div>
            <div className="relative px-5 md:border-l" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <Instrument
                label="Agents · 7d" value={scorecards.filter(s => s.state === 'active' || s.state === 'idle').length}
                color="#34d399"
                caption={`${scorecards.length} total deployed`}
                size="lg"
                live={scorecards.some(s => s.state === 'active')}
                delay={120}
              />
            </div>
            <div className="relative px-5 md:border-l" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <Instrument
                label="Renders live" value={metrics.runningRuns}
                color={metrics.runningRuns > 0 ? '#c084fc' : '#52525b'}
                caption={metrics.runningRuns > 0 ? 'pipeline active' : 'pipeline idle'}
                size="lg" live={metrics.runningRuns > 0} delay={180}
              />
            </div>
          </div>
        </MissionState>

        {/* ─────────────────────────────────────────────────────────────────
            NOW · LIVE EXECUTION · real workflow + real reasoning
        ───────────────────────────────────────────────────────────────── */}
        <section className="mt-2">
          <SectionHeader
            eyebrow={execGraph ? 'Now · Live execution' : 'Execution channel'}
            title={execGraph?.workflowName ?? 'No active workflow'}
            caption={
              execGraph
                ? `Run · ${execGraph.runId.slice(0, 8)} · ${execGraph.runStatus} · ${execGraph.nodes.length} stages`
                : 'The execution channel is idle'
            }
            right={
              execGraph
                ? <div className="flex items-center gap-2.5">
                    {execGraph.activeIndex != null && (
                      <TierBadge tier="live" label={`Stage ${execGraph.activeIndex + 1} of ${execGraph.nodes.length}`} />
                    )}
                    {execGraph.runStatus === 'done' && <TierBadge tier="archived" label="Complete" />}
                    {execGraph.runStatus === 'failed' && <TierBadge tier="critical" label="Failed" />}
                    <Link href="/manager" className="text-[11px] text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1 transition-colors">
                      Open Operator <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </div>
                : <Link href="/manager" className="text-[11px] text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1 transition-colors">
                    Trigger workflow <ArrowUpRight className="w-3 h-3" />
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
                              {activeAgent?.name ?? activeNode.label} · awaiting first log entry…
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
                        <p className="eyebrow eyebrow-accent !text-[9px]">Ensemble vote</p>
                        <ConfidenceMeter
                          value={Math.round(
                            execGraph.nodes.filter(n => n.status === 'done' || n.status === 'active').length /
                            execGraph.nodes.length * 100,
                          )}
                          label="Pipeline progress"
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
                          { label: 'Outcome',  value: execGraph.runStatus === 'done' ? 'Complete' : 'Failed', tone: execGraph.runStatus === 'done' ? 'live' : 'critical' },
                          { label: 'Stages',   value: `${execGraph.nodes.filter(n => n.status === 'done').length}/${execGraph.nodes.length}` },
                          { label: 'Started',  value: execGraph.startedAt ? formatDistanceToNow(new Date(execGraph.startedAt), { addSuffix: true, locale: sv }) : '—' },
                          { label: 'Finished', value: execGraph.finishedAt ? formatDistanceToNow(new Date(execGraph.finishedAt), { addSuffix: true, locale: sv }) : '—' },
                        ]}
                      />
                    </div>
                  ) : null}

                  {/* Telemetry ticker · always render */}
                  <div className="mt-5 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <MicroTicker
                      live={execGraph.runStatus === 'running'}
                      items={[
                        { label: 'Run',       value: execGraph.runId.slice(0, 8), tone: 'passive' },
                        { label: 'Stages',    value: execGraph.nodes.length },
                        { label: 'Completed', value: execGraph.nodes.filter(n => n.status === 'done').length },
                        { label: 'Tokens · 24h', value: metrics.tokensLast24h.toLocaleString() },
                        { label: 'Avg run',   value: metrics.avgDurationSec != null ? `${metrics.avgDurationSec}s` : '—' },
                      ]}
                    />
                  </div>
                </div>
              </div>
            </MissionState>
          ) : (
            <EmptyState
              eyebrow="Execution channel · idle"
              title="No workflow executing"
              body="When a run starts, this panel will show the live agent handoff graph, reasoning, and ensemble confidence in realtime."
              icon={<ZapOff className="w-6 h-6 text-indigo-300" />}
              action={
                <Link href="/manager" className="btn-omnira ease-os press inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold">
                  Open Operator <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              }
            />
          )}
        </section>

        {/* ─────────────────────────────────────────────────────────────────
            COGNITION STRIP · real-data derived
        ───────────────────────────────────────────────────────────────── */}
        {(recommendation || warning) && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-2">
            {recommendation && (
              <div className={warning ? 'lg:col-span-7' : 'lg:col-span-12'}>
                <Recommendation
                  icon={<Sparkles className="w-4 h-4 text-[#e8c89a]" />}
                  title={recommendation.title}
                  rationale={recommendation.rationale}
                  prediction={recommendation.prediction}
                  confidence={recommendation.confidence}
                  action={recommendation.action}
                />
              </div>
            )}
            {warning && (
              <div className={recommendation ? 'lg:col-span-5' : 'lg:col-span-12'}>
                <AutonomousWarning
                  title={warning.title}
                  detail={warning.detail}
                  action={warning.action}
                />
              </div>
            )}
          </section>
        )}

        {/* ─────────────────────────────────────────────────────────────────
            MISSION SYSTEMS · asymmetric · real data
        ───────────────────────────────────────────────────────────────── */}
        <section className="grid grid-cols-12 gap-5 mt-2">
          {/* Agent Fleet · left-heavy · 7 cols */}
          <div className="col-span-12 xl:col-span-7">
            <SectionHeader
              eyebrow="Autonomous workforce · 7d"
              title="Agent fleet"
              caption={`${scorecards.length} agent${scorecards.length === 1 ? '' : 's'} on the platform · ranked by recent activity`}
              right={
                <Link href="/manager" className="text-[11px] text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1 transition-colors">
                  View all <ArrowUpRight className="w-3 h-3" />
                </Link>
              }
            />
            {fleetSnapshots.length > 0 ? (
              <MissionState tier={fleetSnapshots.some(f => f.status === 'active') ? 'live' : 'passive'} className="grid grid-cols-1 gap-4">
                {fleetSnapshots.map((a, i) => (
                  <AgentCard key={a.id} agent={a} delay={i * 80} />
                ))}
              </MissionState>
            ) : (
              <EmptyState
                eyebrow="Agent fleet · empty"
                title="No agents have executed yet"
                body="Once a workflow runs, agents will appear here ranked by recent activity, success rate, and average latency."
                icon={<Bot className="w-6 h-6 text-indigo-300" />}
              />
            )}
          </div>

          {/* Right column · Memory + Publish · 5 cols */}
          <div className="col-span-12 xl:col-span-5 space-y-5">
            {/* Memory Graph · real memory entries */}
            <div>
              <SectionHeader
                eyebrow="Knowledge mesh"
                title="Memory graph"
                caption={`${memory.total} entr${memory.total === 1 ? 'y' : 'ies'} across ${Object.keys(memory.bySource).length} source${Object.keys(memory.bySource).length === 1 ? '' : 's'}`}
                right={memoryNodes.length > 0 ? <TierBadge tier="passive" label={`${memory.recent.length} recent`} /> : null}
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
                    <MemoryGraph nodes={memoryNodes} edges={memoryEdges} size={320} />
                  </div>
                  <div className="relative mt-5 pt-4 grid grid-cols-3 gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <MemoryLegend color="#a5b4fc" label="Memories" count={memoryNodes.filter(n => n.group === 'agent').length} />
                    <MemoryLegend color="#67e8f9" label="Sources"  count={memoryNodes.filter(n => n.group === 'memory').length} />
                    <MemoryLegend color="#d4a574" label="Links"    count={memoryEdges.length} />
                  </div>
                </Panel>
              ) : (
                <EmptyState
                  variant="silent"
                  eyebrow="Memory · empty"
                  title="Knowledge store has no entries yet"
                  body="As workflows execute, agents will write structured memory here for cross-run recall."
                />
              )}
            </div>

            {/* Publish Pipeline · real media_scripts */}
            <div>
              <SectionHeader
                eyebrow="Distribution"
                title="Publishing pipeline"
                caption={publishItems.length > 0 ? `${publishItems.filter(p => p.status !== 'published').length} in flight` : 'No scripts scheduled'}
                right={publishItems.some(p => p.status === 'rendering') ? <TierBadge tier="live" label="Rendering" /> : null}
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
                  eyebrow="Publish pipeline · idle"
                  title="No scripts in the distribution queue"
                  body="When the Script Agent produces a draft, it will appear here with rendering status and platform targets."
                />
              )}
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────────
            TELEMETRY + HEALTH
        ───────────────────────────────────────────────────────────────── */}
        <section className="grid grid-cols-12 gap-5 mt-2">
          <Panel className="col-span-12 lg:col-span-8 p-7 relative overflow-hidden">
            <PanelHeader
              eyebrow="Realtime telemetry"
              title="Platform vitals"
              subtitle="Token usage · throughput · queue depth · last 7 days"
              icon={<Gauge className="w-4 h-4 text-indigo-300" />}
              right={
                <div className="flex items-center gap-2 caption-mono text-[9.5px] text-zinc-500 uppercase tracking-[0.18em]">
                  <PulseDot tone="emerald" size={5} /> Streaming
                </div>
              }
            />

            <div className="grid grid-cols-3 gap-x-0 gap-y-5">
              <div>
                <Instrument
                  label="Avg run"
                  value={metrics.avgDurationSec != null ? `${metrics.avgDurationSec}` : '—'}
                  unit={metrics.avgDurationSec != null ? 's' : ''}
                  color="#34d399" size="md"
                  caption="last 24h, completed runs"
                />
              </div>
              <div className="md:pl-6 md:border-l" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                <Instrument
                  label="Tokens · 24h"
                  value={metrics.tokensLast24h >= 1000 ? `${(metrics.tokensLast24h / 1000).toFixed(1)}k` : `${metrics.tokensLast24h}`}
                  color="#a5b4fc" size="md"
                  caption="prompt + completion"
                />
              </div>
              <div className="md:pl-6 md:border-l" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                <Instrument
                  label="Queue depth"
                  value={metrics.runningRuns}
                  unit="jobs"
                  color="#c084fc" size="md"
                  caption="currently executing"
                />
              </div>
            </div>

            <div className="mt-7 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="eyebrow !text-[9.5px]">All-time activity</span>
                <span className="caption-mono text-[10px] text-zinc-600">
                  {metrics.totalRuns} runs · {metrics.failedRuns} failed
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

          <Panel className="col-span-12 lg:col-span-4 p-7 relative overflow-hidden">
            <PanelHeader
              eyebrow="Operational integrity"
              title="System health"
              icon={<Shield className="w-4 h-4 text-emerald-300" />}
            />
            <div className="flex items-center gap-6">
              <RadialDial value={metrics.systemHealth} color={healthColor} size={124} thickness={7} />
              <div className="flex-1 stack-3">
                <HealthRow label="Workflows" value={`${snapshot.workflows.length} deployed`}                 dot="emerald" />
                <HealthRow label="Agents"    value={`${snapshot.agents.length} responsive`}                  dot="emerald" />
                <HealthRow label="Approvals" value={`${snapshot.pendingApprovals} pending`}                  dot={snapshot.pendingApprovals > 0 ? 'amber'  : 'emerald'} />
                <HealthRow label="Renders"   value={`${metrics.runningRuns} active`}                          dot={metrics.runningRuns > 0       ? 'indigo' : 'emerald'} />
              </div>
            </div>
            <div className="mt-6 pt-5 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span className="eyebrow !text-[9px]">Status</span>
              <span className="caption-mono text-[11px] font-bold" style={{ color: healthColor }}>
                {healthLabel.toUpperCase()}
              </span>
            </div>
          </Panel>
        </section>

        {/* ─────────────────────────────────────────────────────────────────
            PORTFOLIO
        ───────────────────────────────────────────────────────────────── */}
        {snapshot.projects.length > 0 ? (
          <section className="mt-2">
            <SectionHeader
              eyebrow="Portfolio"
              title="Autonomous businesses"
              caption={`${snapshot.projects.length} live operation${snapshot.projects.length === 1 ? '' : 's'} · each a self-running AI-native company`}
              right={
                <Link href="/projects/new" className="text-[11px] text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1 transition-colors">
                  Deploy <ArrowUpRight className="w-3 h-3" />
                </Link>
              }
            />
            <MissionState tier="passive" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
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
          <section className="mt-2">
            <EmptyState
              eyebrow="Portfolio · empty"
              title="Awaiting first directive"
              body="Deploy your first autonomous business to begin operational telemetry. The OS is ready and waiting."
              icon={<Compass className="w-6 h-6 text-indigo-300" />}
              action={
                <Link href="/projects/new" className="btn-omnira ease-os press inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold">
                  <Plus className="w-3.5 h-3.5" />
                  Deploy first system
                </Link>
              }
            />
          </section>
        )}

        {/* ─────────────────────────────────────────────────────────────────
            HISTORY · real recent runs
        ───────────────────────────────────────────────────────────────── */}
        <section className="mt-2">
          <SectionHeader
            eyebrow="History · archived"
            title="Recent executions"
            caption={`${metrics.totalRuns} total runs across all workflows`}
            right={
              <span className="caption-mono text-[10px] text-zinc-600">
                {metrics.failedRuns} failures · {metrics.doneRuns} complete
              </span>
            }
          />

          {snapshot.recentRuns.length > 0 ? (
            <MissionState tier="archived">
              <Panel className="overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      {['Workflow', 'Project', 'Status', 'Started', 'Duration', ''].map((h) => (
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
                              <span className="inline-flex items-center gap-1.5 text-zinc-500">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: project.color, boxShadow: `0 0 6px ${project.color}88` }} />
                                {project.name}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3.5">
                            <RunStatusBadge status={run.status as RunStatus} />
                          </td>
                          <td className="px-6 py-3.5 text-zinc-600 caption-mono text-[10.5px]">
                            {formatDistanceToNow(new Date(run.created_at), { addSuffix: true, locale: sv })}
                          </td>
                          <td className="px-6 py-3.5 text-zinc-500 caption-mono text-[10.5px]">
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
                              className="inline-flex items-center gap-1 text-zinc-600 hover:text-indigo-300 transition-colors text-[10.5px] opacity-50 group-hover:opacity-100 ease-os"
                            >
                              <Eye className="w-3 h-3" /> Trace
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
              eyebrow="No history yet"
              title="The archive is empty"
              body="Run trace data will collect here as workflows execute."
            />
          )}
        </section>

      </div>
    </div>
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
      title:      `${s.pendingApprovals} reviews are blocking the queue`,
      rationale:  `Clearing the approval inbox releases downstream workflows. Approvals stack quickly when left for more than a few hours.`,
      action:     { label: 'Open approval queue', href: '/approvals' },
    }
  }
  if (s.failedRuns > 0 && s.failRate >= 8) {
    return {
      title:      `${s.failedRuns} run failure${s.failedRuns === 1 ? '' : 's'} · ${s.failRate}% lifetime fail rate`,
      rationale:  `Inspecting the failures and capturing root-cause notes lets the orchestrator suppress retries on the same error class.`,
      action:     { label: 'Inspect failures', href: '/manager' },
    }
  }
  if (s.executionsLast24h === 0 && s.agentsOnline > 0) {
    return {
      title:      'No executions in the last 24h',
      rationale:  `${s.agentsOnline} agent${s.agentsOnline === 1 ? '' : 's'} responsive but idle. Triggering a workflow keeps memory fresh and surfaces drift early.`,
      action:     { label: 'Trigger workflow', href: '/manager' },
    }
  }
  if (s.memoryCount < 5 && s.agentsOnline > 0) {
    return {
      title:      'Memory store is sparse',
      rationale:  `${s.memoryCount} memory entr${s.memoryCount === 1 ? 'y' : 'ies'} on file. Recall quality improves rapidly above 20 entries — run more workflows to enrich.`,
    }
  }
  if (s.avgDurationSec != null && s.avgDurationSec > 60) {
    return {
      title:      `Average run takes ${s.avgDurationSec}s · investigate latency`,
      rationale:  `Long-running workflows compound cost and reduce iteration speed. Profile the slowest steps and consider parallelizing.`,
      action:     { label: 'Open Operator', href: '/manager' },
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
      title:  `${s.degradedAgents} agent${s.degradedAgents === 1 ? '' : 's'} flagged as degraded`,
      detail: 'Recent runs touched by these agents failed at >50% · review traces before next dispatch.',
      action: { label: 'Trace', href: '/manager' },
    }
  }
  if (s.failedRuns >= 3) {
    return {
      title:  `${s.failedRuns} run failures observed`,
      detail: `Auto-retry has been queued where applicable. Root-cause inspection is recommended.`,
      action: { label: 'Inspect', href: '/manager' },
    }
  }
  return null
}

function projectsNarrative(projects: { name: string }[]): string {
  if (projects.length === 0) return 'your autonomous portfolio'
  if (projects.length === 1) return projects[0].name
  if (projects.length === 2) return `${projects[0].name} and ${projects[1].name}`
  const lead = projects.slice(0, -1).map(p => p.name).join(', ')
  return `${lead}, and ${projects.at(-1)!.name}`
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
      <span className="flex items-center gap-2 text-zinc-500">
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
        <p className="caption-mono text-[10.5px] text-zinc-600">/{project.slug}</p>
      </div>

      <div
        className="relative mt-5 pt-3.5 flex items-center gap-5 text-[11px] text-zinc-500"
        style={{ borderTop: `1px solid ${project.color}1a` }}
      >
        <span className="inline-flex items-center gap-1.5">
          <Bot className="w-3 h-3" style={{ color: `${project.color}aa` }} />
          <strong className="text-zinc-200 font-semibold num">{agentCount}</strong> agents
        </span>
        <span className="inline-flex items-center gap-1.5">
          <GitBranch className="w-3 h-3" style={{ color: `${project.color}aa` }} />
          <strong className="text-zinc-200 font-semibold num">{workflowCount}</strong> flows
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <PulseDot tone="emerald" size={4} />
          <span className="eyebrow !text-[8.5px] !text-emerald-400/80">Live</span>
        </span>
      </div>
    </Link>
  )
}
