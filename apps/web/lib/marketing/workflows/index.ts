/**
 * Familje-Stunden Marketing Engine — workflow-handler-registry (Fas 1).
 *
 * Kod-drivna marketing-workflows körs av handlers (inte agent-steg). Den durable
 * drainern (/api/runs/drain) claim:ar en pending run och dispatchar på `run.kind`
 * till rätt handler här. Drainern äger run-statuslogiken (done/retry/failed) —
 * handlern gör bara sitt arbete och KASTAR vid fel (samma kontrakt som runSteps).
 *
 * Fas 1: endast no-op-handlers (foundation). Riktig logik för Campaign Planner,
 * Channel Drafter och Brand/Canon Guard byggs i Fas 2–3. Ingen scope creep.
 *
 * ⛔ The Prompt / AI News berörs aldrig. Allt scoped project_id=familje-stunden.
 */
import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import type { MarketingWorkflowKind, Run } from '@/lib/supabase/types'

export type AdminClient = ReturnType<typeof createAdminClient>

/** En marketing-workflow-handler: gör sitt arbete, kastar vid fel. Sätter EJ run-status. */
export type MarketingHandler = (db: AdminClient, run: Run) => Promise<void>

import { campaignPlannerHandler } from './campaign-planner'
import { channelDrafterHandler } from './channel-drafter'
import { brandGuardHandler } from './brand-guard'

/** Registret som drainern dispatchar mot. Nyckel = runs.kind. */
export const MARKETING_HANDLERS: Record<MarketingWorkflowKind, MarketingHandler> = {
  marketing_campaign_planner: campaignPlannerHandler,
  marketing_channel_drafter: channelDrafterHandler,
  marketing_brand_guard: brandGuardHandler,
}

/** True om en run ska köras av en marketing-handler (kind satt + registrerad). */
export function isMarketingRun(kind: unknown): kind is MarketingWorkflowKind {
  return typeof kind === 'string' && kind in MARKETING_HANDLERS
}
