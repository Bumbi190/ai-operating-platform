/**
 * lib/atlas/survival/history/store.ts — the two database boundaries (Phase 2A).
 *
 * READ and RECORD. There is deliberately no update and no delete method on this
 * interface, and the table refuses both at the database level, so history cannot
 * be rewritten through this module even by a caller that wanted to.
 *
 * ── THE RECORD BOUNDARY DOES NOT DECIDE ────────────────────────────────────
 * `recordObservation` forwards an already-derived observation and returns what
 * the database said. It does NOT read history to decide the current state, and
 * nothing downstream may use its result that way: the current survival state is
 * derived from current measurements, never from this table.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { BudgetScope } from '@/lib/cost/budget-gate'
import type {
  AutonomyLicenseLevel,
  FundingState,
  SurvivalGap,
  SurvivalReason,
  SurvivalState,
} from '../types'
import {
  SURVIVAL_HISTORY_DEFAULT_LIMIT,
  SURVIVAL_HISTORY_MAX_LIMIT,
  type SurvivalRecordResult,
  type SurvivalStateEvent,
} from './types'

type AnyDb = any

/** Exactly what the SQL boundary accepts. One field per column, no extra shapes. */
export interface RecordObservationInput {
  projectId: string
  toState: SurvivalState
  autonomyLevel: AutonomyLicenseLevel
  reasons: SurvivalReason[]
  gaps: SurvivalGap[]
  bindingScope: BudgetScope | null
  bindingLimitSek: number | null
  bindingRemainingSek: number | null
  burnSekPerDay: number | null
  fundingState: FundingState
  declaredFundingSek: number | null
  runwayDays: number | null
  revenueTrendSek: number | null
  operatingPaused: boolean | null
  thresholdStatus: 'provisional' | 'canonical'
  derivationVersion: number
  actorPrincipal: string
  provenance: string
  occurredAt: string
}

const COLS = [
  'event_id', 'event_seq', 'project_id', 'event_type', 'from_state', 'to_state',
  'autonomy_level', 'reasons', 'gaps', 'binding_scope', 'binding_limit_sek',
  'binding_remaining_sek', 'burn_sek_per_day', 'funding_state', 'declared_funding_sek',
  'runway_days', 'revenue_trend_sek', 'operating_paused', 'threshold_status',
  'derivation_version', 'actor_principal', 'provenance', 'occurred_at', 'recorded_at',
].join(', ')

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

function toEvent(row: any): SurvivalStateEvent {
  return {
    eventId: String(row.event_id),
    eventSeq: Number(row.event_seq),
    projectId: String(row.project_id),
    eventType: row.event_type,
    fromState: row.from_state ?? null,
    toState: row.to_state,
    autonomyLevel: row.autonomy_level,
    reasons: (row.reasons ?? []) as SurvivalReason[],
    gaps: (row.gaps ?? []) as SurvivalGap[],
    bindingScope: (row.binding_scope ?? null) as BudgetScope | null,
    bindingLimitSek: num(row.binding_limit_sek),
    bindingRemainingSek: num(row.binding_remaining_sek),
    burnSekPerDay: num(row.burn_sek_per_day),
    fundingState: row.funding_state,
    declaredFundingSek: num(row.declared_funding_sek),
    runwayDays: num(row.runway_days),
    revenueTrendSek: num(row.revenue_trend_sek),
    operatingPaused: row.operating_paused ?? null,
    thresholdStatus: row.threshold_status,
    derivationVersion: Number(row.derivation_version),
    actorPrincipal: String(row.actor_principal),
    provenance: String(row.provenance),
    occurredAt: String(row.occurred_at),
    recordedAt: String(row.recorded_at),
  }
}

/**
 * Hand one observation to the atomic boundary. The database derives `from_state`
 * from its own history and decides whether anything is written at all.
 *
 * Never throws: an RPC that failed or was refused is reported as `unavailable`
 * with its detail, because "we could not ask" must never be readable as "nothing
 * happened".
 */
export async function recordObservation(
  input: RecordObservationInput,
  db?: AnyDb,
): Promise<SurvivalRecordResult> {
  try {
    const client: AnyDb = db ?? createAdminClient()
    const { data, error } = await client.rpc('survival_record_observation', {
      p_project_id: input.projectId,
      p_to_state: input.toState,
      p_autonomy_level: input.autonomyLevel,
      p_reasons: input.reasons,
      p_gaps: input.gaps,
      p_binding_scope: input.bindingScope,
      p_binding_limit_sek: input.bindingLimitSek,
      p_binding_remaining_sek: input.bindingRemainingSek,
      p_burn_sek_per_day: input.burnSekPerDay,
      p_funding_state: input.fundingState,
      p_declared_funding_sek: input.declaredFundingSek,
      p_runway_days: input.runwayDays,
      p_revenue_trend_sek: input.revenueTrendSek,
      p_operating_paused: input.operatingPaused,
      p_threshold_status: input.thresholdStatus,
      p_derivation_version: input.derivationVersion,
      p_actor_principal: input.actorPrincipal,
      p_provenance: input.provenance,
      p_occurred_at: input.occurredAt,
    })
    if (error) return { status: 'unavailable', detail: String(error.message ?? error) }

    const row = Array.isArray(data) ? data[0] : data
    if (!row) return { status: 'unavailable', detail: 'boundary returned no row' }

    switch (row.result) {
      case 'baseline_recorded':
        return {
          status: 'baseline_recorded', fromState: null, toState: row.to_state,
          eventId: String(row.event_id), eventSeq: Number(row.event_seq),
        }
      case 'transition_recorded':
        return {
          status: 'transition_recorded', fromState: row.from_state, toState: row.to_state,
          eventId: String(row.event_id), eventSeq: Number(row.event_seq),
        }
      case 'unchanged':
        return { status: 'unchanged', fromState: row.from_state, toState: row.to_state }
      default:
        // An outcome this build does not know is NOT "nothing happened".
        return { status: 'unavailable', detail: `unknown boundary result: ${String(row.result)}` }
    }
  } catch (e) {
    return { status: 'unavailable', detail: e instanceof Error ? e.message : String(e) }
  }
}

/** Most recent events for one project, newest first. */
export async function recentEvents(
  projectId: string,
  limit: number = SURVIVAL_HISTORY_DEFAULT_LIMIT,
  db?: AnyDb,
): Promise<SurvivalStateEvent[]> {
  const take = Math.max(1, Math.min(limit, SURVIVAL_HISTORY_MAX_LIMIT))
  const client: AnyDb = db ?? createAdminClient()
  const { data, error } = await client.from('survival_state_events')
    .select(COLS)
    .eq('project_id', projectId)
    .order('event_seq', { ascending: false })
    .limit(take)
  if (error) throw new Error(String(error.message ?? error))
  return ((data ?? []) as any[]).map(toEvent)
}
