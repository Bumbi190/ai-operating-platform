import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/platform/Sidebar'
import {
  ActivityRail, CommandBar, OperatorModeProvider, MobileRailToggle,
  VoiceAssistant, type ActivityEvent,
} from '@/components/platform/os'
import { resolveDestination, type DestinationId } from '@/lib/nav/registry'

// Single source of truth for routes — resolve a registry href (with a safe
// fallback if a destination/project can't be resolved).
function navHref(
  id: DestinationId,
  opts: { project?: string; filters?: Record<string, string> } = {},
  fallback = '/atlas',
): string {
  return resolveDestination(id, opts)?.href ?? fallback
}

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  const [projectsRes, conversationsRes, runsRes, approvalsRes] = await Promise.allSettled([
    supabase
      .from('projects')
      .select('id, name, slug, color')
      .order('created_at', { ascending: true }),
    db
      .from('conversations')
      .select('id, title, project_id')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(8),
    (db.from('runs') as any)
      .select('id, status, created_at, finished_at, workflows(name), projects(name, color, slug)')
      .order('created_at', { ascending: false })
      .limit(12),
    (db.from('approvals') as any)
      .select('id, status, output_key, created_at, reviewed_at, runs(workflows(name), projects:projects(name, color, slug))')
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const projects   = projectsRes.status      === 'fulfilled' ? (projectsRes.value.data ?? [])       : []
  const conversations = conversationsRes.status === 'fulfilled' ? (conversationsRes.value.data ?? []) : []
  const runs       = runsRes.status          === 'fulfilled' ? ((runsRes.value as any).data ?? [])  : []
  const approvals  = approvalsRes.status     === 'fulfilled' ? ((approvalsRes.value as any).data ?? []) : []

  const events: ActivityEvent[] = []

  // Människospråkiga, affärsfokuserade, åtgärdsinriktade händelser.
  for (const r of runs as any[]) {
    const w = Array.isArray(r.workflows) ? r.workflows[0] : r.workflows
    const p = Array.isArray(r.projects)  ? r.projects[0]  : r.projects
    const wf = w?.name ?? 'Ett arbetsflöde'
    if (r.status === 'failed') {
      events.push({
        id: `run-${r.id}-fail`,
        type: 'failure',
        title: `${wf} stötte på problem`,
        detail: 'Behöver en titt innan det kan gå vidare',
        project: p?.name,
        projectSlug: p?.slug,
        projectColor: p?.color,
        timestamp: r.finished_at ?? r.created_at,
        intense: true,
        action: { label: 'Åtgärda', href: navHref('activity', { project: p?.slug, filters: { status: 'failed' } }) },
      })
    } else if (r.status === 'running') {
      events.push({
        id: `run-${r.id}-active`,
        type: 'workflow',
        title: `${wf} arbetar just nu`,
        project: p?.name,
        projectSlug: p?.slug,
        projectColor: p?.color,
        timestamp: r.created_at,
        intense: true,
      })
    } else if (r.status === 'done') {
      events.push({
        id: `run-${r.id}-done`,
        type: 'publish',
        title: `${wf} är klart`,
        project: p?.name,
        projectSlug: p?.slug,
        projectColor: p?.color,
        timestamp: r.finished_at ?? r.created_at,
      })
    }
  }

  for (const a of approvals as any[]) {
    const run = Array.isArray(a.runs) ? a.runs[0] : a.runs
    const p   = run ? (Array.isArray(run.projects)  ? run.projects[0]  : run.projects)  : null
    if (a.status === 'pending') {
      events.push({
        id: `appr-${a.id}-pending`,
        type: 'approval',
        title: 'Innehåll väntar på ditt godkännande',
        detail: 'Granska så går det vidare till publicering',
        project: p?.name,
        projectSlug: p?.slug,
        projectColor: p?.color,
        timestamp: a.created_at,
        intense: true,
        action: { label: 'Granska', href: navHref('approvals', { project: p?.slug, filters: { state: 'pending' } }) },
      })
    } else if (a.status === 'approved') {
      events.push({
        id: `appr-${a.id}-ok`,
        type: 'decision',
        title: 'Du godkände ett innehåll',
        project: p?.name,
        projectSlug: p?.slug,
        projectColor: p?.color,
        timestamp: a.reviewed_at ?? a.created_at,
      })
    } else if (a.status === 'rejected') {
      events.push({
        id: `appr-${a.id}-rej`,
        type: 'decision',
        title: 'Du avvisade ett innehåll',
        project: p?.name,
        projectSlug: p?.slug,
        projectColor: p?.color,
        timestamp: a.reviewed_at ?? a.created_at,
      })
    }
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  const activityEvents = events.slice(0, 22)
  const liveCount = events.filter(e => e.intense).length

  // ═══════════════════════════════════════════════════════════════════════════
  //
  //   OMNIRA · OS SHELL · TRUE THREE-COLUMN SPATIAL GRID
  //   ─────────────────────────────────────────────────
  //   Replaces the old "fixed sidebar + fixed rail + margin-pushed main"
  //   approach with a real CSS Grid where every column is a first-class
  //   participant. The canvas owns the entire `minmax(0,1fr)` middle column
  //   and breathes across the viewport from 1440 → 1920 → 2560 → 3840.
  //
  //     grid-cols → [sidebar 260px] [canvas 1fr] [rail 300px]
  //     mobile    → canvas fills, sidebar + rail collapse to overlays
  //
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <OperatorModeProvider>
      <VoiceAssistant />
      <div
        className="
          relative h-screen overflow-hidden
          grid
          grid-cols-1
          lg:[grid-template-columns:260px_minmax(0,1fr)]
        "
        style={{ background: '#030516' }}
      >
        {/* ─── Column 1 · Sidebar (260px) ───────────────────────────────── */}
        <Sidebar
          projects={projects}
          userEmail={user.email ?? ''}
          recentConversations={conversations}
        />

        {/* ─── Column 2 · Operating Canvas (fluid 1fr) ──────────────────── */}
        <main className="relative overflow-y-auto scrollbar-thin os-stage os-grain">
          {/* Ambient backdrop — grid + orbs + scan line                        */}
          <div className="os-grid" aria-hidden />
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <div className="orb orb-indigo animate-orb"     style={{ top: '-10%',   left: '4%',    width: 640, height: 640 }} />
            <div className="orb orb-violet animate-orb-rev" style={{ top: '32%',    right: '-10%', width: 560, height: 560 }} />
            <div className="orb orb-gold animate-orb"       style={{ bottom: '-18%', left: '36%',  width: 500, height: 500, animationDelay: '6s' }} />
            <div className="orb orb-cyan animate-orb"       style={{ top: '8%',     right: '22%',  width: 300, height: 300, animationDelay: '10s', opacity: 0.55 }} />
          </div>
          <div className="scan-line" aria-hidden />

          {/* Sticky command layer */}
          <div className="relative z-bar">
            <CommandBar
              operator={user.email ?? undefined}
              projects={projects.map((p: any) => ({ name: p.name, slug: p.slug }))}
            />
          </div>

          {/* Page canvas */}
          <div className="relative z-content">
            {children}
          </div>
        </main>

        {/* ─── Aktivitets-peek (P0): railen är inte längre en permanent kolumn.
             Samma händelseström nås via flytande knapp → panel, alla skärmstorlekar.
             Fullvyn bor i /agent-activity. ─────────────────────────────── */}
        <MobileRailToggle liveCount={liveCount}>
          <ActivityRail events={activityEvents} />
        </MobileRailToggle>
      </div>
    </OperatorModeProvider>
  )
}
