import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { RunStatusBadge } from '@/components/platform/RunStatusBadge'
import { OmniraMark } from '@/components/platform/OmniraLogo'
import type { RunStatus } from '@/lib/supabase/types'
import {
  Bot,
  GitBranch,
  Play,
  Plus,
  ArrowRight,
  Zap,
  CheckCircle2,
  Activity,
  AlertTriangle,
  Clock,
  ClipboardCheck,
  TrendingUp,
  Cpu,
  Shield,
  Radio,
  Layers,
  BarChart3,
  Workflow,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'

// ─── Mini sparkline SVG ────────────────────────────────────────────────────────

function Sparkline({
  values,
  color = '#4f7fff',
  height = 32,
}: {
  values: number[]
  color?: string
  height?: number
}) {
  if (!values.length) return null
  const max = Math.max(...values, 1)
  const w = 80
  const h = height
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h * 0.9}`)
    .join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        opacity="0.8"
      />
      {/* Dot at last point */}
      {values.length > 1 && (
        <circle
          cx={(values.length - 1) / (values.length - 1) * w}
          cy={h - (values[values.length - 1] / max) * h * 0.9}
          r="2.5"
          fill={color}
          opacity="0.9"
        />
      )}
    </svg>
  )
}

// ─── Hero metric card ──────────────────────────────────────────────────────────

function HeroMetric({
  label,
  value,
  sub,
  color,
  icon: Icon,
  glow,
  trend,
  delay = 0,
}: {
  label: string
  value: string | number
  sub?: string
  color: string
  icon: React.ElementType
  glow?: string
  trend?: number[]
  delay?: number
}) {
  return (
    <div
      className="relative rounded-2xl p-5 flex flex-col gap-3 overflow-hidden animate-fade-in-up glass"
      style={{
        animationDelay: `${delay}ms`,
        animationFillMode: 'both',
        boxShadow: glow
          ? `0 0 0 1px rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.5), ${glow}`
          : '0 0 0 1px rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      {/* Top row */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">
          {label}
        </span>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18`, border: `1px solid ${color}30` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
      </div>

      {/* Value */}
      <div className="flex items-end justify-between gap-2">
        <div>
          <p
            className="text-3xl font-black tracking-tight leading-none"
            style={{ color }}
          >
            {value}
          </p>
          {sub && (
            <p className="text-[10.5px] text-zinc-600 mt-1.5 leading-none">{sub}</p>
          )}
        </div>
        {trend && <Sparkline values={trend} color={color} />}
      </div>
    </div>
  )
}

