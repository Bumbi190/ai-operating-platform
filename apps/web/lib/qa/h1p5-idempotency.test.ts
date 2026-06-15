import { describe, it, expect } from 'vitest'
import { isDuplicateOutputError } from '@/lib/ai/output-idempotency'

/**
 * H1.P5 Commit 1 — output finalization is idempotent and defensive.
 *
 * Only a unique-violation (23505) on outputs(run_id) is the idempotent re-entry case;
 * any other error must propagate so the run retries instead of finalizing empty.
 * (DB-level idempotency itself is proven against the staging branch: a second insert
 * for the same run_id yields exactly one row.)
 */
describe('isDuplicateOutputError', () => {
  it('treats SQLSTATE 23505 (unique_violation) as an idempotent duplicate', () => {
    expect(isDuplicateOutputError({ code: '23505' })).toBe(true)
  })

  it('does NOT swallow other Postgres/PostgREST errors', () => {
    for (const code of ['23502', '23503', '23514', '42P01', 'PGRST116', '']) {
      expect(isDuplicateOutputError({ code }), `must not ignore "${code}"`).toBe(false)
    }
  })

  it('is false for null/undefined (clean insert, no error)', () => {
    expect(isDuplicateOutputError(null)).toBe(false)
    expect(isDuplicateOutputError(undefined)).toBe(false)
  })
})
