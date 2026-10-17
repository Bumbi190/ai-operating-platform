import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { decodeVoicePcm } from '@/lib/atlas/voice-pilot/stream-protocol'
let source = ''
try { source = readFileSync(resolve('public/atlas-voice-provider-probe.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)![1] } catch {}
let mode = '', current = '', requests: string[], closed: (() => void)[], elements: Record<string, any>, store: Map<string, string>
class Socket {
  static all: Socket[] = []
  readyState = 0; bufferedAmount = 0
  onopen: any; onmessage: any; onerror: any; onclose: any
  sent: (Uint8Array | string)[] = []; url: string
  constructor(url: URL) {
    this.url = String(url); Socket.all.push(this)
    if (mode === 'stalled_ready') return
    queueMicrotask(() => { this.readyState = 1; this.onopen?.(); this.event({ type: 'ready' }) })
  }
  event(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }) }
  send(value: Uint8Array | string) {
    this.sent.push(typeof value === 'string' ? value : new Uint8Array(value))
    if (mode === 'pressure') this.bufferedAmount = 64000
    if (typeof value === 'string' && mode !== 'stalled_final') queueMicrotask(() => this.event({
      type: 'final', text: mode === 'bad_text' ? 'SYNTHETIC_PRIVATE_TRANSCRIPT' : 'Atlas Omnira The Prompt', reason: 'manual',
    }))
  }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }) }
}
function load() {
  if (!source) throw new Error('provider_probe_missing')
  vm.runInNewContext(source, {
    document: { getElementById: (id: string) => elements[id] ??= { disabled: false, textContent: '', onclick: undefined } },
    location: { href: 'https://preview.test/atlas-voice-provider-probe.html?SYNTHETIC_PRIVATE_QUERY', protocol: 'https:' },
    window: { addEventListener: (event: string, cb: () => void) => { if (event === 'pagehide') closed.push(cb) } },
    sessionStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) },
    fetch: async (url: string) => {
      requests.push(url)
      const name = url.split('/').pop()!
      const data = readFileSync(resolve('public/atlas-voice-probe', name))
      return { ok: true, arrayBuffer: async () => mode === 'bad_fixture' ? new ArrayBuffer(2) : new Uint8Array(data).buffer }
    },
    WebSocket: Socket, URL, Uint8Array, DataView, ArrayBuffer, JSON, Math, Error, Promise, Number,
    setTimeout, clearTimeout, performance, queueMicrotask,
  })
}
beforeEach(() => { vi.useFakeTimers(); mode = ''; current = ''; requests = []; closed = []; elements = {}; store = new Map(); Socket.all = [] })
afterEach(() => { closed.forEach(fn => fn()); vi.useRealTimers() })
const frames = (socket: Socket) => socket.sent.filter(x => typeof x !== 'string') as Uint8Array[]
it('provides the self-contained preview probe', () => { expect(source).not.toBe('') })
it('opens nothing and sends no audio until the user starts the probe', () => {
  load(); expect(requests).toEqual([]); expect(Socket.all).toHaveLength(0)
})
it('bounds the two remaining real-time paced sessions to45.6s and one final each without chat or mic', async () => {
  load(); const done = elements.test.onclick()
  await vi.advanceTimersByTimeAsync(100000); await done
  expect(Socket.all).toHaveLength(2)
  expect(Socket.all.map(s => frames(s).reduce((n, raw) => n + decodeVoicePcm(raw).pcm.length, 0))).toEqual([102400, 1356800])
  for (const socket of Socket.all) {
    frames(socket).forEach((raw, seq) => expect(decodeVoicePcm(raw).seq).toBe(seq))
    expect(socket.sent.filter(x => typeof x === 'string')).toHaveLength(1)
    expect(JSON.parse(socket.sent.at(-1) as string)).toEqual({ type: 'finish', lastSeq: frames(socket).length - 1, reason: 'manual' })
    expect(socket.url).toBe('wss://preview.test/api/atlas/voice-pilot/stream')
    expect(socket.readyState).toBe(3)
  }
  expect(requests.sort()).toEqual(['/atlas-voice-probe/atlas.pcm', '/atlas-voice-probe/omnira.pcm', '/atlas-voice-probe/prompt.pcm'])
  expect(elements.status.textContent).toContain('lyckades')
  expect(elements.status.textContent).toContain('45,6')
  expect(vi.getTimerCount()).toBe(0)
})
it.each(['stalled_ready', 'stalled_final', 'bad_text', 'pressure', 'bad_fixture'])('stops on %s without retry or later probe dispatch', async value => {
  mode = value; load(); const done = elements.test.onclick()
  await vi.advanceTimersByTimeAsync(100000); await done
  expect(Socket.all.length).toBeLessThanOrEqual(1)
  expect(elements.status.textContent).toContain('kunde inte')
  expect(elements.status.textContent).not.toContain('SYNTHETIC_PRIVATE')
  expect(elements.test.disabled).toBe(true); expect(vi.getTimerCount()).toBe(0)
})
it('pagehide closes an active socket and a retained final cannot overwrite cancellation', async () => {
  mode = 'stalled_final'; load(); const done = elements.test.onclick()
  await vi.advanceTimersByTimeAsync(3500)
  const callback = Socket.all[0].onmessage
  closed.forEach(fn => fn()); await done
  const text = elements.status.textContent
  callback?.({ data: JSON.stringify({ type: 'final', text: 'Atlas Omnira The Prompt', reason: 'manual' }) })
  expect(elements.status.textContent).toBe(text)
  expect(Socket.all).toHaveLength(1); expect(Socket.all[0].readyState).toBe(3); expect(vi.getTimerCount()).toBe(0)
})
it('does not repeat paid attempts after a second click or reload in the same browser visit', async () => {
  mode = 'stalled_ready'; load(); const done = elements.test.onclick()
  await vi.advanceTimersByTimeAsync(12001); await done
  await elements.test.onclick(); expect(Socket.all).toHaveLength(1)
  elements = {}; load(); expect(elements.test.disabled).toBe(true)
  await elements.test.onclick(); expect(Socket.all).toHaveLength(1)
})
