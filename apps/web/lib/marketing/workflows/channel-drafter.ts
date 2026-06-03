/**
 * Channel Drafter — workflow-handler (Fas 1: NO-OP).
 *
 * Foundation-stub. Verifierar bara run-livscykeln för marketing_channel_drafter.
 * Ingen utkastlogik, inga LLM-anrop, ingen asset-hantering. Riktig logik = Fas 3.
 */
import 'server-only'
import type { AdminClient, MarketingHandler } from './index'
import type { Run } from '@/lib/supabase/types'

export const channelDrafterHandler: MarketingHandler = async (db: AdminClient, run: Run) => {
  await db.from('run_logs').insert({
    run_id: run.id,
    role: 'system',
    content: '🟦 [Fas 1 no-op] marketing_channel_drafter — handler körd, ingen utkastlogik ännu.',
  })
}
