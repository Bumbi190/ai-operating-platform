/**
 * lib/media/job/store.ts — the durable record a media job needs to exist at all.
 *
 ── WHY THIS IS A PORT AT ALL ──────────────────────────────────────────────
 * Phase 3 concluded that durable persistence is UNAVOIDABLE: a job whose UNKNOWN
 * state lives only in a process is a job that a restart converts into silence,
 * and silence is what makes the next request regenerate and pay twice.
 *
 * Phase 4 applied that schema (`media_job_lifecycle`, 2026-09-03) and the
 * durable adapter lives in `store-supabase.ts`. The PORT stays here, and the
 * in-memory adapter below stays with it, because the concurrency rules are the
 * interface's — proving them against a fake is how they get proven at all, and
 * the durable adapter is then held to the same contract.
 *
 * ── THE RULE THE INTERFACE ENCODES ─────────────────────────────────────────
 * Every state change is a COMPARE-AND-SET. Not a write. Two pollers, a webhook
 * and a poller, or a reaper and a worker may all observe the same job at the
 * same moment, and the guarantee Omnira needs is:
 *
 *     at most one LOCAL TERMINAL TRANSITION,
 *     over potentially at-least-once OBSERVATIONS.
 *
 * That is achievable with a conditional update and nothing else — no locks, no
 * leases, no in-memory mutex. Serverless functions do not share memory, so a
 * mutex here would be a comment that looks like a control.
 */

import type { AssetId } from '@/lib/media/asset/types'
import type { MediaProviderId } from '@/lib/media/providers/types'
import type { DispatchObservation } from '@/lib/workflows/action-outcome'
import { isLegalMediaJobTransition, type MediaJobState } from './lifecycle'
import type { MediaJobId, RemoteOperationId } from './identity'

// ── The record ───────────────────────────────────────────────────────────────

/**
 * One attempted remote generation, as Omnira knows it.
 *
 * Note what is NOT here: no prompt, no brief text, no provider response body. A
 * brief may contain third-party editorial text and a prompt may contain
 * arbitrary content; Phase 1 already made the decision that only HASHES are
 * persisted (`canonicalHash`), and repeating the payload here would rebuild the
 * content store that decision avoided — and would create text some later feature
 * could re-read as an instruction.
 */
export interface MediaJobRecord {
  id: MediaJobId
  /** Ownership. Project Isolation applies to jobs exactly as it does to assets. */
  projectId: string
  provider: MediaProviderId
  /** The concrete vendor model. Provider ≠ model, at every layer. */
  model: string
  state: MediaJobState
  /** Null until the vendor names the operation — which may never happen. */
  remoteOperationId: RemoteOperationId | null
  /**
   * What the dispatch PROVED. `state` alone is too coarse for the operator:
   * an UNKNOWN that may not exist (`response_lost`) and one the vendor answered
   * 2xx for (`confirmed_evidence_failed`, so it almost certainly exists AND was
   * billed) demand different urgency. Already computed by `run.ts`; persisted
   * so the row does not throw it away.
   */
  dispatchObservation: DispatchObservation | null
  /** Whether this job ran against a sandbox credential. Carried, never inferred. */
  simulated: boolean
  /** Hash of the canonical brief, so two identical requests are recognisable. */
  briefHash: string
  /** Set once admission succeeds. The ONLY link between a job and an asset. */
  assetId: AssetId | null
  /** Why the job is where it is. Structured, redacted, never a raw body. */
  lastFailureCode: string | null
  lastFailureDetail: string | null
  /** True while a human must resolve an ambiguity. Mirrors PR9d's column. */
  reconciliationRequired: boolean
  createdAt: string
  dispatchStartedAt: string | null
  remoteConfirmedAt: string | null
  terminalAt: string | null
  /** Monotonic guard for compare-and-set. Incremented on every accepted write. */
  version: number
}

/** What a caller may state when a job is first recorded. Nothing else. */
export interface CreateMediaJobInput {
  id: MediaJobId
  projectId: string
  provider: MediaProviderId
  model: string
  briefHash: string
  simulated: boolean
}

export type MediaJobWriteRefusal =
  | 'not_found'
  | 'version_conflict'
  | 'illegal_transition'
  | 'requires_reconciliation'
  | 'already_admitted'
  | 'write_failed'

