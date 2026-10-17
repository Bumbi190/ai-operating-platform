import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const s = vi.hoisted(() => ({
  auth: { ok: true, userId: 'operator' } as any, member: { role: 'owner', revoked_at: null } as any,
  memberError: false, owns: false, stopError: false, stopHang: false, release: undefined as undefined | (() => void),
  open: vi.fn(), send: vi.fn(), abort: vi.fn(), rpc: vi.fn(), finish: vi.fn(),
}))
vi.mock('@/lib/auth/platform-operator', () => ({ resolvePlatformOperator: async () => s.auth }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  from: () => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => ({ data: s.member, error: s.memberError ? {} : null }),
    limit: async () => ({ data: s.owns ? [{ id: 'owned' }] : [], error: null }),
  }) }) }),
}) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: s.rpc }) }))
vi.mock('@/lib/cost/governed-spend', () => ({ PLATFORM_COMPAT_PROJECT: { projectId: 'billing-project' } }))
vi.mock('@/lib/media/elevenlabs-realtime', () => ({ openAtlasSwedishRealtime: (...args: unknown[]) => s.open(...args) }))
import { serveAtlasVoicePilot } from '@/lib/atlas/voice-pilot/stream-bridge'
import { resolveExecutionStop } from '@/lib/governance/execution-stop'
import { encodeVoicePcm } from '@/lib/atlas/voice-pilot/stream-protocol'
class Socket extends EventEmitter {
  readyState = 1; bufferedAmount = 0; sent: any[] = []
  send(raw: string, _options: unknown, callback?: () => void) { this.sent.push(JSON.parse(raw)); callback?.() }
  close() { this.readyState = 3; this.emit('close') }
  terminate() { this.close() }
  input() { this.emit('message', Buffer.from(encodeVoicePcm(0, new Uint8Array(6400))), true) }
}
let socket: Socket, controller: AbortController
beforeEach(() => {
  vi.useFakeTimers(); vi.stubEnv('VERCEL_ENV', 'preview'); vi.clearAllMocks()
  s.auth = { ok: true, userId: 'operator' }; s.member = { role: 'owner', revoked_at: null }
  s.memberError = s.owns = s.stopError = s.stopHang = false; s.release = undefined
  s.rpc.mockImplementation(async () => {
    if (s.stopHang) await new Promise<void>(resolve => { s.release = resolve })
    return { data: s.stopError ? null : [{ global_paused: true, project_found: false }], error: s.stopError ? { message: 'synthetic unavailable' } : null }
  })
  s.finish.mockResolvedValue('Hej'); s.open.mockResolvedValue({ send: s.send, finish: s.finish, abort: s.abort })
  socket = new Socket(); controller = new AbortController()
})
afterEach(() => { controller.abort(); socket.close(); vi.useRealTimers(); vi.unstubAllEnvs() })
const start = () => serveAtlasVoicePilot(socket as any, controller.signal, 'operator')
it('refuses unreadable initial authority even though interactive assistance itself remains allowed', async () => {
  s.stopError = true
  expect(await resolveExecutionStop({ rpc: s.rpc } as any, { context: 'OPERATOR_INTERACTIVE' })).toMatchObject({ allowed: true, resolution: 'UNRESOLVED' })
  await start()
  expect(s.open).not.toHaveBeenCalled(); expect(socket.readyState).toBe(3)
})
it('preserves interactive voice during a known global automation pause', async () => {
  const done = start(); await vi.advanceTimersByTimeAsync(0)
  expect(s.open).toHaveBeenCalledTimes(1); expect(socket.sent).toEqual([{ type: 'ready' }])
  controller.abort(); await done; expect(vi.getTimerCount()).toBe(0)
})
it('closes both transports on a later unresolved real stop-state result', async () => {
  const done = start(); await vi.advanceTimersByTimeAsync(0); socket.input()
  expect(s.send).toHaveBeenCalledTimes(1)
  s.stopError = true; await vi.advanceTimersByTimeAsync(2000); await done
  socket.input(); expect(s.send).toHaveBeenCalledTimes(1); expect(s.abort).toHaveBeenCalledTimes(1)
  expect(socket.readyState).toBe(3); expect(vi.getTimerCount()).toBe(0)
})
it.each(['identity', 'operator', 'revoked', 'collaborator', 'unavailable'])('closes a live connection when access changes: %s', async mode => {
  const done = start(); await vi.advanceTimersByTimeAsync(0)
  if (mode === 'identity') s.auth = { ok: true, userId: 'different-user' }
  if (mode === 'operator') s.auth = { ok: false, reason: 'not_platform_operator' }
  if (mode === 'revoked') { s.member = { role: 'owner', revoked_at: 'now' }; s.owns = true }
  if (mode === 'collaborator') { s.member = { role: 'collaborator', revoked_at: null }; s.owns = true }
  if (mode === 'unavailable') { s.memberError = true; s.owns = true }
  await vi.advanceTimersByTimeAsync(2000); await done
  expect(s.abort).toHaveBeenCalledTimes(1); expect(socket.readyState).toBe(3)
  expect(s.open).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0)
})
it('bounds an unreadable pending check and late recovery cannot reopen the socket', async () => {
  const done = start(); await vi.advanceTimersByTimeAsync(0); s.stopHang = true
  await vi.advanceTimersByTimeAsync(7000); await done
  expect(socket.readyState).toBe(3); expect(s.abort).toHaveBeenCalledTimes(1)
  s.release?.(); await vi.advanceTimersByTimeAsync(10000)
  expect(s.open).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0)
})
it('cleans polling on client close while initial authority is loading without dispatch', async () => {
  s.stopHang = true; const done = start(); await vi.advanceTimersByTimeAsync(0)
  socket.close(); await done; s.release?.(); await vi.advanceTimersByTimeAsync(10000)
  expect(s.open).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
})

it('requires the server-bound identity and never opens a provider for an empty identity', async () => {
  await serveAtlasVoicePilot(socket as any, controller.signal, '')
  expect(s.open).not.toHaveBeenCalled(); expect(socket.readyState).toBe(3); expect(vi.getTimerCount()).toBe(0)
})
it('preserves verified legacy ownership when the membership record is absent', async () => {
  const done = start(); await vi.advanceTimersByTimeAsync(0); s.member = null; s.owns = true
  await vi.advanceTimersByTimeAsync(2000)
  expect(socket.readyState).toBe(1); expect(s.open).toHaveBeenCalledTimes(1)
  controller.abort(); await done; expect(vi.getTimerCount()).toBe(0)
})
