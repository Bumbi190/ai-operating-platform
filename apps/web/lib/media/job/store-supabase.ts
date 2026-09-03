/**
 * lib/media/job/store-supabase.ts — the durable `MediaJobStore`.
 *
 * The Phase 3 port, backed by `public.media_jobs` and
 * `public.media_job_reconciliations` (migration `media_job_lifecycle`,
 * applied 2026-09-03). The DATABASE SERVES THE PORT: not one method signature
 * changed to suit SQL, and the lifecycle above is untouched.
 *
 * ── CAS IS IN THE DATABASE, NOT IN THIS PROCESS ────────────────────────────
 * Every state change is a conditional UPDATE:
 *
 *     update media_jobs set …, version = <expected + 1>
 *      where id = $1 and version = <expected>
 *
 * Zero affected rows is a CAS CONFLICT and nothing else. It is never read as
 * "retry the dispatch" — the whole point of the version guard is that a losing
 * writer re-reads and discovers the job has already moved, rather than acting
 * again on a paid generation.
 *
 * `version = expected + 1` is sent as a literal because PostgREST cannot
 * express `version + 1`. That is exactly equivalent under the `version =
 * expected` predicate, and the database independently enforces it: the
 * `media_jobs_guard` trigger raises unless `new.version = old.version + 1`, so
 * a caller that miscomputed the successor is refused rather than trusted.
 *
 * ── WHY THERE IS A READ BEFORE THE WRITE ───────────────────────────────────
 * Three columns are "set once, then leave alone" (`remote_operation_id`,
 * `remote_confirmed_at`, `dispatch_started_at`) and PostgREST cannot express
 * `coalesce(col, $n)`. So `transition` reads the row to derive those values.
 *
 * That read is NOT the concurrency control, and this is worth being precise
 * about: the authority is still the `version` predicate in the UPDATE. If the
 * row changes between the read and the write, the predicate fails and the write
 * affects zero rows — the same conflict it would have produced anyway. The read
 * supplies field VALUES; it never grants permission.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { AssetId } from '@/lib/media/asset/types'
import type { MediaProviderId } from '@/lib/media/providers/types'
import type { MediaJobState } from './lifecycle'
import { asMediaJobId, type MediaJobId, type RemoteOperationId } from './identity'
import type {
  CreateMediaJobInput,
  MediaJobRecord,
  MediaJobStore,
  MediaJobWriteRefusal,
  MediaJobWriteResult,
  RecordReconciliationInput,
} from './store'

// any: the Supabase client's generated types do not narrow through the branded
// identity types this module returns, and the repo's existing store modules use
// the same escape (`lib/workflows/store.ts`). Every value is re-narrowed in
// `toRecord` below, which is the one place a database row becomes a record.
type AnyDb = any

/** Postgres SQLSTATEs this store interprets. Everything else is `write_failed`. */
const SQLSTATE = {
  UNIQUE_VIOLATION: '23505',
  CHECK_VIOLATION: '23514',
  /** Raised by `media_jobs_guard` and the reconciliation binding guard. */
  RESTRICT_VIOLATION: '23001',
} as const

/**
 * Map a database refusal onto the port's closed vocabulary.
 *
 * The trigger speaks in messages, so the message is read — but only to choose
 * between two refusals that are both correct, never to decide whether the write
 * succeeded. That decision is the database's alone. This is the same technique
 * `lib/workflows/reconciliation.ts` already uses for its own guard.
 */
function refusalFor(error: { code?: string | null; message?: string | null }): MediaJobWriteRefusal {
  const msg = error.message ?? ''
  if (error.code === SQLSTATE.RESTRICT_VIOLATION || error.code === SQLSTATE.CHECK_VIOLATION) {
    if (/only be resolved by a recorded reconciliation/i.test(msg)) return 'requires_reconciliation'
    if (/asset binding is write-once/i.test(msg)) return 'already_admitted'
    return 'illegal_transition'
  }
  if (error.code === SQLSTATE.UNIQUE_VIOLATION) {
    // `media_jobs_asset_uniq` — another job already produced this asset.
    if (/media_jobs_asset_uniq/i.test(msg)) return 'already_admitted'
    return 'write_failed'
  }
  return 'write_failed'
}

/**
 * Map a refusal raised inside `media_job_record_reconciliation()`.
 *
 * The five outcomes are kept DISTINCT rather than collapsed into one failure,
 * because each implies a different next action — and none of them, ever, is
 * "dispatch again". A reconciliation that fails leaves the job exactly where it
 * was; the caller re-reads, it does not regenerate.
 */
