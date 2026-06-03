/**
 * Campaign Planner — workflow-handler (Fas 1: NO-OP).
 *
 * Foundation-stub. Verifierar bara att en run av typen marketing_campaign_planner
 * kan claimas av drainern, köras av en handler och markeras done. Ingen planlogik,
 * inga LLM-anrop, inga tabellskrivningar utöver run_logs. Riktig logik = Fas 2.
 */
import 'server-only'
import type { AdminClient, MarketingHandler } from './index'
import type { Run } from '@/lib/supabase/types'

export const campaignPlannerHandler: MarketingHandler = async (db: AdminClient, run: Run) => {
  await db.from('run_logs').insert({
    run_id: run.id,
    role: 'system',
    content: '🟦 [Fas 1 no-op] marketing_campaign_planner — handler körd, ingen planlogik ännu.',
  })
}
