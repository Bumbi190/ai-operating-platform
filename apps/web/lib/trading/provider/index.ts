/**
 * Omnira Trading — Execution Provider Adapter Level 1, public surface.
 *
 * Import from `@/lib/trading/provider`, not from the modules beneath it.
 *
 * A SERVER/DOMAIN BOUNDARY. This package is deliberately NOT re-exported from
 * the `@/lib/trading` barrel: nothing in the browser has any business holding a
 * provider port, and keeping it off that barrel makes the client payload delta
 * structurally zero rather than merely observed to be zero.
 *
 * A SIBLING OF `replay/` AND `market-view/`, not a child of either. Replay does
 * not own provider types and does not import them; the provider contract does
 * not import replay. In particular `Available<T>` and replay's
 * `ObservedValue<T>` stay separate types with separate owners (v1.2 F14.1).
 *
 * Nothing here can mint `RiskClearance`, `PropClearance`, `ApprovalGrant` or
 * `ExecutionIntent`. This package imports only sibling modules inside
 * `lib/trading/` and never `lib/trading/internal/`, where issuance lives.
 *
 * Canonical source: Execution Provider Adapter – Level 1 Read Only – Canonical
 * v1.2. Section-to-symbol traceability lives in `provider-contract.test.ts`.
 *
 * AUTHORITY IS ISSUED, NOT DERIVED FROM DATA.
 */

// ─── §3 · §4 · §5 · §7.0 · §8 / F2 — primitives ───────────────────────────────
export {
  CAPABILITY_STATES,
  CREDENTIAL_MODES,
  failure,
  ok,
  present,
  satisfiesSafetyCriticalRequirement,
  unavailable,
  unknown,
} from './primitives'
export type {
  Available,
  CapabilityState,
  ContractId,
  CredentialMode,
  ProviderError,
  ProviderId,
  ProviderTimestamp,
  Result,
} from './primitives'

// ─── §3.1 · §7.1 · §7.2 · F3–F12 — observations ───────────────────────────────
export {
  DISCREPANCY_KINDS,
  HISTORY_COMPLETENESS,
  ORDER_SIDES,
  ORDER_STATUSES,
  ORDER_TYPES,
  POSITION_SIDES,
  POSITION_STATES,
  RECONCILIATION_STATUSES,
} from './observations'
export type {
  AccountRef,
  ContractRef,
  ContractSnapshot,
  ContractSpec,
  DiscrepancyKind,
  FillHistory,
  FillSnapshot,
  HistoryCompleteness,
  HistoryRequest,
  HistoryWindowCapability,
  OrderSide,
  OrderSnapshot,
  OrderStatus,
  OrderType,
  PositionSide,
  PositionSnapshot,
  PositionState,
  ProviderAccountSnapshot,
  ProviderCapabilities,
  ProviderClock,
  ProviderConfig,
  ProviderHealth,
  ProviderIdentity,
  ProviderSession,
  ReadOnlyReconciliation,
  ReconciliationDiscrepancy,
  ReconciliationStatus,
} from './observations'

// ─── §6 / F15 — the port ──────────────────────────────────────────────────────
export type { ExecutionProviderAdapter } from './adapter'
