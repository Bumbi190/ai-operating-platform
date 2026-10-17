import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { afterEach, expect, it, vi } from 'vitest'
afterEach(() => vi.useRealTimers())
it.each(['good', 'echo_invalid', 'ignore_invalid'] as const)('browser verifier validates payload rejection: %s', async mode => {
  vi.useFakeTimers()
  const button = { disabled: false, onclick: null as null | (() => void) }, status = { textContent: '' }
  class Socket {
    readyState = 0
    binaryType = ''
    onopen?: () => void
    onmessage?: (event: { data: ArrayBuffer }) => void
    onclose?: () => void
    onerror?: () => void
    timer: ReturnType<typeof setTimeout>
    constructor(_url: URL) {
      this.timer = setTimeout(() => this.close(), 5000)
      setTimeout(() => { if (this.readyState !== 3) { this.readyState = 1; this.onopen?.() } }, 0)
    }
    send(value: Uint8Array) {
      const bytes = new Uint8Array(value)
      if (bytes.length === 4 || mode === 'echo_invalid') setTimeout(() => this.onmessage?.({ data: bytes.buffer }), 0)
      else if (mode === 'good') setTimeout(() => this.close(), 0)
    }
    close() { if (this.readyState === 3) return; this.readyState = 3; clearTimeout(this.timer); this.onclose?.() }
  }
  const html = readFileSync(resolve(process.cwd(), 'public/atlas-voice-connection-probe.html'), 'utf8')
  const code = html.match(/<script>([\s\S]*?)<\/script>/)![1]
  runInNewContext(code, {
    document: { getElementById: (id: string) => id === 'test' ? button : status },
    location: { href: 'https://preview.test/atlas-voice-connection-probe.html', protocol: 'https:' },
    URL, WebSocket: Socket, Uint8Array, ArrayBuffer,
    setTimeout, clearTimeout, performance: { now: () => Date.now() },
  })
  button.onclick?.()
  await vi.advanceTimersByTimeAsync(15000)
  expect(button.disabled).toBe(false)
  if (mode === 'good') expect(status.textContent).toContain('Anslutningen fungerar.')
  else expect(status.textContent).toContain('kunde inte verifieras')
})
