/**
 * The recorded adapter: a complete Level-1 port that invents nothing.
 *
 * Two claims are worth more than the rest here, and both are about what the
 * harness REFUSES to do: a transcript gap never becomes an empty success, and
 * no method answers from anything other than the authored transcript.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { failure, ok, type ExecutionProviderAdapter } from '../provider'
import type { AccountId } from '../ids'
import { createRecordedExecutionProviderAdapter } from './recorded-adapter'
import type { RecordedTranscript } from './transcript'
import {
  ACCOUNT_BOUND,
  ACCOUNT_OTHER,
  BATCH_OBSERVED_AT,
  CONTRACT_NQ,
  OCCURRED_AT,
  recordedPosition,
  transcriptWithPositions,
} from './recorded-fixture'

const POSITIONS: RecordedTranscript['positions'] = [
  { accountId: ACCOUNT_BOUND, response: ok([recordedPosition({ positionId: 'p1' })]) },
]

function adapter(): ExecutionProviderAdapter {
  return createRecordedExecutionProviderAdapter(transcriptWithPositions(POSITIONS))
}

/**
 * The fifteen methods, by name.
 *
 * Written out rather than derived from the interface, because a list generated
 * from the type under test would agree with that type no matter what it said.
 */
const LEVEL_1_METHODS = [
  'connect', 'disconnect', 'getProviderIdentity', 'getEnvironment', 'getCapabilities',
  'getHealth', 'getProviderTime', 'getAccounts', 'getAccountSnapshot', 'resolveContract',
  'getContractSnapshot', 'getPositions', 'getWorkingOrders', 'getRecentFills',
  'reconcileReadOnlyState',
] as const

describe('the recorded adapter implements the whole Level-1 port', () => {
  it('exposes exactly the fifteen methods, all callable', () => {
    const instance = adapter() as unknown as Record<string, unknown>
    for (const name of LEVEL_1_METHODS) {
      expect(typeof instance[name], name).toBe('function')
    }
    expect(LEVEL_1_METHODS).toHaveLength(15)
    // Nothing beyond the port. An extra method would be provider surface the
    // contract never granted.
    expect(Object.keys(instance).sort()).toEqual([...LEVEL_1_METHODS].sort())
  })

  it('declares no execution method, under any spelling', () => {
    const instance = adapter() as unknown as Record<string, unknown>
    for (const forbidden of [
      'submitOrder', 'modifyOrder', 'cancelOrder', 'replaceOrder', 'flatten',
      'closePosition', 'preflightOrder', 'placeOrder', 'sendOrder', 'createOrder',
    ]) {
      expect(instance[forbidden], forbidden).toBeUndefined()
    }
  })

  it('answers every method from the transcript', async () => {
    const a = adapter()
    expect((await a.getEnvironment())).toEqual(ok('development'))
    expect((await a.getHealth()).ok).toBe(true)
    expect((await a.getProviderIdentity()).ok).toBe(true)
    expect((await a.getCapabilities()).ok).toBe(true)
    expect((await a.getProviderTime()).ok).toBe(true)
    expect((await a.getAccounts()).ok).toBe(true)
    expect((await a.connect({
      providerId: 'ignored' as never,
      environment: 'development',
      credentialSecretRef: 'ref',
    })).ok).toBe(true)
    expect((await a.getAccountSnapshot(ACCOUNT_BOUND)).ok).toBe(true)
    expect((await a.getContractSnapshot(CONTRACT_NQ)).ok).toBe(true)
    expect((await a.getWorkingOrders(ACCOUNT_BOUND)).ok).toBe(true)
    expect((await a.reconcileReadOnlyState(ACCOUNT_BOUND)).ok).toBe(true)
    await expect(a.disconnect()).resolves.toBeUndefined()
  })
})

