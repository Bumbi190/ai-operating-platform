import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAllowedProjectIds, scopeProjectFilter } from '@/lib/atlas/isolation'
import { redirect } from 'next/navigation'
import { getManager } from '@/lib/ai/manager'
import { calculateCost, formatCost } from '@/lib/ai/pricing'
import { MissionControlClient } from './MissionControlClient'
import type { MissionControlProps } from './MissionControlClient'

export const dynamic = 'force-dynamic'

export default async function MissionControlPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const manager = getManager()

  // `db` is a service-role client and bypasses RLS, so every project-owned read
  // below is scoped by hand. TWO OWNERSHIP DIMENSIONS live on this page and are
  // deliberately kept apart: the conversation is USER-owned (`user_id`), and is
  // left exactly as it was; everything else is PROJECT-owned.
  //
  // The aggregates matter as much as the rows. `approvalCount` and `totalCost`
  // are computed from these queries, so a scoped list beside a global count
  // would still report another project's work as this operator's.
  const allowedProjectIds = await getAllowedProjectIds(db, user.id)
  const scopedIds = scopeProjectFilter(allowedProjectIds)

  const weekAgo    = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  // ── Parallel data fetch ────────────────────────────────────────────────────
  const [
    projectsRes,
    agentsRes,
    runsRes,
    approvalsRes,
    costsRes,
    tasksRes,
    messagesRes,
    conversationRes,
  ] = await Promise.allSettled([
    // RLS already limits this client to owned projects; scoping by id as well
    // keeps ONE rule true of every query on this page.
    supabase
      .from('projects')
      .select('id, name, slug, color')
      .in('id', scopedIds)
      .order('created_at', { ascending: true }),

    db
      .from('agents')
      .select('id, name, project_id, model')
      .in('project_id', scopedIds),

    db
      .from('runs')
      .select('id, status, error, created_at, started_at, finished_at, workflow_id, project_id, workflows(name), projects(name, slug, color)')
      .in('project_id', scopedIds)
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: false })
      .limit(50),

    // `approvals.project_id` is NULLABLE — 12 of 13 rows carry none — so
    // scoping on that column alone would drop almost every approval. The
    // canonical answer is already in the repository: the approval DECISION
    // route resolves `project_id ?? runs.project_id`, and the operations graph
    // states that null-project rows are included only when their run resolves
    // to an allowed project and are otherwise dropped. Scoping through the run
    // is that same rule expressed in the query.
    db
      .from('approvals')
      .select('id, runs!inner(project_id)', { count: 'exact', head: true })
      .in('runs.project_id', scopedIds)
      .eq('status', 'pending'),

    // `run_logs` has no project_id — its only link is `run_id` — so the scope
    // travels through the parent run.
    //
    // PRE-EXISTING AND NOT REPAIRED HERE: this select has been failing on main
    // ("Could not find a relationship between 'runs' and 'agents'"), so
    // `totalCost` below has always been 0 and `allSettled` swallowed the error.
    // Fixing the relationship would surface a cost figure that has never been
    // shown, which is a functional change, not an isolation one. The scope is
    // added now so that whenever the embed IS repaired, it cannot come back
    // global.
    db
      .from('run_logs')
      .select('tokens_in, tokens_out, runs!inner(project_id, agents(name, model))')
      .in('runs.project_id', scopedIds)
      .gte('created_at', monthStart)
      .not('tokens_in', 'is', null),

    manager.getActiveTasks(scopedIds),

    manager.getRecentMessages(scopedIds, 10),

    // Most recent conversation for this user. USER-owned, not project-owned —
    // left exactly as it was. A conversation may carry no project at all, so
    // substituting project scope here would both weaken and break it.
    db
      .from('conversations')
      .select('id, conversation_messages(id, role, content, created_at)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle() as unknown as Promise<{ data: { id: string; conversation_messages: any[] } | null }>,
  ])

  // ── Extract values ─────────────────────────────────────────────────────────
  const projects      = projectsRes.status      === 'fulfilled' ? (projectsRes.value.data      ?? []) : []
  const agents        = agentsRes.status        === 'fulfilled' ? (agentsRes.value.data        ?? []) : []
  const runs          = runsRes.status          === 'fulfilled' ? (runsRes.value.data          ?? []) : []
  const approvalCount = approvalsRes.status     === 'fulfilled' ? (approvalsRes.value.count    ?? 0)  : 0
  const costLogs      = costsRes.status         === 'fulfilled' ? (costsRes.value.data         ?? []) : []
  const tasks         = tasksRes.status         === 'fulfilled' ? tasksRes.value                       : []
  const agentMessages = messagesRes.status      === 'fulfilled' ? messagesRes.value                    : []

  // Conversation + messages
  const conversation      = conversationRes.status === 'fulfilled' ? conversationRes.value.data : null
  const conversationId    = conversation?.id ?? null
  const rawMessages       = (conversation?.conversation_messages ?? []) as any[]
  const initialChatMessages = rawMessages
    .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(-20)
    .filter((m: any) => m.role === 'user' || m.role === 'assistant')
    .map((m: any) => ({
      id:   m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content ?? '',
    }))

  // ── Cost calculation ───────────────────────────────────────────────────────
  let totalCost = 0
  for (const log of costLogs as any[]) {
    const agent = log.runs?.agents
    if (!agent) continue
    totalCost += calculateCost(
      agent.model ?? 'claude-sonnet-4-6',
      log.tokens_in  ?? 0,
      log.tokens_out ?? 0,
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const props: MissionControlProps = {
    projects:            projects as any,
    agents:              agents   as any,
    runs:                runs     as any,
    approvalCount,
    tasks:               tasks    as any,
    agentMessages:       agentMessages as any,
    totalCostStr:        formatCost(totalCost),
    conversationId,
    initialChatMessages,
  }

  return <MissionControlClient {...props} />
}
