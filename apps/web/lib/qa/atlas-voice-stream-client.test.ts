import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { decodeVoicePcm } from '@/lib/atlas/voice-pilot/stream-protocol'
class Socket {
  static all: Socket[] = []
  readyState = 0; bufferedAmount = 0; binaryType = ''
  onopen: (() => void) | null = null; onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null; onclose: (() => void) | null = null
  sent: (string | Uint8Array)[] = []; close = vi.fn(() => { this.readyState = 3 })
  constructor(public url: URL | string) { Socket.all.push(this) }
  send(raw: string | Uint8Array) { this.sent.push(typeof raw === 'string' ? raw : new Uint8Array(raw)) }
  open() { this.readyState = 1; this.onopen?.() }
  event(data: unknown) { this.onmessage?.({ data: typeof data === 'object' ? JSON.stringify(data) : data }) }
}
const moduleUnderTest = () => import('@/lib/atlas/voice-pilot/stream-client').catch(() => null)
let begin: ((signal: AbortSignal) => import('@/lib/atlas/voice-pilot/stream-protocol').RealtimeTurn) | undefined
let turn: ReturnType<NonNullable<typeof begin>> | undefined
const ws = () => Socket.all[0]
const pcm = (length = 6400) => new Uint8Array(length).map((_, i) => i % 251)
const start = (signal = new AbortController().signal) => {
  if (!begin) throw new Error('stream_client_missing')
  return turn = begin(signal)
}
const ready = () => { ws().open(); ws().event({ type: 'ready' }) }
beforeEach(async () => {
  Socket.all = []; turn = undefined
  vi.stubGlobal('WebSocket', Socket); vi.stubGlobal('location', { href: 'https://preview.test/atlas/rosttest?x=1', protocol: 'https:' })
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('no_fallback') }))
  begin = (await moduleUnderTest())?.beginVoiceStream
})
afterEach(() => { turn?.abort(); vi.useRealTimers(); vi.unstubAllGlobals() })
it('provides the browser-only stream client', () => { expect(begin).toBeTypeOf('function') })
it('uses only a same-origin cookie-authenticated URL without tokens or query data', () => {
  start(); expect(new URL(ws().url).href).toBe('wss://preview.test/api/atlas/voice-pilot/stream')
})
it('buffers2s then preserves every sample exactly once with monotonic sequences', async () => {
  const current = start(), input = Array.from({ length: 10 }, () => pcm())
  input.forEach(data => current.send(data)); expect(ws().sent).toHaveLength(0)
  ready(); expect(ws().sent).toHaveLength(10)
  expect(ws().sent.map(raw => decodeVoicePcm(raw as Uint8Array).seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  ws().sent.forEach((raw, i) => expect(decodeVoicePcm(raw as Uint8Array).pcm).toEqual(input[i]))
  expect(fetch).not.toHaveBeenCalled()
})
it('aggregates short frames and sends a short tail before exactly one finish after ready', async () => {
  const current = start(); current.send(pcm(100)); current.send(pcm(6400))
  const final = current.finish('manual'); expect(current.finish('manual')).toBe(final)
  expect(ws().sent).toHaveLength(0); ready()
  const frames = ws().sent.filter(x => typeof x !== 'string') as Uint8Array[]
  expect(frames.map(raw => decodeVoicePcm(raw).pcm.length)).toEqual([6400, 100])
  expect(JSON.parse(ws().sent.at(-1) as string)).toEqual({ type: 'finish', lastSeq: 1, reason: 'manual' })
  ws().event({ type: 'final', text: 'Hej', reason: 'manual' }); await expect(final).resolves.toBe('Hej')
  expect(ws().close).toHaveBeenCalledTimes(1)
})
it('refuses preflight overflow rather than dropping input or replaying it through batch', async () => {
  const current = start(); for (let i = 0; i < 10; i++) current.send(pcm())
  expect(() => current.send(pcm(2))).toThrow()
  await expect(current.finish('pause')).rejects.toBeDefined()
  expect(ws().sent).toHaveLength(0); expect(fetch).not.toHaveBeenCalled(); expect(Socket.all).toHaveLength(1)
})
it('bounds websocket backpressure before accepting more input', async () => {
  const current = start(); ready(); ws().bufferedAmount = 64040
  expect(() => current.send(pcm())).toThrow()
  await expect(current.finish('pause')).rejects.toBeDefined(); expect(ws().sent).toHaveLength(0)
})
it('handles a previously aborted turn without creating a socket', async () => {
  const controller = new AbortController(); controller.abort(); const current = start(controller.signal)
  await expect(current.finish('pause')).rejects.toBeDefined(); expect(Socket.all).toHaveLength(0)
})
it('suppresses retained old open/final callbacks after abort', async () => {
  const controller = new AbortController(), current = start(controller.signal)
  current.send(pcm()); const final = current.finish('pause')
  const open = ws().onopen, message = ws().onmessage
  controller.abort(); open?.(); message?.({ data: JSON.stringify({ type: 'ready' }) })
  message?.({ data: JSON.stringify({ type: 'final', text: 'late private text', reason: 'pause' }) })
  await expect(final).rejects.toBeDefined(); expect(ws().sent).toEqual([]); expect(Socket.all).toHaveLength(1)
})
it.each(['partial', 'large_final', 'wrong_reason', 'early_final', 'duplicate_ready', 'socket_error', 'socket_close'])('fails closed on %s with no fallback', async mode => {
  const current = start(); ready(); current.send(pcm())
  const final = mode === 'early_final' ? null : current.finish('pause')
  if (mode === 'partial') ws().event({ type: 'partial', text: 'not a question' })
  if (mode === 'large_final') ws().event({ type: 'final', text: 'x'.repeat(12001), reason: 'pause' })
  if (mode === 'wrong_reason') ws().event({ type: 'final', text: 'Hej', reason: 'limit' })
  if (mode === 'early_final') ws().event({ type: 'final', text: 'Hej', reason: 'pause' })
  if (mode === 'duplicate_ready') ws().event({ type: 'ready' })
  if (mode === 'socket_error') ws().onerror?.()
  if (mode === 'socket_close') ws().onclose?.()
  await expect(final ?? current.finish('pause')).rejects.toBeDefined()
  expect(fetch).not.toHaveBeenCalled(); expect(Socket.all).toHaveLength(1)
})
it.each(['ready', 'final', 'absolute'])('cleans up the %s timeout', async mode => {
  vi.useFakeTimers(); const current = start()
  let final: Promise<string> | null = null
  if (mode !== 'ready') ready()
  if (mode === 'final') { current.send(pcm()); final = current.finish('pause') }
  const rejection = final ? expect(final).rejects.toBeDefined() : null
  await vi.advanceTimersByTimeAsync(mode === 'ready' ? 12000 : mode === 'final' ? 20000 : 120000)
  if (rejection) await rejection
  else await expect(current.finish('pause')).rejects.toBeDefined()
  expect(vi.getTimerCount()).toBe(0); expect(ws().close).toHaveBeenCalledTimes(1)
})