export type MediaJobWriteResult =
  | { ok: true; record: MediaJobRecord }
  | { ok: false; refusal: MediaJobWriteRefusal; detail: string; record?: MediaJobRecord }

// ── The port ─────────────────────────────────────────────────────────────────

export interface MediaJobStore {
  /**
   * Record the intent to dispatch, BEFORE the network is touched.
   *
   * This is the whole reason the store exists. A row written here means that
   * even a dispatch whose response is lost leaves evidence: which project, which
   * provider, which model, which brief, at what time. That evidence is what an
   * operator reconciles against when the vendor cannot be asked — see
   * PHASE3_RESULT.md §11.
   */
  create(input: CreateMediaJobInput): Promise<MediaJobWriteResult>

  read(id: MediaJobId): Promise<MediaJobRecord | null>

  /**
   * Move a job to a new state, conditional on the version it was read at.
   *
   * `expectedVersion` is what makes two concurrent observers safe: the second
   * one's write is refused with `version_conflict`, it re-reads, and it finds the
   * job already terminal. No lock, no lease, no coordination.
   */
  transition(input: {
    id: MediaJobId
    expectedVersion: number
    to: MediaJobState
    remoteOperationId?: RemoteOperationId | null
    /** Set once, on the transition that settles the dispatch. Write-once. */
    dispatchObservation?: DispatchObservation | null
    failureCode?: string | null
    failureDetail?: string | null
    /** Set by the reconciliation path only. Nothing else may clear UNKNOWN. */
    hasConfirmedReconciliation?: boolean
    at: string
  }): Promise<MediaJobWriteResult>

  /**
   * Bind the canonical asset produced by this job. Idempotent by refusal: a
   * second, different asset id is `already_admitted`, never an overwrite.
   *
   * Separate from `transition` because SUCCEEDED and ADMITTED are different
   * facts — the vendor's success and Omnira's ownership — and Phase 2 already
   * established that only the second one is reported to a caller as success.
   */
  recordAdmission(input: {
    id: MediaJobId
    expectedVersion: number
    assetId: AssetId
    at: string
  }): Promise<MediaJobWriteResult>

  /**
   * Every job awaiting a human, oldest first. Read-only.
   *
   * Scoped by project because a job is project-owned; a cross-project read is a
   * Project Isolation breach whether it is a generation or an asset.
   */
  listUnresolved(projectIds: readonly string[]): Promise<MediaJobRecord[]>

  /**
   * Record one reconciliation fact and, when it resolves the ambiguity, move
   * the job — AS ONE ATOMIC OPERATION.
   *
   * ── WHY ATOMICITY IS THE CONTRACT AND NOT AN OPTIMISATION ────────────────
   * The database guard reads the ledger WHILE performing the state update: an
   * UNKNOWN may only leave that state when a non-`STILL_UNKNOWN` row already
   * exists for the job. Two separate calls therefore race themselves — the
   * insert could land and the transition lose a version conflict, leaving an
   * evidence row that claims a resolution which never happened. An audit trail
   * that lies is worse than none.
   *
   * So implementations MUST commit the insert and the compare-and-set together,
   * insert first, or refuse. Emulating it with two round trips is forbidden.
   */
  recordReconciliation(input: RecordReconciliationInput): Promise<MediaJobWriteResult>
}

export interface RecordReconciliationInput {
  id: MediaJobId
  expectedVersion: number
  /** The evidence row. Structured facts only — never a raw provider response. */
  record: {
    projectId: string
    provider: MediaProviderId
    remoteOperationId: RemoteOperationId | null
    result: string
    blocker: string | null
    detail: Record<string, string | number | boolean | null>
    observedAt: string
  }
  /**
   * Where the answer moves the job, or null when it moves nothing.
   *
   * Null is `STILL_UNKNOWN`: not knowing is a valid answer and must leave the
   * job exactly where it was rather than nudging it toward a guess.
   */
  resolvesTo: MediaJobState | null
  at: string
}

// ── Availability ─────────────────────────────────────────────────────────────

