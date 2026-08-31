/**
 * Omnira Trading — what an adapter must supply to be put through acceptance.
 *
 * PROVIDER-NEUTRAL BY CONSTRUCTION
 * ───────────────────────────────
 * Everything here is expressed in Level-1 contract vocabulary and nothing else.
 * There is no Rithmic, Tradovate or ProjectX type, no transport, no session
 * mechanics, no credential and no endpoint — because an acceptance surface that
 * knew about one provider's internals could not certify the next one.
 *
 * A future real adapter is certified by supplying a context, not by editing the
 * suite:
 *
 *     runProviderAcceptanceSuite('Rithmic', createRithmicAcceptanceContext())
 *
 * WHAT THIS ANSWERS
 * ─────────────────
 * One question: *does this adapter satisfy Omnira Level-1 read-only
 * behaviour?* It is deliberately not a proof that live trading is safe, that a
 * provider is reliable, or that anything is profitable. It certifies the
 * contract, and the contract is read-only.
 *
 * WHY THE CONTEXT CARRIES REFERENCES RATHER THAN EXPECTED VALUES
 * ─────────────────────────────────────────────────────────────
 * The suite asks the adapter what it can do — `getCapabilities()` — and holds it
 * to what it CLAIMED. That is the only way one suite can accept providers that
 * legitimately differ: a provider that reports `fills: UNSUPPORTED` must report
 * that honestly and is not required to return fills, while one that reports
 * `SUPPORTED` is. Only `SUPPORTED` satisfies a safety-critical requirement
 * (v1.2 §3), so `CONDITIONAL` and `UNKNOWN` are held to the honest-reporting
 * standard rather than the data standard.
 */

import type { AccountId } from '../ids'
import type { MarketInstrument } from '../market-view'
import type {
  ContractId,
  ContractSpec,
  ExecutionProviderAdapter,
  HistoryRequest,
  ProviderConfig,
} from '../provider'
import type {
  InstrumentMappingEntry,
  ObservationReplayMetadataEntry,
} from '../provider-normalization'

/**
 * The acceptance areas, exactly as Fas 2 defines them.
 *
 * A closed vocabulary so a report can say which area failed without a consumer
 * parsing prose, and so a missing area is a compile error rather than an
 * omission nobody notices.
 */
export const ACCEPTANCE_AREAS = [
  'CONNECTIVITY',
  'IDENTITY',
  'ENVIRONMENT',
  'CAPABILITIES',
  'HEALTH',
  'PROVIDER_TIME',
  'ACCOUNT_DISCOVERY',
  'ACCOUNT_SNAPSHOT',
  'CONTRACT_RESOLUTION',
  'CONTRACT_SNAPSHOT',
  'POSITIONS',
  'WORKING_ORDERS',
  'RECENT_FILLS',
  'RECONNECT',
  'NORMALIZATION',
  'FAIL_CLOSED',
] as const
export type AcceptanceArea = (typeof ACCEPTANCE_AREAS)[number]

/**
 * What an adapter under test must supply.
 *
 * `createAdapter` is a FACTORY, not an instance. Each scenario gets a fresh
 * adapter so that no scenario can depend on state another one left behind —
 * which is the same reason the recorded adapter holds no mutable state at all.
 */
export interface ProviderAcceptanceContext {
  /** A fresh adapter under test. Never shared between scenarios. */
  readonly createAdapter: () => ExecutionProviderAdapter

  /**
   * The configuration to connect with.
   *
   * `credentialSecretRef` is an opaque reference by contract (v1.2 F4), never a
   * secret. An acceptance context must never carry a real credential.
   */
  readonly config: ProviderConfig

  /** An account this provider is expected to know about. */
  readonly knownAccountId: AccountId

  /**
   * An account this provider is expected NOT to know about.
   *
   * Drives the fail-closed cases: an unknown reference must produce an honest
   * failure and never an empty success, which would claim the account is flat.
   */
  readonly unknownAccountId: AccountId

  /** A spec this provider can resolve by explicit correspondence. */
  readonly resolvableSpec: ContractSpec

  /**
   * A spec that must NOT resolve.
   *
   * Chosen to share a prefix with the resolvable one wherever the provider's
   * vocabulary allows, so that a front-month, prefix or month-code rule would
   * resolve it and be caught. GATE-08 is open; nothing may infer here.
   */
  readonly unresolvableSpec: ContractSpec

  /** A contract this provider can snapshot. */
  readonly knownContractId: ContractId

  /** A contract reference this provider does not know. */
  readonly unknownContractId: ContractId

  /** A history window this provider can answer, when it supports fills. */
  readonly fillWindow: HistoryRequest

  // ─── Normalization inputs ───────────────────────────────────────────────────
  /*
   * The acceptance suite normalizes the adapter's own positions through the
   * Stage 1.8b seam rather than reimplementing the mapping. That seam needs
   * three things a provider cannot supply, because none of them is a provider
   * fact: which market instrument an InstrumentId corresponds to, which
   * instrument is being asked about, and the replay-only metadata. All three are
   * authored by whoever builds the context, exactly as the recorded harness
   * authors them — never inferred from provider data.
   */

  /** Explicit InstrumentId → MarketInstrument correspondence. No inference. */
  readonly instrumentMappings: readonly InstrumentMappingEntry[]

  /** The instrument the normalization cases ask about. */
  readonly normalizationInstrument: MarketInstrument

  /** Authored replay metadata for the positions this adapter reports. */
  readonly replayMetadata: readonly ObservationReplayMetadataEntry[]
}

/**
 * Whether a value is a plain observation record rather than a live handle.
 *
 * A Level-1 observation is a RECORD (v1.2 §2, §10). A value carrying methods
 * could act — it could hold a socket, retry, or reach a provider again — and a
 * record that can act is no longer only a record. This is the structural half
 * of the authority boundary: the other half is that nothing in the provider
 * path imports `lib/trading/internal/`, where issuance lives.
 */
export function isInertRecord(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return typeof value !== 'function'
  for (const nested of Object.values(value as Record<string, unknown>)) {
    if (typeof nested === 'function') return false
    if (nested !== null && typeof nested === 'object' && !isInertRecord(nested)) return false
  }
  return true
}
