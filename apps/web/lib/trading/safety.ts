/**
 * Omnira Trading Core — kill switches and execution health.
 *
 * Canonical source:
 *  - Systemarkitektur v0.1 §27 (kill switch levels), §28 (heartbeat and health), §26 (fail closed)
 *  - Datamodell v0.1 §53 (KillSwitchState)
 *  - Risk Engine Specification v0.1 §48–50, §55 (kept in force by Canonical v1.0 §7)
 *
 * INVARIANTS:
 *  - A kill switch at ANY relevant scope blocks new execution. Scopes are not
 *    ranked against each other; the most restrictive answer wins.
 *  - Health is tri-state. An unreachable runner is UNKNOWN, not "healthy".
 *  - Lost heartbeat blocks new execution (Systemarkitektur §28).
 *  - Stopping new trades and force-closing exposure are different actions
 *    (Risk Canonical v1.0 §4.3). Nothing here closes a position.
 */

import { type Verdict } from './authority'
import type { AccountId, InstrumentId, KillSwitchId, RunnerId, StrategyVersionId } from './ids'
import type { Timestamp } from './time'

// ─── Kill switch ──────────────────────────────────────────────────────────────

/** The scopes at which trading can be halted (Systemarkitektur §27, Datamodell §53). */
export const KILL_SWITCH_SCOPES = ['GLOBAL', 'ACCOUNT', 'STRATEGY', 'INSTRUMENT', 'RUNNER'] as const
export type KillSwitchScope = (typeof KILL_SWITCH_SCOPES)[number]

/** One kill switch record. A GLOBAL switch carries no scopeId. */
export interface KillSwitch {
  readonly killSwitchId: KillSwitchId
  readonly scopeType: KillSwitchScope
  readonly scopeId: string | null
  readonly active: boolean
  readonly reason: string
  readonly activatedBy: string
  readonly activatedAt: Timestamp
  readonly clearedBy: string | null
  readonly clearedAt: Timestamp | null
}

/** The set of switches relevant to one execution attempt. */
export interface KillSwitchSnapshot {
  readonly switches: readonly KillSwitch[]
  readonly observedAt: Timestamp
}

/** What an execution attempt is scoped to, for kill-switch matching. */
export interface KillSwitchTarget {
  readonly accountId: AccountId
  readonly instrumentId: InstrumentId
  readonly strategyVersionId: StrategyVersionId
  readonly runnerId: RunnerId
}

/**
 * Find the first active kill switch blocking this target, or null.
 *
 * A switch matches when it is GLOBAL, or when its scopeId equals the target's
 * identifier for that scope. A scoped switch with a null scopeId is treated as
 * matching — a malformed record must not become a silent permit.
 */
export function findBlockingKillSwitch(
  snapshot: KillSwitchSnapshot,
  target: KillSwitchTarget,
): KillSwitch | null {
  for (const sw of snapshot.switches) {
    if (!sw.active) continue
    switch (sw.scopeType) {
      case 'GLOBAL':
        return sw
      case 'ACCOUNT':
        if (sw.scopeId === null || sw.scopeId === target.accountId) return sw
        break
      case 'INSTRUMENT':
        if (sw.scopeId === null || sw.scopeId === target.instrumentId) return sw
        break
      case 'STRATEGY':
        if (sw.scopeId === null || sw.scopeId === target.strategyVersionId) return sw
        break
      case 'RUNNER':
        if (sw.scopeId === null || sw.scopeId === target.runnerId) return sw
        break
    }
  }
  return null
}

/** True when any active kill switch blocks this target. */
export function isKillSwitchActive(
  snapshot: KillSwitchSnapshot,
  target: KillSwitchTarget,
): boolean {
  return findBlockingKillSwitch(snapshot, target) !== null
}

// ─── Execution health ─────────────────────────────────────────────────────────

/**
 * Observed health of the execution path (Systemarkitektur §28).
 *
 * Every field is a Verdict rather than a boolean so that "we have not heard from
 * the runner" is representable as UNKNOWN and cannot collapse into `false`,
 * which downstream code is tempted to read as "not a problem".
 */
export interface ExecutionHealth {
  readonly runnerId: RunnerId
  readonly runnerOnline: Verdict
  readonly brokerConnected: Verdict
  readonly accountSynchronized: Verdict
  readonly reconciliationComplete: Verdict
  readonly lastHeartbeatAt: Timestamp | null
  readonly observedAt: Timestamp
}

/**
 * Aggregate health into a single verdict.
 *
 * Every component must be ALLOW for the whole to be ALLOW. A missing heartbeat
 * yields UNKNOWN, never ALLOW — losing the heartbeat blocks new execution.
 */
export function healthVerdict(health: ExecutionHealth): Verdict {
  if (health.lastHeartbeatAt === null) return 'UNKNOWN'
  const parts: readonly Verdict[] = [
    health.runnerOnline,
    health.brokerConnected,
    health.accountSynchronized,
    health.reconciliationComplete,
  ]
  if (parts.includes('DENY')) return 'DENY'
  if (parts.includes('UNKNOWN')) return 'UNKNOWN'
  return 'ALLOW'
}
