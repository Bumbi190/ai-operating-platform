import { describe, expect, it } from 'vitest'
import { BoundedTaskQueue } from '@/lib/atlas/tts-queue'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('Atlas bounded TTS queue', () => {
  it('never exceeds the configured concurrency and preserves promise order', async () => {
    const queue = new BoundedTaskQueue<number>(2)
    const gates = [deferred<number>(), deferred<number>(), deferred<number>()]
    let active = 0
    let peak = 0
    const results = gates.map((gate, index) => queue.enqueue(async () => {
      active += 1
      peak = Math.max(peak, active)
      const value = await gate.promise
      active -= 1
      return value + index
    }))

    await Promise.resolve()
    expect(active).toBe(2)
    gates[1].resolve(20)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(active).toBe(2)
    gates[2].resolve(30)
    gates[0].resolve(10)

    const settled = await Promise.all(results)
    expect(peak).toBe(2)
    expect(settled.map(result => result.value)).toEqual([10, 21, 32])
  })

  it('cancels queued and active tasks without rejection leaks', async () => {
    const queue = new BoundedTaskQueue<string>(1)
    const first = queue.enqueue(signal => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')))
    }))
    const second = queue.enqueue(async () => 'never')
    queue.cancel()
    await expect(first).resolves.toEqual({ status: 'cancelled' })
    await expect(second).resolves.toEqual({ status: 'cancelled' })
  })

  it('contains a failed segment and continues with the next one', async () => {
    const queue = new BoundedTaskQueue<string>(1)
    const failed = queue.enqueue(async () => { throw new Error('provider failed') })
    const next = queue.enqueue(async () => 'audio-2')
    expect((await failed).status).toBe('failed')
    await expect(next).resolves.toEqual({ status: 'fulfilled', value: 'audio-2' })
  })
})
