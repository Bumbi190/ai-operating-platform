import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
    supabase
      .from('projects')
      .select('id, name, slug, color')
      .order('created_at', { ascending: true }),

    db
      .from('agents')
      .select('id, name, project_id, model'),

    db
      .from('runs')
      .select('id, status, error, created_at, started_at, finished_at, workflow_id, project_id, workflows(name), projects(name, slug, color)')
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: false })
      .limit(50),

    db
      .from('approvals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),

    db
      .from('run_logs')
      .select('tokens_in, tokens_out, runs(agents(name, model))')
      .gte('created_at', monthStart)
      .not('tokens_in', 'is', null),

    manager.getActiveTasks(),

    manager.getRecentMessages(10),

    // Most recent conversation for this user
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
