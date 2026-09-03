/**
 * Omnira Trading Core — the reason-code registry as a contract.
 *
 * Codes are stable and version-controlled: renaming one is a breaking change to
 * every historical journal row that used it. This suite exists so that
 * statement is enforced rather than merely written down.
 *
 * It was added with GATE-08C-3B.0, which registered the first contract-selection
 * code. Until then the registry was exercised only indirectly, through provider
 * and normalization tests — enough to prove the codes those paths emit, and not
 * enough to notice a rename, a duplicate, or a code placed in the wrong list.
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CORE_REASON_CODES,
  RISK_REASON_CODES,
  isReasonCode,
  reason,
  type CoreReasonCode,
  type ReasonCode,
} from './reason-codes'

const SELECTION = 'CONTRACT_SELECTED_BY_CANONICAL_CALENDAR'

// ─── GATE-08C-3B.0 — the contract-selection code ─────────────────────────────

describe('the canonical contract-selection reason code', () => {
  it('A. is recognised by the registry', () => {
    expect(isReasonCode(SELECTION)).toBe(true)
  })

  it('B. belongs to CORE_REASON_CODES', () => {
    /*
     * Contract selection is structural authority-chain and market-data
     * provenance, not a risk judgement.
     */
    expect(CORE_REASON_CODES).toContain(SELECTION)
    // …and it is typed as a core code, which a wrong list would break.
    const asCore: CoreReasonCode = SELECTION
    expect(asCore).toBe(SELECTION)
  })

  it('C. does NOT belong to RISK_REASON_CODES', () => {
    expect(RISK_REASON_CODES as readonly string[]).not.toContain(SELECTION)
  })

  it('A2. appears exactly once in the registry', () => {
    const all = [...RISK_REASON_CODES, ...CORE_REASON_CODES] as readonly string[]
    expect(all.filter((code) => code === SELECTION)).toHaveLength(1)
  })

  it('carries no failure counterpart', () => {
    /*
     * Success-only by ruling: without authoritative coverage the resolver
     * REFUSES and no decision is minted, so a failure code would describe a
     * journal row that never exists. The resolver's own
     * `NO_AUTHORITATIVE_COVERAGE` stays local caller-contract validation.
     */
    const all = [...RISK_REASON_CODES, ...CORE_REASON_CODES] as readonly string[]
    for (const absent of [
      'CONTRACT_SELECTION_FAILED',
      'CONTRACT_SELECTION_REFUSED',
      'CONTRACT_SELECTION_NO_COVERAGE',
      'CONTRACT_SELECTION_UNKNOWN',
      'NO_AUTHORITATIVE_COVERAGE',
    ]) {
      expect(all, `${absent} was invented`).not.toContain(absent)
    }
  })

  it('builds a frozen Reason whose code is the contract', () => {
    const built = reason(SELECTION, 'chosen from calendar v1')
    expect(built.code).toBe(SELECTION)
    expect(built.detail).toBe('chosen from calendar v1')
    expect(Object.isFrozen(built)).toBe(true)
    // Detail is non-normative and optional; the code is not.
    expect(reason(SELECTION).detail).toBeUndefined()
  })
})

// ─── Registry stability ──────────────────────────────────────────────────────

