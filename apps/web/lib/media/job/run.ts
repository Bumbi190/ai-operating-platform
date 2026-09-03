/**
 * lib/media/job/run.ts — the asynchronous generation, end to end.
 *
 *   record intent  →  dispatch  →  classify  →  persist  →  observe
 *                                                              ↓
 *              canonical Asset  ←  admit  ←  validate  ←  terminal answer
 *
 * ── THE ORDERING THAT MATTERS MOST ─────────────────────────────────────────
 * The durable record is written BEFORE the network is touched. Not after the
 * response, not on failure — before. That single ordering is what makes an
 * ambiguous dispatch survivable: a lost response then leaves a row saying which
 * project asked for what, from which provider, with which model, at what time.
 * Without it, a lost response leaves nothing, and nothing is indistinguishable
 * from "never asked", which is how the next request pays for the same image
 * twice.
 *
 * ── NO SPEND LIVES HERE ────────────────────────────────────────────────────
 * `withGovernedSpend` is not imported and is never called from this file, for
 * the same reason Phase 2's orchestrator does not call it: the adapter that
 * makes the billable call owns project resolution, estimate, reservation,
 * refusal and settlement. This layer chooses the ORDER of operations; it never
 * decides whether money may move.
 *
 * What this file DOES fix is the boundary's SHAPE for an async provider, which
 * is a genuinely new question:
 *
 *     the governed wrapper encloses THE DISPATCH ONLY.
 *
 * Polling is a read. MuAPI does not bill `GET /predictions/{id}/result`, and
 * wrapping the poll would take a second reservation for every status check —
 * dozens of reservations for one image, each of which could refuse and abandon a
 * generation that was already paid for. So `dispatch` arrives here already
 * governed, and `observe` arrives ungoverned, and the types say so.
 *
 * ── NOTHING HERE RETRIES A GENERATION ──────────────────────────────────────
 * `lib/media/retry.ts` is deliberately not imported. It is the pipeline's blind
 * timeout-and-backoff wrapper, correct for an idempotent read and catastrophic
 * around a paid creation. Every retry decision in this file goes through
 * `classifyMediaRetry`, and the only class it acts on automatically is
 * `STATUS_RETRY`.
 */

import 'server-only'

import { admitAssetFromUrl } from '@/lib/media/asset/admission'
import { AssetRejectedError } from '@/lib/media/asset/validate'
import type { AdmittedAsset, AssetId, AssetVisibility } from '@/lib/media/asset/types'
import type { MediaAssetKind, MediaJobResult, MediaProviderId } from '@/lib/media/providers/types'
import { observationForDispatch, type MediaDispatchResult } from './dispatch'
import { newMediaJobId, type MediaJobId } from './identity'
import {
  classifyMediaRetry,
  mediaStateForDispatch,
  type MediaJobState,
} from './lifecycle'
import { pollMediaJob, type MediaPollSchedule } from './poll'
import { checkTerminalResult } from './qc'
import type { MediaJobRecord, MediaJobStore } from './store'

// ── Failures ─────────────────────────────────────────────────────────────────

/**
 * The closed set of ways an asynchronous generation ends without an asset.
 *
 * Deliberately NOT one generic `MEDIA_JOB_FAILED`. Every entry below implies a
 * different next action, and collapsing them would hand the caller a single
 * string from which the only inference available is "try again" — which is the
 * wrong inference for five of the eight.
 */
export const MEDIA_JOB_FAILURES = [
  /** Proven not created. A fresh attempt is safe, and is a human's decision. */
  'dispatch_definite_failure',
  /** A remote operation may exist. NEVER redispatched. Reconciliation required. */
  'dispatch_unknown',
  /** The vendor ran it and reported failure. Nothing to reconcile. */
  'remote_failed',
  /** Reads kept failing. The job is fine; Omnira cannot see it. Resumable. */
  'status_temporarily_unavailable',
  /** We stopped waiting. The job is still running and still paid for. Resumable. */
  'timeout_waiting_for_terminal_state',
  /** A caller cancelled the WAIT. The remote operation is untouched. */
  'observation_cancelled',
  /** The vendor said "completed" and returned something unusable. */
  'invalid_remote_result',
  /** Bytes exist; Omnira could not take ownership. NEVER regenerated. */
  'asset_admission_failed',
  /** Two observers raced and this one lost. Re-read the job; do not dispatch. */
  'job_state_conflict',
] as const

