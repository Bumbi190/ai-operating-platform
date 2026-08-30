/**
 * Omnira Trading — a deterministic recorded Execution Provider Adapter.
 *
 * WHAT THIS IS
 * ────────────
 * A complete implementation of the Level-1 `ExecutionProviderAdapter` port whose
 * every answer is read from an authored `RecordedTranscript`. It exists to prove
 * one thing: that the port can feed the deterministic replay architecture
 * without losing information or inventing provider facts.
 *
 * WHAT THIS IS NOT
 * ────────────────
 * It is NOT a model of Rithmic, Tradovate, ProjectX or any other provider, and
 * nothing here should ever be cited as evidence about how one behaves. There is:
 *
 *     no network            no HTTP              no WebSocket
 *     no protobuf           no credential        no environment secret
 *     no filesystem read    no timer             no background worker
 *     no Date.now()         no Math.random()     no randomUUID()
 *     no order method       no reconnect policy  no session state machine
 *
 * `connect` returns a recorded session and `disconnect` resolves. That is the
 * deterministic minimum the interface requires — not a connection lifecycle, and
 * deliberately not dressed up as one.
 *
 * PURE WITH RESPECT TO ITS TRANSCRIPT
 * ───────────────────────────────────
 * Two calls with the same transcript return the same values, in any order, with
 * no cursor and no accumulated state. The adapter holds the transcript and
 * nothing else: there is no mutable field on it at all, so there is no read that
 * can depend on which read came before.
 *
 * AUTHORITY IS ISSUED, NOT DERIVED FROM DATA. Nothing returned here can mint
 * `RiskClearance`, `PropClearance`, `ApprovalGrant` or `ExecutionIntent`, and
 * this module never imports `lib/trading/internal/`.
 */

import type { AccountId } from '../ids'
import type { TradingEnvironment } from '../environment'
import { failure, type ContractId, type Result } from '../provider'
import type {
  AccountRef,
  ContractRef,
  ContractSnapshot,
  ContractSpec,
  ExecutionProviderAdapter,
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
} from '../provider'
import {
  ambiguousRecordedResponse,
  lookupUnique,
  noRecordedResponse,
  recordedForAccount,
  recordedForContract,
  type RecordedTranscript,
} from './transcript'

/**
 * Build a recorded adapter over one transcript.
 *
 * A factory returning the interface rather than a class: there is no
 * inheritance story here, and a plain object makes it obvious that the only
 * state is the transcript reference itself.
 */
