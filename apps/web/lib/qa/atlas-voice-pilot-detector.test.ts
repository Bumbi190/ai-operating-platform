import { describe, expect, it, vi } from 'vitest'
import { createSpeechFrameProcessor } from '@/lib/atlas/voice-pilot/speech-detector'

describe('local speech inference lifecycle', () => {
  it('preserves samples across irregular worklet frames and serializes recurrent inference', async () => {
    let resolve!: (p: number) => void
    const model = { process: vi.fn((_frame: Float32Array) => new Promise<number>(yes => { resolve = yes })), reset: vi.fn(), release: vi.fn(async () => {}) }
    const receive = vi.fn(), failed = vi.fn(), p = createSpeechFrameProcessor(model, receive, failed)
    p.push(new Float32Array(320).fill(1)); p.push(new Float32Array(320).fill(2)); p.push(new Float32Array(384).fill(3))
    expect(model.process).toHaveBeenCalledTimes(1)
    expect(Array.from(model.process.mock.calls[0][0] ?? [])).toEqual([...Array(320).fill(1), ...Array(192).fill(2)])
    resolve(0.8); await Promise.resolve()
    expect(model.process).toHaveBeenCalledTimes(2)
    resolve(0.1); await Promise.resolve()
    expect(receive.mock.calls.map(c => c[1])).toEqual([0.8, 0.1])
    expect(failed).not.toHaveBeenCalled(); p.stop(); expect(model.release).toHaveBeenCalledTimes(1)
  })
  it('discards in-flight and queued audio on correction, then resets the recurrent state before the next frame', async () => {
    let resolve!: (p: number) => void
    const model = { process: vi.fn((_frame: Float32Array) => new Promise<number>(yes => { resolve = yes })), reset: vi.fn(), release: vi.fn(async () => {}) }
    const receive = vi.fn(), p = createSpeechFrameProcessor(model, receive, vi.fn())
    p.push(new Float32Array(1024).fill(1)); p.reset(); p.push(new Float32Array(512).fill(2))
    resolve(0.95); await Promise.resolve()
    expect(receive).not.toHaveBeenCalled(); expect(model.reset).toHaveBeenCalledTimes(1)
    expect(model.process).toHaveBeenCalledTimes(2)
    resolve(0.7); await Promise.resolve()
    expect(receive).toHaveBeenCalledTimes(1); expect(receive.mock.calls[0][0][0]).toBe(2)
    p.stop()
  })
  it('releases only after in-flight inference settles and emits nothing after stop', async () => {
    let resolve!: (p: number) => void
    const model = { process: vi.fn((_frame: Float32Array) => new Promise<number>(yes => { resolve = yes })), reset: vi.fn(), release: vi.fn(async () => {}) }
    const receive = vi.fn(), p = createSpeechFrameProcessor(model, receive, vi.fn())
    p.push(new Float32Array(512)); p.stop(); p.stop()
    expect(model.release).not.toHaveBeenCalled()
    resolve(0.9); await Promise.resolve()
    expect(receive).not.toHaveBeenCalled(); expect(model.release).toHaveBeenCalledTimes(1)
  })
  it('fails visibly instead of accumulating a delayed conversation on a slow device', async () => {
    let resolve!: (p: number) => void
    const model = { process: vi.fn((_frame: Float32Array) => new Promise<number>(yes => { resolve = yes })), reset: vi.fn(), release: vi.fn(async () => {}) }
    const receive = vi.fn(), failed = vi.fn(), p = createSpeechFrameProcessor(model, receive, failed)
    p.push(new Float32Array(512)); p.push(new Float32Array(512 * 32))
    expect(failed).toHaveBeenCalledTimes(1)
    resolve(0.8); await Promise.resolve()
    expect(receive).not.toHaveBeenCalled(); expect(model.release).toHaveBeenCalledTimes(1)
  })
  it('reports a rejected inference once and releases its session', async () => {
    const model = { process: vi.fn(async (_frame: Float32Array) => { throw new Error('speech_detector_failed') }), reset: vi.fn(), release: vi.fn(async () => {}) }
    const receive = vi.fn(), failed = vi.fn(), p = createSpeechFrameProcessor(model, receive, failed)
    p.push(new Float32Array(512)); await Promise.resolve(); p.push(new Float32Array(512))
    expect(failed).toHaveBeenCalledTimes(1); expect(model.release).toHaveBeenCalledTimes(1); expect(receive).not.toHaveBeenCalled()
  })
})
