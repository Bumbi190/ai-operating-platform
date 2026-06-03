/**
 * Brand/Canon Guard — workflow-handler (Fas 1: NO-OP).
 *
 * Foundation-stub. Verifierar bara run-livscykeln för marketing_brand_guard.
 * Ingen valideringslogik, ingen scoring, inget violation-library. Riktig logik = Fas 3.
 */
import 'server-only'
import type { AdminClient, MarketingHandler } from './index'
import type { Run } from '@/lib/supabase/types'

export const brandGuardHandler: MarketingHandler = async (db: AdminClient, run: Run) => {
  await db.from('run_logs').insert({
    run_id: run.id,
    role: 'system',
    content: '🟦 [Fas 1 no-op] marketing_brand_guard — handler körd, ingen valideringslogik ännu.',
  })
}
