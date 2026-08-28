import { describe, expect, it } from 'vitest'
import {
  AUTHORITY_MODES, VERDICTS, combineVerdicts, grantsPermission, isAuthorityMode,
  isVerdict, modeAllowsExecution, modeEnvironmentScope, modeRequiresManualApproval,
  parseAuthorityMode, resolveVerdict, type Verdict,
} from './authority'
import { healthVerdict, findBlockingKillSwitch, isKillSwitchActive } from './safety'
import type { ExecutionHealth, KillSwitch, KillSwitchSnapshot, KillSwitchTarget } from './safety'
import { asId } from './ids'
import type { AccountId, InstrumentId, KillSwitchId, RunnerId, StrategyVersionId } from './ids'
import { asTimestamp } from './time'

const NOW = asTimestamp('2026-08-27T10:00:00Z')

describe('verdicts', () => {
  it('has exactly three states — UNKNOWN is first-class, not a missing boolean', () => {
    expect([...VERDICTS]).toEqual(['ALLOW', 'DENY', 'UNKNOWN'])
  })

  it('grants permission only for an explicit ALLOW', () => {
    expect(grantsPermission('ALLOW')).toBe(true)
    expect(grantsPermission('DENY')).toBe(false)
    expect(grantsPermission('UNKNOWN')).toBe(false)
  })

  it('resolves anything unrecognized to UNKNOWN, never to ALLOW', () => {
    for (const bad of [undefined, null, '', 'allow', 'ALLOWED', 'true', true, 1, {}]) {
      expect(resolveVerdict(bad)).toBe('UNKNOWN')
    }
  })

  it('never lets an unknown value become permission', () => {
    for (const bad of [undefined, null, 'allow', 'yes', 1]) {
      expect(grantsPermission(resolveVerdict(bad))).toBe(false)
    }
  })

  it('recognizes only exact verdict spellings', () => {
    expect(isVerdict('ALLOW')).toBe(true)
    expect(isVerdict('Allow')).toBe(false)
  })
})

describe('combineVerdicts — Risk and Prop both hold veto', () => {
  it('requires every layer to allow', () => {
    expect(combineVerdicts(['ALLOW', 'ALLOW'])).toBe('ALLOW')
  })

  it('lets a single DENY block regardless of position', () => {
    expect(combineVerdicts(['DENY', 'ALLOW'])).toBe('DENY')
    expect(combineVerdicts(['ALLOW', 'DENY'])).toBe('DENY')
  })

  it('reports DENY ahead of UNKNOWN — an explicit refusal is more informative', () => {
    expect(combineVerdicts(['UNKNOWN', 'DENY'])).toBe('DENY')
  })

  it('propagates UNKNOWN rather than assuming', () => {
    expect(combineVerdicts(['ALLOW', 'UNKNOWN'])).toBe('UNKNOWN')
  })

  it('treats "nobody evaluated this" as UNKNOWN, not approval', () => {
    expect(combineVerdicts([])).toBe('UNKNOWN')
    expect(grantsPermission(combineVerdicts([]))).toBe(false)
  })

  it('never produces ALLOW from any input containing a non-ALLOW', () => {
    const cases: Verdict[][] = [
      ['ALLOW', 'ALLOW', 'UNKNOWN'],
      ['ALLOW', 'DENY', 'ALLOW'],
      ['UNKNOWN'],
      ['DENY'],
    ]
    for (const c of cases) expect(combineVerdicts(c)).not.toBe('ALLOW')
  })
})

describe('authority modes', () => {
  it('exposes the six canonical modes in escalating order', () => {
    expect([...AUTHORITY_MODES]).toEqual([
      'ANALYSIS_ONLY',
      'READ_ONLY',
      'DEMO_MANUAL_APPROVAL',
      'DEMO_AUTOMATION',
      'LIVE_MANUAL_APPROVAL',
      'LIVE_CONTROLLED_AUTOMATION',
    ])
  })

  it('forbids execution in analysis and read-only modes', () => {
    expect(modeAllowsExecution('ANALYSIS_ONLY')).toBe(false)
    expect(modeAllowsExecution('READ_ONLY')).toBe(false)
  })

  it('permits execution only from the demo and live tiers', () => {
    expect(modeAllowsExecution('DEMO_MANUAL_APPROVAL')).toBe(true)
    expect(modeAllowsExecution('DEMO_AUTOMATION')).toBe(true)
    expect(modeAllowsExecution('LIVE_MANUAL_APPROVAL')).toBe(true)
    expect(modeAllowsExecution('LIVE_CONTROLLED_AUTOMATION')).toBe(true)
  })

  it('marks the two manual-approval modes', () => {
    expect(modeRequiresManualApproval('DEMO_MANUAL_APPROVAL')).toBe(true)
    expect(modeRequiresManualApproval('LIVE_MANUAL_APPROVAL')).toBe(true)
    expect(modeRequiresManualApproval('DEMO_AUTOMATION')).toBe(false)
    expect(modeRequiresManualApproval('LIVE_CONTROLLED_AUTOMATION')).toBe(false)
  })

  it('scopes demo modes to demo and live modes to live', () => {
    expect(modeEnvironmentScope('DEMO_MANUAL_APPROVAL')).toBe('demo')
    expect(modeEnvironmentScope('DEMO_AUTOMATION')).toBe('demo')
    expect(modeEnvironmentScope('LIVE_MANUAL_APPROVAL')).toBe('live')
    expect(modeEnvironmentScope('LIVE_CONTROLLED_AUTOMATION')).toBe('live')
  })

  it('leaves analysis and read-only environment-agnostic', () => {
    expect(modeEnvironmentScope('ANALYSIS_ONLY')).toBeNull()
    expect(modeEnvironmentScope('READ_ONLY')).toBeNull()
  })

  it('has no default mode — unknown input fails closed to null', () => {
    for (const bad of [undefined, null, '', 'MODE_5', 'live', 5]) {
      expect(parseAuthorityMode(bad)).toBeNull()
    }
    expect(isAuthorityMode('LIVE_CONTROLLED_AUTOMATION')).toBe(true)
  })
})

