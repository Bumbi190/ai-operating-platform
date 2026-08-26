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

    await expect(controller.prepare({} as HTMLAudioElement)).resolves.toBe('routed')
    // Output before observation: the source reaches destination directly, and
    // the analyser hangs off it as a tap. Routing the analyser onward as well
    // would double the signal, and making it the only route to destination is
    // what let a failed analyser silence the speech.
    expect(source.connect).toHaveBeenCalledWith(context.destination)
    expect(source.connect).toHaveBeenCalledWith(analyser)
    expect(analyser.connect).not.toHaveBeenCalled()
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

describe('Atlas Web Audio graph · audible output outranks visualisation', () => {
  function harness(overrides: Record<string, unknown> = {}) {
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
      ...overrides,
    }
    const controller = new AtlasAudioAnalyser({
      store: new AtlasAudioLevelStore(),
      createContext: () => context as any,
      requestFrame: () => 1,
      cancelFrame: vi.fn(),
    })
    return { controller, context, source, analyser }
  }

  // ── Captured, with a working output path ────────────────────────────────────

  it('stays routed when analyser creation fails after destination exists', async () => {
    const { controller, context, source } = harness({
      createAnalyser: vi.fn(() => { throw new Error('analyser unavailable') }),
    })

    // The whole point of the reorder: visualisation died, speech did not.
    await expect(controller.prepare({} as HTMLAudioElement)).resolves.toBe('routed')
    expect(source.connect).toHaveBeenCalledWith(context.destination)
  })

  // ── Never captured — ordinary playback is still correct ─────────────────────

  it('reports direct when no AudioContext can be created', async () => {
    const controller = new AtlasAudioAnalyser({
      store: new AtlasAudioLevelStore(),
      createContext: () => { throw new Error('Web Audio is unavailable') },
      requestFrame: () => 1,
      cancelFrame: vi.fn(),
    })

    await expect(controller.prepare({} as HTMLAudioElement)).resolves.toBe('direct')
  })

  it('reports direct when a suspended context never resumes', async () => {
    vi.useFakeTimers()
    try {
      const { controller, context } = harness({
        state: 'suspended',
        // Chrome's real behaviour under autoplay policy: never settles.
        resume: vi.fn(() => new Promise<void>(() => {})),
      })

      const pending = controller.prepare({} as HTMLAudioElement)
      await vi.advanceTimersByTimeAsync(2_000)

      // direct, NOT unusable: the element is untouched, so Atlas can still be
      // heard. A Web Audio timeout must never become a speech failure.
      await expect(pending).resolves.toBe('direct')
      expect(context.createMediaElementSource).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports direct when resume rejects', async () => {
    const { controller, context } = harness({
      state: 'suspended',
      resume: vi.fn(async () => { throw new Error('resume refused') }),
    })

    await expect(controller.prepare({} as HTMLAudioElement)).resolves.toBe('direct')
    expect(context.createMediaElementSource).not.toHaveBeenCalled()
  })

  it('reports direct when resume settles but the context stays suspended', async () => {
    const { controller, context } = harness({
      state: 'suspended',
      resume: vi.fn(async () => undefined),
    })

    await expect(controller.prepare({} as HTMLAudioElement)).resolves.toBe('direct')
    expect(context.createMediaElementSource).not.toHaveBeenCalled()
  })

  it('reports direct when capture throws without taking the element', async () => {
    // Per spec no node is created, so the element was never rerouted.
    const { controller } = harness({
      createMediaElementSource: vi.fn(() => { throw new Error('not supported') }),
    })

    await expect(controller.prepare({} as HTMLAudioElement)).resolves.toBe('direct')
  })

  // ── Captured with nowhere to go — the only case that must not play ──────────

  it('reports unusable when the element is already owned by a source node', async () => {
    // Every segment builds a fresh element, so InvalidStateError is anomalous.
    // We cannot claim this element reaches the speakers, so we say so.
    const invalidState = Object.assign(new Error('already connected'), { name: 'InvalidStateError' })
    const { controller } = harness({
      createMediaElementSource: vi.fn(() => { throw invalidState }),
    })

    await expect(controller.prepare({} as HTMLAudioElement)).resolves.toBe('unusable')
  })

  it('reports unusable when a captured element cannot reach destination', async () => {
    const source = {
      connect: vi.fn(() => { throw new Error('cannot route') }),
      disconnect: vi.fn(),
    }
    const { controller } = harness({ createMediaElementSource: vi.fn(() => source) })

    await expect(controller.prepare({} as HTMLAudioElement)).resolves.toBe('unusable')
    expect(source.disconnect).toHaveBeenCalled()
  })
})
