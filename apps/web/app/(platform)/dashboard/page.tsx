import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'
import {
  Plus, ArrowRight, AlertTriangle,
  Activity, Power,
} from 'lucide-react'

import { OSPage, OSLayer, Panel, PulseDot } from '@/components/platform/os'
import { RunStatusBadge } from '@/components/platform/RunStatusBadge'
import type { RunStatus } from '@/lib/supabase/types'
import { getPlatformConfig } from '@/lib/media/safeguards'
import { PauseToggle } from './PauseToggle'
import { ApprovalsBanner, FailedRunBanner, type FailedRunInfo } from './DashboardClient'

export const dynamic = 'force-dynamic'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProjectWithStats {
  id: string
  name: string
  slug: string
  color: string
  created_at: string
  lastRun: {
    status: RunStatus
    created_at: string
    workflow_name: string | null
  } | null
  runsThisWeek: number
  lastApprovalStatus: 'pending' | 'approved' | 'rejected' | 'revised' | null
  activeWorkflows: number
}

interface PendingApproval {
  id: string
  output_key: string
  created_at: string
  run_id: string | null
  workflow_name: string | null
  project_name: string | null
  project_color: string | null
  project_slug: string | null
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()
  const db = createAdminClient()

  const since7dISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // ── Parallel fetches ────────────────────────────────────────────────────────
  const [
    projectsRes,
    workflowsRes,
    recentRunsRes,
    failedRunsRes,
    runningRunsRes,
    pendingApprovalsRes,
    weekRunsRes,
    recentApprovalsRes,
    platformConfigRes,
    totalRunsRes,
  ] = await Promise.allSettled([
    supabase
      .from('projects')
      .select('id, name, slug, color, created_at')
      .order('created_at', { ascending: true }),

    db
      .from('workflows')
      .select('id, project_id, name, active')
      .eq('active', true),

    // Most recent run per project (via latest 50 to cover all projects)
    (db.from('runs') as any)
      .select('id, project_id, workflow_id, status, created_at, finished_at, workflows(name), projects(name, slug, color)')
      .order('created_at', { ascending: false })
      .limit(50),

    // Failed runs (last 7 days) for warning banners
    (db.from('runs') as any)
      .select('id, project_id, workflow_id, status, created_at, finished_at, workflows(name), projects(name, slug, color)')
      .eq('status', 'failed')
      .gte('created_at', since7dISO)
      .order('created_at', { ascending: false })
      .limit(10),

    // Currently running count
    (db.from('runs') as any).select('id', { count: 'exact', head: true }).eq('status', 'running'),

    // Pending approvals with run/workflow/project joins
    (db.from('approvals') as any)
      .select('id, output_key, created_at, run_id, status, runs(id, workflows(name), projects:projects(name, slug, color))')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20),

    // Runs this week (for per-project counts)
    (db.from('runs') as any)
      .select('id, project_id, status')
      .gte('created_at', since7dISO),

    // Recent approvals for per-project last approval status
    (db.from('approvals') as any)
      .select('id, status, run_id, created_at, runs(projects:projects(id))')
      .order('created_at', { ascending: false })
      .limit(50),

    // Platform config (pause state)
    getPlatformConfig(db),

    // Total runs count
    (db.from('runs') as any).select('id', { count: 'exact', head: true }),
  ])

  // ── Extract data ────────────────────────────────────────────────────────────
  const projects     = projectsRes.status     === 'fulfilled' ? (projectsRes.value.data ?? [])          : []
  const workflows    = workflowsRes.status    === 'fulfilled' ? ((workflowsRes.value as any).data ?? []) : []
  const recentRuns   = recentRunsRes.status   === 'fulfilled' ? ((recentRunsRes.value as any).data ?? []) : []
  const failedRuns   = failedRunsRes.status   === 'fulfilled' ? ((failedRunsRes.value as any).data ?? []) : []
  const runningCount = runningRunsRes.status  === 'fulfilled' ? ((runningRunsRes.value as any).count ?? 0) : 0
  const weekRuns     = weekRunsRes.status     === 'fulfilled' ? ((weekRunsRes.value as any).data ?? [])    : []
  const recentApprovals = recentApprovalsRes.status === 'fulfilled' ? ((recentApprovalsRes.value as any).data ?? []) : []
  const platformConfig  = platformConfigRes.status  === 'fulfilled' ? platformConfigRes.value : { automation_paused: false, paused_reason: null, paused_at: null }
  const totalRuns    = totalRunsRes.status    === 'fulfilled' ? ((totalRunsRes.value as any).count ?? 0)   : 0

  const rawPendingApprovals = pendingApprovalsRes.status === 'fulfilled'
    ? ((pendingApprovalsRes.value as any).data ?? [])
    : []

  // ── Hero metrics ────────────────────────────────────────────────────────────
  const activeProjectCount   = projects.length
  const pendingApprovalCount = rawPendingApprovals.length
  const activeWorkflowCount  = workflows.length
  const failedThisWeek       = failedRuns.length

  // ── Pending approvals (for banner) ─────────────────────────────────────────
  const pendingApprovalRows: PendingApproval[] = rawPendingApprovals.map((a: any) => {
    const run = Array.isArray(a.runs) ? a.runs[0] : a.runs
    const wf  = run ? (Array.isArray(run.workflows) ? run.workflows[0] : run.workflows) : null
    const pr  = run ? (Array.isArray(run.projects)  ? run.projects[0]  : run.projects)  : null
    return {
      id:            a.id,
      output_key:    a.output_key ?? 'output',
      created_at:    a.created_at,
      run_id:        a.run_id,
      workflow_name: wf?.name ?? null,
      project_name:  pr?.name ?? null,
      project_color: pr?.color ?? null,
      project_slug:  pr?.slug ?? null,
    }
  })

  // ── Failed run banners ──────────────────────────────────────────────────────
  const failedRunInfos: FailedRunInfo[] = failedRuns.slice(0, 5).map((r: any) => {
    const wf = Array.isArray(r.workflows) ? r.workflows[0] : r.workflows
    const pr = Array.isArray(r.projects)  ? r.projects[0]  : r.projects
    return {
      id:            r.id,
      workflow_name: wf?.name ?? null,
      project_name:  pr?.name ?? null,
      project_slug:  pr?.slug ?? null,
      project_color: pr?.color ?? null,
      failed_at:     r.finished_at ?? r.created_at,
    }
  })

  // ── Per-project stats ───────────────────────────────────────────────────────
  const projectsWithStats: ProjectWithStats[] = projects.map((p: any) => {
    const projectRuns  = recentRuns.filter((r: any) => r.project_id === p.id)
    const lastRun      = projectRuns[0] ?? null
    const wf           = lastRun ? (Array.isArray(lastRun.workflows) ? lastRun.workflows[0] : lastRun.workflows) : null
    const runsThisWeek = weekRuns.filter((r: any) => r.project_id === p.id).length

    // Find the latest approval for this project
    let lastApprovalStatus: ProjectWithStats['lastApprovalStatus'] = null
    for (const a of recentApprovals as any[]) {
      const ar  = Array.isArray(a.runs) ? a.runs[0] : a.runs
      const apr = ar ? (Array.isArray(ar.projects) ? ar.projects[0] : ar.projects) : null
      if (apr?.id === p.id) {
        lastApprovalStatus = a.status
        break
      }
    }

    const activeWorkflows = workflows.filter((w: any) => w.project_id === p.id).length

    return {
      id:           p.id,
      name:         p.name,
      slug:         p.slug,
      color:        p.color,
      created_at:   p.created_at,
      lastRun: lastRun ? {
        status:        lastRun.status as RunStatus,
        created_at:    lastRun.created_at,
        workflow_name: wf?.name ?? null,
      } : null,
      runsThisWeek,
      lastApprovalStatus,
      activeWorkflows,
    }
  })

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <OSPage>

      {/* ═══════════════════════════════════════════════════════════════
          COMMAND CENTER HEADER
      ═══════════════════════════════════════════════════════════════ */}
      <OSLayer layer="hero">
        <div className="space-y-5">

          {/* Title row */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-indigo-300/70 mb-1.5">
                Omnira Command Center
              </p>
              <h1 className="text-[28px] lg:text-[32px] font-black tracking-tight text-white/95 leading-tight">
                Övervakar och driver autonoma verksamheter
              </h1>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <PauseToggle paused={platformConfig.automation_paused} />
              <Link
                href="/projects/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all hover:brightness-110"
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
                  color: '#fff',
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                Nytt projekt
              </Link>
            </div>
          </div>

          {/* 4 Key metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <HeroMetric
              label="Aktiva företag"
              value={activeProjectCount}
              color="#6366f1"
              dot={activeProjectCount > 0 ? 'indigo' : undefined}
            />
            <HeroMetric
              label="Väntande godkännanden"
              value={pendingApprovalCount}
              color={pendingApprovalCount > 0 ? '#fbbf24' : '#52525b'}
              dot={pendingApprovalCount > 0 ? 'amber' : undefined}
              href={pendingApprovalCount > 0 ? '/approvals' : undefined}
            />
            <HeroMetric
              label="Aktiva arbetsflöden"
              value={activeWorkflowCount}
              color="#34d399"
              dot={runningCount > 0 ? 'emerald' : undefined}
              caption={runningCount > 0 ? `${runningCount} kör nu` : undefined}
            />
            <HeroMetric
              label="Misslyckade körningar (7d)"
              value={failedThisWeek}
              color={failedThisWeek > 0 ? '#f87171' : '#52525b'}
              dot={failedThisWeek > 0 ? 'rose' : undefined}
              caption={totalRuns > 0 ? `${totalRuns} totalt` : undefined}
            />
          </div>

          {/* Global pause banner */}
          {platformConfig.automation_paused && (
            <div
              className="flex items-center gap-3 px-5 py-3.5 rounded-xl flex-wrap"
              style={{
                background: 'rgba(248,113,113,0.07)',
                border: '1px solid rgba(248,113,113,0.22)',
              }}
            >
              <Power className="w-4 h-4 text-rose-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-[12px] font-semibold text-rose-200">
                  Automation pausad
                </span>
                {platformConfig.paused_reason && (
                  <span className="text-[11px] text-rose-300/70 ml-2">
                    — {platformConfig.paused_reason}
                  </span>
                )}
                {platformConfig.paused_at && (
                  <span className="text-[11px] text-zinc-500 ml-2">
                    · sedan {formatDistanceToNow(new Date(platformConfig.paused_at), { addSuffix: true, locale: sv })}
                  </span>
                )}
              </div>
              <PauseToggle paused={true} />
            </div>
          )}
        </div>
      </OSLayer>

      {/* ═══════════════════════════════════════════════════════════════
          GODKÄNNANDEN — visas ALLTID, prioriterat om det finns
      ═══════════════════════════════════════════════════════════════ */}
      <OSLayer layer="operational">
        <div className="space-y-4">

          {/* Section label */}
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Godkännanden
            </p>
            {pendingApprovalCount > 0 && (
              <Link href="/approvals" className="text-[11px] text-amber-300/70 hover:text-amber-300 transition-colors">
                Hantera alla →
              </Link>
            )}
          </div>

          <ApprovalsBanner approvals={pendingApprovalRows} />
        </div>
      </OSLayer>

      {/* ═══════════════════════════════════════════════════════════════
          TRASIGT FÖRST — misslyckade körningar som kräver åtgärd
      ═══════════════════════════════════════════════════════════════ */}
      {failedRunInfos.length > 0 && (
        <OSLayer layer="operational">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-400/80">
                Körningsfel — kräver åtgärd
              </p>
            </div>
            <FailedRunBanner runs={failedRunInfos} />
          </div>
        </OSLayer>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          BUSINESS COMMAND CENTER — varje projekt som ett affärskort
      ═══════════════════════════════════════════════════════════════ */}
      <OSLayer layer="intelligence">
        <div className="space-y-4">

          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Affärsportfolio · {projectsWithStats.length} verksamhet{projectsWithStats.length !== 1 ? 'er' : ''}
            </p>
            <Link href="/projects/new" className="text-[11px] text-indigo-300/70 hover:text-indigo-300 transition-colors">
              + Driftsätt ny →
            </Link>
          </div>

          {projectsWithStats.length === 0 ? (
            <Panel className="p-12 text-center">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}
              >
                <Activity className="w-5 h-5 text-indigo-300" />
              </div>
              <p className="text-[14px] font-medium text-zinc-300 mb-1">Inga projekt ännu</p>
              <p className="text-[11.5px] text-zinc-600 mb-5 max-w-sm mx-auto">
                Driftsätt ditt första autonoma projekt för att börja övervaka verksamheten.
              </p>
              <Link
                href="/projects/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}
              >
                <Plus className="w-3.5 h-3.5" />
                Driftsätt projekt
              </Link>
            </Panel>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {projectsWithStats.map((p, i) => (
                <BusinessCard key={p.id} project={p} index={i} />
              ))}
            </div>
          )}
        </div>
      </OSLayer>

      {/* ═══════════════════════════════════════════════════════════════
          SENASTE KÖRNINGAR — kompakt aktivitetshistorik
      ═══════════════════════════════════════════════════════════════ */}
      <OSLayer layer="footer">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-600">
              Senaste körningar
            </p>
            <span className="text-[10px] text-zinc-700 font-mono">
              {totalRuns} totalt
            </span>
          </div>

          {recentRuns.length === 0 ? (
            <p className="text-[12px] text-zinc-600 py-6 text-center">
              Inga körningar än. Starta ett arbetsflöde för att se historiken här.
            </p>
          ) : (
            <Panel className="overflow-hidden">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {['Arbetsflöde', 'Projekt', 'Status', 'Startad', 'Varaktighet'].map((h) => (
                      <th
                        key={h}
                        className="text-left px-5 py-3 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-600"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.slice(0, 10).map((run: any, i: number) => {
                    const project  = Array.isArray(run.projects)  ? run.projects[0]  : run.projects
                    const workflow = Array.isArray(run.workflows) ? run.workflows[0] : run.workflows
                    const duration = run.started_at && run.finished_at
                      ? Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)
                      : null
                    const isRunning = run.status === 'running'

                    return (
                      <tr
                        key={run.id}
                        className="group hover:bg-white/[0.02] transition-colors"
                        style={{ borderBottom: i < 9 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}
                      >
                        <td className="px-5 py-3 font-medium text-zinc-300">
                          <div className="flex items-center gap-2">
                            {isRunning && <PulseDot tone="indigo" size={4} />}
                            {workflow?.name ?? '—'}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {project && (
                            <span className="inline-flex items-center gap-1.5 text-zinc-500">
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: project.color }}
                              />
                              {project.name}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <RunStatusBadge status={run.status as RunStatus} />
                        </td>
                        <td className="px-5 py-3 text-zinc-600 font-mono text-[10px]">
                          {formatDistanceToNow(new Date(run.created_at), { addSuffix: true, locale: sv })}
                        </td>
                        <td className="px-5 py-3 text-zinc-500 font-mono text-[10px]">
                          {duration != null
                            ? `${duration}s`
                            : isRunning
                              ? <span className="text-indigo-300">live</span>
                              : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Panel>
          )}
        </div>
      </OSLayer>

    </OSPage>
  )
}

// ─── Hero Metric ──────────────────────────────────────────────────────────────

function HeroMetric({
  label,
  value,
  color,
  dot,
  caption,
  href,
}: {
  label: string
  value: number
  color: string
  dot?: 'indigo' | 'emerald' | 'amber' | 'rose'
  caption?: string
  href?: string
}) {
  const inner = (
    <div
      className="panel px-5 py-4 relative overflow-hidden group transition-all"
      style={href ? { cursor: 'pointer' } : undefined}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${color}66, transparent)` }}
      />
      <p className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-zinc-500 mb-2 truncate">
        {label}
      </p>
      <div className="flex items-baseline gap-2">
        <span className="text-[32px] font-black tracking-tight leading-none" style={{ color }}>
          {value}
        </span>
        {dot && <PulseDot tone={dot} size={5} />}
      </div>
      {caption && (
        <p className="text-[10px] text-zinc-600 mt-1 font-mono">{caption}</p>
      )}
    </div>
  )

  if (href) {
    return <Link href={href}>{inner}</Link>
  }
  return inner
}

// ─── Business Card ────────────────────────────────────────────────────────────

function BusinessCard({ project, index }: { project: ProjectWithStats; index: number }) {
  const statusMeta = project.lastRun
    ? {
        running: { label: 'Aktiv',   color: '#34d399', dot: 'emerald' as const },
        done:    { label: 'Aktiv',   color: '#34d399', dot: 'emerald' as const },
        pending: { label: 'Väntar',  color: '#fbbf24', dot: 'amber'  as const },
        failed:  { label: 'Fel',     color: '#f87171', dot: 'rose'   as const },
      }[project.lastRun.status] ?? { label: 'Aktiv', color: '#34d399', dot: 'emerald' as const }
    : { label: 'Inaktiv', color: '#52525b', dot: undefined }

  const approvalMeta = project.lastApprovalStatus
    ? {
        pending:  { label: 'Väntar granskning', color: '#fbbf24' },
        approved: { label: 'Godkänd',           color: '#34d399' },
        rejected: { label: 'Avvisad',           color: '#f87171' },
        revised:  { label: 'Revidering',        color: '#818cf8' },
      }[project.lastApprovalStatus]
    : null

  return (
    <div
      className="panel relative overflow-hidden group animate-fade-in-up"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
    >
      {/* Color accent line */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${project.color}, transparent)` }}
      />
      {/* Hover glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 70% 40% at 50% 0%, ${project.color}12 0%, transparent 70%)` }}
      />

      <div className="relative p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: `linear-gradient(135deg, ${project.color}22, ${project.color}0c)`,
                border: `1px solid ${project.color}44`,
              }}
            >
              <span
                className="w-2.5 h-2.5 rounded-sm rotate-45 block"
                style={{ background: project.color, opacity: 0.85 }}
              />
            </div>
            <div className="min-w-0">
              <h3 className="text-[14px] font-semibold text-white/95 tracking-tight truncate">
                {project.name}
              </h3>
              <p className="text-[10px] text-zinc-600 font-mono">/{project.slug}</p>
            </div>
          </div>

          {/* Status badge */}
          <div className="flex items-center gap-1.5 shrink-0">
            {statusMeta.dot && <PulseDot tone={statusMeta.dot} size={4} />}
            <span className="text-[10px] font-semibold" style={{ color: statusMeta.color }}>
              {statusMeta.label}
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div
          className="grid grid-cols-3 gap-3 pt-3"
          style={{ borderTop: `1px solid ${project.color}1a` }}
        >
          {/* Last run */}
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600 mb-1">
              Senaste körning
            </p>
            {project.lastRun ? (
              <>
                <RunStatusBadge status={project.lastRun.status} />
                <p className="text-[9.5px] text-zinc-600 font-mono mt-1">
                  {formatDistanceToNow(new Date(project.lastRun.created_at), { addSuffix: true, locale: sv })}
                </p>
              </>
            ) : (
              <p className="text-[10px] text-zinc-700">Ingen körning</p>
            )}
          </div>

          {/* Runs this week */}
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600 mb-1">
              Körningar (7d)
            </p>
            <div className="flex items-baseline gap-1">
              <span className="text-[22px] font-black tracking-tight" style={{ color: project.color }}>
                {project.runsThisWeek}
              </span>
            </div>
            <p className="text-[9.5px] text-zinc-600">
              {project.activeWorkflows} flöde{project.activeWorkflows !== 1 ? 'n' : ''}
            </p>
          </div>

          {/* Last approval */}
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600 mb-1">
              Senaste godkänn.
            </p>
            {approvalMeta ? (
              <span
                className="inline-flex items-center gap-1 text-[9.5px] font-semibold px-1.5 py-0.5 rounded"
                style={{
                  color: approvalMeta.color,
                  background: `${approvalMeta.color}18`,
                  border: `1px solid ${approvalMeta.color}30`,
                }}
              >
                {approvalMeta.label}
              </span>
            ) : (
              <p className="text-[10px] text-zinc-700">—</p>
            )}
          </div>
        </div>

        {/* Open button */}
        <div className="pt-1">
          <Link
            href={`/projects/${project.slug}`}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[11.5px] font-semibold transition-all hover:brightness-110"
            style={{
              background: `linear-gradient(135deg, ${project.color}1a, ${project.color}0c)`,
              border: `1px solid ${project.color}30`,
              color: project.color,
            }}
          >
            Öppna
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}