export type MediaJobFailure = (typeof MEDIA_JOB_FAILURES)[number]

export class MediaJobError extends Error {
  readonly failure: MediaJobFailure
  readonly jobId: MediaJobId
  readonly state: MediaJobState
  /** True once a request left the machine — i.e. spend may already have occurred. */
  readonly dispatched: boolean
  /** True when a human must resolve this before anything else may happen. */
  readonly reconciliationRequired: boolean
  /** True when observation may legitimately be resumed against the same job. */
  readonly resumable: boolean

  constructor(opts: {
    failure: MediaJobFailure
    message: string
    jobId: MediaJobId
    state: MediaJobState
    dispatched: boolean
    reconciliationRequired?: boolean
    resumable?: boolean
    cause?: unknown
  }) {
    super(opts.message, opts.cause !== undefined ? { cause: opts.cause } : undefined)
    this.name = 'MediaJobError'
    this.failure = opts.failure
    this.jobId = opts.jobId
    this.state = opts.state
    this.dispatched = opts.dispatched
    this.reconciliationRequired = opts.reconciliationRequired ?? false
    this.resumable = opts.resumable ?? false
  }
}

// ── Input ────────────────────────────────────────────────────────────────────

export interface RunMediaJobInput {
  store: MediaJobStore
  projectId: string
  provider: MediaProviderId
  model: string
  kind: MediaAssetKind
  /** Hash of the canonical brief. The payload itself is never persisted. */
  briefHash: string
  /** Whether this runs on a sandbox credential. Carried onto the asset. */
  simulated: boolean

  /**
   * Create the remote operation. ALREADY GOVERNED by the caller.
   *
   * Returns a classification rather than throwing, because the ambiguous case is
   * a result to be persisted and not an error to be thrown past. The adapter is
   * the only layer that can classify it — it is the one that knows whether the
   * failure happened before or after its own `fetch` — so the judgement is made
   * there and merely acted on here.
   */
  dispatch: () => Promise<MediaDispatchResult>

  /**
   * Read the remote operation's status. UNGOVERNED, and must stay that way.
   * Throwing means the read failed, never that the job did.
   */
  observe: (remoteOperationId: string) => Promise<MediaJobResult>

  /** Where the admitted asset goes. Path only — the bucket is Phase 1's. */
  storagePath: string
  visibility?: AssetVisibility
  /** Provenance the caller supplies. Merged with the lifecycle's own facts. */
  provenance: {
    brief?: unknown
    request?: unknown
    referenceAssetIds?: readonly AssetId[]
    providerMetadata?: Record<string, unknown>
  }

  schedule?: Partial<MediaPollSchedule>
  signal?: AbortSignal
  now?: () => string
}

export interface RunMediaJobResult {
  jobId: MediaJobId
  assetId: AssetId
  remoteOperationId: string | null
  record: MediaJobRecord
  /**
   * The canonical Asset and its provenance, exactly as Phase 1 admission
   * produced them.
   *
   * Added in Phase 5, additively. `assetId` above is still the identity and is
   * unchanged; this carries the two rows admission ALREADY built so that a
   * caller assembling an orchestration result does not have to read them back
   * out of the database. A re-read would be a second answer to a question
   * admission has just answered, and would be able to disagree with it.
   */
  admitted: AdmittedAsset
}

// ── The sequence ─────────────────────────────────────────────────────────────

