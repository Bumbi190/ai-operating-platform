export interface AtlasSseEvent {
  event?: string
  [key: string]: unknown
}

export async function consumeAtlasSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AtlasSseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      if (signal?.aborted) break
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const line = frame.split('\n').find(item => item.startsWith('data: '))
        if (!line) continue
        try { onEvent(JSON.parse(line.slice(6)) as AtlasSseEvent) } catch { /* malformed frame */ }
      }
    }
  } finally {
    if (signal?.aborted) await reader.cancel().catch(() => undefined)
  }
}
