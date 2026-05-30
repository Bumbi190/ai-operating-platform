import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/platform/Sidebar'
import {
  ActivityRail, CommandBar, OperatorModeProvider, MobileRailToggle,
  type ActivityEvent,
} from '@/components/platform/os'

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
      .select('id, status, created_at, finished_at, workflows(name), projects(name, color)')
      .order('created_at', { ascending: false })
      .limit(12),
    (db.from('approvals') as any)
      .select('id, status, output_key, created_at, reviewed_at, runs(workflows(name), projects:projects(name, color))')
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const projects   = projectsRes.status      === 'fulfilled' ? (projectsRes.value.data ?? [])       : []
  const conversations = conversationsRes.status === 'fulfilled' ? (conversationsRes.value.data ?? []) : []
  const runs       = runsRes.status          === 'fulfilled' ? ((runsRes.value as any).data ?? [])  : []
  const approvals  = approvalsRes.status     === 'fulfilled' ? ((approvalsRes.value as any).data ?? []) : []

  const events: ActivityEvent[] = []

  for (const r of runs as any[]) {
    const w = Array.isArray(r.workflows) ? r.workflows[0] : r.workflows
    const p = Array.isArray(r.projects)  ? r.projects[0]  : r.projects
    if (r.status === 'failed') {
      events.push({
        id: `run-${r.id}-fail`,
        type: 'failure',
        title: `${w?.name ?? 'Workflow'} failed`,
        detail: 'Auto-retry queued · trace available',
        project: p?.name,
        projectColor: p?.color,
        timestamp: r.finished_at ?? r.created_at,
        intense: true,
      })
    } else if (r.status === 'running') {
      events.push({
        id: `run-${r.id}-active`,
        type: 'workflow',
        title: `${w?.name ?? 'Workflow'} executing`,
        detail: 'Agents handing off context',
        project: p?.name,
        projectColor: p?.color,
        timestamp: r.created_at,
        intense: true,
      })
    } else if (r.status === 'done') {
      events.push({
        id: `run-${r.id}-done`,
        type: 'publish',
        title: `${w?.name ?? 'Workflow'} completed`,
        project: p?.name,
        projectColor: p?.color,
        timestamp: r.finished_at ?? r.created_at,
      })
    }
  }

  for (const a of approvals as any[]) {
    const run = Array.isArray(a.runs) ? a.runs[0] : a.runs
    const w   = run ? (Array.isArray(run.workflows) ? run.workflows[0] : run.workflows) : null
    const p   = run ? (Array.isArray(run.projects)  ? run.projects[0]  : run.projects)  : null
    if (a.status === 'pending') {
      events.push({
        id: `appr-${a.id}-pending`,
        type: 'approval',
        title: `Review requested · ${a.output_key ?? 'output'}`,
        detail: `${w?.name ?? 'Workflow'} awaiting executive review`,
        project: p?.name,
        projectColor: p?.color,
        timestamp: a.created_at,
        intense: true,
      })
    } else if (a.status === 'approved') {
      events.push({
        id: `appr-${a.id}-ok`,
        type: 'decision',
        title: `Approved · ${a.output_key ?? 'output'}`,
        project: p?.name,
        projectColor: p?.color,
        timestamp: a.reviewed_at ?? a.created_at,
      })
    } else if (a.status === 'rejected') {
      events.push({
        id: `appr-${a.id}-rej`,
        type: 'decision',
        title: `Rejected · ${a.output_key ?? 'output'}`,
        project: p?.name,
        projectColor: p?.color,
        timestamp: a.reviewed_at ?? a.created_at,
      })
    }
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  const activityEvents = events.slice(0, 22)
  const liveCount = events.filter(e => e.intense).length

  return (
    <OperatorModeProvider>
      <div className="relative flex h-screen overflow-hidden" style={{ background: '#030516' }}>
        {/* Sidebar — fixed 260px */}
        <Sidebar
          projects={projects}
          userEmail={user.email ?? ''}
          recentConversations={conversations}
        />

        {/* Main content — between sidebar and rail */}
        <main className="flex-1 ml-[260px] lg:mr-[320px] rail-collapsed-main overflow-y-auto scrollbar-thin">
          <div className="relative min-h-full os-stage os-grain">
            {/* Grid + orbs */}
            <div className="os-grid" />
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="orb orb-indigo animate-orb"     style={{ top: '-10%', left: '6%',   width: 620, height: 620 }} />
              <div className="orb orb-violet animate-orb-rev" style={{ top: '38%',  right: '-8%', width: 520, height: 520 }} />
              <div className="orb orb-gold animate-orb"       style={{ bottom: '-14%', left: '38%', width: 460, height: 460, animationDelay: '6s' }} />
              <div className="orb orb-cyan animate-orb"       style={{ top: '10%',  right: '24%', width: 280, height: 280, animationDelay: '10s', opacity: 0.6 }} />
            </div>
            <div className="scan-line" />

            {/* CommandBar — sticky at top */}
            <div className="relative z-bar">
              <CommandBar operator={user.email ?? undefined} />
            </div>

            {/* Children */}
            <div className="relative z-content">
              {children}
            </div>
          </div>
        </main>

        {/* Live Activity Rail — desktop */}
        <aside
          className="fixed inset-y-0 right-0 z-rail w-[320px] hidden lg:flex flex-col"
          style={{
            background: 'linear-gradient(180deg, rgba(6,9,22,0.88) 0%, rgba(5,7,20,0.94) 100%)',
            backdropFilter: 'blur(22px) saturate(160%)',
            WebkitBackdropFilter: 'blur(22px) saturate(160%)',
          }}
        >
          <ActivityRail events={activityEvents} />
        </aside>

        {/* Mobile rail · bottom-sheet companion */}
        <MobileRailToggle liveCount={liveCount}>
          <ActivityRail events={activityEvents} />
        </MobileRailToggle>
      </div>
    </OperatorModeProvider>
  )
}
