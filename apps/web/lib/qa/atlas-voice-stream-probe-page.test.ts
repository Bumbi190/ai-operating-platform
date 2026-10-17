import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { afterEach, expect, it, vi } from 'vitest'
afterEach(() => vi.useRealTimers())
it.each(['good', 'echo_invalid', 'ignore_invalid', 'no_echo', 'early_close', 'socket_error', 'reject_error', 'unclean_close'] as const)('browser verifier validates payload rejection: %s', async mode => {
  vi.useFakeTimers()
  const button = { disabled: false, onclick: null as null | (() => void) }, status = { textContent: '' }
  class Socket {
    readyState = 0
    binaryType = ''
    onopen?: () => void
    onmessage?: (event: { data: ArrayBuffer }) => void
    onclose?: (event: { code: number }) => void
    onerror?: () => void
    timer: ReturnType<typeof setTimeout>
    constructor(_url: URL) {
      this.timer = setTimeout(() => this.close(), 5000)
      setTimeout(() => { if (this.readyState !== 3) { this.readyState = 1; this.onopen?.() } }, 0)
    }
    send(value: Uint8Array) {
      if (mode === 'early_close') { setTimeout(() => this.close(), 100); return }
      if (mode === 'socket_error') { setTimeout(() => { this.onerror?.(); this.close() }, 100); return }
      if (mode === 'no_echo') return
      const bytes = new Uint8Array(value)
      if (bytes.length === 4 || mode === 'echo_invalid') setTimeout(() => this.onmessage?.({ data: bytes.buffer }), 0)
      else if (mode === 'reject_error') setTimeout(() => { this.onerror?.(); this.close() }, 0)
      else if (mode === 'good') setTimeout(() => this.close(), 0)
    }
    close() { if (this.readyState === 3) return; this.readyState = 3; clearTimeout(this.timer); this.onclose?.({ code: mode === 'unclean_close' ? 1006 : 1000 }) }
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
  if (mode === 'good' || mode === 'reject_error') expect(status.textContent).toContain('Anslutningen fungerar.')
  else {
    expect(status.textContent).toContain('kunde inte verifieras')
    const expected = mode === 'echo_invalid' ? 'oversize/unexpected_frame' : mode === 'ignore_invalid' ? 'oversize/rejection_timeout' : mode === 'no_echo' ? 'echo/no_echo' : mode === 'early_close' ? 'echo/deadline' : mode === 'unclean_close' ? 'echo/unclean_close' : 'echo/socket_error'
    expect(status.textContent).toContain('Kod: ' + expected)
    expect(status.textContent).not.toContain('Kontrollera att du')
  }
})
