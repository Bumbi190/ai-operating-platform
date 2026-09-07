import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOwnedProjectId } from '@/lib/atlas/project-resolution'

type AdminClient = ReturnType<typeof createAdminClient>

export interface LegacyDelegateInput {
  goal: string
  project_id?: string
  tasks: Array<{ title: string; agent?: string }>
}

const PROJECT_DENIED = {
  error: 'Projekt saknas eller ligger utanför din åtkomst. Delegeringen avbröts.',
}

/**
 * Compatibility implementation for the legacy Atlas chat tool.
 *
 * Project identity crosses the server-owned boundary exactly once. No
 * service-role write is reachable until that resolution succeeds, and every
 * write reuses the same authorized id.
 */
export async function executeLegacyDelegate(
  db: AdminClient,
  input: LegacyDelegateInput,
  allowedProjectIds: string[],
): Promise<unknown> {
  const projectId = await resolveOwnedProjectId(db, input.project_id, allowedProjectIds)
  if (!projectId) return PROJECT_DENIED

  const adb: any = db
  const created: { id: string; title: string; status: string }[] = []

  for (const task of (input.tasks ?? [])) {
    try {
      const { data } = await adb.from('manager_tasks').insert({
        project_id: projectId,
        title: task.title,
        description: task.agent ? `Ägare: ${task.agent}` : null,
        status: 'pending',
      }).select('id, title, status').single()
      if (data) created.push(data)
    } catch { /* preserve legacy best-effort task creation */ }
  }

  try {
    await adb.from('agent_messages').insert({
      project_id: projectId,
      from_agent: 'Atlas',
      to_agent: 'Operator',
      message_type: 'daily_plan',
      content: `Delegering: ${input.goal} — ${created.length} uppgifter skapade och tilldelade.`,
    })
  } catch { /* preserve legacy non-critical activity message */ }

  return {
    goal: input.goal,
    created: created.length,
    tasks: created,
    note: 'Uppgifterna syns nu live i Atlas Activity Center.',
  }
}
