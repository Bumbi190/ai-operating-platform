import { describe, expect, it, vi } from 'vitest'
import { consumeAtlasSse } from '@/lib/atlas/sse'

describe('Atlas SSE consumption', () => {
  it('delivers the first text event before the stream finishes', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({ start(value) { controller = value } })
    const seen: string[] = []
    const onFirst = vi.fn()
    const consuming = consumeAtlasSse(body, event => {
      if (event.event === 'text' && typeof event.text === 'string') {
        seen.push(event.text)
        if (seen.length === 1) onFirst()
      }
    })

    const encoder = new TextEncoder()
    controller.enqueue(encoder.encode('data: {"event":"text","text":"Hej "}\n\n'))
    await Promise.resolve(); await Promise.resolve()
    expect(onFirst).toHaveBeenCalledTimes(1)

    controller.enqueue(encoder.encode('data: {"event":"text","text":"världen"}\n\n'))
    controller.close()
    await consuming
    expect(seen.join('')).toBe('Hej världen')
  })

  it('handles frames split across transport chunks', async () => {
    const encoder = new TextEncoder()
    const chunks = ['data: {"event":"te', 'xt","text":"delad"}\n\n']
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)))
        controller.close()
      },
    })
    const seen: unknown[] = []
    await consumeAtlasSse(body, event => seen.push(event.text))
    expect(seen).toEqual(['delad'])
  })
})
