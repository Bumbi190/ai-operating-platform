import { describe, it, expect } from 'vitest'
import { statusConfig, UNKNOWN_STATUS } from '@/components/platform/RunStatusBadge'
import { classifyRunStatus } from '@/lib/os/data'
import type { RunStatus } from '@/lib/supabase/types'

/**
 * H1.P4 PR2 (Commit 2) — run-status rendering/classification is total + defensive.
 *
 * These guard the prerequisite from the status-reader audit: once the policy gate
 * (Commit 3) produces `awaiting_approval`/`rejected`, every status reader must render
 * and classify them WITHOUT crashing or returning undefined. No behavior change for
 * existing statuses; only adds coverage for the widened set + the UNKNOWN fallback.
 */

// The full RunStatus union, enumerated for runtime exhaustiveness assertions.
const ALL_STATUSES: RunStatus[] = [
  'pending', 'running', 'done', 'failed', 'awaiting_approval', 'cancelled', 'rejected',
]

describe('RunStatusBadge.statusConfig — total over RunStatus', () => {
  it('has an entry for every RunStatus value', () => {
    for (const s of ALL_STATUSES) {
      expect(statusConfig[s], `missing config for "${s}"`).toBeDefined()
      expect(statusConfig[s].label.length).toBeGreaterThan(0)
      expect(statusConfig[s].className.length).toBeGreaterThan(0)
    }
  })

  it('falls back to UNKNOWN_STATUS for a value outside the type (raw DB ahead of code)', () => {
    const unknown = 'totally_new_status' as unknown as RunStatus
    const resolved = statusConfig[unknown] ?? UNKNOWN_STATUS
    expect(resolved).toBe(UNKNOWN_STATUS)
    expect(resolved.label).toBe('Okänd')
  })
})

describe('classifyRunStatus — total + defensive default', () => {
  it('returns a valid tier+label for every RunStatus value', () => {
    const tiers = new Set(['live', 'passive', 'archived', 'critical'])
    for (const s of ALL_STATUSES) {
      const c = classifyRunStatus(s)
      expect(tiers.has(c.tier), `bad tier for "${s}": ${c.tier}`).toBe(true)
      expect(c.label.length).toBeGreaterThan(0)
    }
  })

  it('classifies the new gate states', () => {
    expect(classifyRunStatus('awaiting_approval').tier).toBe('passive')
    expect(classifyRunStatus('rejected').tier).toBe('critical')
  })

  it('hits the defensive default for an unknown status', () => {
    const c = classifyRunStatus('totally_new_status' as unknown as RunStatus)
    expect(c).toEqual({ tier: 'passive', label: 'Okänd' })
  })
})
