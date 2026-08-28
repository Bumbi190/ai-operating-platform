/**
 * Omnira Trading Core — canonical decision contracts.
 *
 * Canonical source:
 *  - Datamodell v0.1 §25 (StrategySignal), §26 (AIAnalysis), §29–30 (RiskDecision),
 *    §32 (PropDecision)
 *  - Strategy Specification Canonical v1.0 §16 (grades), §6 (sessions), §15 (SMT)
 *  - Systemarkitektur v0.1 §3 (separation of authority)
 *
 * INVARIANTS:
 *  - A StrategySignal is an observation, not an order (Strategy §43).
 *  - An AIAnalysis is advice. It carries no verdict and can never clear a gate.
 *    AI confidence is never a hard-risk override (Datamodell §26).
 *  - A RiskDecision and a PropDecision each carry a Verdict, and each holds veto.
 *  - Decisions are frozen on construction. An audit trail that can be edited
 *    after the fact is not an audit trail.
 *
 * PHASE 1 SCOPE: shapes and constructors only.
 * No Strategy Engine (Fas 3), no AI provider (Fas 4), no Risk Engine (Fas 5),
 * no Prop Engine (Fas 9). Nothing here evaluates anything.
 */

import type { Verdict } from './authority'
import type { Decimal } from './decimal'
import type {
  AccountId,
  AiAnalysisId,
  InstrumentId,
  PropDecisionId,
  PropFirmProfileId,
  RiskDecisionId,
  RiskProfileId,
  SetupId,
  SignalId,
  ThesisId,
} from './ids'
import type { Reason, ReasonCode } from './reason-codes'
import type { Timestamp } from './time'
import type { StrategyVersionRef } from './versions'

// ─── Strategy vocabulary ──────────────────────────────────────────────────────

/** Trade direction. */
export const DIRECTIONS = ['LONG', 'SHORT'] as const
export type Direction = (typeof DIRECTIONS)[number]

/**
 * Setup grades (Strategy §16). All four are tradable in the canonical baseline.
 * The grade is always recorded even if a future minimum-grade filter changes,
 * so historical results stay comparable (Strategy §41).
 */
export const SETUP_GRADES = ['A+', 'A', 'B', 'C'] as const
export type SetupGrade = (typeof SETUP_GRADES)[number]

/** The two permitted trading sessions (Strategy §6). */
export const TRADING_SESSIONS = ['LONDON', 'NEW_YORK'] as const
export type TradingSession = (typeof TRADING_SESSIONS)[number]

/**
 * SMT is tri-state by canonical rule (Kapitel 3, "SMT = UNKNOWN").
 * UNKNOWN is not FALSE: a setup stays valid without SMT, because SMT is a
 * confirmation that may only lift A to A+ — it can never create a trade.
 */
export const SMT_STATES = ['TRUE', 'FALSE', 'UNKNOWN'] as const
export type SmtState = (typeof SMT_STATES)[number]

/** Strategy-level outcome (Kapitel 3; Strategy §42). */
export const SIGNAL_STATUSES = ['STRATEGY_PASS', 'STRATEGY_INVALID'] as const
export type SignalStatus = (typeof SIGNAL_STATUSES)[number]

/**
 * Break-even trigger type (Canonical Amendments v1.0 A7; Datamodell §41).
 * Recorded so window-close break-even can be measured separately from the
 * swing-based trigger.
 */
export const BREAK_EVEN_TRIGGER_TYPES = ['SWING', 'WINDOW_CLOSE'] as const
export type BreakEvenTriggerType = (typeof BREAK_EVEN_TRIGGER_TYPES)[number]

// ─── Strategy signal ──────────────────────────────────────────────────────────

/**
 * The deterministic output of the Strategy Engine.
 *
 * The detection flags below are *recorded results*, not detection logic. How an
 * iFVG or CISD is identified is GATE-01 / GATE-02 and is not defined anywhere in
 * this package.
 */
export interface StrategySignal {
  readonly signalId: SignalId
  readonly setupId: SetupId
  readonly thesisId: ThesisId
  readonly accountId: AccountId
  readonly instrumentId: InstrumentId
  readonly strategyVersion: StrategyVersionRef
  readonly session: TradingSession
  readonly direction: Direction
  readonly signalTime: Timestamp
  readonly setupGrade: SetupGrade
  readonly entryPrice: Decimal
  readonly technicalStop: Decimal
  readonly targetPrice: Decimal
  readonly initialRr: Decimal
  readonly ifvgDetected: boolean
  readonly cisdDetected: boolean
  readonly smt: SmtState
  readonly liquiditySweepDetected: boolean
  readonly attemptNumber: number
  readonly status: SignalStatus
  readonly reasons: readonly Reason[]
}

