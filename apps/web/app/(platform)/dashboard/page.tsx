import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { RunStatusBadge } from '@/components/platform/RunStatusBadge'
import type { RunStatus } from '@/lib/supabase/types'
import {
  Bot, GitBranch, Plus, ArrowRight, Cpu, Shield, Send, Radio,
  Sparkles, FileText, ChevronRight, Eye, Gauge, ArrowUpRight, AlertTriangle,
  Brain, Compass,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'
import {
  Panel, PanelHeader, Sparkline, RadialDial, PulseDot,
  Instrument, AgentCard, WorkflowFlow, SectionHeader, DotMatrix,
  MissionState, TierBadge, StreamingText, MicroTicker, EmptyState,
  SystemReadyBanner, MemoryGraph, PublishPipeline,
  type AgentSnapshot, type FlowNode, type MemoryNode, type MemoryEdge,
  type PublishItem,
} from '@/components/platform/os'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()

  const [
    { data: projects },
    { data: recentRuns },
    { data: agents },
    { data: workflows },
    { count: totalRuns },
    { count: doneRuns },
    { count: failedRuns },
    { count: runningRuns },
    { count: pendingApprovals },
  ] = await Promise.all([
    (supabase.from('projects') as any).select('*').order('created_at'),
    (supabase.from('runs') as any)
      .select('id, status, created_at, started_at, finished_at, workflow_id, workflows(name), projects(name, slug, color)')
      .order('created_at', { ascending: false })
      .limit(8),
    (supabase.from('agents') as any).select('id, name, role, project_id'),
    (supabase.from('workflows') as any).select('id, name, project_id'),
    (supabase.from('runs') as any).select('*', { count: 'exact', head: true }),
    (supabase.from('runs') as any).select('*', { count: 'exact', head: true }).eq('status', 'done'),
    (supabase.from('runs') as any).select('*', { count: 'exact', head: true }).eq('status', 'failed'),
    (supabase.from('runs') as any).select('*', { count: 'exact', head: true }).eq('status', 'running'),
    (supabase.from('approvals') as any).select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  // ── Metrics ────────────────────────────────────────────────────────────────
  const successRate = totalRuns && totalRuns > 0 ? Math.round(((doneRuns ?? 0) / totalRuns) * 100) : 0
  const failRate    = totalRuns && totalRuns > 0 ? Math.round(((failedRuns ?? 0) / totalRuns) * 100) : 0
  const systemHealth = Math.max(0, 100 - failRate * 2)
  const healthColor  = systemHealth >= 90 ? '#34d399' : systemHealth >= 70 ? '#fbbf24' : '#f87171'
  const healthLabel  = systemHealth >= 90 ? 'Optimal' : systemHealth >= 70 ? 'Degraded' : 'Critical'

  const last24h = (recentRuns ?? []).filter((r: any) => new Date(r.created_at).getTime() > Date.now() - 24*60*60*1000)
  const executionsToday = last24h.length
  const autonomousDecisions = (doneRuns ?? 0) + (failedRuns ?? 0)
  const costToday = Math.max(0, executionsToday * 0.74).toFixed(2)
  const tokenBurnPerHour = Math.max(0, executionsToday * 14_320)

  const agentsByProject:    Record<string, number> = (agents ?? []).reduce((acc: Record<string, number>, a: any) => { acc[a.project_id] = (acc[a.project_id] ?? 0) + 1; return acc }, {})
  const workflowsByProject: Record<string, number> = (workflows ?? []).reduce((acc: Record<string, number>, w: any) => { acc[w.project_id] = (acc[w.project_id] ?? 0) + 1; return acc }, {})

  // ── Synthesized agent fleet (uses real agents when present) ────────────────
  const ROLE_DEMOS: Record<string, Partial<AgentSnapshot>> = {
    news:    { role: 'News Hunter',     task: 'Scanning 142 sources for OpenAI announcements',         reasoning: 'High-velocity signal detected on agent-2 cluster · prioritizing AI policy threads',          confidence: 94, status: 'active',    color: '#67e8f9' },
    script:  { role: 'Script Agent',    task: 'Drafting opening hook for Anthropic Claude 4 story',    reasoning: 'Memory: variant 7 outperformed by 23% on retention at 0:08 — adopting that structure',       confidence: 87, status: 'reasoning', color: '#a78bfa' },
    visual:  { role: 'Visual Director', task: 'Selecting B-roll for OpenAI Dev Day cut-down',          reasoning: 'Cross-referencing brand memory · OpenAI palette aligns with shot 3,7,12 — rejecting 4',       confidence: 92, status: 'active',    color: '#a5b4fc' },
    qa:      { role: 'QA Agent',        task: 'Evaluating script 0142 for slop and brand alignment',   reasoning: 'Slop score 1.8/10 (clean) · brand alignment 9.1/10 · pacing flagged at 0:34, needs trim',     confidence: 81, status: 'reasoning', color: '#d4a574' },
    publish: { role: 'Publisher',       task: 'Queueing finalized Anthropic clip for distribution',    reasoning: 'Multi-platform · TikTok primary 18:00 CET, IG Reels +12min staggered for cross-feed lift',   confidence: 97, status: 'active',    color: '#34d399' },
    manager: { role: 'Operator',        task: 'Coordinating handoffs · News → Script → Visual',        reasoning: 'Queue depth healthy · routing 3 hot threads, holding 2 for executive review',                confidence: 89, status: 'active',    color: '#818cf8' },
  }
  const fleet: AgentSnapshot[] = (agents ?? []).slice(0, 4).map((a: any, i: number) => {
    const k = Object.keys(ROLE_DEMOS)
    const arc = ROLE_DEMOS[k[i % k.length]]
    return {
      id: a.id,
      name: a.name ?? arc?.role ?? 'Agent',
      role: a.role ?? arc?.role ?? '—',
      status: (arc?.status as any) ?? 'idle',
      task: arc?.task ?? 'Awaiting next dispatch',
      confidence: arc?.confidence ?? 80,
      memoryUsage: 40 + ((i * 13) % 50),
      runtimeSeconds: 60 + i * 240,
      reasoning: arc?.reasoning,
      color: arc?.color ?? '#818cf8',
    }
  })
  const displayFleet = fleet.length > 0
    ? fleet
    : Object.entries(ROLE_DEMOS).slice(0, 4).map(([k, v], i) => ({
        id: k, name: v.role ?? k, ...v,
        runtimeSeconds: 60 + i * 240, memoryUsage: 35 + ((i * 17) % 55),
      } as AgentSnapshot))

  // ── Active workflow ────────────────────────────────────────────────────────
  const activeWorkflowName =
    (recentRuns ?? []).find((r: any) => r.status === 'running')?.workflows?.name
    ?? (workflows ?? [])[0]?.name
    ?? 'AI Media Pipeline'

  const flowNodes: FlowNode[] = [
    { id: '1', label: 'News Hunter',     sublabel: '142 signals',     icon: Radio,    status: 'done',   color: '#67e8f9' },
    { id: '2', label: 'Script Agent',    sublabel: 'Drafting hook',   icon: FileText, status: 'done',   color: '#a78bfa' },
    { id: '3', label: 'Visual Director', sublabel: 'Selecting B-roll',icon: Sparkles, status: 'active', color: '#a5b4fc' },
    { id: '4', label: 'QA Agent',        sublabel: 'Pending',         icon: Shield,   status: 'queued', color: '#d4a574' },
    { id: '5', label: 'Publisher',       sublabel: 'Pending',         icon: Send,     status: 'queued', color: '#34d399' },
  ]

  // ── Memory graph data ──────────────────────────────────────────────────────
  const memoryNodes: MemoryNode[] = [
    { id: 'news',    label: 'News',    intensity: 0.9, group: 'agent' },
    { id: 'script',  label: 'Script',  intensity: 0.8, group: 'agent' },
    { id: 'visual',  label: 'Visual',  intensity: 0.7, group: 'agent' },
    { id: 'qa',      label: 'QA',      intensity: 0.6, group: 'agent' },
    { id: 'publish', label: 'Publish', intensity: 0.5, group: 'agent' },
    { id: 'brand',   label: 'Brand',   intensity: 0.9, group: 'memory' },
    { id: 'voice',   label: 'Voice',   intensity: 0.7, group: 'memory' },
    { id: 'echo',    label: 'Echo',    intensity: 0.6, group: 'memory' },
  ]
  const memoryEdges: MemoryEdge[] = [
    { from: 'script',  to: 'voice',  weight: 0.9, active: true },
    { from: 'script',  to: 'echo',   weight: 0.8, active: true },
    { from: 'visual',  to: 'brand',  weight: 0.85, active: true },
    { from: 'qa',      to: 'brand',  weight: 0.7 },
    { from: 'qa',      to: 'voice',  weight: 0.6 },
    { from: 'news',    to: 'echo',   weight: 0.5 },
    { from: 'publish', to: 'brand',  weight: 0.65 },
  ]

  // ── Publish pipeline ───────────────────────────────────────────────────────
  const publishItems: PublishItem[] = [
    {
      id: '1',
      title: 'Anthropic Claude 4 launch · 48s cut-down',
      project: 'The Prompt',
      projectColor: '#a5b4fc',
      scheduledAt: new Date(Date.now() + 1000 * 60 * 22).toISOString(),
      status: 'rendering',
      platforms: ['TikTok', 'IG Reels', 'YouTube Shorts'],
    },
    {
      id: '2',
      title: 'OpenAI Dev Day · ensemble recap',
      project: 'The Prompt',
      projectColor: '#a5b4fc',
      scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 2).toISOString(),
      status: 'queued',
      platforms: ['TikTok', 'IG Reels'],
    },
    {
      id: '3',
      title: 'Veckans kvällsstund · vol 24',
      project: 'Familje-Stunden',
      projectColor: '#d4a574',
      scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 18).toISOString(),
      status: 'scheduled',
      platforms: ['Spotify', 'Apple'],
    },
    {
      id: '4',
      title: 'Anthropic researcher interview clip',
      project: 'The Prompt',
      projectColor: '#a5b4fc',
      scheduledAt: new Date(Date.now() - 1000 * 60 * 38).toISOString(),
      status: 'published',
      platforms: ['TikTok', 'IG Reels'],
    },
  ]

  // ── Critical signals — sticky strip only when there's work ────────────────
  const hasCritical = (pendingApprovals ?? 0) > 0 || (failedRuns ?? 0) > 0

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="px-7 lg:px-10 py-10 max-w-[1680px] mx-auto pb-24">

      {/* ─────────────────────────────────────────────────────────────────────
          BOOT · system readiness strip (always present, restrained)
      ───────────────────────────────────────────────────────────────────── */}
      <div className="mb-7 boot-in space-y-4">
        <SystemReadyBanner
          systemsOnline={projects?.length ?? 0}
          systemsTotal={projects?.length ?? 0}
          bootedAt={new Date(Date.now() - 1000 * 60 * 4).toISOString()}
        />

        {/* ─────────────────────────────────────────────────────────────────
            HERO · editorial headline + System Pulse instrument
        ───────────────────────────────────────────────────────────────── */}
        <header className="grid grid-cols-12 gap-7 items-end pt-3">
          {/* Decorative dot matrix */}
          <div className="col-span-12 lg:col-span-8 relative">
            <div className="absolute -top-6 -right-6 opacity-40 pointer-events-none hidden md:block">
              <DotMatrix cols={26} rows={6} mask="fade-radial" />
            </div>

            <p className="eyebrow eyebrow-accent mb-5">
              Omnira · {(projects?.length ?? 0)} autonomous businesses · {(agents ?? []).length} agents · {(workflows ?? []).length} workflows
            </p>

            <h1 className="display-hero text-gradient-instrument max-w-2xl">
              Operating <span className="text-gradient-aurora">autonomous</span> systems.
            </h1>

            <p className="mt-6 text-[14px] text-zinc-400 leading-relaxed max-w-xl">
              Real-time visibility into the agents, workflows, and decisions
              shaping <span className="text-white/85">The Prompt</span>,
              <span className="text-white/85"> Familje-Stunden</span>, and
              <span className="text-white/85"> GainPilot</span>.
            </p>

            <div className="mt-7 flex items-center gap-2.5 flex-wrap">
              {(runningRuns ?? 0) > 0 && <TierBadge tier="live" label={`${runningRuns} executing`} />}
              {(pendingApprovals ?? 0) > 0 && (
                <Link href="/approvals" className="hover:opacity-90 transition-opacity">
                  <TierBadge tier="critical" label={`${pendingApprovals} pending review`} />
                </Link>
              )}
              <Link
                href="/manager"
                className="btn-ghost ease-os inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12px] font-medium"
              >
                <Cpu className="w-3.5 h-3.5" />
                Operator
                <ChevronRight className="w-3 h-3 opacity-60" />
              </Link>
              <Link
                href="/projects/new"
                className="btn-omnira ease-os inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold"
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
                <Instrument label="Health"    value={`${systemHealth}`} unit="%" color={healthColor} caption={healthLabel} live delay={60} />
                <Instrument label="Success"   value={`${successRate}`}   unit="%" color="#34d399" trend={[68, 72, 80, 78, 84, 88, 91, successRate]} delay={120} />
                <Instrument label="Decisions" value={autonomousDecisions} color="#a5b4fc" trend={[10, 16, 22, 19, 28, 24, 32, autonomousDecisions]} caption="autonomous" delay={180} />
                <Instrument label="Cost"      value={`$${costToday}`}    color="#d4a574" caption={`${(tokenBurnPerHour / 1000).toFixed(1)}k tok/h`} delta={{ value: '12%', positive: false }} delay={240} />
              </div>
            </div>
          </aside>
        </header>

        {/* ─────────────────────────────────────────────────────────────────
            CRITICAL · sticky operator-attention strip (only when work pending)
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
                    {pendingApprovals ?? 0} approval{(pendingApprovals ?? 0) === 1 ? '' : 's'} · {failedRuns ?? 0} failed run{(failedRuns ?? 0) === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {(pendingApprovals ?? 0) > 0 && (
                  <Link href="/approvals" className="btn-ghost ease-os inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold">
                    Review queue <ArrowUpRight className="w-3 h-3" />
                  </Link>
                )}
                {(failedRuns ?? 0) > 0 && (
                  <Link href="/manager" className="btn-ghost ease-os inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold">
                    Inspect failures <ArrowUpRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </div>
          </MissionState>
        )}

        {/* ─────────────────────────────────────────────────────────────────
            INSTRUMENT CLUSTER · primary KPIs (passive tier)
        ───────────────────────────────────────────────────────────────── */}
        <MissionState tier="passive" className="mt-2">
          <div className="grid grid-cols-2 md:grid-cols-4 panel p-7 gap-x-0 gap-y-7 relative overflow-hidden">
            <div className="absolute top-0 right-0 opacity-30 pointer-events-none">
              <DotMatrix cols={18} rows={5} mask="fade-radial" />
            </div>

            <div className="relative px-5 md:pl-0">
              <Instrument
                label="Executions today" value={executionsToday}
                color="#a5b4fc" trend={[3, 5, 8, 6, 11, 14, 9, executionsToday]}
                caption="last 24h" size="lg" live={executionsToday > 0}
              />
            </div>
            <div className="relative px-5 md:border-l" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <Instrument
                label="Videos published" value={doneRuns ?? 0}
                color="#67e8f9" trend={[2, 4, 3, 7, 6, 9, 11, doneRuns ?? 0]}
                caption="all-time" size="lg" delay={60}
              />
            </div>
            <div className="relative px-5 md:border-l" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <Instrument
                label="Agents online" value={(agents ?? []).length}
                color="#34d399"
                caption={(agents ?? []).length > 0 ? 'fleet responsive' : 'no agents deployed'}
                size="lg" live={(agents ?? []).length > 0} delay={120}
              />
            </div>
            <div className="relative px-5 md:border-l" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <Instrument
                label="Renders live" value={runningRuns ?? 0}
                color={(runningRuns ?? 0) > 0 ? '#c084fc' : '#52525b'}
                caption={(runningRuns ?? 0) > 0 ? 'pipeline active' : 'pipeline idle'}
                size="lg" live={(runningRuns ?? 0) > 0} delay={180}
              />
            </div>
          </div>
        </MissionState>

        {/* ─────────────────────────────────────────────────────────────────
            NOW · LIVE EXECUTION (feature panel, tier-live · halo + pulse-tape)
        ───────────────────────────────────────────────────────────────── */}
        <section className="mt-2">
          <SectionHeader
            eyebrow="Now · Live execution"
            title="Active workflow"
            caption={`${activeWorkflowName} · agents handing off context in realtime`}
            right={
              <div className="flex items-center gap-2.5">
                <TierBadge tier="live" label="Stage 3 of 5" />
                <Link href="/manager" className="text-[11px] text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1 transition-colors">
                  Open Operator <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
            }
          />

          <MissionState tier="live" halo className="rounded-[22px]">
            <div className="panel-feature p-7 relative overflow-hidden edge-gradient">
              <span className="pulse-tape" aria-hidden />
              <div className="absolute top-0 right-0 opacity-40 pointer-events-none">
                <DotMatrix cols={32} rows={8} mask="fade-radial" />
              </div>

              <div className="relative">
                <WorkflowFlow nodes={flowNodes} />

                {/* Live agent thinking line */}
                <div
                  className="mt-6 px-4 py-3 rounded-xl flex items-center gap-3 tape"
                  style={{
                    background: 'rgba(99,102,241,0.05)',
                    border: '1px solid rgba(99,102,241,0.14)',
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center chrome-edge"
                    style={{
                      background: 'rgba(165,180,252,0.15)',
                      border: '1px solid rgba(165,180,252,0.30)',
                    }}
                  >
                    <Brain className="w-3.5 h-3.5 text-indigo-200" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="eyebrow eyebrow-accent !text-[9px] mb-1">Visual Director · reasoning</p>
                    <p className="text-[12.5px] text-zinc-200 tracking-tight">
                      <StreamingText
                        loop
                        speed={42}
                        hold={2200}
                        cycle={[
                          'Cross-referencing brand memory · OpenAI palette aligns with shots 3, 7, 12',
                          'Rejecting shot 4 · color temperature deviates from canonical reference',
                          'Selecting shot 7 as opening · highest visual density in first 0.8s',
                        ]}
                      />
                    </p>
                  </div>
                </div>

                {/* Telemetry ticker */}
                <div className="mt-5 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <MicroTicker
                    live
                    items={[
                      { label: 'Pipeline ETA',   value: '03:42',            tone: 'live' },
                      { label: 'Ensemble conf',  value: '91%',              tone: 'live' },
                      { label: 'Token cost',     value: '$0.42' },
                      { label: 'Decisions',      value: autonomousDecisions },
                      { label: 'Last handoff',   value: '2.4s ago' },
                    ]}
                  />
                </div>
              </div>
            </div>
          </MissionState>
        </section>

        {/* ─────────────────────────────────────────────────────────────────
            MISSION SYSTEMS · asymmetric flowing composition
            LEFT (7 cols) : Agent Fleet · live
            RIGHT (5 cols): Memory Graph (top) · Publish Pipeline (bottom)
        ───────────────────────────────────────────────────────────────── */}
        <section className="grid grid-cols-12 gap-5 mt-2">
          {/* Agent Fleet — left-heavy column */}
          <div className="col-span-12 xl:col-span-7">
            <SectionHeader
              eyebrow="Autonomous workforce"
              title="Agent fleet"
              caption="Each agent operates independently · memory · reasoning · decisions"
              right={
                <Link href="/manager" className="text-[11px] text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1 transition-colors">
                  View all <ArrowUpRight className="w-3 h-3" />
                </Link>
              }
            />
            <MissionState tier="live" className="grid grid-cols-1 gap-4">
              {displayFleet.map((a, i) => (
                <AgentCard key={a.id} agent={a} delay={i * 80} />
              ))}
            </MissionState>
          </div>

          {/* Right column · Memory + Publish */}
          <div className="col-span-12 xl:col-span-5 space-y-5">
            {/* Memory Graph */}
            <div>
              <SectionHeader
                eyebrow="Knowledge mesh"
                title="Memory graph"
                caption="Live references between agents and brand memory"
                right={<TierBadge tier="live" label="Streaming" />}
              />
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
                  <MemoryLegend color="#a5b4fc" label="Agents"   count={memoryNodes.filter(n => n.group === 'agent').length} />
                  <MemoryLegend color="#67e8f9" label="Memory"   count={memoryNodes.filter(n => n.group === 'memory').length} />
                  <MemoryLegend color="#d4a574" label="Sources" count={memoryEdges.filter(e => e.active).length} active />
                </div>
              </Panel>
            </div>

            {/* Publish Pipeline */}
            <div>
              <SectionHeader
                eyebrow="Distribution"
                title="Publishing pipeline"
                caption="Upcoming and recent platform releases"
                right={<TierBadge tier="live" label={`${publishItems.filter(p => p.status !== 'published').length} queued`} />}
              />
              <Panel className="p-6 relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none opacity-20">
                  <DotMatrix cols={24} rows={20} mask="fade-radial" gap={16} />
                </div>
                <div className="relative">
                  <PublishPipeline items={publishItems} />
                </div>
              </Panel>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────────
            TELEMETRY · 60-min signal + System Health gauge (passive)
        ───────────────────────────────────────────────────────────────── */}
        <section className="grid grid-cols-12 gap-5 mt-2">
          <Panel className="col-span-12 lg:col-span-8 p-7 relative overflow-hidden">
            <PanelHeader
              eyebrow="Realtime telemetry"
              title="Platform vitals"
              subtitle="60-minute operational signal"
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
                  label="Latency" value={`${42 + (totalRuns ?? 0) % 14}`} unit="ms"
                  color="#34d399" trend={[40, 38, 44, 42, 41, 45, 43, 42]} size="md"
                />
              </div>
              <div className="md:pl-6 md:border-l" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                <Instrument
                  label="Throughput" value={`${(executionsToday * 0.8 + 12).toFixed(1)}`} unit="ops/min"
                  color="#a5b4fc" trend={[20, 22, 25, 23, 27, 30, 28, 32]} size="md"
                />
              </div>
              <div className="md:pl-6 md:border-l" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                <Instrument
                  label="Queue depth" value={`${runningRuns ?? 0}`} unit="jobs"
                  color="#c084fc" trend={[3, 4, 2, 5, 3, 4, 2, runningRuns ?? 0]} size="md"
                />
              </div>
            </div>

            <div className="mt-7 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="eyebrow !text-[9.5px]">Last 8 hours</span>
                <span className="caption-mono text-[10px] text-zinc-600">
                  {executionsToday} ops · {failedRuns ?? 0} failures
                </span>
              </div>
              <div className="h-28">
                <Sparkline
                  values={Array.from({ length: 36 }, (_, i) => 30 + Math.sin(i / 3) * 18 + (i % 5) * 4)}
                  color="#a5b4fc" height={112} width={920} fill
                />
              </div>
            </div>
          </Panel>

          {/* System Health */}
          <Panel className="col-span-12 lg:col-span-4 p-7 relative overflow-hidden">
            <PanelHeader
              eyebrow="Operational integrity"
              title="System health"
              icon={<Shield className="w-4 h-4 text-emerald-300" />}
            />
            <div className="flex items-center gap-6">
              <RadialDial value={systemHealth} color={healthColor} size={124} thickness={7} />
              <div className="flex-1 stack-3">
                <HealthRow label="Workflows" value={`${(workflows ?? []).length} deployed`}      dot="emerald" />
                <HealthRow label="Agents"    value={`${(agents ?? []).length} responsive`}        dot="emerald" />
                <HealthRow label="Approvals" value={`${pendingApprovals ?? 0} pending`}           dot={(pendingApprovals ?? 0) > 0 ? 'amber'  : 'emerald'} />
                <HealthRow label="Renders"   value={`${runningRuns ?? 0} active`}                 dot={(runningRuns ?? 0)    > 0 ? 'indigo' : 'emerald'} />
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
            PORTFOLIO · Autonomous businesses (passive)
        ───────────────────────────────────────────────────────────────── */}
        {projects && projects.length > 0 ? (
          <section className="mt-2">
            <SectionHeader
              eyebrow="Portfolio"
              title="Autonomous businesses"
              caption={`${projects.length} live operations · each a self-running AI-native company`}
              right={
                <Link href="/projects/new" className="text-[11px] text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1 transition-colors">
                  Deploy <ArrowUpRight className="w-3 h-3" />
                </Link>
              }
            />
            <MissionState tier="passive" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {projects.map((p: any, i: number) => (
                <ProjectTile
                  key={p.id}
                  project={p}
                  agentCount={agentsByProject[p.id] ?? 0}
                  workflowCount={workflowsByProject[p.id] ?? 0}
                  delay={i * 70}
                />
              ))}
            </MissionState>
          </section>
        ) : (
          <section className="mt-2">
            <EmptyState
              eyebrow="Portfolio · empty"
              title="Awaiting first directive"
              body="Deploy your first autonomous business to begin operational telemetry. The OS is ready and waiting for instructions."
              icon={<Compass className="w-6 h-6 text-indigo-300" />}
              action={
                <Link href="/projects/new" className="btn-omnira ease-os inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold">
                  <Plus className="w-3.5 h-3.5" />
                  Deploy first system
                </Link>
              }
            />
          </section>
        )}

        {/* ─────────────────────────────────────────────────────────────────
            HISTORY · Recent executions (archived)
        ───────────────────────────────────────────────────────────────── */}
        <section className="mt-2">
          <SectionHeader
            eyebrow="History · archived"
            title="Recent executions"
            caption={`${totalRuns ?? 0} total runs across all workflows`}
            right={
              <span className="caption-mono text-[10px] text-zinc-600">
                {failedRuns ?? 0} failures · {doneRuns ?? 0} complete
              </span>
            }
          />

          {recentRuns && recentRuns.length > 0 ? (
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
                    {(recentRuns as any[]).map((run, i) => {
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
                          style={{ borderBottom: i < recentRuns.length - 1 ? '1px solid rgba(255,255,255,0.035)' : 'none' }}
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function MemoryLegend({
  color, label, count, active = false,
}: { color: string; label: string; count: number; active?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: color, boxShadow: active ? `0 0 6px ${color}` : 'none' }}
        />
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
      className="panel animate-fade-in-up relative overflow-hidden group block p-6 transition-all duration-300 hover:-translate-y-0.5 ease-os"
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
