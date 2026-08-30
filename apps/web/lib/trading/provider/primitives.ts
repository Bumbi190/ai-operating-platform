/**
 * Omnira Trading — provider-contract primitives.
 *
 * Transcription of Execution Provider Adapter Canonical v1.2:
 *   §3    CapabilityState
 *   §4    CredentialMode
 *   §5    Available<T>
 *   §7.0  ProviderId · ContractId · ProviderTimestamp
 *   §8    ProviderError, and the Result<T> that carries it (F2)
 *
 * This file introduces no semantics of its own. Every type, every state name and
 * every rule below is written down in v1.2; where a rule is load bearing the
 * canonical sentence is quoted rather than paraphrased.
 *
 * OWNERSHIP (v1.2 §7.0, F14)
 * ──────────────────────────
 * Trading Core owns the *branding mechanism* — `Branded<T, B>` from `../ids` —
 * and the ten shared primitives. The provider contract owns `ProviderId`,
 * `ContractId` and `ProviderTimestamp`: their semantics are this document's, not
 * Core's. Classifying `ContractId` as a Core primitive would assert a Core
 * decision that does not exist.
 *
 * `../ids` is imported TYPE-ONLY. It value-imports `node:crypto` for `newId()`,
 * and nothing in a contract of pure types needs that.
 *
 * AUTHORITY IS ISSUED, NOT DERIVED FROM DATA (v1.2 §2).
 */

import type { Branded } from '../ids'
import type { ReasonCode } from '../reason-codes'

// ─── §7.0 Provider-owned branded ids ──────────────────────────────────────────

/** Identifies the adapter, not the account (v1.2 §7). */
export type ProviderId = Branded<string, 'ProviderId'>

/** Contract level, distinct from instrument identity (v1.2 §7). */
export type ContractId = Branded<string, 'ContractId'>

/**
 * A timestamp whose SOURCE is the provider's reported clock.
 *
 * The branding expresses PROVENANCE — nothing else. Quoting v1.2 §7.0, it is
 * not another wire format, not a freshness proof, not a trust proof, and not a
 * clock-synchronisation proof. `Timestamp` and `ProviderTimestamp` may share the
 * same canonical serialization format while remaining separate nominal types.
 *
 * Two rules follow, and both are structural rather than documentary: a local
 * `Timestamp` can never become a `ProviderTimestamp` by assignment, because the
 * brands differ; and there is no wall-clock fallback anywhere in this package.
 */
export type ProviderTimestamp = Branded<string, 'ProviderTimestamp'>

// ─── §3 Capability semantics ──────────────────────────────────────────────────

/**
 * What a provider can report.
 *
 * v1.2 §3: "Endast `SUPPORTED` uppfyller ett säkerhetskritiskt capability-krav.
 * `CONDITIONAL` och `UNKNOWN` **fail closed**, om inte ett explicit definierat
 * villkor har bevisats."
 *
 * And: these states "får **aldrig** kollapsas till boolean. `UNKNOWN` och
 * `UNSUPPORTED` är olika fakta, och endast det ena är meningsfullt att försöka
 * igen." That is why there is no `isSupported(): boolean` convenience here
 * beyond the single predicate below, which answers the canonical question and
 * not a looser one.
 */
export const CAPABILITY_STATES = ['SUPPORTED', 'UNSUPPORTED', 'CONDITIONAL', 'UNKNOWN'] as const
export type CapabilityState = (typeof CAPABILITY_STATES)[number]

/**
 * Whether a state satisfies a safety-critical requirement.
 *
 * A pure transcription of the §3 rule and nothing more: only SUPPORTED does.
 * CONDITIONAL and UNKNOWN fail closed. Proving an explicit condition is a
 * separate act that this function deliberately cannot express.
 */
export function satisfiesSafetyCriticalRequirement(state: CapabilityState): boolean {
  return state === 'SUPPORTED'
}

// ─── §4 Credential semantics ──────────────────────────────────────────────────

/**
 * What the provider's own credential permits.
 *
 * v1.2 §4 keeps this strictly apart from Omnira authority: "Vad providern
 * tekniskt tillåter" versus "Vad Omnira faktiskt får göra". A broader mode is a
 * registered least-privilege weakening reported as `SECURITY_DEGRADED` on the
 * health surface — never an implicit approval, and never a reason to expose an
 * order path.
 *
 * The four proposals v1.2 §4 records as rejected — `requestedCredentialMode`,
 * `requiredCredentialMode`, `preferredCredentialMode`, `credentialPolicy` — are
 * absent here for that reason. The provider reports the ACTUAL resolved mode;
 * there is no requested-mode protocol at Level 1.
 */
