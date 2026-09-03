/**
 * lib/media/job/reconcile.ts — asking the vendor what really happened, and being
 * the ONLY thing allowed to resolve an ambiguity.
 *
 * Shaped after `lib/workflows/reconciliation.ts`, which established the rule for
 * bound workflow actions: a reconciliation is READ-ONLY by construction, it asks
 * one question, it records the answer, and it never repairs, retries or deletes.
 * The same discipline applies here for the same reason — an automatic repair of
 * a state nobody understands is strictly worse than a frozen job and a notified
 * human.
 *
 * ── THE FINDING THIS MODULE EXISTS TO STATE HONESTLY ───────────────────────
 * Reconciliation needs a question the vendor can answer. Omnira's MuAPI
 * integration has exactly one:
 *
 *     GET /api/v1/predictions/{request_id}/result
 *
 * which requires the `request_id`. There is no lookup by client correlation id,
 * no idempotency key on `POST /api/v1/{model}`, and no request-history endpoint
 * anywhere in the adapter (`lib/media/providers/muapi.ts`) or in
 * `docs/architecture/muapi-media-provider.md`.
 *
 * The consequence, stated plainly rather than engineered around:
 *
 *   • A dispatch that failed AFTER the vendor answered with a usable id is
 *     RECONCILABLE — the id is durable, so the status endpoint can be asked.
 *   • A dispatch whose response was lost BEFORE an id was read is
 *     **UNRECONCILABLE against the provider API**. Omnira cannot name the
 *     operation, and MuAPI offers no way to find it.
 *
 * The second case does not become a regeneration. It becomes a durable record —
 * project, provider, model, brief hash, timestamp — and a human decision. Hiding
 * it behind an automatic retry would convert an operator's five-minute check
 * into a duplicated charge and an orphaned remote asset, which is the precise
 * outcome this whole phase exists to prevent.
 *
 * PURE-ish: it performs one provider READ and one store write, and it has no
 * ability to dispatch — nothing that could create a remote operation is imported.
 */

import type { MediaJobResult, MediaProvider, MediaJobRef } from '@/lib/media/providers/types'
import { mediaStateForRemoteStatus, type MediaJobState } from './lifecycle'
import type { MediaJobRecord, MediaJobStore, MediaJobWriteResult } from './store'

/**
 * The four answers, matching `RECONCILIATION_RESULTS` in the workflow layer.
 *
 * `CONFIRMED_NOT_CREATED` is the media-specific name for
 * `CONFIRMED_NOT_APPLIED`: a generation is created or it is not, and "applied"
 * describes a side effect on someone else's system rather than a job in a queue.
 */
export const MEDIA_RECONCILIATION_RESULTS = [
  'CONFIRMED_SUCCEEDED',
  'CONFIRMED_FAILED',
  'CONFIRMED_RUNNING',
  'CONFIRMED_NOT_CREATED',
  /** The vendor could not tell us. The job stays exactly where it was. */
  'STILL_UNKNOWN',
] as const

export type MediaReconciliationResult = (typeof MEDIA_RECONCILIATION_RESULTS)[number]

/** Why a reconciliation could not reach an answer. Never a raw vendor body. */
export type MediaReconciliationBlocker =
  /** No remote id was ever read, and this provider offers no other lookup. */
  | 'no_remote_identity'
  /** The provider has no reconciliation surface at all. */
  | 'provider_cannot_reconcile'
  /** The lookup itself failed. Transient; the job stays UNKNOWN. */
  | 'lookup_failed'

export interface MediaReconciliationRecord {
  jobId: string
  projectId: string
  provider: string
  remoteOperationId: string | null
  result: MediaReconciliationResult
  blocker: MediaReconciliationBlocker | null
  /** Structured facts only — ids, states, counts. Never a raw response. */
  detail: Record<string, string | number | boolean | null>
  observedAt: string
}

/**
 * What a state a reconciliation result permits the job to move to.
 *
 * `STILL_UNKNOWN` maps to null deliberately: not knowing is a valid answer, and
 * it must leave the job exactly where it was rather than nudging it toward a
 * guess. This is the same mapping `resolutionFor` makes for workflow actions.
 */
export function mediaResolutionFor(result: MediaReconciliationResult): MediaJobState | null {
  switch (result) {
    case 'CONFIRMED_SUCCEEDED':   return 'SUCCEEDED'
    case 'CONFIRMED_FAILED':      return 'FAILED'
    case 'CONFIRMED_RUNNING':     return 'RUNNING'
    case 'CONFIRMED_NOT_CREATED': return 'FAILED'
    case 'STILL_UNKNOWN':         return null
  }
}

/**
 * Does the answer permit a fresh, deliberate dispatch?
 *
 * ONLY when the vendor positively confirmed nothing was created. Anything else —
 * including "we still cannot tell" — must not produce a new generation. And even
 * this is a permission, not an instruction: `classifyMediaRetry` marks a
 * confirmed non-creation `SAFE_REDISPATCH` with `automatic: false`, so a human
 * still decides.
 */
export function permitsFreshDispatch(result: MediaReconciliationResult): boolean {
  return result === 'CONFIRMED_NOT_CREATED'
}

