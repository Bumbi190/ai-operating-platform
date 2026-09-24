/**
 * lib/atlas/survival/history/types.ts — survival transition history (Phase 2A).
 *
 * ── HISTORY, NEVER TRUTH ────────────────────────────────────────────────────
 * Nothing in this module answers "what survival state is Atlas in right now?".
 * That answer always comes from `readSurvivalSnapshot()`. These types describe
 * what was OBSERVED at a recorded instant, so a later reader can explain a
 * transition without mistaking those measurements for current ones.
 *
 * ── WHAT THIS MUST NEVER GROW ──────────────────────────────────────────────
 * No authorization, no autonomy licence, no spend, no reservation, no provider
 * call, no pause/resume. A survival event records a ceiling; it never applies
 * one. Phase 4 owns real hibernation behaviour.
 */

import type { BudgetScope } from '@/lib/cost/budget-gate'
import type {
  AutonomyLicenseLevel,
  FundingState,
  RunwayCoverage,
  SurvivalGap,
  SurvivalReason,
  SurvivalState,
} from '../types'

/**
 * Version of the derivation that produced a row.
 *
 * Bump when the meaning of what is recorded changes — a new threshold semantic,
 * a new reason, a change in what counts as the binding scope. It is deliberately
 * a plain integer and NOT a hash: the repository has a hashing convention for
 * content-addressed contracts (`workflow_defs.def_hash`), and reusing it here
 * would imply a content guarantee this row does not make. A row says "produced
 * by derivation v1", which is exactly what a reader needs and no more.
 *
 * ── v2 ─────────────────────────────────────────────────────────────────────
 * Phase 2B introduced the runway coverage rule, which CHANGES what the same
 * `SurvivalInput` derives: a positive known declaration observed over a partial
 * project set now yields no runway and a CONSERVE cap, where v1 would have
 * divided a platform figure by a partial burn. Rows written before that change
 * were produced under different semantics, so they keep saying v1 and remain
 * interpretable. They are never rewritten.
 */
export const SURVIVAL_DERIVATION_VERSION = 2

/** Every version the deployed schema and recorder understand. */
export const SURVIVAL_KNOWN_DERIVATION_VERSIONS = [1, 2] as const

export type SurvivalDerivationVersion = (typeof SURVIVAL_KNOWN_DERIVATION_VERSIONS)[number]

/**
 * The closed event vocabulary. Two members, and the shape constraint in the
 * database ties each to the presence of `from_state` — a baseline has no
 * predecessor, a transition always does.
 */
export const SURVIVAL_EVENT_TYPES = [
  'BASELINE_OBSERVED',
  'STATE_TRANSITION_OBSERVED',
] as const
export type SurvivalEventType = (typeof SURVIVAL_EVENT_TYPES)[number]

/**
 * One persisted observation, belonging to exactly ONE project's stream.
 *
 * `projectId` is the stream identity, and the fact this row asserts is narrow:
 * "this is the canonical survival observation produced for this project". It is
 * NOT the Systemhälsa figure — that surface derives one observation across all
 * of the operator's allowed project ids, which is a different fact and is
 * derived separately. The two agree only when the allowed set is one project.
 * Nothing here is a statement about the platform as a whole.
 *
 * Immutable: the table refuses UPDATE and DELETE.
 */
export interface SurvivalStateEvent {
  eventId: string
  /** Database-assigned write order. The from_state chain follows this, not occurredAt. */
  eventSeq: number
  projectId: string
  eventType: SurvivalEventType
  fromState: SurvivalState | null
  toState: SurvivalState
  /** The canonical Chapter 18 token the observation implied. Grants nothing. */
  autonomyLevel: AutonomyLicenseLevel
  reasons: SurvivalReason[]
  gaps: SurvivalGap[]
  bindingScope: BudgetScope | null
  bindingLimitSek: number | null
  /**
   * MAY BE NEGATIVE, and that is meaningful evidence rather than a defect.
   * `budget_scope_state()` computes `least(limit, limit - spent - held)`, so an
   * overspent scope reports negative headroom, and `deriveSurvivalState()` reads
   * `<= 0` as `headroom_exhausted` → HIBERNATE. Stored exactly as measured:
   * clamping it to zero would rewrite the measurement into a different fact.
   */
  bindingRemainingSek: number | null
  burnSekPerDay: number | null
  fundingState: FundingState
  /** Present exactly when fundingState is KNOWN. */
  declaredFundingSek: number | null
  /** Null means not established. Never zero. */
  runwayDays: number | null
  /**
   * Whether the observation covered the whole platform burn population.
   *
   * NULL on v1 rows, which predate the concept. On v2 rows it is always stated,
   * and it is what lets a later reader tell "no runway because no burn was
   * measured" from "runway withheld because the scope was partial" — a
   * distinction a null `runwayDays` alone cannot carry.
   */
  runwayCoverage: RunwayCoverage | null
  /** A performance signal. Never cash, never runway. */
  revenueTrendSek: number | null
  operatingPaused: boolean | null
  thresholdStatus: 'provisional' | 'canonical'
  derivationVersion: number
  actorPrincipal: string
  provenance: string
  /** The observation instant, taken from the snapshot's own `asOf`. */
  occurredAt: string
  /** The write instant, assigned by the database. */
  recordedAt: string
}

