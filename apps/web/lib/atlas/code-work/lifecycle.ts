/** SDF-1A pure lifecycle vocabulary. No state is stored by this module. */

import type { CodeWorkValidation } from './types'

export const CODE_WORK_NON_TERMINAL_STATES = [
  'proposed', 'authorized', 'claimed', 'preparing', 'working', 'testing',
] as const

export const CODE_WORK_TERMINAL_STATES = [
  'ready_for_human_review',
  'tests_failed',
  'scope_violation',
  'stale_base',
  'worker_failed',
  'cancelled',
  'timeout',
  'policy_denied',
] as const

export type CodeWorkNonTerminalState = (typeof CODE_WORK_NON_TERMINAL_STATES)[number]
export type CodeWorkTerminalState = (typeof CODE_WORK_TERMINAL_STATES)[number]
export type CodeWorkState = CodeWorkNonTerminalState | CodeWorkTerminalState

const TERMINAL = new Set<string>(CODE_WORK_TERMINAL_STATES)

const TRANSITIONS: Record<CodeWorkNonTerminalState, readonly CodeWorkState[]> = {
  proposed: ['authorized', 'cancelled', 'policy_denied'],
  authorized: ['claimed', 'stale_base', 'cancelled', 'timeout', 'policy_denied'],
  claimed: ['preparing', 'stale_base', 'cancelled', 'timeout', 'policy_denied'],
  preparing: ['working', 'stale_base', 'worker_failed', 'cancelled', 'timeout', 'policy_denied'],
  working: ['testing', 'scope_violation', 'stale_base', 'worker_failed', 'cancelled', 'timeout', 'policy_denied'],
  testing: [
    'working', 'ready_for_human_review', 'tests_failed', 'scope_violation', 'stale_base',
    'worker_failed', 'cancelled', 'timeout', 'policy_denied',
  ],
}

export function isCodeWorkState(value: unknown): value is CodeWorkState {
  return typeof value === 'string'
    && ([...CODE_WORK_NON_TERMINAL_STATES, ...CODE_WORK_TERMINAL_STATES] as readonly string[]).includes(value)
}

export function isTerminalCodeWorkState(value: unknown): value is CodeWorkTerminalState {
  return typeof value === 'string' && TERMINAL.has(value)
}

export function canTransitionCodeWork(from: unknown, to: unknown): boolean {
  if (!isCodeWorkState(from) || !isCodeWorkState(to) || isTerminalCodeWorkState(from)) return false
  return (TRANSITIONS[from] as readonly CodeWorkState[]).includes(to)
}

export function validateCodeWorkTransition(from: unknown, to: unknown): CodeWorkValidation<{
  from: CodeWorkState
  to: CodeWorkState
}> {
  if (!isCodeWorkState(from) || !isCodeWorkState(to)) {
    return { ok: false, violations: [{ path: 'state', code: 'unknown_state', detail: 'unknown lifecycle state' }] }
  }
  if (!canTransitionCodeWork(from, to)) {
    return { ok: false, violations: [{ path: 'state', code: 'illegal_transition', detail: `${from} -> ${to}` }] }
  }
  return { ok: true, value: { from, to } }
}