describe('the registry is a stable contract', () => {
  it('D/F. every historically registered code is still present, unrenamed', () => {
    /*
     * Spelled out rather than counted. A count would pass if one code were
     * renamed and another added; these strings are what historical journal rows
     * actually contain.
     */
    const risk: readonly string[] = [
      'RISK_ALLOWED', 'MAX_RISK_PER_TRADE_EXCEEDED', 'DAILY_LOSS_LIMIT', 'MAX_POSITION_LIMIT',
      'MINIMUM_CONTRACT_TOO_LARGE', 'MAX_ATTEMPTS_REACHED', 'SPREAD_TOO_HIGH', 'STALE_ACCOUNT_DATA',
      'STALE_MARKET_DATA', 'UNKNOWN_POSITION', 'KILL_SWITCH_ACTIVE', 'NEWS_BLOCK', 'SESSION_BLOCK',
      'INVALID_INSTRUMENT_STATE', 'EXECUTION_HEALTH_FAILURE', 'DAILY_STOP_ACTIVE',
      'RESERVED_RISK_EXCEEDED', 'NEWS_STATE_UNKNOWN',
    ]
    expect([...RISK_REASON_CODES]).toEqual(risk)

    const core: readonly string[] = [
      'STRATEGY_INVALID', 'EXECUTION_BLOCKED', 'MISSING_RISK_CLEARANCE', 'MISSING_PROP_CLEARANCE',
      'MISSING_APPROVAL_GRANT', 'RISK_DENIED', 'PROP_BLOCKED', 'AUTHORITY_NOT_GENUINE',
      'MISSING_RISK_DECISION_REFERENCE', 'MISSING_PROP_DECISION_REFERENCE',
      'RISK_DECISION_REFERENCE_MISMATCH', 'PROP_DECISION_REFERENCE_MISMATCH',
      'EXECUTION_INTENT_ALREADY_EXPIRED', 'EXECUTION_INTENT_OUTLIVES_PROPOSAL',
      'EXECUTION_INTENT_OUTLIVES_APPROVAL', 'VERDICT_UNKNOWN', 'PROPOSAL_EXPIRED',
      'APPROVAL_EXPIRED', 'PROPOSAL_ALREADY_EXECUTED', 'PROPOSAL_STATUS_INVALID',
      'KILL_SWITCH_ACTIVE', 'ENVIRONMENT_MISMATCH', 'ENVIRONMENT_UNKNOWN',
      'MODE_FORBIDS_EXECUTION', 'MODE_ENVIRONMENT_MISMATCH', 'PROVIDER_DISCONNECTED',
      'SECURITY_DEGRADED', 'PROVIDER_CONNECT_FAILED', 'PROVIDER_AUTHENTICATION_FAILED',
      'PROVIDER_CONNECTION_LOST', 'PROVIDER_HEARTBEAT_TIMEOUT', 'PROVIDER_PROTOCOL_ERROR',
      'PROVIDER_REMOTE_REJECTED', 'PROVIDER_SESSION_CANCELLED', 'PROVIDER_RECONNECT_EXHAUSTED',
      'PROVIDER_FAILURE_UNKNOWN',
      // GATE-08C-3B.0
      'CONTRACT_SELECTED_BY_CANONICAL_CALENDAR',
      'ACCOUNT_MISMATCH', 'INSTRUMENT_MISMATCH', 'STRATEGY_VERSION_MISMATCH', 'REFERENCE_MISMATCH',
    ]
    expect([...CORE_REASON_CODES]).toEqual(core)
  })

  it('G. neither list repeats a code', () => {
    /*
     * Scoped PER LIST, deliberately. `KILL_SWITCH_ACTIVE` is registered in both
     * RISK and CORE and has been since before this suite existed — a global
     * uniqueness assertion would fail on the registry as it stands, and
     * "fixing" that by removing one would be a breaking rename of a code that
     * historical rows carry. What must not happen is a list repeating itself.
     */
    for (const [name, list] of [
      ['RISK_REASON_CODES', RISK_REASON_CODES],
      ['CORE_REASON_CODES', CORE_REASON_CODES],
    ] as const) {
      expect(new Set(list).size, `${name} repeats a code`).toBe(list.length)
    }
  })

  it('rejects anything not registered', () => {
    for (const raw of ['', 'contract_selected_by_canonical_calendar', 'NOT_A_CODE', 42, null, undefined]) {
      expect(isReasonCode(raw), String(raw)).toBe(false)
    }
  })

  it('the union type admits both lists', () => {
    const fromRisk: ReasonCode = 'RISK_ALLOWED'
    const fromCore: ReasonCode = SELECTION
    expect(isReasonCode(fromRisk) && isReasonCode(fromCore)).toBe(true)
  })
})


// ─── The code is canonically governed, not merely present ────────────────────

/**
 * A registry entry with no canonical text behind it is a string someone liked.
 *
 * These assertions tie the runtime code to the documents that define it, so
 * deleting the ruling, the amendment entry or the index registration fails the
 * build rather than silently leaving `reason-codes.ts` as the only place the
 * meaning lives. The canon manifest already notices that those files CHANGED;
 * what it cannot notice is whether they still say this.
 */
describe('the code is backed by canonical text', () => {
  const DOCS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../docs/trading-system')
  const read = (rel: string): string => readFileSync(join(DOCS, rel), 'utf8')

  it('the canonical ruling exists and locks the exact code', () => {
    const ruling = read(
      'specifications/market-data/Omnira Trading System – Contract Selection Reason Code – Canonical v1.0.md',
    )
    expect(ruling).toContain(SELECTION)
    // The rulings that make the code safe to use.
    expect(ruling).toContain('Endast framgång')
    expect(ruling).toContain('bevis, aldrig utlösare')
    expect(ruling).toContain('Prospektiv verkan')
    expect(ruling).toContain('Ingen auktoritet')
  })

  it('Beslut J records the amendment', () => {
    const amendments = read('reviews/Canonical Amendments v1.0.md')
    expect(amendments).toContain('## Beslut J — Kanonisk reason code för kontraktsval')
    expect(amendments).toContain(SELECTION)
    // Beslut J must not be read as moving the gate.
    expect(amendments).toContain('GATE-08 flyttas **inte**')
  })

  it('SOURCE_OF_TRUTH registers the canonical source and holds the gate open', () => {
    const sot = read('SOURCE_OF_TRUTH.md')
    expect(sot).toContain('Contract Selection Reason Code – Canonical v1.0.md')
    expect(sot).toContain('GATE-08C REASON-CODE GAP')
    expect(sot).toContain('GATE-08 flyttas inte av Beslut J')
  })

  it('the specifications index lists it', () => {
    expect(read('specifications/README.md')).toContain('Contract Selection Reason Code')
  })
})
