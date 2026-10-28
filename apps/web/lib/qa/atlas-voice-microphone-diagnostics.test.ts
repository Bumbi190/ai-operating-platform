import { describe, expect, it, vi } from 'vitest'
import { createMicSignalMeter, createMicSignalStore, microphoneConstraints } from '@/lib/atlas/voice-pilot/mic-diagnostics'

describe('local microphone diagnostic signal', () => {
  it('reports real frame RMS, throttles updates, and clears immediately on reset', () => {
    let time = 0
    const emit = vi.fn()
    const meter = createMicSignalMeter(emit, () => time, 180)
    meter.observe(new Float32Array(512), 0.01)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenLastCalledWith({ level: 0, voiceProbability: 0.01 })
    time = 35
    meter.observe(new Float32Array(512).fill(0.02), 0.82)
    time = 90
    meter.observe(new Float32Array(512), 0.05)
    expect(emit).toHaveBeenCalledTimes(1)
    time = 185
    meter.observe(new Float32Array(512), 0.02)
    expect(emit).toHaveBeenCalledTimes(2)
    const measured = emit.mock.calls[1][0]
    expect(measured.level).toBeCloseTo(0.4)
    expect(measured.voiceProbability).toBeCloseTo(0.82)
    meter.reset()
    expect(emit).toHaveBeenLastCalledWith({ level: 0, voiceProbability: 0 })
  })
  it('clamps non-finite and over-range readings without retaining audio samples', () => {
    let time = 0
    const emit = vi.fn()
    const meter = createMicSignalMeter(emit, () => time)
    meter.observe(new Float32Array(512).fill(NaN), NaN)
    expect(emit).toHaveBeenLastCalledWith({ level: 0, voiceProbability: 0 })
    time = 200
    meter.observe(new Float32Array(512).fill(2), 4)
    expect(emit).toHaveBeenLastCalledWith({ level: 1, voiceProbability: 1 })
  })
  it('keeps only ephemeral numeric snapshots and updates subscribers without rerendering Atlas context', () => {
    const store = createMicSignalStore()
    const notify = vi.fn()
    const unsub = store.subscribe(notify)
    expect(store.getSnapshot()).toEqual({ level: 0, voiceProbability: 0 })
    const serverSnapshot = store.getServerSnapshot()
    store.update({ level: 0.32, voiceProbability: 0.9 })
    expect(store.getSnapshot()).toEqual({ level: 0.32, voiceProbability: 0.9 })
    expect(store.getServerSnapshot()).toBe(serverSnapshot)
    expect(notify).toHaveBeenCalledTimes(1)
    store.update({ level: 0.32, voiceProbability: 0.9 })
    expect(notify).toHaveBeenCalledTimes(1)
    store.reset()
    expect(notify).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot()).toEqual({ level: 0, voiceProbability: 0 })
    unsub()
    store.update({ level: 1, voiceProbability: 1 })
    expect(notify).toHaveBeenCalledTimes(2)
  })
  it('uses the browser default input unless the owner selects a specific device', () => {
    const defaultConstraints = microphoneConstraints('')
    expect(defaultConstraints).toMatchObject({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    })
    expect(defaultConstraints).not.toHaveProperty('deviceId')
    expect(microphoneConstraints('hyperx-identifier')).toMatchObject({
      deviceId: { exact: 'hyperx-identifier' },
    })
    expect(microphoneConstraints('x'.repeat(513))).not.toHaveProperty('deviceId')
  })
})
