/**
 * Omnira Trading Core — structured reason codes.
 *
 * Canonical source:
 *  - Risk Engine Specification v0.1 §6 (base list, still normative)
 *  - Risk Engine Specification Canonical v1.0 §6 (additions)
 *  - Risk v0.1 §35 (NEWS_STATE_UNKNOWN), Systemarkitektur v0.1 §17, §25, §26
 *  - Provider Connectivity Reason Codes Canonical v1.0 §3 (the nine PROVIDER_*
 *    connectivity codes), which supersedes the closure sentence in Execution
 *    Provider Adapter Canonical v1.2 §8. See Canonical Amendments v1.0, Beslut H.
 *
 * INVARIANTS:
 *  - Decisions carry machine-readable codes, never only prose. Analytics must be
 *    able to separate a strategy rejection from a risk denial without NLP.
 *  - Codes are stable and version-controlled. Renaming one is a breaking change
 *    to every historical journal row that used it.
 *  - A human-readable explanation may accompany a code, never replace it.
 *
 * Phase 1 scope: the vocabulary. The engines that emit these codes arrive in
 * Fas 3 (Strategy), Fas 5 (Risk) and Fas 9 (Prop).
 */

// ─── Risk reason codes (canonical, verbatim) ──────────────────────────────────

/**
 * From Risk Engine Specification v0.1 §6, which Canonical v1.0 §7 keeps in force,
 * plus the three codes Canonical v1.0 §6 adds for the daily-loss model.
 */
export const RISK_REASON_CODES = [
  // v0.1 §6
  'RISK_ALLOWED',
  'MAX_RISK_PER_TRADE_EXCEEDED',
  'DAILY_LOSS_LIMIT',
  'MAX_POSITION_LIMIT',
  'MINIMUM_CONTRACT_TOO_LARGE',
  'MAX_ATTEMPTS_REACHED',
  'SPREAD_TOO_HIGH',
  'STALE_ACCOUNT_DATA',
  'STALE_MARKET_DATA',
  'UNKNOWN_POSITION',
  'KILL_SWITCH_ACTIVE',
  'NEWS_BLOCK',
  'SESSION_BLOCK',
  'INVALID_INSTRUMENT_STATE',
  'EXECUTION_HEALTH_FAILURE',
  // Canonical v1.0 §6
  'DAILY_STOP_ACTIVE',
  'RESERVED_RISK_EXCEEDED',
  // Risk v0.1 §35 — analysis mode may continue with this warning; execution may not.
  'NEWS_STATE_UNKNOWN',
] as const
export type RiskReasonCode = (typeof RISK_REASON_CODES)[number]

// ─── Core authority-chain codes ───────────────────────────────────────────────

/**
 * Refusals Trading Core itself can determine, independent of any trading rule.
 *
 * These are structural: they describe a broken or incomplete authority chain,
 * not a judgement about a market. Nothing here encodes a risk limit, a session
 * window or a strategy parameter — those belong to the engines, behind gates.
 */