export async function runMediaJob(input: RunMediaJobInput): Promise<RunMediaJobResult> {
  const at = input.now ?? (() => new Date().toISOString())
  const jobId = newMediaJobId()

  // ── 1. The durable record, BEFORE the wire ───────────────────────────────
  const created = await input.store.create({
    id: jobId,
    projectId: input.projectId,
    provider: input.provider,
    model: input.model,
    briefHash: input.briefHash,
    simulated: input.simulated,
  })
  if (!created.ok) {
    throw new MediaJobError({
      failure: 'job_state_conflict', jobId, state: 'PENDING_DISPATCH', dispatched: false,
      message: `could not record the media job before dispatch: ${created.detail}`,
    })
  }

  // ── 2. Enter the ambiguity window, on the record, first ──────────────────
  //
  // The DISPATCHING row is the evidence that a request was about to be sent. It
  // is written even though the very next line may fail, because a failure after
  // this point is exactly the case that needs a record to exist.
  let record = created.record
  const dispatching = await input.store.transition({
    id: jobId, expectedVersion: record.version, to: 'DISPATCHING', at: at(),
  })
  if (!dispatching.ok) {
    throw new MediaJobError({
      failure: 'job_state_conflict', jobId, state: record.state, dispatched: false,
      message: `could not mark the media job as dispatching: ${dispatching.detail}`,
    })
  }
  record = dispatching.record

  // ── 3. Dispatch, and classify what it proves ─────────────────────────────
  const result = await input.dispatch()
  const observation = observationForDispatch(result)
  const dispatchedState = mediaStateForDispatch(observation)

  const settled = await input.store.transition({
    id: jobId,
    expectedVersion: record.version,
    to: dispatchedState,
    remoteOperationId: result.kind === 'accepted' ? result.remoteOperationId : null,
    // Persisted, not discarded: within UNKNOWN, `response_lost` and
    // `confirmed_evidence_failed` demand different operator urgency.
    dispatchObservation: observation,
    failureCode: result.kind === 'definitely_failed' || result.kind === 'unknown' ? result.error.code : null,
    failureDetail: result.kind === 'unknown' ? result.detail
      : result.kind === 'definitely_failed' ? result.error.message : null,
    at: at(),
  })
  if (!settled.ok) {
    throw new MediaJobError({
      failure: 'job_state_conflict', jobId, state: record.state, dispatched: true,
      // Conservative: the dispatch happened and we failed to record its outcome.
      reconciliationRequired: true,
      message: `dispatch completed but its outcome could not be recorded: ${settled.detail}`,
    })
  }
  record = settled.record

  if (result.kind === 'definitely_failed') {
    throw new MediaJobError({
      failure: 'dispatch_definite_failure', jobId, state: record.state,
      // `not_dispatched` proves nothing left; `remote_rejected` proves the vendor
      // answered and did no work. Neither can have been billed.
      dispatched: observation === 'remote_rejected',
      message: `dispatch failed definitively (${result.observation}): ${result.error.message}`,
    })
  }

  if (result.kind === 'unknown') {
    // THE CASE THIS PHASE EXISTS FOR. No retry, no regeneration, no cleanup —
    // a durable UNKNOWN and a human. `classifyMediaRetry` is consulted rather
    // than assumed so this branch cannot drift from the policy it enforces.
    const policy = classifyMediaRetry(record.state)
    throw new MediaJobError({
      failure: 'dispatch_unknown', jobId, state: record.state, dispatched: true,
      reconciliationRequired: true,
      message: `dispatch outcome unknown (${result.observation}): ${result.detail}. `
        + `${policy.retryClass} — ${policy.reason}.`,
    })
  }

  // ── 4. Observe until terminal ────────────────────────────────────────────
  let terminal: MediaJobResult

  if (result.kind === 'completed_inline') {
    // A synchronous provider. No remote life, so no polling — and no invented
    // operation id to make it look like a job it never was.
    const done = await input.store.transition({
      id: jobId, expectedVersion: record.version, to: 'SUCCEEDED', at: at(),
    })
    if (!done.ok) {
      throw new MediaJobError({
        failure: 'job_state_conflict', jobId, state: record.state, dispatched: true,
        message: `inline completion could not be recorded: ${done.detail}`,
      })
    }
    record = done.record
    terminal = {
      ref: { provider: input.provider, requestId: '', model: input.model, submittedAt: record.createdAt, mode: input.simulated ? 'test' : 'production' },
      status: 'completed',
      assets: result.assets.map(a => ({ kind: input.kind, url: a.url, mimeType: null, width: null, height: null, durationSeconds: null })),
      simulated: input.simulated,
      error: null,
    }
  } else {
    const remoteId = result.remoteOperationId
    const polled = await pollMediaJob({
      observe: () => input.observe(remoteId),
      initialState: record.state,
      schedule: input.schedule,
      signal: input.signal,
      // Every observed state change is persisted as it happens, so a crash
      // mid-poll leaves the job at the last state actually observed rather than
      // at the state it had when polling began.
      onState: async state => {
        const moved = await input.store.transition({
          id: jobId, expectedVersion: record.version, to: state, at: at(),
        })
        // A conflict here means another observer got there first. That is
        // EXPECTED and benign: the other observer's write is as valid as ours.
        // We re-read rather than fight, and we never dispatch on this path.
        record = moved.ok ? moved.record : (moved.record ?? record)
      },
    })

    if (polled.outcome !== 'terminal') {
      const failure: MediaJobFailure =
        polled.outcome === 'deadline_exceeded' ? 'timeout_waiting_for_terminal_state'
        : polled.outcome === 'aborted'         ? 'observation_cancelled'
        :                                        'status_temporarily_unavailable'
      throw new MediaJobError({
        failure, jobId, state: record.state, dispatched: true,
        // RESUMABLE, not failed. The operation exists, is paid for, and will
        // finish; the only thing that ended is Omnira's willingness to wait.
        // Reporting these as generation failures is what would invite a retry.
        resumable: true,
        message: `observation ended without a terminal answer (${polled.outcome}); `
          + `job ${jobId} is ${record.state} at the provider and may be observed again`,
      })
    }

    if (polled.state === 'FAILED') {
      throw new MediaJobError({
        failure: 'remote_failed', jobId, state: 'FAILED', dispatched: true,
        message: `the provider reported the generation failed: `
          + `${polled.result.error?.message ?? 'no detail given'}`,
      })
    }

    terminal = polled.result
  }

  // ── 5. QC boundary — technical validation before admission ───────────────
  const checked = checkTerminalResult(terminal, { kind: input.kind })
  if (!checked.ok) {
    throw new MediaJobError({
      failure: 'invalid_remote_result', jobId, state: record.state, dispatched: true,
      message: `provider completed but its result is unusable (${checked.rejection}): ${checked.detail}`,
    })
  }

  // ── 6. Admission — success is not declared before this succeeds ──────────
  //
  // Phase 1 owns every judgement here: it retrieves, enforces the MIME
  // allowlist, checks magic numbers, bounds the size, checksums, DERIVES the
  // bucket from visibility and MINTS the asset id in the database. The provider
  // supplies a URL and nothing else — not the bucket, not the path, not the id,
  // not the project.
  let assetId: AssetId
  let admitted: AdmittedAsset
  try {
    admitted = await admitAssetFromUrl({
      projectId: input.projectId,
      kind: input.kind,
      visibility: input.visibility ?? 'internal',
      storage: { path: input.storagePath },
      sourceUrl: checked.asset.url,
      provenance: {
        source: 'generated',
        provider: input.provider,
        model: input.model,
        // The vendor's operation id is RECORDED here and routed on nowhere.
        providerRequestId: record.remoteOperationId,
        brief: input.provenance.brief,
        request: input.provenance.request,
        referenceAssetIds: input.provenance.referenceAssetIds,
        simulated: input.simulated,
        providerMetadata: {
          ...input.provenance.providerMetadata,
          // The link back to the lifecycle. Transition HISTORY stays in the job
          // record; provenance keeps only the identity, so it does not become a
          // mutable job-state table.
          mediaJobId: jobId,
        },
      },
    })
    assetId = admitted.asset.id
  } catch (err) {
    // A paid generation HAS happened and the bytes exist. Say that precisely,
    // and do not dispatch again: the problem is ownership, not generation.
    throw new MediaJobError({
      failure: 'asset_admission_failed', jobId, state: record.state, dispatched: true,
      message: err instanceof AssetRejectedError
        ? `the provider produced output that could not be admitted (${err.code}): ${err.message}`
        : `the provider produced output but admission failed: ${err instanceof Error ? err.message : String(err)}`,
      cause: err,
    })
  }

  const bound = await input.store.recordAdmission({
    id: jobId, expectedVersion: record.version, assetId, at: at(),
  })
  if (!bound.ok) {
    throw new MediaJobError({
      failure: 'job_state_conflict', jobId, state: record.state, dispatched: true,
      message: `asset ${assetId} was admitted but could not be bound to job ${jobId}: ${bound.detail}`,
    })
  }

  return {
    jobId,
    assetId,
    remoteOperationId: bound.record.remoteOperationId,
    record: bound.record,
    admitted,
  }
}
