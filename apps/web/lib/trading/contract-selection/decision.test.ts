/**
 * ContractSelectionDecision — materialisation behaviour.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §9
 *  - Contract Selection Reason Code Canonical v1.0 (Beslut J)
 *  - Contract Selection Decision Materialisation Canonical v1.0 (Beslut K)
 *
 * The fixtures here are deliberately MUTABLE. A frozen fixture would make the
 * defensive-copy assertions vacuous: they would pass against an implementation
 * that simply kept the caller's reference, because the caller's object could
 * never change anyway. Everything the materializer must detach from is built
 * mutable on purpose, then mutated after the fact.
 *
 * Nothing here calls `resolveContractAt`. The materializer's contract is with
 * the resolution TYPE, and reaching for the resolver would test the calendar
 * instead of the thing under test.
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import type { ContractLifecycle } from '../contract-calendar'
import { contractCycle, resolvedContract, type QuarterMonth } from '../contract-identity'
import { asId } from '../ids'
import type { ContractSelectionDecisionId, ProposalId } from '../ids'
import type { MarketInstrument } from '../market-instrument'
import { asTimestamp, type Timestamp } from '../time'
import {
  CONTRACT_SELECTION_POLICY_VERSION,
  materializeContractSelectionDecision,
  type ContractEvidence,
  type ContractSelectionDecision,
  type MaterializeContractSelectionDecisionInput,
  type ResolvedContractResolution,
} from './decision'

// ─── Mutable fixtures ─────────────────────────────────────────────────────────

interface MutableCycle {
  year: number
  quarterMonth: QuarterMonth
}
interface MutableContract {
  root: MarketInstrument
  cycle: MutableCycle
}
interface MutableResolution {
  outcome: 'RESOLVED'
  contract: MutableContract
  lifecycle: ContractLifecycle
  effectiveFrom: Timestamp
  effectiveTo: Timestamp
  calendarVersion: string
}

const FROM = asTimestamp('2026-03-13T18:00:00Z')
const TO = asTimestamp('2026-06-12T18:00:00Z')
const DECIDED_AT = asTimestamp('2026-09-03T12:00:00.250Z')
const DECISION_ID = asId<'ContractSelectionDecisionId'>('11111111-2222-4333-8444-555555555555')

function mutableResolution(): MutableResolution {
  return {
    outcome: 'RESOLVED',
    contract: { root: 'NQ', cycle: { year: 2026, quarterMonth: 6 } },
    lifecycle: {
      contract: resolvedContract('NQ', contractCycle(2026, 6)),
      lastTradeAt: asTimestamp('2026-06-18T13:30:00Z'),
      finalSettlementRef: 'CME final settlement 2026-06-18',
      rollEffectiveAt: FROM,
      calendarVersion: 'fixture-v1',
    },
    effectiveFrom: FROM,
    effectiveTo: TO,
    calendarVersion: 'fixture-v1',
  }
}

function materialize(
  resolution: MutableResolution = mutableResolution(),
  decisionId: ContractSelectionDecisionId = DECISION_ID,
  decidedAt: Timestamp = DECIDED_AT,
): ContractSelectionDecision {
  return materializeContractSelectionDecision({
    resolution: resolution as unknown as ResolvedContractResolution,
    decisionId,
    decidedAt,
  })
}

// ─── §9 shape and derivation ──────────────────────────────────────────────────

describe('the canonical §9 record', () => {
  it('A. carries exactly the ten canonical fields', () => {
    const decision = materialize()
    expect(Object.keys(decision).sort()).toEqual(
      [
        'calendarVersion', 'decidedAt', 'decisionId', 'effectiveFrom', 'effectiveTo',
        'evidence', 'policyVersion', 'reasons', 'resolvedContract', 'root',
      ].sort(),
    )
  })

  it('B. copies decisionId exactly from the caller', () => {
    expect(materialize().decisionId).toBe(DECISION_ID)
  })

  it('C. derives root from resolution.contract.root', () => {
    const resolution = mutableResolution()
    resolution.contract.root = 'ES'
    expect(materialize(resolution).root).toBe('ES')
  })

  it('D. root and resolvedContract.root can never describe different contracts', () => {
    const decision = materialize()
    expect(decision.root).toBe(decision.resolvedContract.root)
  })

  it('E. resolvedContract is structurally equal to the resolution contract', () => {
    const decision = materialize()
    expect(decision.resolvedContract).toEqual({ root: 'NQ', cycle: { year: 2026, quarterMonth: 6 } })
  })

  it('F. copies effectiveFrom byte-exact, without normalisation', () => {
    const resolution = mutableResolution()
    resolution.effectiveFrom = asTimestamp('2026-03-13T18:00:00.000Z')
    // A normalising implementation would drop `.000`; the record must not.
    expect(materialize(resolution).effectiveFrom).toBe('2026-03-13T18:00:00.000Z')
  })

  it('G. copies effectiveTo byte-exact and never emits null', () => {
    const decision = materialize()
    expect(decision.effectiveTo).toBe(TO)
    expect(decision.effectiveTo).not.toBeNull()
  })

  it('H. copies calendarVersion exactly, preserving spelling', () => {
    const resolution = mutableResolution()
    resolution.calendarVersion = 'CME-2026-Q2_rev.3'
    expect(materialize(resolution).calendarVersion).toBe('CME-2026-Q2_rev.3')
  })

  it('I. sets policyVersion to the locked constant, never the calendar version', () => {
    const decision = materialize()
    expect(decision.policyVersion).toBe('market-data-contract-lifecycle-v1.0')
    expect(decision.policyVersion).toBe(CONTRACT_SELECTION_POLICY_VERSION)
    expect(decision.policyVersion).not.toBe(decision.calendarVersion)
  })

  it('J. emits exactly the empty evidence array', () => {
    const decision = materialize()
    expect(decision.evidence).toEqual([])
    expect(decision.evidence).toHaveLength(0)
  })

  it('K. emits exactly one canonical reason', () => {
    const decision = materialize()
    expect(decision.reasons).toHaveLength(1)
    expect(decision.reasons[0].code).toBe('CONTRACT_SELECTED_BY_CANONICAL_CALENDAR')
  })

  it('L. does not smuggle the versions into the reason detail', () => {
    const [only] = materialize().reasons
    expect(only.detail).toBeUndefined()
    expect(JSON.stringify(only)).not.toContain('market-data-contract-lifecycle')
    expect(JSON.stringify(only)).not.toContain('fixture-v1')
  })

  it('M. copies decidedAt byte-exact, including sub-second precision', () => {
    expect(materialize().decidedAt).toBe('2026-09-03T12:00:00.250Z')
  })
})

// ─── Immutability ─────────────────────────────────────────────────────────────

describe('a materialised decision is immutable', () => {
  it('N. the decision itself is frozen', () => {
    expect(Object.isFrozen(materialize())).toBe(true)
  })

  it('O. resolvedContract is frozen', () => {
    expect(Object.isFrozen(materialize().resolvedContract)).toBe(true)
  })

  it('P. the contract cycle is frozen', () => {
    expect(Object.isFrozen(materialize().resolvedContract.cycle)).toBe(true)
  })

  it('Q. reasons is frozen', () => {
    expect(Object.isFrozen(materialize().reasons)).toBe(true)
  })

  it('R. evidence is frozen', () => {
    expect(Object.isFrozen(materialize().evidence)).toBe(true)
  })

  it('S. every Reason is frozen', () => {
    for (const r of materialize().reasons) expect(Object.isFrozen(r)).toBe(true)
  })

  it('T. a fresh evidence array is built per call, never a shared mutable one', () => {
    const a = materialize()
    const b = materialize()
    expect(a.evidence).not.toBe(b.evidence)
    expect(a.reasons).not.toBe(b.reasons)
  })
})

// ─── Caller detachment ────────────────────────────────────────────────────────

describe('the decision is detached from the caller', () => {
  it('U. does not mutate the input', () => {
    const resolution = mutableResolution()
    const before = JSON.stringify(resolution)
    materialize(resolution)
    expect(JSON.stringify(resolution)).toBe(before)
  })

  it('V. does not freeze the caller objects as a side effect', () => {
    const resolution = mutableResolution()
    materialize(resolution)
    expect(Object.isFrozen(resolution)).toBe(false)
    expect(Object.isFrozen(resolution.contract)).toBe(false)
    expect(Object.isFrozen(resolution.contract.cycle)).toBe(false)
  })

  it('W. a later caller mutation cannot reach inside the decision', () => {
    const resolution = mutableResolution()
    const decision = materialize(resolution)

    resolution.contract.cycle.year = 2099
    resolution.contract.cycle.quarterMonth = 12
    resolution.contract.root = 'MNQ'
    resolution.calendarVersion = 'tampered'

    expect(decision.resolvedContract.cycle.year).toBe(2026)
    expect(decision.resolvedContract.cycle.quarterMonth).toBe(6)
    expect(decision.resolvedContract.root).toBe('NQ')
    expect(decision.root).toBe('NQ')
    expect(decision.calendarVersion).toBe('fixture-v1')
  })

  it('X. the decision holds no reference to the caller contract object', () => {
    const resolution = mutableResolution()
    const decision = materialize(resolution)
    expect(decision.resolvedContract).not.toBe(resolution.contract)
    expect(decision.resolvedContract.cycle).not.toBe(resolution.contract.cycle)
  })
})

// ─── Determinism ──────────────────────────────────────────────────────────────

describe('materialisation is deterministic', () => {
  it('Y. equivalent inputs produce structurally equal decisions', () => {
    expect(materialize()).toEqual(materialize())
  })

  it('Z. repeated calls differ only where the inputs differ', () => {
    const other = asId<'ContractSelectionDecisionId'>('99999999-8888-4777-8666-555555555555')
    const a = materialize()
    const b = materialize(mutableResolution(), other)
    expect(b.decisionId).toBe(other)
    expect({ ...b, decisionId: a.decisionId }).toEqual(a)
  })
})

// ─── What a decision is not ───────────────────────────────────────────────────

describe('a decision carries no price, provider or authority concept', () => {
  it('AA. the serialised record names no provider or price concept', () => {
    const serialised = JSON.stringify(materialize())
    for (const forbidden of [
      'provider', 'symbol', 'frontMonth', 'volume', 'openInterest', 'price',
      'clearance', 'grant', 'intent', 'order',
    ]) {
      expect(serialised.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
  })
})

// ─── Type-level guarantees ────────────────────────────────────────────────────

/*
 * These are enforced by `tsc --noEmit`. tsconfig includes every .ts file, this
 * one among them, so a wrong type here fails the typecheck — NOT vitest.
 * `expectTypeOf` is deliberately not used: this project has no `typecheck`
 * block in vitest.config.ts, so its assertions would be erased at runtime and
 * would pass no matter what the types actually said.
 */