export const CORE_REASON_CODES = [
  // Chain completeness (Systemarkitektur §3)
  'STRATEGY_INVALID',
  'EXECUTION_BLOCKED',
  // Gateway authority absence.
  //
  // These say only what the gateway can actually observe: no valid capability
  // reached it. They deliberately do NOT claim a decision is missing — a
  // RiskDecision may well exist and be a DENY, in which case no clearance was
  // ever issued. That distinction is what lets analytics later separate:
  //   (a) no decision was ever produced or recorded — upstream journal is silent
  //   (b) a decision was produced and it was DENY — see RISK_DENIED on the record
  //   (c) a decision existed but no valid authority reached the gateway — here
  'MISSING_RISK_CLEARANCE',
  'MISSING_PROP_CLEARANCE',
  'MISSING_APPROVAL_GRANT',
  // Upstream engine verdicts. Emitted on the decision record by the engine that
  // produced it, never by the gateway.
  'RISK_DENIED',
  'PROP_BLOCKED',
  // Authority provenance — a capability that this codebase did not issue
  'AUTHORITY_NOT_GENUINE',
  // Decision reference integrity (Datamodell §33: proposals name their decisions)
  'MISSING_RISK_DECISION_REFERENCE',
  'MISSING_PROP_DECISION_REFERENCE',
  'RISK_DECISION_REFERENCE_MISMATCH',
  'PROP_DECISION_REFERENCE_MISMATCH',
  // Bounded authority lifetime
  'EXECUTION_INTENT_ALREADY_EXPIRED',
  'EXECUTION_INTENT_OUTLIVES_PROPOSAL',
  'EXECUTION_INTENT_OUTLIVES_APPROVAL',
  // Fail-closed (Systemarkitektur §26)
  'VERDICT_UNKNOWN',
  // Gateway checks (Systemarkitektur §17, §25)
  'PROPOSAL_EXPIRED',
  'APPROVAL_EXPIRED',
  'PROPOSAL_ALREADY_EXECUTED',
  'PROPOSAL_STATUS_INVALID',
  'KILL_SWITCH_ACTIVE',
  // Environment and authority safety (Systemarkitektur §16, §33)
  'ENVIRONMENT_MISMATCH',
  'ENVIRONMENT_UNKNOWN',
  'MODE_FORBIDS_EXECUTION',
  'MODE_ENVIRONMENT_MISMATCH',
  // Provider observation (Execution Provider Adapter Canonical v1.2 §8).
  // The adapter reports these; neither creates authority. SECURITY_DEGRADED is a
  // registered least-privilege weakening, never an implicit approval — whether a
  // given downstream policy must fail closed on it is that policy's decision.
  //
  // SECURITY_DEGRADED means a credential broader than requested. It does NOT mean
  // authentication was refused — that is PROVIDER_AUTHENTICATION_FAILED below.
  // Both codes keep exactly the semantics they had before Beslut H.
  'PROVIDER_DISCONNECTED',
  'SECURITY_DEGRADED',
  /*
   * Provider connectivity (Provider Connectivity Reason Codes Canonical v1.0 §3).
   *
   * Nine observations a session runtime can make about a link, each narrow enough
   * to be acted on without reading prose. They exist because the registry
   * previously could not distinguish "the socket never opened" from "we
   * authenticated and were then dropped": every connectivity failure collapsed
   * onto PROVIDER_DISCONNECTED, which left a journal unable to say why a session
   * ended.
   *
   * THEY CARRY NO RETRY POLICY. Nothing here means "retry", "fatal" or "severe",
   * and no ordering implies rank. Whether a failure is worth another attempt is a
   * runtime decision, held separately in the provider runtime, and deliberately
   * not encoded in a value that also lands in historical rows — a code that
   * carried policy would freeze that policy for every row ever written.
   *
   * They create no authority. A connectivity observation can never mint a
   * RiskClearance, PropClearance, ApprovalGrant or ExecutionIntent.
   *
   * PROSPECTIVE ONLY. Rows written before Beslut H keep the code they carried;
   * PROVIDER_DISCONNECTED stays valid and is never reinterpreted as one of these.
   */
  'PROVIDER_CONNECT_FAILED',
  'PROVIDER_AUTHENTICATION_FAILED',
  'PROVIDER_CONNECTION_LOST',
  'PROVIDER_HEARTBEAT_TIMEOUT',
  'PROVIDER_PROTOCOL_ERROR',
  'PROVIDER_REMOTE_REJECTED',
  'PROVIDER_SESSION_CANCELLED',
  'PROVIDER_RECONNECT_EXHAUSTED',
  'PROVIDER_FAILURE_UNKNOWN',
  // Referential integrity
  'ACCOUNT_MISMATCH',
  'INSTRUMENT_MISMATCH',
  'STRATEGY_VERSION_MISMATCH',
  'REFERENCE_MISMATCH',
] as const
export type CoreReasonCode = (typeof CORE_REASON_CODES)[number]

// ─── Union ────────────────────────────────────────────────────────────────────

export type ReasonCode = RiskReasonCode | CoreReasonCode

const ALL_REASON_CODES: readonly string[] = [...RISK_REASON_CODES, ...CORE_REASON_CODES]

export function isReasonCode(raw: unknown): raw is ReasonCode {
  return typeof raw === 'string' && ALL_REASON_CODES.includes(raw)
}

/**
 * A coded reason with optional prose.
 *
 * `detail` is for humans and may change freely between versions.
 * `code` is the contract and must not.
 */
export interface Reason {
  readonly code: ReasonCode
  readonly detail?: string
}

/** Build a Reason, freezing it so a consumer cannot rewrite the code later. */
export function reason(code: ReasonCode, detail?: string): Reason {
  return Object.freeze(detail === undefined ? { code } : { code, detail })
}