/**
 * Whether a provider can answer a reconciliation question at all, and how.
 *
 * A FACT about the integration, declared rather than probed. `byRemoteId` is
 * true for MuAPI (the status endpoint). `byCorrelationId` is false, and that
 * single `false` is the reason an id-less ambiguous dispatch is unrecoverable.
 */
export interface MediaReconciliationCapability {
  /** Ask about a named operation. Requires a stored remote id. */
  byRemoteId: boolean
  /** Ask "what did I create for correlation X". Needs vendor support Omnira has none of. */
  byCorrelationId: boolean
  /** Enumerate recent operations and match one. Needs a history endpoint. */
  byHistory: boolean
}

export const MUAPI_RECONCILIATION: MediaReconciliationCapability = {
  byRemoteId: true,
  // Both false as a matter of repository evidence, not preference. See the
  // module header, and PHASE3_RESULT.md §11 for what would change them.
  byCorrelationId: false,
  byHistory: false,
}

export interface ReconcileInput {
  store: MediaJobStore
  provider: MediaProvider
  capability: MediaReconciliationCapability
  job: MediaJobRecord
  now?: () => string
}

export interface ReconcileOutcome {
  record: MediaReconciliationRecord
  /** The store write, when the answer moved the job. Absent for STILL_UNKNOWN. */
  applied?: MediaJobWriteResult
}

/**
 * Attempt to resolve one ambiguous job.
 *
 * Reads. Records. Never dispatches — there is no code path from here to a
 * generation, and no provider generation method is called.
 */
export async function reconcileMediaJob(input: ReconcileInput): Promise<ReconcileOutcome> {
  const { store, provider, capability, job } = input
  const at = (input.now ?? (() => new Date().toISOString()))()

  const base = {
    jobId: job.id as string,
    projectId: job.projectId,
    provider: job.provider,
    remoteOperationId: job.remoteOperationId as string | null,
    observedAt: at,
  }

  /**
   * Record that we ASKED and could not tell. This is a fact, and it is appended
   * for the same reason a confirmation is: "we have asked three times over two
   * days and still cannot tell" is materially different from "we have not
   * asked", and only a ledger can hold that difference. `resolvesTo: null`
   * leaves the job exactly where it was.
   */
  const inconclusive = async (
    blocker: MediaReconciliationBlocker,
    detail: Record<string, string | number | boolean | null>,
  ): Promise<ReconcileOutcome> => {
    const record: MediaReconciliationRecord = { ...base, result: 'STILL_UNKNOWN', blocker, detail }
    const applied = await store.recordReconciliation({
      id: job.id,
      expectedVersion: job.version,
      record: {
        projectId: job.projectId,
        provider: job.provider,
        remoteOperationId: job.remoteOperationId,
        result: 'STILL_UNKNOWN',
        blocker,
        detail,
        observedAt: at,
      },
      resolvesTo: null,
      at,
    })
    return { record, applied }
  }

  if (!job.remoteOperationId) {
    // THE UNRECOVERABLE CASE, reported as itself. Not a failure, not a retry:
    // an operation that may exist under a name Omnira never learned.
    return await inconclusive(
      capability.byCorrelationId || capability.byHistory ? 'lookup_failed' : 'no_remote_identity',
      {
        by_remote_id: capability.byRemoteId,
        by_correlation_id: capability.byCorrelationId,
        by_history: capability.byHistory,
        brief_hash: job.briefHash,
        model: job.model,
      },
    )
  }

  if (!capability.byRemoteId) {
    return await inconclusive('provider_cannot_reconcile', { model: job.model })
  }

  const ref: MediaJobRef = {
    provider: job.provider,
    requestId: job.remoteOperationId,
    model: job.model,
    submittedAt: job.dispatchStartedAt ?? job.createdAt,
    mode: job.simulated ? 'test' : 'production',
  }

  let observed: MediaJobResult
  try {
    observed = await provider.getStatus(ref)
  } catch (err) {
    // A failed lookup is not an answer. The job stays UNKNOWN and stays frozen.
    return await inconclusive('lookup_failed', {
      error: err instanceof Error ? err.message : String(err),
      model: job.model,
    })
  }

  const result: MediaReconciliationResult =
    observed.status === 'completed' ? 'CONFIRMED_SUCCEEDED'
    : observed.status === 'failed'  ? 'CONFIRMED_FAILED'
    : 'CONFIRMED_RUNNING'

  const record: MediaReconciliationRecord = {
    ...base,
    result,
    blocker: null,
    detail: { remote_status: observed.status, asset_count: observed.assets.length, simulated: observed.simulated },
  }

  const to = mediaResolutionFor(result)

  // ONE ATOMIC OPERATION, always — even when the answer resolves nothing.
  //
  // `store.transition` is deliberately NOT called from here any more. The guard
  // that lets an UNKNOWN leave that state reads the ledger DURING the update, so
  // an insert and a transition issued separately race themselves: the evidence
  // could land while the transition loses a version conflict, leaving an audit
  // row claiming a resolution that never happened.
  const applied = await store.recordReconciliation({
    id: job.id,
    expectedVersion: job.version,
    record: {
      projectId: job.projectId,
      provider: job.provider,
      remoteOperationId: job.remoteOperationId,
      result: record.result,
      blocker: record.blocker,
      detail: record.detail,
      observedAt: at,
    },
    resolvesTo: to,
    at,
  })

  return { record, applied }
}
