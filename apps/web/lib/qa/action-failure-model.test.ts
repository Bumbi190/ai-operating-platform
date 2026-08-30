/**
 * PR9d — failure + ambiguity model.
 *
 * The single property worth defending: a side effect that MAY have happened is
 * never reported as one that did not, and is never retried. `FAILED` is a
 * positive claim; a timeout cannot support it.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  decideRetry, freezesWorkflow, hasDispatched, isAmbiguous, isLegalOutcomeTransition,
  isLegalPhaseTransition, outcomeForObservation, phaseRank,
  type ActionOutcome, type DispatchObservation,
} from '../workflows/action-outcome'
import { permitsFreshAttempt, resolutionFor } from '../workflows/reconciliation'
import { severityForActionOutcome, actionIncidentSignalKey } from '../workflows/escalation'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260830_action_failure_model.sql'), 'utf8')
const sqlCode = sql.replace(/--.*$/gm, '')

const MATERIAL = ['MATERIAL_WRITE', 'FINANCIAL', 'EXTERNAL_COMMUNICATION', 'DESTRUCTIVE'] as const
const OK = { hasConfirmedReconciliation: true, phase: null }
const NO_REC = { hasConfirmedReconciliation: false, phase: null }

// ── Phase ───────────────────────────────────────────────────────────────────

describe('phase', () => {
  it('progresses forward only', () => {
    expect(isLegalPhaseTransition('PREPARED', 'DISPATCH_STARTED')).toBe(true)
    expect(isLegalPhaseTransition('DISPATCH_STARTED', 'PREPARED')).toBe(false)
    expect(isLegalPhaseTransition('REMOTE_CONFIRMED', 'REMOTE_CONFIRMED')).toBe(false)
    expect(isLegalPhaseTransition(null, 'PREPARED')).toBe(true)
  })

  it('the dispatch boundary is load-bearing', () => {
    expect(hasDispatched('PREPARED')).toBe(false)
    expect(hasDispatched('PRE_COMMIT_VERIFIED')).toBe(false)
    expect(hasDispatched('DISPATCH_STARTED')).toBe(true)
    expect(hasDispatched('REMOTE_CONFIRMED')).toBe(true)
    expect(hasDispatched(null)).toBe(false)
    expect(phaseRank('DISPATCH_STARTED')).toBe(3)
  })
})

// ── Classification ──────────────────────────────────────────────────────────

describe('an observation yields only the outcome it proves', () => {
  it('MUTATION — a lost response must NOT become FAILED', () => {
    // The bug this whole PR exists to prevent: today's drain turns every throw
    // into retry-or-failed, so a timeout after dispatch would assert the side
    // effect did not happen.
    expect(outcomeForObservation('response_lost', 'DISPATCH_STARTED')).toBe('UNKNOWN')
    expect(outcomeForObservation('response_lost', 'DISPATCH_STARTED')).not.toBe('FAILED')
  })

  it('maps each observation honestly', () => {
    const cases: [DispatchObservation, ActionOutcome][] = [
      ['not_dispatched', 'FAILED'],
      ['remote_rejected', 'FAILED'],
      ['response_lost', 'UNKNOWN'],
      ['partially_applied', 'PARTIAL'],
      ['confirmed_evidence_failed', 'SUCCEEDED_EVIDENCE_PENDING'],
      ['remote_confirmed', 'SUCCEEDED'],
    ]
    for (const [obs, expected] of cases) {
      expect(outcomeForObservation(obs, 'PREPARED')).toBe(expected)
    }
  })

  it('refuses to believe "not dispatched" once the phase says otherwise', () => {
    // A caller that mis-reports is corrected toward the safe answer, not trusted.
    expect(outcomeForObservation('not_dispatched', 'DISPATCH_STARTED')).toBe('UNKNOWN')
  })
})

// ── Retry ───────────────────────────────────────────────────────────────────

describe('retry policy', () => {
  it('MUTATION — no WRITE-CAPABLE class may auto-retry an ambiguous outcome', () => {
    // Narrowed deliberately in PR9e-0: READ_ONLY is the sole exception, because
    // repeating an observation has no side effect. Every class that can change
    // the world still refuses, and PARTIAL refuses for everyone — a partial
    // observation is not a lost one, something concluded.
    for (const cls of [...MATERIAL, 'REVERSIBLE_WRITE'] as const) {
      for (const outcome of ['UNKNOWN', 'PARTIAL'] as const) {
        const d = decideRetry(cls, outcome, 1)
        expect(d.retry, `${cls}/${outcome} must never auto-retry`).toBe(false)
        expect(d.reason).toMatch(/reconcile|already have been applied/)
      }
    }
    expect(decideRetry('READ_ONLY', 'PARTIAL', 1).retry).toBe(false)
    // The one exception, bounded by the attempt budget.
    expect(decideRetry('READ_ONLY', 'UNKNOWN', 1).retry).toBe(true)
    expect(decideRetry('READ_ONLY', 'UNKNOWN', 5).retry).toBe(false)
  })

  it('ambiguity on anything but READ_ONLY demands a human', () => {
    for (const cls of MATERIAL) {
      const d = decideRetry(cls, 'UNKNOWN', 1)
      expect(d.retry).toBe(false)
      expect((d as { requiresHuman: boolean }).requiresHuman).toBe(true)
    }
  })

  it('allows retry ONLY for a pre-dispatch failure with budget left', () => {
    expect(decideRetry('READ_ONLY', 'FAILED', 1, 'not_dispatched').retry).toBe(true)
    // Same outcome, but we cannot prove nothing was sent.
    expect(decideRetry('READ_ONLY', 'FAILED', 1, 'response_lost').retry).toBe(false)
    // Material classes have maxAttempts 1, so even a clean pre-dispatch failure
    // has no budget — a second attempt is a human decision.
    expect(decideRetry('MATERIAL_WRITE', 'FAILED', 1, 'not_dispatched').retry).toBe(false)
  })

  it('never retries a semantic no, and never repeats a success', () => {
    expect(decideRetry('READ_ONLY', 'FAILED', 1, 'remote_rejected').retry).toBe(false)
    for (const o of ['SUCCEEDED', 'SUCCEEDED_EVIDENCE_PENDING'] as const) {
      const d = decideRetry('MATERIAL_WRITE', o, 1)
      expect(d.retry).toBe(false)
      expect(d.reason).toMatch(/already happened|duplicate/)
    }
  })

  it('freezes the workflow for ambiguity and for pending evidence', () => {
    expect(freezesWorkflow('MATERIAL_WRITE', 'UNKNOWN')).toBe(true)
    expect(freezesWorkflow('FINANCIAL', 'PARTIAL')).toBe(true)
    expect(freezesWorkflow('MATERIAL_WRITE', 'SUCCEEDED_EVIDENCE_PENDING')).toBe(true)
    expect(freezesWorkflow('READ_ONLY', 'UNKNOWN')).toBe(false)
    expect(freezesWorkflow('MATERIAL_WRITE', 'SUCCEEDED')).toBe(false)
  })
})

// ── Outcome state machine ───────────────────────────────────────────────────

describe('outcome transitions', () => {
  it('MUTATION — UNKNOWN → SUCCEEDED without reconciliation is refused', () => {
    const r = isLegalOutcomeTransition('UNKNOWN', 'SUCCEEDED', NO_REC)
    expect(r.ok).toBe(false)
    expect((r as { refusal: string }).refusal).toBe('requires_reconciliation')
    expect(isLegalOutcomeTransition('UNKNOWN', 'SUCCEEDED', OK).ok).toBe(true)
  })

  it('PARTIAL never widens to SUCCEEDED, even with reconciliation', () => {
    // Learning that more landed than you thought does not mean all of it did.
    const r = isLegalOutcomeTransition('PARTIAL', 'SUCCEEDED', OK)
    expect(r.ok).toBe(false)
    expect((r as { refusal: string }).refusal).toBe('partial_cannot_widen_to_succeeded')
  })

  it('terminal outcomes are absorbing', () => {
    for (const from of ['SUCCEEDED', 'FAILED', 'CANCELLED', 'REJECTED'] as const) {
      expect(isLegalOutcomeTransition(from, 'UNKNOWN', OK).ok).toBe(false)
    }
  })

  it('evidence catching up is legal and needs no reconciliation', () => {
    expect(isLegalOutcomeTransition('SUCCEEDED_EVIDENCE_PENDING', 'SUCCEEDED', NO_REC).ok).toBe(true)
  })

  it('MUTATION — CANCELLED after dispatch is refused', () => {
    // Cancellation cannot un-send a message.
    const r = isLegalOutcomeTransition(null, 'CANCELLED', { ...NO_REC, phase: 'DISPATCH_STARTED' })
    expect(r.ok).toBe(false)
    expect((r as { refusal: string }).refusal).toBe('cancelled_illegal_after_dispatch')
    expect(isLegalOutcomeTransition(null, 'CANCELLED', { ...NO_REC, phase: 'PREPARED' }).ok).toBe(true)
  })
})

// ── Reconciliation ──────────────────────────────────────────────────────────

describe('reconciliation', () => {
  it('resolves only in the directions it proves', () => {
    expect(resolutionFor('CONFIRMED_SUCCEEDED', 'UNKNOWN')).toBe('SUCCEEDED')
    expect(resolutionFor('CONFIRMED_NOT_APPLIED', 'UNKNOWN')).toBe('FAILED')
    expect(resolutionFor('CONFIRMED_PARTIAL', 'UNKNOWN')).toBe('PARTIAL')
    // Not knowing is a valid answer; it must leave the incident where it was.
    expect(resolutionFor('STILL_UNKNOWN', 'UNKNOWN')).toBeNull()
    expect(resolutionFor('CONFIRMED_SUCCEEDED', 'PARTIAL')).toBeNull()
  })

  it('only a confirmed non-application permits a fresh attempt', () => {
    expect(permitsFreshAttempt('CONFIRMED_NOT_APPLIED')).toBe(true)
    for (const r of ['CONFIRMED_SUCCEEDED', 'CONFIRMED_PARTIAL', 'STILL_UNKNOWN'] as const) {
      expect(permitsFreshAttempt(r)).toBe(false)
    }
  })

  it('is read-only: it never repairs, retries or deletes', () => {
    const src = readFileSync(join(process.cwd(), 'lib/workflows/reconciliation.ts'), 'utf8')
    for (const w of [/\.delete\(/, /\.update\(/, /\.rpc\(/, /fetch\(/]) expect(src).not.toMatch(w)
    // The only write is the append of the fact itself.
    expect([...src.matchAll(/\.insert\(/g)]).toHaveLength(1)
  })

  it('the ledger is append-only and identity-bound in SQL', () => {
    expect(sqlCode).toMatch(/before update or delete on public\.workflow_action_reconciliations/)
    const guard = sqlCode.slice(sqlCode.indexOf('function public.reconciliation_binding_guard'))
      .replace(/[ \t]+/g, ' ')
    for (const f of ['workflow_instance_id', 'action_kind', 'target_version_hash', 'idempotency_key']) {
      expect(guard).toMatch(new RegExp(`new\\.${f} is distinct from r\\.${f}`))
    }
  })
})

// ── Reaper (the most important invariant) ───────────────────────────────────

describe('reaper', () => {
  const reaper = sqlCode.slice(sqlCode.indexOf('function omnira_cron.reap_stuck_runs'))

  it('MUTATION — must NOT requeue a bound action past DISPATCH_STARTED', () => {
    // Requeuing after dispatch means performing the side effect twice.
    expect(reaper).toMatch(/status\s*=\s*'unknown'/)
    expect(reaper).toMatch(/action_outcome\s*=\s*'UNKNOWN'/)
    expect(reaper).toMatch(/reconciliation_required\s*=\s*true/)
    expect(reaper).toMatch(/action_phase_rank\(action_phase\) >= 3/)
  })

  it('still requeues pre-dispatch bound actions and all legacy runs', () => {
    expect(reaper).toMatch(/workflow_instance_id is null or public\.action_phase_rank\(action_phase\) < 3/)
    expect(reaper).toMatch(/case when attempts >= max_attempts then 'failed' else 'pending' end/)
  })

  it('an ambiguous run can never be claimed again', () => {
    // claim_runs only takes status='pending'; 'unknown'/'partial' are terminal.
    expect(sqlCode).toMatch(/'unknown','partial'/)
  })
})

// ── Idempotency preservation ────────────────────────────────────────────────

describe('idempotency identity', () => {
  it('MUTATION — UNKNOWN/PARTIAL must NOT release the identity', () => {
    // PR9c's partial index releases only on cancelled/rejected, so an ambiguous
    // run keeps its identity by construction. This asserts that shape survives.
    const pr9c = readFileSync(join(process.cwd(),
      'supabase/migrations/20260830_workflow_action_binding.sql'), 'utf8')
    expect(pr9c).toMatch(/status not in \('cancelled','rejected'\)/)
    expect(pr9c).not.toMatch(/status not in \([^)]*'unknown'/)
    expect(pr9c).not.toMatch(/status not in \([^)]*'partial'/)
  })

  it('ambiguity always carries the reconciliation flag', () => {
    expect(sqlCode).toMatch(/action_outcome not in \('UNKNOWN','PARTIAL'\)\s*or reconciliation_required = true/)
  })
})

// ── Escalation ──────────────────────────────────────────────────────────────

describe('escalation', () => {
  it('ambiguity on anything that touches the world is CRITICAL', () => {
    for (const cls of MATERIAL) {
      expect(severityForActionOutcome(cls, 'UNKNOWN')).toBe('critical')
      expect(severityForActionOutcome(cls, 'PARTIAL')).toBe('critical')
    }
    expect(severityForActionOutcome('EXTERNAL_COMMUNICATION', 'UNKNOWN')).toBe('critical')
  })

  it('pending evidence is HIGH — the world is right, our audit is behind', () => {
    expect(severityForActionOutcome('MATERIAL_WRITE', 'SUCCEEDED_EVIDENCE_PENDING')).toBe('high')
  })

  it('a read-only transient failure is not an emergency', () => {
    expect(severityForActionOutcome('READ_ONLY', 'FAILED')).toBe('normal')
    expect(severityForActionOutcome('READ_ONLY', 'UNKNOWN')).toBe('normal')
  })

  it('reuses the existing severity vocabulary, inventing none', () => {
    const all = [...MATERIAL, 'READ_ONLY', 'REVERSIBLE_WRITE'].flatMap(c =>
      ['UNKNOWN','PARTIAL','FAILED','SUCCEEDED','SUCCEEDED_EVIDENCE_PENDING']
        .map(o => severityForActionOutcome(c, o)))
    expect([...new Set(all)].sort()).toEqual(['critical', 'high', 'normal'])
  })

  it('the signal key binds the action identity so repeats do not spam', () => {
    const k = actionIncidentSignalKey('a'.repeat(64), 'UNKNOWN')
    expect(actionIncidentSignalKey('a'.repeat(64), 'UNKNOWN')).toBe(k)      // stable
    expect(actionIncidentSignalKey('b'.repeat(64), 'UNKNOWN')).not.toBe(k)  // distinct act
    expect(k).not.toContain('a'.repeat(64))                                  // prefix only
  })
})

// ── Scope ───────────────────────────────────────────────────────────────────

describe('scope', () => {
  it('the model is pure — no db, clock or network', () => {
    const pure = readFileSync(join(process.cwd(), 'lib/workflows/action-outcome.ts'), 'utf8')
    for (const w of [/createAdminClient/, /fetch\(/, /Date\.now\(\)/, /new Date\(/, /from\('/]) {
      expect(pure).not.toMatch(w)
    }
  })

  it('registers no workflow definition and flips no flag', () => {
    expect(sqlCode).not.toMatch(/insert into public\.workflow_defs/)
    expect(sqlCode).not.toMatch(/H1_POLICY_GATE|H1_SPEND_GATE/)
  })
})
