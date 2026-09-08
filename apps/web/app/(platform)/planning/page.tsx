import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { loadPlanningModel } from '@/lib/os/planning'
import { PlanningView } from '@/components/platform/vnext/PlanningView'
import { PlanningLegacy } from './PlanningLegacy'
import { OMNIRA_UI_COOKIE, isVNext, resolveUiGeneration } from '@/lib/ui/generation'

/**
 * `/planning` — an aggregated view over work that already exists.
 *
 * Planning is not an entity here. vNext reads three canonical sources —
 * `manager_tasks` (the delegated-work backlog this route was already bound to),
 * cron-triggered `workflows`, and `workflow_instances` — and renders them
 * read-only. `planning_items` and `sprints` are deliberately not consulted:
 * they have no producer and no consumer, and using them would create a second,
 * weaker planning model.
 *
 * Scoping happens inside `loadPlanningModel`, the same way every other Atlas
 * surface does it — `getAllowedProjectIds` then `scopeProjectFilter` — so an
 * empty allow-list resolves to an impossible id and the queries stay
 * fail-closed rather than returning every row.
 *
 * Legacy keeps the pre-vNext board as its rollback path, unchanged.
 */
export const dynamic = 'force-dynamic'

export default async function PlanningPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cookieStore = await cookies()
  const generation = resolveUiGeneration({
    cookie: cookieStore.get(OMNIRA_UI_COOKIE)?.value ?? null,
  })

  if (!isVNext(generation)) return <PlanningLegacy />

  const model = await loadPlanningModel()
  if (!model) redirect('/login')

  return <PlanningView model={model} />
}
