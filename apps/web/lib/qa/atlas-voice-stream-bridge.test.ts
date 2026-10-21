import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const s = vi.hoisted(() => ({ open: vi.fn(), send: vi.fn(), finish: vi.fn(), abort: vi.fn() }))
vi.mock('@/lib/media/elevenlabs-realtime', () => ({ openAtlasSwedishRealtime: (...args: unknown[]) => s.open(...args) }))
const bridge = () => import('@/lib/atlas/voice-pilot/stream-bridge').catch(() => null)
import { encodeVoicePcm } from '@/lib/atlas/voice-pilot/stream-protocol'
class Socket extends EventEmitter {
  readyState = 1; bufferedAmount = 0; sent: any[] = []; codes: number[] = []
  send(raw: string, _options?: unknown, callback?: (error?: Error) => void) { this.sent.push(JSON.parse(raw)); callback?.() }
  close(code: number) { this.codes.push(code); this.readyState = 3; this.emit('close', code) }
  terminate() { this.readyState = 3; this.emit('close', 1006) }
  input(raw: Uint8Array | string) { this.emit('message', Buffer.from(raw), typeof raw !== 'string') }
}
const ctx = { project: { projectId: 'project-test' }, operation: 'bridge-test',
  execution: { context: 'OPERATOR_INTERACTIVE' as const, scope: { kind: 'GLOBAL_ONLY' as const } } }
let socket: Socket
const pcm = (seq = 0) => encodeVoicePcm(seq, new Uint8Array(6400))
const finish = (lastSeq = 0) => JSON.stringify({ type: 'finish', lastSeq, reason: 'pause' })
async function serve(signal = new AbortController().signal) {
  const value = await bridge(); if (!value) throw new Error('bridge_missing')
  return value.serveAtlasVoiceStream(socket as any, ctx, signal)
}
beforeEach(() => {
  vi.clearAllMocks(); socket = new Socket()
  s.open.mockResolvedValue({ send: s.send, finish: s.finish, abort: s.abort }); s.finish.mockResolvedValue('Hej')
})
afterEach(() => { socket.terminate(); vi.useRealTimers() })
async function ready() { const done = serve(); await vi.waitFor(() => expect(socket.sent[0]).toEqual({ type: 'ready' })); return { done } }
it('provides the bridge', async () => { expect((await bridge())?.serveAtlasVoiceStream).toBeTypeOf('function') })
it('forwards each accepted frame once and emits exactly one whole final', async () => {
  const { done } = await ready(); socket.input(pcm()); socket.input(finish()); await done
  expect(s.send).toHaveBeenCalledTimes(1); expect(s.send.mock.calls[0][0]).toHaveLength(6400)
  expect(s.finish).toHaveBeenCalledWith('pause')
  expect(socket.sent).toEqual([{ type: 'ready' }, { type: 'final', text: 'Hej', reason: 'pause' }]); expect(socket.codes).toEqual([1000])
})
it.each(['gap', 'duplicate', 'wrong_last', 'oversize_control', 'override', 'odd_pcm'])('rejects %s without any final or further audio', async mode => {
  const { done } = await ready()
  if (mode === 'gap') socket.input(pcm(1))
  else if (mode === 'odd_pcm') socket.input(new Uint8Array(7))
  else if (mode === 'oversize_control') socket.input('x'.repeat(513))
  else if (mode === 'override') socket.input(JSON.stringify({ type: 'cancel', model: 'evil' }))
  else { socket.input(pcm()); socket.input(mode === 'duplicate' ? pcm() : finish(1)) }
  await done
  expect(socket.sent.some(x => x.type === 'final')).toBe(false)
  expect(socket.sent.at(-1)).toEqual({ type: 'failed', code: 'invalid_audio' })
  expect(s.finish).not.toHaveBeenCalled(); expect(s.abort).toHaveBeenCalledTimes(1)
})
it('suppresses a late final after cancellation and supports another independent turn', async () => {
  let resolve!: (text: string) => void
  s.finish.mockReturnValue(new Promise<string>(r => { resolve = r }))
  const { done } = await ready(); socket.input(pcm()); socket.input(finish()); socket.input('{"type":"cancel"}')
  await done; resolve('late private transcript'); await Promise.resolve()
  expect(socket.sent.some(x => x.type === 'final')).toBe(false); expect(s.abort).toHaveBeenCalledTimes(1)
  socket = new Socket(); s.finish.mockResolvedValue('andra')
  const next = await ready(); socket.input(pcm()); socket.input(finish()); await next.done
  expect(socket.sent.at(-1)).toEqual({ type: 'final', text: 'andra', reason: 'pause' })
})
it('aborts a late provider startup after the client disconnects', async () => {
  let resolve!: (turn: any) => void; s.open.mockReturnValue(new Promise(r => { resolve = r }))
  const done = serve(); await vi.waitFor(() => expect(s.open).toHaveBeenCalledTimes(1))
  socket.terminate(); await done; resolve({ send: s.send, finish: s.finish, abort: s.abort }); await Promise.resolve(); await Promise.resolve()
  expect(s.abort).toHaveBeenCalledTimes(1); expect(socket.sent).toEqual([])
})
it('never sends provider error details or tokens to the browser', async () => {
  s.open.mockRejectedValue(new Error('SYNTHETIC_PRIVATE_KEY_AND_ERROR'))
  await serve()
  expect(socket.sent).toEqual([{ type: 'failed', code: 'unavailable' }])
})
it('bounds a peer that does not acknowledge the final close', async () => {
  vi.useFakeTimers()
  socket.close = (code: number) => { socket.codes.push(code); socket.readyState = 2 }
  const done = serve(); await vi.advanceTimersByTimeAsync(0)
  socket.input(pcm()); socket.input(finish()); await vi.advanceTimersByTimeAsync(250); await done
  expect(socket.readyState).toBe(3); expect(socket.codes).toEqual([1000]); expect(vi.getTimerCount()).toBe(0)
})