export const CREDENTIAL_MODES = ['READ_ONLY_ENFORCED', 'READ_WRITE_CAPABLE', 'UNKNOWN'] as const
export type CredentialMode = (typeof CREDENTIAL_MODES)[number]

// ─── §5 Field availability ────────────────────────────────────────────────────

/**
 * A reading a provider may or may not supply.
 *
 * v1.2 §5: "Adaptern gissar aldrig ett saknat fält." If a value is required for
 * a safety-critical calculation and returns UNAVAILABLE or UNKNOWN, the
 * calculation fails closed rather than substituting a default.
 *
 * PRESENT carries its value; UNAVAILABLE and UNKNOWN carry nothing. The three
 * are different facts: "providern har bevisligen inget värde" is not the same
 * claim as "ej efterfrågat, eller ej besvarat".
 *
 * SEPARATE FROM REPLAY'S `ObservedValue<T>` (v1.2 F14.1). Identical shape is not
 * identical ownership: `Available<T>` is provider/adapter vocabulary, while
 * `ObservedValue<T>` is replay/operator vocabulary. Aliasing them, moving one
 * into the other's package, or re-exporting either as the other is forbidden.
 * A lossless mapping belongs in a normalization layer, which is not this stage.
 */
export type Available<T> =
  | { readonly state: 'PRESENT'; readonly value: T }
  | { readonly state: 'UNAVAILABLE' }
  | { readonly state: 'UNKNOWN' }

export function present<T>(value: T): Available<T> {
  return { state: 'PRESENT', value }
}

/*
 * Factories rather than shared constants: a singleton would be aliased across
 * several fields of the same snapshot, and two fields that silently share an
 * object are a latent aliasing bug in a model whose whole point is immutability.
 */
export function unavailable<T>(): Available<T> {
  return { state: 'UNAVAILABLE' }
}

export function unknown<T>(): Available<T> {
  return { state: 'UNKNOWN' }
}

/*
 * NO READER HELPER IS OFFERED, AND THAT IS THE POINT.
 *
 * v1.2 §5 forbids collapsing a missing reading into a substitute:
 *
 *     UNKNOWN      → 0        UNKNOWN      → null      UNKNOWN     → ""
 *     UNAVAILABLE  → 0        UNAVAILABLE  → null      UNAVAILABLE → []
 *     UNKNOWN      → false    saknad post  → []
 *
 * `null` is on that list. A `valueOrNull` would map BOTH non-present states to
 * one value and erase the distinction the type exists to carry — "the provider
 * demonstrably has no value" is a different fact from "not asked, or not
 * answered", and only one of them is worth retrying.
 *
 * Consumers therefore discriminate on `state`. That is three lines at the call
 * site instead of one, and the three lines are where a reviewer can see which
 * assumption was made about a missing provider reading.
 */

// ─── §8 / F2 Errors and results ───────────────────────────────────────────────

/**
 * A provider failure, translated into Omnira's structured vocabulary.
 *
 * v1.2 §8: "Adaptern får inte läcka providerspecifika felsträngar som
 * beslutsunderlag." So the decision rides entirely on `reasonCode`, and
 * `message` is operator and debugging text — never decision input.
 *
 * The fields v1.2 F2 records as deliberately excluded stay excluded: no
 * `retryable` (retry policy is the consumer's, not the port's), no HTTP or
 * transport status (transport does not belong above the adapter, §9), no
 * exception classes (a second error model beside `Result` gives two), and no
 * provider-native codes (§8 forbids them as decision input). Raw provider
 * responses may be preserved for the journal where safe — but not here.
 */
export interface ProviderError {
  readonly reasonCode: ReasonCode
  readonly message: string
}

/**
 * The outcome of a Level-1 operation.
 *
 * DOMAIN-LOCAL BY DECISION (v1.2 F2). This is not a repo-global utility and must
 * not become one: no other part of Trading Core expresses its outcomes through
 * it, and promoting it would be an architecture change no locked canon asks for.
 *
 * A failure is `ok: false` with a `ProviderError`. It is never a thrown error
 * and never an empty value — an empty list means "the provider reported
 * nothing", which is a positive claim a failure has no standing to make.
 */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ProviderError }

export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

export function failure<T>(reasonCode: ReasonCode, message: string): Result<T> {
  return { ok: false, error: { reasonCode, message } }
}