// ─── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  agentCount,
  workflowCount,
  delay = 0,
}: {
  project: any
  agentCount: number
  workflowCount: number
  delay?: number
}) {
  return (
    <Link
      href={`/projects/${project.slug}`}
      className="group relative rounded-2xl p-5 flex flex-col gap-4 overflow-hidden transition-all duration-300 animate-fade-in-up hover:-translate-y-0.5"
      style={{
        animationDelay: `${delay}ms`,
        animationFillMode: 'both',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}
    >
      {/* Hover glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
        style={{ background: `radial-gradient(ellipse 60% 40% at 50% 0%, ${project.color}10 0%, transparent 80%)` }}
      />
      {/* Gradient top border on hover */}
      <div
        className="absolute inset-x-0 top-0 h-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `linear-gradient(90deg, transparent, ${project.color}60, transparent)` }}
      />

      <div className="flex items-start justify-between">
        {/* Project icon */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `linear-gradient(135deg, ${project.color}20 0%, ${project.color}10 100%)`,
            border: `1px solid ${project.color}30`,
            boxShadow: `0 4px 12px ${project.color}20`,
          }}
        >
          <Zap className="w-4 h-4" style={{ color: project.color }} />
        </div>
        <ArrowRight className="w-4 h-4 text-zinc-700 opacity-0 group-hover:opacity-100 group-hover:-translate-x-0 -translate-x-1 transition-all duration-200" />
      </div>

      <div>
        <h3 className="font-semibold text-[13px] text-zinc-200 mb-0.5">{project.name}</h3>
        <p className="text-[10px] text-zinc-600 font-mono">/{project.slug}</p>
      </div>

      <div
        className="flex items-center gap-4 pt-3"
        style={{ borderTop: `1px solid ${project.color}15` }}
      >
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
          <Bot className="w-3 h-3" style={{ color: `${project.color}80` }} />
          <strong className="text-zinc-400 font-semibold">{agentCount}</strong>
          <span>agenter</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
          <GitBranch className="w-3 h-3" style={{ color: `${project.color}80` }} />
          <strong className="text-zinc-400 font-semibold">{workflowCount}</strong>
          <span>workflows</span>
        </div>
      </div>
    </Link>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

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
    (supabase.from('agents') as any).select('id, project_id'),
    (supabase.from('workflows') as any).select('project_id'),
    (supabase.from('runs') as any).select('*', { count: 'exact', head: true }),
    (supabase.from('runs') as any).select('*', { count: 'exact', head: true }).eq('status', 'done'),
    (supabase.from('runs') as any).select('*', { count: 'exact', head: true }).eq('status', 'failed'),
    (supabase.from('runs') as any).select('*', { count: 'exact', head: true }).eq('status', 'running'),
    (supabase.from('approvals') as any).select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  const successRate = totalRuns && totalRuns > 0
    ? Math.round(((doneRuns ?? 0) / totalRuns) * 100)
    : 0
  const failRate = totalRuns && totalRuns > 0
    ? Math.round(((failedRuns ?? 0) / totalRuns) * 100)
    : 0
  const systemHealthScore = Math.max(0, 100 - failRate * 2)

  const isHealthy = systemHealthScore >= 90
  const isWarning = systemHealthScore >= 70 && systemHealthScore < 90

  const healthColor = isHealthy ? '#34d399' : isWarning ? '#fbbf24' : '#f87171'
  const healthLabel = isHealthy ? 'OPTIMAL' : isWarning ? 'DEGRADED' : 'CRITICAL'

  const agentsByProject: Record<string, number> = (agents ?? []).reduce(
    (acc: Record<string, number>, a: any) => { acc[a.project_id] = (acc[a.project_id] ?? 0) + 1; return acc },
    {},
  )
  const workflowsByProject: Record<string, number> = (workflows ?? []).reduce(
    (acc: Record<string, number>, w: any) => { acc[w.project_id] = (acc[w.project_id] ?? 0) + 1; return acc },
    {},
  )

  const now = new Date()
  const hourStr = now.getHours().toString().padStart(2, '0')
  const minStr = now.getMinutes().toString().padStart(2, '0')

  return (
    <div className="relative min-h-screen">

      {/* Ambient background glow */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div
          className="absolute"
          style={{
            top: '-20%',
            left: '10%',
            width: '600px',
            height: '600px',
            background: 'radial-gradient(ellipse at center, rgba(79,127,255,0.06) 0%, transparent 70%)',
            animation: 'orb 20s ease-in-out infinite',
          }}
        />
        <div
          className="absolute"
          style={{
            bottom: '-10%',
            right: '5%',
            width: '400px',
            height: '400px',
            background: 'radial-gradient(ellipse at center, rgba(139,92,246,0.04) 0%, transparent 70%)',
            animation: 'orb 15s ease-in-out infinite reverse',
          }}
        />
      </div>

      <div className="relative z-10 p-7 max-w-[1200px] mx-auto space-y-8">

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between animate-fade-in-up">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="relative w-2 h-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
              </div>
              <span className="text-[10px] font-semibold text-emerald-400 tracking-[0.25em] uppercase">
                All Systems Operational
              </span>
              <span className="text-zinc-700 text-[10px]">·</span>
              <span className="text-[10px] text-zinc-600 font-mono">{hourStr}:{minStr}</span>
            </div>
            <div className="flex items-center gap-3">
              <OmniraMark size={36} variant="silver" />
              <div>
                <h1 className="text-2xl font-black tracking-[0.06em] uppercase"
                  style={{ color: 'rgba(255,255,255,0.92)', letterSpacing: '0.08em' }}>
                  OMNIRA
                </h1>
                <p className="text-[10px] text-zinc-600 tracking-widest uppercase mt-0.5">
                  Mission Control
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(runningRuns ?? 0) > 0 && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold text-blue-300"
                style={{
                  background: 'rgba(59,130,246,0.1)',
                  border: '1px solid rgba(59,130,246,0.25)',
                }}
              >
                <Activity className="w-3 h-3 animate-pulse" />
                {runningRuns} aktiv
              </div>
            )}
            {(pendingApprovals ?? 0) > 0 && (
              <Link
                href="/approvals"
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold text-amber-300 transition-all hover:scale-105"
                style={{
                  background: 'rgba(251,191,36,0.1)',
                  border: '1px solid rgba(251,191,36,0.25)',
                }}
              >
                <ClipboardCheck className="w-3 h-3" />
                {pendingApprovals} approvals
              </Link>
            )}
            <Link
              href="/projects/new"
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-all hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #4f7fff 0%, #8b5cf6 100%)',
                boxShadow: '0 4px 16px rgba(79,127,255,0.3)',
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              Nytt projekt
            </Link>
          </div>
        </div>

        {/* ── System health bar ───────────────────────────────────────────────── */}
        <div
          className="relative rounded-2xl p-4 overflow-hidden animate-fade-in-up glass"
          style={{ animationDelay: '60ms', animationFillMode: 'both' }}
        >
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: `${healthColor}18`, border: `1px solid ${healthColor}40` }}
              >
                <Shield className="w-4 h-4" style={{ color: healthColor }} />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">System Health</p>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-black" style={{ color: healthColor }}>{systemHealthScore}%</p>
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: `${healthColor}20`, color: healthColor }}
                  >
                    {healthLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* Health bar */}
            <div className="flex-1 max-w-sm">
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${systemHealthScore}%`,
                    background: `linear-gradient(90deg, ${healthColor}80, ${healthColor})`,
                    boxShadow: `0 0 8px ${healthColor}60`,
                  }}
                />
              </div>
            </div>

            {/* Quick stats inline */}
            <div className="flex items-center gap-6">
              {[
                { label: 'Total körningar', value: totalRuns ?? 0, icon: BarChart3, color: '#818cf8' },
                { label: 'Lyckade', value: `${successRate}%`, icon: CheckCircle2, color: '#34d399' },
                { label: 'Agenter', value: agents?.length ?? 0, icon: Bot, color: '#a78bfa' },
                { label: 'Workflows', value: workflows?.length ?? 0, icon: Workflow, color: '#60a5fa' },
              ].map((stat) => {
                const Icon = stat.icon
                return (
                  <div key={stat.label} className="text-center">
                    <p className="text-xs font-bold" style={{ color: stat.color }}>{stat.value}</p>
                    <p className="text-[9.5px] text-zinc-600 mt-0.5 whitespace-nowrap">{stat.label}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Hero metrics ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <HeroMetric
            label="Körningar totalt"
            value={totalRuns ?? 0}
            sub="Alla tider"
            color="#818cf8"
            icon={TrendingUp}
            delay={80}
            trend={[2, 5, 3, 8, 6, 11, 9, 14, totalRuns ?? 0]}
          />
          <HeroMetric
            label="Success Rate"
            value={`${successRate}%`}
            sub={`${doneRuns ?? 0} av ${totalRuns ?? 0} körningar`}
            color="#34d399"
            icon={CheckCircle2}
            delay={120}
            trend={[70, 75, 82, 78, 85, 88, 90, 92, successRate]}
            glow="inset 0 1px 0 rgba(52,211,153,0.1)"
          />
          <HeroMetric
            label="Aktiva just nu"
            value={runningRuns ?? 0}
            sub={(runningRuns ?? 0) > 0 ? 'Pågår live' : 'Ingen aktiv'}
            color={(runningRuns ?? 0) > 0 ? '#60a5fa' : '#3f3f5a'}
            icon={Activity}
            delay={160}
          />
          <HeroMetric
            label="Väntar granskning"
            value={pendingApprovals ?? 0}
            sub={(pendingApprovals ?? 0) > 0 ? 'Behöver åtgärd' : 'Allt granskat'}
            color={(pendingApprovals ?? 0) > 0 ? '#fbbf24' : '#3f3f5a'}
            icon={ClipboardCheck}
            delay={200}
            glow={(pendingApprovals ?? 0) > 0 ? 'inset 0 1px 0 rgba(251,191,36,0.1)' : undefined}
          />
        </div>

        {/* ── Quick actions ────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 flex-wrap animate-fade-in-up" style={{ animationDelay: '220ms', animationFillMode: 'both' }}>
          <Link
            href="/manager"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12px] font-medium transition-all hover:scale-105"
            style={{
              background: 'rgba(79,127,255,0.1)',
              border: '1px solid rgba(79,127,255,0.2)',
              color: '#a5b4fc',
            }}
          >
            <Cpu className="w-3.5 h-3.5" />
            Mission Control
          </Link>
          <Link
            href="/approvals"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12px] font-medium transition-all hover:scale-105"
            style={{
              background: (pendingApprovals ?? 0) > 0 ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.03)',
              border: (pendingApprovals ?? 0) > 0 ? '1px solid rgba(251,191,36,0.25)' : '1px solid rgba(255,255,255,0.06)',
              color: (pendingApprovals ?? 0) > 0 ? '#fde68a' : '#52525b',
            }}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            Approvals
            {(pendingApprovals ?? 0) > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-400 text-black text-[9px] font-black flex items-center justify-center">
                {pendingApprovals}
              </span>
            )}
          </Link>
          {projects?.map((p: any) => (
            <Link
              key={p.id}
              href={`/projects/${p.slug}`}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12px] font-medium transition-all hover:scale-105"
              style={{
                background: `${p.color}10`,
                border: `1px solid ${p.color}25`,
                color: `${p.color}cc`,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
              {p.name}
            </Link>
          ))}
        </div>

        {/* ── Projects ────────────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em] flex items-center gap-2">
              <Layers className="w-3 h-3" />
              Projekt ({projects?.length ?? 0})
            </h2>
          </div>

          {projects && projects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {projects.map((project: any, i: number) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  agentCount={agentsByProject[project.id] ?? 0}
                  workflowCount={workflowsByProject[project.id] ?? 0}
                  delay={250 + i * 50}
                />
              ))}
              <Link
                href="/projects/new"
                className="group relative rounded-2xl p-5 flex flex-col items-center justify-center gap-3 min-h-[160px] transition-all duration-300 hover:-translate-y-0.5 animate-fade-in-up"
                style={{
                  animationDelay: `${250 + (projects?.length ?? 0) * 50}ms`,
                  animationFillMode: 'both',
                  background: 'rgba(255,255,255,0.01)',
                  border: '1px dashed rgba(255,255,255,0.07)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all group-hover:scale-110"
                  style={{ border: '1px dashed rgba(79,127,255,0.3)', background: 'rgba(79,127,255,0.05)' }}
                >
                  <Plus className="w-4 h-4 text-indigo-400" />
                </div>
                <span className="text-[12px] font-medium text-zinc-600 group-hover:text-zinc-400 transition-colors">
                  Nytt projekt
                </span>
              </Link>
            </div>
          ) : (
            <div
              className="rounded-2xl p-16 text-center space-y-4"
              style={{ background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.06)' }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto"
                style={{ background: 'rgba(79,127,255,0.08)', border: '1px solid rgba(79,127,255,0.15)' }}
              >
                <Layers className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <p className="font-semibold text-sm text-zinc-300">Inga projekt ännu</p>
                <p className="text-xs text-zinc-600 mt-1">Skapa ditt första projekt för att komma igång</p>
              </div>
              <Link
                href="/projects/new"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #4f7fff, #8b5cf6)', boxShadow: '0 4px 16px rgba(79,127,255,0.3)' }}
              >
                <Plus className="w-4 h-4" />
                Skapa ditt första projekt
              </Link>
            </div>
          )}
        </section>

        {/* ── Recent runs ──────────────────────────────────────────────────────── */}
        <section className="animate-fade-in-up" style={{ animationDelay: '400ms', animationFillMode: 'both' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em] flex items-center gap-2">
              <Clock className="w-3 h-3" />
              Senaste körningar
            </h2>
            <span className="text-[10px] text-zinc-700">{totalRuns ?? 0} totalt</span>
          </div>

          {recentRuns && recentRuns.length > 0 ? (
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
            >
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {['Workflow', 'Projekt', 'Status', 'Startad', 'Tid', ''].map((h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-3 font-semibold text-zinc-600 text-[10px] uppercase tracking-wider"
                      >
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
                        className="transition-colors hover:bg-white/[0.02]"
                        style={{ borderBottom: i < recentRuns.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}
                      >
                        <td className="px-4 py-3 font-medium text-zinc-300">
                          <div className="flex items-center gap-2">
                            {isRunning && (
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
                            )}
                            {workflow?.name ?? '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {project && (
                            <span className="inline-flex items-center gap-1.5 text-zinc-500">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
                              {project.name}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <RunStatusBadge status={run.status as RunStatus} />
                        </td>
                        <td className="px-4 py-3 text-zinc-600 font-mono text-[11px]">
                          {formatDistanceToNow(new Date(run.created_at), { addSuffix: true, locale: sv })}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 font-mono text-[11px]">
                          {duration != null ? `${duration}s` : isRunning ? (
                            <span className="flex items-center gap-1 text-blue-400">
                              <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
                              live
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/projects/${project?.slug}/runs/${run.id}`}
                            className="inline-flex items-center gap-1 text-zinc-700 hover:text-indigo-400 transition-colors text-[11px]"
                          >
                            Visa <ArrowRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              className="rounded-2xl p-12 text-center space-y-3"
              style={{ background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.06)' }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto"
                style={{ background: 'rgba(79,127,255,0.08)', border: '1px solid rgba(79,127,255,0.15)' }}
              >
                <Play className="w-4 h-4 text-indigo-400" />
              </div>
              <p className="text-xs text-zinc-600">Inga körningar ännu — starta ett workflow för att komma igång</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