/**
 * Whether an async provider may be DISPATCHED in this deployment.
 *
 * A hardcoded decision, not a probe — the same shape as
 * `MEDIA_GENERATION_UNMET_PREREQUISITES`, and for the same reason. Probing would
 * make the answer depend on whichever environment happens to be running, and
 * "the table exists" is not the same fact as "the lifecycle may spend money".
 *
 * ── WHAT CHANGED IN PHASE 4, AND WHAT DID NOT ─────────────────────────────
 * The DURABLE STORE now exists: `media_job_lifecycle` and
 * `media_job_lifecycle_repairs` are applied to production, and
 * `store-supabase.ts` implements the port against them with database-side CAS
 * and an atomic reconciliation RPC. The original blocker is CLOSED.
 *
 * The flag stays `false` because a second, different thing is still missing:
 * nothing wires a `MediaProvider` into `runMediaJob` behind
 * `withGovernedSpend`. `orchestrate.ts` still refuses provider-layer candidates
 * at dispatch, so flipping this alone would let eligibility select a candidate
 * that then fails at the moment of spending — precisely the ordering Phase 2
 * built `dispatch.supported` to prevent.
 *
 * Flipping it is the LAST step, after that adapter exists AND can be exercised.
 * It cannot be exercised in an environment with no MuAPI credential at all.
 */
export const DURABLE_MEDIA_JOB_STORE_AVAILABLE = false

/**
 * Why, in the words an operator reading an eligibility refusal needs — and
 * deliberately updated in Phase 4, because a stale reason is worse than none:
 * it would send someone to fix a database that is already correct.
 */
export const DURABLE_MEDIA_JOB_STORE_BLOCKER =
  'the durable media job store is applied and working, but no governed dispatch adapter '
  + 'connects a MediaProvider to the job lifecycle yet — so a provider-layer candidate '
  + 'would be selected and then fail at the moment of spending'

// ── In-memory adapter ────────────────────────────────────────────────────────

/**
 * The adapter the tests drive, and the reference implementation of the rules.
 *
 * NOT for production, and structurally unable to be mistaken for it: it holds a
 * `Map`, so on Vercel every invocation would start empty — a job would vanish
 * between the dispatch that created it and the poll that reads it. That is the
 * exact failure the durable store exists to prevent, which is why the production
 * candidate stays undispatchable until the real one exists.
 */
type LedgerRow = { mediaJobId: MediaJobId } & RecordReconciliationInput['record']