function reconciliationRefusalFor(error: { code?: string | null; message?: string | null }): MediaJobWriteRefusal {
  const msg = error.message ?? ''
  // The function raises `no_data_found` before touching anything.
  if (error.code === 'P0002' || /no such media job/i.test(msg)) return 'not_found'
  if (/version conflict/i.test(msg)) return 'version_conflict'
  // Raised by media_jobs_guard while the transition is attempted; the ledger
  // INSERT is rolled back with it.
  if (/only be resolved by a recorded reconciliation/i.test(msg)) return 'requires_reconciliation'
  if (/illegal state transition|cannot rewind|write-once|must advance version/i.test(msg)) return 'illegal_transition'
  // Raised by the ledger's own binding guard — evidence that does not match its job.
  if (/identity does not match|append-only|blocker_agrees/i.test(msg)) return 'write_failed'
  return 'write_failed'
}

function toRecord(row: Record<string, unknown>): MediaJobRecord {
  return {
    id: asMediaJobId(row.id as string),
    projectId: row.project_id as string,
    provider: row.provider as MediaProviderId,
    model: row.model as string,
    state: row.state as MediaJobState,
    remoteOperationId: (row.remote_operation_id as RemoteOperationId | null) ?? null,
    dispatchObservation: (row.dispatch_observation as MediaJobRecord['dispatchObservation']) ?? null,
    simulated: row.simulated === true,
    briefHash: row.brief_hash as string,
    assetId: (row.asset_id as AssetId | null) ?? null,
    lastFailureCode: (row.last_failure_code as string | null) ?? null,
    lastFailureDetail: (row.last_failure_detail as string | null) ?? null,
    reconciliationRequired: row.reconciliation_required === true,
    createdAt: row.created_at as string,
    dispatchStartedAt: (row.dispatch_started_at as string | null) ?? null,
    remoteConfirmedAt: (row.remote_confirmed_at as string | null) ?? null,
    terminalAt: (row.terminal_at as string | null) ?? null,
    version: row.version as number,
  }
}

const TERMINAL: readonly MediaJobState[] = ['SUCCEEDED', 'FAILED', 'UNKNOWN']

