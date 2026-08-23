import { describe, expect, it, vi } from 'vitest'
import { AtlasAudioAnalyser, AtlasAudioLevelStore, normalizeAudioSamples } from '@/lib/atlas/audio-analysis'
import { resolveAtlasOrbQuality } from '@/lib/atlas/orb-quality'
import {
  ATLAS_ACTION_TOOL_NAMES,
  interpretAtlasToolResult,
  resolveAtlasServiceWarning,
  resolveAtlasOrbState,
  type AtlasOrbSignals,
} from '@/lib/atlas/orb-state'

function signals(overrides: Partial<AtlasOrbSignals> = {}): AtlasOrbSignals {
  return { voicePhase: 'idle', ...overrides }
}

describe('Atlas orb semantic resolver', () => {
  it('maps every canonical voice/runtime state without a permanent completed state', () => {
    expect(resolveAtlasOrbState(signals())).toBe('idle')
    expect(resolveAtlasOrbState(signals({ voicePhase: 'listening' }))).toBe('listening')
    expect(resolveAtlasOrbState(signals({ voicePhase: 'thinking' }))).toBe('thinking')
    expect(resolveAtlasOrbState(signals({ voicePhase: 'speaking' }))).toBe('speaking')
    expect(resolveAtlasOrbState(signals({ executing: { active: true } }))).toBe('executing')
    expect(resolveAtlasOrbState(signals({ awaitingApproval: { active: true } }))).toBe('awaiting_approval')
    expect(resolveAtlasOrbState(signals({ warning: { active: true } }))).toBe('warning')
  })

  it('uses deterministic interruption and concurrent-work precedence', () => {
    expect(resolveAtlasOrbState(signals({
      voicePhase: 'speaking',
      executing: { active: true },
    }))).toBe('speaking')
    expect(resolveAtlasOrbState(signals({
      voicePhase: 'speaking',
      executing: { active: true },
      awaitingApproval: { active: true },
    }))).toBe('awaiting_approval')
    expect(resolveAtlasOrbState(signals({
      voicePhase: 'speaking',
      awaitingApproval: { active: true },
      warning: { active: true },
    }))).toBe('warning')
  })

  it('only classifies side-effecting tools as execution evidence', () => {
    expect(ATLAS_ACTION_TOOL_NAMES.has('trigger_workflow')).toBe(true)
    expect(ATLAS_ACTION_TOOL_NAMES.has('run_media_step')).toBe(true)
    expect(ATLAS_ACTION_TOOL_NAMES.has('get_records')).toBe(false)
    expect(ATLAS_ACTION_TOOL_NAMES.has('navigate')).toBe(false)
  })
})

describe('Atlas action result interpretation', () => {
  it('turns a real publish confirmation gate into awaiting approval', () => {
    expect(interpretAtlasToolResult({
      needs_confirmation: true,
      message: 'Bekräfta publicering.',
    })).toEqual({ kind: 'awaiting_approval', detail: 'Bekräfta publicering.' })
  })

  it('turns failed action evidence into a warning', () => {
    expect(interpretAtlasToolResult({ ok: false, error: 'Körningen misslyckades.' })).toEqual({
      kind: 'warning',
      detail: 'Körningen misslyckades.',
    })
  })

  it('models successful completion as an event outcome, not a state', () => {
    expect(interpretAtlasToolResult({ run_id: 'run-1', status: 'queued' })).toEqual({ kind: 'completed' })
  })
})

describe('Atlas provider error boundary', () => {
  it('maps stable service codes to safe UI copy', () => {
    expect(resolveAtlasServiceWarning('ATLAS_PROVIDER_NOT_CONFIGURED')).toEqual({
      active: true,
      code: 'ATLAS_PROVIDER_NOT_CONFIGURED',
      detail: 'Atlas AI-leverantör är inte konfigurerad i servermiljön.',
    })
    expect(resolveAtlasServiceWarning('ATLAS_TTS_NOT_CONFIGURED').detail).toContain('svarade i text')
  })

  it('never forwards an unknown provider message into the UI', () => {
    expect(resolveAtlasServiceWarning('Could not resolve authentication method')).toEqual({
      active: true,
      code: 'ATLAS_UNKNOWN_SERVICE_ERROR',
      detail: 'Atlas kunde inte slutföra svaret just nu.',
    })
  })
})

describe('Atlas orb quality tiers', () => {
  const desktop = {
    reducedMotion: false,
    canvasSupported: true,
    viewportWidth: 1440,
    devicePixelRatio: 2,
    hardwareConcurrency: 8,
    saveData: false,
  }

  it('selects enhanced desktop, balanced mobile, fallback, and reduced motion', () => {
    expect(resolveAtlasOrbQuality(desktop)).toBe('enhanced')
    expect(resolveAtlasOrbQuality({ ...desktop, viewportWidth: 390 })).toBe('balanced')
    expect(resolveAtlasOrbQuality({ ...desktop, canvasSupported: false })).toBe('fallback')
    expect(resolveAtlasOrbQuality({ ...desktop, reducedMotion: true })).toBe('reduced')
  })
})

describe('Atlas Web Audio lifecycle', () => {
  it('normalizes amplitude and clamps silence to zero', () => {
    expect(normalizeAudioSamples(new Uint8Array(32).fill(128))).toBe(0)
    expect(normalizeAudioSamples(new Uint8Array(32).fill(255))).toBeLessThanOrEqual(1)
    expect(normalizeAudioSamples(new Uint8Array(32).fill(255))).toBeGreaterThan(0.9)
  })

  it('connects, samples, disconnects, resets, and closes cleanly', async () => {
    let frameCallback: FrameRequestCallback | null = null
    const source = { connect: vi.fn(), disconnect: vi.fn() }
    const analyser = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      frequencyBinCount: 32,
      connect: vi.fn(),
      disconnect: vi.fn(),
      getByteTimeDomainData: vi.fn((samples: Uint8Array) => samples.fill(180)),
    }
    const context = {
      state: 'running',
      destination: {},
      resume: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createAnalyser: vi.fn(() => analyser),
      createMediaElementSource: vi.fn(() => source),
    }
    const cancelFrame = vi.fn()
    const store = new AtlasAudioLevelStore()
    const controller = new AtlasAudioAnalyser({
      store,
      createContext: () => context as any,
      requestFrame: (callback) => { frameCallback = callback; return 17 },
      cancelFrame,
    })

    await expect(controller.connect({} as HTMLAudioElement)).resolves.toBe(true)
    expect(source.connect).toHaveBeenCalledWith(analyser)
    expect(analyser.connect).toHaveBeenCalledWith(context.destination)
    expect(frameCallback).not.toBeNull()
    ;(frameCallback as unknown as FrameRequestCallback)(16)
    expect(store.getSnapshot()).toBeGreaterThan(0)

    controller.disconnect()
    expect(cancelFrame).toHaveBeenCalledWith(17)
    expect(source.disconnect).toHaveBeenCalled()
    expect(analyser.disconnect).toHaveBeenCalled()
    expect(store.getSnapshot()).toBe(0)

    await controller.dispose()
    expect(context.close).toHaveBeenCalledTimes(1)
  })
})