describe('a transcript gap fails closed', () => {
  /*
   * THE POINT OF THIS WHOLE BLOCK. An unrecorded account must not be able to
   * produce `ok([])`, because that is the positive claim "known flat" — the one
   * answer a harness has no standing to invent.
   */
  it('never answers an unrecorded account with an empty success', async () => {
    const a = adapter()
    const positions = await a.getPositions(ACCOUNT_OTHER)
    expect(positions.ok).toBe(false)
    if (!positions.ok) expect(positions.error.reasonCode).toBe('REFERENCE_MISMATCH')
  })

  it('fails for every keyed method on an unrecorded reference', async () => {
    const a = adapter()
    const unrecorded = 'acct-nowhere' as AccountId
    expect((await a.getAccountSnapshot(unrecorded)).ok).toBe(false)
    expect((await a.getWorkingOrders(unrecorded)).ok).toBe(false)
    expect((await a.reconcileReadOnlyState(unrecorded)).ok).toBe(false)
    expect((await a.getContractSnapshot('contract-nowhere' as never)).ok).toBe(false)
  })

  /*
   * The locked harness-local semantics, pinned in one place.
   *
   * Every clause of the decision is asserted here so that a later change to any
   * one of them is a failing test rather than a quiet drift: it fails closed, it
   * fails as a value rather than an exception, it uses an EXISTING reason code,
   * and its message is operator text that nothing branches on.
   */
  it('answers a transcript gap with exactly the locked harness semantics', async () => {
    const a = adapter()

    // 1. It does not throw — the port's failures are Result values.
    const result = await a.getPositions(ACCOUNT_OTHER)

    // 2. It is a failure, not a success.
    expect(result.ok).toBe(false)

    // 3. It is not an empty success, which would claim known-flat.
    expect(result).not.toEqual(ok([]))

    if (result.ok) throw new Error('unreachable')

    // 4. The reason code is the existing Core one; no new code was minted.
    expect(result.error.reasonCode).toBe('REFERENCE_MISMATCH')

    // 5. The message describes the recorded-harness gap and names the
    //    reference, and claims nothing about the provider's state.
    expect(result.error.message).toContain('Inget inspelat svar')
    for (const overclaim of ['disconnected', 'flat', 'no exposure', 'does not exist']) {
      expect(result.error.message.toLowerCase()).not.toContain(overclaim)
    }
  })

  it('never branches on a provider message anywhere in the package', () => {
    // Decision input is the discriminant and the reason code. If any module
    // compared, matched or parsed `error.message`, prose would have become a
    // decision — the one thing the adapter contract forbids outright.
    const dir = new URL('.', import.meta.url).pathname
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const text = readFileSync(join(dir, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
      for (const pattern of [
        /\.message\s*===/, /\.message\s*!==/, /\.message\.(includes|match|startsWith|indexOf|test)/,
        /switch\s*\(\s*[\w.]*\.message/,
      ]) {
        expect(text, `${file} branches on a provider message`).not.toMatch(pattern)
      }
    }
  })

  it('resolves a contract only by exact recorded symbol, never by prefix', async () => {
    const a = adapter()
    const exact = await a.resolveContract({
      instrumentId: 'instr-nq' as never,
      canonicalSymbol: 'NQ',
      expiration: { state: 'UNKNOWN' },
      providerSymbol: { state: 'UNKNOWN' },
    })
    expect(exact.ok).toBe(true)

    // 'NQZ6' starts with 'NQ'. A front-month or prefix rule would resolve it;
    // GATE-08 is open, so nothing here may.
    const prefixed = await a.resolveContract({
      instrumentId: 'instr-nq' as never,
      canonicalSymbol: 'NQZ6',
      expiration: { state: 'UNKNOWN' },
      providerSymbol: { state: 'UNKNOWN' },
    })
    expect(prefixed.ok).toBe(false)
  })
})

describe('recorded fill history answers only the window it recorded', () => {
  it('returns the recording for the exact recorded window', async () => {
    const result = await adapter().getRecentFills(ACCOUNT_BOUND, {
      from: OCCURRED_AT,
      to: BATCH_OBSERVED_AT,
    })
    expect(result.ok).toBe(true)
  })

  it('refuses a different window rather than misreporting coverage', async () => {
    const result = await adapter().getRecentFills(ACCOUNT_BOUND, {
      from: '2020-01-01T00:00:00.000Z' as never,
      to: BATCH_OBSERVED_AT,
    })
    expect(result.ok).toBe(false)
  })

  it('refuses a cursored request, since no paging is recorded', async () => {
    const result = await adapter().getRecentFills(ACCOUNT_BOUND, {
      from: OCCURRED_AT,
      to: BATCH_OBSERVED_AT,
      cursor: 'page-2',
    })
    expect(result.ok).toBe(false)
  })
})

describe('determinism', () => {
  it('returns deeply equal results for repeated identical reads', async () => {
    const a = adapter()
    const first = await a.getPositions(ACCOUNT_BOUND)
    const second = await a.getPositions(ACCOUNT_BOUND)
    expect(second).toEqual(first)
  })

  it('does not depend on the order methods are called in', async () => {
    const forward = adapter()
    const positionsFirst = await forward.getPositions(ACCOUNT_BOUND)
    await forward.getHealth()
    await forward.disconnect()

    const backward = adapter()
    await backward.disconnect()
    await backward.getHealth()
    const positionsLast = await backward.getPositions(ACCOUNT_BOUND)

    expect(positionsLast).toEqual(positionsFirst)
  })

  it('holds no mutable state of its own', () => {
    // Only the fifteen methods; no cursor, no cache, no session field that a
    // later read could depend on.
    const instance = adapter() as unknown as Record<string, unknown>
    const nonFunction = Object.keys(instance).filter((k) => typeof instance[k] !== 'function')
    expect(nonFunction).toEqual([])
  })

  it('two adapters over equal transcripts answer equally', async () => {
    const one = createRecordedExecutionProviderAdapter(transcriptWithPositions(POSITIONS))
    const two = createRecordedExecutionProviderAdapter(transcriptWithPositions(POSITIONS))
    expect(await two.getPositions(ACCOUNT_BOUND)).toEqual(await one.getPositions(ACCOUNT_BOUND))
    expect(await two.getCapabilities()).toEqual(await one.getCapabilities())
  })
})

describe('recorded failure is carried structurally', () => {
  it('passes a recorded provider failure through unchanged', async () => {
    const transcript = transcriptWithPositions([
      {
        accountId: ACCOUNT_BOUND,
        response: failure('PROVIDER_DISCONNECTED', 'Providern svarade inte.'),
      },
    ])
    const result = await createRecordedExecutionProviderAdapter(transcript)
      .getPositions(ACCOUNT_BOUND)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('PROVIDER_DISCONNECTED')
      expect(result.error.message).toBe('Providern svarade inte.')
    }
  })

  it('records known flat as a successful empty array', async () => {
    const transcript = transcriptWithPositions([
      { accountId: ACCOUNT_BOUND, response: ok([]) },
    ])
    const result = await createRecordedExecutionProviderAdapter(transcript)
      .getPositions(ACCOUNT_BOUND)
    expect(result).toEqual(ok([]))
  })
})
