/**
 * lib/atlas/survival/history/principal-write.ts — the ONE canonical recorder.
 *
 * ── THE DIRECTION THAT MUST NOT REVERSE ────────────────────────────────────
 *
 *     readSurvivalSnapshot()
 *            ↓
 *     canonical observation
 *            ↓
 *     this recorder
 *            ↓
 *     atomic DB boundary
 *            ↓
 *     append-only event
 *
 * NEVER:
 *
 *     history row
 *            ↓
 *     decides current state
 *
 * `recordSurvivalTransition` therefore takes an ALREADY-DERIVED observation. It
 * does not call `deriveSurvivalState`, it does not read the history to work out
 * what the state is, and it holds no threshold of its own — the observation is
 * the only input that can decide what gets recorded.
 *
 * `observeProjectSurvival` is the convenience that pairs the canonical reader
 * with this recorder for one project. It also does not derive anything: it calls
 * `readSurvivalSnapshot`, which is the same function the survival API calls.
 *
 * ── ACTOR AND PROVENANCE ARE NOT PARAMETERS ────────────────────────────────
 * Neither is callable-supplied, and the database enforces the same rule. A
 * survival observation is not a human authority act, so recording `owner` as the
 * actor would assert that a person decided something — which is false. The actor
 * is a fixed machine identity and the provenance is the observation-format
 * version; both are diagnostics that describe HOW a row was produced, never
 * authority over what it means. `survival_events_actor_machine_identity` is a
 * closed vocabulary in the table, so this holds even against a direct RPC call.
 *
 * ── WHAT THIS MUST NEVER DO ────────────────────────────────────────────────
 * Not call a provider. Not reserve spend. Not issue or widen an authorization or
 * autonomy licence. Not change `MissionBudget`, Mission, Delegation or Work
 * Package authority. Not pause or resume anything: HIBERNATE is OBSERVATIONAL in
 * Phase 2A, and no execution-stop setter is called from this module — the
 * stop-authority guard in `lib/qa/stop-authority-authorization.test.ts` permits
 * exactly one caller, and this is not it. Phase 4 owns real hibernation
 * behaviour.
 */

import 'server-only'

import { readSurvivalSnapshot, type SnapshotOptions } from '../snapshot'
import { SURVIVAL_THRESHOLD_STATUS } from '../derive'
import type { SurvivalObservation } from '../types'
import { recordObservation } from './store'
import {
  SURVIVAL_DERIVATION_VERSION,
  SURVIVAL_OBSERVATION_PROVENANCE,
  SURVIVAL_RECORDER_PRINCIPAL,
  type SurvivalRecordResult,
} from './types'

export interface RecordSurvivalTransitionInput {
  /** The history stream. One stream per project. */
  projectId: string
  /** The CANONICAL observation. Taken as given, never re-derived here. */
  observation: SurvivalObservation
}

/**
 * Record one observation against a project's survival history.
 *
 * The database decides the outcome: a first observation becomes a baseline, a
 * real change becomes a transition, and observing the same state again writes
 * nothing at all. `fromState` is derived there, under a lock, from the ledger's
 * own latest event — never from anything this caller supplies.
 */
export async function recordSurvivalTransition(
  input: RecordSurvivalTransitionInput,
): Promise<SurvivalRecordResult> {
  const snapshot = input.observation.snapshot

  return recordObservation({
    projectId: input.projectId,
    toState: snapshot.state,
    // The BARE canonical Chapter 18 token. The presentation label
    // (`describeCeiling`) is derived from it and is deliberately not stored —
    // storing both would be the same fact twice, and the label would then be
    // frozen at whatever wording it had on the day.
    autonomyLevel: input.observation.ceiling,
    reasons: snapshot.reasons,
    gaps: snapshot.gaps,
    bindingScope: snapshot.bindingScope,
    bindingLimitSek: snapshot.bindingLimitSek,
    bindingRemainingSek: snapshot.bindingRemainingSek,
    burnSekPerDay: snapshot.burnSekPerDay,
    fundingState: snapshot.fundingState,
    declaredFundingSek: snapshot.declaredFundingSek,
    runwayDays: snapshot.runwayDays,
    revenueTrendSek: snapshot.revenueTrendSek,
    operatingPaused: snapshot.operatingPaused,
    thresholdStatus: SURVIVAL_THRESHOLD_STATUS,
    derivationVersion: SURVIVAL_DERIVATION_VERSION,
    actorPrincipal: SURVIVAL_RECORDER_PRINCIPAL,
    provenance: SURVIVAL_OBSERVATION_PROVENANCE,
    // The OBSERVATION instant, taken from the snapshot's own injected clock, not
    // from a fresh `now()` here. Replaying a recorded observation therefore keeps
    // its original instant, and `recorded_at` separately holds the write time.
    occurredAt: snapshot.asOf,
  })
}

/**
 * Observe ONE project with the canonical reader, then record the result.
 *
 * The project id is passed as a single-element allow-list so the observation is
 * exactly "the survival condition as it bound THIS project" — its own scopes
 * plus the platform-global scopes, which `budget_headroom` reports per project
 * row. That is what makes a per-project history stream well defined.
 *
 * The single-element list is the point, not an implementation detail. The
 * Systemhälsa surface calls the same reader with the operator's WHOLE allowed
 * set and derives one aggregate observation. Recording that aggregate here would
 * attribute a set-wide fact to one project, so this function never accepts a
 * multi-project list and takes no allow-list at all.
 */
export async function observeProjectSurvival(
  projectId: string,
  options: Omit<SnapshotOptions, 'db'> & { db?: SnapshotOptions['db'] } = {},
): Promise<SurvivalRecordResult> {
  const observation = await readSurvivalSnapshot([projectId], {
    ...options,
    funding: options.funding ?? { kind: 'UNDECLARED' },
  })
  return recordSurvivalTransition({ projectId, observation })
}