/**
 * The database's own answer. Three outcomes, and every one of them is a fact:
 * a first observation, a real change, or nothing to record.
 *
 * `unchanged` carries NO event, because none was written. It is the answer that
 * makes this a state history rather than a metrics table, and it is also why a
 * retry is safe: re-observing the same state lands here.
 */
export type SurvivalRecordOutcome =
  | 'baseline_recorded'
  | 'transition_recorded'
  | 'unchanged'

/**
 * The recorder's result. `unavailable` is a COMMUNICATION failure — the boundary
 * could not be consulted — and is deliberately distinct from every outcome the
 * database actually reported, the same distinction `Value<T>` keeps for the
 * system-health reads and `SpendVerdict.reason === 'unavailable'` keeps for spend.
 *
 * It is never "nothing to record": an unreadable boundary means we do not know.
 */
export type SurvivalRecordResult =
  | {
      status: 'baseline_recorded'
      fromState: null
      toState: SurvivalState
      eventId: string
      eventSeq: number
    }
  | {
      status: 'transition_recorded'
      fromState: SurvivalState
      toState: SurvivalState
      eventId: string
      eventSeq: number
    }
  | { status: 'unchanged'; fromState: SurvivalState; toState: SurvivalState }
  | { status: 'unavailable'; detail: string }

/** The reader's status. Mirrors the other principal-scoped readers. */
export type SurvivalHistoryReadStatus = 'ok' | 'project_denied' | 'unavailable'

export interface SurvivalHistoryReadResult {
  status: SurvivalHistoryReadStatus
  events: SurvivalStateEvent[]
}

/** Default page size, and the hard maximum a caller cannot exceed. */
export const SURVIVAL_HISTORY_DEFAULT_LIMIT = 50
export const SURVIVAL_HISTORY_MAX_LIMIT = 200

/** The actor the Phase 2A recorder writes as. A constant, like `atlas.manager`. */
export const SURVIVAL_RECORDER_PRINCIPAL = 'atlas.survival_recorder'

/**
 * The observation FORMAT marker, one per derivation version.
 *
 * Provenance describes the ENVELOPE a row was written in, not a policy: it is
 * how a later reader decides which schema to decode the row with. Phase 2B
 * changed that envelope — it added `runway_coverage` and moved the recorder from
 * 16 to 17 parameters — so a v2 row carrying the v1 marker would be decoded by a
 * reader that does not know the column exists.
 *
 * The versions are therefore named individually rather than as one "current"
 * provenance constant, because there is no such thing: the marker is a function
 * of the row's derivation version. The database enforces the same pairing in
 * `survival_events_policy_identity_valid`, and derives the value itself — a
 * caller cannot supply it.
 *
 * There is deliberately no bare `SURVIVAL_OBSERVATION_PROVENANCE`: a single
 * unversioned constant is precisely the ambiguity that let a v2 row claim v1.
 */
export const SURVIVAL_OBSERVATION_PROVENANCE_V1 = 'atlas.survival.observation.v1'
export const SURVIVAL_OBSERVATION_PROVENANCE_V2 = 'atlas.survival.observation.v2'

/** The envelope marker each derivation version writes. */
export const SURVIVAL_OBSERVATION_PROVENANCE_BY_VERSION: Record<SurvivalDerivationVersion, string> = {
  1: SURVIVAL_OBSERVATION_PROVENANCE_V1,
  2: SURVIVAL_OBSERVATION_PROVENANCE_V2,
}
