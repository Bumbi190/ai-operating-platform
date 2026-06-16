import { describe, it, expect, afterEach } from 'vitest'
import { isCancelEnabled, cancelledError, isCancelledError, isCancelRequested } from '@/lib/ai/cancel'

/**
 * H1.P5 Commit 3 — cooperative cancel.
 *
 * Unit-level proof of the cancel CONTRACT (flag gating, sentinel error, durable-flag
 * read). The DB-level state machine (pending/awaiting_approval/running/terminal, the
 * D1 approval→returned transition, and the fenced cooperative stop) is proven against
 * the staging branch via the SQL matrix X1–X6.
 */

afterEach(() => { delete process.env.H1_CANCEL })

describe('isCancelEnabled — flag gate (default OFF)', () => {
  it('is false unless H1_CANCEL === "1"', () => {
    delete process.env.H1_CANCEL; expect(isCancelEnabled()).toBe(false)
    process.env.H1_CANCEL = '0'; expect(isCancelEnabled()).toBe(false)
    process.env.H1_CANCEL = 'true'; expect(isCancelEnabled()).toBe(false)
    process.env.H1_CANCEL = '1'; expect(isCancelEnabled()).toBe(true)
  })
})

describe('cancelled sentinel error', () => {
  it('cancelledError is recognized by isCancelledError', () => {
    expect(isCancelledError(cancelledError('r1'))).toBe(true)
    expect(cancelledError('r1').message).toMatch(/^cancelled: run r1 cancelled/)
  })
  it('does NOT match fenced errors or ordinary errors (sentinels stay distinct)', () => {
    expect(isCancelledError(new Error('fenced: run r1 reclaimed (claim rotated)'))).toBe(false)
    expect(isCancelledError(new Error('Agent not found'))).toBe(false)
    expect(isCancelledError(null)).toBe(false)
    expect(isCancelledError('cancelled: string not error')).toBe(false)
  })
})

describe('isCancelRequested — durable flag read', () => {
  function fakeDb(row: unknown, throws = false) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => throws ? Promise.reject(new Error('db down')) : Promise.resolve({ data: row, error: null }),
          }),
        }),
      }),
    }
  }
  it('true when cancel_requested is true', async () => {
    expect(await isCancelRequested(fakeDb({ cancel_requested: true }), 'r')).toBe(true)
  })
  it('false when flag is false, null, or the row is missing', async () => {
    expect(await isCancelRequested(fakeDb({ cancel_requested: false }), 'r')).toBe(false)
    expect(await isCancelRequested(fakeDb({ cancel_requested: null }), 'r')).toBe(false)
    expect(await isCancelRequested(fakeDb(null), 'r')).toBe(false)
  })
  it('false (never throws) on a transient read error — a legitimate run is not aborted', async () => {
    expect(await isCancelRequested(fakeDb(null, true), 'r')).toBe(false)
  })
})