// ─── Safety ───────────────────────────────────────────────────────────────────

const TARGET: KillSwitchTarget = {
  accountId: asId<'AccountId'>('acct-1') as AccountId,
  instrumentId: asId<'InstrumentId'>('MNQ') as InstrumentId,
  strategyVersionId: asId<'StrategyVersionId'>('sv-1') as StrategyVersionId,
  runnerId: asId<'RunnerId'>('runner-1') as RunnerId,
}

function sw(partial: Partial<KillSwitch>): KillSwitch {
  return {
    killSwitchId: asId<'KillSwitchId'>('ks-1') as KillSwitchId,
    scopeType: 'GLOBAL',
    scopeId: null,
    active: true,
    reason: 'test',
    activatedBy: 'operator',
    activatedAt: NOW,
    clearedBy: null,
    clearedAt: null,
    ...partial,
  }
}

function snapshot(switches: KillSwitch[]): KillSwitchSnapshot {
  return { switches, observedAt: NOW }
}

describe('kill switches', () => {
  it('lets a global switch block everything', () => {
    expect(isKillSwitchActive(snapshot([sw({ scopeType: 'GLOBAL' })]), TARGET)).toBe(true)
  })

  it('ignores inactive switches', () => {
    expect(isKillSwitchActive(snapshot([sw({ active: false })]), TARGET)).toBe(false)
  })

  it('blocks on a matching scoped switch only', () => {
    const mine = sw({ scopeType: 'ACCOUNT', scopeId: 'acct-1' })
    const other = sw({ scopeType: 'ACCOUNT', scopeId: 'acct-2' })
    expect(isKillSwitchActive(snapshot([mine]), TARGET)).toBe(true)
    expect(isKillSwitchActive(snapshot([other]), TARGET)).toBe(false)
  })

  it('blocks at every scope', () => {
    expect(isKillSwitchActive(snapshot([sw({ scopeType: 'INSTRUMENT', scopeId: 'MNQ' })]), TARGET)).toBe(true)
    expect(isKillSwitchActive(snapshot([sw({ scopeType: 'STRATEGY', scopeId: 'sv-1' })]), TARGET)).toBe(true)
    expect(isKillSwitchActive(snapshot([sw({ scopeType: 'RUNNER', scopeId: 'runner-1' })]), TARGET)).toBe(true)
  })

  it('treats a scoped switch with a null scopeId as blocking, not as a permit', () => {
    const malformed = sw({ scopeType: 'ACCOUNT', scopeId: null })
    expect(isKillSwitchActive(snapshot([malformed]), TARGET)).toBe(true)
  })

  it('reports which switch blocked, for the journal', () => {
    const blocking = findBlockingKillSwitch(
      snapshot([sw({ scopeType: 'INSTRUMENT', scopeId: 'MNQ', reason: 'data gap' })]),
      TARGET,
    )
    expect(blocking?.scopeType).toBe('INSTRUMENT')
    expect(blocking?.reason).toBe('data gap')
  })

  it('permits when nothing is active', () => {
    expect(findBlockingKillSwitch(snapshot([]), TARGET)).toBeNull()
  })
})

describe('execution health', () => {
  const healthy: ExecutionHealth = {
    runnerId: TARGET.runnerId,
    runnerOnline: 'ALLOW',
    brokerConnected: 'ALLOW',
    accountSynchronized: 'ALLOW',
    reconciliationComplete: 'ALLOW',
    lastHeartbeatAt: NOW,
    observedAt: NOW,
  }

  it('allows only when every component allows', () => {
    expect(healthVerdict(healthy)).toBe('ALLOW')
  })

  it('treats a missing heartbeat as UNKNOWN, never healthy', () => {
    expect(healthVerdict({ ...healthy, lastHeartbeatAt: null })).toBe('UNKNOWN')
    expect(grantsPermission(healthVerdict({ ...healthy, lastHeartbeatAt: null }))).toBe(false)
  })

  it('propagates DENY and UNKNOWN from any component', () => {
    expect(healthVerdict({ ...healthy, brokerConnected: 'DENY' })).toBe('DENY')
    expect(healthVerdict({ ...healthy, reconciliationComplete: 'UNKNOWN' })).toBe('UNKNOWN')
  })

  it('blocks while reconciliation is incomplete', () => {
    const v = healthVerdict({ ...healthy, reconciliationComplete: 'DENY' })
    expect(grantsPermission(v)).toBe(false)
  })
})
