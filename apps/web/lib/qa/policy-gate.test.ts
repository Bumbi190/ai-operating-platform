import { describe, it, expect } from 'vitest'
import { decideGate, type GateOutcome } from '@/lib/ai/policy-gate'

/**
 * H1.P4 PR2 (Commit 3) — the policy gate decision is total and Default-Deny.
 *
 * decideGate is the single pure decision the drain consults at run completion. These
 * lock the decision matrix from the design (§4): only an explicit 'non_destructive'
 * snapshot completes silently; everything else — including NULL (unclassified) and any
 * unknown/future value — fails safe to awaiting_approval.
 */

describe('decideGate — Default Deny policy gate', () => {
  it("returns 'done' ONLY for an explicit non_destructive snapshot", () => {
    expect(decideGate('non_destructive')).toBe('done')
  })

  it("gates approval_required → 'awaiting_approval'", () => {
    expect(decideGate('approval_required')).toBe('awaiting_approval')
  })

  it("Default Deny: NULL (unclassified / pre-PR1 run) → 'awaiting_approval'", () => {
    expect(decideGate(null)).toBe('awaiting_approval')
  })

  it("Default Deny: undefined (column absent on the row) → 'awaiting_approval'", () => {
    expect(decideGate(undefined)).toBe('awaiting_approval')
  })

  it("fail-safe: any unknown/future class → 'awaiting_approval'", () => {
    for (const v of ['destructive', 'budget_exceeded', 'NON_DESTRUCTIVE', '', 'done', 'rejected']) {
      expect(decideGate(v), `unknown class "${v}" must Default-Deny`).toBe('awaiting_approval')
    }
  })

  it('only ever returns a valid GateOutcome', () => {
    const valid = new Set<GateOutcome>(['done', 'awaiting_approval'])
    for (const v of ['non_destructive', 'approval_required', null, undefined, 'x']) {
      expect(valid.has(decideGate(v))).toBe(true)
    }
  })
})