export function createSupabaseMediaJobStore(db: AnyDb = createAdminClient()): MediaJobStore {
  const readRow = async (id: MediaJobId): Promise<Record<string, unknown> | null> => {
    const { data } = await db.from('media_jobs').select('*').eq('id', id).maybeSingle()
    return (data as Record<string, unknown> | null) ?? null
  }

  /** Zero rows updated: decide WHY, without ever guessing "succeeded". */
  const conflictAfterZeroRows = async (
    id: MediaJobId, expectedVersion: number,
  ): Promise<MediaJobWriteResult> => {
    const current = await readRow(id)
    if (!current) return { ok: false, refusal: 'not_found', detail: `no media job ${id}` }
    const record = toRecord(current)
    return {
      ok: false, refusal: 'version_conflict', record,
      detail: `job moved on (expected v${expectedVersion}, found v${record.version} in ${record.state})`,
    }
  }

  return {
    async create(input: CreateMediaJobInput): Promise<MediaJobWriteResult> {
      // The row that must exist BEFORE the wire. Everything else this store does
      // is a conditional update on it.
      const { data, error } = await db.from('media_jobs').insert({
        id: input.id,
        project_id: input.projectId,
        provider: input.provider,
        model: input.model,
        brief_hash: input.briefHash,
        simulated: input.simulated,
      }).select('*').maybeSingle()

      if (error) return { ok: false, refusal: refusalFor(error), detail: error.message ?? 'insert failed' }
      if (!data) return { ok: false, refusal: 'write_failed', detail: 'insert returned no row' }
      return { ok: true, record: toRecord(data as Record<string, unknown>) }
    },

    async read(id: MediaJobId): Promise<MediaJobRecord | null> {
      const row = await readRow(id)
      return row ? toRecord(row) : null
    },

    async transition(input): Promise<MediaJobWriteResult> {
      // Read for FIELD DERIVATION only — see the module header. The `version`
      // predicate below remains the sole authority.
      const current = await readRow(input.id)
      if (!current) return { ok: false, refusal: 'not_found', detail: `no media job ${input.id}` }
      const before = toRecord(current)
      if (before.version !== input.expectedVersion) {
        return conflictAfterZeroRows(input.id, input.expectedVersion)
      }

      const isTerminal = TERMINAL.includes(input.to)

      const patch: Record<string, unknown> = {
        state: input.to,
        version: input.expectedVersion + 1,
      }

      // Write-once fields: supplied only when the row does not already hold one.
      // The trigger refuses a REBIND regardless; this keeps a benign repeat from
      // becoming a refusal.
      if (input.remoteOperationId && !before.remoteOperationId) {
        patch.remote_operation_id = input.remoteOperationId
      }
      if (input.dispatchObservation && !before.dispatchObservation) {
        patch.dispatch_observation = input.dispatchObservation
      }
      if (input.failureCode !== undefined && input.failureCode !== null) {
        patch.last_failure_code = input.failureCode
      }
      if (input.failureDetail !== undefined && input.failureDetail !== null) {
        patch.last_failure_detail = input.failureDetail
      }

      // Ambiguity always demands a human; only a confirmed reconciliation clears
      // it. The database enforces the first half as a CHECK constraint.
      if (input.to === 'UNKNOWN') patch.reconciliation_required = true
      else if (input.hasConfirmedReconciliation === true) patch.reconciliation_required = false

      if (input.to === 'DISPATCHING' && !before.dispatchStartedAt) patch.dispatch_started_at = input.at
      if ((input.to === 'QUEUED' || input.to === 'RUNNING') && !before.remoteConfirmedAt) {
        patch.remote_confirmed_at = input.at
      }
      if (isTerminal && !before.terminalAt) patch.terminal_at = input.at

      const { data, error } = await db.from('media_jobs')
        .update(patch)
        .eq('id', input.id)
        .eq('version', input.expectedVersion)   // ← THE COMPARE-AND-SET
        .select('*')
        .maybeSingle()

      if (error) {
        return { ok: false, refusal: refusalFor(error), detail: error.message ?? 'update failed', record: before }
      }
      if (!data) return conflictAfterZeroRows(input.id, input.expectedVersion)
      return { ok: true, record: toRecord(data as Record<string, unknown>) }
    },

    async recordAdmission(input): Promise<MediaJobWriteResult> {
      const current = await readRow(input.id)
      if (!current) return { ok: false, refusal: 'not_found', detail: `no media job ${input.id}` }
      const before = toRecord(current)
      if (before.version !== input.expectedVersion) {
        return conflictAfterZeroRows(input.id, input.expectedVersion)
      }
      if (before.assetId !== null) {
        // Idempotent for the SAME asset; a different one is a duplicate
        // admission and must surface rather than overwrite.
        return before.assetId === input.assetId
          ? { ok: true, record: before }
          : {
              ok: false, refusal: 'already_admitted', record: before,
              detail: `job already produced asset ${before.assetId}; refusing to rebind to ${input.assetId}`,
            }
      }

      const { data, error } = await db.from('media_jobs')
        .update({ asset_id: input.assetId, version: input.expectedVersion + 1 })
        .eq('id', input.id)
        .eq('version', input.expectedVersion)
        .select('*')
        .maybeSingle()

      if (error) {
        return { ok: false, refusal: refusalFor(error), detail: error.message ?? 'update failed', record: before }
      }
      if (!data) return conflictAfterZeroRows(input.id, input.expectedVersion)
      return { ok: true, record: toRecord(data as Record<string, unknown>) }
    },

    async listUnresolved(projectIds: readonly string[]): Promise<MediaJobRecord[]> {
      if (projectIds.length === 0) return []
      // PROJECT-SCOPED BY CONSTRUCTION. The caller names the projects; a job is
      // never reachable by remote operation id alone.
      const { data } = await db.from('media_jobs')
        .select('*')
        .in('project_id', projectIds as string[])
        .eq('reconciliation_required', true)
        .order('created_at', { ascending: true })
      return ((data as Record<string, unknown>[] | null) ?? []).map(toRecord)
    },

    /**
     * ── ONE DATABASE TRANSACTION. NOT TWO REQUESTS. ───────────────────────
     *
     * The whole operation is `media_job_record_reconciliation()`
     * (migration `media_job_lifecycle_repairs`, applied 2026-09-03). There is
     * deliberately NO `.insert()` followed by `.update()` here, and there never
     * may be: `media_jobs_guard` reads the ledger WHILE performing the state
     * update, so two PostgREST calls would race themselves and could leave an
     * evidence row claiming a resolution that never landed.
     *
     * PL/pgSQL runs inside the caller's transaction, so the INSERT is visible to
     * the guard, and any refusal RAISES — which aborts the statement and undoes
     * the INSERT with it. That is why the function returns nothing on failure
     * and this method reads an ERROR rather than a row count.
     *
     * IDENTITY IS NOT SENT. project, provider and remote operation id are
     * derived from the locked job row inside the function, so nothing here can
     * name another project's job or bind evidence to an operation the job does
     * not own.
     */
    async recordReconciliation(input: RecordReconciliationInput): Promise<MediaJobWriteResult> {
      const { data, error } = await db.rpc('media_job_record_reconciliation', {
        p_job_id: input.id,
        p_expected_version: input.expectedVersion,
        p_result: input.record.result,
        p_blocker: input.record.blocker,
        p_detail: input.record.detail,
        p_observed_at: input.record.observedAt,
        p_resolves_to: input.resolvesTo,
      })

      if (error) {
        return {
          ok: false,
          refusal: reconciliationRefusalFor(error),
          detail: error.message ?? 'reconciliation failed',
        }
      }

      // `returns public.media_jobs` — one composite row. PostgREST may hand it
      // back bare or wrapped in an array depending on version; both are read.
      const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
      if (!row) {
        return { ok: false, refusal: 'write_failed', detail: 'reconciliation returned no job row' }
      }
      return { ok: true, record: toRecord(row) }
    },
  }
}