export function createInMemoryMediaJobStore():
  MediaJobStore & { all(): MediaJobRecord[]; ledgerRows(): LedgerRow[] } {
  const rows = new Map<MediaJobId, MediaJobRecord>()
  const ledger: LedgerRow[] = []

  const conflict = (record: MediaJobRecord | undefined, refusal: MediaJobWriteRefusal, detail: string): MediaJobWriteResult =>
    ({ ok: false, refusal, detail, ...(record ? { record } : {}) })

  return {
    all: () => [...rows.values()],

    async create(input) {
      if (rows.has(input.id)) {
        return conflict(rows.get(input.id), 'write_failed', 'a job with this identity already exists')
      }
      const record: MediaJobRecord = {
        ...input,
        state: 'PENDING_DISPATCH',
        remoteOperationId: null,
        dispatchObservation: null,
        assetId: null,
        lastFailureCode: null,
        lastFailureDetail: null,
        reconciliationRequired: false,
        createdAt: new Date().toISOString(),
        dispatchStartedAt: null,
        remoteConfirmedAt: null,
        terminalAt: null,
        version: 1,
      }
      rows.set(input.id, record)
      return { ok: true, record }
    },

    async read(id) {
      return rows.get(id) ?? null
    },

    async transition(input) {
      const current = rows.get(input.id)
      if (!current) return conflict(undefined, 'not_found', `no media job ${input.id}`)
      if (current.version !== input.expectedVersion) {
        return conflict(current, 'version_conflict',
          `job moved on (expected v${input.expectedVersion}, found v${current.version} in ${current.state})`)
      }

      const legal = isLegalMediaJobTransition(current.state, input.to, {
        hasConfirmedReconciliation: input.hasConfirmedReconciliation === true,
      })
      if (!legal.ok) {
        return conflict(current,
          legal.refusal === 'requires_reconciliation' ? 'requires_reconciliation' : 'illegal_transition',
          `${current.state} → ${input.to} refused: ${legal.refusal}`)
      }

      const next: MediaJobRecord = {
        ...current,
        state: input.to,
        // A remote id is written ONCE. A later observation that names a
        // different operation is describing a job this record is not about, and
        // silently adopting it would rebind a paid generation to the wrong row.
        remoteOperationId: current.remoteOperationId ?? input.remoteOperationId ?? null,
        dispatchObservation: current.dispatchObservation ?? input.dispatchObservation ?? null,
        lastFailureCode: input.failureCode ?? current.lastFailureCode,
        lastFailureDetail: input.failureDetail ?? current.lastFailureDetail,
        reconciliationRequired: input.to === 'UNKNOWN'
          ? true
          : input.hasConfirmedReconciliation ? false : current.reconciliationRequired,
        dispatchStartedAt: input.to === 'DISPATCHING' ? input.at : current.dispatchStartedAt,
        remoteConfirmedAt: current.remoteConfirmedAt
          ?? (input.to === 'QUEUED' || input.to === 'RUNNING' ? input.at : null),
        terminalAt: input.to === 'SUCCEEDED' || input.to === 'FAILED' || input.to === 'UNKNOWN'
          ? current.terminalAt ?? input.at
          : current.terminalAt,
        version: current.version + 1,
      }
      rows.set(input.id, next)
      return { ok: true, record: next }
    },

    async recordAdmission(input) {
      const current = rows.get(input.id)
      if (!current) return conflict(undefined, 'not_found', `no media job ${input.id}`)
      if (current.version !== input.expectedVersion) {
        return conflict(current, 'version_conflict',
          `job moved on (expected v${input.expectedVersion}, found v${current.version})`)
      }
      if (current.assetId !== null && current.assetId !== input.assetId) {
        return conflict(current, 'already_admitted',
          `job already produced asset ${current.assetId}; refusing to rebind to ${input.assetId}`)
      }
      const next: MediaJobRecord = { ...current, assetId: input.assetId, version: current.version + 1 }
      rows.set(input.id, next)
      return { ok: true, record: next }
    },

    async listUnresolved(projectIds) {
      const wanted = new Set(projectIds)
      return [...rows.values()]
        .filter(r => wanted.has(r.projectId) && r.reconciliationRequired)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    },

    /**
     * Atomic here for a reason that does not generalise: this adapter is a
     * single `Map` in one process, and the whole body runs to completion without
     * an await between the ledger append and the state change. That is genuine
     * atomicity for THIS adapter and is not evidence that the operation is easy
     * — the durable adapter needs a database function to get the same property.
     */
    async recordReconciliation(input) {
      const current = rows.get(input.id)
      if (!current) return conflict(undefined, 'not_found', `no media job ${input.id}`)
      if (current.version !== input.expectedVersion) {
        return conflict(current, 'version_conflict',
          `job moved on (expected v${input.expectedVersion}, found v${current.version})`)
      }
      if (input.record.projectId !== current.projectId || input.record.provider !== current.provider) {
        // The binding rule the database enforces with a trigger: a reconciliation
        // must be ABOUT the job it names, or it could clear an unrelated incident.
        return conflict(current, 'write_failed',
          'reconciliation identity does not match the job (project/provider)')
      }

      ledger.push({ mediaJobId: input.id, ...input.record })

      if (input.resolvesTo === null) return { ok: true, record: current }

      const confirmed = ledger.some(r => r.mediaJobId === input.id && r.result !== 'STILL_UNKNOWN')
      const legal = isLegalMediaJobTransition(current.state, input.resolvesTo, {
        hasConfirmedReconciliation: confirmed,
      })
      if (!legal.ok) {
        // ROLL BACK the evidence. A ledger row claiming a resolution that did not
        // happen is exactly the lie atomicity exists to prevent.
        ledger.pop()
        return conflict(current,
          legal.refusal === 'requires_reconciliation' ? 'requires_reconciliation' : 'illegal_transition',
          `${current.state} → ${input.resolvesTo} refused: ${legal.refusal}`)
      }

      const next: MediaJobRecord = {
        ...current,
        state: input.resolvesTo,
        reconciliationRequired: false,
        terminalAt: current.terminalAt,
        version: current.version + 1,
      }
      rows.set(input.id, next)
      return { ok: true, record: next }
    },

    ledgerRows: () => [...ledger],
  }
}