export function createRecordedExecutionProviderAdapter(
  transcript: RecordedTranscript,
): ExecutionProviderAdapter {
  return {
    // ─── Session ──────────────────────────────────────────────────────────────

    /**
     * The recorded session, whatever it was recorded as.
     *
     * `config` is deliberately unused for lookup. A harness that varied its
     * answer by credential reference or environment would be modelling provider
     * behaviour nobody recorded; the transcript states what connecting produced,
     * full stop.
     */
    async connect(config: ProviderConfig): Promise<Result<ProviderSession>> {
      void config
      return transcript.connect
    },

    /**
     * Resolve. Nothing to tear down, and nothing pretends otherwise.
     *
     * `Promise<void>` rather than `Promise<Result<void>>` because the port says
     * so: disconnect has no failure outcome to report.
     */
    async disconnect(): Promise<void> {
      return
    },

    // ─── Identity and health ──────────────────────────────────────────────────

    async getProviderIdentity(): Promise<Result<ProviderIdentity>> {
      return transcript.identity
    },

    /** Never defaults. An unrecorded environment is a failure, not a guess. */
    async getEnvironment(): Promise<Result<TradingEnvironment>> {
      return transcript.environment
    },

    async getCapabilities(): Promise<Result<ProviderCapabilities>> {
      return transcript.capabilities
    },

    async getHealth(): Promise<Result<ProviderHealth>> {
      return transcript.health
    },

    /** No wall clock stands in for a provider clock the transcript did not record. */
    async getProviderTime(): Promise<Result<ProviderClock>> {
      return transcript.providerTime
    },

    // ─── Accounts ─────────────────────────────────────────────────────────────

    async getAccounts(): Promise<Result<readonly AccountRef[]>> {
      return transcript.accounts
    },

    async getAccountSnapshot(a: AccountId): Promise<Result<ProviderAccountSnapshot>> {
      return recordedForAccount(transcript.accountSnapshots, a, 'kontoögonblicksbild')
    },

    // ─── Contracts ────────────────────────────────────────────────────────────

    /**
     * Resolution by EXACT recorded correspondence.
     *
     * Matched on `spec.canonicalSymbol` with string equality and nothing else.
     * No prefix test, no `startsWith`, no regex, no expiration arithmetic, no
     * month code, no front-month choice and no rollover calendar — every one of
     * those is GATE-08 work, and GATE-08 is open.
     */
    async resolveContract(spec: ContractSpec): Promise<Result<ContractRef>> {
      const what = `kontraktsuppslag (${spec.canonicalSymbol})`
      const found = lookupUnique(
        transcript.contractResolutions,
        (entry) => entry.canonicalSymbol === spec.canonicalSymbol,
      )
      if (found.kind === 'NONE') return noRecordedResponse<ContractRef>(what)
      if (found.kind === 'AMBIGUOUS') {
        return ambiguousRecordedResponse<ContractRef>(what, found.count)
      }
      return found.entry.response
    },

    async getContractSnapshot(c: ContractId): Promise<Result<ContractSnapshot>> {
      return recordedForContract(transcript.contractSnapshots, c, 'kontraktsögonblicksbild')
    },

    // ─── Observed state ───────────────────────────────────────────────────────

    /**
     * The recorded positions for this account.
     *
     * A transcript gap returns a FAILURE. It must never return `ok([])`, because
     * an empty successful result is the positive claim "known flat" — and a
     * harness that could make that claim from a missing recording would be able
     * to report an account as flat precisely when it knows least about it.
     */
    async getPositions(a: AccountId): Promise<Result<readonly PositionSnapshot[]>> {
      return recordedForAccount(transcript.positions, a, 'positioner')
    },

    async getWorkingOrders(a: AccountId): Promise<Result<readonly OrderSnapshot[]>> {
      return recordedForAccount(transcript.workingOrders, a, 'arbetande ordrar')
    },

    /**
     * Recorded fills, for the window the recording actually answers.
     *
     * BOTH PARAMETERS ARE LOAD BEARING. A recording states the window it covers
     * in `requested`; handing it back for a different window would misreport
     * what was searched, which is the same class of error as reporting a
     * truncated history as COMPLETE. Cursor paging is not recorded at all, so a
     * cursored request fails rather than silently returning page one again.
     *
     * ONE RECORDED FILL HISTORY PER ACCOUNT — AND WHY NOT MORE
     * ───────────────────────────────────────────────────────
     * The account alone is the complete lookup key here, and two recordings for
     * one account are ambiguous rather than a menu to search. The alternative
     * was to make the requested window part of the key so several windows could
     * be recorded per account, and it was rejected: a FAILURE recording carries
     * no `requested` window — a failed `Result` has no `FillHistory` to read one
     * from — so a window-keyed transcript could not say which request a failure
     * belonged to without inferring it, and inferring a request window from a
     * failed result is exactly the kind of invention this harness exists to
     * avoid.
     *
     * So the model is the smaller honest one: at most one recording per account,
     * and the window is then checked against it. Nothing scans past a
     * non-matching entry looking for a better one, because that search is what
     * would let array order decide the answer.
     */
    async getRecentFills(a: AccountId, window: HistoryRequest): Promise<Result<FillHistory>> {
      if (window.cursor !== undefined) {
        return failure<FillHistory>(
          'REFERENCE_MISMATCH',
          'Inspelad historik saknar sidindelning; ingen cursor är inspelad.',
        )
      }

      const what = `fyllnadshistorik (konto ${a})`
      const found = lookupUnique(transcript.recentFills, (entry) => entry.accountId === a)
      if (found.kind === 'NONE') return noRecordedResponse<FillHistory>(what)
      if (found.kind === 'AMBIGUOUS') {
        return ambiguousRecordedResponse<FillHistory>(what, found.count)
      }

      const response = found.entry.response
      if (!response.ok) return response

      const recorded = response.value.requested
      if (recorded.from !== window.from || recorded.to !== window.to) {
        return failure<FillHistory>(
          'REFERENCE_MISMATCH',
          `Inspelad historik täcker ${recorded.from}–${recorded.to}, inte ${window.from}–${window.to}.`,
        )
      }
      return response
    },

    // ─── Reconciliation ───────────────────────────────────────────────────────

    /** Compare and report only. Nothing here repairs, cancels, flattens or executes. */
    async reconcileReadOnlyState(a: AccountId): Promise<Result<ReadOnlyReconciliation>> {
      return recordedForAccount(transcript.reconciliations, a, 'avstämning')
    },
  }
}