type Expect<T extends true> = T
type Equals<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false

type EvidenceIsNever = Expect<Equals<ContractEvidence, never>>
type EvidenceArrayHoldsNothing = Expect<Equals<ContractSelectionDecision['evidence'], readonly never[]>>
type InputResolutionIsResolvedOnly = Expect<
  Equals<MaterializeContractSelectionDecisionInput['resolution'], ResolvedContractResolution>
>
type InputHasExactlyThreeKeys = Expect<
  Equals<keyof MaterializeContractSelectionDecisionInput, 'resolution' | 'decisionId' | 'decidedAt'>
>
type ResolutionEffectiveToIsFinite = Expect<Equals<ResolvedContractResolution['effectiveTo'], Timestamp>>
type RecordEffectiveToStaysNullable = Expect<
  Equals<ContractSelectionDecision['effectiveTo'], Timestamp | null>
>
type DecisionIdIsBranded = Expect<
  Equals<ContractSelectionDecision['decisionId'], ContractSelectionDecisionId>
>

describe('type-level guarantees (enforced by tsc --noEmit)', () => {
  it('AB. evidence is uninhabited, input is RESOLVED-only and exactly three keys', () => {
    const proof: [
      EvidenceIsNever,
      EvidenceArrayHoldsNothing,
      InputResolutionIsResolvedOnly,
      InputHasExactlyThreeKeys,
      ResolutionEffectiveToIsFinite,
      RecordEffectiveToStaysNullable,
      DecisionIdIsBranded,
    ] = [true, true, true, true, true, true, true]
    expect(proof).toHaveLength(7)
  })

  it('AC. the record keeps §9 nullability even though this materializer never emits null', () => {
    // The historical shape must describe decisions this slice does not mint.
    const widened: ContractSelectionDecision['effectiveTo'] = null
    expect(widened).toBeNull()
    expect(materialize().effectiveTo).not.toBeNull()
  })

  it('AD. a REFUSED resolution is unrepresentable as materializer input', () => {
    const refused = { outcome: 'REFUSED' as const, refusal: 'NO_AUTHORITATIVE_COVERAGE' as const }
    expect(() =>
      materializeContractSelectionDecision({
        // @ts-expect-error — REFUSED is not assignable to ResolvedContractResolution
        resolution: refused,
        decisionId: DECISION_ID,
        decidedAt: DECIDED_AT,
      }),
    ).toThrow()
  })

  it('AE. the caller cannot supply canonical metadata', () => {
    const base = {
      resolution: mutableResolution() as unknown as ResolvedContractResolution,
      decisionId: DECISION_ID,
      decidedAt: DECIDED_AT,
    }
    const decision = materializeContractSelectionDecision({
      ...base,
      // @ts-expect-error — policyVersion is owned by the materializer
      policyVersion: 'market-data-contract-lifecycle-v9.9',
    })
    // Even smuggled past the type system, the constant wins.
    expect(decision.policyVersion).toBe(CONTRACT_SELECTION_POLICY_VERSION)
  })

  it('AF. evidence and reasons are likewise not caller inputs', () => {
    /*
     * One excess property per call. TypeScript reports only the FIRST unknown
     * property of an object literal, so two directives in one literal would
     * leave the second silently unverified — and `tsc` flags that as an unused
     * @ts-expect-error rather than letting it pass unnoticed.
     */
    const base = () => ({
      resolution: mutableResolution() as unknown as ResolvedContractResolution,
      decisionId: DECISION_ID,
      decidedAt: DECIDED_AT,
    })

    const withEvidence = materializeContractSelectionDecision({
      ...base(),
      // @ts-expect-error — evidence is locked empty by Beslut K §5
      evidence: [{ kind: 'FRONT_MONTH' }],
    })
    const withReasons = materializeContractSelectionDecision({
      ...base(),
      // @ts-expect-error — reasons are minted here, never supplied
      reasons: [],
    })

    // Even smuggled past the type system, the canonical values win.
    expect(withEvidence.evidence).toEqual([])
    expect(withReasons.reasons).toHaveLength(1)
    expect(withReasons.reasons[0].code).toBe('CONTRACT_SELECTED_BY_CANONICAL_CALENDAR')
  })

  it('AG. ContractSelectionDecisionId is a distinct brand', () => {
    const proposal = asId<'ProposalId'>('11111111-2222-4333-8444-555555555555')
    // @ts-expect-error — a ProposalId is not a ContractSelectionDecisionId
    const wrong: ContractSelectionDecisionId = proposal
    expect(wrong).toBe(proposal)
    const right: ProposalId = proposal
    expect(right).toBe(proposal)
  })
})

