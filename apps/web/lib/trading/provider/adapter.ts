/**
 * Omnira Trading — the Level-1 Execution Provider Adapter port.
 *
 * Transcription of Execution Provider Adapter Canonical v1.2 §6 and F15.
 *
 * THE ONE PROVIDER BOUNDARY
 * ─────────────────────────
 * v1.2 §1: this is the single interface between Omnira and an external Futures
 * Execution Provider, and it permits no order placement. The adapter is the only
 * component allowed to know a specific provider's API, authentication, order
 * model and symbol format; nothing above it may contain provider-specific
 * knowledge.
 *
 * ZERO EXECUTION METHODS (§1.1)
 * ─────────────────────────────
 * Level 1 declares none. Not disabled, not guarded — ABSENT:
 *
 *     submitOrder     ✗ does not exist        replaceOrder    ✗ does not exist
 *     modifyOrder     ✗ does not exist        flatten         ✗ does not exist
 *     cancelOrder     ✗ does not exist        closePosition   ✗ does not exist
 *     preflightOrder  ✗ does not exist
 *
 * Defence in depth through absence rather than through permission: even a
 * credential that could technically place an order has no code path that asks.
 *
 * NOT THE MARKET-DATA PORT (§7.1, F16.1)
 * ──────────────────────────────────────
 * Quotes, bars and ticks are not here. "Read Adapter" in Systemarkitektur §22 is
 * a broader architectural category than this port; market observation belongs to
 * the separate market-data boundary. GATE-08 remains OPEN, and no rollover or
 * front-month resolution exists in this contract.
 *
 * ASYNCHRONOUS — PORT SEMANTICS ONLY (§6, §6.1)
 * ────────────────────────────────────────────
 * Fourteen methods return `Promise<Result<T>>`; `disconnect` returns
 * `Promise<void>`. The port represents provider I/O whose completion may occur
 * later, and a networked provider cannot honestly satisfy a synchronous
 * contract.
 *
 * §6.1 is explicit that this implies NOTHING about implementation: not Rithmic,
 * not WebSocket, not HTTP, not threads, not background workers, and no retry,
 * timeout or reconnect policy. Error semantics are unchanged — a failure is
 * `Result` with `ok: false`, never a thrown error and never an empty value.
 *
 * `disconnect` is deliberately NOT `Promise<Result<void>>`. That would introduce
 * new error semantics rather than merely asynchronous completion, and v1.0 gave
 * `disconnect` no failure outcome.
 *
 * AUTHORITY IS ISSUED, NOT DERIVED FROM DATA (§2)
 * ──────────────────────────────────────────────
 * A provider observation is a record, exactly as a `RiskDecision` is. Records
 * cannot mint `RiskClearance`, `PropClearance` or `ApprovalGrant`.
 * `ExecutionIntent` is still created only by `openExecutionGate`, which requires
 * three unforgeable capabilities — and an adapter observation is not one of its
 * inputs and cannot become one. Asynchronicity changes none of this: a Promise
 * cannot mint a capability.
 *
 * This package therefore never imports `lib/trading/internal/`, where issuance
 * lives, and holds no reference to the execution gate.
 */

import type { AccountId } from '../ids'
import type { TradingEnvironment } from '../environment'
import type { ContractId, Result } from './primitives'
import type {
  AccountRef,
  ContractRef,
  ContractSnapshot,
  ContractSpec,
  FillHistory,
  HistoryRequest,
  OrderSnapshot,
  PositionSnapshot,
  ProviderAccountSnapshot,
  ProviderCapabilities,
  ProviderClock,
  ProviderConfig,
  ProviderHealth,
  ProviderIdentity,
  ProviderSession,
  ReadOnlyReconciliation,
} from './observations'

/**
 * The Level-1 read-only provider port. Exactly fifteen methods.
 *
 * A `RithmicProtocolAdapter` and a `TradovateAdapter` must both be able to
 * implement this without the contract's semantics changing (§9). Provider
 * differences are expressed solely through `ProviderCapabilities`,
 * `CapabilityState`, `Available<T>`, `FillHistory.completeness`,
 * `CredentialMode` and normalized errors — never by widening this interface.
 */
export interface ExecutionProviderAdapter {
  // ─── Session ────────────────────────────────────────────────────────────────
  connect(config: ProviderConfig): Promise<Result<ProviderSession>>
  disconnect(): Promise<void>

  // ─── Identity, proven before any state is trusted ───────────────────────────
  getProviderIdentity(): Promise<Result<ProviderIdentity>>
  /** Never returns a default. An unknown environment is UNKNOWN and fails closed (§6.1). */
  getEnvironment(): Promise<Result<TradingEnvironment>>
  getCapabilities(): Promise<Result<ProviderCapabilities>>
  getHealth(): Promise<Result<ProviderHealth>>
  getProviderTime(): Promise<Result<ProviderClock>>

  // ─── Accounts ───────────────────────────────────────────────────────────────
  getAccounts(): Promise<Result<readonly AccountRef[]>>
  getAccountSnapshot(a: AccountId): Promise<Result<ProviderAccountSnapshot>>

  // ─── Contracts: futures identity is contract level ──────────────────────────
  resolveContract(spec: ContractSpec): Promise<Result<ContractRef>>
  getContractSnapshot(c: ContractId): Promise<Result<ContractSnapshot>>

  // ─── Observed state ─────────────────────────────────────────────────────────
  /**
   * Known flat is a successful result with an EMPTY array (F10).
   *
   * It is never a `PositionSnapshot` with a FLAT side — there is no such side —
   * and it is never an empty array inside a failed `Result`, which would turn
   * "we could not find out" into "there is no exposure".
   */
  getPositions(a: AccountId): Promise<Result<readonly PositionSnapshot[]>>
  getWorkingOrders(a: AccountId): Promise<Result<readonly OrderSnapshot[]>>
  getRecentFills(a: AccountId, window: HistoryRequest): Promise<Result<FillHistory>>

  // ─── Reconciliation ─────────────────────────────────────────────────────────
  /** Compare and report. Never repair, cancel, flatten, modify or execute (F12). */
  reconcileReadOnlyState(a: AccountId): Promise<Result<ReadOnlyReconciliation>>
}