// ─── AI analysis ──────────────────────────────────────────────────────────────

/**
 * Advisory commentary on a signal.
 *
 * Note what is absent: there is no `verdict` field, and no function anywhere in
 * this package derives a clearance from an AIAnalysis. That absence is the
 * mechanism — Systemarkitektur §3, "en AI-rekommendation är inte ett risktillstånd".
 */
export interface AiAnalysis {
  readonly aiAnalysisId: AiAnalysisId
  readonly signalId: SignalId
  readonly modelReference: string
  readonly promptVersion: string
  readonly createdAt: Timestamp
  readonly summary: string
  readonly marketRegimeAssessment: string | null
  /** Advisory only. Never a hard-risk override (Datamodell §26). */
  readonly confidence: Decimal | null
  readonly concerns: readonly string[]
  readonly supportingFactors: readonly string[]
  readonly contradictingFactors: readonly string[]
}

// ─── Rule evaluation ──────────────────────────────────────────────────────────

/** A single named rule outcome (Datamodell §30). */
export interface RuleEvaluation {
  readonly rule: string
  readonly outcome: 'PASS' | 'FAIL' | 'WARNING'
  readonly detail?: string
}

// ─── Risk decision ────────────────────────────────────────────────────────────

/**
 * The Risk Engine's verdict on a signal. Holds veto.
 *
 * Quantity and risk figures are optional because a DENY may be reached before
 * sizing is ever computed. They are carried as exact decimals, never floats.
 */
export interface RiskDecision {
  readonly riskDecisionId: RiskDecisionId
  readonly signalId: SignalId
  readonly accountId: AccountId
  readonly riskProfileId: RiskProfileId
  readonly riskProfileVersion: string
  readonly evaluatedAt: Timestamp
  readonly result: Verdict
  readonly proposedQuantity: Decimal | null
  readonly riskAmount: Decimal | null
  readonly riskPercentage: Decimal | null
  readonly dailyLossRemaining: Decimal | null
  readonly drawdownRemaining: Decimal | null
  readonly rulesEvaluated: readonly RuleEvaluation[]
  readonly reasonCodes: readonly ReasonCode[]
}

// ─── Prop decision ────────────────────────────────────────────────────────────

/**
 * The Prop Firm Rules Engine's verdict. Holds veto, independently of Risk.
 *
 * Kept structurally separate from RiskDecision because the two use different
 * models — internal risk is realized-only, a prop firm may be equity-based
 * (Risk Canonical v1.0 §4.2).
 */
export interface PropDecision {
  readonly propDecisionId: PropDecisionId
  readonly signalId: SignalId
  readonly accountId: AccountId
  readonly propFirmProfileId: PropFirmProfileId
  readonly propFirmProfileVersion: string
  readonly evaluatedAt: Timestamp
  readonly result: Verdict
  readonly headroom: Decimal | null
  readonly rulesEvaluated: readonly RuleEvaluation[]
  readonly reasonCodes: readonly ReasonCode[]
}

// ─── Construction ─────────────────────────────────────────────────────────────

/**
 * Deep-freeze a decision object and its array fields.
 *
 * Shallow Object.freeze would still allow `decision.reasonCodes.push(...)`,
 * which is exactly the kind of quiet mutation an audit trail must not permit.
 */
function freezeDeep<T extends object>(value: T): T {
  for (const key of Object.keys(value)) {
    const field = (value as Record<string, unknown>)[key]
    if (Array.isArray(field)) Object.freeze(field)
  }
  return Object.freeze(value)
}

/** Freeze a StrategySignal. */
export function strategySignal(signal: StrategySignal): StrategySignal {
  return freezeDeep({ ...signal })
}

/** Freeze an AiAnalysis. */
export function aiAnalysis(analysis: AiAnalysis): AiAnalysis {
  return freezeDeep({ ...analysis })
}

/** Freeze a RiskDecision. */
export function riskDecision(decision: RiskDecision): RiskDecision {
  return freezeDeep({ ...decision })
}

/** Freeze a PropDecision. */
export function propDecision(decision: PropDecision): PropDecision {
  return freezeDeep({ ...decision })
}