// ─── Canonical coupling ───────────────────────────────────────────────────────

/**
 * The runtime constant and the canonical document must move together.
 *
 * The canon manifest already notices that the document CHANGED; what it cannot
 * notice is whether the document still says this exact literal. Without this
 * test a developer could quietly bump the runtime policy version and leave the
 * canon behind, producing historical records that name a policy no document
 * defines.
 */
describe('the policy version is backed by canonical text', () => {
  const DOCS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../docs/trading-system')
  const read = (rel: string): string => readFileSync(join(DOCS, rel), 'utf8')
  const MATERIALISATION =
    'specifications/market-data/Omnira Trading System – Contract Selection Decision Materialisation – Canonical v1.0.md'

  it('AH. the canonical ruling locks this exact literal', () => {
    const ruling = read(MATERIALISATION)
    expect(ruling).toContain(CONTRACT_SELECTION_POLICY_VERSION)
    expect(ruling).toContain('market-data-contract-lifecycle-v1.0')
  })

  it('AI. the runtime constant is exactly the canonical literal', () => {
    expect(CONTRACT_SELECTION_POLICY_VERSION).toBe('market-data-contract-lifecycle-v1.0')
  })

  it('AJ. the ruling still locks the semantics the materializer relies on', () => {
    const ruling = read(MATERIALISATION)
    expect(ruling).toContain('ContractEvidence = never')
    expect(ruling).toContain('evidence: []')
    expect(ruling).toContain('Materializern äger konstanten. Anroparen får inte lämna in den')
    expect(ruling).toContain('Materializern myntar den inte.')
    expect(ruling).toContain('anroparlämnad `Timestamp`')
    expect(ruling).toContain('får aldrig uppfinna `null`')
  })

  it('AK. Beslut K records the amendment and does not move the gate', () => {
    const amendments = read('reviews/Canonical Amendments v1.0.md')
    expect(amendments).toContain('## Beslut K — Materialiseringssemantik för ContractSelectionDecision')
    expect(amendments).toContain('market-data-contract-lifecycle-v1.0')
    expect(amendments).toContain('GATE-08 flyttas **inte**')
  })

  it('AL. SOURCE_OF_TRUTH registers the canonical source', () => {
    const sot = read('SOURCE_OF_TRUTH.md')
    expect(sot).toContain('Contract Selection Decision Materialisation – Canonical v1.0.md')
    expect(sot).toContain('market-data-contract-lifecycle-v1.0')
  })

  it('AM. the journal vocabulary gap is still recorded as open', () => {
    const ruling = read(MATERIALISATION)
    expect(ruling).toContain('DECISION-JOURNAL VOCABULARY GAP')
    expect(ruling).toContain('NONEMPTY-EVIDENCE VOCABULARY GAP')
  })
})
