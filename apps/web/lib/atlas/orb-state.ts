import type { VoicePhase } from './runtime'
import {
  getAtlasServiceErrorMessage,
  isAtlasServiceErrorCode,
} from './provider-errors'

export const ATLAS_ORB_STATES = [
  'idle',
  'listening',
  'thinking',
  'speaking',
  'executing',
  'awaiting_approval',
  'warning',
] as const

export type AtlasOrbState = (typeof ATLAS_ORB_STATES)[number]

export interface AtlasOrbRuntimeSignal {
  active: boolean
  code?: string
  detail?: string
  toolName?: string
}

export interface AtlasOrbCompletionEvent {
  id: number
  toolName?: string
}

export interface AtlasOrbSignals {
  voicePhase: VoicePhase
  executing?: AtlasOrbRuntimeSignal | null
  awaitingApproval?: AtlasOrbRuntimeSignal | null
  warning?: AtlasOrbRuntimeSignal | null
}

export interface AtlasOrbVisualParameters {
  particleBudget: number
  orbitSpeed: number
  energy: number
  cyan: number
  blue: number
  violet: number
}

export const ATLAS_ACTION_TOOL_NAMES = new Set([
  'trigger_workflow',
  'delegate',
  'run_media_step',
  'save_workflow',
  'delegate_dream_finding',
  'resolve_dream_finding',
])

export type AtlasToolOutcome =
  | { kind: 'awaiting_approval'; detail?: string }
  | { kind: 'warning'; detail: string }
  | { kind: 'completed' }

export const ATLAS_ORB_STATE_LABELS: Record<AtlasOrbState, string> = {
  idle: 'Redo för text eller röst',
  listening: 'Lyssnar',
  thinking: 'Tänker',
  speaking: 'Svarar',
  executing: 'Utför ett uppdrag',
  awaiting_approval: 'Väntar på ditt godkännande',
  warning: 'Behöver din uppmärksamhet',
}

export const ATLAS_ORB_VISUAL_PARAMETERS: Record<AtlasOrbState, AtlasOrbVisualParameters> = {
  idle: { particleBudget: 12, orbitSpeed: 0.12, energy: 0.34, cyan: 1, blue: 0.46, violet: 0.18 },
  listening: { particleBudget: 22, orbitSpeed: 0.2, energy: 0.68, cyan: 1, blue: 0.34, violet: 0.12 },
  thinking: { particleBudget: 38, orbitSpeed: 0.58, energy: 0.78, cyan: 0.62, blue: 1, violet: 0.72 },
  speaking: { particleBudget: 28, orbitSpeed: 0.28, energy: 0.74, cyan: 0.78, blue: 0.72, violet: 1 },
  executing: { particleBudget: 42, orbitSpeed: 0.78, energy: 0.92, cyan: 1, blue: 0.76, violet: 0.42 },
  awaiting_approval: { particleBudget: 18, orbitSpeed: 0.08, energy: 0.58, cyan: 0.42, blue: 0.52, violet: 0.92 },
  warning: { particleBudget: 14, orbitSpeed: 0.06, energy: 0.7, cyan: 0.14, blue: 0.28, violet: 0.38 },
}

/**
 * Single semantic boundary between runtime evidence and presentation.
 * Interruptions outrank concurrent voice phases; speaking outranks an action
 * while audible output is active so the orb remains truthfully audio-reactive.
 */
export function resolveAtlasOrbState(signals: AtlasOrbSignals): AtlasOrbState {
  if (signals.warning?.active) return 'warning'
  if (signals.awaitingApproval?.active) return 'awaiting_approval'
  if (signals.voicePhase === 'speaking') return 'speaking'
  if (signals.executing?.active) return 'executing'
  if (signals.voicePhase === 'listening') return 'listening'
  if (signals.voicePhase === 'thinking') return 'thinking'
  return 'idle'
}

export function isAtlasOrbState(value: string | null | undefined): value is AtlasOrbState {
  return !!value && (ATLAS_ORB_STATES as readonly string[]).includes(value)
}

export function interpretAtlasToolResult(result: Record<string, unknown> | null): AtlasToolOutcome {
  if (result?.needs_confirmation === true) {
    return {
      kind: 'awaiting_approval',
      detail: typeof result.message === 'string' ? result.message : undefined,
    }
  }
  if (result && ('error' in result || result.ok === false)) {
    return {
      kind: 'warning',
      detail: typeof result.error === 'string' ? result.error : 'Uppdraget kunde inte slutföras.',
    }
  }
  return { kind: 'completed' }
}

/**
 * Provider failures cross the server/client boundary as stable codes. Raw SDK
 * messages stay server-side so configuration details never become UI copy.
 */
export function resolveAtlasServiceWarning(code: unknown): AtlasOrbRuntimeSignal {
  if (isAtlasServiceErrorCode(code)) {
    return {
      active: true,
      code,
      detail: getAtlasServiceErrorMessage(code),
    }
  }

  return {
    active: true,
    code: 'ATLAS_UNKNOWN_SERVICE_ERROR',
    detail: 'Atlas kunde inte slutföra svaret just nu.',
  }
}
