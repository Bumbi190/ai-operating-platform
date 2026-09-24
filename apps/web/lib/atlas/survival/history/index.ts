/**
 * lib/atlas/survival/history — durable, append-only survival transition history.
 *
 * Phase 2A. This subdirectory RECORDS history and READS it back. It controls no
 * runtime behaviour: it does not pause, spend, authorize, reserve or call a
 * provider, and HIBERNATE remains observational.
 *
 * The current survival state is never obtained from here. It is derived from
 * current measurements by `readSurvivalSnapshot()`; history is evidence of what
 * was observed, not a claim about now.
 */

export {
  SURVIVAL_EVENT_TYPES,
  SURVIVAL_DERIVATION_VERSION,
  SURVIVAL_HISTORY_DEFAULT_LIMIT,
  SURVIVAL_HISTORY_MAX_LIMIT,
  SURVIVAL_RECORDER_PRINCIPAL,
  SURVIVAL_OBSERVATION_PROVENANCE_V1,
  SURVIVAL_OBSERVATION_PROVENANCE_V2,
  SURVIVAL_OBSERVATION_PROVENANCE_BY_VERSION,
  type SurvivalEventType,
  type SurvivalStateEvent,
  type SurvivalRecordOutcome,
  type SurvivalRecordResult,
  type SurvivalHistoryReadStatus,
  type SurvivalHistoryReadResult,
} from './types'

export {
  recordObservation,
  recentEvents,
  type RecordObservationInput,
} from './store'

export {
  recordSurvivalTransition,
  observeProjectSurvival,
  type RecordSurvivalTransitionInput,
} from './principal-write'

export {
  listProjectSurvivalTransitions,
  latestProjectSurvivalEvent,
  type SurvivalHistoryReadArgs,
} from './principal-read'
